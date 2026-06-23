// ─── Motor FDF moderno por fases ──────────────────────────────────────────────
// 15 jugadas por equipo y mitad → 60 resoluciones, espejo del presupuesto base
// del motor Python (30 por equipo). La decisión de producto del 19-jun mantiene
// el motor moderno en lugar de restaurar las 80 jugadas del manual clásico.
// Fallback principal del backend cuando no hay motor Python.
//
// Especificación FDF:
// - 80 jugadas totales (20 por equipo y parte)
// - Jugada de campo: 5 fases (medio pase, medio desmarque, defensa, tiro, portería)
// - Falta/córner: 3 fases (servicio, remate, portería)
// - Penalti: 2 fases (carrera, definición)
// - % éxito = 50 + (atacante − defensor) * 0.85, clamp [8, 92]
// - Bonus globales: confianza entrenador, terreno, cansancio (reduce const/dest)
// - Eventos: gol, ocasión, tarjeta, lesión, sustitución, penalti, expulsión, MOTM
// - Notas individuales 0–10 + estadísticas por jugador

import type { EnginePlayer } from './engineClient';
import type { TacticInput } from './simulation.engine';

export const PLAYS_PER_TEAM_PER_HALF = 15;

export type PlayKind = 'field' | 'setpiece' | 'penalty';
export type PlayOutcome = 'goal' | 'chance' | 'stop' | 'foul' | 'corner' | 'penalty_awarded';

export interface PhaseResolution {
  index: number;
  label: string;
  attackStat: number;
  defendStat: number;
  successPct: number;
  won: boolean;
  attackerName?: string;
  defenderName?: string;
}

export interface ReplayStep {
  index: number;
  half: 1 | 2;
  minute: number;
  team: 'home' | 'away';
  kind: PlayKind;
  phases: PhaseResolution[];
  outcome: PlayOutcome;
  description: string;
  /** Posición aproximada del balón en el campo: 0-100 (X=izquierda−derecha, Y=arriba−abajo) */
  ballX: number;
  ballY: number;
  playerName?: string;
  /** Zona de campo para el visualizador Championship Manager style */
  fieldZone?: 'own_half' | 'midfield' | 'attack_third' | 'penalty_area';
  /** Acción narrativa para el visualizador */
  action?: string;
}

export interface PlayerMatchStats {
  name: string;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  tackles: number;
}

export interface PhasedMatchStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export interface PhasedEvent {
  minute: number;
  type: string;
  team: 'home' | 'away';
  description: string;
  playerId?: number;
  playerName?: string;
  playerOut?: string; // para sustituciones
}

export interface PhasedSimulationResult {
  homeGoals: number;
  awayGoals: number;
  homeStats: PhasedMatchStats;
  awayStats: PhasedMatchStats;
  events: PhasedEvent[];
  motm: string;
  homeRatings: PlayerMatchStats[];
  awayRatings: PlayerMatchStats[];
  replay: ReplayStep[];
}

export interface MatchSimContext {
  coachConfidenceHome?: number;
  coachConfidenceAway?: number;
  pitch?: 'dry' | 'normal' | 'muddy';
  // R7: palancas ambientales — mismas que el motor Python (manual §2.10) para
  // que una jornada que mezcle motores no diverja en silencio. Todas opcionales:
  // ausentes ⇒ efecto neutro ⇒ resultados idénticos a antes.
  /** % de lleno del estadio: bonus por posición SOLO para el equipo local. */
  attendancePct?: number;
  /** Discurso del entrenador local ("estimulados"): POR+1 DEF+1 MED+2 DEL+4. */
  homeStimulated?: boolean;
  /** Temperatura en ºC: lejos de 18º ±10 acelera la fatiga tras el minuto 60. */
  temperature?: number;
}

// R7 · Bonus por asistencia al estadio (espejo de _attendance_bonus del motor
// Python, manual §2.10): puntos por posición según % de lleno (>90 / >70 / resto)
// y extra si el entrenador dio el discurso. Solo equipo LOCAL.
const ATTENDANCE_TIERS: Record<string, [number, number, number]> = {
  POR: [0, 0, 0], DEF: [2, 1, 0], MED: [3, 2, 1], DEL: [5, 3, 2],
};
const STIMULATED_EXTRA: Record<string, number> = { POR: 1, DEF: 1, MED: 2, DEL: 4 };

