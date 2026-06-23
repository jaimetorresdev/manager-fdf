# INTEGRATION — Fase 1: Motor de partido + Entrenamientos

## Cambios aplicados (archivos en mi ámbito)

### 1. `server/src/modules/simulation/simulation.phases.engine.ts` — REESCRITO

Motor FDF completo con:
- 80 jugadas por partido (20 por equipo y parte, 2 partes)
- Jugada de campo: 5 fases (medio pase, medio desmarque, defensa, tiro, portería)
- Falta/córner: 3 fases (servicio, remate, portería)
- Penalti: 2 fases (carrera, definición) — simulado inline, inmediato
- `successPct = 50 + (atacante − defensor) × 0.85`, clamp [8, 92]
- **Bonus de cansancio**: `fatigueFactor(minuto, avgFitness)` — a partir del minuto 60, `const/dest` se reduce progresivamente según el fitness medio del equipo
- **Sustituciones**: hasta 3 por equipo en la segunda parte (min 55-85), sustituyendo al jugador con peor nota
- Eventos: gol, ocasión, tarjeta amarilla/roja, lesión, sustitución, penalti, expulsión
- MOTM: jugador con mayor nota al final del partido
- Notas individuales (0–10) + estadísticas (goles, asistencias, tiros, pases, entradas)
- **Replay enriquecido**: `ReplayStep[]` con `ballX/Y`, `fieldZone` (own_half/midfield/attack_third/penalty_area), `action` (texto narrativo estilo Championship Manager), `attackerName/defenderName` en cada fase
- Determinismo garantizado por `rng(seed)` (xorshift32)

### 2. `server/src/modules/game/tick.logic.ts` — AMPLIADO

Nuevas funciones puras exportadas:
```typescript
// Tipos de entrenamiento
export type TrainingType = 'táctica' | 'portero' | 'defensa' | 'medio' | 'delantero' | 'rehabilitación';
export const TRAINING_TYPE_STATS: Record<TrainingType, string[]>
export const COACH_CATEGORY_STATS: Record<string, string[]>  // incluye TAC

// Parámetros FDF
export const PLAY_DEVELOP_TURNS = 20
export const PLAY_TRAIN_TURNS = 15
export const PLAY_MAX_LEVEL = 15
export const PLAYS_PER_COACH_MAX = 50

// Forma objetivo
export const FORM_TARGET_MIN = 86
export const FORM_TARGET_MAX = 90
export const FORM_DECAY_PER_TURN = 2
export const FORM_GAIN_PER_TURN = 4
export const FORM_REHAB_GAIN = 8

// Funciones puras
export function nextPlayerForm(currentFitness, isTraining, isRehab): number
export function trainingPenalty(fitness, isInjured): number  // factor 0-1
export function selectStatToImprove(trainingType, coachCategory, rand): string
export interface TrainedPlayState { level, progress, status }
export function advanceTrainedPlay(play, coachLevel, rand): TrainedPlayState
export interface TrainingResult { playerId, improved, statImproved?, newFitness, isRehab }
export function applyTrainingTurn(player, trainingType, coachLevel, rand1, rand2): TrainingResult
```

### 3. `server/src/modules/training/training.service.ts` — REESCRITO

Training FDF real:
- **6 jugadores máximo por entrenador y sesión** (validado)
- **5 tipos de entrenamiento** + rehabilitación: táctica, portero, defensa, medio, delantero
- **Rehabilitación**: no mejora atributos, pero recupera +8 fitness/turno (vs +4 normal)
- **Forma objetivo 86–90%**: `nextPlayerForm()` sube si está por debajo, baja si está muy alta
- **Penalización por cansancio/lesión**: `trainingPenalty()` reduce eficacia
- **Stat seleccionada** por intersección tipo-entrenamiento ∩ categoría-entrenador
- `processTickTrainings(clubId, rng)`: para ser llamado desde `stepTrainings()` en game.service.ts
- Jugadas entrenadas: `createTrainedPlay`, `activateTrainedPlay`, `advanceTrainedPlays`
- Categorías de entrenador: GK, DEF, MID, ATT, **TAC** (nuevo)

### 4. `server/src/modules/training/training.routes.ts` — AMPLIADO

Nuevas rutas bajo `/api/training/`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/coaches` | Lista entrenadores con jugadores asignados |
| POST | `/coaches` | Contratar entrenador `{category, level}` |
| DELETE | `/coaches/:id` | Despedir entrenador |
| PUT | `/coaches/:id/assign` | Asignar jugadores (max 6) `{playerIds[]}` |
| **POST** | **`/session`** | **Ejecutar sesión de entrenamiento `{coachId, trainingType, playerIds[]}`** |
| **GET** | **`/types`** | **Lista tipos de entrenamiento con stats que mejoran** |
| GET | `/plays` | Jugadas entrenadas del club |
| POST | `/plays` | Crear jugada `{type: attack|defense|freekick}` |
| PUT | `/plays/:id/activate` | Activar jugada desarrollada |

### 5. `server/src/modules/matches/matches.routes.ts` — AMPLIADO

Nuevas rutas bajo `/api/matches/`:

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/:id` | Partido completo (stats separadas del replay, ratings) |
| **GET** | **`/:id/replay`** | **ReplayStep[] con paginación `?from=&to=`** |
| **GET** | **`/:id/ratings`** | **Notas individuales + MOTM** |
| POST | `/:id/tactics` | Guardar táctica (sin cambios) |

---

## Wiring pendiente: cambios exactos en archivos prohibidos

### A. `server/src/modules/game/game.service.ts` — `stepTrainings()`

**Reemplazar** el cuerpo actual de `stepTrainings` para llamar al servicio de entrenamiento real:

```typescript
// ANTES (líneas ~408-469 aprox):
async function stepTrainings(steps: string[]) {
  const players = await prisma.player.findMany(...);
  // ... lógica simplificada
}

// DESPUÉS:
import { trainingService } from '../training/training.service';
import { makeRng } from './tick.logic';

async function stepTrainings(steps: string[]) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) return;
  
  const rng = makeRng(state.turn * 7919);
  const clubs = await prisma.club.findMany({ select: { id: true } });
  let totalImproved = 0;
  let totalPlays = 0;
  
  for (const club of clubs) {
    const improved = await trainingService.processTickTrainings(club.id, rng);
    const playsAdv = await trainingService.advanceTrainedPlays(club.id, rng);
    totalImproved += improved;
    totalPlays += playsAdv;
  }
  
  steps.push(`entrenos:${totalImproved},jugadas:${totalPlays}`);
}
```

### B. `server/src/index.ts` — Registro de rutas

Verificar que las rutas estén registradas con los prefijos correctos:

```typescript
// training routes (ya debería estar, pero verificar prefijo):
app.register(trainingRoutes, { prefix: '/api/training' });

// matches routes (ya debería estar):
app.register(matchesRoutes, { prefix: '/api/matches' });
```

---

## Verificación

```bash
cd server && npx tsc --noEmit; echo "EXIT: $?"
# → EXIT: 0
```

tsc termina con exit 0. Todos los módulos compilados correctamente.
