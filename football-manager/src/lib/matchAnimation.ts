// Contrato publico (Y7):
// - buildMatchAnimationScript(timeline, options) -> frames temporales 3-5 min.
// - zoneLaneToPoint(entry, seed, index) -> coordenada determinista del balon.
// - scoreAtEvent(timeline, index) -> marcador vivo hasta ese evento.
// - frameAtTime(script, elapsedMs) -> frame estable para scrub/playback.
//
// Modulo puro: transforma timeline del motor en estados de animacion. No dibuja,
// no reproduce audio y no depende de React.

import type { Lane, Team, TimelineEntry, TimelinePhase } from '../types/engine';

export interface PitchPoint {
  x: number;
  y: number;
  z?: number;
}

export interface MatchAnimationFrame {
  index: number;
  minute: number;
  phase: TimelinePhase;
  team: Team;
  lane: Lane;
  zone: string;
  startMs: number;
  durationMs: number;
  ballFrom: PitchPoint;
  ballTo: PitchPoint;
  protagonist: { playerId: string | null; name: string | null };
  liveScore: { home: number; away: number };
  isGoal: boolean;
  isShot: boolean;
  chain: TimelineEntry['chain'];
  text: string;
}

export interface GoalMarker {
  index: number;
  minute: number;
  team: Team;
  timeMs: number;
  label: string;
}

export interface MatchAnimationScript {
  frames: MatchAnimationFrame[];
  goalMarkers: GoalMarker[];
  durationMs: number;
  seed: string;
  timelineMinutes: { first: number; last: number };
}

export interface MatchAnimationOptions {
  seed?: string | number;
  minDurationMs?: number;
  maxDurationMs?: number;
  targetDurationMs?: number;
  pitchWidth?: number;
  pitchHeight?: number;
}

const DEFAULT_MIN = 3 * 60 * 1000;
const DEFAULT_MAX = 5 * 60 * 1000;
const DEFAULT_TARGET = 4 * 60 * 1000;

const ZONE_X: Record<string, number> = {
  def: 22,
  defensa: 22,
  med: 50,
  medio: 50,
  ataque: 76,
  final: 82,
  area: 90,
};

const LANE_Y: Record<Lane, number> = {
  left: 18,
  center: 32,
  right: 46,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(seed: string, spread: number): number {
  const unit = hash(seed) / 0xffffffff;
  return (unit - 0.5) * spread;
}

function normalizedLane(lane: unknown): Lane {
  return lane === 'left' || lane === 'right' || lane === 'center' ? lane : 'center';
}

export function zoneLaneToPoint(
  entry: Pick<TimelineEntry, 'team' | 'zone' | 'lane' | 'minute' | 'phase' | 'text'>,
  seed: string | number = 'match',
  index = 0,
  options: Pick<MatchAnimationOptions, 'pitchWidth' | 'pitchHeight'> = {},
): PitchPoint {
  const width = options.pitchWidth ?? 100;
  const height = options.pitchHeight ?? 64;
  const lane = normalizedLane(entry.lane);
  const zoneBase = ZONE_X[String(entry.zone ?? '').toLowerCase()] ?? 50;
  const attackX = entry.team === 'away' ? 100 - zoneBase : zoneBase;
  const mirroredLane = entry.team === 'away'
    ? lane === 'left' ? 'right' : lane === 'right' ? 'left' : 'center'
    : lane;
  const goalPull = entry.phase === 'gol' ? (entry.team === 'away' ? -4 : 4) : 0;
  const x = clamp((attackX + goalPull + jitter(`${seed}:x:${index}:${entry.minute}:${entry.text}`, 5)) / 100 * width, 1, width - 1);
  const y = clamp((LANE_Y[mirroredLane] + jitter(`${seed}:y:${index}:${entry.phase}`, 7)) / 64 * height, 2, height - 2);
  return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
}

function rawDuration(entry: TimelineEntry): number {
  if (entry.phase === 'gol') return 9000;
  if (entry.phase === 'parada') return 6200;
  if (entry.phase === 'remate') return 5200;
  if (entry.phase === 'falta') return 4600;
  if (entry.phase === 'final') return 7000;
  return 3600;
}

function protagonist(entry: TimelineEntry): { playerId: string | null; name: string | null } {
  const chainLast = Array.isArray(entry.chain) ? entry.chain[entry.chain.length - 1] : null;
  const side = entry.duel?.att ?? chainLast?.att ?? null;
  return {
    playerId: entry.playerId != null ? String(entry.playerId) : side?.playerId != null ? String(side.playerId) : null,
    name: side?.name ?? null,
  };
}

export function scoreAtEvent(timeline: readonly TimelineEntry[], index: number): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (let i = 0; i <= index && i < timeline.length; i += 1) {
    const entry = timeline[i];
    if (entry?.phase !== 'gol') continue;
    if (entry.team === 'home') home += 1;
    else away += 1;
  }
  return { home, away };
}

