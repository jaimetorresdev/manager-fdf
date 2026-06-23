# INTEGRATION_fase2.md — Wiring para el tick (game.service.ts)

Estos enganches NO están insertados en game.service.ts (archivo prohibido).
El agente de integración debe añadirlos en `processTick()` o en las funciones step correspondientes.

---

## 1. Estadio — `stadiumService.advanceTurn`

**Archivo:** `server/src/modules/stadium/stadium.service.ts`

**Import a añadir en game.service.ts:**
```ts
import { stadiumService } from '../stadium/stadium.service';
```

**Enganche en `processTick()` (después de `stepAcademy`):**
```ts
// Estadio: avanzar cola de obras (solo actúa en cambio de mes)
const stadiumResult = await stadiumService.advanceTurn(nextDate);
steps.push(`estadio:obras_completadas:${stadiumResult.completed.length}:progresadas:${stadiumResult.progressed.length}`);
```

**Lógica:** `advanceTurn(inGameDate)` solo actúa cuando `inGameDate.getDate() === 1` (día 1 del mes in-game). Descuenta 1 mes a la obra activa (primera en cola por id). Si `monthsRemaining` llega a 0, aplica el efecto (incrementa capacidad para anfiteatros, sube nivel sportsCity, o sube nivel del sector seats/boxes/parking). Las obras siguientes en cola siguen esperando su turno.

---

## 2. Cantera — `academyService.advanceTurn`

**Archivo:** `server/src/modules/academy/academy.service.ts`

**Import a añadir en game.service.ts:**
```ts
import { academyService } from '../academy/academy.service';
```

**Enganche: reemplazar `await stepAcademy(steps)` por:**
```ts
// Cantera: generación de juveniles, envejecimiento, expulsiones por edad
const academyResult = await academyService.advanceTurn(nextDate, state.turn + 1);
steps.push(`cantera:nuevos:${academyResult.spawned}:expulsados:${academyResult.expelled}`);
```

**Lógica:**
- Cada 28 turnos (~1 año in-game): +1 edad a todos los juveniles; expulsa los mayores de 22.
- Si `nextPlayerAt <= inGameDate` y hay capacidad: genera 1 juvenil con fórmula de talento FDF (cota [20, 75]).
- Fórmula de talento: `nivelAcademia*3 + rand(-5,25) − rand(0,residencias) + 13 + ubicación(3) + bonusCiudadDeportiva + bonusEmblemáticos`.
- `nextPlayerAt` se fija a `inGameDate + 3 meses` después de cada generación.

**NOTA:** El `stepAcademy` existente en game.service.ts puede eliminarse o dejarse como no-op; si se dejan ambos habrá generación doble. Recomendado: eliminar `stepAcademy` y sustituir por la llamada a `academyService.advanceTurn`.

---

## 3. Afición — `fansService.advanceTurn`

**Archivo:** `server/src/modules/fans/fans.service.ts`

**Import a añadir en game.service.ts:**
```ts
import { fansService } from '../fans/fans.service';
```

**Enganche en `processTick()` (después del paso de finanzas):**
```ts
// Afición: crecimiento mensual de masa social + multas por disturbios
const fansResult = await fansService.advanceTurn(nextDate);
if (fansResult.events.length > 0) steps.push(`aficion:${fansResult.events.join('|')}`);
else steps.push('aficion:ok');
```

**Lógica (solo actúa en día 1 del mes in-game):**
- Calcula nivel de prestigio medio de la plantilla (por talento promedio: ≥75→L2, ≥55→L1, ≥40→L0, <40→L-1).
- Aplica delta mensual de masa social: L2=+240, L1=+120, L0=0, L-1=−120 (distribuido proporcionalmente entre segmentos).
- Comprueba disturbios: si `youngLow > 35%` Y `(youngLow+adultLow) > 65%` del total → multa aleatoria de 150k–1,5M€ deducida del presupuesto del club.

---

## 4. Ideología — sin enganche de tick propio

