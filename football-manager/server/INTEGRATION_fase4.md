# INTEGRATION_fase4.md — Enganches Fase 4 (Mundo en Vivo)

## 1. Módulos nuevos — registrar en `server/src/index.ts`

Añadir los siguientes imports al bloque de imports de index.ts:

```ts
import { sharesRoutes }    from './modules/shares/shares.routes';
import { electionsRoutes } from './modules/elections/elections.routes';
import { forumRoutes }     from './modules/forum/forum.routes';
```

Añadir los siguientes `app.register` en el bloque de rutas de index.ts
(inmediatamente después de las líneas existentes de `messagesRoutes` / `worldRoutes`):

```ts
await app.register(sharesRoutes,    { prefix: '/api/shares' });
await app.register(electionsRoutes, { prefix: '/api/elections' });
await app.register(forumRoutes,     { prefix: '/api/forum' });
```

---

## 2. Pasos nuevos del tick — enganchar en `game.service.ts` → `processTick()`

El pipeline en `processTick()` tiene el stub comentado en el paso 10:

```ts
// 10. Revalorización de las 1.500 acciones por club. Stub → H6.
await stepShareValues(steps);
```

Reemplazarlo con la llamada real importando el servicio al principio del fichero:

```ts
// Al principio del fichero game.service.ts (imports):
import { sharesService }    from '../shares/shares.service';
import { electionsService } from '../elections/elections.service';
import { worldEconomyService, rankingService } from '../world/world.service';
```

Y en el cuerpo de `processTick()`, sustituir los stubs de los pasos 10 y 11:

```ts
// 10. Revalorización de las 1.500 acciones por club (Fase 4 real).
const updatedShares = await sharesService.recalcAllShareValues();
steps.push(`acciones:${updatedShares}`);

// 11. Economía mundial + rankings (Fase 4 real).
const econIndex = await worldEconomyService.computeIndex();
await worldEconomyService.record(econIndex, nextDate);
steps.push(`economia:${econIndex}`);
const ranksSnapped = await rankingService.stepGenerateRankings(nextDate);
steps.push(`rankings:${ranksSnapped}`);

// Elecciones: cerrar las que han vencido en este turno.
const closedElections = await electionsService.stepCloseExpiredElections(nextDate);
if (closedElections > 0) steps.push(`elecciones-cerradas:${closedElections}`);
```

El stub actual `stepShareValues` en la función interna del mismo fichero
(que recibe `steps: string[]`) puede mantenerse como no-op o eliminarse
una vez se aplique el enganche real; no debe romperse la firma.

---

## 3. Tabla de rutas API Fase 4

### Chat (ya registrado `/api/chat`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/chat/channels` | Lista canales con conteo de mensajes |
| GET | `/api/chat/:channel?take=50&before=<id>` | Mensajes por tipo de canal (`general`, `league`, `federation`, `social`) — paginación cursor |
| POST | `/api/chat/:channel` | Enviar mensaje al canal |
| GET | `/api/chat/channels/:id/messages` | (legacy) mensajes por id numérico de canal |
| POST | `/api/chat/channels/:id/messages` | (legacy) enviar por id numérico |

### Mensajes privados (ya registrado `/api/messages`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/messages/inbox` | Bandeja de entrada |
| GET | `/api/messages/sent` | Enviados |
| GET | `/api/messages/unread-count` | Contador de no leídos |
| POST | `/api/messages/` | Enviar mensaje (`toId`, `subject`, `body`) |
| POST | `/api/messages/:id/read` | Marcar leído |
| POST | `/api/messages/read-all` | Marcar todos leídos |
| DELETE | `/api/messages/:id` | Borrar mensaje |

### Acciones (NUEVO — pendiente registrar)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/shares/ranking` | Ranking de managers más ricos |
| GET | `/api/shares/:clubId` | Desglose de acciones de un club |
| POST | `/api/shares/buy` | Comprar acciones (`clubId`, `shares`) |
| POST | `/api/shares/sell` | Vender acciones (`clubId`, `shares`) |

