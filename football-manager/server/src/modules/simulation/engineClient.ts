// ─── Cliente del motor de partido (Python v3) ─────────────────────────────────
// Envía las PLANTILLAS por jugador (atributos FDF) al microservicio FastAPI
// (ENGINE_URL). Si no está configurado o falla, cae al motor TS local, que
// agrega la plantilla a medias de equipo. El juego nunca se queda sin motor.

import { simulatePhasedMatch } from './simulation.phases.engine';
import type { ReplayStep } from './simulation.phases.engine';
import type { TacticInput, SimulationResult } from './simulation.engine';
import { env } from '../../config/env';
// WT3: counters de formación + penalización fuera de posición detallada.
// Neutros por defecto (sin catálogo/sin detailedPosition ⇒ bit a bit idéntico).
import { applyDetailedPositionEffects, formationMatchupBonus, physicalDemandOf } from './formationEffects';

const ENGINE_URL = env.engineUrl.replace(/\/+$/, '');
// AUDIT-2026 §8 P1: clave compartida opcional con el motor (X-Engine-Key).
// Si ENGINE_API_KEY está definida en ambos lados, el motor rechaza llamadas ajenas.
const ENGINE_API_KEY = env.engineApiKey;
const ENGINE_HEADERS: Record<string, string> = {
  'content-type': 'application/json',
  ...(ENGINE_API_KEY ? { 'x-engine-key': ENGINE_API_KEY } : {}),
};
const TIMEOUT_MS = Number(process.env.ENGINE_TIMEOUT_MS ?? 5000);
// R7: presupuesto POR PARTIDO del lote (/simulate-batch). Configurable porque
// un motor lento (CPU compartida en prod) puede necesitar más de 250ms/partido.
const BATCH_MS_PER_MATCH = Number(process.env.ENGINE_BATCH_MS_PER_MATCH ?? 250);

/** Semilla estable cuando un caller no aporta seed explícita (nunca Date.now). */
export function deriveDeterministicSeed(...parts: number[]): number {
  let h = 0;
  for (const p of parts) h = Math.imul(31, h) + (p | 0);
  return Math.abs(h) || 1;
}

/** Jugador tal como lo consume el motor (atributos FDF + estado). */
export interface EnginePlayer {
  id?: string | number;
  name: string;
  position: string;
  /** WT1 (aditivo): posición detallada — el motor Python la ignora (extra field),
   *  pero WT3 la usa para la penalización por jugar fuera de posición. */
  detailedPosition?: string | null;
  passing: number;
  tackling: number;
  shooting: number;
  organization: number;
  unmarking: number;
  finishing: number;
  dribbling: number;
  fouls: number;
  goalkeeping: number;       // SALIDAS (centros/balón parado)
  reflexes?: number;         // REFLEJOS (paradas de disparo). Ausente ⇒ = salidas.
  fitness: number;
  muscularFitness: number;
  mentalSharpness: number;
  matchRhythm: number;
  morale: number;
  experience: number;
  isStarter: boolean;
  accumulatedFatigue?: number;
  demandLevel?: number;
  consecutiveStarts?: number;
  /** N3-1 · Rompe la cadena de habilidad ofensiva (pases clave/remates) si true. */
  outOfPositionChainBreak?: boolean;
}

export interface PlayerRating {
  playerId?: number;
  name: string;
  // El motor (engine.py) incluye la posición en cada rating; game.service la usa
  // para los stats JSON del visor. Faltaba en el tipo y rompía el build del server.
  position?: string;
  rating: number;
  goals: number;
  assists?: number;
  shots?: number;
  shotsOnTarget?: number;
  passes?: number;
  passesCompleted?: number;
  passAccuracy?: number;
  tackles?: number;
  interceptions?: number;
  keyPasses?: number;
  xG?: number;
  xg?: number;
  minutes?: number;
}

export interface EngineInjury {
  playerId?: number;
  playerName?: string;
  team?: 'home' | 'away';
  type?: string;
  matchesOut?: number;
  weeksOut?: number;
  severity?: number;
}

/** C7 · Un lado del duelo de atributos de un eslabón de jugada (motor Python). */
export interface EngineDuelSide {
  playerId?: string | null;
  name: string;
  position: string;
  /** atributo FDF → valor exacto que ponderó el motor en ese eslabón */
  attrs: Record<string, number>;
}

/** C7 · Eslabón de la cadena de gol del timeline del motor Python. */
export interface EngineChainLink {
  step: 'recuperacion' | 'regate' | 'pase_clave' | 'remate';
  lane: 'left' | 'center' | 'right';
  text: string;
  att: EngineDuelSide;
  def: EngineDuelSide | null;
}

/** C7 · Entrada del timeline del motor Python (pasa tal cual a homeStatsJson.timeline).
 * lane/duel/chain son ADITIVOS: null/ausentes en entradas sin jugada y en
 * partidos antiguos. chain solo viene en phase="gol". */
export interface EngineTimelineEntry {
  minute: number;
  phase: string;
  team: 'home' | 'away';
  zone: string;
  text: string;
  playerId?: string | null;
  lane?: 'left' | 'center' | 'right' | null;
  duel?: { att: EngineDuelSide; def: EngineDuelSide | null } | null;
  chain?: EngineChainLink[] | null;
}

export interface EngineTacticalChange {
  team: 'home' | 'away';
  minute: number;
  condition: string;
  changes: Record<string, unknown>;
  previous?: Record<string, unknown>;
}

