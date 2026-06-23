# Frontend UI API Integration Guide (Actualizado para el Espectáculo 2D)

Este documento detalla la estructura y payloads de los endpoints del **Read-Layer** de Antigravity (Capa Pública de Lectura) para que el frontend (Claude) pueda consumir los datos de forma predecible al construir cada pantalla, **incluyendo ahora el soporte para gráficas, historial de ratings y Match Center 2D**.

---

## BLOQUE Y pre-Z1 · Escalado, mundo público e inmersión
Publicado por IT/backend el 12 jun 2026. Contratos aditivos para que Antigravity pueda construir landing/mapa/fichas/Match Center/onboarding/taberna sin inventar estructura.

### Y1 · Campos de escalado
`Competition` añade:
- `humanStatus`: `"OPEN" | "WAITLIST" | "CLOSED"`.
- `defaultSimulationTier`: `"A" | "B" | "C"`.
- `activityScore`, `humanManagersCount`, `lastHumanLoginAt`, `processingShard`.

`Match` añade:
- `simulationTier`: `"A" | "B" | "C"`.
- `priorityScore`.
- `hasTimeline`, `hasAdvancedStats`.

El tick recalcula solo la competición/jornada que va a simular. Tier A = Match Center completo; Tier B = timeline/resumen jugable; Tier C = resultado compacto/regenerable.

### X1 · Escalado técnico backend (14 jun, Codex)
Cambios aditivos de producción:
- Cola Redis por tipo de job: `world-tick`, `simulation`, `economy`, `maintenance`. Jobs legacy sin `type` se tratan como `world-tick`.
- `POST /api/tick/enqueue` acepta body opcional `{ "slot": "T1", "type": "world-tick" }`.
- `GET /api/tick/status` mantiene `{ queued, processing, dlq, last }` y añade `{ byType, legacy }`.
- Sharding de worker por env: `TICK_PROCESSING_SHARD=spain:1` o `TICK_PROCESSING_SHARDS=spain:1,france:*`. Sin env, el worker procesa todo.
- Persistencia por tier: A guarda timeline+duelos+stats avanzadas; B guarda timeline jugable sin duelos/cadenas pesadas; C guarda resultado compacto con `tierPersistence.seedRegenerable=true`, `seed`, `compact=true`, `pruned=true`.
- N1-3: `/ws/system?ticket=...` emite `tick:completed` al cerrar un turno con contadores ligeros e invalidaciones sugeridas para hidratar UI sin recarga completa.
- N2-2: mutaciones de mercado/subastas/negociaciones pueden responder `429` si se supera el token bucket de ruta. Lecturas `GET` no tienen penalización adicional; `POST /api/market/evaluate` se trata como previsualización no mutante.
- N2-3: `GET /api/matches`, `/mine`, `/matches/:id` y `/matches/public/:id` añaden `audit` con `seed`, `seedHash`, algoritmo y endpoints de verificación. `GET /api/matches/:id/audit` devuelve la prueba compacta `persisted` vs `resimulated`.

Evento `tick:completed`:
```json
{
  "type": "tick:completed",
  "channel": "system:world",
  "payload": {
    "turn": 43,
    "inGameDate": "2026-08-02T00:00:00.000Z",
    "seasonId": 2,
    "matchesSimulated": 120,
    "matchIds": [101, 102],
    "matchdaysSimulated": [9],
    "competitionIncomesSettled": 4,
    "processingShards": ["spain:1"],
    "invalidates": ["dashboard", "matches", "club", "market", "news", "world", "notifications"],
    "steps": ["calendario:2026-08-02", "partidos:120", "turno:43"]
  },
  "ts": "..."
}
```

### N1-2 · Fase shard-only + contrato de consolidación (16 jun, Claude · base para workers paralelos)
La simulación de partidos de un turno **es paralelizable por shard** y está extraída en dos piezas en `game.service.ts`:

- **`simulateShardPhase({ seasonId, inGameDay, shardWhere, shardKeys, settings })` → `ShardSimulationResult`** — simula la jornada pendiente de cada competición del shard y persiste resultados. Muta **solo** filas locales al shard (matches/standings/matchdays/brackets/finance-snapshots de esas competiciones). **NO** avanza `week`/`seasonWeek` ni finaliza la temporada. Determinista por semilla `matchId × 1337` (independiente del orden). `ShardSimulationResult = { shardKeys, matchIds, matchdaysSimulated, competitionIncomesSettled, competitionsProcessed }`.
- **`consolidateShardResults(state, newWeek, results[], processingShards)` → `AdvanceWeekResult`** — fusiona uno o varios `ShardSimulationResult` y ejecuta lo **global, una sola vez por turno**: avance de `week`/`seasonWeek` (solo si hubo jornada) y `finalizeSeasonIfComplete` (premios, coeficientes, carrera NPC; idempotente). Debe ejecutarla un **único orquestador** (Node), nunca cada worker.

**Garantía de disyunción:** los shards (`processingShard` = `continente·país·tier`) tienen competiciones, clubes, standings, brackets y finanzas **disjuntos** entre continentes → dos shards no se escriben mutuamente. Por eso el resultado es idéntico procese quien procese cada shard, siempre que la **consolidación global** sea única.

**Contrato para workers paralelos (Codex):** cada worker llama `simulateShardPhase` con SU `processingShardWhere([shard])` (puede correr en proceso/cola/contenedor aparte), devuelve su `ShardSimulationResult`, y un único orquestador hace `consolidateShardResults([...todos])` + el resto de pasos globales de `processTick` (finanzas, entrenos, mercado, lesiones, caché…) **una sola vez**.

**Estado actual:** `processTick` ya soporta el camino paralelo **dentro de un proceso** detrás del flag `TICK_PARALLEL_SHARDS=1` (Promise.all de `simulateShardPhase` por shard distinto → un `consolidateShardResults`). **Por defecto OFF** (secuencial vía `advanceWeek`, comportamiento y determinismo idénticos al anterior). Los **workers multi-proceso/continente reales quedan para Codex** sobre `tick.queue.ts` usando este contrato; activar solo tras validar idempotencia del consolidador en staging.

#### `GET /api/matches/:id/timeline-from-seed`
Re-simula audit-only por semilla para reconstruir el replay de un partido jugado Tier C o podado. No muta marcador, standings, XP, finanzas ni eventos persistidos. Respeta E15: si el usuario implicado no ha visto su resultado, devuelve 403.

**Respuesta:**
```json
{
  "ok": true,
  "matchId": 88,
  "source": "seed-regenerated",
  "seed": 117656,
  "simulationTier": "C",
  "reproducesPersistedScore": true,
  "persisted": { "homeGoals": 2, "awayGoals": 1, "seed": 117656 },
  "resimulated": { "homeGoals": 2, "awayGoals": 1, "motm": "Jugador" },
  "timeline": [],
  "replay": [],
  "timelineAvailable": true,
  "homeRatings": [],
  "awayRatings": [],
  "events": [],
  "analysis": {},
  "warning": null
}
```

Si `reproducesPersistedScore=false`, el frontend debe etiquetarlo como recreación no canónica (motor cambiado/calibración distinta).

#### `GET /api/matches/:id/audit`
Devuelve el compromiso criptográfico de semilla y, si el partido ya está jugado y no está oculto por E15, una re-simulación audit-only compacta. No muta marcador, standings, XP, finanzas ni eventos.

```json
{
  "ok": true,
  "matchId": 88,
  "status": "played",
  "audit": {
    "algorithm": "sha256",
    "seedFormula": "matchId * 1337",
    "seed": 117656,
    "canonicalSeed": 117656,
    "seedHash": "2b4f...",
    "hashInputTemplate": "manager-fdf:v1:match:<matchId>:seed:<seed>",
    "verifyEndpoint": "/api/matches/88/audit",
    "timelineFromSeedEndpoint": "/api/matches/88/timeline-from-seed",
    "verifiable": true,
    "resultHidden": false
  },
  "verification": {
    "mode": "audit",
    "persisted": { "status": "played", "homeGoals": 2, "awayGoals": 1, "seed": 117656 },
    "resimulated": { "homeGoals": 2, "awayGoals": 1, "motm": "Jugador" },
    "reproducesPersistedScore": true,
    "checkedAt": "2026-06-16T12:00:00.000Z",
    "timelineFromSeedEndpoint": "/api/matches/88/timeline-from-seed"
  }
}
```

Si el partido aún no se jugó, `verification=null` y el hash queda publicado como compromiso previo. Si E15 oculta el resultado al usuario implicado, devuelve `403` hasta marcarlo visto.

#### `GET /api/matches/:id/og-image` · N4-1 ✅ (tarjeta OpenGraph, PÚBLICO sin auth)
Tarjeta social compartible de cualquier partido. **No requiere token** (los crawlers de Discord/Twitter no lo llevan); registrada como plugin público separado bajo `/api/matches`. Determinista y re-simulable por semilla (`matchId × 1337`, misma fórmula que `/audit`).

- **Por defecto** → imagen **SVG** `1200×630` (`Content-Type: image/svg+xml`, `Cache-Control: public, max-age=300`, cabecera `X-Og-Match`). Sin dependencias de imagen (mismo patrón que el avatar procedural Q22). Muestra: competición, escudos (emoji del club o iniciales si el escudo es una URL), nombres, **marcador**, etiqueta de estado (`FINAL` / `PRÓXIMO PARTIDO` / `RESULTADO POR DESVELAR`), **MVP** (`⭐`), **minuto épico** (`⚡`, el último gol) y huella de semilla auditable (`seed#<hash12>`).
- **`?format=html`** → página HTML mínima con metadatos `og:image`/`og:title`/`og:description`/`twitter:card` apuntando a la imagen SVG y a `/matches/:id`, con redirección a la ficha del partido. Para compartir en plataformas que crawlean HTML.
- **E15-safe:** si el partido está jugado y algún humano implicado aún NO marcó su resultado como visto, se oculta el marcador (tarjeta "previa/por desvelar", marcador `VS`); misma regla que `/api/public/matches/featured`. Partidos programados → tarjeta de previa.
- **Errores:** `400` id inválido · `404` partido inexistente · `500` fallo de generación. Rate-limit 60 req/min/IP.
- **Front:** `matchesApi.tryOgImage(id)` (botón "Compartir" en `MatchPage`) ya consume el endpoint; si responde `ok` muestra "Tarjeta social generada", si no, copia la URL del partido. **Pendiente opcional (no bloqueante):** rasterizar a PNG para crawlers que no aceptan SVG como `og:image` (asset offline o lib en la imagen Docker → carril Codex/Z3).

### Y2 · Landing/mapa mundial sin login
Todas estas rutas son públicas bajo `/api/public` y respetan E15 en resultados destacados.

### X3 · NPC coaches virtuales (14 jun, Codex)
Los clubes sin mánager humano pueden exponer `npcCoach` en contratos públicos. Es determinista por club, no requiere migración y se puede persistir en una evolución posterior.

Campos:
- `id`: `"npc-<clubId>"`.
- `isNpc`: `true`.
- `name`, `nationality`, `avatarSeed`.
- `tacticalStyle.favoriteFormation`: formación fetiche del catálogo WT2.
- `tacticalStyle.tacticDefaults`: `construction/destruction/pressing/tempo/width/mentality/marking` que el tick usa en clubes NPC.
- `career`: etapa, meses en el cargo, clubes previos, ascensos estimados, riesgo de despido y próxima revisión.
- `pressLine`: frase breve lista para prensa/ficha.

Presente en:
- `GET /api/public/world/leagues/:id` → `table[].club.npcCoach` si el club no tiene mánager humano.
- `GET /api/public/world/clubs/available` → `clubs[].npcCoach`.
- `GET /api/public/world/clubs/:id` → `npcCoach` si no hay `manager`.

Pendiente X3 completo: persistir carrera real de NPC (fichan/despiden/ascienden) y enlazarlos en rankings/chat/prensa como entidad navegable.

#### `GET /api/public/world/map?continent=`
Contrato agregado para landing/mapa clicable. Respuesta lista para pintar sin login:
```json
{
  "season": { "id": 1, "name": "2026/2027", "seasonWeek": 12 },
  "projection": { "type": "mercator-lite", "center": { "lat": 20, "lng": 0 }, "zoom": 1 },
  "totals": { "countries": 18, "leagues": 50, "clubs": 1000, "humanManagers": 42, "freeClubs": 958 },
  "countries": [
    {
      "country": "España",
      "continent": "Europa",
      "coords": { "lat": 40.4, "lng": -3.7, "zoom": 5 },
      "status": "OPEN",
      "pulse": { "tone": "open", "label": "Mundo abierto", "summary": "Hay clubes disponibles para empezar partida." },
      "leagues": 3,
      "clubs": 60,
      "humanManagers": 7,
      "freeClubs": 53,
      "activityScore": 58,
      "featuredLeague": { "id": 1, "name": "Primera División", "tier": 1, "status": "OPEN" },
      "href": "/api/public/world/leagues?country=España"
    }
  ],
  "featuredLeagues": [
    {
      "id": 1,
      "name": "Primera División",
      "country": "España",
      "coords": { "lat": 40.4, "lng": -3.7, "zoom": 5 },
      "storyState": { "tone": "featured", "label": "Primera línea", "summary": "Escaparate principal del país." },
      "href": "/api/public/world/leagues/1"
    }
  ],
  "hotMatches": [],
  "availableClubs": [],
  "ticker": []
}
```
`countries[].coords` es determinista: si se añade un país nuevo y no está en tabla manual, cae cerca de su continente.

#### `GET /api/public/world/continents`
```json
{
  "season": { "id": 1, "name": "2026/2027", "seasonWeek": 12 },
  "continents": [
    {
      "continent": "Europa",
      "countries": 5,
      "leagues": 12,
      "clubs": 240,
      "humanManagers": 37,
      "freeClubs": 203,
      "activityScore": 42,
      "href": "/api/public/world/countries?continent=Europa"
    }
  ]
}
```

#### `GET /api/public/world/countries?continent=Europa`
Devuelve país, continente, ligas, clubes, mánagers humanos, clubes libres, `status`, `coords`, `pulse` y `href` a sus ligas.

#### `GET /api/public/world/leagues?continent=&country=&status=&take=&cursor=`
Lista paginada de ligas:
```json
{
  "leagues": [
    {
      "id": 1,
      "name": "Primera División",
      "shortName": "LaLiga",
      "country": "España",
      "continent": "Europa",
      "tier": 1,
      "status": "OPEN",
      "defaultSimulationTier": "B",
      "activityScore": 58,
      "clubsCount": 20,
      "humanManagers": 7,
      "freeClubs": 13,
      "coords": { "lat": 40.4, "lng": -3.7, "zoom": 5 },
      "storyState": { "tone": "featured", "label": "Primera línea", "summary": "Escaparate principal del país." },
      "href": "/api/public/world/leagues/1"
    }
  ],
  "pagination": { "take": 50, "cursor": null, "nextCursor": 1, "hasMore": false }
}
```

#### `GET /api/public/world/leagues/:id`
Devuelve `league`, `table`, `matches.recent`, `matches.upcoming` y `links.availableClubs`. Cada partido incluye:
```json
{
  "id": 105,
  "status": "played",
  "homeGoals": null,
  "awayGoals": null,
  "resultHidden": true,
  "matchCenter": { "simulationTier": "A", "priorityScore": 92, "hasTimeline": true, "hasAdvancedStats": true }
}
```

#### `GET /api/public/world/clubs/available?league=&country=&take=`
Clubes libres para onboarding/espectador, con datos visuales, liga y endpoint de elección.

#### `GET /api/public/world/clubs/:id`
Ficha pública premium de club: identidad, estadio, liga, mánager, estrellas, rivalidades, historia y finanzas públicas por bandas. No usar para economía privada de usuario.

### Y4/Y5 · Shell vivo, Día de Partido y layout global
#### `GET /api/dashboard/shell-context`
Autenticado. Fuente única para `AppLayout`, `Sidebar` y `TopBar`: modo visual global, Sala de Prensa, Taberna, badges vivos, ticker y próximo partido.
```json
{
  "visual": {
    "mode": "matchday",
    "matchdayMode": true,
    "labels": { "press": "Sala de Prensa", "chat": "Taberna", "notifications": "Sala de Prensa" },
    "skinHints": { "topBar": "matchday-glow", "sidebar": "alive-badges" }
  },
  "matchday": {
    "active": true,
    "phase": "pre_match",
    "home": true,
    "opponent": { "id": 2, "name": "Real Madrid", "shortName": "RMA", "badge": "..." },
    "match": {
      "id": 105,
      "status": "scheduled",
      "competition": { "id": 1, "name": "Primera División" },
      "matchCenter": { "simulationTier": "A", "priorityScore": 92, "hasTimeline": true, "hasAdvancedStats": true },
      "route": "/matches/105",
      "previewRoute": "/matches/105?tab=preview"
    },
    "derby": { "active": true, "name": "El Clásico", "intensity": 95 },
    "importance": { "score": 96, "label": "Final emocional", "reasons": ["El Clásico (95/100)"] },
    "venue": { "stadiumName": "Estadio FDF", "capacity": 50000, "weatherLabel": "lluvia, 12º" },
    "broadcastPhrase": "El Clásico: FCB y RMA llegan con la ciudad mirando cada balón.",
    "tacticalReadiness": { "hasDefaultTactic": true, "formation": "4-3-3", "route": "/tactics" }
  },
  "navigation": {
    "zones": { "press": { "count": 2, "reasons": ["2 noticias sin leer"] } },
    "badges": [{ "key": "press", "count": 2, "route": "/press", "reasons": ["2 noticias sin leer"] }],
    "urgentCount": 2,
    "primaryCta": { "label": "Entrar en día de partido", "route": "/matches/105", "kind": "matchday" },
    "quickLinks": [
      { "key": "press", "label": "Sala de Prensa", "route": "/news", "badge": 2 },
      { "key": "tavern", "label": "Taberna", "route": "/messages", "badge": 0 },
      { "key": "world", "label": "Mundo FDF", "route": "/world", "badge": 0 }
    ]
  },
  "press": { "label": "Sala de Prensa", "unread": 2, "pendingQuestions": 1, "latest": [], "route": "/news", "pendingRoute": "/press" },
  "live": { "ticker": [], "nextTick": { "nextTickAt": "2026-06-12T21:00:00.000Z" } },
  "mood": { "mood": "green", "score": 72, "reasons": [] },
  "pressure": { "score": 35, "level": "watch", "label": "Situación vigilada" }
}
```
Si el usuario autenticado aún no tiene club, devuelve `visual.mode="normal"`, `matchday.phase="onboarding"` y `navigation.primaryCta.route="/onboarding"` en lugar de error.

### Y3 · Fichas públicas premium
#### `GET /api/public/player/:id`
Extiende la ficha pública con:
```json
{
  "visualProfile": { "headline": "Nombre - DC", "nationality": "España", "flag": "🇪🇸", "status": "Disponible", "club": {} },
  "form": { "fitness": 96, "morale": 81, "rhythm": 74, "lastRatings": [7.1, 8.0], "averageLastFive": 7.6 },
  "radar": { "technical": 74, "tactical": 68, "physical": 82, "mentality": 77 }
}
```

#### `GET /api/public/manager/:id`
Ficha pública de mánager con avatar, club, prestigio, estilo, racha, logros, historial reciente y enlaces:
```json
{
  "managerId": 3,
  "avatarUrl": "/api/public/avatar/3",
  "visualProfile": { "headline": "Jaime (FCB)", "nationality": "España", "style": "Ambicioso", "mentality": "Normal", "level": 7 },
  "careerSummary": { "stage": "promesa", "level": 7, "prestige": 35, "clubReputation": 92 },
  "form": []
}
```

### Y7 · Match Center contract
`GET /api/matches/public/:id`, `GET /api/matches/:id/preview`, calendario y `/api/public/world/leagues/:id` exponen `matchCenter`.
`GET /api/matches/public/:id` y `GET /api/matches/:id` mantienen:
- `timeline` / `replay`
- entradas de timeline con `lane`, `zone`, `duel` y `chain` cuando el motor las haya generado
- `homeRatings`, `awayRatings`
- `seed`
- `audit`: `{ algorithm, seedFormula, seed, canonicalSeed, seedHash, verifyEndpoint, timelineFromSeedEndpoint, verifiable, resultHidden }`
- `timelineAvailable`, `timelinePruned`
- `analysis.mvp`
- `analysis.momentum`
- `analysis.bestPlays`
- `analysis.clearChances`
- `analysis.xg`
- `analysis.keyDuels`
- `analysis.narrative`
- `archivedSummary`: resumen seguro para timelines podados o compactos:
  - `source`: `"timeline" | "seed-regenerable" | "score-only"`
  - `timelinePruned`, `timelineAvailable`, `timelineEntryCount`
  - `seed`, `canRegenerateFromSeed`
  - `score`, `motm`, `bestPlays`, `xg`, `keyDuels`, `narrative`, `reason`

E15 intacto: si el partido jugado pertenece al club autenticado y el usuario aún no lo marcó visto, `GET /api/matches/public/:id` y `GET /api/matches/:id` devuelven `resultHidden: true`; marcador, stats, ratings, timeline/replay, `analysis`, `archivedSummary`, `homeStatsJson` y `awayStatsJson` quedan ocultos. `GET /api/matches/:id/replay` y `GET /api/matches/:id/ratings` responden `403` con `resultHidden: true` hasta `POST /api/matches/:id/seen`.