### Elecciones (NUEVO — pendiente registrar)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/elections/?countryId=&period=` | Listar elecciones |
| GET | `/api/elections/:id` | Detalle de una elección |
| POST | `/api/elections/open` | Abrir/obtener elección para un país (`countryId`) |
| POST | `/api/elections/apply` | Candidatarse (`electionId`) |
| POST | `/api/elections/vote` | Votar (`electionId`, `candidateManagerId`) |
| POST | `/api/elections/:id/close` | Cerrar manualmente una elección |

### Foro (NUEVO — pendiente registrar)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/forum/threads?category=` | Listar hilos |
| POST | `/api/forum/threads` | Crear hilo (`category`, `title`, `text`) |
| GET | `/api/forum/threads/:id` | Detalle de hilo con posts |
| POST | `/api/forum/threads/:id/reply` | Responder hilo (`text`) |

### World (ya registrado `/api/world`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/world/economy` | Último índice económico mundial |
| GET | `/api/world/economy/history?take=30` | Historial de índice económico |
| GET | `/api/world/rankings` | Rankings en vivo (calculados al vuelo) |
| GET | `/api/world/rankings/:type` | Último snapshot de un tipo de ranking |

Tipos de ranking: `manager_of_year`, `richest_managers`, `average_salary`, `top_transfers`, `economic_flow`, `continental_coefficients`

### Amistosos (ya registrado `/api/friendlies`)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/friendlies/` | Lista de amistosos del club |
| POST | `/api/friendlies/` | Crear amistoso (valida ventana 5 Jul – 20 Ago, máx 7/temporada) |
| DELETE | `/api/friendlies/:id` | Cancelar amistoso |
| GET | `/api/friendlies/preseason` | Info pretemporada + slots restantes |

---

## 4. Estado implementado / verificado / pendiente

### Implementado y verificado (tsc 0 errores en módulos propios)

- **Chat**: canales reales `general`, `league`, `federation`, `social` con `ensureDefaultChannels`; paginación cursor `before`; `GET /chat/:channel` + `POST /chat/:channel`.
- **Mensajes privados**: buzón, enviados, borrar, marcar leído, marcar todos leídos, contador no leídos.
- **Shares (`/api/shares`)**: 1.500 acciones por club; valor recalculado por `recalcAllShareValues()` según `cash + fixedAssets + squadValue`; comprar/vender con validación de fondos y disponibilidad; ranking de managers más ricos.
- **Elecciones (`/api/elections`)**: candidatarse, votar, cerrar con designación por popularidad o por máximo prestigio si nadie se presenta; `stepCloseExpiredElections` para el tick cada 2 años in-game.
- **Foro (`/api/forum`)**: hilos con categorías `general`, `dudas`, `bugs`, `sugerencias`; crear hilo + primera respuesta; listar; responder.
- **World economy**: `worldEconomyService.computeIndex()` + `record()` + historial; `rankingService` con 6 tipos de ranking + snapshots.
- **Amistosos**: ventana pretemporada 5 Jul – 20 Ago; límite 7/temporada; `preseasonInfo()` endpoint; ingresos por taquilla ya incluidos.

### Pendiente de enganche (no bloqueable desde este agente)

- Registrar las 3 rutas nuevas en `index.ts` (shares, elections, forum) — ver sección 1.
- Sustituir el stub `stepShareValues` en `game.service.ts` con las llamadas reales — ver sección 2.
- `stepFinances` stub en `game.service.ts`: aplicar ingresos de amistosos al `cash` del club durante la pretemporada (cuando `processTick` ya llame a `stepFinances` real).

### Errores pre-existentes (no causados por Fase 4)

Los siguientes ficheros tenían errores antes de la Fase 4 (están en zonas NO TOCAR):
- `src/modules/economy/economy.service.ts` — campo `monthsRemaining` no existe en schema (13 errores)
- `src/modules/game/tick.logic.test.ts` — `ClubFinanceInput` con campos faltantes (9 errores)
- `src/modules/training/training.service.ts` — `PLAYS_PER_COACH_MAX` no definido (2 errores)

Ninguno de los ficheros creados/modificados en Fase 4 introduce errores de TypeScript.