/** Resultado del motor: SimulationResult + notas + replay por fases (FDF §7). */
export interface EngineResult extends SimulationResult {
  homeRatings?: PlayerRating[];
  awayRatings?: PlayerRating[];
  injuries?: EngineInjury[];
  replay?: ReplayStep[];
  timeline?: ReplayStep[] | EngineTimelineEntry[];
  knockout?: boolean;
  decidedBy?: 'regular' | 'extra_time' | 'penalties';
  winner?: 'home' | 'away' | null;
  winnerClubId?: number;
  penalties?: { home: number; away: number };
  homePenalties?: number | null;
  awayPenalties?: number | null;
  tacticalChanges?: EngineTacticalChange[];
}

export interface EngineOptions {
  knockout?: boolean;
  weatherCondition?: string;
  temperature?: number;
  attendancePct?: number;
  homeStimulated?: boolean;
  stadium_fill?: number;
  coachConfidenceHome?: number;
  coachConfidenceAway?: number;
}

export interface DevelopDelta {
  playerId?: number;
  youthPlayerId?: number;
  deltas: Record<string, number>;
}

export interface LineupResult {
  starterIds: number[];
  tactic: TacticInput;
  captainId?: number;
  setPieceTakers?: {
    corners?: number;
    freeKicks?: number;
    penalties?: number;
    captain?: number;
  };
}

export function isPlayerEligible(player: Record<string, unknown>, inGameDate?: Date): boolean {
  const suspendedMatches = typeof player.suspendedMatches === 'number' ? player.suspendedMatches : 0;
  if (suspendedMatches > 0) return false;
  const suspensions = Array.isArray(player.suspensions) ? player.suspensions : [];
  if (suspensions.some((row) =>
    row && typeof row === 'object' && Number((row as Record<string, unknown>).matches ?? 0) > 0)) {
    return false;
  }
  const injuries = Array.isArray(player.injuries) ? player.injuries : [];
  if (injuries.some((row) =>
    row && typeof row === 'object' && Number((row as Record<string, unknown>).weeksLeft ?? 0) > 0)) {
    return false;
  }
  if (!inGameDate || player.injuredUntil == null) return true;
  const injuredUntil = player.injuredUntil instanceof Date
    ? player.injuredUntil
    : new Date(String(player.injuredUntil));
  return !Number.isNaN(injuredUntil.getTime()) && injuredUntil <= inGameDate;
}

/** Filas Prisma de Player → roster del motor (tolerante a campos nulos).
 *  `starterIds` (opcional, P1 #106): XI elegido por la IA para clubes NPC —
 *  sobreescribe los flags isStarter de BD solo si trae un once completo. */
export function buildRoster(
  players: Array<Record<string, unknown>>,
  starterIds?: number[],
  inGameDate?: Date,
): EnginePlayer[] {
  const eligible = inGameDate
    ? players.filter(player => isPlayerEligible(player, inGameDate))
    : players;
  const requested = starterIds && starterIds.length >= 11
    ? new Set(starterIds)
    : null;
  const preferred = eligible.filter(player => requested
    ? requested.has(Number(player.id))
    : Boolean(player.isStarter) && player.squadNumber != null);
  const isGk = (player: Record<string, unknown>) =>
    ['PO', 'POR', 'GK'].includes(String(player.position ?? '').toUpperCase());
  const ranked = (items: Array<Record<string, unknown>>) =>
    [...items].sort((a, b) => playerScore(b) - playerScore(a) || Number(a.id ?? 0) - Number(b.id ?? 0));
  const gk = ranked(eligible.filter(isGk))[0];
  const preferredOutfield = preferred.filter(player => !isGk(player));
  const preferredSet = new Set(preferredOutfield);
  const remainingOutfield = ranked(eligible.filter(player => !isGk(player) && !preferredSet.has(player)));
  const selected = [
    ...(gk ? [gk] : []),
    ...preferredOutfield,
    ...remainingOutfield,
  ].slice(0, 11);
  const selectedSet = new Set(selected);
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  const idStr = (v: unknown) => {
    if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return String(v);
    if (typeof v === 'string') {
      const parsed = Number.parseInt(v, 10);
      if (Number.isSafeInteger(parsed) && parsed > 0) return v;
    }
    return undefined;
  };
  return eligible.map((p) => ({
    id:           idStr(p.id),
    name:         String(p.name ?? 'Jugador'),
    position:     String(p.position ?? 'MED'),
    detailedPosition: typeof p.detailedPosition === 'string' ? p.detailedPosition : null,
    passing:      num(p.passing, 50),
    tackling:     num(p.tackling, 50),
    shooting:     num(p.shooting, 50),
    organization: num(p.organization, 50),
    unmarking:    num(p.unmarking, 50),
    finishing:    num(p.finishing, 50),
    dribbling:    num(p.dribbling, 50),
    fouls:        num(p.fouls, 50),
    goalkeeping:  num(p.goalkeeping, 50),                    // SALIDAS
    reflexes:     num(p.reflexes, num(p.goalkeeping, 50)),   // REFLEJOS (fallback = salidas)
    fitness:      num(p.fitness, 100),
    muscularFitness: num(p.muscularFitness, num(p.fitness, 100)),
    mentalSharpness: num(p.mentalSharpness, num(p.fitness, 100)),
    matchRhythm:     num(p.matchRhythm, num(p.fitness, 100)),
    morale:       num(p.morale, 75),
    experience:   num(p.experience, 60),
    accumulatedFatigue: num(p.accumulatedFatigue, 0),
    consecutiveStarts: num(p.accumulatedFatigue, 0),
    isStarter:    selectedSet.has(p),
  }));
}

