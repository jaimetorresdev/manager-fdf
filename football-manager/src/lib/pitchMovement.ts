// Posicionamiento táctico + MOVIMIENTO FLUIDO — balón, jugadores y disparos
// coherentes con el timeline. El balón fluye por waypoints con interpolación de
// velocidad continua (Catmull-Rom centrípeto) en juego abierto y conserva la
// lógica de dos tramos en remate/gol/parada (cruza la línea y entra en la red).
// El portero ataja (parada) o queda batido (gol). Los jugadores corren con
// zancada/inclinación según su velocidad. El portador del balón nunca queda sin
// identificar. Módulo puro: transforma el timeline del motor en estados de animación.
import { zoneLaneToPoint, type PitchPoint } from './matchAnimation';
import type { DuelSide, Lane, TimelineEntry } from '../types/engine';

export interface PitchPlayer {
  name: string;
  playerId?: string | null;
  position?: string;
  rating?: number;
}

export type GkAction = 'set' | 'dive' | 'catch' | 'beaten';
export type DuelRole = 'beaten' | 'tackler' | 'marker';

export interface PlacedPlayer extends PitchPlayer {
  x: number;
  y: number;
  gk: boolean;
  line: string;
  isCarrier: boolean;
  isSupport: boolean;
  /** Rol en el duelo del evento (defensor batido / que entra / que marca). */
  duelRole?: DuelRole;
  /** Dorsal estable (índice de plantilla), compartido con el HUD del portador. */
  number: number;
  /** Esfuerzo 0..1 de este paso (para la animación de carrera). */
  speed: number;
  /** Rumbo del desplazamiento en radianes (para inclinación/orientación). */
  heading: number;
  /** Acción del portero en jugadas de área (atajada/batido) para la pose. */
  gkAction?: GkAction;
  /** Altura del balón hacia la que reacciona el portero (estirada). */
  gkDiveY?: number;
  /** Elevación 0..1 (portero estirado / rematador en salto de cabeza). */
  z?: number;
  /** Colocado por la coreografía de la cadena → la separación global NO lo mueve
   *  (sí repele a los demás), para que la espina de la jugada no tiemble. */
  pinned?: boolean;
}

export interface ShotTrajectory {
  show: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0–1 progreso del disparo dentro de la jugada */
  progress: number;
}

const W = 100, CY = 32;

// ── Geometría de portería (espejada en Pitch2D.tsx) ──────────────────────────
export const GOAL = {
  POST_TOP: 26.5,
  POST_BOT: 37.5,
  HALF_H: 5.5,
  LINE_HOME: 100,
  LINE_AWAY: 0,
  NET_DEPTH: 3.4,
  NET_INSET: 1.8,
} as const;
const GOAL_Y_MIN = GOAL.POST_TOP + 1.1; // 27.6
const GOAL_Y_MAX = GOAL.POST_BOT - 1.1; // 36.4

const LINE_X: Record<string, number> = { POR: 5.5, DEF: 17, MED: 38, DEL: 58 };
const ORDER = ['POR', 'DEF', 'MED', 'DEL'];
// Bloque coherente: el equipo se desplaza/comprime como una UNIDAD hacia el balón.
const LONG_PULL = 0.34, LAT_PULL = 0.42;      // arrastre longitudinal / lateral del bloque
const LEN_SCALE_DEF = 0.82, WID_SCALE_DEF = 0.86; // compactación al defender (largo/ancho)
const LINE_KX: Record<string, number> = { POR: 0.05, DEF: 0.3, MED: 0.45, DEL: 0.6 };
const LINE_WEIGHT: Record<string, number> = { POR: 0.04, DEF: 0.34, MED: 0.56, DEL: 0.82 };
const LANE_Y: Record<Lane, number> = { left: 20, center: 32, right: 44 };

// ── Posiciones detalladas (15 roles del doc de diseño) → alineación real ──────
// line = macro; dx = ajuste de profundidad sobre la X de su línea; side = lado
// (-1 arriba/izquierda .. +1 abajo/derecha) para ordenar y abrir el once.
const DPOS: Record<string, { line: string; dx: number; side: number }> = {
  POR: { line: 'POR', dx: 0, side: 0 },
  LD: { line: 'DEF', dx: 1, side: 1 }, LI: { line: 'DEF', dx: 1, side: -1 }, CT: { line: 'DEF', dx: 0, side: 0 },
  PIV: { line: 'MED', dx: -6, side: 0 }, ORG: { line: 'MED', dx: -2, side: 0 }, BOX: { line: 'MED', dx: 0, side: 0 },
  MCO: { line: 'MED', dx: 6, side: 0 }, INTD: { line: 'MED', dx: 0, side: 0.8 }, INTI: { line: 'MED', dx: 0, side: -0.8 },
  MP: { line: 'MED', dx: 9, side: 0 },
  EXTD: { line: 'DEL', dx: 0, side: 1 }, EXTI: { line: 'DEL', dx: 0, side: -1 }, DC: { line: 'DEL', dx: 4, side: 0 }, F9: { line: 'DEL', dx: -3, side: 0 },
};
const CLASSIC_DORSAL: Record<string, number> = {
  POR: 1, LD: 2, LI: 3, CT: 4, PIV: 6, ORG: 8, BOX: 8, MCO: 8, INTD: 8, INTI: 8, MP: 10, EXTD: 7, EXTI: 11, DC: 9, F9: 9,
};

/** "4-3-3" → conteo por línea {DEF, MED, DEL} (primero=DEF, último=DEL, medio=MED). */
function formationCounts(formation?: string): { DEF: number; MED: number; DEL: number } | null {
  if (!formation) return null;
  const parts = formation.split('-').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
  if (parts.length < 2 || parts.reduce((a, b) => a + b, 0) !== 10) return null;
  const DEF = parts[0]!;
  const DEL = parts[parts.length - 1]!;
  const MED = parts.slice(1, -1).reduce((a, b) => a + b, 0);
  return { DEF, MED, DEL };
}