Antigravity debe tratar `hasTimeline=false` como resumen compacto y `hasAdvancedStats=false` como visor sin xG/duelos avanzados si faltan datos.

### Y11 · Chat taberna
Canales nuevos: `tavern`, `rumors`, `help` además de los existentes. `GET /api/chat/channels` añade metadatos de taberna, `presence` y `tavern.eventsEndpoint`.

#### `GET /api/chat/tavern/events?take=12`
```json
{
  "theme": "tavern",
  "channels": ["tavern", "rumors", "market", "help"],
  "events": [
    { "id": "transfer-1", "type": "transfer", "headline": "FCB cierra a Jugador", "detail": "Procede de RSO", "route": "/player/10" }
  ]
}
```
#### `GET /api/chat/:channel?take=50&before=`
Canales válidos: `general`, `league`, `federation`, `social`, `tavern`, `rumors`, `help`, `global`, `market`.
Respuesta:
```json
{
  "channel": { "id": 5, "name": "Taberna FDF", "type": "tavern" },
  "messages": [
    {
      "id": 99,
      "text": "Gran cierre de mercado, @jaime",
      "timestamp": "2026-06-14T10:00:00.000Z",
      "mentions": [{ "userId": 1, "managerId": 1, "username": "jaime", "name": "Jaime", "clubShortName": "FCB" }],
      "reactions": [{ "emoji": "🔥", "count": 2, "userIds": [1, 2], "reactedByMe": true }],
      "author": {
        "id": 2,
        "username": "mister",
        "name": "Mister FDF",
        "managerId": 2,
        "avatarUrl": "/api/public/avatar/2",
        "clubShortName": "RMA",
        "club": { "id": 2, "name": "Real Madrid", "shortName": "RMA", "badge": "..." },
        "online": true
      }
    }
  ],
  "presence": { "channel": "chat:tavern", "online": [{ "userId": 2, "managerId": 2, "clubId": 2 }] },
  "pagination": { "take": 50, "before": null, "nextBefore": 99, "hasMore": false }
}
```
`POST /api/chat/:channel` mantiene `{ "text": "..." }`, sanea HTML/control chars, extrae menciones por `@username` y aplica rate-limit servidor `5 mensajes / 10s` por usuario además del límite HTTP por ruta.

#### `GET /api/chat/:channel/presence`
Devuelve usuarios online enriquecidos (`username`, `name`, `avatarUrl`, `club`) para pintar estados en burbujas/listas.

#### `POST /api/chat/:channel/messages/:messageId/reactions`
Body `{ "emoji": "🔥" }`. Toggle idempotente por usuario+mensaje+emoji. Emojis permitidos: `👍`, `👏`, `🔥`, `😂`, `😮`, `💚`, `⚽`. Respuesta `{ ok, action: "added"|"removed", message }` con el mensaje ya enriquecido.

Rutas legacy por id siguen vivas: `GET/POST /api/chat/channels/:id/messages` y `POST /api/chat/channels/:id/messages/:messageId/reactions`.

#### WS
- `POST /ws/ticket` con `Authorization: Bearer <jwt>` devuelve `{ ticket, expiresAt, expiresInMs }`. El ticket es efímero, de un solo uso y se pasa en la URL WS como `?ticket=...`.
- `/ws/chat/:channel?ticket=...` emite `subscription:ready`, `chat:presence`, `chat:message`, `chat:reaction`; acepta `{ "type": "chat:send", "text": "..." }` con el mismo rate-limit `5/10s`.
- `/ws/user/:userId?ticket=...` emite `chat:mention` cuando otro usuario menciona `@username`.
- DMs existentes no cambian.

### Y12 · Onboarding guiado
#### `GET /api/onboarding/guide`
Autenticado. Devuelve estado, ruta recomendada, checklist, tutorial y endpoints. Si `tutorialCompleted` o `tutorialSkipped` son true, `nextStep=null` y `recommendedRoute` cae a `/home` salvo que aún falte elegir club.
```json
{
  "manager": { "id": 1, "name": "Jaime", "prestige": 0, "club": null, "hasClub": false },
  "state": { "needsClubChoice": true, "tutorialStep": 0, "tutorialCompleted": false, "tutorialSkipped": false },
  "recommendedRoute": "/onboarding",
  "nextStep": { "step": 1, "key": "choose_club", "route": "/onboarding" },
  "clubChoice": {
    "source": "world_map_and_leagues",
    "explanation": "Clubes modestos abiertos de inicio; el prestigio desbloquea clubes de mayor reputación. Los bloqueados se devuelven con requiredPrestige/prestigeGap.",
    "filters": ["league", "country", "take"]
  },
  "checklist": [
    { "key": "choose_club", "done": false, "route": "/onboarding" }
  ],
  "endpoints": {
    "freeClubs": "/api/onboarding/free-clubs?league=&country=&take=",
    "chooseClub": "/api/onboarding/choose-club",
    "tutorial": "/api/manager/tutorial",
    "publicWorld": "/api/public/world/continents"
  }
}
```
`/api/manager/tutorial` pasa a 6 pasos: elegir club, contexto de club, tácticas, entrenamiento, mercado y Match Center.

#### `GET /api/onboarding/free-clubs?league=&country=&take=&includeLocked=`
Autenticado y solo para mánagers sin club. Usa la temporada activa y standings de liga para poder elegir desde mapa/país/liga. Regla de candado: reputación `<=70` está abierta con prestigio 0; por encima, `requiredPrestige = reputation - 70`.
```json
{
  "clubs": [
    {
      "id": 31,
      "name": "Club Modesto",
      "shortName": "MOD",
      "badge": "...",
      "league": { "id": 3, "name": "Segunda", "shortName": "SEG", "country": "España", "tier": 2 },
      "vacancy": { "status": "onboarding_open", "score": -2, "objective": "Evitar el descenso", "salary": 18000, "years": 2, "reason": "Disponible para empezar carrera desde el onboarding." },
      "onboarding": { "canChoose": true, "locked": false, "requiredPrestige": 0, "prestigeGap": 0, "chooseEndpoint": "/api/onboarding/choose-club" }
    }
  ],
  "blockedClubs": [
    {
      "id": 1,
      "name": "Club Grande",
      "league": { "id": 1, "name": "Primera División", "country": "España", "tier": 1 },
      "vacancy": { "status": "locked", "score": -55, "reason": "Necesitas 24 de prestigio para elegir este club." },
      "onboarding": { "canChoose": false, "locked": true, "requiredPrestige": 24, "prestigeGap": 24 }
    }
  ],
  "summary": { "managerPrestige": 0, "eligible": 12, "locked": 12, "filters": { "league": null, "country": "España" } },
  "pagination": { "take": 24, "scanned": 72, "returned": 12 }
}
```
`clubs` contiene solo clubes elegibles. `blockedClubs` es aditivo y puede ocultarse con `includeLocked=false`.

#### `POST /api/onboarding/choose-club`
Body `{ "clubId": 31, "nationality": "España", "personality": "Ambicioso" }`. Valida en servidor que el club esté libre y no esté bloqueado por prestigio. Al aceptar:
- Reutiliza contratación transaccional común (`hireManagerAtClub`), crea contrato y cierra candidaturas.
- Persiste identidad (`nationality`, `personality`).
- Avanza tutorial a paso 1 si procede.
- Reemite JWT con `clubId`.

Si el club está bloqueado responde `403`:
```json
{
  "error": "Necesitas 24 de prestigio para elegir este club.",
  "code": "prestige_locked",
  "vacancy": { "status": "locked", "score": -55 },
  "onboarding": { "canChoose": false, "requiredPrestige": 24, "prestigeGap": 24 }
}
```

---

## 1.1. Módulo: Auth y Ajustes
Rutas autenticadas para ajustes de cuenta B12. Cambios aditivos; `GET /api/auth/me` conserva los campos existentes y añade semillas de avatar.

### `GET /api/auth/me`
Respuesta extendida:
```json
{
  "id": 1,
  "username": "jaime",
  "email": "jaime@example.com",
  "role": "manager",
  "avatarSeed": "jaime-7",
  "manager": { "id": 3, "clubId": 1, "name": "Jaime", "prestige": 42, "avatarSeed": "manager-3" }
}
```

### `PATCH /api/auth/me`
Cambia email y/o avatar. Cambiar email exige `currentPassword`.

```json
{
  "email": "nuevo@example.com",
  "currentPassword": "password actual",
  "avatarSeed": "seed-ui-123",
  "managerAvatarSeed": "manager-seed-123"
}
```

Respuesta:
```json
{
  "ok": true,
  "user": { "id": 1, "email": "nuevo@example.com", "avatarSeed": "seed-ui-123" },
  "token": "jwt-nuevo-si-cambia-email-o-null",
  "uiNeed": "// NECESITO: Antigravity debe crear SettingsPage con cuenta, avatar procedural y accesibilidad enlazada."
}
```

### `POST /api/auth/change-password`
Requiere contraseña actual y nueva.

```json
{ "currentPassword": "actual", "newPassword": "nuevaPasswordSegura" }
```

Respuesta:
```json
{ "ok": true, "changedAt": "2026-06-09T10:30:00.000Z" }
```

---

## 1. Módulo: Dashboard (Manager Home)
Pantalla principal del manager. Agrupa todo lo necesario en una sola llamada.

### `GET /api/game/dashboard`
**Respuesta:**
```json
{
  "nextMatch": {
    "id": 105,
    "homeClubId": 1,
    "awayClubId": 2,
    "status": "scheduled",
    "homeClub": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
    "awayClub": { "id": 2, "name": "Real Madrid CF", "shortName": "RMA", "badge": "⚽" },
    "matchday": { "competition": { "name": "LaLiga" } }
  },
  "form": [
    { "result": "V", "score": "2-0", "rival": "RMA" },
    { "result": "E", "score": "1-1", "rival": "ATM" }
  ],
  "inbox": [
    {
      "id": 10,
      "type": "transfer",
      "title": "Oferta aceptada por Lamine",
      "isRead": false,
      "createdAt": "2026-06-03T10:00:00Z"
    }
  ],
  "board": {
    "confidence": { "value": 85, "history": "[80, 82, 85]" },
    "objectives": [
      { "type": "league", "target": "Win", "status": "Pending" }
    ]
  },
  "standings": [
    {
      "rank": 1, "played": 10, "won": 8, "drawn": 2, "lost": 0, "points": 26,
      "club": { 
        "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽",
        "manager": { "id": 1, "name": "Jaime Torres" }
      }
    }
  ]
}
```

---

## 2. Módulo: Club
Los endpoints de este módulo exponen de forma agregada los datos institucionales del club y de la plantilla.

### `GET /api/club/public/:id`
**Respuesta:**
```json
{
  "id": 1,
  "name": "FC Barcelona",
  "shortName": "FCB",
  "badge": "⚽",
  "fdfValuation": 1500000.50,
  "fans": 55000,
  "reputation": 95,
  "form": ["W", "W", "D", "L", "W"],
  "stadium": { "name": "Camp Nou", "capacity": 99000 },
  "fanBase": { "loyalty": 90, "mood": 85 },
  "history": {
    "seasons": [
      { "season": "2026/2027", "competition": { "id": 1, "name": "LaLiga" }, "position": 2, "points": 78 }
    ],
    "honours": [
      { "id": 9, "name": "Campeón LaLiga", "season": "2025/2026" }
    ],
    "recentMatches": [
      { "id": 100, "opponent": { "id": 2, "shortName": "RMA" }, "result": "W", "goalsFor": 2, "goalsAgainst": 1, "playedAt": "..." }
    ],
    "headToHeadHint": "/api/memory/head-to-head?clubA=1&clubB=<rivalId>"
  },
  "publicFinances": {
    "valuation": 1500000.5,
    "budgetBand": "10M-25M",
    "cashBand": "5M-10M",
    "salaryMassMonthly": 1200000,
    "salaryRatioPct": 42,
    "latestSnapshot": { "income": 3200000, "expenses": 2100000, "createdAt": "..." }
  },
  "uiNeed": "// NECESITO: Antigravity debe montar ClubPage con tabs Historial y Finanzas usando history/publicFinances."
}
```

### `GET /api/club/public/:id/squad`
Lista de la plantilla con estado por jugador (lesionado/sancionado, forma desglosada, nota media reciente, valor de mercado).
**Respuesta:**
```json
[
  {
    "id": 10,
    "name": "Lamine Yamal",
    "position": "DEL",
    "age": 18,
    "marketValue": 100000000,
    "overall": 74,
    "averageRating": 8.12,
    "formArray": [7.5, 8.0, 9.1, 7.8, 8.2],
    "muscularFitness": 95,
    "mentalSharpness": 90,
    "matchRhythm": 100,
    "injuries": [],
    "suspensions": []
  }
]
```

---

## 3. Módulo: Jugadores
### `GET /api/players`
Lista la plantilla del club del manager. `overall` se calcula con habilidades FDF relevantes por posición.

### `GET /api/players/public/:id`
Incluye `matchStats` con las últimas notas y estadísticas individuales. Desde S5, las stats extendidas salen de columnas dedicadas de `PlayerMatchStat` con fallback de `shotmap` legado:
`shotsOnTarget`, `passesCompleted`, `passAccuracy`, `tackles`, `interceptions`, `keyPasses` y `xG`.

Extensión B10:
```json
{
  "id": 10,
  "name": "Lamine Yamal",
  "overall": 74,
  "availability": {
    "injured": false,
    "suspended": false,
    "injuries": [],
    "suspensions": [],
    "statusText": "Disponible"
  },
  "contract": {
    "salary": 90000,
    "wage": 90000,
    "contractYears": 3,
    "contractStartAt": "2026-07-01T00:00:00.000Z",
    "contractEndAt": "2029-06-30T00:00:00.000Z",
    "yearsLeft": 3,
    "releaseClause": 54000000
  },
  "transferHistory": [
    {
      "id": 42,
      "type": "offer",
      "status": "accepted",
      "amount": 12000000,
      "fromClub": { "id": 1, "shortName": "FCB" },
      "toClub": { "id": 4, "shortName": "RSO" },
      "createdAt": "..."
    }
  ],
  "uiNeed": "// NECESITO: Antigravity debe mostrar estado, contrato completo e historial de traspasos en PlayerPage."
}
```

### `PATCH /api/players/:id/starter`
Body: `{ "isStarter": true }`.
Reglas aplicadas: máximo 11 titulares, jugador del club, no lesionado y con dorsal/ficha (`squadNumber != null`).

### `PATCH /api/players/:id/position`
Reposiciona un jugador. Body: `{ "position": "MED" }`.
Reglas FDF: experiencia ≥75, solo agosto-febrero, portero bloqueado, solo posiciones adyacentes (`DEF↔MED↔DEL`) y coste de 15 puntos de experiencia.

---

## 4. Módulo: Partidos y Calendario
### `GET /api/matches/public/:id`
El JSON inyecta eventos con `minute`, `type`, `playerName` y `zone` para el 2D Pitch, además de variables ambientales (`weatherCondition`, `temperature`) generadas por el motor.

**Nuevos campos para Copas/Eliminatorias (Fase E1)**:
- `isKnockout` (boolean): Indica si el partido es de eliminatoria.
- `round` (string, ej: `"round_of_16"`, `"final"`): Ronda de la eliminatoria.
- `leg` (int): Ida (1) o vuelta (2). Partido único es 0 o 1.
- `winner` (string | null): `"home"` o `"away"` si hay ganador (tras la simulación).
- `decidedBy` (string | null): `"regular"`, `"away_goals"`, `"penalties"`.
- `penaltiesHome` / `penaltiesAway` (int | null): Goles marcados en tanda de penaltis.

**(Ver documentación anterior)**

### Resultado oculto para partidos propios
En `GET /api/matches`, `GET /api/matches/:id` y `GET /api/matches/public/:id`, si el partido jugado pertenece al club autenticado y el usuario todavía no lo marcó visto, el backend devuelve `resultHidden: true` y oculta marcador/resumen (`homeGoals`, `awayGoals`, `motm`, stats, ratings, eventos, replay, `analysis`, `archivedSummary`, `homeStatsJson` y `awayStatsJson`). Los partidos públicos de otros clubes no cambian.

```json
{
  "id": 105,
  "status": "played",
  "homeClubId": 1,
  "awayClubId": 2,
  "homeGoals": null,
  "awayGoals": null,
  "resultHidden": true,
  "timeline": null,
  "analysis": null,
  "archivedSummary": null,
  "competition": { "id": 1, "name": "LaLiga", "shortName": "LL" }
}
```

`GET /api/matches/:id/replay` y `GET /api/matches/:id/ratings` devuelven `403` con `{ "resultHidden": true, "revealEndpoint": "/api/matches/:id/seen" }` mientras el resultado esté oculto.

### `POST /api/matches/:id/seen`
Marca el resultado como visto/saltado para el usuario autenticado y desbloquea los GET posteriores.

```json
{ "ok": true, "matchId": 105, "resultSeen": true }
```

> Estado de schema: resuelto en S1 con `MatchSeen(matchId, userId, seenAt)`. La lectura mantiene fallback desde `homeStatsJson.resultSeenByUserIds` para partidos antiguos, pero `POST /api/matches/:id/seen` ya no modifica `homeStatsJson`.

---

## 5. Módulo: Mercado y Shortlist
### `GET /api/market/search`
Recibe filtros opcionales avanzados y paginación densa: `?skip=0&take=20&position=DEL&ageMin=18&ageMax=25&valueMin=1000000&valueMax=10000000&salaryMax=60000&country=España&clubId=4&personality=Ambicioso&attr=shooting:80,dribbling:75&sortBy=marketValue&sortDir=desc`.
Aliases legacy compatibles: `page/limit`, `minAge/maxAge`, `maxPrice`, `maxWage`, `minPassing/minShooting...`.
Oculta jugadores de clubes desconocidos (visibilidad < 40).
Devuelve los jugadores paginados y el array de IDs en seguimiento.
**Respuesta:**
```json
{
  "data": [
    {
      "id": 10,
      "name": "Lamine Yamal",
      "overall": 74,
      "potential": 90,
      "marketValue": 100000000,
      "club": { "id": 1, "name": "FC Barcelona" }
    }
  ],
  "total": 125,
  "skip": 0,
  "take": 20,
  "page": 1,
  "totalPages": 7,
  "sortBy": "marketValue",
  "sortDir": "desc",
  "filters": {
    "position": "DEL",
    "ageMin": 18,
    "ageMax": 25,
    "valueMin": 1000000,
    "valueMax": 10000000,
    "salaryMax": 60000,
    "country": "España",
    "clubId": 4,
    "personality": "Ambicioso",
    "attrs": { "shooting": 80, "dribbling": 75 }
  },
  "shortlistIds": [10, 45],
  "uiNeed": "// NECESITO: Antigravity debe cambiar MarketPage a tabla paginada de 20, filtros plegables y orden por columna usando este contrato."
}
```