function applyPersistentFatigueContext(roster: EnginePlayer[], formation: string): EnginePlayer[] {
  const demandLevel = physicalDemandOf(formation) ?? 3;
  if (!roster.some((player) => (player.accumulatedFatigue ?? 0) > 0)) return roster;
  return roster.map((player) => ({
    ...player,
    demandLevel,
    consecutiveStarts: player.accumulatedFatigue ?? player.consecutiveStarts ?? 0,
  }));
}

function playerScore(player: Record<string, unknown>): number {
  const num = (v: unknown, d = 50) => (typeof v === 'number' ? v : d);
  return Math.round((
    num(player.passing) +
    num(player.tackling) +
    num(player.shooting) +
    num(player.organization) +
    num(player.unmarking) +
    num(player.finishing) +
    num(player.dribbling) +
    num(player.goalkeeping) +
    num(player.fitness, 100) * 0.5 +
    num(player.morale, 75) * 0.25
  ) / 8.75);
}

function localLineup(players: Array<Record<string, unknown>>): LineupResult {
  const withIds = players.filter(player => typeof player.id === 'number' && player.squadNumber != null);
  const sorted = [...withIds].sort((a, b) => playerScore(b) - playerScore(a));
  const gks = sorted.filter(player => ['PO', 'POR', 'GK'].includes(String(player.position ?? '').toUpperCase()));
  const rest = sorted.filter(player => !gks.includes(player));
  const starters = [...gks.slice(0, 1), ...rest.slice(0, 10)].slice(0, 11);
  const captain = [...starters].sort((a, b) =>
    (typeof b.experience === 'number' ? b.experience : 0) - (typeof a.experience === 'number' ? a.experience : 0)
  )[0];
  const bestSetPiece = [...starters].sort((a, b) =>
    ((typeof b.fouls === 'number' ? b.fouls : 50) + (typeof b.shooting === 'number' ? b.shooting : 50))
    - ((typeof a.fouls === 'number' ? a.fouls : 50) + (typeof a.shooting === 'number' ? a.shooting : 50))
  )[0];
  const starterIds = starters.map(player => player.id as number);
  const captainId = captain?.id as number | undefined;
  const setPieceId = bestSetPiece?.id as number | undefined;
  return {
    starterIds,
    captainId,
    setPieceTakers: {
      corners: setPieceId,
      freeKicks: setPieceId,
      penalties: setPieceId,
      captain: captainId,
    },
    tactic: {
      formation: '4-4-2',
      construction: 50,
      destruction: 50,
      pressing: 50,
      marking: 'mixed',
      tempo: 50,
      mentality: 'balanced',
      setPieceTakers: {
        corners: setPieceId,
        freeKicks: setPieceId,
        penalties: setPieceId,
        captain: captainId,
      },
    },
  };
}