function normLane(lane: unknown): Lane {
  return lane === 'left' || lane === 'right' || lane === 'center' ? lane : 'center';
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function smootherstep(t: number): number {
  return t * t * t * (t * (6 * t - 15) + 10);
}
// ── Reparametrización por VELOCIDAD (peso del pase + rozamiento) ───────────────
// Mapa de tiempo u(t) tipo Hermite cúbico con velocidades de extremo prescritas
// (du/dt en 0 y 1). Permite que el balón ENTRE rápido (recibido al pie) y SALGA
// con velocidad residual cuando la jugada continúa (rueda *a través* del waypoint
// en vez de pararse), o frene a reposo cuando la jugada termina. 1.0 ≈ velocidad
// media del tramo. Monótono para sIn∈[0.1,1.9], sOut∈[0.1,1.5].
function warpSpeed(t: number, sIn: number, sOut: number): number {
  const b = 3 - 2 * sIn - sOut, c = sIn + sOut - 2;
  const u = sIn * t + b * t * t + c * t * t * t;
  return u < 0 ? 0 : u > 1 ? 1 : u;
}
/** Atributo de pase del ejecutor (peso del balón) — duelo o último eslabón. */
function passingOf(step: TimelineEntry): number {
  const a = step.duel?.att?.attrs ?? step.chain?.[step.chain.length - 1]?.att?.attrs;
  const v = a?.passing ?? a?.shooting ?? a?.dribbling ?? a?.organization;
  return Number.isFinite(v) ? Number(v) : 60;
}
/** Atributo de definición del rematador (curva/comba del disparo). */
function finishingOf(step: TimelineEntry): number {
  const a = step.duel?.att?.attrs ?? step.chain?.[step.chain.length - 1]?.att?.attrs;
  const v = a?.finishing ?? a?.shooting;
  return Number.isFinite(v) ? Number(v) : 60;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpPoint(a: PitchPoint, b: PitchPoint, t: number): PitchPoint {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Duelo del evento: quién gana att vs def (suma de atributos del motor) ─────
export function attrSum(side?: DuelSide | null): number {
  return side ? Object.values(side.attrs ?? {}).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
}
export interface DuelInfo { attId: string | null; defId: string | null; attWins: boolean }
/** Duelo activo del evento (att vs def) — usa el duelo propio o el último eslabón. */
export function duelInfo(step: TimelineEntry | undefined): DuelInfo | null {
  if (!step) return null;
  const d = step.duel ?? null;
  const last = step.chain?.[step.chain.length - 1];
  const att = d?.att ?? last?.att ?? null;
  const def = d?.def ?? last?.def ?? null;
  if (!def) return null;
  return {
    attId: att?.playerId != null ? String(att.playerId) : null,
    defId: def.playerId != null ? String(def.playerId) : null,
    attWins: attrSum(att) >= attrSum(def),
  };
}

// ── Catmull-Rom centrípeto (α=0.5) para una trayectoria de velocidad continua ──
function mixP(a: PitchPoint, b: PitchPoint, s: number): PitchPoint {
  return { x: a.x * s + b.x * (1 - s), y: a.y * s + b.y * (1 - s) };
}
function crKnot(ti: number, a: PitchPoint, b: PitchPoint): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return ti + Math.sqrt(Math.max(d, 1e-4));
}
function catmullRom(P0: PitchPoint, P1: PitchPoint, P2: PitchPoint, P3: PitchPoint, u: number): PitchPoint {
  const t0 = 0, t1 = crKnot(t0, P0, P1), t2 = crKnot(t1, P1, P2), t3 = crKnot(t2, P2, P3);
  const t = t1 + (t2 - t1) * u;
  const g = (lo: number, hi: number, P: PitchPoint, Q: PitchPoint) =>
    Math.abs(hi - lo) < 1e-4 ? P : mixP(P, Q, (hi - t) / (hi - lo));
  const A1 = g(t0, t1, P0, P1), A2 = g(t1, t2, P1, P2), A3 = g(t2, t3, P2, P3);
  const B1 = Math.abs(t2 - t0) < 1e-4 ? A2 : mixP(A1, A2, (t2 - t) / (t2 - t0));
  const B2 = Math.abs(t3 - t1) < 1e-4 ? A2 : mixP(A2, A3, (t3 - t) / (t3 - t1));
  return Math.abs(t2 - t1) < 1e-4 ? B1 : mixP(B1, B2, (t2 - t) / (t2 - t1));
}

function layout(players: PitchPlayer[], side: 'home' | 'away', formation?: string) {
  const xi = players.slice(0, 11);
  const counts = formationCounts(formation);
  // Para el reparto por formación (cuando falta posición detallada): asignar por
  // orden de plantilla a POR → DEF → MED → DEL según los conteos de la formación.
  const lineByIndex = (() => {
    if (!counts) return null;
    const seq: string[] = ['POR'];
    for (let k = 0; k < counts.DEF; k++) seq.push('DEF');
    for (let k = 0; k < counts.MED; k++) seq.push('MED');
    for (let k = 0; k < counts.DEL; k++) seq.push('DEL');
    return (i: number) => seq[i] ?? (i === 0 ? 'POR' : i <= 4 ? 'DEF' : i <= 8 ? 'MED' : 'DEL');
  })();

  const enriched = xi.map((p, i) => {
    const dp = typeof (p as PitchPlayer & { detailedPosition?: string }).detailedPosition === 'string'
      ? (p as PitchPlayer & { detailedPosition?: string }).detailedPosition! : undefined;
    const d = dp && DPOS[dp] ? DPOS[dp] : null;
    let line: string;
    let dx = 0, sideScore = 0;
    if (d) { line = d.line; dx = d.dx; sideScore = d.side; }
    else if (lineByIndex) { line = lineByIndex(i); }
    else { line = ORDER.includes(p.position ?? '') ? p.position! : i === 0 ? 'POR' : i <= 4 ? 'DEF' : i <= 8 ? 'MED' : 'DEL'; }
    const sq = (p as PitchPlayer & { squadNumber?: number | null }).squadNumber;
    const number = sq != null && sq > 0 ? sq : dp && CLASSIC_DORSAL[dp] ? CLASSIC_DORSAL[dp] : (i % 11) + 1;
    return { p, i, line, dx, sideScore, number };
  });

  const out: { p: PitchPlayer & { number: number }; x: number; y: number; gk: boolean; line: string }[] = [];
  for (const line of ORDER) {
    const group = enriched.filter(e => e.line === line).sort((a, b) => a.sideScore - b.sideScore || a.i - b.i);
    const n = group.length;
    group.forEach((e, k) => {
      const gap = Math.min(13, 50 / Math.max(n, 1));
      const rankY = CY + (k - (n - 1) / 2) * gap;          // reparto uniforme en la línea
      const sideY = CY + e.sideScore * 19;                  // apertura real por rol (banda)
      const yHome = line === 'POR' ? CY : n > 1 ? rankY * 0.58 + sideY * 0.42 : CY + e.sideScore * 10;
      const baseX = (LINE_X[line] ?? 38) + e.dx;
      out.push({
        p: { ...e.p, number: e.number },
        x: side === 'home' ? baseX : W - baseX,
        y: side === 'home' ? yHome : 2 * CY - yHome,        // espejo de la formación visitante
        gk: line === 'POR',
        line,
      });
    });
  }
  return out;
}

function chainSupportIds(step: TimelineEntry): Set<string> {
  const ids = new Set<string>();
  if (!step.chain?.length) return ids;
  for (const link of step.chain) {
    if (link.att?.playerId != null) ids.add(String(link.att.playerId));
  }
  return ids;
}

/** Boca de la portería que ataca el equipo en posesión (sobre la línea de gol). */
export function goalMouthFor(step: TimelineEntry): PitchPoint {
  const raw = LANE_Y[normLane(step.lane)];
  const y = Math.max(GOAL_Y_MIN, Math.min(GOAL_Y_MAX, raw));
  return { x: step.team === 'home' ? GOAL.LINE_HOME : GOAL.LINE_AWAY, y };
}

/** Punto de reposo del balón DENTRO de la red en un gol. */
export function goalNetRest(step: TimelineEntry): PitchPoint {
  const m = goalMouthFor(step);
  return {
    x: step.team === 'home' ? GOAL.LINE_HOME + GOAL.NET_INSET : GOAL.LINE_AWAY - GOAL.NET_INSET,
    y: m.y,
  };
}

function isAttackingThird(step: TimelineEntry): boolean {
  return step.zone === 'area' || step.zone === 'ataque';
}

function isShotPhase(step: TimelineEntry): boolean {
  return step.phase === 'remate' || step.phase === 'gol' || step.phase === 'parada';
}

export function ballAtStep(step: TimelineEntry | undefined, stepIndex: number): PitchPoint & { on: boolean } {
  if (!step) return { x: 50, y: CY, on: false };
  if (step.phase === 'saque' || step.phase === 'final') return { x: 50, y: CY, on: true };
  if (step.phase === 'gol') {
    const g = goalMouthFor(step);
    return { x: g.x, y: g.y, on: true };
  }
  const pt = zoneLaneToPoint(step, `pitch:${stepIndex}`, stepIndex);
  return { ...pt, on: true };
}

export function shotTrajectory(
  step: TimelineEntry | undefined,
  ball: PitchPoint,
  blend: number,
): ShotTrajectory | null {
  if (!step || !ball) return null;
  if (step.phase !== 'remate' && step.phase !== 'parada') return null;
  if (!isAttackingThird(step)) return null;

  const goal = goalMouthFor(step);
  const shotStart = step.phase === 'parada' ? 0.55 : 0.5;
  const progress = blend < shotStart ? 0 : easeOutQuad((blend - shotStart) / (1 - shotStart));

  return { show: true, x1: ball.x, y1: ball.y, x2: goal.x, y2: goal.y, progress };
}

// Separación anti-amontonamiento ITERADA (I6): empuja cada disco NO fijo lejos de
// TODOS los demás (incluidos portador y portero, que actúan de repulsores pero NO se
// mueven). Varias pasadas (relajación tipo Gauss-Seidel) resuelven los apelotonamientos
// de área que una sola pasada dejaba montados. Puro y determinista (desempate por índice,
// sin Math.random).
function separatePlaced(placed: PlacedPlayer[], passes: number, rad: number, rep: number): void {
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i];
      if (a.isCarrier || a.gk || a.pinned) continue; // los fijos no se mueven (sí repelen)
      let fx = 0, fy = 0;
      for (let j = 0; j < placed.length; j++) {
        if (j === i) continue;
        const b = placed[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= rad) continue;
        if (dist > 0) {
          const force = (rad - dist) * rep;
          fx += (dx / dist) * force;
          fy += (dy / dist) * force;
        } else {
          // coincidencia exacta → desempate determinista por índice
          fx += ((i % 2) ? 1 : -1) * rep;
          fy += (((i >> 1) % 2) ? 1 : -1) * rep;
        }
      }
      a.x += fx;
      a.y += fy;
    }
  }
}

