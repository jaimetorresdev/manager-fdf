// ─── Contrato del motor de partido (única fuente de verdad en el frontend) ────
// Refleja la salida de engine/app/models.py (SimulationResult). Mantener alineado.

export type Team = 'home' | 'away';

export type TimelinePhase =
  | 'saque' | 'construccion' | 'progresion' | 'remate'
  | 'gol' | 'parada' | 'falta' | 'final';

// ── C7 · carril y anatomía de la jugada (campos ADITIVOS del motor) ──────────
// null/ausentes en partidos antiguos y entradas sin jugada (API_UI §CarrilesYCadena).
export type Lane = 'left' | 'center' | 'right';

export interface DuelSide {
  playerId?: string | null;
  name: string;
  position?: string;
  /** Valores EXACTOS de los atributos que ponderó el motor en ese eslabón. */
  attrs: Record<string, number>;
}

export interface ChainLink {
  step: 'recuperacion' | 'regate' | 'pase_clave' | 'remate';
  lane?: Lane | null;
  text?: string;
  att: DuelSide;
  /** null si el eslabón no tuvo oposición directa. */
  def?: DuelSide | null;
}

export interface TimelineEntry {
  minute: number;
  phase: TimelinePhase;
  team: Team;
  zone: string;            // def | med | ataque | area
  text: string;
  playerId?: string | null;
  /** C7: carril de la jugada (attackZones > formación+width). */
  lane?: Lane | null;
  /** C7: duelo de atributos del eslabón (def null si no hubo oposición). */
  duel?: { att: DuelSide; def?: DuelSide | null } | null;
  /** C7: solo en phase:"gol" — anatomía completa de la transición. */
  chain?: ChainLink[] | null;
}

export interface PlayerRating {
  name: string;
  playerId?: string | null;
  position?: string;       // POR | DEF | MED | DEL (aditivo, para el visor 2D)
  /** Dorsal real del jugador (enriquecido por el backend desde BD). */
  squadNumber?: number | null;
  /** Posición detallada (15 códigos: POR/LD/CT/LI/PIV/ORG/MCO/BOX/INTD/INTI/MP/EXTD/EXTI/DC/F9). */
  detailedPosition?: string | null;
  rating: number;          // 0-10 (acotada 3-10)
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  passAccuracy: number;    // 0-1
  tackles: number;
  interceptions: number;
  keyPasses: number;
  xg: number;
}

export interface MatchStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
}

export type EventType = 'goal' | 'yellow' | 'red' | 'save' | 'corner' | 'foul';

export interface MatchEvent {
  minute: number;
  type: EventType;
  team: Team;
  description: string;
  playerName?: string | null;
  playerId?: string | null;
}

export interface Injury {
  playerId?: string | null;
  playerName: string;
  team: Team;
  minute: number;
  severity: 'leve' | 'media' | 'grave';
  matchesOut: number;
}

export interface SubMove { playerId?: string | null; name?: string; playerName?: string }
export interface Substitution {
  team: Team;
  minute: number;
  out: SubMove;
  in: SubMove;
  reason: 'injury' | 'fitness' | 'tactical' | 'tactic'; // 'tactic' = sustitución programada (R4)
}

export interface SimulationResult {
  homeGoals: number;
  awayGoals: number;
  resultHidden?: boolean;
  homeStats: MatchStats;
  awayStats: MatchStats;
  events: MatchEvent[];
  motm: string;
  homeRatings: PlayerRating[];
  awayRatings: PlayerRating[];
  timeline: TimelineEntry[];
  knockout: boolean;
  decidedBy: 'regular' | 'extra_time' | 'penalties';
  winner: Team | null;
  homePenalties: number;
  awayPenalties: number;
  injuries: Injury[];
  substitutions: Substitution[];
}

// El detalle de partido del backend envuelve el resultado del motor + nombres.
export interface MatchDetail extends Partial<SimulationResult> {
  id: number;
  homeName: string;
  awayName: string;
  weatherCondition?: string;
  temperature?: number;
  played?: boolean;
}