export async function requestLineup(
  players: Array<Record<string, unknown>>,
  context: Record<string, unknown> = {},
): Promise<LineupResult> {
  if (ENGINE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const payload = {
        players: buildRoster(players).map(p => ({ ...p, id: p.id != null ? String(p.id) : undefined })),
        objective: typeof context.objective === 'string' ? context.objective : 'equilibrado',
        seed: typeof context.seed === 'number'
          ? context.seed
          : deriveDeterministicSeed(
            players.reduce((sum, p) => sum + (Number(p.id) || 0), 0),
            players.length,
          ),
      };
      
      const res = await fetch(`${ENGINE_URL}/lineup`, {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`lineup respondió ${res.status}: ${errText}`);
      }
      const body = await res.json() as any;
      const starterIds: number[] = Array.isArray(body.xi)
        ? body.xi.map((slot: any) => Number(slot.playerId)).filter((id: number) => !isNaN(id))
        : [];
      if (starterIds.length > 0) {
        return {
          starterIds,
          tactic: {
            formation: body.tactic?.formation ?? body.formation ?? '4-4-2',
            construction: body.tactic?.construction ?? 50,
            destruction: body.tactic?.destruction ?? 50,
            pressing: body.tactic?.pressing ?? 50,
            marking: body.tactic?.marking ?? 'mixed',
            tempo: body.tactic?.tempo ?? 50,
            width: body.tactic?.width ?? 50,
            mentality: body.tactic?.mentality ?? 'balanced',
            setPieceTakers: {
              corners: body.tactic?.cornerTaker ? Number(body.tactic.cornerTaker) : undefined,
              freeKicks: body.tactic?.freeKickTaker ? Number(body.tactic.freeKickTaker) : undefined,
              penalties: body.tactic?.penaltyTaker ? Number(body.tactic.penaltyTaker) : undefined,
              captain: body.tactic?.captain ? Number(body.tactic.captain) : undefined,
            },
          },
        };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engine] /lineup no disponible (${msg}); usando IA local.`);
    } finally {
      clearTimeout(timer);
    }
  }

  return localLineup(players);
}

function localRng(seed: number): () => number {
  // P2 #115: el xorshift con estado 0 devuelve 0 PARA SIEMPRE → el shootout del
  // fallback (`while (home === away)`) se volvía bucle infinito y colgaba el
  // tick para el matchId concreto cuyo seed ^ 0x9e3779b9 === 0.
  let s = seed ^ 0x9e3779b9;
  if (s === 0) s = 0x1f123bb5;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    if (s === 0) s = 0x1f123bb5; // defensa extra: jamás quedar atrapado en 0
    return (s >>> 0) / 0xffffffff;
  };
}

function safeJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** R3: mentality a 0-100 numérico venga como venga (número, "65" o legacy string). */
function numericMentality(m: TacticInput['mentality']): number {
  if (typeof m === 'number' && Number.isFinite(m)) return Math.max(0, Math.min(100, m));
  const n = Number(m);
  if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  if (m === 'attacking') return 75;
  if (m === 'defensive') return 25;
  return 50;
}

type EngineTacticPayload = Omit<TacticInput, 'penaltyTaker' | 'freeKickTaker' | 'cornerTaker' | 'mentality'> & {
  mentality: number;
  penaltyTaker?: string;
  freeKickTaker?: string;
  cornerTaker?: string;
};

function normalizeTacticForEngine(tactic: TacticInput): EngineTacticPayload {
  const setPieceTakers = tactic.setPieceTakers ?? {};
  return {
    ...tactic,
    // El motor espera mentality 0-100 y marking 'zonal'|'individual' (models.py).
    mentality: numericMentality(tactic.mentality),
    marking: tactic.marking === 'man' ? 'individual' : (tactic.marking ?? 'zonal'),
    attackZones: safeJson(tactic.attackZones, undefined),
    defenseReinforcement: safeJson(tactic.defenseReinforcement, undefined),
    subsLogic: safeJson(tactic.subsLogic, undefined),
    // El motor tipa los lanzadores como Optional[str] (pydantic v2 NO coerciona
    // int→str): serializar siempre.
    penaltyTaker: asEngineId(tactic.penaltyTaker ?? setPieceTakers.penalties),
    freeKickTaker: asEngineId(tactic.freeKickTaker ?? setPieceTakers.freeKicks),
    cornerTaker: asEngineId(tactic.cornerTaker ?? setPieceTakers.corners),
  };
}

/** id de jugador → string para el contrato del motor (undefined si no hay). */
function asEngineId(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v > 0) return String(v);
  if (typeof v === 'string' && v) return v;
  return undefined;
}

function playerIdOf(player: EnginePlayer | undefined): number | undefined {
  if (!player?.id) return undefined;
  const parsed = Number.parseInt(String(player.id), 10);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function teamPower(roster: EnginePlayer[], tactic: TacticInput): number {
  const xi = roster.filter(p => p.isStarter).slice(0, 11);
  const pool = xi.length >= 8 ? xi : roster.slice(0, 11);
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
  const quality = avg(pool.map(p =>
    p.passing * 0.18 +
    p.shooting * 0.14 +
    p.finishing * 0.18 +
    p.organization * 0.16 +
    p.unmarking * 0.12 +
    p.dribbling * 0.1 +
    p.tackling * 0.06 +
    p.goalkeeping * 0.06
  ));
  return quality + ((tactic.construction ?? 50) - 50) * 0.04 + ((tactic.tempo ?? 50) - 50) * 0.03;
}

function pickExtraTimeScorer(roster: EnginePlayer[], r: () => number): EnginePlayer | undefined {
  const xi = roster.filter(p => p.isStarter).slice(0, 11);
  const pool = xi.length ? xi : roster;
  if (!pool.length) return undefined;
  const weights = pool.map(p => Math.max(1, p.finishing + p.shooting + (p.position === 'DEL' ? 60 : p.position === 'MED' ? 25 : 5)));
  const total = weights.reduce((sum, value) => sum + value, 0);
  let pick = r() * total;
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

function shootoutScore(seed: number, homePower: number, awayPower: number): { home: number; away: number } {
  const r = localRng(seed ^ 0x51f15e);
  let home = 0;
  let away = 0;
  for (let i = 0; i < 5; i++) {
    if (r() < Math.max(0.62, Math.min(0.86, 0.74 + (homePower - awayPower) / 600))) home++;
    if (r() < Math.max(0.62, Math.min(0.86, 0.74 + (awayPower - homePower) / 600))) away++;
  }
  while (home === away) {
    if (r() < Math.max(0.62, Math.min(0.86, 0.74 + (homePower - awayPower) / 600))) home++;
    if (r() < Math.max(0.62, Math.min(0.86, 0.74 + (awayPower - homePower) / 600))) away++;
  }
  return { home, away };
}

function applyKnockoutFallback(
  result: EngineResult,
  homeRoster: EnginePlayer[],
  awayRoster: EnginePlayer[],
  homeTactic: TacticInput,
  awayTactic: TacticInput,
  seed: number,
): EngineResult {
  if (result.homeGoals !== result.awayGoals) {
    return {
      ...result,
      knockout: true,
      decidedBy: 'regular',
      winner: result.homeGoals > result.awayGoals ? 'home' : 'away',
      homePenalties: null,
      awayPenalties: null,
    };
  }

  const r = localRng(seed ^ 0x455854);
  const homePower = teamPower(homeRoster, homeTactic);
  const awayPower = teamPower(awayRoster, awayTactic);
  let homeGoals = result.homeGoals;
  let awayGoals = result.awayGoals;
  const events = [...result.events];
  const replay = [...(result.replay ?? [])];

  for (let i = 0; i < 26; i++) {
    const team = i % 2 === 0 ? 'home' : 'away';
    const minute = 91 + Math.floor(r() * 30);
    const attPower = team === 'home' ? homePower : awayPower;
    const defPower = team === 'home' ? awayPower : homePower;
    const chance = Math.max(0.015, Math.min(0.11, 0.05 + (attPower - defPower) / 900));
    if (r() < chance) {
      const scorer = pickExtraTimeScorer(team === 'home' ? homeRoster : awayRoster, r);
      const playerName = scorer?.name ?? 'Jugador';
      if (team === 'home') homeGoals++;
      else awayGoals++;
      events.push({
        minute,
        type: 'goal',
        team,
        description: `Gol en la prórroga de ${playerName}`,
        playerId: playerIdOf(scorer),
        playerName,
      });
      replay.push({
        index: replay.length + 1,
        half: 2,
        minute,
        team,
        kind: 'field',
        phases: [],
        outcome: 'goal',
        description: `Gol en la prórroga de ${playerName}`,
        ballX: team === 'home' ? 92 : 8,
        ballY: 50,
        playerName,
        fieldZone: 'penalty_area',
        action: `Gol en la prórroga de ${playerName}`,
      });
    }
  }

  if (homeGoals !== awayGoals) {
    return {
      ...result,
      homeGoals,
      awayGoals,
      events: events.sort((a, b) => a.minute - b.minute),
      replay: replay.sort((a, b) => a.minute - b.minute || a.index - b.index),
      timeline: replay,
      knockout: true,
      decidedBy: 'extra_time',
      winner: homeGoals > awayGoals ? 'home' : 'away',
      homePenalties: null,
      awayPenalties: null,
    };
  }

  const penalties = shootoutScore(seed, homePower, awayPower);
  const winner = penalties.home > penalties.away ? 'home' : 'away';
  return {
    ...result,
    homeGoals,
    awayGoals,
    events: events.sort((a, b) => a.minute - b.minute),
    replay: replay.sort((a, b) => a.minute - b.minute || a.index - b.index),
    timeline: replay,
    knockout: true,
    decidedBy: 'penalties',
    winner,
    penalties,
    homePenalties: penalties.home,
    awayPenalties: penalties.away,
  };
}

function localDevelop(players: Array<Record<string, unknown>>, seed: number): DevelopDelta[] {
  const rng = localRng(seed);
  const attrs = [
    'passing',
    'tackling',
    'shooting',
    'organization',
    'unmarking',
    'finishing',
    'dribbling',
    'fouls',
    'goalkeeping',
    'muscularFitness',
    'mentalSharpness',
    'matchRhythm',
  ];

  return players
    .filter(player => typeof player.id === 'number')
    .map((player) => {
      const age = typeof player.age === 'number' ? player.age : 24;
      const talent = typeof player.talent === 'number' ? player.talent : 50;
      const potential = typeof player.potential === 'number' ? player.potential : 70;
      const curve = age <= 21 ? 0.55 : age <= 26 ? 0.35 : age <= 31 ? 0.12 : age <= 34 ? -0.08 : -0.24;
      const qualityRoom = Math.max(0, potential - talent) / 100;
      const deltas: Record<string, number> = {};

      for (const attr of attrs) {
        const roll = rng();
        const chance = Math.max(0.04, Math.min(0.55, curve + qualityRoom * 0.35));
        if (curve >= 0 && roll < chance) deltas[attr] = 1;
        if (curve < 0 && roll < Math.abs(curve)) deltas[attr] = -1;
      }
      deltas.fitness = age > 33 && rng() < 0.25 ? -1 : rng() < 0.2 ? 1 : 0;
      return { playerId: player.id as number, deltas };
    });
}

export async function developPlayers(
  players: Array<Record<string, unknown>>,
  youthPlayers: Array<Record<string, unknown>> = [],
  context: Record<string, unknown> = {},
): Promise<DevelopDelta[]> {
  const seed = typeof context.seed === 'number'
    ? context.seed
    : deriveDeterministicSeed(players.reduce((sum, p) => sum + (Number(p.id) || 0), 0));
  if (ENGINE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${ENGINE_URL}/develop`, {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({
          players: players.map(p => {
            const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
            const base = buildRoster([p])[0];
            return {
              ...base,
              age: num(p.age, 24),
              potential: num(p.potential, 70),
              personality: typeof p.personality === 'string' ? p.personality : undefined,
              injuryProneness: num(p.injuryProneness, 30),
              consistency: num(p.consistency, 60),
            };
          }),
          youthPlayers: youthPlayers.map(p => {
            const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
            const base = buildRoster([p])[0];
            return {
              ...base,
              age: num(p.age, 17),
              potential: num(p.potential, 70),
              personality: typeof p.personality === 'string' ? p.personality : undefined,
              injuryProneness: num(p.injuryProneness, 20),
              consistency: num(p.consistency, 50),
            };
          }),
          context: {
            trainingFocus: context.trainingFocus ?? 'general',
            minutesPlayed: context.minutesPlayed ?? 0,
            matchRating: context.matchRating ?? 6.0,
            restDays: context.restDays ?? 3,
            academyLevel: context.academyLevel ?? 0,
          },
          seed,
        }),
        signal: controller.signal,
      });
      if (res.ok) {
        const body = await res.json() as any;
        if (Array.isArray(body.results)) {
          return body.results.map((r: any) => ({
            playerId: r.playerId ? Number(r.playerId) : undefined,
            deltas: typeof r.deltas === 'object' && r.deltas ? r.deltas : {},
          }));
        }
      }
      const errText = await res.text();
      throw new Error(`develop respondió ${res.status}: ${errText}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engine] /develop no disponible (${msg}); usando progresión local.`);
    } finally {
      clearTimeout(timer);
    }
  }

  return localDevelop(players, seed);
}