export function placeTeam(
  players: PitchPlayer[],
  side: 'home' | 'away',
  step: TimelineEntry,
  ball: PitchPoint,
  formation?: string,
  transition?: boolean,
): PlacedPlayer[] {
  const hasBall = step.team === side;
  const defends = !hasBall;
  const supports = chainSupportIds(step);
  const inBox = step.zone === 'area';
  const shotP = isShotPhase(step);
  const m = goalMouthFor(step);
  const attackRight = m.x > 50;
  let carrierId = resolveCarrierId(step, [...players]);
  const isRestart = step.phase === 'saque';
  const ownGoalLine = side === 'home' ? 1.8 : 98.2;

  const base = layout(players, side, formation);

  // Portador "proxy": si el motor no identifica al portador (datos antiguos),
  // marcamos al jugador en posesión más avanzado hacia la portería rival, para
  // que SIEMPRE haya un dueño del balón resaltado. Solo cuando carrierId es null.
  if (hasBall && carrierId == null) {
    const outfield = base.filter(b => !b.gk);
    const pick = outfield.reduce<typeof outfield[number] | null>((best, b) => {
      const score = attackRight ? b.x : W - b.x;
      const bestScore = best ? (attackRight ? best.x : W - best.x) : -Infinity;
      return score > bestScore ? b : best;
    }, null);
    if (pick?.p.playerId != null) carrierId = String(pick.p.playerId);
    else if (pick) carrierId = `__proxy_${side}_${pick.p.number}`;
  }

  // El bloque entero se desplaza hacia el balón y se comprime al defender.
  const cx0 = base.reduce((s, b) => s + b.x, 0) / Math.max(1, base.length);
  const shiftX = LONG_PULL * (ball.x - 50);
  const shiftY = LAT_PULL * (ball.y - CY);
  const lenS = defends ? LEN_SCALE_DEF : 1;
  const widS = defends ? WID_SCALE_DEF : 1;
  const farSide = ball.y >= CY ? -1 : 1;   // el lado débil se mete más

  const placed: PlacedPlayer[] = base.map(({ p, x, y, gk, line }) => {
    const lw = LINE_WEIGHT[line] ?? 0.45;
    const pid = p.playerId != null ? String(p.playerId) : `__proxy_${side}_${p.number}`;
    const isCarrier = carrierId != null && pid === carrierId;
    const isSupport = !isCarrier && p.playerId != null && supports.has(String(p.playerId));
    let gkAction: GkAction | undefined;
    let gkDiveY: number | undefined;
    let z = 0;

    // Posición base como UNIDAD: desplazamiento del bloque + compactación.
    const kx = LINE_KX[line] ?? 0.4;
    const ky = Math.sign(y - CY) === farSide ? 0.7 : 1.0;
    let px = cx0 + (x - cx0) * lenS + shiftX * kx;
    let py = CY + (y - CY) * widS + shiftY * ky;

    // Transición: al recuperar, los delanteros abren carriles y atacan; al
    // perder, el bloque se comprime hacia el balón (urgencia del cambio).
    if (transition && hasBall && line === 'DEL') {
      const laneY = py < CY - 6 ? 16 : py > CY + 6 ? 48 : 32;
      py = lerp(py, laneY, 0.5);
      px += (attackRight ? 1 : -1) * 6;
    } else if (transition && defends) {
      px = lerp(px, ball.x, line === 'DEF' ? 0.1 : 0.2);
      py = lerp(py, ball.y, 0.18);
    }

    if (gk) {
      if (defends && step.phase === 'parada') {
        const reach = 0.7 + Math.min(0.25, (((step.duel?.def?.attrs?.goalkeeping ?? 50) - 50) / 200));
        px = ownGoalLine; py = lerp(CY, m.y, reach);
        gkAction = Math.abs(m.y - CY) > 3.5 ? 'dive' : 'catch'; gkDiveY = m.y;
      } else if (defends && step.phase === 'gol') {
        const wrong = m.y >= CY ? CY - (m.y - CY) * 0.55 : CY + (CY - m.y) * 0.55;
        px = ownGoalLine; py = lerp(CY, wrong, 0.7); gkAction = 'beaten'; gkDiveY = m.y;
      } else if (defends && step.phase === 'remate') {
        px = ownGoalLine + (side === 'home' ? 1 : -1) * 2.5; // se adelanta para achicar
        py = lerp(CY, m.y, 0.5); gkAction = 'set';
      } else if (hasBall && isAttackingThird(step)) {
        px = side === 'home' ? 22 : W - 22; py = CY;
      } else if (defends) {
        // Achicar ángulo: el portero SALE de su línea hacia el balón conforme se
        // acerca al área (sobre la bisectriz del ángulo de tiro), atento al palo
        // cercano. Cuanto más cerca el balón, más se adelanta (hasta ~6.5u).
        const gxl = side === 'home' ? 0 : W;
        const dgoal = Math.hypot(ball.x - gxl, ball.y - CY);
        const advance = clamp((34 - dgoal) / 34 * 6.5, 0, 6.5);
        px = ownGoalLine + (side === 'home' ? 1 : -1) * (1 + advance);
        py = CY + (ball.y - CY) * 0.3;
      } else {
        px = ownGoalLine + (side === 'home' ? 1.4 : -1.4);
        py = CY + (ball.y - CY) * 0.18;
      }
    } else if (defends && line === 'DEF') {
      const lineX = shotP ? (side === 'home' ? 8 : 92) : (side === 'home' ? 16 : 84);
      px = lerp(px, lineX, 0.6);
      py = lerp(py, ball.y, shotP ? 0.28 : 0.14);
    } else if (defends && shotP && line === 'MED') {
      px += (side === 'home' ? -2 : 2) * lw;
    }

    if (shotP && hasBall && !isCarrier) {
      if (line === 'DEL') px += (attackRight ? 3.5 : -3.5) * lw;
      if (line === 'MED' && !inBox) px += (attackRight ? 1.5 : -1.5) * lw;
    }
    if (step.phase === 'progresion' && hasBall && line === 'DEL') {
      px += (attackRight ? 4.5 : -4.5) * lw;
    }
    if (step.phase === 'construccion' || isRestart) {
      if (hasBall && line !== 'POR') px += (side === 'home' ? -1.5 : 1.5) * lw;
      if (defends && line === 'DEL') px += (side === 'home' ? 2 : -2) * lw;
    }

    if (isCarrier) {
      if (shotP) {
        const shotX = attackRight ? 84 : 16;
        const shotY = lerp(CY, m.y, 0.7);
        px = lerp(px, shotX, 0.82); py = lerp(py, shotY, 0.82);
      } else {
        const tx = ball.x + (side === 'home' ? -0.8 : 0.8);
        const ty = ball.y + 0.1;
        px = lerp(px, tx, 0.82); py = lerp(py, ty, 0.82);
      }
    } else if (isSupport && hasBall) {
      if (shotP) {
        // Carreras al área COORDINADAS: el par de apoyos ataca palo CERCANO vs LEJANO
        // (par chocante estilo centro). Split estable por jugador (hash) → no se
        // amontonan; la separación posterior remata el espaciado.
        const near = hashIdx(pid) < 0.5;
        const tx = attackRight ? (near ? 93 : 89.5) : (near ? 7 : 10.5);
        const ty = near ? (m.y >= CY ? 35.5 : 28.5) : (m.y >= CY ? 27.5 : 36.5);
        px = lerp(px, tx, 0.6); py = lerp(py, ty, 0.55);
      } else if (step.phase === 'progresion') {
        const isWinger = Math.abs(py - CY) > 10;
        if (isWinger) {
          px = lerp(px, m.x + (attackRight ? -10 : 10), 0.5);
          py = lerp(py, py > CY ? 48 : 16, 0.45);
        } else {
          px = lerp(px, m.x + (attackRight ? -8 : 8), 0.55);
          py = lerp(py, m.y >= CY ? 26 : 38, 0.5);
        }
      } else {
        const spread = (hashIdx(pid) - 0.5) * 12;
        px = lerp(px, ball.x + (side === 'home' ? -5 : 5), 0.4);
        py = lerp(py, ball.y + spread, 0.4);
      }
    }

    if (isRestart && !isCarrier) {
      px = side === 'home' ? Math.min(px, 49) : Math.max(px, 51);
    }

    // Altura (z): el portero se eleva al estirarse; el rematador salta al cabecear.
    if (gk && gkAction) z = gkAction === 'dive' ? 0.85 : gkAction === 'beaten' ? 0.55 : gkAction === 'catch' ? 0.3 : 0;
    else if (isCarrier && shotP && /cabez/i.test(step.text)) z = 0.9;

    px = Math.max(1.5, Math.min(W - 1.5, px));
    py = Math.max(2, Math.min(62, py));

    return { ...p, x: px, y: py, gk, line, isCarrier, isSupport, number: p.number, speed: 0, heading: 0, z, gkAction, gkDiveY };
  });

  // Separación (anti-amontonamiento) — iterada, con portador/portero como repulsores fijos.
  separatePlaced(placed, 3, 3.5, 0.4);

  for (const p of placed) {
    p.x = Math.max(1.5, Math.min(W - 1.5, p.x));
    p.y = Math.max(2, Math.min(62, p.y));
  }

  // ── Coherencia por duelo: el DEFENSOR nombrado del evento se planta en el
  // punto del duelo (goalside del balón) y muestra su rol (batido / entrada). ──
  const di = duelInfo(step);
  let pressDef: PlacedPlayer | undefined;
  if (di?.defId && defends) {
    const d = placed.find(p => !p.gk && p.playerId != null && String(p.playerId) === di.defId);
    if (d) {
      const gx = side === 'home' ? -1 : 1;            // hacia su propia portería (goalside)
      d.x = clamp(ball.x + gx * 2.2, 4, W - 4);
      d.y = clamp(ball.y + (ball.y >= CY ? 1.0 : -1.0), 5, 59);
      d.duelRole = di.attWins ? 'beaten' : 'tackler'; // gana el atacante → batido; gana él → entra
      pressDef = d;
    }
  }

  // ── Coordinación defensiva: triángulo PRESIÓN / COBERTURA / EQUILIBRIO ────────
  // Sobre el bloque ya colocado (y tras la separación), 2-3 defensores adoptan
  // roles coordinados en vez de amontonarse: la PRESIÓN (el defensor del duelo, o
  // el más cercano) aprieta goalside; la COBERTURA se sitúa por detrás y por dentro
  // de la presión (lee el pase filtrado); el EQUILIBRIO sostiene el lado débil más
  // profundo. Empuje ACOTADO desde su sitio (sin teletransporte) y solo en fases de
  // alta señal — el resto del bloque conserva su lógica. Verificado en el tracer.
  if (defends && (step.phase === 'construccion' || step.phase === 'progresion' || shotP)) {
    const gx = side === 'home' ? 0 : W;               // línea de su propia portería
    const toGX = gx - ball.x, toGY = CY - ball.y;
    const gl = Math.hypot(toGX, toGY) || 1;
    const ux = toGX / gl, uy = toGY / gl;             // del balón hacia su portería
    const used = new Set<PlacedPlayer>();
    if (pressDef) used.add(pressDef);
    const assign = (tx: number, ty: number, maxMove: number, mark = false) => {
      const pool = placed.filter(p => !p.gk && !p.isCarrier && !used.has(p) && (p.line === 'DEF' || p.line === 'MED'));
      if (!pool.length) return;
      let best = pool[0]!, bd = Infinity;
      for (const p of pool) { const d = Math.hypot(p.x - tx, p.y - ty); if (d < bd) { bd = d; best = p; } }
      const dx = tx - best.x, dy = ty - best.y, d = Math.hypot(dx, dy) || 1;
      const mv = Math.min(d, maxMove);
      best.x = clamp(best.x + dx / d * mv, 4, W - 4);
      best.y = clamp(best.y + dy / d * mv, 5, 59);
      if (mark) best.duelRole = best.duelRole ?? 'marker';
      used.add(best);
    };
    if (!pressDef) assign(ball.x + ux * 3.6, ball.y + uy * 3.6, 11);  // sin duelo: presiona el más cercano
    assign(ball.x + ux * 8 + (ball.y >= CY ? -1 : 1) * 3, ball.y + uy * 8 + (ball.y >= CY ? -3 : 3), 9, true); // cobertura
    assign(lerp(gx, ball.x, 0.4), CY + (CY - ball.y) * 0.55, 9);      // equilibrio (lado débil)
  }

  // Pasada FINAL de separación (I6): el plantado del duelo y el triángulo movieron 2-3
  // defensores DESPUÉS de la separación inicial; una pasada ligera resuelve los solapes
  // que pudieran haber creado sin deshacer la forma táctica, y re-acota dentro del campo.
  separatePlaced(placed, 2, 3.0, 0.32);
  for (const p of placed) {
    p.x = Math.max(1.5, Math.min(W - 1.5, p.x));
    p.y = Math.max(2, Math.min(62, p.y));
  }

  return placed;
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1]! : full;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Palabras que NO son nombres (evita fragmentos como "desde lejos", "corta el",
// "la posesión", "El visitante"…). Último recurso: solo nombres PROPIOS.
const NAME_STOP = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'por', 'en', 'su', 'al', 'lo', 'se',
  'equipo', 'visitante', 'local', 'balon', 'frontal', 'avance', 'posesion',
  'remate', 'remata', 'disparo', 'gran', 'parada', 'desde', 'lejos', 'sin',
  'punteria', 'corta', 'pierde', 'prueba', 'desviado', 'despeja', 'amarilla', 'roja',
  'gol', 'goool', 'comienza', 'empata', 'empate', 'responde', 'final', 'minuto',
  'intenta', 'marca', 'anota', 'define', 'cabecea', 'chuta', 'manda', 'envia',
  'saca', 'arranca', 'inicia', 'construye', 'conduce', 'filtra', 'recupera', 'roba', 'expulsado',
]);
function nameFromText(text: string): string | null {
  const cleaned = text.replace(/[^\p{L}\s'’.-]/gu, ' ');
  const tokens = cleaned.match(/[A-ZÁÉÍÓÚÑ][\p{L}'’.-]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'’.-]{2,})?/gu) ?? [];
  for (const tok of tokens) {
    const first = fold(tok.split(/\s+/)[0]!.replace(/[.'’]/g, ''));
    if (!NAME_STOP.has(first)) return tok.trim();
  }
  return null;
}

export function resolveCarrierId(step: TimelineEntry, roster: PitchPlayer[]): string | null {
  const ids: unknown[] = [step.playerId, step.duel?.att?.playerId];
  const last = step.chain?.[step.chain.length - 1];
  if (last?.att?.playerId != null) ids.push(last.att.playerId);
  for (const id of ids) {
    if (id == null) continue;
    // Coincidencia tolerante a string/number ('7' vs 7).
    const hit = roster.find(p => {
      if (p.playerId == null) return false;
      if (String(p.playerId) === String(id)) return true;
      return Number.isFinite(Number(id)) && Number(p.playerId) === Number(id);
    });
    if (hit?.playerId != null) return String(hit.playerId);
    return String(id);
  }
  const hint = nameFromText(step.text) ?? step.duel?.att?.name ?? last?.att?.name;
  if (hint) {
    const fh = fold(hint);
    const hit = roster.find(p => {
      if (!p.name || p.name === 'Jugador') return false;
      const last = p.name.split(/\s+/).pop() ?? '';
      return fold(p.name) === fh || fold(last) === fh || fold(p.name).includes(fh);
    });
    if (hit?.playerId != null) return String(hit.playerId);
  }
  return null;
}

function hashIdx(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % 100;
  return h / 100;
}

export function interpolatePlaced(a: PlacedPlayer, b: PlacedPlayer, t: number): PlacedPlayer {
  const carrier = t < 0.25 ? a.isCarrier : t > 0.75 ? b.isCarrier : a.isCarrier || b.isCarrier;
  const support = t < 0.25 ? a.isSupport : t > 0.75 ? b.isSupport : a.isSupport || b.isSupport;
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const heading = dist > 0.4 ? Math.atan2(dy, dx) : (b.heading ?? 0);
  const id = String(b.playerId ?? b.name ?? '');
  // Stagger por jugador (C2): TODO off-ball arranca con un pequeño desfase determinista →
  // el bloque reacciona en CASCADA, no como un sólido rígido. tStag llega a 1 en t=1
  // (endpoint exacto). El portador no se escalona (va pegado al balón).
  const off = carrier ? 0 : hashIdx(id) * (support ? 0.3 : 0.22);
  const tStag = off > 0 ? Math.min(1, t / (1 - off)) : t;
  const eBase = easeInOutSine(tStag);
  // Velocidad instantánea moldeada por la derivada del easing (C2): la zancada SUBE a mitad
  // de carrera y se apaga en los extremos → ráfaga + frenada, no deslizamiento plano.
  const de = 0.5 * Math.PI * Math.sin(Math.PI * Math.min(1, Math.max(0, tStag)));
  const speed = Math.min(1, (dist / 14) * (0.55 + 0.9 * de));
  const isPress = b.duelRole === 'tackler' || b.duelRole === 'beaten';
  let ox = lerp(a.x, b.x, eBase), oy = lerp(a.y, b.y, eBase);
  if (support && !carrier) {
    // Carrera ESCALONADA con arranque suave (smootherstep en vez de easeOutQuad) → la
    // carrera arranca de una postura y acelera, en vez de salir a tope desde parado.
    const e2 = smootherstep(tStag);
    ox = lerp(a.x, b.x, e2); oy = lerp(a.y, b.y, e2);
    const bend = Math.sin(tStag * Math.PI) * Math.min(1.1, dist * 0.12);
    ox += -Math.sin(heading) * bend; oy += Math.cos(heading) * bend;
  } else if (!carrier && !isPress && dist > 2) {
    // Steering sutil del bloque (I6): arco perpendicular MÍNIMO, lado por jugador (hashIdx).
    // sin(tStag·π) se anula en los extremos → posiciones finales b intactas. El defensor del
    // DUELO (press) queda EXCLUIDO: cierra RECTO al portador, con intención (C2).
    const sgn = hashIdx(id) < 0.5 ? -1 : 1;
    const bend = Math.sin(tStag * Math.PI) * Math.min(0.45, dist * 0.05) * sgn;
    ox += -Math.sin(heading) * bend; oy += Math.cos(heading) * bend;
  }
  // La elevación describe un arco (sube y baja) dentro del evento.
  const zTarget = Math.max(a.z ?? 0, b.z ?? 0);
  const z = zTarget * Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
  return {
    ...b,
    x: ox,
    y: oy,
    isCarrier: carrier,
    isSupport: support,
    speed,
    heading,
    z,
    gkAction: b.gkAction ?? a.gkAction,
    gkDiveY: b.gkDiveY ?? a.gkDiveY,
  };
}

function ballAlongStep(
  step: TimelineEntry,
  P0: PitchPoint,
  P1: PitchPoint,
  P2: PitchPoint,
  P3: PitchPoint,
  t: number,
  startEases: boolean,
  endEases: boolean,
): PitchPoint {
  // ── Remate / gol / parada: dos tramos (aproximación → disparo) ──────────────
  if (isShotPhase(step) && isAttackingThird(step)) {
    const eased = easeInOutSine(t);
    const ballStart = P1, ballEnd = P2;
    let pt = lerpPoint(ballStart, ballEnd, eased);
    let z = 0;
    const m = goalMouthFor(step);
    const right = m.x > 50;
    // El disparo sale del ÁREA en el carril de la jugada (coherente con la boca).
    const shotOrigin = { x: right ? 84 : 16, y: lerp(CY, m.y, 0.7) };
    const settle = step.phase === 'gol' ? 0.6 : step.phase === 'remate' ? 0.5 : 0.55;

    let target: PitchPoint;
    if (step.phase === 'gol') target = goalNetRest(step);
    else if (step.phase === 'remate') target = { x: m.x, y: m.y <= CY ? GOAL.POST_TOP - 2.2 : GOAL.POST_BOT + 2.2 };
    else target = { x: right ? GOAL.LINE_HOME - 2.4 : GOAL.LINE_AWAY + 2.4, y: lerp(CY, m.y, 0.72) };

    if (eased < settle) {
      const localT = eased / settle;
      pt = lerpPoint(ballStart, shotOrigin, easeInOutSine(localT));
      const d2 = Math.hypot(shotOrigin.x - ballStart.x, shotOrigin.y - ballStart.y);
      if (d2 > 14) z = Math.sin(localT * Math.PI) * Math.min(3.2, d2 * 0.1);
    } else {
      const fin = finishingOf(step);
      // Golpeo EXPLOSIVO escalado por la definición (C4): el balón sale rápido del pie (no
      // un lanzamiento blando); a más definición, más pegada inicial. Extremos 0→1 exactos
      // → el gol sigue entrando, el remate sigue fuera, la parada no cruza.
      const raw = (eased - settle) / (1 - settle);
      const b = 1 - Math.pow(1 - raw, 2 + fin / 100);
      const bb = Math.min(1, b);
      // ── Comba (efecto Magnus): el disparo describe un arco lateral según la definición
      // del rematador y la geometría. Se desplaza SOLO el punto de control interior de una
      // Bézier cuadrática: el ORIGEN y el DESTINO no cambian → invariantes intactas.
      const cx = target.x - shotOrigin.x, cy = target.y - shotOrigin.y;
      const clen = Math.hypot(cx, cy);
      const nx = clen > 0.01 ? -cy / clen : 0, ny = clen > 0.01 ? cx / clen : 0;
      const wideLane = step.lane === 'left' || step.lane === 'right'; // disparo desde banda = más comba
      const geom = clen < 10 ? 0 : wideLane ? 1 : 0.4;            // frontal = comba mínima (toque ≈ recto)
      // Lado de la comba ligado a la GEOMETRÍA del disparo (in-swing hacia donde va), no solo
      // a la mitad de la portería (C4): un disparo centrado sale casi recto.
      const approachSign = Math.abs(target.y - shotOrigin.y) > 2 ? Math.sign(target.y - shotOrigin.y) : (m.y >= CY ? 1 : -1);
      const bend = 0.12 * clen * (fin / 100) * geom * approachSign;
      const ctrlX = lerp(shotOrigin.x, target.x, 0.55) + nx * bend;
      const ctrlY = lerp(shotOrigin.y, target.y, 0.55) + ny * bend;
      const ib = 1 - bb;
      pt = {
        x: ib * ib * shotOrigin.x + 2 * ib * bb * ctrlX + bb * bb * target.x,
        y: ib * ib * shotOrigin.y + 2 * ib * bb * ctrlY + bb * bb * target.y,
      };
      // Solo la parada deja un rebote tras el portero.
      if (step.phase === 'parada' && bb > 0.85) {
        const rb = easeOutQuad((bb - 0.85) / 0.15);
        const reb = { x: target.x - (right ? 1 : -1) * 6, y: target.y + (m.y >= CY ? -4 : 4) };
        pt = lerpPoint(target, reb, rb * 0.8);
      }
      if (step.phase === 'gol') z = Math.sin(b * Math.PI) * 2.2;
      else if (step.phase === 'remate') z = 0.4 + b * 2.4;
      else {
        z = Math.sin(b * Math.PI) * 0.9;
        // El balón rechazado SALTA (pop) al escupirse del portero (R4) — solo altura.
        if (bb > 0.85) { const rb = (bb - 0.85) / 0.15; z += Math.sin(rb * Math.PI) * 0.8; }
      }
    }
    return { ...pt, z };
  }

  // ── Juego abierto: Catmull-Rom centrípeto con PESO DE PASE + ROZAMIENTO ───────
  // Modelo de fricción de rodadura (μ≈0.07 → a≈0.69 u/s²): el balón sale rápido al
  // golpeo y desacelera. La clave de fluidez: si la jugada CONTINÚA, el balón
  // conserva velocidad residual y rueda *a través* del waypoint (no se para en cada
  // pase); solo frena a reposo si la jugada termina. El "peso" sale del pase del
  // ejecutor + la longitud: un pase corto y blando frena más, un balón en largo y
  // conducido conserva velocidad (frena tarde).
  const chord = Math.hypot(P2.x - P1.x, P2.y - P1.y);
  const inChord = Math.hypot(P1.x - P0.x, P1.y - P0.y);   // tramo de ENTRADA (de dónde llega)
  const passP = passingOf(step);
  // Peso del pase + acoplamiento más fuerte al passing del ejecutor (C3): un buen pasador
  // mantiene el balón rodando, un despeje muere antes.
  const driven = clamp(0.5 + chord * 0.0125 + (passP - 60) * 0.007, 0.42, 1.18); // residual al salir
  // Entrada que HEREDA la velocidad residual del tramo anterior (C3: momentum de costura) →
  // el balón rueda *a través* del waypoint sin tirón; un pase corto entra blando (peso), uno
  // en largo entra rápido. Solo en jugada continua (en jugada nueva arranca de reposo).
  const sIn = startEases ? 0.22 : clamp(0.5 + inChord * 0.0125 + (passP - 60) * 0.007, 0.6, 1.6);
  const sOut = endEases ? 0.14 : driven;                                          // rueda a través
  const u = warpSpeed(t, sIn, sOut);
  const pt = catmullRom(P0, P1, P2, P3, u);
  // Comba lateral del pase (C3): arco perpendicular que se ANULA en u=0 y u=1 → extremos
  // P1/P2 EXACTOS (no rompe el no-vuela ni el determinismo). El pase se curva con intención
  // (lado por carril/jugada, magnitud por longitud y por el passing) en vez de ser una recta.
  if (chord > 8) {
    const nl = Math.hypot(P2.x - P1.x, P2.y - P1.y) || 1;
    const nx = -(P2.y - P1.y) / nl, ny = (P2.x - P1.x) / nl;
    const laneSign = step.lane === 'left' ? -1 : step.lane === 'right' ? 1 : (hashIdx(step.text) < 0.5 ? -1 : 1);
    const curveMag = Math.min(1.4, chord * 0.04) * (passP / 100) * laneSign;
    const k = Math.sin(u * Math.PI) * curveMag;
    pt.x += nx * k; pt.y += ny * k;
  }
  // Vuelo asimétrico por arrastre del aire: sube rápido, cae más vertical, con la
  // cresta ligeramente pasada el medio (el balón "cuelga" y luego baja).
  let z = 0;
  if (chord > 16) {
    const apex = Math.min(4.2, chord * 0.11);
    z = apex * Math.sin(Math.pow(u, 1.22) * Math.PI);          // cae más vertical (arrastre del aire)
    // Cascada de botes de hierba (COR≈0.55) al caer un balón en largo: un primer bote y
    // un segundo menor (R4). Solo afecta a la altura z → no toca la trayectoria x/y.
    if (chord > 24 && u > 0.82) {
      const bt = (u - 0.82) / 0.18;
      const b1 = bt < 0.6 ? Math.sin((bt / 0.6) * Math.PI) * 0.22 : 0;
      const b2 = bt >= 0.6 ? Math.sin(((bt - 0.6) / 0.4) * Math.PI) * 0.10 : 0;
      z += apex * (b1 + b2);
    }
  }
  return { ...pt, z };
}

const UPSTREAM_ZONE: Record<string, string> = { area: 'med', ataque: 'med', med: 'def', def: 'def' };
const CUT_PHASE = (p: string) => p === 'saque' || p === 'final' || p === 'falta' || p === 'cambio' || p === 'ajuste_tactico';
/** ¿La jugada CONTINÚA? (mismo equipo, mismo minuto, fases que encadenan balón). */
function isContinuousPlay(prev: TimelineEntry | undefined, step: TimelineEntry): boolean {
  if (!prev) return false;
  if (prev.team !== step.team) return false;
  if ((step.minute ?? 0) !== (prev.minute ?? 0)) return false;
  if (CUT_PHASE(prev.phase) || CUT_PHASE(step.phase)) return false;
  return true;
}
/** Origen LOCAL del balón para una jugada nueva: una zona por detrás, mismo carril
 * (evita que el balón "vuele" de una jugada a otra sin relación). */
function ballOriginFor(step: TimelineEntry, stepIndex: number): PitchPoint {
  if (step.phase === 'saque' || step.phase === 'final') return { x: 50, y: CY };
  const z = UPSTREAM_ZONE[step.zone] ?? 'med';
  return zoneLaneToPoint({ ...step, zone: z }, `origin:${stepIndex}`, stepIndex);
}

// ── Coreografía de la CADENA (regate/desmarque/pase/tiro) ─────────────────────
// El motor adjunta la anatomía de la jugada en `step.chain[]`: cada eslabón nombra
// al EJECUTOR (`att`) y a su par directo (`def`), con su paso (recuperación / regate
// / pase clave / remate). La cadena tiene UN carril (el motor no varía el carril por
// eslabón) y el `playerId` puede faltar. La coreografía reparte a los ejecutores por
// el CORREDOR del balón (deep→destino) y deja que el BALÓN los hile: cada uno espera
// en su nodo y el portador (aro) es SIEMPRE el más cercano al balón (sincronizado con
// su posición real, no con el reloj) → sin desfase ni teletransportes. En el remate el
// tirador queda como portador (geometría/timing del disparo intactos). Puro y determinista.
export interface ChainNode {
  pt: PitchPoint;
  step: string;               // recuperacion | regate | pase_clave | remate
  attId: string | null;       // ejecutor (equipo en posesión); puede ser null
  defId: string | null;       // par directo (equipo rival); null si sin oposición
  attWins: boolean;           // el ejecutor superó a su par en ese eslabón
}
export interface ChainPlan { team: 'home' | 'away'; nodes: ChainNode[] }

/** Mapea `step.chain[]` a nodos sobre el corredor `from`→`to` (último = `to`). `to` es el
 *  destino del balón en juego abierto y el ORIGEN del disparo en un remate (no la red).
 *  Devuelve null si no hay cadena utilizable (≤1 eslabón) → coreografía clásica. */
export function buildChainPlan(step: TimelineEntry, from: PitchPoint, to: PitchPoint): ChainPlan | null {
  const chain = step.chain;
  if (!chain || chain.length < 2) return null;
  const n = chain.length;
  const nodes: ChainNode[] = chain.map((link, i) => {
    const pt = i === 0 ? { x: from.x, y: from.y }
      : i === n - 1 ? { x: to.x, y: to.y }
      : lerpPoint(from, to, i / (n - 1));
    return {
      pt,
      step: link.step,
      attId: link.att?.playerId != null ? String(link.att.playerId) : null,
      defId: link.def?.playerId != null ? String(link.def.playerId) : null,
      attWins: link.def == null || attrSum(link.att) >= attrSum(link.def),
    };
  });
  return { team: step.team, nodes };
}

/** Índice del ejecutor que lleva el balón según su posición REAL: proyecta el balón
 *  sobre el corredor `from`→`to` y elige el nodo MÁS CERCANO (no por reloj). Así el aro
 *  del portador va siempre pegado al balón y el relevo cae cuando el balón llega al
 *  jugador (sin desincronía). `rawT` solo sirve de respaldo si el corredor es nulo. */
export function activeChainNode(plan: ChainPlan, ball: PitchPoint, from: PitchPoint, to: PitchPoint, rawT: number): number {
  const last = plan.nodes.length - 1;
  const ex = to.x - from.x, ey = to.y - from.y;
  const len2 = ex * ex + ey * ey;
  const s = len2 > 1 ? clamp(((ball.x - from.x) * ex + (ball.y - from.y) * ey) / len2, 0, 1) : clamp(rawT, 0, 1);
  return Math.min(last, Math.max(0, Math.round(s * last)));
}

export function computePitchFrame(
  step: TimelineEntry | undefined,
  prevStep: TimelineEntry | undefined,
  prev2Step: TimelineEntry | undefined,
  nextStep: TimelineEntry | undefined,
  stepIndex: number,
  blend: number,
  homePlayers: PitchPlayer[],
  awayPlayers: PitchPlayer[],
  homeFormation?: string,
  awayFormation?: string,
) {
  if (!step) {
    return {
      ball: { x: 50, y: CY, on: false },
      home: [] as PlacedPlayer[],
      away: [] as PlacedPlayer[],
      shot: null as ShotTrajectory | null,
    };
  }

  const rawT = blend >= 1 ? 1 : Math.max(0, blend);

  // ── Segmentación por jugada ────────────────────────────────────────────────
  // Si el evento CONTINÚA la jugada anterior, el balón/jugadores fluyen desde
  // ella. Si es una jugada NUEVA (cambio de posesión, otro minuto, saque/falta),
  // arranca LOCAL (una zona por detrás, mismo carril): no hay vuelo cruzado.
  const continuous = isContinuousPlay(prevStep, step);
  const from = continuous ? prevStep! : step;
  const fromIdx = continuous ? stepIndex - 1 : stepIndex;

  const P2 = ballAtStep(step, stepIndex);
  const P1: PitchPoint = continuous ? ballAtStep(from, Math.max(0, fromIdx)) : ballOriginFor(step, stepIndex);
  const prevCont = continuous && !!prev2Step && isContinuousPlay(prev2Step, prevStep!);
  const P0: PitchPoint = prevCont ? ballAtStep(prev2Step!, Math.max(0, fromIdx - 1)) : P1;
  const nextCont = !!nextStep && isContinuousPlay(step, nextStep);
  const P3: PitchPoint = nextCont ? ballAtStep(nextStep!, stepIndex + 1) : P2;

  const startEases = !continuous;                       // jugada nueva: arranca desde reposo
  const endEases = !nextCont || isShotPhase(step);      // fin de jugada / disparo: frena

  const ball = { ...ballAlongStep(step, P0, P1, P2, P3, rawT, startEases, endEases), on: true as const };

  // Cambio de posesión (mismo minuto) → transición: ganador ataca, perdedor comprime.
  const flipped = !!prevStep && prevStep.team !== step.team && (prevStep.minute ?? 0) === (step.minute ?? 0);
  const homeStart = placeTeam(homePlayers, 'home', from, P1, homeFormation);
  const homeEnd = placeTeam(homePlayers, 'home', step, P2, homeFormation, flipped);
  const awayStart = placeTeam(awayPlayers, 'away', from, P1, awayFormation);
  const awayEnd = placeTeam(awayPlayers, 'away', step, P2, awayFormation, flipped);

  const home = homeEnd.map((b, i) => interpolatePlaced(homeStart[i] ?? b, b, rawT));
  const away = awayEnd.map((b, i) => interpolatePlaced(awayStart[i] ?? b, b, rawT));

  // ── Coreografía de la CADENA: las fichas HACEN la jugada (pase/regate/tiro) ──────
  // Modelo COHERENTE con el balón real: cada ejecutor ESPERA QUIETO en su nodo (la espina
  // de la jugada, deep→destino) y el BALÓN los hila por su trayectoria; el PORTADOR (aro)
  // es siempre el ejecutor MÁS CERCANO al balón (por su posición real, no por reloj) → el
  // aro va pegado al balón y el relevo cae cuando el balón llega al jugador, sin desfase ni
  // saltos. El portador se estira ≤1.8u hacia el balón (no teletransporta). En el remate el
  // tirador es el portador (lo coloca la lógica de disparo; geometría/timing intactos) y la
  // espina llega al ORIGEN del disparo, NO a la red. Solo se planta el defensor DECISIVO
  // (último eslabón) y junto al balón: `duelRole` no se anima en juego abierto, así que
  // plantar defensores intermedios sería un salto sin sentido. Los colocados van `pinned`
  // para que la separación global no haga temblar la espina. Sin cadena → clásico.
  const shotP = isShotPhase(step);
  const gm = goalMouthFor(step);
  const shotOrigin: PitchPoint = { x: gm.x > 50 ? 84 : 16, y: lerp(CY, gm.y, 0.7) };
  const chainEnd = shotP ? shotOrigin : P2;     // los nodos nunca entran en la portería
  const plan = buildChainPlan(step, P1, chainEnd);
  const chainOpen = !!plan && !shotP;
  if (plan) {
    const own = step.team === 'home' ? home : away;
    const opp = step.team === 'home' ? away : home;
    const nodes = plan.nodes;
    const n = nodes.length;
    const findOwn = (id: string) => own.find(p => !p.gk && p.playerId != null && String(p.playerId) === id);
    const shooterId = shotP ? nodes[n - 1]!.attId : null;

    // 1) La espina: cada ejecutor (menos el tirador) ESPERA quieto en su nodo, mira al balón.
    for (let i = 0; i < n; i++) {
      const node = nodes[i]!;
      if (node.attId == null || (shooterId != null && node.attId === shooterId)) continue;
      const pl = findOwn(node.attId);
      if (!pl) continue;
      pl.x = clamp(node.pt.x, 1.5, W - 1.5);
      pl.y = clamp(node.pt.y, 2, 62);
      pl.isCarrier = false; pl.isSupport = true; pl.speed = 0; pl.pinned = true;
    }

    // 2) Portador.
    if (chainOpen) {
      // El portador = ejecutor MÁS CERCANO al balón (por su posición real). Se estira hacia
      // el balón sin despegarse de su nodo → el aro va pegado al balón, sin desfase.
      const ai = activeChainNode(plan, ball, P1, P2, rawT);
      const node = nodes[ai]!;
      const pl = node.attId != null ? findOwn(node.attId) : null;
      if (pl) {
        let dx = ball.x - node.pt.x, dy = ball.y - node.pt.y;
        const dd = Math.hypot(dx, dy);
        const reach = Math.min(dd, 1.8);
        if (dd > 0.01) { dx /= dd; dy /= dd; }
        pl.x = clamp(node.pt.x + dx * reach, 1.5, W - 1.5);
        pl.y = clamp(node.pt.y + dy * reach, 2, 62);
        pl.isCarrier = true; pl.isSupport = false; pl.pinned = true;
        pl.heading = Math.atan2(ball.y - pl.y, ball.x - pl.x);
        pl.speed = 0.45;
        for (const p of own) if (p !== pl) p.isCarrier = false;
      }
    } else if (shooterId != null) {
      // Remate: el tirador es el ÚNICO portador (su posición la manda la lógica de disparo).
      for (const p of own) p.isCarrier = p.playerId != null && String(p.playerId) === shooterId;
    }

    // 3) Defensor DECISIVO (último eslabón): junto al balón, si no es portero. En un corte
    //    (progresión) es quien roba; en remate suele ser el portero (excluido). Offset > radio
    //    de separación (2.0) para que no tiemble.
    const lastDef = nodes[n - 1]!.defId;
    if (lastDef != null) {
      const d = opp.find(p => !p.gk && p.playerId != null && String(p.playerId) === lastDef);
      if (d) {
        const end = nodes[n - 1]!.pt;
        const gx = gm.x > 50 ? 1 : -1;
        d.x = clamp(end.x + gx * 2.4, 4, W - 4);
        d.y = clamp(end.y + (end.y >= CY ? 1.0 : -1.0), 5, 59);
        d.duelRole = nodes[n - 1]!.attWins ? 'beaten' : 'tackler';
        d.pinned = true;
      }
    }
  }

  // Portador PEGADO al balón en juego abierto SIN cadena (C1): el disco va a los pies del
  // balón. En remate/gol/parada NO (el rematador dispara desde el área). Con cadena, el
  // relevo ya colocó al portador → no se repite aquí.
  if (!shotP && !chainOpen) {
    const own = step.team === 'home' ? home : away;
    const c = own.find(p => p.isCarrier);
    if (c) {
      let dx = P2.x - P1.x, dy = P2.y - P1.y;
      const dl = Math.hypot(dx, dy);
      if (dl > 0.4) { dx /= dl; dy /= dl; } else { dx = step.team === 'home' ? 1 : -1; dy = 0; }
      c.x = ball.x - dx * 0.7;
      c.y = ball.y - dy * 0.7;
      c.heading = Math.atan2(dy, dx);
      if (c.speed < 0.35) c.speed = 0.35;
    }
  } else if (shotP) {
    // En el GOLPEO el rematador MIRA A PORTERÍA (C4), no a su carrera de aproximación.
    const own = step.team === 'home' ? home : away;
    const c = own.find(p => p.isCarrier);
    if (c) { c.heading = Math.atan2(gm.y - c.y, gm.x - c.x); }
  }

  // Pre-movimiento del RECEPTOR del próximo pase (I7): solo si la jugada CONTINÚA
  // (nextCont) — así una jugada nueva nunca "vuela". El jugador que recibirá el balón en
  // el siguiente evento se DESMARCA hacia su punto de recepción conforme avanza el evento
  // actual (anticipación), con un tirón ACOTADO (≤30%·rawT). No es lógica de juego: solo
  // anticipa visualmente el destino que el timeline ya marca. Determinista; balón intacto.
  if (nextCont && nextStep) {
    const arr = nextStep.team === 'home' ? home : away;
    const rid = resolveCarrierId(nextStep, nextStep.team === 'home' ? homePlayers : awayPlayers);
    if (rid != null) {
      const recv = arr.find(p => !p.gk && !p.isCarrier && !p.pinned && p.playerId != null && String(p.playerId) === String(rid));
      if (recv) {
        const dest = ballAtStep(nextStep, stepIndex + 1);
        // Tirón hacia el punto de recepción, ACOTADO a un máximo absoluto: el siguiente
        // evento arranca sin este tirón (rawT=0), así el corte entre eventos sería el
        // tamaño del desplazamiento — limitarlo a ≤PRE_CAP lo deja en un ajuste sutil.
        const PRE_CAP = 3.5;
        // Peso en JOROBA (sin(rawT·π)): se anula en rawT=0 y rawT=1 → la anticipación se ve
        // a mitad de jugada pero el receptor vuelve a su sitio en el corte (sin pop) (F1).
        const w = 0.34 * Math.sin(rawT * Math.PI);
        let ddx = (dest.x - recv.x) * w;
        let ddy = (dest.y - recv.y) * w;
        const dd = Math.hypot(ddx, ddy);
        if (dd > PRE_CAP) { ddx = ddx / dd * PRE_CAP; ddy = ddy / dd * PRE_CAP; }
        recv.x += ddx;
        recv.y += ddy;
      }
    }
  }

  // Separación GLOBAL final (I6): `placeTeam` solo separa DENTRO de cada equipo, así que
  // dos discos de equipos RIVALES podían quedar montados. Esta pasada de-apila sobre las
  // posiciones interpoladas (ambos equipos juntos) con radio CORTO: deshace solo los
  // solapes duros; el marcaje cercano (a ≥ radio) se conserva. Portador/portero fijos.
  // Determinista; el balón no se toca. (Muta los objetos render in situ.)
  const everyone = [...home, ...away];
  separatePlaced(everyone, 3, 2.0, 0.5);
  for (const p of everyone) { p.x = clamp(p.x, 1.5, W - 1.5); p.y = clamp(p.y, 2, 62); }

  const shot = shotTrajectory(step, ball, easeInOutSine(rawT));

  return { ball, home, away, shot };
}

// ── Identidad del portador del balón (HUD broadcast — nunca vacío) ────────────
export interface CarrierInfo {
  id: string | null;
  name: string;      // corto (apellido)
  fullName: string;  // completo para el rótulo
  team: 'home' | 'away';
  position: string;
  number: number;
  verb: string;
}
const PHASE_VERB: Record<string, string> = {
  construccion: 'CONSTRUYE', progresion: 'CONDUCE', saque: 'SACA',
  remate: 'REMATA', gol: '¡GOL!', parada: 'REMATA', falta: 'FALTA', final: '',
};

export function carrierLabel(
  step: TimelineEntry | undefined,
  homePlayers: PitchPlayer[],
  awayPlayers: PitchPlayer[],
): string | null {
  const info = resolveCarrier(step, homePlayers, awayPlayers);
  return info ? info.name : null;
}

type RosterHit = { p: PitchPlayer; idx: number; team: 'home' | 'away' };

export function resolveCarrier(
  step: TimelineEntry | undefined,
  homePlayers: PitchPlayer[],
  awayPlayers: PitchPlayer[],
): CarrierInfo | null {
  // En saque/final no hay portador real → ocultar (evita parsear narración).
  if (!step || step.phase === 'final' || step.phase === 'saque') return null;
  const verb = PHASE_VERB[step.phase] ?? '';

  const findById = (id: string): RosterHit | null => {
    const matches = (p: PitchPlayer) => p.playerId != null &&
      (String(p.playerId) === id || (Number.isFinite(Number(id)) && Number(p.playerId) === Number(id)));
    let idx = homePlayers.findIndex(matches);
    if (idx >= 0) return { p: homePlayers[idx]!, idx, team: 'home' };
    idx = awayPlayers.findIndex(matches);
    if (idx >= 0) return { p: awayPlayers[idx]!, idx, team: 'away' };
    return null;
  };
  const findByName = (name: string): RosterHit | null => {
    const fn = fold(name);
    if (fn.length < 3) return null;
    const matches = (p: PitchPlayer) => {
      if (!p.name || p.name === 'Jugador') return false;
      const ln = p.name.split(/\s+/).pop() ?? '';
      return fold(p.name) === fn || fold(ln) === fn || fold(p.name).includes(fn);
    };
    let idx = homePlayers.findIndex(matches);
    if (idx >= 0) return { p: homePlayers[idx]!, idx, team: 'home' };
    idx = awayPlayers.findIndex(matches);
    if (idx >= 0) return { p: awayPlayers[idx]!, idx, team: 'away' };
    return null;
  };
  const build = (h: RosterHit): CarrierInfo => {
    const p = h.p;
    const sq = (p as PitchPlayer & { squadNumber?: number | null }).squadNumber;
    const dp = (p as PitchPlayer & { detailedPosition?: string | null }).detailedPosition;
    return {
      id: p.playerId != null ? String(p.playerId) : null,
      name: shortName(p.name),
      fullName: p.name,
      team: h.team,
      position: typeof dp === 'string' && dp ? dp : p.position ?? '',
      number: sq != null && sq > 0 ? sq : typeof dp === 'string' && CLASSIC_DORSAL[dp] ? CLASSIC_DORSAL[dp] : (h.idx % 11) + 1,
      verb,
    };
  };
  const real = (n?: string | null) => !!n && n !== 'Jugador' && !n.startsWith('Jugador #');

  // 1. Por id, buscando en AMBAS plantillas (un robo/parada referencia al rival).
  const last = step.chain?.[step.chain.length - 1];
  const ids = [step.playerId, step.duel?.att?.playerId, last?.att?.playerId];
  for (const id of ids) {
    if (id == null) continue;
    const hit = findById(String(id));
    if (hit && real(hit.p.name)) return build(hit);
  }

  // 2. Nombre estructurado del duelo/cadena (el motor lo da en remate/parada/gol).
  const structName = step.duel?.att?.name ?? last?.att?.name;
  if (real(structName)) {
    const hit = findByName(structName!);
    if (hit) return build(hit);
    return { id: null, name: shortName(structName!), fullName: structName!, team: step.team, position: '', number: 0, verb };
  }

  // 3. Último recurso: SOLO un nombre propio del texto (estricto, sin fragmentos).
  const txtName = nameFromText(step.text);
  if (txtName) {
    const hit = findByName(txtName);
    if (hit) return build(hit);
    return { id: null, name: shortName(txtName), fullName: txtName, team: step.team, position: '', number: 0, verb };
  }

  // 4. Sin nombre identificable → no mostrar (nunca un fragmento de frase).
  return null;
}

/** Ritmo legible — más pausado si el balón viaja lejos */
export function stepDurationMs(
  step: TimelineEntry | undefined,
  duel: boolean,
  prevStep?: TimelineEntry,
  stepIndex = 0,
): number {
  if (!step) return 1100;
  let base: number;
  switch (step.phase) {
    case 'gol': base = 3000; break;
    case 'final': base = 2000; break;
    case 'remate': base = 2400; break;
    case 'parada': base = 1900; break;
    case 'falta': base = 1400; break;
    case 'progresion': base = 1200; break;
    case 'construccion': base = 1500; break;
    case 'saque': base = 1300; break;
    default: base = duel ? 1500 : 1150;
  }
  if (prevStep) {
    const a = ballAtStep(prevStep, Math.max(0, stepIndex - 1));
    const b = ballAtStep(step, stepIndex);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    base += Math.min(900, dist * 14);
    if (prevStep.team !== step.team) base += 280;
    if (prevStep.zone !== step.zone) base += 180;
  }
  return base;
}