export function buildMatchAnimationScript(
  timeline: readonly TimelineEntry[],
  options: MatchAnimationOptions = {},
): MatchAnimationScript {
  const seed = String(options.seed ?? 'match');
  const entries = [...timeline].sort((a, b) => a.minute - b.minute || phaseOrder(a.phase) - phaseOrder(b.phase));
  if (entries.length === 0) {
    return { frames: [], goalMarkers: [], durationMs: 0, seed, timelineMinutes: { first: 0, last: 0 } };
  }
  const rawTotal = entries.reduce((sum, entry) => sum + rawDuration(entry), 0);
  const min = options.minDurationMs ?? DEFAULT_MIN;
  const max = options.maxDurationMs ?? DEFAULT_MAX;
  const target = clamp(options.targetDurationMs ?? DEFAULT_TARGET, min, max);
  const scale = rawTotal > 0 ? target / rawTotal : 1;
  let cursor = 0;
  let previous = zoneLaneToPoint(entries[0], seed, 0, options);
  const frames: MatchAnimationFrame[] = entries.map((entry, index) => {
    const durationMs = Math.max(900, Math.round(rawDuration(entry) * scale));
    const ballTo = zoneLaneToPoint(entry, seed, index, options);
    const ballFrom = index === 0 ? { x: entry.team === 'away' ? 95 : 5, y: 32 } : previous;
    const frame: MatchAnimationFrame = {
      index,
      minute: entry.minute,
      phase: entry.phase,
      team: entry.team,
      lane: normalizedLane(entry.lane),
      zone: entry.zone,
      startMs: cursor,
      durationMs,
      ballFrom,
      ballTo,
      protagonist: protagonist(entry),
      liveScore: scoreAtEvent(entries, index),
      isGoal: entry.phase === 'gol',
      isShot: entry.phase === 'remate' || entry.phase === 'gol' || entry.phase === 'parada',
      chain: entry.chain ?? null,
      text: entry.text,
    };
    cursor += durationMs;
    previous = ballTo;
    return frame;
  });
  const goalMarkers = frames
    .filter((frame) => frame.isGoal)
    .map((frame) => ({
      index: frame.index,
      minute: frame.minute,
      team: frame.team,
      timeMs: frame.startMs,
      label: `${frame.minute}' ${frame.team === 'home' ? 'Local' : 'Visitante'} ${frame.liveScore.home}-${frame.liveScore.away}`,
    }));
  return {
    frames,
    goalMarkers,
    durationMs: frames.reduce((sum, frame) => sum + frame.durationMs, 0),
    seed,
    timelineMinutes: { first: entries[0]?.minute ?? 0, last: entries[entries.length - 1]?.minute ?? 0 },
  };
}

export function frameAtTime(script: MatchAnimationScript, elapsedMs: number): MatchAnimationFrame | null {
  if (script.frames.length === 0) return null;
  const t = clamp(elapsedMs, 0, script.durationMs);
  return script.frames.find((frame) => t >= frame.startMs && t < frame.startMs + frame.durationMs)
    ?? script.frames[script.frames.length - 1]
    ?? null;
}

function phaseOrder(phase: TimelinePhase): number {
  if (phase === 'saque') return 0;
  if (phase === 'construccion') return 1;
  if (phase === 'progresion') return 2;
  if (phase === 'remate') return 3;
  if (phase === 'parada') return 4;
  if (phase === 'gol') return 5;
  if (phase === 'falta') return 6;
  return 7;
}