/**
 * S9 · Penalización FDF por experiencia media del once (manual §2): tabla espejo
 * de `getExperiencePenalty` en src/lib/gameUtils.ts (la UI la usa SOLO como
 * visualización; la fuente de verdad es esta).
 */
export function getExperiencePenalty(avgExperience: number): number {
  if (avgExperience >= 91) return 0;
  if (avgExperience >= 81) return 1;
  if (avgExperience >= 71) return 3;
  if (avgExperience >= 61) return 4;
  if (avgExperience >= 51) return 5;
  if (avgExperience >= 41) return 7;
  if (avgExperience >= 31) return 8;
  if (avgExperience >= 21) return 9;
  return 12;
}

/** Construcción/destrucción EFECTIVAS tras la penalización de experiencia del XI. */
function applyExperiencePenalty(roster: EnginePlayer[], tactic: TacticInput): TacticInput {
  const xi = roster.filter(p => p.isStarter).slice(0, 11);
  const pool = xi.length >= 8 ? xi : roster.slice(0, 11);
  if (!pool.length) return tactic;
  const avgExp = Math.round(pool.reduce((s, p) => s + (p.experience ?? 60), 0) / pool.length);
  const pen = getExperiencePenalty(avgExp);
  if (pen === 0) return tactic;
  return {
    ...tactic,
    construction: Math.max(0, (tactic.construction ?? 50) - pen),
    destruction: Math.max(0, (tactic.destruction ?? 50) - pen),
  };
}