function attendanceBonus(pct: number | undefined, stimulated: boolean): Record<string, number> | null {
  if (pct == null && !stimulated) return null;
  const tier = pct == null ? 2 : pct > 90 ? 0 : pct > 70 ? 1 : 2;
  const bonus: Record<string, number> = {};
  for (const [pos, vals] of Object.entries(ATTENDANCE_TIERS)) {
    bonus[pos] = pct != null ? vals[tier] : 0;
  }
  if (stimulated) {
    for (const [pos, extra] of Object.entries(STIMULATED_EXTRA)) {
      bonus[pos] = (bonus[pos] ?? 0) + extra;
    }
  }
  return bonus;
}

/** R7 · Penalización de resistencia por temperatura (espejo de _weather_factors
 * del motor Python): neutro (0) entre 8º y 28º, crece al alejarse de 18º±10. */
function temperaturePenalty(temperature: number | undefined): number {
  if (typeof temperature !== 'number' || !Number.isFinite(temperature)) return 0;
  return Math.max(0, Math.abs(temperature - 18) - 10) / 40;
}

const FORMATION_MOD: Record<string, [number, number]> = {
  '4-4-2': [0, 0], '4-3-3': [8, -5], '4-2-3-1': [4, 2], '3-5-2': [2, 0],
  '5-3-2': [-3, 8], '5-4-1': [-6, 12], '3-2-3-2': [6, -4], '4-5-1': [-4, 6],
};

const HOME_ADV_DEFAULT = 3;

// ─── Minuto a partir del cual el cansancio empieza a penalizar ─────────────────
const FATIGUE_ONSET_MINUTE = 60;

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function rng(seed: number): () => number {
  let s = seed ^ 0xdeadbeef;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

function attr(p: EnginePlayer, key: keyof EnginePlayer, d = 50): number {
  const v = p[key];
  return typeof v === 'number' ? v : d;
}

function mean(vals: number[], fallback = 50): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
}

function selectXi(players: EnginePlayer[]): EnginePlayer[] {
  const starters = players.filter((p) => p.isStarter).slice(0, 11);
  if (starters.length >= 11) return starters;
  const overall = (p: EnginePlayer) =>
    mean([attr(p, 'passing'), attr(p, 'tackling'), attr(p, 'shooting'), attr(p, 'organization'),
      attr(p, 'unmarking'), attr(p, 'finishing'), attr(p, 'dribbling'), attr(p, 'goalkeeping')]);
  const rest = [...players].filter((p) => !starters.includes(p)).sort((a, b) => overall(b) - overall(a));
  return [...starters, ...rest].slice(0, 11);
}

function byPos(xi: EnginePlayer[], pos: string): EnginePlayer[] {
  return xi.filter((p) => p.position === pos);
}