La ideología no requiere procesamiento por turno. Las funciones `getAcademyTalentBonus(clubId)` y `computeUnlockedUpgrades()` son síncronas y se consultan cuando otros servicios las necesitan (ej: `academyService` importa `EMBLEMATIC_TALENT_BONUS_PER_PLAYER` directamente).

---

## Rutas registradas (ya en index.ts)

| Módulo    | Prefijo           | Endpoints implementados                                              |
|-----------|-------------------|----------------------------------------------------------------------|
| Estadio   | `/api/stadium`    | `GET /`, `POST /upgrade`, `POST /works` (alias)                      |
| Cantera   | `/api/academy`    | `GET /`, `POST /expand`, `POST /promote/:id`, `DELETE /dismiss/:id`, `POST /next-player` |
| Afición   | `/api/fans`       | `GET /`, `POST /campaigns`                                           |
| Ideología | `/api/ideology`   | `GET /`, `PUT /values`, `POST /emblematic`, `DELETE /emblematic/:id` |

Todas las rutas ya están registradas en `src/index.ts` (líneas 119, 124, 126, 132). No se requiere ningún cambio en index.ts.

---

## Resumen de lo implementado

### Estadio
- Cola de obras **secuencial** por `stadiumId` ordenada por `id ASC`; solo la primera obra (menor id) es activa, el resto esperan.
- **Anfiteatros** norte/sur (+2k asientos), este/oeste (+4k asientos) — 4 expansiones de capacidad.
- **Asientos** 5 sectores × 5 niveles; **palcos** 5 × 5; **parking** 5 × 5 (+4% asistencia por nivel medio de parking).
- **Ciudad deportiva** 9 niveles (0→9), +1 punto de talento de cantera por nivel.
- **Precio de entrada**: `base(countryLevel) + seatBonus × priceLevelMultiplier`; base sube con nivel de país.
- **Coste reservado al encolar**; el efecto (incremento de capacidad, nivel, etc.) se aplica al completar la obra.
- `advanceTurn(inGameDate)` actúa solo en día-1 de mes.

### Cantera
- **Fórmula de talento FDF** completa: `nivelAcademia*3 + rand(-5,25) − rand(0,residencias) + 13 + 3(ubicación) + bonusCiudadDeportiva + bonusEmblemáticos`, acotada [20, 75].
- **Generación automática** 1 juvenil cada ~3 meses in-game (via `nextPlayerAt`).
- **Capacidad**: `residencias × 10` jugadores.
- **Edad máxima sub-19**: 22 años; expulsión automática al superar.
- **Ascenso** (`/promote/:id`): crea `Player` real con atributos derivados del talento + `homegrown: true`.
- **Despido** (`/dismiss/:id`): sin coste, borra `YouthPlayer`.
- **Expansión** (`/expand`): `level` (+1 nivel academia) o `residences` (+1 residencia, +10 capacidad).

### Afición
- **Pirámide social**: 6 segmentos (youngLow/Mid/High, adultLow/Mid/High) almacenados en `FanBase`.
- **Crecimiento mensual**: basado en talento medio de plantilla → nivel de prestigio → delta ±240/120/0/−120 fans/mes.
- **Disturbios**: si youngLow>35% y (youngLow+adultLow)>65% → multa 150k–1,5M€ proporcional a la gravedad.
- **Campañas** (5 tipos): coste inmediato, efecto inmediato sobre segmentos y reputación, duración 1–3 meses.

### Ideología
- **Valores** (1–6 strings): definen personalidad del club.
- **Jugadores emblemáticos** (máx 5): cada uno aporta +2 de talento a la fórmula de cantera (`EMBLEMATIC_TALENT_BONUS_PER_PLAYER = 2`).
- **Mejoras desbloqueadas**: calculadas en `computeUnlockedUpgrades()` a partir de palabras clave en los valores + número de emblemáticos (ej: 3+ emblemáticos desbloquea `stadium:historicWing`).
- No requiere tick; los bonuses se consultan síncronamente.