function confidencePct(diff: number): number {
  const abs = Math.abs(diff);
  const pct = abs >= 7 ? 0.30 : abs >= 5 ? 0.20 : abs >= 3 ? 0.10 : 0;
  return Math.sign(diff) * pct;
}

/** Aplica la tabla FDF de diferencia de confianza a la construcción. */
export function applyCoachConfidence(
  home: TacticInput,
  away: TacticInput,
  homeConfidence = 50,
  awayConfidence = 50,
): { home: TacticInput; away: TacticInput } {
  const diff = Math.max(-8, Math.min(8, homeConfidence - awayConfidence));
  const homePct = confidencePct(diff);
  const awayPct = confidencePct(-diff);
  const adjusted = (tactic: TacticInput, pct: number): TacticInput => ({
    ...tactic,
    construction: Math.max(0, Math.min(100, Math.round((tactic.construction ?? 50) * (1 + pct)))),
  });
  return { home: adjusted(home, homePct), away: adjusted(away, awayPct) };
}

function mergeProfileBonus(
  current: TacticInput['profileBonus'],
  matchup: TacticInput['profileBonus'],
): TacticInput['profileBonus'] {
  const value = (key: 'attack' | 'defense' | 'midfield') =>
    Math.max(-12, Math.min(12, Number(current?.[key] ?? 0) + Number(matchup?.[key] ?? 0)));
  return { attack: value('attack'), defense: value('defense'), midfield: value('midfield') };
}