function pickWeighted(xi: EnginePlayer[], r: () => number, scorer = false): EnginePlayer {
  const weights = xi.map((p) => {
    let w = attr(p, 'finishing') + attr(p, 'unmarking') * 0.4;
    if (scorer) {
      if (p.position === 'DEL') w *= 2.2;
      else if (p.position === 'MED') w *= 1.1;
      else if (p.position === 'DEF') w *= 0.35;
      else w *= 0.08;
    }
    return Math.max(1, w);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = r() * total;
  for (let i = 0; i < xi.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return xi[i];
  }
  return xi[xi.length - 1];
}

interface TeamProfile {
  xi: EnginePlayer[];
  bench: EnginePlayer[];
  gk: EnginePlayer | null;
  construction: number;
  destruction: number;
  attack: number;
  defense: number;
  midfield: number;
  fatiguePenalty: number;
  avgFitness: number;
  /** R7: penalización por temperatura (0 = neutro); acelera la fatiga tras el 60'. */
  tempPenalty: number;
}

function buildProfile(
  roster: EnginePlayer[],
  tactic: TacticInput,
  isHome: boolean,
  ctx: MatchSimContext,
  coachConfidence: number,
): TeamProfile {
  const xi = selectXi(roster);
  const bench = roster.filter((p) => !xi.includes(p));
  const mids = byPos(xi, 'MED');
  const defs = byPos(xi, 'DEF');
  const fwds = byPos(xi, 'DEL');
  const gks = byPos(xi, 'POR');
  const [fAtt, fDef] = FORMATION_MOD[tactic.formation] ?? [0, 0];

  const fitness = mean(xi.map((p) => attr(p, 'fitness', 100)), 100);
  const morale = mean(xi.map((p) => attr(p, 'morale', 75)), 75);
  const fitMult = fitness >= 70 ? 1 : 0.7 + (fitness / 70) * 0.3;
  const moraleF = (morale - 50) / 100;
  const pitchMod = ctx.pitch === 'muddy' ? -4 : ctx.pitch === 'dry' ? 2 : 0;
  const confMod = (coachConfidence - 50) / 25;
  const homeAdv = isHome ? (tactic.homeAdvantage ?? HOME_ADV_DEFAULT) : 0;

  let build = mean(mids.map((p) => (attr(p, 'organization') + attr(p, 'passing')) / 2),
    mean(xi.map((p) => attr(p, 'organization'))));
  let finish = mean(fwds.map((p) => (attr(p, 'finishing') + attr(p, 'shooting') + attr(p, 'unmarking')) / 3),
    mean(xi.map((p) => attr(p, 'finishing'))));
  let tackle = mean(defs.map((p) => attr(p, 'tackling')), mean(xi.map((p) => attr(p, 'tackling'))));
  tackle = 0.8 * tackle + 0.2 * mean(mids.map((p) => attr(p, 'tackling')), tackle);

  // R7 · Bonus de asistencia/estimulados SOLO para el local (espejo del motor
  // Python: puntos por posición sobre las unidades; null ⇒ perfil intacto).
  if (isHome) {
    const posBonus = attendanceBonus(ctx.attendancePct, ctx.homeStimulated === true);
    if (posBonus) {
      build += posBonus.MED ?? 0;
      finish += posBonus.DEL ?? 0;
      tackle += posBonus.DEF ?? 0;
    }
  }

  const construction = clamp(tactic.construction + confMod * 3 + pitchMod);
  const destruction = clamp(tactic.destruction + confMod * 2 + pitchMod);

  // WT3 · Counter de formaciones (profileBonus, calculado en formationEffects):
  // aditivo; 0/ausente = neutro absoluto (espejo del motor Python).
  const pb = tactic.profileBonus ?? {};
  const pbAtt = Number(pb.attack ?? 0) || 0;
  const pbDef = Number(pb.defense ?? 0) || 0;
  const pbMid = Number(pb.midfield ?? 0) || 0;

  const attack = clamp(clamp(0.55 * build + 0.45 * finish + fAtt + construction / 12 + moraleF * 5) * fitMult + homeAdv + pbAtt);
  const defense = clamp(clamp(tackle + fDef + destruction / 12 + moraleF * 3) * fitMult + homeAdv / 2 + pbDef);
  const midfield = clamp(clamp(build + moraleF * 4) * fitMult + pbMid);

  const avgFitness = fitness;
  const fatiguePenalty = avgFitness < 70 ? Math.floor((70 - avgFitness) / 8) : 0;

  return {
    xi, bench,
    gk: gks[0] ?? null,
    construction, destruction,
    attack, defense, midfield,
    fatiguePenalty, avgFitness,
    tempPenalty: temperaturePenalty(ctx.temperature),
  };
}

class RatingBook {
  private scores = new Map<string, number>();
  private goals = new Map<string, number>();
  private assists = new Map<string, number>();
  private shots = new Map<string, number>();
  private passes = new Map<string, number>();
  private tackles = new Map<string, number>();

  constructor(xi: EnginePlayer[]) {
    for (const p of xi) {
      this.scores.set(p.name, 6);
      this.goals.set(p.name, 0);
      this.assists.set(p.name, 0);
      this.shots.set(p.name, 0);
      this.passes.set(p.name, 0);
      this.tackles.set(p.name, 0);
    }
  }

  add(name: string, delta: number): void {
    if (this.scores.has(name)) this.scores.set(name, (this.scores.get(name) ?? 6) + delta);
  }

  ratingFor(name: string): number {
    return this.scores.get(name) ?? 6;
  }

  bump(name: string, field: 'goals' | 'assists' | 'shots' | 'passes' | 'tackles'): void {
    const map = { goals: this.goals, assists: this.assists, shots: this.shots, passes: this.passes, tackles: this.tackles }[field];
    map.set(name, (map.get(name) ?? 0) + 1);
    if (field === 'goals') this.add(name, 1.2);
    if (field === 'assists') this.add(name, 0.45);
    if (field === 'tackles') this.add(name, 0.2);
    if (field === 'passes') this.add(name, 0.08);
  }

  toList(xi: EnginePlayer[]): PlayerMatchStats[] {
    return xi.map((p) => ({
      name: p.name,
      rating: Math.round(clamp(this.scores.get(p.name) ?? 6, 3, 10) * 10) / 10,
      goals: this.goals.get(p.name) ?? 0,
      assists: this.assists.get(p.name) ?? 0,
      shots: this.shots.get(p.name) ?? 0,
      passes: this.passes.get(p.name) ?? 0,
      tackles: this.tackles.get(p.name) ?? 0,
    }));
  }
}

/**
 * Calcula la penalización por cansancio en función del minuto del partido.
 * A partir del minuto 60, la construcción y destrucción se reducen
 * progresivamente según el fitness medio del equipo.
 */
function fatigueFactor(minute: number, avgFitness: number, tempPenalty = 0): number {
  if (minute <= FATIGUE_ONSET_MINUTE) return 1.0;
  // Cada minuto por encima de 60 penaliza más si el fitness es bajo.
  // R7: la temperatura extrema (espejo de _fatigue_mult del motor Python) añade
  // decaimiento extra tras el 60'; tempPenalty=0 ⇒ fórmula idéntica a la previa.
  const overtime = minute - FATIGUE_ONSET_MINUTE;
  const fitnessMod = Math.max(0, (85 - avgFitness) / 85);
  const tempDecay = (overtime / 30) * tempPenalty * 0.25;
  return Math.max(0.5, 1.0 - overtime * 0.005 * (1 + fitnessMod) - tempDecay);
}

function phaseSuccess(att: number, def: number, attBonus: number, defBonus: number, r: () => number): PhaseResolution {
  const attackStat = clamp(att + attBonus);
  const defendStat = clamp(def + defBonus);
  const successPct = clamp(50 + (attackStat - defendStat) * 0.85, 8, 92);
  const won = r() * 100 < successPct;
  return { index: 0, label: '', attackStat, defendStat, successPct, won };
}

function runPhases(
  kind: PlayKind,
  att: TeamProfile,
  def: TeamProfile,
  attXi: EnginePlayer[],
  defXi: EnginePlayer[],
  r: () => number,
  minute: number,
): { phases: PhaseResolution[]; completed: boolean; scorerName: string; assistName?: string } {
  // Aplicar factor de cansancio al boost de construcción/destrucción
  const fatigue = fatigueFactor(minute, att.avgFitness, att.tempPenalty);
  const defFatigue = fatigueFactor(minute, def.avgFitness, def.tempPenalty);
  const attBoost = (att.construction / 25 - att.fatiguePenalty) * fatigue;
  const defBoost = (def.destruction / 25 - def.fatiguePenalty) * defFatigue;

  const mid = pickWeighted(byPos(attXi, 'MED').length ? byPos(attXi, 'MED') : attXi, r);
  const fwd = pickWeighted(byPos(attXi, 'DEL').length ? byPos(attXi, 'DEL') : attXi, r, true);
  const defLine = pickWeighted(byPos(defXi, 'DEF').length ? byPos(defXi, 'DEF') : defXi, r);
  const gk = def.gk ?? defLine;

  // Asistente potencial: centrocampista diferente al que marca
  const potentialAst = byPos(attXi, 'MED').filter(p => p.name !== fwd.name && p.name !== mid.name);

  const specs: { label: string; a: number; d: number; attacker?: string; defender?: string }[] =
    kind === 'penalty'
      ? [
          { label: 'Carrera al punto', a: attr(fwd, 'shooting'), d: attr(gk, 'reflexes', attr(gk, 'goalkeeping')), attacker: fwd.name, defender: gk.name },
          { label: 'Definición de penalti', a: attr(fwd, 'finishing'), d: attr(gk, 'reflexes', attr(gk, 'goalkeeping')), attacker: fwd.name, defender: gk.name },
        ]
      : kind === 'setpiece'
        ? [
            { label: 'Servicio a balón parado', a: attr(mid, 'passing'), d: attr(defLine, 'tackling'), attacker: mid.name, defender: defLine.name },
            { label: 'Remate de córner/falta', a: attr(fwd, 'finishing'), d: attr(defLine, 'tackling'), attacker: fwd.name, defender: defLine.name },
            { label: 'Parada del portero', a: attr(fwd, 'finishing'), d: attr(gk, 'reflexes', attr(gk, 'goalkeeping')), attacker: fwd.name, defender: gk.name },
          ]
        : [
            { label: 'Construcción de juego (pase)', a: (attr(mid, 'passing') + attr(mid, 'organization')) / 2, d: attr(defLine, 'tackling'), attacker: mid.name, defender: defLine.name },
            { label: 'Desmarque en mediocampo', a: (attr(mid, 'dribbling') + attr(mid, 'unmarking')) / 2, d: (attr(defLine, 'organization') + attr(defLine, 'tackling')) / 2, attacker: mid.name, defender: defLine.name },
            { label: 'Superación de la defensa', a: (attr(fwd, 'unmarking') + attr(fwd, 'shooting')) / 2, d: attr(defLine, 'tackling'), attacker: fwd.name, defender: defLine.name },
            { label: 'Tiro a puerta', a: (attr(fwd, 'finishing') + attr(fwd, 'shooting')) / 2, d: attr(defLine, 'tackling'), attacker: fwd.name, defender: defLine.name },
            { label: 'Mano a mano con el portero', a: attr(fwd, 'finishing'), d: attr(gk, 'reflexes', attr(gk, 'goalkeeping')), attacker: fwd.name, defender: gk.name },
          ];

  const phases: PhaseResolution[] = [];
  for (let i = 0; i < specs.length; i++) {
    const pr = phaseSuccess(specs[i].a, specs[i].d, attBoost, defBoost, r);
    pr.index = i + 1;
    pr.label = specs[i].label;
    pr.attackerName = specs[i].attacker;
    pr.defenderName = specs[i].defender;
    phases.push(pr);
    if (!pr.won) return { phases, completed: false, scorerName: fwd.name };
  }

  const assistName = potentialAst.length > 0 && r() < 0.6
    ? potentialAst[Math.floor(r() * potentialAst.length)].name
    : undefined;

  return { phases, completed: true, scorerName: fwd.name, assistName };
}

/** Mapea coordenadas del balón a zona del campo para el visualizador. */
function ballToZone(ballX: number, team: 'home' | 'away'): ReplayStep['fieldZone'] {
  // ballX: 0-100, donde 0=portería visitante, 100=portería local (perspectiva del local)
  const x = team === 'home' ? ballX : 100 - ballX;
  if (x < 25) return 'own_half';
  if (x < 45) return 'midfield';
  if (x < 75) return 'attack_third';
  return 'penalty_area';
}

/** Texto narrativo de la acción para el replay. */
function buildActionText(
  kind: PlayKind,
  outcome: PlayOutcome,
  playerName: string,
  assistName: string | undefined,
): string {
  if (outcome === 'goal') {
    if (assistName) return `⚽ GOL de ${playerName} (asistencia de ${assistName})`;
    return `⚽ GOLAZO de ${playerName}`;
  }
  if (outcome === 'chance') return `🧤 Gran ocasión de ${playerName}, parada`;
  if (outcome === 'corner') return `🚩 Córner a favor`;
  if (outcome === 'foul') return `🟡 Falta sobre ${playerName}`;
  if (outcome === 'penalty_awarded') return `🔴 PENALTI a favor (sobre ${playerName})`;
  if (kind === 'penalty') return `Penalti detenido`;
  return `${playerName} pierde el balón`;
}

export function simulatePhasedMatch(
  homeRoster: EnginePlayer[],
  awayRoster: EnginePlayer[],
  homeTactic: TacticInput,
  awayTactic: TacticInput,
  seed: number,
  ctx: MatchSimContext = {},
): PhasedSimulationResult {
  if (!Number.isFinite(seed)) {
    throw new Error('simulatePhasedMatch requiere una semilla numérica determinista');
  }
  const r = rng(seed);
  const home = buildProfile(homeRoster, homeTactic, true, ctx, ctx.coachConfidenceHome ?? 55);
  const away = buildProfile(awayRoster, awayTactic, false, ctx, ctx.coachConfidenceAway ?? 55);

  const homeRt = new RatingBook(home.xi);
  const awayRt = new RatingBook(away.xi);

  const replay: ReplayStep[] = [];
  const events: PhasedEvent[] = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let hShots = 0;
  let aShots = 0;
  let hSot = 0;
  let aSot = 0;
  let hCorners = 0;
  let aCorners = 0;
  let hFouls = 0;
  let aFouls = 0;
  let hYellows = 0;
  let aYellows = 0;
  let hReds = 0;
  let aReds = 0;

  let playIndex = 0;

  // Control de sustituciones (3 por equipo)
  const homeSubs: { out: string; in: string; minute: number }[] = [];
  const awaySubs: { out: string; in: string; minute: number }[] = [];
  let homeSubsDone = 0;
  let awaySubsDone = 0;

  const totalMid = home.midfield + away.midfield || 1;
  const homePossPct = clamp((home.midfield / totalMid) * 100, 32, 68);

  // XI mutable para sustituciones
  let homeXi = [...home.xi];
  let awayXi = [...away.xi];

  for (const half of [1, 2] as const) {
    for (const team of ['home', 'away'] as const) {
      const att = team === 'home' ? home : away;
      const def = team === 'home' ? away : home;
      const attRt = team === 'home' ? homeRt : awayRt;
      const defRt = team === 'home' ? awayRt : homeRt;
      const attXi = team === 'home' ? homeXi : awayXi;
      const defXi = team === 'home' ? awayXi : homeXi;

      for (let p = 0; p < PLAYS_PER_TEAM_PER_HALF; p++) {
        playIndex++;
        const minute = half === 1 ? 1 + Math.floor(r() * 44) : 46 + Math.floor(r() * 44);
        const roll = r();

        // Sustitución táctica: en la segunda parte si el equipo tiene bench y subs disponibles
        if (half === 2 && minute >= 55 && minute <= 85 && r() < 0.04) {
          const subsArr = team === 'home' ? homeSubs : awaySubs;
          const subsDone = team === 'home' ? homeSubsDone : awaySubsDone;
          const bench = att.bench;
          const curXi = team === 'home' ? homeXi : awayXi;

          if (subsDone < 3 && bench.length > 0) {
            // Sustituir al jugador con menor nota
            const outPlayer = [...curXi]
              .filter(pl => pl.position !== 'POR')
              .sort((a, b) => {
                const rA = attRt.ratingFor(a.name);
                const rB = attRt.ratingFor(b.name);
                return rA - rB;
              })[0];
            const subIn = bench[Math.floor(r() * bench.length)];

            if (outPlayer && subIn) {
              const subDesc = `🔄 Sustitución: entra ${subIn.name}, sale ${outPlayer.name} (min. ${minute})`;
              events.push({ minute, type: 'substitution', team, description: subDesc, playerName: subIn.name, playerOut: outPlayer.name });
              subsArr.push({ out: outPlayer.name, in: subIn.name, minute });
              // Actualizar XI con la sustitución
              if (team === 'home') {
                homeXi = homeXi.map(pl => pl.name === outPlayer.name ? subIn : pl);
                homeSubsDone++;
              } else {
                awayXi = awayXi.map(pl => pl.name === outPlayer.name ? subIn : pl);
                awaySubsDone++;
              }
            }
          }
        }

        const kind: PlayKind = roll < 0.03 ? 'penalty' : roll < 0.15 ? 'setpiece' : 'field';

        const { phases, completed, scorerName, assistName } = runPhases(
          kind, att, def, attXi, defXi, r, minute,
        );
        const scorer = attXi.find(pl => pl.name === scorerName) ?? attXi[0];
        const sname = scorer.name;

        // Posición aproximada del balón según resultado de las fases
        const lastPhase = phases[phases.length - 1];
        const progressPct = phases.filter(ph => ph.won).length / Math.max(phases.length, 1);
        const ballX = team === 'home'
          ? 50 + progressPct * 45 + r() * 5
          : 50 - progressPct * 45 - r() * 5;
        const ballY = 15 + r() * 70;

        let outcome: PlayOutcome = 'stop';
        let description = `${sname} pierde el balón`;
        let eventType: string | null = null;

        if (team === 'home') hShots++;
        else aShots++;

        if (!completed) {
          const lastFailedPhase = lastPhase;
          const isEarlyFail = (lastFailedPhase?.index ?? 1) <= 2;

          if (!isEarlyFail && r() < 0.28) {
            // Falta en área de ataque → posible penalti
            if (r() < 0.06) {
              outcome = 'penalty_awarded';
              description = `Penalti a favor del ${team === 'home' ? 'local' : 'visitante'} sobre ${sname}`;
              eventType = 'penalty';
              if (team === 'home') hFouls++; else aFouls++;
              // Simular el penalti inmediatamente
              const pkPhases = [
                phaseSuccess(attr(scorer, 'shooting'), attr(def.gk ?? defXi[0], 'reflexes', attr(def.gk ?? defXi[0], 'goalkeeping')), att.construction / 25, def.destruction / 25, r),
                phaseSuccess(attr(scorer, 'finishing'), attr(def.gk ?? defXi[0], 'reflexes', attr(def.gk ?? defXi[0], 'goalkeeping')), att.construction / 25, def.destruction / 25, r),
              ];
              pkPhases[0].label = 'Carrera al punto';
              pkPhases[1].label = 'Definición de penalti';
              if (pkPhases.every(ph => ph.won)) {
                outcome = 'goal';
                description = `⚽ Gol de penalti de ${sname}`;
                attRt.bump(sname, 'goals');
                if (team === 'home') homeGoals++; else awayGoals++;
                events.push({ minute, type: 'goal', team, description, playerName: sname });
              }
            } else {
              outcome = 'foul';
              description = `Falta sobre ${sname}`;
              eventType = 'foul';
              if (team === 'home') hFouls++; else aFouls++;
              // ¿Tarjeta amarilla?
              if (r() < 0.18) {
                const culprit = pickWeighted(defXi, r);
                if (team === 'home') { aYellows++; } else { hYellows++; }
                defRt.add(culprit.name, -0.3);
                events.push({
                  minute,
                  type: 'yellow',
                  team: team === 'home' ? 'away' : 'home',
                  description: `🟨 Amarilla a ${culprit.name}`,
                  playerId: Number.isSafeInteger(Number(culprit.id)) ? Number(culprit.id) : undefined,
                  playerName: culprit.name,
                });
              }
              // Convierte falta en córner ocasionalmente
              if (r() < 0.25) {
                outcome = 'corner';
                description = `🚩 Córner a favor del ${team === 'home' ? 'local' : 'visitante'}`;
                if (team === 'home') hCorners++; else aCorners++;
              }
            }
          } else if (r() < 0.12) {
            outcome = 'corner';
            description = `🚩 Córner`;
            eventType = 'corner';
            if (team === 'home') hCorners++; else aCorners++;
          }
        } else {
          if (team === 'home') hSot++; else aSot++;
          const gk = def.gk;
          const finishDiff = attr(scorer, 'finishing') - (gk ? attr(gk, 'reflexes', attr(gk, 'goalkeeping')) : 55) + att.construction / 30 - def.destruction / 35;
          const goalPct = clamp(28 + finishDiff * 0.55, 6, 78);
          if (r() * 100 < goalPct) {
            outcome = 'goal';
            if (assistName) {
              description = `⚽ Gol de ${sname} (asist. ${assistName})`;
              attRt.bump(assistName, 'assists');
              attRt.bump(assistName, 'passes');
            } else {
              description = `⚽ Gol de ${sname}`;
            }
            eventType = 'goal';
            attRt.bump(sname, 'goals');
            attRt.bump(sname, 'shots');
            if (team === 'home') homeGoals++; else awayGoals++;
          } else {
            outcome = 'chance';
            description = gk ? `🧤 Paradón de ${gk.name} ante ${sname}` : `Ocasión de ${sname}`;
            eventType = 'save';
            attRt.bump(sname, 'shots');
            if (gk) {
              defRt.add(gk.name, 0.25);
              defRt.bump(gk.name, 'tackles');
            }
          }
        }

        const zone = ballToZone(ballX, team);
        const action = buildActionText(kind, outcome, sname, assistName);

        replay.push({
          index: playIndex,
          half,
          minute,
          team,
          kind,
          phases,
          outcome,
          description,
          ballX: Math.round(ballX),
          ballY: Math.round(ballY),
          playerName: sname,
          fieldZone: zone,
          action,
        });

        if (eventType && eventType !== 'penalty') {
          events.push({ minute, type: eventType, team, description, playerName: sname });
        }
      }
    }
  }

  // ─── Disciplina extra y roja ocasional ───────────────────────────────────────
  for (const [team, prof, rt] of [['home', home, homeRt], ['away', away, awayRt]] as const) {
    const extraFouls = 4 + Math.floor(r() * 6);
    for (let i = 0; i < extraFouls; i++) {
      if (team === 'home') hFouls++; else aFouls++;
      if (r() < 0.14) {
        const culprit = pickWeighted(prof.xi, r);
        if (team === 'home') hYellows++; else aYellows++;
        rt.add(culprit.name, -0.3);
        events.push({
          minute: 10 + Math.floor(r() * 80),
          type: 'yellow',
          team,
          description: `🟨 Amarilla a ${culprit.name}`,
          playerId: Number.isSafeInteger(Number(culprit.id)) ? Number(culprit.id) : undefined,
          playerName: culprit.name,
        });
      }
    }
    // Roja directa (~7%) o segunda amarilla (~4%)
    if (r() < 0.07) {
      const culprit = pickWeighted(prof.xi.filter(p => p.position !== 'POR'), r);
      if (team === 'home') hReds++; else aReds++;
      rt.add(culprit.name, -1.2);
      events.push({
        minute: 20 + Math.floor(r() * 70),
        type: 'red',
        team,
        description: `🟥 Expulsado ${culprit.name}`,
        playerId: Number.isSafeInteger(Number(culprit.id)) ? Number(culprit.id) : undefined,
        playerName: culprit.name,
      });
    }
  }

  // ─── Lesión: ~20% de partidos ─────────────────────────────────────────────
  if (r() < 0.2) {
    const injuredTeam = r() < 0.5 ? home : away;
    const injured = pickWeighted(injuredTeam.xi.filter(p => p.position !== 'POR'), r);
    const teamSide = injuredTeam === home ? 'home' : 'away';
    const injMin = 15 + Math.floor(r() * 75);
    events.push({
      minute: injMin,
      type: 'injury',
      team: teamSide,
      description: `🩹 Lesión de ${injured.name} (min. ${injMin})`,
      playerName: injured.name,
    });
  }

  // ─── Ajuste de notas por resultado ───────────────────────────────────────────
  const applyConceded = (prof: TeamProfile, rt: RatingBook, conceded: number) => {
    if (prof.gk) {
      rt.add(prof.gk.name, conceded === 0 ? 0.75 : -0.22 * conceded);
    }
    for (const p of prof.xi) {
      if (p.position === 'DEF') rt.add(p.name, conceded === 0 ? 0.35 : -0.1 * conceded);
    }
  };
  applyConceded(home, homeRt, awayGoals);
  applyConceded(away, awayRt, homeGoals);
  if (homeGoals !== awayGoals) {
    const [wRt, lRt, wXi, lXi] = homeGoals > awayGoals
      ? [homeRt, awayRt, home.xi, away.xi]
      : [awayRt, homeRt, away.xi, home.xi];
    for (const p of wXi) wRt.add(p.name, 0.28);
    for (const p of lXi) lRt.add(p.name, -0.18);
  }

  events.sort((a, b) => a.minute - b.minute);
  replay.sort((a, b) => a.minute - b.minute || a.index - b.index);

  const homeRatings = homeRt.toList(home.xi);
  const awayRatings = awayRt.toList(away.xi);
  const pool = [...homeRatings, ...awayRatings].map((x) => ({ rating: x.rating, goals: x.goals, name: x.name }));
  const motm = pool.length
    ? pool.sort((a, b) => b.rating - a.rating || b.goals - a.goals)[0].name
    : 'Desconocido';

  return {
    homeGoals,
    awayGoals,
    homeStats: {
      possession: Math.round(homePossPct),
      shots: hShots,
      shotsOnTarget: hSot,
      corners: hCorners,
      fouls: hFouls,
      yellowCards: hYellows,
      redCards: hReds,
    },
    awayStats: {
      possession: 100 - Math.round(homePossPct),
      shots: aShots,
      shotsOnTarget: aSot,
      corners: aCorners,
      fouls: aFouls,
      yellowCards: aYellows,
      redCards: aReds,
    },
    events,
    motm,
    homeRatings,
    awayRatings,
    replay,
  };
}