### `GET /api/market`
[Deprecado] Usar `/search` en su lugar.
        "age": 18,
        "position": "DEL",
        "club": { "name": "FC Barcelona", "badge": "⚽" }
      }
    }
  ],
  "total": 50,
  "page": 1,
  "totalPages": 3,
  "shortlistIds": [10, 15]
}
```

### `GET /api/market/shortlist`
Devuelve la lista de jugadores marcados como favoritos en el mercado. Campos aditivos Y-offers por jugador:
```json
{
  "id": 10,
  "name": "Jugador FDF",
  "club": { "id": 2, "name": "Club FDF", "shortName": "FDF", "badge": "..." },
  "shortlistId": 4,
  "followedAt": "2026-06-14T10:00:00.000Z",
  "scouting": {
    "assignmentId": 8,
    "scoutStaffId": 3,
    "analysisPoints": 88,
    "confidence": "high",
    "focus": "player|club",
    "reportEta": "next_turn|complete"
  }
}
```

### `POST /api/market/shortlist/:playerId`
Añade un jugador a la shortlist del mercado.

### `DELETE /api/market/shortlist/:playerId`
Elimina un jugador de la shortlist del mercado.

### `POST /api/market/shortlist/:playerId/scout`
Asigna un ojeador a un jugador que ya está en la lista de seguimiento. Body opcional: `{ "scoutStaffId": 3 }`; si se omite, el backend elige el ojeador con menor carga y mejor eficacia.
Reutiliza `ScoutAssignment` con `zone="player:<id>"`, deja el informe en `reportEta="next_turn"` y el tick genera una notificación `scout_report` específica del jugador al completar el informe.

### `POST /api/market/offer`
Realiza una puja por un jugador del mercado. Body: `{ playerId, amount, salary?, years?, clause? }`.
La oferta se puede registrar todo el año. Si implica traspaso inmediato, la ejecución exige ventana de mercado abierta; si no, queda como oferta `pending`.
Si la oferta trae términos de contrato (`salary` + `years`), el JUGADOR la valora con la evaluación multi-apartado: si el total es <50 responde **422** con `{ error, evaluation }`. Los términos se guardan en `TransferOffer.salary/contractYears/releaseClause` y se aplican al jugador al ejecutarse el traspaso (sueldo, contrato hasta el 30 de junio correspondiente y cláusula).

### `POST /api/market/evaluate` _(issue 3.1 — manual §4.3)_
Previsualiza cómo valoraría el jugador una oferta o renovación (lo consume `OfferPanel.tsx` en vivo). Body: `{ playerId, salary, years, clause? }`.
**Respuesta:**
```json
{
  "blocks": { "entorno": 62, "sentimental": 48, "expectativas": 70, "economico": 81 },
  "keys": [ { "id": "salary", "label": "Salario ≥ mínimo del jugador", "ok": true, "detail": "mínimo 4.250 €/mes" } ],
  "total": 65,
  "accepted": true
}
```
Llaves 🔑 eliminatorias (si una falla, `total=0`): salario ≥ mínimo según años pendientes (−20/−15/−10/−5%), cláusula ≤ límite legal (salario×200..600), años 1..5 y edad <33, moral ≥11%.

### `POST /api/market/players/:playerId/renew` _(issue 3.1)_
Ofrece una renovación a un jugador PROPIO. Body: `{ salary, years, clause? }`. Los años **suman** al contrato vigente (máx. 5 acumulados); el contrato resultante termina el 30 de junio; respeta el tope salarial del club.
**Respuesta:** `{ ok, accepted, evaluation, player? , message? }` — si `accepted=false` el jugador rechaza y `evaluation` explica por qué.

> Reglas de mercado activas además de las ventanas: **límite de plantilla** (primer equipo + entrantes confirmados ≤ 30 para fichar, manual §4.1) y **anti-reventa** (§4.4: durante el año de llegada y el siguiente solo acepta ofertas que superen su último traspaso; todos los traspasos ejecutados registran `Player.lastTransferAt/lastTransferValue`).

### `GET /api/market/salary-cap`
Devuelve el tope salarial FDF del club usando caja real (`cash` si existe; si no, `budget`) con fórmula `15% caja / 12`.
**Respuesta:**
```json
{
  "cashBase": 500000,
  "capMonthly": 6250,
  "usedMonthly": 4200,
  "remaining": 2050,
  "overCap": 0,
  "isOverCap": false
}
```

### `GET /api/market/squad-limits` _(S7 · manual §4.1)_
Resumen defensivo de límites FDF para avisos de Squad/Market.
```json
{
  "firstTeam": 24,
  "loanedOut": 2,
  "youth": 5,
  "pendingIncoming": 1,
  "limits": {
    "minFirstTeamAfterExit": 16,
    "minFirstTeamPlusYouthForExit": 19,
    "maxFirstTeamPlusIncoming": 30,
    "maxFirstTeamPlusLoanedOut": 26,
    "maxYouth": 22
  },
  "canSign": true,
  "canLoanOut": true,
  "canListTransfer": true,
  "uiNeed": "// NECESITO: Antigravity debe mostrar este indicador en Squad/Market antes de acciones de fichar, vender o ceder."
}
```
Reglas backend activas: fichar exige primer equipo + entrantes confirmados <30 y primer equipo + cedidos fuera + entrantes <26; ceder exige no bajar de 16 en primera plantilla ni de 19 contando juveniles; poner transferible exige al menos 19 entre primer equipo y juveniles.

### `GET /api/market/clause/:playerId`
Devuelve la cláusula efectiva. Si la cláusula guardada supera el máximo legal FDF, `clause` se limita a `legalMax` y `clauseWasCapped=true`.
**Respuesta:**
```json
{
  "playerId": 10,
  "name": "Lamine Yamal",
  "salary": 2000,
  "wage": 2000,
  "contractYears": 2,
  "yearsLeft": 2,
  "releaseClause": 1500000,
  "legalMax": 1200000,
  "legalMultiplier": 600,
  "clause": 1200000,
  "clauseWasCapped": true
}
```

### `POST /api/market/free-agents/:playerId/sign`
Ficha un agente libre en ventana de mercado. Body opcional: `{ wage, contractYears, releaseClause }`.
Reglas aplicadas: contrato máximo 5 temporadas, no renueva/firma con 33+ años, cláusula dentro del máximo legal salario×200..600, y tope salarial FDF por caja.

## 5.1. Módulo: Entrenamiento y Playbook FDF
### `GET /api/training/coaches`
Devuelve entrenadores del club con sus jugadores asignados. `assignedPlayers` se parsea de forma defensiva: si el JSON legado está corrupto o no es array, se devuelve como lista vacía.

### `PUT /api/training/coaches/:id/assign`
Asigna hasta 6 jugadores a un entrenador. Body: `{ "playerIds": [1,2,3] }`.
Valida que `:id` sea entero positivo y que todos los jugadores pertenezcan al club.

### `POST /api/training/plays`
Inicia el desarrollo de una jugada. Solo puede haber una jugada `developing` a la vez y el libro está limitado a 50 jugadas.
Body:
```json
{ "type": "field_attack" }
```
Tipos FDF aceptados: `field_attack`, `field_defense`, `setpiece_attack`, `setpiece_defense`.
Compatibilidad legacy: `attack`→`field_attack`, `defense`→`field_defense`, `freekick`→`setpiece_attack`.

### `PUT /api/training/plays/:id/activate`
Activa una jugada ya desarrollada. Máximo 8 jugadas activas para partido.

### `POST /api/tactics/plays` y `PATCH /api/tactics/plays/:id/toggle`
Endpoints legacy de tácticas para el mismo modelo `TrainedPlay`. Usan los mismos tipos FDF, normalización legacy y límite de 8 activas.

### Cierre y discurso de entrenamiento _(S8 · manual §5.5/5.6)_
Campos persistentes en `Club`: `trainingClosedUntilTurn`, `trainingClosedUses`, `homeStimulatedUntilTurn`, `homeStimulatedUses`.

#### `GET /api/training/control`
```json
{
  "turn": 42,
  "trainingClosedUntilTurn": 45,
  "trainingClosedUses": 1,
  "homeStimulatedUntilTurn": 44,
  "homeStimulatedUses": 1,
  "trainingClosedActive": true,
  "homeStimulatedActive": true,
  "uiNeed": "// NECESITO: Antigravity debe añadir controles de cierre/discurso en TrainingPage o Dashboard."
}
```

#### `POST /api/training/close`
Cierra entrenamientos durante 3 turnos. Los 2 primeros usos de temporada son gratis; desde el tercero se resta 1 a `BoardConfidence.level`.

#### `POST /api/training/stimulate`
Activa discurso/estímulo local durante 2 turnos. El tick envía `homeStimulated=true` al motor en partidos como local. Los 2 primeros usos son gratis; desde el tercero se resta 1 a `BoardConfidence.level`.

---

## 6. Módulo: Noticias y Prensa (Nuevo)
### `GET /api/news`
Devuelve el feed de prensa global y la bandeja de entrada privada del manager, paginado.
**Respuesta:**
```json
{
  "press": {
    "data": [
      {
        "id": 1,
        "matchdayId": 10,
        "headline": "¡Goleada de escándalo! FCB arrasa a RMA (4-0)",
        "content": "El FC Barcelona dominó el encuentro de principio a fin.",
        "createdAt": "2026-06-03T10:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  },
  "inbox": {
    "data": [
      {
        "id": 10,
        "type": "board",
        "subject": "Lesión grave: Lamine Yamal",
        "body": "Los médicos confirman que estará de baja 4 semanas.",
        "isRead": false,
        "createdAt": "2026-06-03T10:00:00Z"
      }
    ],
    "total": 1,
    "page": 1,
    "totalPages": 1
  }
}
```

### `PUT /api/news/:id/read`
Marca un mensaje de la bandeja de entrada como leído. Devuelve `{ "ok": true }`.

---

## 7. Módulo: Premios y Palmarés (Nuevo)
### `GET /api/awards?season=2025/2026`
Lista de premios individuales de la temporada.
**Respuesta:**
```json
[
  {
    "id": 1,
    "name": "Pichichi",
    "type": "player",
    "season": "2025/2026",
    "player": { "id": 10, "name": "Lamine Yamal", "position": "DEL" },
    "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" }
  }
]
```

### `GET /api/club/:id/honours`
Devuelve el historial de trofeos y posiciones finales de un club.
**Respuesta:**
```json
{
  "honours": [
    {
      "id": 1,
      "name": "Campeón LaLiga",
      "season": "2024/2025"
    }
  ],
  "history": [
    {
      "id": 1,
      "season": "2024/2025",
      "position": 1,
      "points": 95,
      "competition": { "name": "LaLiga" }
    }
  ]
}
```

---

## 8. Módulo: Leaderboards (Estadísticas Agregadas)
- `GET /api/leaderboards/goals` -> Top goleadores
- `GET /api/leaderboards/assists` -> Top asistentes
- `GET /api/leaderboards/ratings` -> Top notas medias (MVP race)
- `GET /api/matches/calendar`

---

## 9. Endpoints ya implementados para el resto de pantallas
- `GET /api/world/competitions`
- `GET /api/world/competitions/coefficients` -> { clubs: [{clubId, name, points, seasons: []}], leagues: [{country, points, slots: {ucl, uel, uecl}}] }
- `GET /api/world/countries`
- `GET /api/world/standings/:competitionId`
- `GET /api/tactics/:clubId`
- `POST /api/tactics/:clubId`

### `POST /api/matches/:id/tactics`
Guarda la táctica previa al partido. Además de los campos básicos, acepta palancas avanzadas que el backend pasa al motor durante la simulación.

**Body:**
```json
{
  "formation": "4-3-3",
  "construction": 58,
  "destruction": 52,
  "pressing": 70,
  "tempo": 65,
  "width": 55,
  "mentality": "attacking",
  "marking": "zonal",
  "subsLogic": [
    {
      "fromMin": 60,
      "toMin": 65,
      "condition": "losing",
      "changes": {
        "mentality": 75,
        "tempo": 70,
        "offensiveStyle": "pases_largos",
        "attackZones": { "left": 20, "center": 60, "right": 20 }
      }
    }
  ],
  "penaltyTaker": "player-id-9",
  "freeKickTaker": "player-id-10",
  "cornerTaker": "player-id-8"
}
```

**Respuesta:** `{ "ok": true }`

**Efecto motor v3 (14 jun, A7):** `marking="individual"` aporta defensa en duelos directos con coste leve de posesión/fatiga; `penaltyTaker`, `freeKickTaker` y `cornerTaker` aceptan id o nombre de jugador y alimentan tandas/balón parado si el jugador existe. El atributo de jugador `fouls` se usa como control disciplinario en faltas/tarjetas. `zonal` y lanzadores ausentes son neutros.

**Plan condicional X5 (14 jun, Codex):** `subsLogic[]` conserva las sustituciones R4 (`outId/inId`) y ahora acepta reglas solo tácticas mediante `changes`, `tactic` o `set`. `/api/matches/:id/tactics` acepta `subsLogic`, `attackZones` y `defenseReinforcement` como JSON real o string JSON legacy. Campos admitidos: `construction`, `destruction`, `pressing`, `tempo`, `width`, `mentality`, `marking`, `formation`, `offensiveStyle`, `defensiveStyle`, `attackZones`, `defenseReinforcement`, `penaltyTaker`, `freeKickTaker`, `cornerTaker`. Condiciones: `any|winning|drawing|losing`; el ajuste se aplica en `fromMin` si el marcador cumple la condición y afecta al tramo posterior de la simulación. El Match Center recibe `homeStatsJson.tacticalChanges[]` y una entrada de timeline `phase:"ajuste_tactico"`:

```json
{
  "tacticalChanges": [
    {
      "team": "home",
      "minute": 60,
      "condition": "losing",
      "changes": { "mentality": 75, "tempo": 70, "offensiveStyle": "pases_largos" },
      "previous": { "mentality": 50, "tempo": 50, "offensiveStyle": null }
    }
  ]
}
```

## 10. Módulo: Carrera de Mánager (RPG)
### `GET /api/manager/tutorial`
Estado persistido del tutorial jugable W1 para el mánager autenticado.

```json
{
  "managerId": 3,
  "tutorialStep": 1,
  "tutorialCompleted": false,
  "tutorialSkipped": false,
  "steps": [
    { "step": 1, "key": "tactics_lineup", "route": "/tactics", "objective": "Revisa táctica y alineación" },
    { "step": 2, "key": "training_market", "route": "/training", "objective": "Pon a entrenar y prepara una oferta" },
    { "step": 3, "key": "watch_match", "route": "/matches", "objective": "Ve tu primer partido" }
  ],
  "uiNeed": "// NECESITO: Antigravity debe crear overlay jugable de 3 turnos, saltable, que lea/actualice este estado."
}
```

### `PATCH /api/manager/tutorial`
Actualiza el progreso. Body aditivo:

```json
{ "tutorialStep": 2, "tutorialCompleted": false, "tutorialSkipped": false }
```

Si `tutorialCompleted` o `tutorialSkipped` son `true`, el backend no vuelve a bajar el estado automáticamente.

### `GET /api/manager/career`
Devuelve el perfil del mánager, progreso, habilidades y logros.
**Respuesta:**
```json
{
  "level": 3,
  "xp": 12500,
  "xpCurve": {
    "type": "exponential",
    "base": 900,
    "growth": 1.16,
    "currentLevelXp": 2988,
    "nextLevelXp": 6170,
    "xpIntoLevel": 320,
    "xpNeededForNext": 2852
  },
  "skillPoints": {
    "earned": 2,
    "spent": 1,
    "available": 1
  },
  "skillTree": [
    { "nodeId": "mot_1", "branch": "mot", "tier": 1, "cost": 1, "unlocked": true, "unlockable": false },
    { "nodeId": "mot_2", "branch": "mot", "tier": 2, "cost": 2, "unlocked": false, "unlockable": true }
  ],
  "reputation": 45,
  "prestige": 50,
  "skills": ["tactics_1", "motivation_1"],
  "achievements": [
    {
      "id": 1,
      "type": "LEAGUE_WIN",
      "title": "Campeón de Primera División (2025/2026)",
      "date": "2026-06-01T12:00:00Z"
    }
  ],
  "currentClub": {
    "name": "Málaga CF",
    "shortName": "Málaga",
    "badge": "🛡️"
  },
  "uiNeed": "// NECESITO: Antigravity debe leer xpCurve/skillPoints/skillTree; el cálculo level*100 y level-1-unlocks del front queda obsoleto."
}
```

### `POST /api/manager/skills/unlock`
Desbloquea una nueva habilidad (nodo del árbol de habilidades).
**Body:** `{ "nodeId": "tactics_2" }`
Costes por tier: nivel 1 = 1 punto, nivel 2 = 2 puntos, nivel 3 = 3 puntos. El backend valida secuencia por rama y nunca elimina nodos ya comprados.
**Respuesta:** `{ "ok": true, "skill": { "nodeId": "tactics_2", "unlockedAt": "..." }, "skillPoints": { "earned": 4, "spent": 3, "available": 1 } }`

### `GET /api/manager/offers`
Devuelve las ofertas de trabajo activas y candidaturas pendientes para el mánager.
**Respuesta (Ofertas):**
```json
[
  {
    "offerId": 5,
    "clubId": 12,
    "club": { "name": "Valencia CF", "budget": 45000000, "reputation": 80 },
    "objective": "Clasificar a Competiciones Europeas",
    "salary": 150000,
    "years": 2,
    "score": 12,
    "status": "offer",
    "reason": "El club te quiere como primera opción.",
    "wage": 150000
  }
]
```

### `POST /api/manager/vacancies/:id/apply`
Envía una candidatura para una vacante abierta.
**Respuesta:**
```json
{
  "ok": true,
  "vacancyId": 12,
  "clubId": 12,
  "applicationStatus": "SHORTLISTED",
  "message": "Tu candidatura ha entrado en la lista corta de la directiva."
}
```
Si la vacante se acepta de forma inmediata (`applicationStatus: "accepted"`) la respuesta incluye `token` reemitido con el nuevo `clubId`. `POST /api/manager/offers/:id/accept` hace lo mismo siempre que la contratación se completa.

- **KitPage**: `GET /api/club/kits` (A implementar consumiendo el nuevo modelo `ClubKit`)
- **ScoutPage**: `GET /api/scout/staff`, `POST /api/scout/players/:id/track`
- **VacanciesPage**: `GET /api/manager/offers`, `GET /api/manager/vacancies`

---

## 10.1. Módulo: Staff con efectos medibles (C4)
### `GET /api/staff`
Contrato existente ampliado de forma aditiva. Además de `members`, `summary` y `candidates`, devuelve `effects` calculado por el mejor miembro de cada rol.

```json
{
  "staffId": 3,
  "members": [
    { "id": 21, "role": "doctor", "roleLabel": "Médico", "level": 4, "salary": 23300 }
  ],
  "effects": {
    "doctor": {
      "level": 4,
      "injuryChanceReductionPct": 28,
      "injuryDurationReductionPct": 20,
      "extraRecoveryWeeks": 1,
      "description": "Reduce lesiones nuevas un 28%, recorta duración un 20% y acelera altas."
    },
    "fitnessCoach": { "level": 3, "fitnessRecoveryBonus": 3 },
    "nutritionist": { "level": 2, "conditionRecoveryBonus": 1 },
    "tacticalAnalyst": { "level": 2, "scoutProgressBonus": 2 },
    "sportingDirector": { "level": 2, "rhythmMoraleBonus": 1 }
  },
  "uiNeed": "// NECESITO: Antigravity debe mostrar en StaffPage estos efectos activos con números y estados por rol."
}
```

Aplicación en tick:
- Médico: reduce probabilidad y duración de lesiones; nivel 4+ acelera recuperación de lesiones activas.
- Fisio (`fitnessCoach`): suma recuperación de fitness tras la recuperación base del turno.
- Nutricionista: recupera `muscularFitness` y `mentalSharpness`.
- Analista táctico: añade puntos extra a informes de ojeo del rival.
- Segundo/secretaría (`sportingDirector`): mejora `matchRhythm` y moral baja de la plantilla.

---

## 11. Módulo: Multijugador en Tiempo Real (Etapa 8)
Mejora progresiva: el contrato REST existente sigue funcionando. Si el cliente abre WebSocket, recibe eventos en vivo; si no, puede seguir usando polling con los endpoints REST.

> Estado de schema: `Auction`, `AuctionBid` y `TransferAgreement` existen. Subastas usan el schema actual (`active|finished|cancelled`) y calculan `currentBid`/`winningClubId` desde las pujas. ✅ Auditoría extendida CERRADA (11 jun tarde, Claude): los 3 caminos de cierre rellenan los campos — venta → `status='finished'` + `winningClubId` (mejor puja válida, con fallback a la siguiente si el postor no tiene fondos) · cancelación del vendedor → `closedNoSaleReason='Cancelada anticipadamente por el vendedor'` · sin venta → `closedNoSaleReason='Sin pujas válidas o el mejor postor no tenía fondos'` (texto pasado a español). El timer re-armado tras reinicio (initAuctionTimers) desemboca en el mismo `close()`.

### WebSocket
Autenticación:
- Clientes servidor/no navegador: header `Authorization: Bearer <token>` en el handshake.
- Navegador: `POST /ws/ticket` con Bearer normal; conectar el WS con `?ticket=<ticket>`. El ticket dura 30s, es de un solo uso y evita filtrar el JWT en URLs/logs. El query legacy `?token=<jwt>` solo se acepta en desarrollo.

Canales:
- `ws://<host>/ws/chat/:channel?ticket=<ticket>`: chat en tiempo real. Ejemplo `general`, `league`, `market`.
- `ws://<host>/ws/auction/:auctionId?ticket=<ticket>`: eventos de una subasta concreta.
- `ws://<host>/ws/league/:leagueId?ticket=<ticket>`: canal de liga/jornada para goles y eventos escalonados.
- `ws://<host>/ws/club/:clubId?ticket=<ticket>`: canal privado del club autenticado para negociación formal.
- `ws://<host>/ws/system?ticket=<ticket>`: eventos globales de sistema; por ahora `tick:completed`.

Cliente -> servidor en chat:
```json
{ "type": "chat:send", "text": "¿Alguien vende un central?" }
```

Eventos servidor -> cliente:
```json
{
  "type": "chat:message",
  "channel": "chat:general",
  "payload": {
    "channel": { "id": 1, "name": "General", "type": "general" },
    "message": {
      "id": 101,
      "text": "¿Alguien vende un central?",
      "timestamp": "2026-06-03T10:00:00.000Z",
      "author": { "id": 1, "username": "manager", "name": "Manager", "clubShortName": "FCB" }
    }
  },
  "ts": "2026-06-03T10:00:00.000Z"
}
```

```json
{
  "type": "auction:bid",
  "channel": "auction:12",
  "payload": {
    "auction": {
      "id": 12,
      "status": "active",
      "currentBid": 1200000,
      "winningClubId": null,
      "endsAt": "...",
      "bidPrivacy": {
        "mode": "sealed",
        "publicPriceField": "currentBid",
        "encryptedFields": ["amount", "managerId"],
        "scheme": "auction-bid-v1"
      }
    },
    "bid": {
      "id": 44,
      "auctionId": 12,
      "createdAt": "...",
      "sealed": true,
      "encrypted": {
        "alg": "A256GCM",
        "kid": "auction-bid-v1",
        "iv": "...",
        "ciphertext": "...",
        "tag": "..."
      }
    }
  },
  "ts": "..."
}
```

N2-4: en WS y polling público, `bid.amount` y `bid.managerId` no viajan en claro. La UI debe pintar el precio desde `auction.currentBid`; `winningClubId` solo se revela cuando la subasta ya no está `active`. La respuesta REST del propio `POST /api/auctions/:id/bids` puede incluir la puja creada para confirmar la acción al pujador.

Evento de jornada en vivo:
```json
{
  "type": "match:event",
  "channel": "league:1",
  "payload": {
    "matchId": 105,
    "leagueId": 1,
    "minute": 67,
    "type": "goal",
    "homeClubId": 1,
    "awayClubId": 2,
    "team": "home",
    "description": "Gol de Lamine",
    "score": { "home": 2, "away": 1 }
  },
  "ts": "2026-06-04T12:00:00.000Z"
}
```

Helper backend exportado para el tick:
```ts
broadcastLeagueMatchTimeline({
  leagueId: competitionId,
  matchId,
  homeClubId,
  awayClubId,
  events,
  intervalMs: 750
});
```

---

## §MemoriaMundo
Read-layer para memoria histórica consultable. Rutas autenticadas.

### `GET /api/memory/head-to-head?clubA=1&clubB=2`
Resumen histórico entre dos clubes y últimos 10 enfrentamientos.

```json
{
  "clubA": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
  "clubB": { "id": 2, "name": "Real Madrid CF", "shortName": "RMA", "badge": "⚽" },
  "summary": {
    "played": 12,
    "clubAWins": 5,
    "clubBWins": 4,
    "draws": 3,
    "clubAGoals": 18,
    "clubBGoals": 16
  },
  "recent": [
    {
      "id": 105,
      "playedAt": "2026-06-04T12:00:00.000Z",
      "homeClub": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
      "awayClub": { "id": 2, "name": "Real Madrid CF", "shortName": "RMA", "badge": "⚽" },
      "homeGoals": 2,
      "awayGoals": 1,
      "competition": { "id": 1, "name": "LaLiga", "shortName": "LL" }
    }
  ]
}
```

### `GET /api/memory/overview`
Resumen para la portada de "Memoria del Mundo".

```json
{
  "counts": { "honours": 120, "seasons": 30, "playedMatches": 820, "news": 240, "legends": 18 },
  "latestHonours": [
    { "id": 9, "name": "Campeón LaLiga", "season": "2026/2027", "club": { "id": 1, "shortName": "FCB" } }
  ],
  "latestNews": [
    { "id": 77, "type": "media", "subject": "Rueda de prensa", "createdAt": "..." }
  ],
  "biggestWins": [
    { "matchId": 33, "score": "6-1", "goalDiff": 5, "winner": { "id": 1, "shortName": "FCB" } }
  ],
  "uiNeed": "// NECESITO: Antigravity debe rehacer AwardsPage como Memoria del Mundo con tabs Palmarés/Hemeroteca/Récords/Leyendas."
}
```

### `GET /api/memory/palmares`
Palmarés y temporadas históricas. Filtros opcionales: `season`, `clubId`, `playerId`, `competitionId`, `skip`, `take` (máx. 100).

```json
{
  "skip": 0,
  "take": 50,
  "totalHonours": 120,
  "honours": [
    { "id": 9, "name": "Campeón LaLiga", "season": "2026/2027", "club": { "id": 1, "name": "FC Barcelona" }, "player": null }
  ],
  "seasonHistory": [
    { "id": 4, "season": "2026/2027", "position": 1, "points": 84, "club": { "id": 1, "shortName": "FCB" }, "competition": { "id": 1, "name": "LaLiga" } }
  ]
}
```

### `GET /api/memory/archive`
Hemeroteca histórica. Filtros opcionales: `q`, `type`, `managerId`, `clubId`, `skip`, `take` (máx. 100). Devuelve `News` de mánager y `PressItem` globales.

```json
{
  "skip": 0,
  "take": 50,
  "news": [
    { "id": 77, "source": "news", "type": "media", "subject": "Rueda de prensa", "manager": { "id": 3, "name": "Jaime" }, "createdAt": "..." }
  ],
  "pressItems": [
    { "id": 12, "source": "press", "headline": "Goleada histórica", "createdAt": "..." }
  ]
}
```

### `GET /api/memory/records`
Récords del universo calculados + persistidos. Query opcional `take` (máx. 50).

```json
{
  "biggestWins": [],
  "highestScoringMatches": [],
  "topScorers": [],
  "topAssisters": [],
  "topRatings": [],
  "bestUnbeatenStreaks": [],
  "clubRecords": [],
  "playerRecords": []
}
```

---

## §SucesionClub
Backend para “club busca mánager” y sucesión desde vacantes. Rutas autenticadas.

### `GET /api/manager/clubs-seeking-manager`
Devuelve clubes sin mánager con estado de candidatura según prestigio del usuario.

```json
[
  {
    "clubId": 12,
    "club": { "id": 12, "name": "Valencia CF", "shortName": "VAL", "badge": "⚽", "reputation": 72, "vacancyOpenedAt": "2026-05-20T10:00:00.000Z", "daysVacant": 16 },
    "daysVacant": 16,
    "objective": "Clasificar a Competiciones Europeas",
    "salary": 42000,
    "years": 3,
    "score": 4,
    "status": "apply",
    "reason": "Puedes presentar candidatura.",
    "seekingManager": true,
    "urgency": "medium",
    "pitch": "Valencia CF acepta candidaturas de mánagers con tu prestigio."
  }
]
```

Urgencia S10: `low` si lleva 0-4 días vacante, `medium` si lleva 5-13, `high` desde 14 días. `vacancyOpenedAt` se limpia al ocupar el club y se fija cuando un mánager deja su club anterior.

### `POST /api/manager/clubs-seeking-manager/:clubId/apply`
Alias semántico de candidatura a vacante. Devuelve la misma respuesta que `POST /api/manager/vacancies/:id/apply`.

---

## §DramaHumano
Extensiones backend para negociaciones más humanas.

### `POST /api/negotiations`
El contrato acepta `type: "sale" | "loan" | "exchange" | "swap"`. Para cesiones con opción de compra, añadir `optionToBuyAmount`; para intercambios jugador+jugador(+dinero), usar `swap` con `requestedPlayerId`, `offeredPlayerId` y `cashDelta` (positivo: paga el club que recibe el jugador solicitado; negativo: paga el otro club).

```json
{
  "type": "loan",
  "targetClubId": 8,
  "playerId": 44,
  "loanUntil": "2027-06-30T00:00:00.000Z",
  "optionToBuyAmount": 12000000,
  "message": "Cesión con opción no obligatoria."
}
```

Intercambio:
```json
{
  "type": "swap",
  "targetClubId": 8,
  "requestedPlayerId": 44,
  "offeredPlayerId": 91,
  "cashDelta": 3000000,
  "message": "Intercambio con compensación económica."
}
```

Respuesta de acuerdo:
```json
{
  "id": 77,
  "type": "loan",
  "status": "proposed",
  "playerId": 44,
  "fromClubId": 1,
  "toClubId": 8,
  "amount": 0,
  "loanUntil": "2027-06-30T00:00:00.000Z",
  "optionToBuyAmount": 12000000,
  "message": "Cesión con opción no obligatoria."
}
```

Reglas backend al aceptar: ventana abierta, tope salarial de ambos clubes en swaps, límite plantilla ≤30, anti-reventa FDF y ejecución atómica con `lastTransferAt/lastTransferValue`.
Persistencia S2: `optionToBuyAmount` y `cashDelta` viven en columnas dedicadas de `TransferAgreement`; `message` queda para texto humano. La lectura conserva fallback de metadata JSON antigua en `message`.

### `POST /api/negotiations/:id/exercise-option`
Ejecuta la opción de compra pactada en una cesión aceptada mientras el jugador está cedido en tu club.
Además, en el retorno de cesiones del 30 de junio el tick ejerce automáticamente la opción pactada si el club cesionario puede pagarla; si no, el jugador vuelve al propietario.

```json
{
  "ok": true,
  "price": 12000000,
  "agreement": { "id": 77, "type": "loan", "optionToBuyAmount": 12000000 }
}
```

> Estado de schema: resuelto en S2 con `TransferAgreement.optionToBuyAmount` y `TransferAgreement.cashDelta`.

### `GET /api/news/press-conference/options`
Opciones de tema/tono y efectos previstos.

```json
{
  "topics": ["pre_match", "post_match", "transfer", "board", "fans"],
  "tones": [
    { "id": "protective", "label": "Protector", "effects": { "reputation": 0, "fans": 40, "morale": 2 } }
  ]
}
```

### `POST /api/news/press-conference`
Publica una declaración y aplica consecuencias moderadas sobre reputación, afición y moral de plantilla.
Persistencia S3: crea `PressConference { managerId, topic, tone, effectsJson }` y conserva `PressItem` como pieza del feed público.

```json
{
  "topic": "post_match",
  "tone": "protective",
  "quote": "El equipo ha competido con orgullo y vamos a crecer desde aquí."
}
```

### `GET /api/press/pending`
Genera de forma perezosa una pregunta tras los últimos partidos jugados del club humano y devuelve pendientes sin responder.

```json
[
  {
    "questionId": 91,
    "matchId": 105,
    "context": "victory",
    "question": "El equipo ganó. ¿Cómo explicas el rendimiento?",
    "score": { "home": 2, "away": 1 },
    "createdAt": "2027-03-12T10:00:00.000Z",
    "choices": [
      { "id": "humble", "label": "Humilde", "text": "Seguimos trabajando, esto es mérito del grupo.", "effects": { "morale": 1, "fans": 2 } },
      { "id": "neutral", "label": "Neutral", "text": "Analizaremos el partido con calma y corregiremos detalles.", "effects": { "morale": 0, "fans": 0 } },
      { "id": "aggressive", "label": "Agresiva", "text": "Tenemos que exigir mucho más, no podemos conformarnos.", "effects": { "morale": -1, "fans": -2 } }
    ]
  }
]
```

Persistencia S3: las preguntas nuevas viven en `PressQuestion`; la respuesta del endpoint mantiene fallback de preguntas antiguas guardadas en `News.body` y las marca como `legacySource: "news"` si aparecen.

### `POST /api/press/answer`
```json
{ "questionId": 91, "choice": "humble" }
```

Respuesta:
```json
{
  "ok": true,
  "effects": { "morale": 1, "fans": 2, "label": "Humilde" },
  "question": { "id": 91, "answeredTone": "humble" },
  "pressItem": { "id": 33, "headline": "Rueda de prensa: Seguimos trabajando..." }
}
```

Respuesta:
```json
{
  "ok": true,
  "pressItem": { "id": 88, "headline": "Jaime Torres: \"El equipo ha competido...\"" },
  "pressConference": { "id": 12, "topic": "post_match", "tone": "protective" },
  "effects": { "reputation": 0, "fans": 40, "morale": 2 }
}
```

---

## §PushBackend
Backend inicial para Web Push/PWA. Rutas autenticadas.

### `GET /api/push/config`
```json
{
  "vapidPublicKey": "BExamplePublicKey",
  "enabled": true
}
```

### `POST /api/push/subscriptions`
Registra o actualiza la suscripción del navegador en `PushSubscription`. Alias compatible: `POST /api/push/subscribe`.

```json
{
  "endpoint": "https://push.example/subscription",
  "keys": { "p256dh": "...", "auth": "..." }
}
```

Respuesta:
```json
{ "ok": true, "subscriptionId": 12, "subscriptions": 1, "storage": "database" }
```

### `DELETE /api/push/subscriptions`
Elimina la suscripción por endpoint. Alias compatible: `DELETE /api/push/subscribe`.

```json
{ "endpoint": "https://push.example/subscription" }
```

### `POST /api/push/test`
Crea una `Notification` de prueba y envía push real con `web-push` si `VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY` están configuradas.

```json
{ "title": "Manager FDF", "message": "Notificación de prueba" }
```

```json
{
  "notification": { "id": 44, "type": "push_test" },
  "pushQueued": 1,
  "sent": 1,
  "failed": 0,
  "enabled": true
}
```

Helpers backend exportados:
```ts
sendPushToUser(userId, { title, body, url });
pushTurnProcessed(userId);
pushLiveGoal(userId, matchId, body);
pushAuctionOutbid(userId, auctionId, body);
```

Variables necesarias:
```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@managerfdf.local
```

---

## §I18nServer
Diccionario de strings generados por servidor para notificaciones/news/mensajes. Rutas autenticadas. Fuente ES centralizada en `server/src/modules/i18n/strings.es.ts`.

### `GET /api/i18n/server?locale=es`
```json
{
  "locale": "es",
  "supported": ["es", "en", "fr", "de", "it", "ca", "va", "gl", "eu"],
  "strings": {
    "notification.turn_processed.title": "Turno procesado",
    "notification.turn_processed.body": "Se ha procesado el turno. Revisa tu plantilla y finanzas.",
    "news.press_conference.subject": "Rueda de prensa publicada"
  },
  "fallbackLocale": null,
  "needed": "// NECESITO: traducciones humanas completas para fr/de/it/ca/va/gl/eu; ahora ca/va/gl/eu usan ES y fr/de/it usan EN como fallback."
}
```

### `GET /api/memory/clubs/:clubId/legends`
Leyendas del club desde `ClubLegend` persistido; si aún no hay filas persistidas, fallback calculado por rendimiento histórico disponible en `PlayerSeasonStat` + palmarés del club.

```json
{
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
  "legends": [
    {
      "id": 10,
      "name": "Lamine Yamal",
      "position": "DEL",
      "age": 18,
      "nationality": "España",
      "legendScore": 88,
      "totals": { "matches": 120, "goals": 42, "assists": 35, "averageRating": 8.1 }
    }
  ],
  "honours": [
    { "id": 4, "name": "Campeón LaLiga 2026/2027", "season": "2026/2027", "createdAt": "2026-06-04T12:00:00.000Z" }
  ],
  "storage": "persisted",
  "uiNeed": "// NECESITO: Antigravity debe mostrar Leyendas en Memoria del Mundo y enlazar jugador/modal si playerId existe."
}
```

```json
{
  "type": "auction:closed",
  "channel": "auction:12",
  "payload": {
    "id": 12,
    "status": "finished",
    "winningClubId": 4,
    "currentBid": 1200000
  },
  "ts": "..."
}
```

### Subastas REST
Todas requieren JWT de mánager.

#### `GET /api/auctions?status=active&listingId=1`
Lista subastas. Sirve como polling fallback.

#### `POST /api/auctions`
Crea una subasta desde un `TransferListing` propio.
**Body:**
```json
{
  "listingId": 1,
  "durationSeconds": 3600,
  "reservePrice": 1000000
}
```

#### `GET /api/auctions/:id`
Detalle de subasta con `player`, `sellerClub`, `bids`, `highestBid`, `currentBid` y `winningClubId`.
Mientras la subasta está `active`, `bids[]` y `highestBid` son objetos sellados (`sealed=true`) sin `amount` ni `managerId`; usa `currentBid` para mostrar el precio público. `winningClubId` se devuelve `null` hasta el cierre.

#### `GET /api/auctions/:id/events?afterBidId=44`
Polling incremental de pujas. Devuelve `{ auction, events, nextAfter }`.
Los eventos siguen el mismo contrato sellado del WS `auction:bid`.

#### `POST /api/auctions/:id/bids`
Realiza puja validando caja y tope salarial. Anti-snipe: si entra en los últimos 30s, extiende `endsAt` +30s.
**Body:**
```json
{ "amount": 1200000 }
```

#### `POST /api/auctions/:id/close`
Cierre idempotente. Si hay ganador válido, ejecuta traspaso, mueve caja y elimina el listing. Si no hay puja válida, marca `cancelled`.

### Negociación Formal REST
Todas requieren JWT de mánager.

#### `GET /api/negotiations?status=proposed`
Lista acuerdos donde participa el club del mánager.

#### `POST /api/negotiations`
Propone venta/compra formal. `sale` se guarda como `type="transfer"` en el schema actual.
**Body venta/compra:**
```json
{
  "type": "sale",
  "targetClubId": 2,
  "playerId": 10,
  "amount": 5000000,
  "message": "Oferta formal por el jugador."
}
```

Cesión e intercambio están activos: `loan` usa `loanUntil` y puede incluir `optionToBuyAmount`; `swap` usa `offeredPlayerId` y `cashDelta`.

#### `GET /api/negotiations/:id`
Detalle del acuerdo con clubes y jugador enriquecidos.

#### `POST /api/negotiations/:id/accept`
Solo el club destinatario. Acepta idempotentemente y ejecuta el traspaso con validación de caja/tope salarial.

#### `POST /api/negotiations/:id/reject`
Solo el club destinatario. Marca `rejected`.

#### `POST /api/negotiations/:id/counter`
Solo el club destinatario. Marca la propuesta original como `rejected` y crea una nueva inversa; el schema actual no tiene `parentId/status=countered`.

---

## 12. Módulo: Retención (Etapa 12)

### Modo Vacaciones
Mientras está activo, el club del mánager usa IA para alineaciones en el tick (`POST /lineup` del motor Python con fallback local), registra decisiones en `News` y hace renovaciones básicas de bajo riesgo. No realiza compras caras.

> Estado de schema: falta campo nativo `Manager.vacationMode` y un modelo de auditoría tipo `VacationDecision`. Fallback actual: estado persistido en `Notification.data` y logs visibles en `News`.

#### `POST /api/manager/vacation`
Activa/desactiva el modo vacaciones del mánager autenticado. Si `active` se omite, alterna el estado actual.

**Body:**
```json
{ "active": true }
```

**Respuesta:**
```json
{
  "ok": true,
  "vacation": {
    "managerId": 1,
    "clubId": 1,
    "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB" },
    "active": true,
    "updatedAt": "2026-06-03T10:00:00.000Z",
    "storage": "notification-json"
  },
  "decisions": [
    {
      "id": 10,
      "type": "vacation",
      "subject": "Modo vacaciones - partido 205",
      "body": "La IA preparó la alineación de FCB. Titulares: 1, 2, 3...",
      "isRead": false,
      "recipientId": 1,
      "createdAt": "2026-06-03T10:00:00.000Z"
    }
  ]
}
```

### Misiones y Logros
Catálogo estático evaluado en el tick. Al completarse, se crea `ManagerAchievement`, se suma XP al mánager y se registra una `News` privada.

> Estado de schema: los completados persisten en `ManagerAchievement`; falta `MissionProgress` para persistir progreso parcial por misión.

#### `GET /api/missions`
Devuelve catálogo + progreso del mánager autenticado.

**Respuesta:**
```json
{
  "catalog": [
    {
      "id": "derby_win",
      "title": "Ganar un derbi",
      "description": "Vence a un rival histórico en partido oficial.",
      "target": 1,
      "rewardXp": 100,
      "category": "match",
      "progress": 1,
      "completed": true,
      "completedAt": "2026-06-03T10:00:00.000Z"
    },
    {
      "id": "unbeaten_5",
      "title": "Invicto 5 jornadas",
      "description": "Encadena cinco partidos oficiales sin perder.",
      "target": 5,
      "rewardXp": 150,
      "category": "match",
      "progress": 3,
      "completed": false,
      "completedAt": null
    }
  ],
  "storage": {
    "completed": "ManagerAchievement/MissionProgress",
    "progress": "MissionProgress",
    "resuelto": "✅ (11 jun tarde, Claude) El tick persiste el progreso de cada misión clásica en MissionProgress (evaluateManager → persistProgress; puede BAJAR, p. ej. racha rota). GET /api/missions lee el persistido y solo cae al cálculo derivado si no hay registros (storage.progress lo indica: 'MissionProgress' | 'computed-fallback')."
  }
}
```

Misiones actuales:
- `derby_win`: ganar un partido contra rival histórico (`Rivalry`).
- `unbeaten_5`: cinco partidos oficiales seguidos sin perder.
- `promotion`: progreso de ascenso calculado desde standings de liga inferior.
- `academy_debut`: fallback basado en cantera disponible; requiere schema para debut real.

### Draft
Read-layer para estado, orden y picks.

> Estado de schema: falta `Draft`/`DraftPick`; fallback actual devuelve draft inactivo y orden tentativo por clasificación inversa.

#### `GET /api/draft`
**Respuesta con fallback actual:**
```json
{
  "status": "inactive",
  "season": { "id": 1, "name": "2026/2027" },
  "currentRound": 0,
  "currentPick": 0,
  "order": [
    {
      "pickNumber": 1,
      "club": { "id": 20, "name": "Club Ejemplo", "shortName": "EJE", "badge": "⚽" },
      "competition": { "id": 1, "name": "Segunda División", "tier": 2 },
      "basis": "inverse_standings_fallback"
    }
  ],
  "picks": [],
  "needed": "// NECESITO: Draft/DraftPick para estado, orden y picks persistidos."
}
```

---

## 13. Panel Admin: Control de Turnos
Todas las rutas requieren rol `admin` o superior.

> El avance manual ejecuta el pipeline completo de tick (`processTick`). El retroceso actual restaura el reloj/estado global desde snapshot administrativo; para deshacer también partidos, finanzas, lesiones y mercado hace falta `// NECESITO: TurnSnapshot` completo.

### `GET /api/admin/turn-control`
Devuelve estado del reloj, si el tick automático está pausado y el último snapshot disponible.

```json
{
  "gameState": {
    "id": 1,
    "week": 12,
    "turn": 24,
    "phase": "regular",
    "season": "2026/2027",
    "seasonId": 1,
    "inGameDate": "2026-08-01T00:00:00.000Z",
    "nextTickAt": "2026-06-03T23:00:00.000Z",
    "isLocked": false
  },
  "paused": false,
  "lastSnapshot": {
    "id": 99,
    "date": "2026-06-03T10:00:00.000Z",
    "turn": 23,
    "week": 11,
    "inGameDate": "2026-07-29T00:00:00.000Z",
    "reason": "manual_advance"
  },
  "rollbackMode": "clock-only"
}
```

### `POST /api/admin/turn/advance`
Guarda snapshot previo y avanza un turno completo.

**Body opcional:**
```json
{ "reason": "test desde panel admin" }
```

### `POST /api/admin/turn/pause`
Pausa el tick automático. Body opcional `{ "paused": true }`.

### `POST /api/admin/turn/resume`
Reanuda el tick automático y recalcula `nextTickAt`.

### `POST /api/admin/turn/rewind`
Restaura el último snapshot, o uno concreto.
Si el mundo ya avanzó respecto al snapshot, el backend rechaza el rollback salvo confirmación explícita porque el fallback solo restaura reloj/estado global.

**Body opcional:**
```json
{ "snapshotId": 99, "forceClockOnly": true }
```

### `POST /api/admin/turn/unlock`
Desbloquea `GameState.isLocked` y deja auditoría en `AdminAction`.

**Body opcional:**
```json
{ "reason": "stale lock tras timeout local" }
```

**Respuesta:**
```json
{
  "ok": true,
  "action": "unlocked",
  "alreadyUnlocked": false,
  "adminActionId": 123,
  "gameState": { "id": 1, "isLocked": false }
}
```

### `POST /api/admin/matches/:id/resimulate`
Re-simula un partido por su semilla determinista (`matchId * 1337`) en modo auditoría: no sobreescribe marcador, standings, XP, finanzas ni estadísticas persistidas. Sirve para comprobar que un partido jugado reproduce exactamente el mismo resultado.

**Body opcional:**
```json
{ "reason": "verificación semilla F25" }
```

**Respuesta:**
```json
{
  "ok": true,
  "mode": "audit",
  "matchId": 88,
  "seed": 117656,
  "persisted": { "homeGoals": 2, "awayGoals": 1, "seed": 117656 },
  "resimulated": { "homeGoals": 2, "awayGoals": 1, "winnerClubId": 1, "penalties": null },
  "reproducesPersistedScore": true,
  "events": [],
  "adminActionId": 124,
  "uiNeed": "// NECESITO: Antigravity debe conectar AdminPage con botones sin window.confirm: unlock auditado y re-sim semilla audit-only."
}
```

---

## 13. Módulo: Subastas y Acuerdos Multijugador (Para Codex)

Nuevos modelos añadidos en la Fase 6 para soportar multijugador y subastas dinámicas.

### Subastas (`Auction` y `AuctionBid`)
Se han incluido modelos para crear listados de mercado donde múltiples mánagers pueden pujar:
- `Auction`: Define `playerId`, `sellerClubId`, `startPrice`, `status` (active/finished), y `endsAt`.
- `AuctionBid`: Define la cantidad y el `managerId` que realizó la puja.

*(Codex implementará los endpoints GET y POST correspondientes para estas operaciones utilizando estos modelos base).*

### Acuerdos Directos (`TransferAgreement`)
Soporte para negociaciones formales asíncronas entre clubes manejados por humanos o IA:
- `TransferAgreement`: Permite estados como `draft`, `proposed`, `accepted`, y `rejected`. Incluye detalles como `amount`, `type` (transfer, loan, exchange), `fromClubId` y `toClubId`.

*(Codex implementará el ciclo de vida de la negociación)*

---

## §Search
Ruta autenticada para buscador global de navbar.

### `GET /api/search?q=<texto>&limit=8`
Si `q.trim().length < 2`, devuelve arrays vacíos. `limit` es opcional, mínimo 1 y máximo 25.

**Respuesta:**
```json
{
  "players": [
    {
      "id": 10,
      "name": "Raphinha",
      "position": "DEL",
      "age": 29,
      "overall": 78,
      "clubId": 1,
      "clubName": "FC Barcelona"
    }
  ],
  "clubs": [
    {
      "id": 1,
      "name": "FC Barcelona",
      "shortName": "FCB",
      "badge": "⚽",
      "country": "España"
    }
  ],
  "managers": [
    {
      "id": 4,
      "username": "jaime",
      "name": "Jaime Torres",
      "clubId": 1,
      "clubName": "FC Barcelona"
    }
  ]
}
```

---

## §DMs
Rutas autenticadas para mensajes directos entre mánagers. El identificador público de interlocutor es `managerId`.

### `GET /api/messages/conversations`
Agrupa inbox + sent por interlocutor y ordena por último mensaje descendente.

**Respuesta:**
```json
[
  {
    "managerId": 7,
    "username": "claude",
    "clubName": "Real Madrid CF",
    "lastMessage": {
      "body": "¿Negociamos por tu delantero?",
      "createdAt": "2026-06-04T10:30:00.000Z",
      "fromMe": false
    },
    "unread": 2
  }
]
```

### `GET /api/messages/thread/:managerId?limit=50`
Devuelve el hilo ascendente entre mi usuario y ese mánager. Marca como leídos los mensajes entrantes del hilo.

**Respuesta:**
```json
[
  {
    "id": 42,
    "subject": "Mensaje directo",
    "body": "¿Negociamos por tu delantero?",
    "createdAt": "2026-06-04T10:30:00.000Z",
    "fromMe": false,
    "read": true
  }
]
```

### `POST /api/messages`
Compatible con el body antiguo `{ "toId", "subject", "body" }` y con el nuevo contrato por mánager.

**Body recomendado:**
```json
{
  "toManagerId": 7,
  "body": "Te ofrezco 8M y bonus por tu delantero."
}
```

**Respuesta:** el `PrivateMessage` creado.

---

## §AficionAnalisis
Lectura ampliada para FansPage. Rutas autenticadas.

### `GET /api/fans/analysis`
Devuelve evolución, conversión afición→taquilla, desglose de segmentos y comparativa con clubes de las competiciones actuales del club autenticado.

```json
{
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB" },
  "summary": {
    "totalFans": 55000,
    "socialMass": 55000,
    "highClassFans": 4500,
    "ticketRevenueLast6": 1200000,
    "ticketRevenuePerFan": 21.82,
    "rankInPeerGroup": 2,
    "peerClubs": 20
  },
  "segments": [
    { "id": "youngLow", "label": "Joven baja", "fans": 9000, "pct": 16, "ticketYield": "low", "risk": "disturbance" }
  ],
  "evolution": [
    { "week": 10, "season": "2026/2027", "budget": 2000000, "ticketRevenue": 180000, "income": 500000, "createdAt": "..." }
  ],
  "peerComparison": [
    { "club": { "id": 1, "shortName": "FCB" }, "fans": 55000, "socialMass": 55000, "highClass": 4500, "rank": 2 }
  ],
  "uiNeed": "// NECESITO: Antigravity debe ampliar FansPage con pirámide grande, evolución, conversión taquilla y comparativa."
}
```

## §EconomiaAnalisis
Lectura ampliada para EconomyPage. Rutas autenticadas.

### `GET /api/economy/analysis`
Devuelve evolución de valoración/presupuesto, ratio salarial, ingresos por competición, comparativa de liga y top variaciones recientes del club autenticado.

```json
{
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB" },
  "summary": {
    "valuation": 1500000,
    "budget": 12000000,
    "cash": 9000000,
    "salaryMassMonthly": 1200000,
    "salaryRatioPct": 38,
    "salaryRisk": "healthy"
  },
  "valuationHistory": [
    { "week": 10, "season": "2026/2027", "budget": 12000000, "income": 3000000, "expenses": 2100000, "createdAt": "..." }
  ],
  "competitionIncome": [],
  "leagueComparison": {
    "competition": { "id": 1, "name": "LaLiga" },
    "averages": { "budget": 9000000, "valuation": 1100000, "salaryMassMonthly": 800000 },
    "rankings": { "budget": 3, "valuation": 2, "salaryMassMonthly": 4 }
  },
  "topMonthlyVariations": [
    { "week": 12, "budgetDelta": 900000, "income": 1200000, "expenses": 300000, "label": "Subida" }
  ],
  "uiNeed": "// NECESITO: Antigravity debe añadir tab ANÁLISIS en EconomyPage con ratio salarial, comparación liga y variaciones."
}
```

## §EconomíaEuropea
Premios de competición devengados por el backend de economía. El tick llama al helper exportado desde `economyService` cuando cierra una jornada/ronda:

```ts
await economyService.settleCompetitionIncome({ matchId });
// o
await economyService.settleCompetitionIncome({ roundId: matchdayId });
```

> Estado de integración: ✅ RESUELTO (11 jun 2026, Claude). Doble cableado en el tick: (1) por partido al persistir (`persistMatchResult` → `settleCompetitionIncome({ matchId })`, ya existía) y (2) **barrido por ronda al cierre de jornada**: cuando `advanceWeek` marca una jornada de copa/europea/supercopa como `simulated`, llama `settleCompetitionIncome({ roundId: matchdayId })` — recupera cualquier partido cuyo settle por-partido fallara (el catch por partido no aborta el turno). Idempotente por clave `FinanceSnapshot.season = compincome:<matchId>:<concepto>` (+ catch P2002): repetir la llamada NUNCA devenga dos veces. El tick añade step `premios-competicion:<n>` con los devengos nuevos del turno.

### `GET /api/economy/competition-income`
Devuelve los premios y bolsas ya devengados del club autenticado. Los importes entran en `Club.budget`, `Club.cash` y quedan anotados como `FinanceSnapshot` con concepto legible.

**Respuesta:**
```json
[
  {
    "id": 501,
    "clubId": 1,
    "week": 14,
    "competition": "UCL",
    "concept": "Premio UCL J3",
    "amount": 2100000,
    "createdAt": "2026-06-04T12:00:00.000Z"
  },
  {
    "id": 502,
    "clubId": 1,
    "week": 15,
    "competition": "FA Cup",
    "concept": "Premio Copa 4ª ronda + taquilla doble",
    "amount": 550000,
    "createdAt": "2026-06-04T12:05:00.000Z"
  }
]
```

Tabla configurable en `server/src/modules/economy/competitionIncome.constants.ts`: Champions al 100%, Europa League al 50%, Conference al 25%, copas nacionales por ronda y supercopas con bolsa fija + bonus campeón.

---

## §AccionesMultipropiedad (C5)
Mercado de acciones ampliado: se pueden comprar/vender acciones de cualquier club por id, con límite anti-manipulación de 5% por usuario y club. El total por club sigue siendo 1.500 acciones.

### `GET /api/shares/portfolio`
Devuelve la cartera multipropiedad del usuario autenticado.

```json
{
  "ownerId": 9,
  "totalValue": 2500000,
  "totalInvested": 2200000,
  "unrealizedPnl": 300000,
  "maxPctPerManagerClub": 5,
  "positions": [
    {
      "club": { "id": 4, "name": "Real Sociedad", "shortName": "RSO", "badge": "⚽" },
      "shares": 45,
      "pct": 3,
      "shareValue": 56000,
      "currentValue": 2520000,
      "invested": 2200000,
      "unrealizedPnl": 320000
    }
  ],
  "uiNeed": "// NECESITO: Antigravity debe crear cartera multipropiedad con P&L y enlaces ClubLink."
}
```

### `GET /api/shares/:clubId/history?take=30`
Histórico de precios por club.

```json
{
  "clubId": 4,
  "current": { "shareValue": 56000, "totalShares": 1500 },
  "history": [
    { "shareValue": 54500, "totalAssets": 81750000, "inGameDate": "2026-07-03T00:00:00.000Z", "createdAt": "..." }
  ]
}
```

### `POST /api/shares/buy`
Body existente `{ "clubId": 4, "shares": 20 }`. Ahora valida que la posición final del usuario no supere el 5% (`75` acciones). Registra transacción y snapshot de precio.

### `POST /api/shares/sell`
Body existente `{ "clubId": 4, "shares": 20 }`. Vende contra el valor actual, registra transacción y devuelve `{ sold, proceeds, shareValue, remainingShares }`.

---

## §PrestigioManager
Prestigio 2.0 del mánager, calculado como porcentaje 0-100 a partir de logros, experiencia, patrimonio y estado de objetivos. La tabla de pesos vive en `server/src/modules/manager/prestige.constants.ts`.

### `GET /api/manager/prestige`
Recalcula y persiste el prestigio del mánager autenticado en `Manager.prestige` y `Prestige.history`.

**Respuesta:**
```json
{
  "managerId": 3,
  "name": "Jaime Torres",
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
  "value": 42,
  "max": 100,
  "breakdown": {
    "achievements": {
      "score": 28,
      "cap": 75,
      "items": [
        { "id": 10, "type": "LEAGUE_WIN", "title": "Campeón de Liga", "points": 18, "date": "2026-06-04T12:00:00.000Z" }
      ]
    },
    "experience": { "score": 8, "cap": 15, "level": 4, "xp": 1200 },
    "wealth": { "score": 1, "cap": 5, "wealth": 1200000 },
    "objective": { "score": 5, "cap": 5, "status": "Completed" }
  }
}
```

### `GET /api/manager/prestige/ranking?limit=50`
Ranking público de mánagers por prestigio persistido.

**Respuesta:**
```json
[
  {
    "rank": 1,
    "managerId": 3,
    "name": "Jaime Torres",
    "username": "jaime",
    "prestige": 42,
    "reputation": 100,
    "level": 4,
    "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" }
  }
]
```

### `GET /api/manager/public/:id`
Ficha pública para `ManagerLink` y página/modal de mánager.

```json
{
  "managerId": 3,
  "name": "Jaime Torres",
  "username": "jaime",
  "nationality": "España",
  "personality": "Normal",
  "mentality": "Normal",
  "level": 4,
  "reputation": 100,
  "prestige": 42,
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
  "record": {
    "wins": 12,
    "draws": 4,
    "losses": 3,
    "played": 19,
    "goalsFor": 38,
    "goalsAgainst": 19,
    "source": "currentClubMatches"
  },
  "achievements": [
    { "id": 10, "type": "LEAGUE_WIN", "title": "Campeón de Liga", "date": "2026-06-04T12:00:00.000Z", "points": 18 }
  ],
  "recentPrestige": [
    { "id": 44, "description": "Resultado de partido", "points": 10, "createdAt": "..." }
  ],
  "dm": { "toManagerId": 3 },
  "uiNeed": "// NECESITO: Antigravity debe usar este contrato para ManagerLink modal + pagina publica."
}
```

---

## §KitsYCarrera
Backend para KitPage real y efectos mecánicos de nodos de carrera.

### `GET /api/club/kits`
Devuelve diseños persistidos en `ClubKit` y patrocinio real de equipación (`SponsorContract` tipo `kit`).

**Respuesta:**
```json
{
  "club": { "id": 1, "name": "FC Barcelona", "shortName": "FCB", "badge": "⚽" },
  "sponsor": { "id": 12, "type": "kit", "years": 2, "percentage": 0.03, "yearlyIncome": 2400000 },
  "kits": [
    {
      "kind": "home",
      "primaryColor": "#1B5FBF",
      "secondaryColor": "#FFFFFF",
      "accentColor": "#E7C65A",
      "pattern": "classic",
      "sponsorName": "FDF Kit A",
      "persisted": true
    }
  ],
  "storage": "db-clubkit"
}
```

### `PUT /api/club/kits/design`
Alias moderno de `POST /api/club/kits/design`. Persiste una versión nueva del diseño.

```json
{
  "kind": "home",
  "primaryColor": "#1B5FBF",
  "secondaryColor": "#FFFFFF",
  "accentColor": "#E7C65A",
  "pattern": "classic",
  "sponsorName": "FDF Kit A"
}
```

### `PUT /api/club/kits/sponsor`
Alias moderno de `POST /api/club/kits/sponsor/renegotiate`. Actualiza/crea patrocinio real de equipación.

```json
{ "tier": "A", "years": 2, "sponsorName": "FDF Kit A" }
```

### Efectos de nodos de carrera
`GET /api/manager/career` incluye ahora `skillEffects`.

```json
{
  "skills": ["tac_1", "fin_1"],
  "skillEffects": {
    "moraleSpeechBonus": 0,
    "trainedPlayLimitBonus": 1,
    "commissionDiscountPct": 10,
    "notes": ["Laboratorio táctico I", "Negociador financiero I"]
  }
}
```

Efectos aplicados:
- `tac_1/tac_2/tac_3`: +1/+2/+3 al límite de jugadas entrenadas activas en `training` y `tactics`.
- `mot_1/mot_2/mot_3`: +2/+4/+6 a la moral aplicada por respuestas de prensa y ruedas de prensa.
- `fin_1/fin_2/fin_3`: −10%/−20%/−30% sobre una comisión base del 3% en compras directas por cláusula.

## §Juveniles (F4, 4 jun 2026)

Promoción de canteranos al primer equipo con negociación de contrato.

- `GET /api/academy` — estado de la academia: `{ id, level, residences, capacity, occupied, youthPlayers: [{ id, age, talent, attrs: { name, position, flag, passing, tackling, shooting, organization, unmarking, finishing, dribbling, goalkeeping } }], upgradeOptions }`.
- `POST /api/academy/promote/:id` — body OPCIONAL `{ salary?: number, years?: 1..5 }`.
  - Demanda del juvenil: `1000 + talento × 50` €/mes (la UI la replica para validar en vivo).
  - `salary < demanda` → 400 `{ error: "El juvenil rechaza la oferta: pide al menos N €/mes." }`.
  - Plantilla ≥ 30 → 400 (límite FDF).
  - Sin body → contrato por defecto (demanda, 3 años). Contrato termina el 30-jun del año `inGameDate + years`.
  - 201 → el `Player` creado (homegrown: true). El YouthPlayer se elimina de la academia.
- `DELETE /api/academy/dismiss/:id` — despedir juvenil sin coste.
- `POST /api/academy/next-player` — generación manual si hay plaza (ya existente).

## §EmblematicosEstrictos (C2, 5 jun 2026 — Claude)

Criterio ESTRICTO del manual §8.2: solo puede ser emblemático un jugador RETIRADO en el club (último club = ese club) con **≥450 partidos jugados en él**.

- **Alta automática**: el paso de retiradas del tick evalúa la elegibilidad al retirar (PlayerMatchStat×Match del club) y añade al pool (máx. 5) con notificación «Nuevo emblemático». No requiere acción del mánager.
- `GET /api/ideology/eligible-emblematics` — candidatos manuales: retirados en el club (ClubLegend) con ≥450 PJ aún fuera del pool → `[{ playerId, name, position, matchesForClub, retireYear }]`. **La UI debe poblar el selector con esto, NO con la plantilla activa.**
- `POST /api/ideology/emblematic` — ahora VALIDA el criterio estricto; jugador en activo o con <450 PJ → 400 con mensaje en español.
- `GET /api/ideology` — hace limpieza perezosa: las entradas no válidas bajo el criterio estricto (p. ej. jugadores en activo marcados con la regla laxa anterior) se eliminan automáticamente.

## §EstilosProfundidad (C3, 9 jun 2026 — Claude)

El motor diferencia ahora con fuerza los matchups de estilos 5×5 (manual §2.9): `STYLE_SCALE = 1.2` (ganar el duelo táctico ≈ ventaja de campo) y el bonus de construcción **arrastra posesión** (`STYLE_MIDFIELD_FACTOR = 0.5`). Distribuciones verificadas en `engine/tests/test_styles_depth.py`. Tabla completa de efectos y counters en `engine/README.md` (sección «Estilos de juego»).

**// NECESITO: Antigravity (UI, `src/components/tactics2/`)** — panel «¿Qué hace esto?» por palanca en Tácticas. Datos ESTÁTICOS (no hay endpoint; copiar del README o constante local):

- Por cada `offensiveStyle`: efecto en una frase + qué estilo defensivo lo CONTRARRESTA (+6 destrucción al rival) + a cuál GANA (+6 construcción propia).
  - `abrir_campo` — «Amplitud: estira al rival hacia las bandas» · lo frena `presion_bandas` · gana a `presion_centro`.
  - `pases_cortos` — «Toque interior: domina el medio si no te presionan ahí» · lo frena `presion_centro` · gana a `presion_bandas`.
  - `buscar_espalda` — «Desmarques al espacio: castiga defensas adelantadas» · lo frenan `fuera_de_juego`/`presion_mediocentro` (+4) · gana a `defensa_adelantada`.
  - `moverse_entre_lineas` — «Recibir entre líneas: rompe el fuera de juego» · lo frenan `defensa_adelantada`/`presion_mediocentro` (+4) · gana a `fuera_de_juego`.
  - `pases_largos` — «Saltarse el medio: anula la presión al pivote» · lo frenan `fuera_de_juego`/`defensa_adelantada` (+4) · gana a `presion_mediocentro`.
- Por cada `defensiveStyle`, frase y debilidad: `presion_bandas` cierra la amplitud (pero sufre el toque interior) · `presion_centro` asfixia el toque (pero regala las bandas) · `fuera_de_juego` caza desmarques (pero lo rompen entre líneas) · `defensa_adelantada` achica entre líneas (pero regala la espalda) · `presion_mediocentro` ahoga al pivote (pero sufre el pase largo).
- Regla clave a comunicar: **no elegir estilo contra un rival que sí elige regala +10** al otro.
- Palancas numéricas (ya en motor, frase sugerida): `pressing` alto recupera más pero fatiga · `tempo` alto crea más jugadas con menos precisión · `width` aporta creación leve · `mentality` ofensiva sube pegada y expone atrás · `marking=individual` defiende más al hombre con coste leve de posesión/fatiga · `marking=zonal` neutro.
- Lanzadores (A7): `penaltyTaker`, `freeKickTaker`, `cornerTaker` se resuelven por id/nombre y afectan tandas/balón parado si existen; ausentes = neutro.

## §CarrilesYCadena (C7, 9 jun 2026 — Claude)

El timeline del motor (persistido tal cual en `homeStatsJson.timeline` de cada partido) expone ahora el CARRIL de cada jugada y la ANATOMÍA completa de cada gol. Campos ADITIVOS — `null`/ausentes en partidos antiguos y en entradas sin jugada. Contrato detallado y tabla de duelos en `engine/README.md §Carril y duelos por eslabón`; tipos TS en `server/src/modules/simulation/engineClient.ts` (`EngineTimelineEntry`, `EngineChainLink`, `EngineDuelSide`).

- Toda entrada de jugada (`construccion|progresion|remate|parada|gol`) lleva `lane: "left"|"center"|"right"`. Deriva de `attackZones` y, si no hay, de formación+width. Sin refuerzo rival, NO afecta al marcador.
- Entradas de jugada llevan `duel: { att, def }`; cada lado = `{ playerId, name, position, attrs }` con los valores EXACTOS de los atributos que ponderó el motor en ese eslabón (p. ej. remate: `finishing/shooting/unmarking` vs `goalkeeping` del portero).
- La entrada `phase:"gol"` adjunta `chain: [{ step: recuperacion|regate|pase_clave|remate, lane, text, att, def }]` — la transición completa, con atacante Y defensor de cada eslabón.

**// NECESITO: Antigravity (UI, `src/components/match/`)** — visualizador «anatomía de la jugada» accesible desde el timeline del Match Center: diagrama fase a fase de `chain` con los implicados clicables (PlayerLink) y sus `attrs` visibles (el duelo que decidió el eslabón), y el carril (`lane`) reflejado en el 2D. Datos ya disponibles en el JSON del partido — no requiere endpoint nuevo.

## §BloqueQ (10 jun 2026 — Claude) · Backend del QA de Jaime (Q1-Q9 + Q12/Q15 server)

Todos los cambios son ADITIVOS. Verificado: `npx tsc --noEmit` EXIT 0 · pytest motor 105/105 (engine sin tocar). **⚠️ Requiere `--build backend` (schema nuevo: GameState.seasonWeek, IdeologyUnlock, User.lastLoginAt, Manager.avatarImage — migración `20260610210000_bloque_q_backend`).**

### Q1/Q2 · Dashboard, estado y calendario por TEMPORADA ACTIVA
- `GET /api/game/dashboard` — nextMatch/forma/standings ahora SOLO de la temporada activa (antes mezclaba 13 temporadas: causa del «Centro de mando no carga datos»). Si no hay próximo partido, standings cae a la LIGA del club. Campos nuevos: `seasonId`, `seasonWeek`. El inbox excluye `press_question`.
- `GET /api/game/state` — campo nuevo **`seasonWeek`** (jornada relativa a la temporada). **La UI debe mostrar `seasonWeek`, no `week`** (`week` es acumulada entre temporadas — la «jornada 145»). Se resetea a 1 en cada rollover.
- `GET /api/matches/calendar` — por defecto SOLO temporada activa; `?season=all` conserva el histórico. Payload añade `competitionKind` (`league|cup|champions|uel|uecl|supercup|friendly|other`).
- **// NECESITO: Antigravity** — CalendarPage/TopBar: usar `seasonWeek` y `competitionKind`; rediseño visual del calendario (Q2 front).

### Q3 · Cadena del partido por minutos + sección «Partidos»
- Diagnóstico: la persistencia del timeline es correcta en los 3 caminos (motor, lote C8, fallback TS). Lo que vio Jaime es DATOS: `stepDbCleanup` poda el timeline de partidos con >30 días in-game (tras 13 temporadas, casi todo podado) + E15 oculta el último no visto.
- `GET /api/matches/mine` **(NUEVO)** → `{ played: [], upcoming: [] }` de MI club en la temporada activa. Cada fila: payload de calendario + `competitionKind` tipada + `seen` + `timelineAvailable` + `timelinePruned` + ocultación E15 (`resultHidden`) del último no visto. Revelar: `POST /api/matches/:id/seen` (ya existía).
- `GET /api/matches/public/:id` — además de la fila cruda añade `timeline`/`replay`/`homeRatings`/`awayRatings` PARSEADOS + `timelinePruned` + `timelineAvailable` + `seed` + `archivedSummary` + `competitionKind` (antes el front recibía `homeStatsJson` como string). Respeta E15: si `resultHidden=true`, también oculta `homeStatsJson`/`awayStatsJson`, `analysis` y `archivedSummary`.
- **// NECESITO: Antigravity** — nueva sección «Partidos» sobre `/api/matches/mine` (jugados con el último oculto hasta verlo + pendientes, badges por `competitionKind`); si `timelinePruned`, usar `archivedSummary` en vez de Match Center vacío (Q27 ligado).

### Q4 · Mis ofertas enviadas: listar, cancelar y modificar
- `GET /api/market/offers-hub` **(NUEVO Y-offers)** → agregador para la bandeja de mercado:
```json
{
  "received": [
    {
      "id": 12,
      "direction": "received",
      "status": "pending",
      "amount": 3000000,
      "salary": 90000,
      "years": 3,
      "clause": 36000000,
      "player": { "id": 10, "name": "Jugador", "position": "DEL", "marketValue": 2800000, "clubId": 1 },
      "fromClub": { "id": 4, "name": "Club comprador", "shortName": "CMP", "badge": "..." },
      "toClub": { "id": 1, "name": "Mi club", "shortName": "MIC", "badge": "..." },
      "actions": {
        "canAccept": true,
        "canReject": true,
        "canCounter": true,
        "canCancel": false,
        "canEdit": false,
        "acceptEndpoint": "/api/market/offers/12/accept",
        "rejectEndpoint": "/api/market/offers/12/reject",
        "counterEndpoint": "/api/negotiations",
        "counterTemplate": { "type": "sale", "playerId": 10, "targetClubId": 4, "amount": 3300000 }
      }
    }
  ],
  "sent": [],
  "history": [],
  "counts": { "received": 1, "sent": 0, "history": 0, "pendingActions": 1 },
  "statuses": ["pending", "agent_proposed", "accepted_pending_window", "accepted", "rejected", "withdrawn", "expired"]
}
```
  - `received` y `sent` contienen estados activos (`pending`, `agent_proposed`, `accepted_pending_window`); `history` contiene resueltas. `actions` trae endpoints listos para botones. `canCounter` reutiliza `/api/negotiations` con `counterTemplate` para no crear una segunda mecánica de negociación.
- `GET /api/market/my-offers` — ahora con `?status=` opcional (`pending|accepted|accepted_pending_window|rejected|withdrawn|expired`), `player` (id/nombre/posición/valor), `toClub` (badge incluido) y flags `canCancel`/`canEdit`.
- `PATCH /api/market/offer/:id` `{ amount?, salary?, years?, clause? }` — modificar mientras esté `pending` (claim atómico). Endurecido 14 jun: acepta números o strings numéricos, recompone los términos efectivos de la oferta, valida presupuesto, tope salarial y, si cambia `salary|years|clause`, vuelve a ejecutar la evaluación multi-apartado del jugador. Si rechaza, responde `400 { error, evaluation }`; si acepta, responde `{ ok, offer, evaluation }`.
- `DELETE /api/market/offer/:id` — retirar; ahora claim atómico con error claro si ya fue resuelta.
- `GET /api/market/shortlist` — cada seguido incluye `scouting` (`assignmentId`, `analysisPoints`, `confidence`, `focus`, `reportEta`).
- `POST /api/market/shortlist/:playerId/scout` — asigna ojeador al seguido; genera informe específico del jugador en el siguiente turno (`Notification.type='scout_report'`, `data.route="/player/:id"`).
- **// NECESITO: Antigravity** — pestañas Recibidas/Enviadas/Historial sobre `offers-hub`, y desde Objetivos de Fichaje botón de asignar ojeador usando `/shortlist/:playerId/scout`.

### Q5 · Proponer traspasos (negociaciones)
- Causas raíz arregladas: el zod rechazaba con «Datos no válidos» genérico cualquier desviación (importes con decimales, `loanUntil` como fecha simple). Ahora: importes se REDONDEAN, `loanUntil` acepta `YYYY-MM-DD` o ISO, y los 400 devuelven **`Propuesta no válida (campo): motivo`**.
- Validaciones nuevas AL PROPONER (antes solo reventaban al aceptar): jugador cedido (no traspasable), club destino inexistente, negociación duplicada viva por el mismo jugador entre los mismos clubes.
- `POST /api/negotiations/:id/withdraw` **(NUEVO)** — el proponente retira su propuesta mientras siga `proposed`.
- Siguen aplicando (con mensaje claro): ventana de fichajes (ene/jul/ago) y de cesiones (jul-dic), feature flag `market`.

### Q6 · Vacantes end-to-end (2 bugs raíz)
- **Bug 1**: `applyToVacancy` con status `offer` pasaba el **ID del club como id de ManagerOffer** → «Offer not found» siempre que tu prestigio daba para el club. Ahora: acepta la ManagerOffer pendiente si existe o contrata DIRECTO (`hireManagerAtClub`, transaccional: libera club anterior, contrato, cierra mis otras candidaturas).
- **Bug 2**: el tick (`stepResolveManagerApplications`) solo resolvía candidaturas `PENDING`, pero applyToVacancy crea `SHORTLISTED` con score ≥0 → la mayoría NUNCA se resolvía. Ahora resuelve ambas, por prestigio desc (desempate determinista por id).
- `GET /api/manager/vacancies` — campo nuevo `myApplication: { status, createdAt } | null`. Candidatura idempotente (no duplica; devuelve mensaje informativo).
- **// NECESITO: Antigravity** — VacanciesPage: badge «candidatura enviada/lista corta» con `myApplication`; toast del mensaje de apply.

### Q7 · Ideología: puntos y desbloqueos REALES (manual §8.2)
- Modelo nuevo `IdeologyUnlock` (gastos persistidos por club+temporada). Nada hardcodeado: las pasivas siguen derivando de los VALORES elegidos y emblemáticos; las compradas salen de BD.
- `GET /api/ideology` — campos nuevos: `points { seasonId, total, spent, available, howToEarn }` (cada emblemático: 2 ptos/temporada si ≥450 PJ en el club, 1 si no; tope 15), `unlocks[]` (filas reales de la temporada), `catalog[]` (`key,name,cost,repeatable,description,affordable,alreadyUnlocked`), `requirements { minPrestige: 100, minConfidence: 65 }`.
- `POST /api/ideology/unlock` **(NUEVO)** `{ key }` — valida requisitos del manual (prestigio ≥100, confianza ≥65%), gasta puntos y APLICA el efecto en transacción: `training:finishPlay` (2 ptos, la jugada en desarrollo pasa a `trainable`), `scout:completeReports` (4 ptos, informes de mis ojeadores al 100%), `fans:communityBoost` (3 ptos, +300 masa social). Errores en español.
- **// NECESITO: Antigravity** — IdeologyPage: panel de puntos + catálogo con coste/CTA, estados `affordable/alreadyUnlocked`.

### Q8 · Acciones: solo comprar del club propio
- `POST /api/shares/buy` — regla de servidor: si el club no es el que diriges → 400 «Solo puedes comprar acciones del club que diriges. Las acciones de otros clubes solo se pueden vender.». `POST /api/shares/sell` intacto.

### Q9 · Actualidad sin preguntas de prensa
- Las `News` legacy con `type='press_question'` (ya no se generan) quedan EXCLUIDAS de `GET /api/news` (inbox), `GET /api/game/inbox` y el inbox del dashboard. Las ruedas de prensa viven SOLO en `GET /api/press/pending` + `POST /api/press/answer` (que sigue leyendo las legacy).

### Q12 (server) · Tácticas
- Límite **máximo 5 tácticas guardadas** por mánager (`POST /api/tactics` → 400 «Máximo 5 tácticas guardadas: borra o sobrescribe una para crear otra.»).
- `GET /api/tactics/auto-lineup?formation=4-4-2` **(NUEVO)** — XI óptimo determinista de MI plantilla para esa formación (soporta 2-4 líneas, p. ej. `4-2-3-1`; deben sumar 10 de campo). Respuesta: `{ formation, lines {def,mid,fwd}, xi: [{ playerId, name, squadNumber, naturalPosition, assignedLine POR|DEF|MED|DEL, slotIndex, outOfPosition }], bench: [...] }`. Excluye lesionados/sancionados (si no llega a 11, usa toda la plantilla). No persiste nada.
- **// NECESITO: Antigravity** — botón «Autocolocar» en Tácticas al seleccionar formación (Q12 front: drag fluido, vistas, etc.).

### Q15 (server) · Economía
- `GET /api/economy/forecast?horizon=30d|90d|6m|1y` — mapea a 1/3/6/12 meses (el `?months=` legado sigue); respuesta añade `horizon`. Desglose mensual por categoría ya incluido (`months[].gate/commercial/salaries/outsourcing/net` + `annual`).
- `GET /api/economy/cash-history?take=52` **(NUEVO)** — serie cronológica de FinanceSnapshot: `{ clubId, points: [{ week, season, budget, income, expenses, net, breakdown { ticketRevenue, tvRevenue, transferIncome, sponsorRevenue, salaryExpenses, staffExpenses, facilityExpenses }, createdAt }] }`.
- **// NECESITO: Antigravity** — EconomyPage: filtros 30d/90d/6m/1y sobre forecast + gráfico de caja con cash-history.

## §BloqueQ (11 jun 2026 — Claude) · Q22 + Q25 + quick wins QW (Partes 4-5 del ESCALADO)

_Contratos publicados ANTES de implementar (contract-first). Estado de cada uno al final de la línea: ✅ implementado · 🛠️ en curso. Todo ADITIVO._

### Q22 · Avatar subible ✅
- `POST /api/account/avatar` (auth) — body JSON `{ "image": "data:image/png;base64,...." }` (dataURL completo o base64 crudo + `"mime"` opcional). Validación REAL por magic bytes (no se fía del mime declarado): solo `image/jpeg`, `image/png`, `image/webp`; tamaño decodificado ≤ **512KB**. Sin lib de resize en el server: se valida y guarda tal cual (el front debería recortar/encoger antes de subir). Respuesta: `{ "ok": true, "mime": "image/png", "size": 48211, "avatarUrl": "/api/public/avatar/7?v=1718100000" }`.
  - Errores 400 por campo: `Avatar no válido (image): falta la imagen` · `Avatar no válido (image): base64 corrupto` · `Avatar no válido (mime): formato no soportado, usa JPEG, PNG o WebP` · `Avatar no válido (image): la imagen supera el máximo de 512KB (tiene NNN KB)` · `Avatar no válido (image): el contenido no coincide con un JPEG/PNG/WebP real`.
- `DELETE /api/account/avatar` (auth) — borra la imagen y vuelve al avatar procedural. Respuesta: `{ "ok": true, "avatar": "procedural", "avatarSeed": "seed-…" }`.
- `GET /api/public/avatar/:managerId` — **público, sin auth, SIEMPRE devuelve una imagen** (apto para `<img src>`): la subida (binario con su `Content-Type`) o, si no hay, un **SVG procedural determinista** generado del `avatarSeed`/nombre (iniciales + colores por hash). `Cache-Control: public, max-age=300`. Tras subir/borrar, el front debe añadir `?v=<timestamp>` (el POST ya devuelve `avatarUrl` con `v`). 404 solo si el mánager no existe.

### Q25 · Modo espectador + login ✅
- `POST /api/auth/login` — ahora persiste `User.lastLoginAt` en cada login correcto (base de `stats.activeManagers` y de QW-29).
- Endpoints **públicos sin auth** bajo `/api/public/` (rate-limit suave 30 req/min/IP; CERO datos sensibles: ni emails, ni economía de clubes, ni resultados que un humano implicado aún no haya visto):
- `GET /api/public/next-tick` → `{ "nextTickAt": "2026-06-11T23:00:00.000Z", "serverTime": "...", "secondsRemaining": 13327, "turnHours": [11, 23] }`. Para el countdown de la landing/login.
- `GET /api/public/stats` → `{ "activeManagers": 4, "humanClubs": 5, "totalClubs": 140, "budgetByLeagueQuartile": [...], "season": { "id": 13, "name": "2038-39", "seasonWeek": 7 } }`. `activeManagers` = users con `lastLoginAt` < 7 días.
  - **QA2 ✅** `budgetByLeagueQuartile`: `[{ "quartile": "Q1", "label": "Modestas", "tierLabel": "Modestas", "avgBudget": 480000, "leagueCount": 12, "clubCount": 240 }, …]` (4 entradas Q1→Q4; **Q1 = ligas más modestas, Q4 = élite**). Se ordenan las ligas (`type='league'` de la temporada activa) por presupuesto medio de club y se parten en 4 cuartiles contiguos; `avgBudget` = presupuesto medio de club (€, entero) entre TODOS los clubes de las ligas de ese cuartil. `[]` si no hay temporada/datos; cuartiles vacíos se omiten. Solo agregados (cero datos sensibles por club). El front `GlobalEconomicDistribution` pinta una barra por entrada usando `label` + `avgBudget`.
- `GET /api/public/standings?league=` — sin `league`: `{ "leagues": [{ "id", "name", "shortName", "country", "tier" }] }` (ligas de la temporada ACTIVA). Con `league=<competitionId>`: `{ "league": {...}, "table": [{ "pos", "club": { "id", "name", "shortName", "badge" }, "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "goalDiff", "points" }] }`. Read-only; 404 si la liga no es de la temporada activa.
- `GET /api/public/matches/featured` → `{ "upcoming": [...], "recent": [...] }` (máx. 6 por lista). Selección por **interés por reglas**: clubes humanos implicados > derbi (`Rivalry`) > duelo de arriba (ambos top-5) > tier de la liga. Cada fila: `{ "id", "homeClub"/"awayClub" (id/shortName/badge), "competition", "competitionKind", "matchdayNum", "playedAt", "homeGoals", "awayGoals", "resultHidden", "interest": ["humano","derbi","cabeza"] }`. Si algún mánager humano implicado aún NO vio su resultado → `resultHidden: true` y goles `null` (E15 respetado también en público).

### QW-29 · «Mientras no estabas» ✅
- `GET /api/dashboard/while-away?since=` (auth) — prefijo `/api/dashboard` nuevo. **Importante**: el login PISA `lastLoginAt`, así que `POST /api/auth/login` ahora devuelve campo aditivo **`previousLoginAt`** — el front debe pasarlo como `?since=` (ISO). Sin `?since=`: usa `lastLoginAt` si tiene >30 min; si no (login recién hecho), últimas 72h. Respuesta por SECCIONES para pintar directo:
```json
{
  "since": "2026-06-09T08:11:00.000Z",
  "sections": {
    "myMatches": [{ "id": 1, "rival": {"id":2,"shortName":"RMA","badge":"⚪"}, "home": true, "homeGoals": null, "awayGoals": null, "resultHidden": true, "competitionKind": "league", "playedAt": "..." }],
    "rivalWatch": [{ "matchId": 9, "rival": {"id":3,"shortName":"ATM"}, "score": "2-1", "result": "won" }],
    "offers": { "received": [{ "id": 4, "player": "...", "fromClub": "...", "amount": 3000000, "status": "pending" }], "resolved": [{ "id": 2, "player": "...", "status": "accepted" }] },
    "standings": { "position": 4, "previousPosition": 6, "delta": 2, "league": "Primera División" },
    "academy": [{ "name": "...", "age": 17, "note": "listo para promocionar" }],
    "health": { "injuries": [{ "player": "...", "until": "..." }], "suspensions": [{ "player": "...", "matches": 1 }] },
    "news": [{ "id": 1, "type": "board", "subject": "...", "createdAt": "..." }]
  }
}
```
- `rivalWatch` usa el rival de QW-7 si existe. Secciones vacías = arrays vacíos (nunca null).

### QW-9 · «El DD recomienda» ✅
- `GET /api/club/advisor` (auth) → `{ "recommendations": [{ "key": "depth_DEF", "severity": "high"|"medium"|"low", "title": "...", "detail": "...", "cta": { "label": "Ir al mercado", "route": "/market" } }] }`.
- Reglas (documentadas, deterministas): profundidad por demarcación vs ideal (POR≥2, DEF≥6, MED≥6, DEL≥4) · contratos que vencen ≤1 temporada (agrupa, severity high si titular) · masa salarial anual > 70% del presupuesto (high si >90%) · titulares con fitness < 70 · juveniles promocionables (edad ≥17 y potencial ≥75) · ofertas recibidas sin responder. Orden: severity desc.

### QW-7 · Rival de la semana ✅
- `GET /api/club/rival-week` (auth) → `{ "rival": { "id", "name", "shortName", "badge" }, "reasons": ["points","cup_elimination","transfer_sniper","head_to_head"], "pointsGap": 2, "myPosition": 4, "rivalPosition": 3, "headToHead": { "played": 6, "wins": 2, "draws": 1, "losses": 3, "lastMatch": { "id", "score", "result", "playedAt" } }, "nextMeeting": { "matchId", "playedAt", "home": true } | null, "tagline": "Os separan 2 puntos. La afición pide revancha." }` · `{ "rival": null }` si no hay candidato.
- Detección por reglas (prioridad): rival directo ≤3 puntos en la tabla → quien me eliminó de copa esta temporada → quien me quitó un fichaje (TransferOffer mía rejected y jugador traspasado a ese club) → derbi histórico (`Rivalry`). Reaprovecha la lógica de `/api/memory/head-to-head`.
- **X6 formal (14 jun, Codex):** `reasons[]` puede añadir `city`, `finals`, `frequency`, `human_duel`. El payload añade `formalRivalry` y `prestigeMultiplier`:

```json
{
  "formalRivalry": {
    "name": "Derbi de Madrid",
    "intensity": 86,
    "prestigeMultiplier": 1.17,
    "rival": { "id": 2, "name": "Atlético de Madrid", "shortName": "ATM", "badge": "..." },
    "reasons": ["city", "frequency", "human_duel"],
    "metrics": { "sameCity": true, "played": 8, "finals": 1, "bothHuman": true, "historicIntensity": null },
    "headToHead": { "played": 8, "wins": 3, "draws": 2, "losses": 3 },
    "nextMeeting": { "matchId": 91, "playedAt": "...", "home": true }
  },
  "prestigeMultiplier": 1.17
}
```

- `GET /api/public/manager/:id` añade `rivalry` con el mismo contrato de `formalRivalry` para pintar rival en ficha de mánager ajeno sin auth de club propio.

### QW-6/14/15 · Jugadores con alma ✅
- En payloads EXISTENTES de jugador (squad `GET /api/players` y ficha `GET /api/players/:id`) se añaden campos ADITIVOS derivados (cero schema):
  - `tags: string[]` — reglas: **Promesa** (edad ≤21 y potencial ≥78) · **Veterano** (edad ≥32) · **Matador** (DEL/finishing ≥80) · **Cerebro** (organization ≥80 y passing ≥75) · **Muralla** (POR goalkeeping ≥80, o DEF tackling ≥80) · **Líder** (moral ≥85 y experiencia ≥60 y edad ≥27) · **Canterano** (homegrown) · **Eléctrico** (dribbling ≥80 y unmarking ≥75) · **Incombustible** (consistency ≥75 y injuryProneness ≤35) · **De cristal** (injuryProneness ≥75).
  - `bioSummary: string` — mini-historia por plantillas en español: año de llegada (createdAt/lastTransferAt), partidos y goles de la temporada (PlayerSeasonStat), rol actual (titular/rotación/promesa) y vínculo (canterano/fichaje).
  - `legendStatus: { "level": "util"|"titular"|"idolo"|"leyenda", "label": "Ídolo", "progress": 62 }` — progreso 0-100 por puntos: partidos en el club, goles, temporadas, títulos (Honour), canterano (+10). Umbrales: útil <25, titular 25-54, ídolo 55-84, leyenda ≥85.

### QW-8 · Rumorómetro ✅
- `GET /api/market/rumors` (auth) → `{ "rumors": [{ "id": "r-…", "icon": "🔥"|"👀"|"💰"|"🧊", "headline": "...", "player": { "id", "name", "position" } | null, "club": { "id", "shortName" } | null, "kind": "transferible"|"oferta"|"interes"|"contrato"|"ruido" }] }` (máx. 20, mezcla determinista por semana).
- Señales reales: transferibles de clubes humanos (🔥), ofertas activas (💰), clubes ricos vs posiciones débiles (👀), contratos que vencen (🧊). Mezcladas con ruido plausible generado por plantillas. Hay un campo interno `confidence` 0-1 que el front **NO debe mostrar en crudo** (solo si algún día se quiere ordenar).

### X7 · Deadline Day backend (14 jun, Codex)
- `GET /api/market/deadline-day` (auth) → agregador para las últimas 24 h de ventana. Deriva todo de datos reales: `TransferOffer`, `Auction`, rumorómetro y `GameState.inGameDate`. No crea una mecánica paralela.

```json
{
  "status": {
    "active": true,
    "phase": "deadline_day",
    "closesAt": "2024-08-31T23:59:59.000Z",
    "hoursRemaining": 4.5,
    "panicIndex": 82
  },
  "ticker": [
    {
      "id": "dd-auction-12",
      "kind": "auction",
      "urgency": "panic",
      "text": "Subasta caliente: Roig termina pronto (12M).",
      "route": "/auction/12",
      "ts": "2026-06-14T10:00:00.000Z",
      "meta": { "auctionId": 12, "playerId": 9, "endsAt": "..." }
    }
  ],
  "expiringAuctions": [
    {
      "id": 12,
      "endsAt": "...",
      "currentBid": 12000000,
      "winningClubId": 4,
      "sellerClub": { "id": 1, "shortName": "FCB", "badge": "..." },
      "player": { "id": 9, "name": "Roig", "position": "DEL", "marketValue": 10000000 },
      "ws": "/ws/auction/12"
    }
  ],
  "ws": { "market": "/ws/chat/market", "club": "/ws/club/1" }
}
```

- `phase`: `closed|window_open|deadline_day`; `active=true` si la ventana está abierta y quedan ≤24 h in-game.
- `ticker.kind`: `system|transfer|offer|rumor|auction`; `urgency`: `low|medium|high|panic`.
- Tiempo real: reutilizar `/ws/auction/:id` por subasta y `/ws/chat/market` como sala viva; polling fallback = repetir este endpoint.

### X8 · Gol de la semana backend (14 jun, Codex)
- `GET /api/social/goal-of-week?weekKey=s1-w7` (auth, `weekKey` opcional) → top 5 goles candidatos de la semana activa. Deriva de `homeStatsJson.timeline`/`replay`, exige `phase:"gol"` y respeta E15: si algún humano implicado no vio su resultado, ese partido no entra.

```json
{
  "weekKey": "s1-w7",
  "votingOpen": true,
  "myVote": "m42:78:9:3",
  "candidates": [
    {
      "goalKey": "m42:78:9:3",
      "matchId": 42,
      "minute": 78,
      "team": "home",
      "text": "Gran remate de Roig",
      "scorer": { "playerId": 9, "name": "Roig" },
      "lane": "left",
      "chain": [{ "step": "recuperacion", "lane": "left", "text": "...", "att": {}, "def": {} }],
      "duel": { "att": {}, "def": {} },
      "replay": [{ "minute": 78, "phase": "gol", "team": "home", "text": "..." }],
      "match": {
        "homeClub": { "id": 1, "shortName": "FCB", "badge": "..." },
        "awayClub": { "id": 2, "shortName": "RMA", "badge": "..." },
        "homeGoals": 2,
        "awayGoals": 1,
        "competition": { "id": 5, "name": "Primera División", "shortName": "LaLiga" }
      },
      "votes": 7,
      "votedByMe": true
    }
  ]
}
```

- `POST /api/social/goal-of-week/vote` body `{ "goalKey": "m42:78:9:3", "weekKey": "s1-w7" }` (`weekKey` opcional) → upsert de voto por `weekKey+managerId`; responde el payload actualizado. Emite `goal_of_week:vote` por `/ws/chat/social`.
- Persistencia: tabla `GoalOfWeekVote` (migración `20260614190000_x8_goal_of_week_votes`), unique por `weekKey+managerId`.

### QW-20 · Misiones semanales ✅
- Modelo nuevo **`WeeklyMission`** (`managerId, type, target, progress, status pending|claimed|expired, rewardXp, rewardPrestige, weekKey, seasonId, baseline`) — migración `20260611100000_weekly_missions`. No hay estado `completed` separado: el claim es automático en el tick (pending → claimed). `baseline` es interno (contexto de generación).
- Generación EN EL TICK al cambiar de semana in-game: 3 misiones/semana por mánager humano con club, elegidas por reglas de entre: `clean_sheet` (portería a cero), `academy_minutes` (minutos/uso de canterano), `renew_contract` (renovar a alguien), `sign_u23` (fichar sub-23), `beat_direct_rival` (ganar al rival directo), `win_next` (ganar el próximo partido). Evaluación automática al cerrar la jornada en el mismo tick; recompensa SOLO prestigio/XP (cero dinero, cero P2W), claim automático (status `claimed` + News).
- `GET /api/missions` — la respuesta EXISTENTE añade campo aditivo `weekly: { "weekKey": "s13-w7", "missions": [{ "id", "type", "title", "description", "target", "progress", "status", "reward": { "xp": 60, "prestige": 1 } }] }`.

### Punto 0 · Soporte al Día de partido (Q3+Q27/V4-3) ✅ — previa + post-partido
- `GET /api/matches/:id/preview` **(NUEVO, auth)** — la PREVIA cinematográfica completa en una llamada. Funciona para partidos programados y jugados; NO incluye el resultado del propio partido (cero conflicto con E15). Respuesta:
```json
{
  "matchId": 105, "status": "scheduled", "playedAt": "...",
  "competition": { "id", "name", "shortName", "type", "tier" }, "matchdayNum": 7,
  "homeClub": { "id", "name", "shortName", "badge" }, "awayClub": { ... },
  "venue": { "stadiumName": "...", "capacity": 20000, "fans": 50000, "weatherCondition": "...", "temperature": 21 },
  "form": { "home": [{ "matchId", "result": "W|D|L", "score": "2-1", "rivalShortName", "home": true }], "away": [...] },
  "headToHead": { "played": 6, "homeWins": 2, "awayWins": 3, "draws": 1, "lastMatch": { ... } },
  "keyPlayers": { "home": { "playerId", "name", "position", "avgRating": 7.4, "goals": 9, "basis": "rating|value" }, "away": { ... } },
  "positions": { "home": 4, "away": 3, "sameLeague": true, "pointsGap": 2 },
  "rivalry": { "name": "El Clásico", "intensity": 90 } ,
  "tacticalDuel": { "home": { "formation", "offensiveStyle", "defensiveStyle" }, "away": { ... } },
  "tagline": "Solo 2 puntos separan a estos dos equipos."
}
```
  - `keyPlayers.basis`: `rating` = mejor media de la temporada activa (≥3 PJ); `value` = fallback por valor de mercado. `tacticalDuel` con nulls si el partido aún no tiene táctica asignada. `rivalry: null` si no hay derbi.
- `GET /api/matches/public/:id` — campo ADITIVO **`analysis`** (solo `status=played` y derivado del timeline ya expuesto; `null` si no hay datos):
```json
"analysis": {
  "mvp": { "playerId": 10, "name": "...", "rating": 8.7, "goals": 2, "team": "home" },
  "momentum": [{ "from": 0, "to": 15, "home": 6.5, "away": 2, "balance": 53 }],
  "bestPlays": [{ "minute": 34, "team": "home", "kind": "gol|parada|ocasion", "text": "..." }],
  "clearChances": { "home": 7, "away": 3 },
  "source": "timeline|ratings-only"
}
```
  - `momentum.balance`: −100 (dominio visitante) … +100 (dominio local), por tramos de 15' (incluye prórroga si la hubo). `bestPlays` máx. 6, goles siempre incluidos, orden cronológico. Maneja los DOS formatos de timeline (motor Python y fallback TS).
- **Ampliación (11 jun tarde, mejoras proactivas del punto 0)** — campos ADITIVOS dentro de `analysis` (todos pueden ser `null`/`[]` si faltan datos):
```json
"xg": { "home": 1.85, "away": 0.62, "source": "ratings|timeline" },
"keyDuels": [{ "minute": 67, "team": "home", "kind": "gol", "text": "...", "att": { "playerId": 10, "name": "...", "position": "DEL", "attrs": { "finishing": 82.5 } }, "def": { "playerId": 31, "name": "...", "position": "POR", "attrs": { "goalkeeping": 81 } }, "gap": 1.5 }],
"narrative": [{ "from": 0, "to": 15, "balance": 53, "text": "Del 0' al 15', dominio claro del Real FDF. Cayó 1 gol en este tramo." }]
```
  - `xg`: con `source='ratings'` es el xG REAL del motor (suma del campo `xg` por jugador que el motor ya acumula remate a remate); `source='timeline'` es el fallback heurístico por tipo de remate (gol 0.40 · parada 0.25 · fuera 0.12) y carril (centro ×1.25, banda ×0.85).
  - `keyDuels`: los 3 duelos `duel` del timeline más decisivos e igualados (prioridad por fase gol > parada > resto; desempate por menor diferencia entre medias de atributos `gap`). `att`/`def` traen los atributos EXACTOS que ponderó el motor en ese eslabón (clicables → PlayerLink).
  - `narrative`: 1 frase en español por tramo de momentum (estilo crónica radiofónica), con los goles del tramo mencionados. Mismos buckets que `momentum` (mismo `from`/`to`/`balance`).
- **Ampliación (14 jun, Y7 Codex)** — `GET /api/matches/public/:id` y `GET /api/matches/:id` añaden **`archivedSummary`** (ADITIVO, `null` si el partido no está jugado o si E15 lo oculta):
```json
"archivedSummary": {
  "source": "timeline|seed-regenerable|score-only",
  "timelinePruned": true,
  "timelineAvailable": false,
  "timelineEntryCount": 0,
  "seed": 140385,
  "canRegenerateFromSeed": true,
  "score": { "home": 2, "away": 1 },
  "motm": "Jugador FDF",
  "bestPlays": [],
  "xg": null,
  "keyDuels": [],
  "narrative": [],
  "reason": "timeline_podado_seed_preservada"
}
```
  - `source='timeline'`: hay replay/analysis real y cada gol/parada se explica desde la cadena real del motor (`timeline[].lane|zone|duel|chain`).
  - `source='seed-regenerable'`: el timeline fue podado por limpieza, pero se conserva `seed` y el partido no es tier C; puede regenerarse por semilla en una herramienta futura sin inventar jugadas.
  - `source='score-only'`: no hay timeline usable ni regeneración fiable; pintar resumen de marcador/metadata.
- **// NECESITO: Antigravity** — Día de partido (Q3+Q27): acto (a) previa sobre `/api/matches/:id/preview` (escudos, estadio+clima+aforo de `venue`, forma con bolitas W/D/L, duelo de `keyPlayers`, `tagline` como titular); acto (c) post-partido sobre `analysis` (MVP, gráfico de `momentum.balance`, `bestPlays` clicables hacia el timeline, `clearChances` como stat comparada).

### Punto 1 (tarde) · Premios de competición cableados al tick ✅
- Sin endpoint nuevo. `advanceWeek` llama `economyService.settleCompetitionIncome({ roundId: matchdayId })` al cerrar cada jornada de copa/europea/supercopa (además del settle por-partido ya existente en `persistMatchResult`). Idempotente (clave única `compincome:<matchId>:<concepto>` en `FinanceSnapshot.season` + P2002). Step nuevo del tick: `premios-competicion:<n>`. Visible en `GET /api/economy/competition-income` (contrato existente en §EconomíaEuropea, sin cambios).

### QW-10 · Luces de la Ciudad / menú vivo ✅
- `GET /api/dashboard/zone-badges` (auth) — novedades por ZONA del juego para encender luces en la Ciudad FDF y badges en el menú. Acepta `?since=ISO` (mismo criterio que while-away: el front pasa `previousLoginAt` del login; sin parámetro usa `lastLoginAt` si tiene >30 min, si no las últimas 72h). Respuesta:
```json
{
  "since": "2026-06-09T08:11:00.000Z",
  "zones": {
    "market":   { "count": 3, "reasons": ["3 ofertas por responder"] },
    "squad":    { "count": 2, "reasons": ["1 lesión nueva", "1 sanción nueva"] },
    "academy":  { "count": 1, "reasons": ["1 juvenil listo para subir"] },
    "stadium":  { "count": 1, "reasons": ["Obra terminada: gradas", "1 obra termina este mes"] },
    "press":    { "count": 4, "reasons": ["1 rueda de prensa sin responder", "3 noticias sin leer"] },
    "missions": { "count": 3, "reasons": ["3 misiones semanales en juego"] },
    "economy":  { "count": 2, "reasons": ["2 premios de competición cobrados"] },
    "chat":     { "count": 5, "reasons": ["5 mensajes sin leer"] }
  }
}
```
- Reglas por zona (deterministas, derivadas de datos existentes): **market** ofertas recibidas `pending` · **squad** lesiones (`weeksLeft>0`) y sanciones creadas desde `since` · **academy** juveniles promocionables (edad ≥17 y potencial ≥75, mismo criterio que el advisor — helper compartido `getPromotableYouth`) · **stadium** News de obra terminada desde `since` (el tick AHORA crea una News `type='stadium'` al completar cada obra — aditivo) + obras con `monthsRemaining ≤ 1` ("termina este mes") · **press** `PressQuestion` sin `answeredAt` + News sin leer (excluye `press_question` legacy) · **missions** `WeeklyMission` `pending` de la semana · **economy** premios de competición (`FinanceSnapshot` `compincome:*`) devengados desde `since` · **chat** `PrivateMessage` recibidos sin leer.
- `count` = nº de novedades de la zona (la luz se enciende si >0); `reasons` = textos cortos en español listos para tooltip. Zonas sin novedad: `{ "count": 0, "reasons": [] }` (nunca null).

### QW-1 · Ticker «Última hora FDF» ✅
- `GET /api/public/ticker` — **público sin auth** (mismo módulo public, rate-limit suave 30 req/min/IP). 10-15 items cortos del MUNDO para el ticker de la Ciudad y la landing. Respuesta:
```json
{
  "items": [
    { "id": "tk-transfer-412", "icon": "✍️", "text": "FICHAJE: el RMA cierra la llegada de Pavón procedente del BAR (~12M).", "route": "/player/88" },
    { "id": "tk-result-105", "icon": "⚽", "text": "RMA 2-1 BAR (Primera División, J7).", "route": "/matches/105" },
    { "id": "tk-leader-3", "icon": "👑", "text": "El ATM es el nuevo líder de Primera División.", "route": "/league" },
    { "id": "tk-record-77", "icon": "📜", "text": "Récord: mayor goleada histórica del SEV.", "route": "/awards" },
    { "id": "tk-rumor-r-sale-9", "icon": "🗞️", "text": "Rumor del día: BOMBAZO, el VAL pone a Roig en el escaparate.", "route": "/market" }
  ]
}
```
- Fuentes (por reglas, todas deterministas): **fichajes cerrados** recientes (TransferOffer `accepted`/`accepted_pending_window`, importe redondeado ~XM) · **resultados destacados** (reusa el scoring de `matches/featured`; respeta E15: nunca muestra un resultado oculto) · **récords nuevos** (ClubRecord/PlayerRecord recientes con descripción) · **cambio de líder** en ligas tier 1 (líder actual vs líder REBOBINANDO la última jornada simulada) · **rumor del día** (top `confidence` del rumorómetro QW-8, SIN exponer confidence).
- **Determinista entre ticks:** orden fijo por categoría y recencia (ids descendentes), cero aleatoriedad fuera del rumorómetro (que ya es determinista por semana). Mismos datos ⇒ misma respuesta byte a byte. `route` opcional (puede faltar). Máx. 15 items; si el mundo está recién sembrado puede devolver menos.

### QW-30 · Checklist «Preparar el próximo turno» ✅
- `GET /api/dashboard/turn-checklist` (auth) — tareas urgentes ANTES del próximo tick, por reglas. Respuesta:
```json
{
  "nextTickAt": "2026-06-11T23:00:00.000Z",
  "items": [
    { "key": "lineup_unavailable", "urgent": true, "title": "Tienes 2 titulares que no pueden jugar", "detail": "García (lesión) y López (sanción) están entre tus titulares. Ajusta el once.", "cta": { "label": "Ajustar alineación", "route": "/squad" } },
    { "key": "lineup_incomplete", "urgent": true, "title": "Once incompleto", "detail": "Solo tienes 9 titulares marcados. El tick alineará suplentes automáticamente.", "cta": { "label": "Completar el once", "route": "/squad" } },
    { "key": "tactic_missing", "urgent": true, "title": "Próximo partido sin táctica", "detail": "No tienes táctica por defecto: el partido contra el RMA se jugará con la táctica estándar.", "cta": { "label": "Preparar táctica", "route": "/tactics" } },
    { "key": "offers_pending", "urgent": false, "title": "3 ofertas sin responder", "detail": "Hay clubes esperando respuesta por jugadores tuyos. Si no contestas, caducarán.", "cta": { "label": "Ver ofertas", "route": "/market" } },
    { "key": "renewals_critical", "urgent": true, "title": "2 contratos a punto de vencer", "detail": "García, Pérez terminan contrato en menos de una temporada (hay titulares entre ellos).", "cta": { "label": "Revisar plantilla", "route": "/squad" } },
    { "key": "weekly_missions", "urgent": true, "title": "2 misiones semanales sin completar", "detail": "La semana se cierra en el próximo turno. Última oportunidad.", "cta": { "label": "Ver misiones", "route": "/missions" } },
    { "key": "press_pending", "urgent": false, "title": "1 rueda de prensa pendiente", "detail": "La prensa espera tus declaraciones.", "cta": { "label": "Responder", "route": "/press" } }
  ]
}
```
- Reglas (orden fijo de la lista de arriba; cada item solo aparece si aplica): **lineup_unavailable** titulares con lesión activa (`weeksLeft>0`) o sanción pendiente (`matches>0`) · **lineup_incomplete** menos de 11 titulares marcados · **tactic_missing** hay próximo partido programado y el mánager NO tiene táctica por defecto (`Tactic.isDefault`) · **offers_pending** y **renewals_critical** REUSAN el advisor QW-9 (misma detección y textos; `urgent = severity high`) · **weekly_missions** misiones `pending`; `urgent` si además la semana está a punto de cerrar (la fecha in-game es viernes → el próximo turno simula la jornada de liga del domingo) · **press_pending** `PressQuestion` sin responder.
- `urgent` ordena el panel (urgentes primero, ya viene ordenado). `items: []` si no hay nada que preparar. `nextTickAt` = mismo valor que `/api/public/next-tick`.

### QW-4 · Humor de la afición (server-side, fuente única de verdad) ✅
- `GET /api/fans/mood` (auth, club del mánager — endpoint nuevo ADITIVO en el módulo fans). **Cualquier reacción de afición que pinte el front (bar/grada de la Ciudad, FansPage, semáforos 🟢🟡🔴) debe salir de AQUÍ: el front NO duplica reglas.** Respuesta:
```json
{
  "mood": "green",
  "score": 72,
  "reasons": ["3 victorias seguidas", "2 puestos por encima de lo esperado", "El fichaje de Pavón ilusiona a la grada"]
}
```
- Cálculo determinista (documentado para que el front pueda explicar el semáforo, no recalcularlo): base 50 · **forma reciente** últimos 5 jugados (+6 victoria, +1 empate, −6 derrota) · **posición vs expectativa** (posición esperada = ranking de reputación entre los clubes de mi liga; ±3 por puesto de diferencia, tope ±15) · **eliminación** de copa/europea esta temporada (derrota en eliminatoria): −10 · **fichaje sonado** reciente (compra aceptada ≥1M en los últimos 7 días reales): +8. Score acotado 0-100. `mood`: `green` ≥65 · `yellow` 40-64 · `red` <40.
- `reasons` en español, máx. 4, ordenadas por impacto: rachas ("3 victorias seguidas"/"2 derrotas seguidas"), sobre/bajo-rendimiento vs expectativa, "Eliminados de la copa", fichaje que ilusiona. Sin datos (mundo recién sembrado): `{ mood: "yellow", score: 50, reasons: [] }`.

### ⚠️ Runtime
- Todo lo anterior requiere **`--build backend`** en el Mac (incluida la migración de `WeeklyMission`). Acumulado con la migración `20260610210000` anterior si aún no se aplicó.
- **Tanda de la TARDE del 11 jun (Claude) — va en el MISMO rebuild:** premios de competición en el tick (`premios-competicion:<n>` en steps) · `GET /api/dashboard/zone-badges` · `GET /api/public/ticker` · `GET /api/dashboard/turn-checklist` · `GET /api/fans/mood` · News de obra terminada · MissionProgress persistido · campos `xg`/`keyDuels`/`narrative` en `analysis`. **CERO migraciones nuevas** (MissionProgress ya estaba migrado desde `20260604153653`): basta el `--build backend` ya pendiente de la mañana.

## §BloqueQ (11 jun 2026 — Codex) · Bloque W narrativo backend (W1-W5)

Contratos ADITIVOS, sin migraciones. Fuente única server-side: el front pinta, no recalcula.

### W1 · Portada deportiva diaria ✅
- `GET /api/dashboard/daily-cover` (auth) — portada determinista por turno para FDF Today. Respuesta:
```json
{
  "turn": 42,
  "inGameDate": "2026-06-14T00:00:00.000Z",
  "headline": "La Liga despierta con el RMA golpeando primero",
  "hero": { "playerId": 10, "name": "Pavón", "club": { "id": 1, "shortName": "RMA", "badge": "⚽" }, "rating": 8.9, "summary": "MVP de la jornada con 2 goles" },
  "moment": { "matchId": 105, "minute": 88, "kind": "late_goal", "title": "Gol tardío en el 88'", "text": "Pavón decidió el partido al final.", "route": "/matches/105" },
  "featuredResult": { "matchId": 105, "homeClub": { "id": 1, "shortName": "RMA", "badge": "⚽" }, "awayClub": { "id": 2, "shortName": "BAR", "badge": "⚽" }, "homeGoals": 2, "awayGoals": 1, "competition": { "id": 3, "name": "Primera División", "shortName": "PD" }, "route": "/matches/105" },
  "stories": [{ "id": "tk-result-105", "icon": "⚽", "text": "RMA 2-1 BAR (Primera División, J7).", "route": "/matches/105" }],
  "rumor": { "id": "r-sale-9", "icon": "🔥", "headline": "El VAL pone a Roig en el escaparate.", "route": "/market" },
  "nextMatch": { "matchId": 144, "playedAt": "2026-06-16T20:00:00.000Z", "home": true, "opponent": { "id": 4, "shortName": "ATM", "badge": "⚽" }, "competition": { "id": 3, "name": "Primera División", "shortName": "PD" }, "countdown": { "serverTime": "...", "secondsRemaining": 13200, "nextTickAt": "..." } }
}
```
- `stories` REUSA el scoring/fuentes de `GET /api/public/ticker` y `GET /api/public/matches/featured`; no hay scoring duplicado. `rumor` sale del rumorómetro QW-8 sin exponer `confidence`. `moment.kind`: `late_goal|comeback|penalty_save|debut|goal|save|match`. Si no hay datos suficientes, los campos narrativos vuelven `null` o arrays vacíos, nunca mocks inventados.

### W2 · Presión del cargo ✅
- `GET /api/manager/pressure` (auth) — fuente única de presión del puesto. Respuesta:
```json
{
  "score": 38,
  "level": "calm",
  "label": "Cargo estable",
  "reasons": ["-3 partidos sin ganar", "+la afición todavía confía", "+objetivo todavía en plazo"],
  "sources": ["forma", "fans/mood", "clasificacion", "directiva", "objetivos"],
  "components": {
    "form": { "delta": 12, "label": "3 partidos sin ganar" },
    "expectation": { "delta": -6, "label": "1 puesto por encima de lo esperado" },
    "fans": { "delta": -8, "label": "La afición todavía confía", "mood": "green", "score": 72 },
    "board": { "delta": 0, "label": "Sin señales recientes de la directiva" },
    "objectives": { "delta": -4, "label": "Objetivo todavía en plazo" }
  }
}
```
- `score` 0-100: 0 = sin presión, 100 = máxima tensión. `level`: `calm|watch|tense|crisis`. Reglas deterministas server-side sobre forma, posición vs expectativa, `/api/fans/mood`, confianza de directiva y objetivos.

### W3 · Trofeos por hitos pequeños ✅
- Sin endpoint nuevo. `GET /api/missions` muestra los nuevos hitos dentro del catálogo clásico y/o como `completed` si ya se desbloquearon en `ManagerAchievement`.
- Nuevos hitos: `unbeaten_10`, `first_signing`, `first_academy_debut`, `epic_comeback`, `season_no_deficit`. Recompensa solo XP/prestigio narrativo ya existente; cero dinero, cero P2W.
- El tick evalúa un paso autocontenido nuevo: `hitos:<n>`. Idempotente: antes de crear `ManagerAchievement` comprueba `managerId+type`; al desbloquear crea `News type='mission'`.

### W4 · Mapa de calor del club ✅
- `GET /api/club/health-map` (auth) — agregador server-side de 6 áreas. Respuesta:
```json
{
  "generatedAt": "2026-06-11T18:30:00.000Z",
  "areas": [
    { "key": "sporting", "label": "Deportivo", "score": 68, "status": "ok", "note": "Forma competitiva y once preparado.", "sources": ["advisor", "clasificacion", "pressure"] },
    { "key": "economy", "label": "Económico", "score": 54, "status": "watch", "note": "Caja positiva, masa salarial vigilada.", "sources": ["economy", "advisor"] },
    { "key": "squad", "label": "Plantilla", "score": 47, "status": "watch", "note": "Falta profundidad en defensa.", "sources": ["advisor"] },
    { "key": "academy", "label": "Cantera", "score": 70, "status": "ok", "note": "Hay juveniles listos para subir.", "sources": ["advisor"] },
    { "key": "fans", "label": "Afición", "score": 72, "status": "ok", "note": "La grada confía.", "sources": ["fans/mood"] },
    { "key": "board", "label": "Directiva", "score": 62, "status": "ok", "note": "Presión del cargo contenida.", "sources": ["manager/pressure"] }
  ],
  "sourceContracts": ["/api/club/advisor", "/api/fans/mood", "/api/manager/pressure", "/api/club/economy"]
}
```
- `status`: `good|ok|watch|risk`. Cada área cita fuentes. No introduce reglas de gameplay nuevas: agrega advisor + fans/mood + pressure + economía.

### W5 · "El agente te escribe" ✅
- Payload aditivo en abrir/listar negociación (`POST /api/negotiations`, `GET /api/negotiations`, `GET /api/negotiations/:id`, aceptaciones/rechazos/counter que devuelvan acuerdo): `agentMessage`.
```json
{
  "id": 88,
  "type": "transfer",
  "status": "proposed",
  "player": { "id": 10, "name": "Pavón", "position": "DEL" },
  "agentMessage": "El entorno de Pavón pide claridad: si el proyecto deportivo es serio, escucharán la propuesta sin montar ruido."
}
```
- Determinista por negociación (`agreement.id`, jugador, situación y personalidad). Español listo para UI. No cambia `message` ni ningún campo consumido por el front.

### ⚠️ Runtime Bloque W
- Requiere `--build backend` en el Mac. Antigravity debe validar en runtime: `daily-cover` estable entre dos llamadas del mismo turno; `pressure` y `health-map` coherentes con `/fans/mood` y advisor; `GET /api/missions` muestra/desbloquea hitos tras tick; negociaciones muestran `agentMessage` sin romper payloads existentes.

### W6 · Semáforo de decisión ✅
- `GET /api/club/decision-signal` (auth) — fuente única server-side para pintar semáforos antes de fichar/vender/renovar/obra. Query:
  - `action=sign|sell|renew|stadium`
  - opcionales según acción: `playerId`, `amount`, `salary`, `years`, `clause`, `workKey`
- Respuesta:
```json
{
  "action": "sign",
  "status": "yellow",
  "score": 62,
  "label": "Conviene revisar",
  "summary": "Viable, pero con riesgo salarial.",
  "reasons": ["La oferta gusta al jugador", "La masa salarial queda en vigilancia", "La afición espera señales"],
  "sources": ["/api/market/evaluate", "/api/club/economy", "/api/fans/mood", "/api/manager/pressure", "/api/club/advisor"],
  "dimensions": [
    { "key": "viability", "label": "Viabilidad", "status": "green", "score": 78, "detail": "El jugador aceptaría los términos.", "source": "/api/market/evaluate" },
    { "key": "financial", "label": "Riesgo financiero", "status": "yellow", "score": 54, "detail": "El coste encaja, pero reduce margen.", "source": "/api/club/economy" },
    { "key": "sporting", "label": "Impacto deportivo", "status": "green", "score": 74, "detail": "Refuerza una zona corta de la plantilla.", "source": "/api/club/advisor" },
    { "key": "fans", "label": "Reacción de afición", "status": "yellow", "score": 58, "detail": "La grada está expectante.", "source": "/api/fans/mood" }
  ],
  "evaluation": {
    "market": { "blocks": { "entorno": 80, "sentimental": 60, "expectativas": 70, "economico": 65 }, "keys": [], "total": 69, "accepted": true }
  }
}
```
- `status`: `green|yellow|red`; `score` 0-100. Para fichar/renovar, si `playerId+salary+years` están presentes, reutiliza la valoración multi-apartado de `/api/market/evaluate` como dimensión `viability`; si faltan datos, devuelve dimensión amarilla con detalle "faltan términos". Para vender, estima impacto deportivo sobre titularidad/profundidad de plantilla y reacción de afición desde `fans/mood`. Para obras, evalúa margen económico con el coste (`amount`) y presión/directiva; no encola nada.
- El front NO recalcula reglas: usa `dimensions[]`, `status`, `score`, `reasons[]` y opcionalmente `evaluation.market` si quiere mostrar las llaves existentes.
- Runtime: Antigravity debe validar semáforos en fichar/vender/renovar/obra comparando que `sign|renew` coincide con `/api/market/evaluate` cuando se envían los mismos términos.

## §BloqueQ (11 jun 2026 — Claude, tarde) · WT1 · Posiciones detalladas (15)

_Contrato publicado contract-first para WT4 (pizarra de Antigravity). TODO ADITIVO: la macro `position` (POR|DEF|MED|DEL) sigue existiendo en todos los payloads y NO cambia._

### Las 15 posiciones (códigos canónicos)
`POR` Portero (1) · `LD` Lateral derecho (2) · `LI` Lateral izquierdo (3) · `CT` Central (4/5) · `PIV` Medio pivote defensivo (6) · `ORG` Mediocentro organizador (8) · `MCO` Mediocentro ofensivo (8/10) · `BOX` Medio box-to-box (8) · `INTD` Interior derecho (8) · `INTI` Interior izquierdo (8) · `MP` Media punta (10) · `EXTD` Extremo derecho (7) · `EXTI` Extremo izquierdo (11) · `DC` Delantero centro (9) · `F9` Falso 9 / segundo delantero (9/10).
Mapeo a macro: `LI/CT/LD→DEF` · `PIV/ORG/MCO/BOX/INTD/INTI/MP→MED` · `EXTI/EXTD/DC/F9→DEL`.

### Campos aditivos en payloads de jugador ✅
- En **squad** (`GET /api/players`), **ficha propia** (`GET /api/players/:id`), **ficha pública** (`GET /api/players/public/:id`) y **mercado** (`GET /api/players/market`):
  - `detailedPosition: "CT"` — código de la tabla de arriba (`null` solo en universos sin migrar).
  - `detailedPositionLabel: "Central"` — nombre en español listo para UI.
  - `overall` ahora es la **Media por posición detallada** (habilidades de peso 3+2 de la tabla §1.1 del doc de diseño, ponderadas) cuando el jugador tiene `detailedPosition`; si no, cae a la media macro legacy (aditivo, mismo campo).
- Scouting (`/api/scout/*`): los jugadores embebidos llevan `detailedPosition` (columna nueva incluida en las rows completas). Para el label, usar el catálogo de abajo.

### `GET /api/tactics/positions` ✅ (catálogo para la UI)
```json
{ "positions": [
  { "code": "CT", "label": "Central", "dorsal": "4/5", "macro": "DEF",
    "keySkills": ["tackling"], "importantSkills": ["passing"] }
] }
```
- Las 15, en orden de campo (POR → DEL). `keySkills` = peso 3, `importantSkills` = peso 2 (las que entran en la Media). Fuente única para chips/tooltips de la pizarra.

### Reglas que ya aplican server-side (WT1)
- **Backfill**: migración `20260611150000_wt_tactics_pro` deriva la posición detallada de TODOS los jugadores existentes por perfil de atributos (doc §1/§1.1), lado izq/dcho estable por paridad de `squadNumber` (fallback `id`).
- **Generación**: seed, juveniles y promociones nacen ya con `detailedPosition` y reparten sus puntos según los pesos de la tabla (más en peso 3, residual en 1/—, con varianza para híbridos y outliers de faltas).
- **Auto-lineup**: `GET /api/tactics/auto-lineup?formation=` asigna por SLOTS de posición detallada cuando la formación está en el catálogo WT2 (ver su sección); cada slot devuelve `detailedPosition` requerida, asignada y `outOfPosition`.

## §BloqueQ (11 jun 2026 — Claude, tarde) · WT2 · Catálogo de 15 formaciones + auto-lineup por slots

_Contrato para WT4 (pizarra). TODO ADITIVO: `Tactic.formation` sigue aceptando strings libres `\d+(-\d+){1,3}`; las del catálogo se ENRIQUECEN._

### `GET /api/tactics/formations` ✅ (auth)
```json
{
  "formations": [{
    "key": "4-2-3-1", "name": "4-2-3-1 — la moderna por defecto", "shape": "4-2-3-1",
    "slots": [{ "index": 1, "positions": ["POR"], "label": "Portero", "roles": ["portero_libero"] }],
    "strengths": ["…"], "weaknesses": ["…"],
    "counters": { "strongVs": ["…keys…"], "weakVs": ["…keys…"] },
    "physicalDemand": 3, "style": "equilibrada",
    "description": "…", "history": "…"
  }],
  "roleLabels": { "lateral_invertido": "Lateral invertido", "carrilero": "Carrilero", "pierna_cambiada": "Extremo a pierna cambiada", "portero_libero": "Portero-líbero", "central_salidor": "Central salidor", "falso_9": "Falso 9" }
}
```
- Las 15: `4-4-2 · 4-5-1 · 4-3-3 · 4-3-2-1 · 4-1-3-2 · 5-4-1 · 4-1-2-1-2 · 3-5-2 · 5-3-2 · 4-2-3-1 · 3-4-3 · 3-2-4-1 · wm-3-2-5 · metodo-2-3-2-3 · 4-2-4`. Las históricas (`wm-3-2-5`, `metodo-2-3-2-3`) llevan `style: "historica"` → tratamiento retro en la UI (WT4). El 4-2-3-1 tiene counters VACÍOS a propósito (la navaja suiza neutra).
- `slots[]`: 11 huecos (índice 1 = POR), `positions` en orden de preferencia (posiciones detalladas WT1), `roles` = roles modernos sugeridos para el hueco. Textos 100% en español (fuente: doc de diseño §3).

### `GET /api/tactics/auto-lineup?formation=` ✅ (ampliado, aditivo)
- Acepta ahora **key o shape del catálogo** (`wm-3-2-5`, `3-2-5`, `4-1-2-1-2`…) además de los strings legacy. Con formación de catálogo responde **por SLOTS**:
```json
{
  "formation": "4-2-3-1", "formationKey": "4-2-3-1", "formationName": "4-2-3-1 — la moderna por defecto", "bySlots": true,
  "xi": [{ "playerId": 7, "name": "…", "squadNumber": 4, "naturalPosition": "DEF",
           "detailedPosition": "CT", "detailedPositionLabel": "Central",
           "assignedLine": "DEF", "slotIndex": 3, "slotLabel": "Central",
           "requiredPositions": ["CT"], "roles": [], "outOfPosition": false, "emergency": false }],
  "bench": [{ "playerId": 9, "name": "…", "squadNumber": 12, "naturalPosition": "MED", "detailedPosition": "ORG", "detailedPositionLabel": "Mediocentro organizador" }]
}
```
- `outOfPosition` = su detallada no encaja en el hueco · `emergency` = ni siquiera coincide la línea macro (solo pasa si falta gente). Respeta lesionados/sancionados como siempre. Strings legacy → respuesta clásica `{formation, lines, xi, bench}` intacta.

### `Tactic.roleInstructions` ✅ (columna nueva, migración `20260611150000_wt_tactics_pro`)
- JSON aditivo por hueco: `{ "2": "lateral_invertido", "9": "falso_9" }` (clave = `slotIndex` de la pizarra, valor = rol de `roleLabels`). Aceptado en `POST/PUT /api/tactics` (campo `roleInstructions`, string JSON ≤5000). `null` = sin roles. El motor aún NO lo consume (flavor/preparación V2-5); guardarlo ya permite a la pizarra persistir los badges.

## §BloqueQ (11 jun 2026 — Claude, tarde) · WT3 · Efectos de formaciones en la simulación ⚠️ recalibración consciente

_No hay contrato HTTP nuevo: son efectos del motor. Lo que la UI puede explicar ("¿Qué hace esto?"):_
- **Counters suaves**: si ambas formaciones son del catálogo y una domina a la otra (counters WT2), el favorecido gana `+2 ataque / +1 defensa / +1.5 mediocampo` de perfil y el otro lo pierde (swing ≈ la ventaja de campo; MENOR que el duelo de estilos §2.9). Mismo sistema o fuera de catálogo = neutro. El motor CAPA el bonus a ±6 (entradas hostiles no rompen la calibración).
- **Fuera de posición detallada**: al simular, el XI se asigna a los slots del catálogo por línea; el titular cuya detallada no encaja en ningún hueco libre de su línea juega con **−6% en sus atributos de juego** (faltas y portería intactas). Sin `detailedPosition` o sin formación de catálogo = roster bit a bit intacto.
- **Demanda física → fatiga post-partido**: pérdida de fitness de titulares = `(8±) + (demanda−3)×2` (demanda 3 o formación libre = fórmula histórica exacta). Formaciones con carrileros (3-5-2/3-4-3/5-3-2): LD/LI titulares pierden 2 extra. Demanda ≥4: el BOX pierde 1 extra. La rotación importa.
- **Neutralidad verificada**: motor Python `pytest 108/108` (105 previas intactas + 3 nuevas de profileBonus: neutro bit a bit, dirección del efecto, cap ±6). Lote (`/simulate-batch`) y partido individual aplican los MISMOS ajustes.

## §BloqueQ (11 jun 2026 — Claude, tarde) · W6 · Auditoría del semáforo de decisión (QW-13) — CERRADA

- **Auditoría**: el semáforo ya existía y está completo — `GET /api/club/decision-signal` (Codex, 11 jun) cubre las 4 dimensiones (viabilidad/financiero/deportivo/afición) para `sign|sell|renew|stadium`, reutilizando evaluate/economy/mood/pressure/advisor. Es y sigue siendo la **FUENTE ÚNICA**: no se crea ningún endpoint paralelo.
- **Hueco encontrado y cerrado (aditivo)**: la dimensión `viability` ignoraba la LEGALIDAD de plantilla (límites FDF S7). Ahora, en `sign`/`sell`, si `squad-limits` lo prohíbe (`canSign`/`canListTransfer` = false) la viabilidad se fuerza a rojo (score ≤15) con el motivo legal en español y `"/api/market/squad-limits"` se añade a `sources`. Un fichaje ilegal jamás sale verde aunque el jugador acepte.
- `GET /api/market/squad-limits` queda como indicador de detalle (S7); `decision-signal` lo incorpora.