export async function simulateGame(
  homeRosterRaw: EnginePlayer[],
  awayRosterRaw: EnginePlayer[],
  homeTacticRaw: TacticInput,
  awayTacticRaw: TacticInput,
  seed: number,
  options: EngineOptions = {},
): Promise<EngineResult> {
  if (!Number.isFinite(seed)) {
    throw new Error('simulateGame requiere una semilla numérica determinista');
  }
  // WT3 · (2) penalización por jugar fuera de la posición detallada — neutro
  // absoluto (mismo array) sin catálogo o sin detailedPosition en el XI.
  const homeRoster = applyPersistentFatigueContext(
    applyDetailedPositionEffects(homeRosterRaw, homeTacticRaw.formation),
    homeTacticRaw.formation,
  );
  const awayRoster = applyPersistentFatigueContext(
    applyDetailedPositionEffects(awayRosterRaw, awayTacticRaw.formation),
    awayTacticRaw.formation,
  );
  // S9: la penalización por experiencia se aplica AQUÍ (punto único para tick,
  // amistosos y endpoints ad-hoc) sobre los valores que guarda el usuario; la UI
  // muestra el mismo efectivo (effectiveConstruction/effectiveDestruction).
  let homeTactic = applyExperiencePenalty(homeRoster, homeTacticRaw);
  let awayTactic = applyExperiencePenalty(awayRoster, awayTacticRaw);
  ({ home: homeTactic, away: awayTactic } = applyCoachConfidence(
    homeTactic,
    awayTactic,
    options.coachConfidenceHome,
    options.coachConfidenceAway,
  ));
  // WT3 · (1) counters suaves piedra-papel-tijera entre formaciones del
  // catálogo: bonus/malus de perfil ADITIVO en la táctica (null ⇒ neutro).
  const matchup = formationMatchupBonus(homeTactic.formation, awayTactic.formation);
  if (matchup) {
    homeTactic = { ...homeTactic, profileBonus: mergeProfileBonus(homeTactic.profileBonus, matchup.home) };
    awayTactic = { ...awayTactic, profileBonus: mergeProfileBonus(awayTactic.profileBonus, matchup.away) };
  }
  if (ENGINE_URL) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const payload = {
        homeTeam: { players: homeRoster.map(p => ({ ...p, id: p.id != null ? String(p.id) : undefined })), tactic: normalizeTacticForEngine(homeTactic) },
        awayTeam: { players: awayRoster.map(p => ({ ...p, id: p.id != null ? String(p.id) : undefined })), tactic: normalizeTacticForEngine(awayTactic) },
        seed,
        knockout: options.knockout === true,
        weatherCondition: options.weatherCondition ?? 'normal',
        temperature: typeof options.temperature === 'number' ? options.temperature : 20,
        // R3: los partidos del tick ya aportan attendancePct real (gateAttendance,
        // la misma fórmula que la taquilla de economy). 75 queda solo como fallback
        // para callers ad-hoc (amistosos/test) sin datos de aforo.
        attendancePct: typeof options.attendancePct === 'number' ? options.attendancePct : (typeof options.stadium_fill === 'number' ? options.stadium_fill : 75),
        homeStimulated: options.homeStimulated === true,
      };

      const res = await fetch(`${ENGINE_URL}/simulate`, {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`engine respondió ${res.status}: ${errText}`);
      }
      const py = await res.json() as any;

      if (Array.isArray(py.events)) {
        py.events.forEach((ev: any) => { if (ev.playerId) ev.playerId = Number(ev.playerId); });
      }
      if (Array.isArray(py.homeRatings)) {
        py.homeRatings.forEach((rt: any) => { if (rt.playerId) rt.playerId = Number(rt.playerId); });
      }
      if (Array.isArray(py.awayRatings)) {
        py.awayRatings.forEach((rt: any) => { if (rt.playerId) rt.playerId = Number(rt.playerId); });
      }
      if (Array.isArray(py.injuries)) {
        py.injuries.forEach((inj: any) => { if (inj.playerId) inj.playerId = Number(inj.playerId); });
      }

      if (Array.isArray(py.timeline) && py.timeline.length > 0 && !Array.isArray(py.replay)) {
        py.replay = py.timeline;
      }
      if (Array.isArray(py.replay) && py.replay.length > 0) return py as EngineResult;
      console.warn('[engine] respuesta Python sin replay; usando motor por fases TS.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engine] motor Python no disponible (${msg}); motor por fases TS.`);
    } finally {
      clearTimeout(timer);
    }
  }

  // R7: el fallback TS recibe las MISMAS palancas ambientales que el motor
  // Python (asistencia/estimulados/temperatura) — una jornada que mezcle
  // motores ya no diverge en silencio en esas variables.
  const weatherCond = String(options.weatherCondition ?? 'normal').toLowerCase();
  const phased = simulatePhasedMatch(homeRoster, awayRoster, homeTactic, awayTactic, seed, {
    coachConfidenceHome: 55,
    coachConfidenceAway: 52,
    pitch: ['rain', 'snow', 'lluvia', 'nieve'].includes(weatherCond)
      ? 'muddy'
      : ['hot', 'calor'].includes(weatherCond)
        ? 'dry'
        : 'normal',
    attendancePct: typeof options.attendancePct === 'number'
      ? options.attendancePct
      : (typeof options.stadium_fill === 'number' ? options.stadium_fill : undefined),
    homeStimulated: options.homeStimulated === true,
    temperature: typeof options.temperature === 'number' ? options.temperature : undefined,
  });
  const fallback: EngineResult = {
    homeGoals: phased.homeGoals,
    awayGoals: phased.awayGoals,
    homeStats: phased.homeStats,
    awayStats: phased.awayStats,
    events: phased.events as unknown as EngineResult['events'],
    motm: phased.motm,
    homeRatings: phased.homeRatings,
    awayRatings: phased.awayRatings,
    replay: phased.replay,
    timeline: phased.replay,
  };
  return options.knockout === true
    ? applyKnockoutFallback(fallback, homeRoster, awayRoster, homeTactic, awayTactic, seed)
    : { ...fallback, knockout: false, decidedBy: 'regular', winner: null };
}

// ─── C8 · Simulación por LOTES: una llamada HTTP por jornada ─────────────────

/** Un partido del lote: mismos argumentos que simulateGame + id de correlación. */
export interface BatchSimJob {
  id: string;                      // p. ej. String(match.id) — se ecoa tal cual
  homeRoster: EnginePlayer[];
  awayRoster: EnginePlayer[];
  homeTactic: TacticInput;
  awayTactic: TacticInput;
  seed: number;
  options?: EngineOptions;
}

/** Coerciona los playerId string del motor Python a number (igual que simulateGame). */
function coerceEngineIds(py: any): void {
  for (const key of ['events', 'homeRatings', 'awayRatings', 'injuries'] as const) {
    if (Array.isArray(py[key])) {
      py[key].forEach((it: any) => { if (it.playerId) it.playerId = Number(it.playerId); });
    }
  }
  if (Array.isArray(py.timeline) && py.timeline.length > 0 && !Array.isArray(py.replay)) {
    py.replay = py.timeline;
  }
}

/** Payload de /simulate para un job (aplica S9, WT3 y normaliza igual que simulateGame). */
function buildSimulatePayload(job: BatchSimJob): Record<string, unknown> {
  const options = job.options ?? {};
  // WT3: mismos ajustes que simulateGame ⇒ lote y partido individual idénticos.
  const homeRoster = applyPersistentFatigueContext(
    applyDetailedPositionEffects(job.homeRoster, job.homeTactic.formation),
    job.homeTactic.formation,
  );
  const awayRoster = applyPersistentFatigueContext(
    applyDetailedPositionEffects(job.awayRoster, job.awayTactic.formation),
    job.awayTactic.formation,
  );
  let homeTactic = applyExperiencePenalty(homeRoster, job.homeTactic);
  let awayTactic = applyExperiencePenalty(awayRoster, job.awayTactic);
  ({ home: homeTactic, away: awayTactic } = applyCoachConfidence(
    homeTactic,
    awayTactic,
    options.coachConfidenceHome,
    options.coachConfidenceAway,
  ));
  const matchup = formationMatchupBonus(homeTactic.formation, awayTactic.formation);
  if (matchup) {
    homeTactic = { ...homeTactic, profileBonus: mergeProfileBonus(homeTactic.profileBonus, matchup.home) };
    awayTactic = { ...awayTactic, profileBonus: mergeProfileBonus(awayTactic.profileBonus, matchup.away) };
  }
  return {
    matchId: job.id,
    homeTeam: { players: homeRoster.map(p => ({ ...p, id: p.id != null ? String(p.id) : undefined })), tactic: normalizeTacticForEngine(homeTactic) },
    awayTeam: { players: awayRoster.map(p => ({ ...p, id: p.id != null ? String(p.id) : undefined })), tactic: normalizeTacticForEngine(awayTactic) },
    seed: job.seed,
    knockout: options.knockout === true,
    weatherCondition: options.weatherCondition ?? 'normal',
    temperature: typeof options.temperature === 'number' ? options.temperature : 20,
    attendancePct: typeof options.attendancePct === 'number' ? options.attendancePct : (typeof options.stadium_fill === 'number' ? options.stadium_fill : 75),
    homeStimulated: options.homeStimulated === true,
  };
}

/**
 * Simula N partidos en UNA llamada HTTP (`POST /simulate-batch` del motor, C8):
 * elimina el roundtrip por partido del tick. Resultados IDÉNTICOS bit a bit a
 * llamar a simulateGame por cada uno (misma semilla ⇒ mismo partido; el motor
 * comparte el código). Si el lote falla o algún item falta, cae a simulateGame
 * individual por partido (que a su vez tiene fallback TS) — nunca pierde partidos.
 *
 * Consumidor: el bucle de jornada de advanceWeek (game.service.ts) prepara los
 * jobs con prepareMatchSimulation y persiste con persistMatchResult (9 jun 2026).
 */
export async function simulateGamesBatch(jobs: BatchSimJob[]): Promise<Map<string, EngineResult>> {
  const out = new Map<string, EngineResult>();
  if (jobs.length === 0) return out;

  /** Un intento de /simulate-batch sobre `pending`; vuelca aciertos en `out`. */
  const tryBatch = async (pending: BatchSimJob[], budgetMs: number): Promise<void> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), budgetMs);
    try {
      const res = await fetch(`${ENGINE_URL}/simulate-batch`, {
        method: 'POST',
        headers: ENGINE_HEADERS,
        body: JSON.stringify({ matches: pending.map(buildSimulatePayload) }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`engine batch respondió ${res.status}: ${await res.text()}`);
      const body = await res.json() as { results?: Array<{ matchId?: string | null; result?: any }> };
      for (const item of body.results ?? []) {
        if (!item?.matchId || !item.result) continue;
        coerceEngineIds(item.result);
        if (Array.isArray(item.result.replay) && item.result.replay.length > 0) {
          out.set(String(item.matchId), item.result as EngineResult);
        }
      }
    } finally {
      clearTimeout(timer);
    }
  };

  if (ENGINE_URL && jobs.length > 1) {
    // R7: presupuesto proporcional al TAMAÑO REAL del lote (BATCH_MS_PER_MATCH
    // configurable) y UN reintento de lote con presupuesto doblado antes de caer
    // a re-simulación individual: con el motor lento, abortar y re-simular TODO
    // partido a partido duplicaba el trabajo justo en el peor momento.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const pending = jobs.filter(job => !out.has(job.id));
      if (pending.length <= 1) break; // 0 ⇒ listo; 1 ⇒ más barato individual
      const budget = (TIMEOUT_MS + pending.length * BATCH_MS_PER_MATCH) * attempt;
      try {
        await tryBatch(pending, budget);
        if (jobs.every(job => out.has(job.id))) break;
        if (attempt === 1) {
          console.warn(`[engine] lote incompleto (${jobs.length - out.size}/${jobs.length} pendientes); reintentando el lote con presupuesto x2.`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === 1) {
          console.warn(`[engine] lote falló (${msg}); reintentando UNA vez con presupuesto x2.`);
        } else {
          console.warn(`[engine] lote no disponible tras reintento (${msg}); simulando partido a partido.`);
        }
      }
    }
  }
  // Rezagados (o lote entero si falló dos veces): partido a partido con todos los fallbacks.
  for (const job of jobs) {
    if (out.has(job.id)) continue;
    out.set(job.id, await simulateGame(job.homeRoster, job.awayRoster,
                                       job.homeTactic, job.awayTactic, job.seed, job.options ?? {}));
  }
  return out;
}
