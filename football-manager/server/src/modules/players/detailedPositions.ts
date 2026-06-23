// ─── WT1 · Posiciones detalladas (15) ─────────────────────────────────────────
// Fuente de diseño: docs/diseno-posiciones-y-formaciones.md §1 y §1.1.
// La macro POR|DEF|MED|DEL NO desaparece: cada posición detallada mapea a una
// macro y todo lo existente sigue funcionando (cambios 100% aditivos).
//
// Este módulo es la FUENTE ÚNICA de:
//  - el catálogo de las 15 posiciones (código, nombre, dorsal clásico, macro),
//  - la tabla de ponderación de habilidades por posición (§1.1),
//  - la derivación determinista posición detallada ← atributos (backfill/gen),
//  - la Media por posición (habilidades de peso 3+2),
//  - el reparto de puntos por pesos para la GENERACIÓN de jugadores.
import { playerOverall } from '../../lib/playerOverall';

export type DetailedPosition =
  | 'POR' | 'LD' | 'LI' | 'CT'
  | 'PIV' | 'ORG' | 'MCO' | 'BOX' | 'INTD' | 'INTI' | 'MP'
  | 'EXTD' | 'EXTI' | 'DC' | 'F9';

export type MacroPosition = 'POR' | 'DEF' | 'MED' | 'DEL';

/** 8 habilidades de campo del FDF (manual §3.1) + 2 exclusivas de portero. */
export type SkillKey =
  | 'passing' | 'tackling' | 'shooting' | 'organization'
  | 'unmarking' | 'finishing' | 'dribbling' | 'fouls'
  | 'goalkeeping'   // salidas (portero)
  | 'reflexes';     // reflejos (portero)

export interface PositionDef {
  code: DetailedPosition;
  label: string;            // nombre en español (UI)
  dorsal: string;           // dorsal clásico (flavor)
  macro: MacroPosition;
  /** Pesos §1.1: 3 = clave, 2 = importante, 1 = secundaria, 0 = irrelevante. */
  weights: Partial<Record<SkillKey, number>>;
  /** Lado del campo para posiciones con espejo (izq/dcha). */
  side?: 'left' | 'right';
}

// Tabla de ponderación §1.1 (BOX diferenciado: entradas 3 a costa de tiro 1;
// MCO/MP separados según los atributos clave de §1: MCO = llegador con tiro,
// MP = cerebro con desmarque/regate).
export const DETAILED_POSITIONS: Record<DetailedPosition, PositionDef> = {
  POR: { code: 'POR', label: 'Portero', dorsal: '1', macro: 'POR',
    weights: { goalkeeping: 3, reflexes: 3 } },
  LD: { code: 'LD', label: 'Lateral derecho', dorsal: '2', macro: 'DEF', side: 'right',
    weights: { tackling: 3, organization: 1, passing: 2, unmarking: 1, dribbling: 2, finishing: 1, fouls: 1 } },
  LI: { code: 'LI', label: 'Lateral izquierdo', dorsal: '3', macro: 'DEF', side: 'left',
    weights: { tackling: 3, organization: 1, passing: 2, unmarking: 1, dribbling: 2, finishing: 1, fouls: 1 } },
  CT: { code: 'CT', label: 'Central', dorsal: '4/5', macro: 'DEF',
    weights: { tackling: 3, organization: 1, passing: 2, finishing: 1, fouls: 1 } },
  PIV: { code: 'PIV', label: 'Medio pivote defensivo', dorsal: '6', macro: 'MED',
    weights: { tackling: 3, organization: 3, passing: 2, dribbling: 1, shooting: 1, fouls: 1 } },
  ORG: { code: 'ORG', label: 'Mediocentro organizador', dorsal: '8', macro: 'MED',
    weights: { tackling: 2, organization: 3, passing: 3, unmarking: 1, dribbling: 1, shooting: 2, fouls: 2 } },
  MCO: { code: 'MCO', label: 'Mediocentro ofensivo', dorsal: '8/10', macro: 'MED',
    weights: { tackling: 1, organization: 3, passing: 3, unmarking: 2, dribbling: 1, shooting: 3, finishing: 1, fouls: 2 } },
  BOX: { code: 'BOX', label: 'Medio box-to-box', dorsal: '8', macro: 'MED',
    weights: { tackling: 3, organization: 3, passing: 3, unmarking: 1, dribbling: 1, shooting: 1, fouls: 2 } },
  INTD: { code: 'INTD', label: 'Interior derecho', dorsal: '8', macro: 'MED', side: 'right',
    weights: { tackling: 2, organization: 2, passing: 3, unmarking: 2, dribbling: 2, shooting: 1, finishing: 1, fouls: 1 } },
  INTI: { code: 'INTI', label: 'Interior izquierdo', dorsal: '8', macro: 'MED', side: 'left',
    weights: { tackling: 2, organization: 2, passing: 3, unmarking: 2, dribbling: 2, shooting: 1, finishing: 1, fouls: 1 } },
  MP: { code: 'MP', label: 'Media punta', dorsal: '10', macro: 'MED',
    weights: { tackling: 1, organization: 2, passing: 3, unmarking: 3, dribbling: 2, shooting: 2, finishing: 1, fouls: 2 } },
  EXTD: { code: 'EXTD', label: 'Extremo derecho', dorsal: '7', macro: 'DEL', side: 'right',
    weights: { tackling: 1, organization: 1, passing: 2, unmarking: 3, dribbling: 3, shooting: 2, finishing: 2, fouls: 1 } },
  EXTI: { code: 'EXTI', label: 'Extremo izquierdo', dorsal: '11', macro: 'DEL', side: 'left',
    weights: { tackling: 1, organization: 1, passing: 2, unmarking: 3, dribbling: 3, shooting: 2, finishing: 2, fouls: 1 } },
  DC: { code: 'DC', label: 'Delantero centro', dorsal: '9', macro: 'DEL',
    weights: { passing: 1, unmarking: 3, dribbling: 2, shooting: 2, finishing: 3, fouls: 1 } },
  F9: { code: 'F9', label: 'Falso 9 / segundo delantero', dorsal: '9/10', macro: 'DEL',
    weights: { organization: 1, passing: 2, unmarking: 3, dribbling: 2, shooting: 2, finishing: 2, fouls: 1 } },
};

export const DETAILED_POSITION_CODES = Object.keys(DETAILED_POSITIONS) as DetailedPosition[];

/** Mapeo a macro: LI/CT/LD→DEF · PIV/ORG/MCO/BOX/INTD/INTI/MP→MED · EXTI/EXTD/DC/F9→DEL. */
export function macroOf(detailed: string): MacroPosition {
  return DETAILED_POSITIONS[detailed as DetailedPosition]?.macro ?? 'MED';
}

export function labelOf(detailed: string | null | undefined): string | null {
  if (!detailed) return null;
  return DETAILED_POSITIONS[detailed as DetailedPosition]?.label ?? null;
}

export function isDetailedPosition(value: string | null | undefined): value is DetailedPosition {
  return Boolean(value && (value in DETAILED_POSITIONS));
}

/** Normaliza CUALQUIER string de posición histórico a la macro POR|DEF|MED|DEL. */
export function normalizeMacro(position: string | null | undefined): MacroPosition {
  const v = String(position ?? 'MED').trim().toUpperCase();
  if (['POR', 'PO', 'GK'].includes(v)) return 'POR';
  if (['DEF', 'DFC', 'CT', 'LD', 'LI', 'CB', 'DF'].includes(v)) return 'DEF';
  if (['DEL', 'DC', 'F9', 'EXTD', 'EXTI', 'EXT DERECHA', 'EXT IZQ', 'ST', 'ED', 'EI'].includes(v)) return 'DEL';
  return 'MED';
}

/** Mapeo DIRECTO de los strings detallados legacy del seed a las 15 nuevas. */
const LEGACY_DIRECT: Record<string, DetailedPosition> = {
  PO: 'POR', POR: 'POR', GK: 'POR',
  LD: 'LD', LI: 'LI', DFC: 'CT', CT: 'CT',
  PIV: 'PIV', MC: 'ORG', MCO: 'MCO', BOX: 'BOX', ORG: 'ORG',
  MD: 'INTD', MI: 'INTI', INTD: 'INTD', INTI: 'INTI', MP: 'MP',
  'EXT DERECHA': 'EXTD', 'EXT IZQ': 'EXTI', EXTD: 'EXTD', EXTI: 'EXTI',
  DC: 'DC', F9: 'F9',
};

export interface SkillProfile {
  passing: number; tackling: number; shooting: number; organization: number;
  unmarking: number; finishing: number; dribbling: number; fouls: number;
  goalkeeping: number; // salidas
  reflexes: number;   // reflejos (portero)
}

interface DerivablePlayer extends Partial<SkillProfile> {
  position?: string | null;
  squadNumber?: number | null;
  id?: number | null;
}

const num = (v: unknown, d = 50): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Lado estable por squadNumber (fallback id): par → derecho, impar → izquierdo. */
export function stableSide(player: { squadNumber?: number | null; id?: number | null }): 'left' | 'right' {
  const base = player.squadNumber ?? player.id ?? 0;
  return Math.abs(Math.trunc(base)) % 2 === 0 ? 'right' : 'left';
}

/** Candidatas por macro a las que puede derivar un jugador (lado por stableSide). */
const MACRO_CANDIDATES: Record<MacroPosition, DetailedPosition[]> = {
  POR: ['POR'],
  DEF: ['CT', 'LD', 'LI'],
  MED: ['PIV', 'ORG', 'BOX', 'MCO', 'MP', 'INTD', 'INTI'],
  DEL: ['DC', 'F9', 'EXTD', 'EXTI'],
};

/** Puntuación del jugador contra el perfil de pesos de una posición (§1.1):
 *  el perfil que MEJOR explica los atributos es su posición detallada.
 *  Se puntúa la DESVIACIÓN respecto a la media del propio jugador (Σ peso ×
 *  (atributo − media)): así un perfil con pocos pesos no gana por evitar
 *  dilución, sino que ganan los pesos alineados con sus puntos fuertes. */
const FIELD_SKILLS: SkillKey[] = ['passing', 'tackling', 'shooting', 'organization',
  'unmarking', 'finishing', 'dribbling', 'fouls'];

function profileScore(p: DerivablePlayer, def: PositionDef): number {
  const mean = FIELD_SKILLS.reduce((s, k) => s + num(p[k]), 0) / FIELD_SKILLS.length;
  let score = 0;
  for (const skill of FIELD_SKILLS) {
    const weight = def.weights[skill] ?? 0;
    if (!weight) continue;
    score += weight * (num(p[skill]) - mean);
  }
  return score;
}

/**
 * Derivación determinista (backfill WT1): dentro de la macro del jugador, gana
 * el perfil de pesos §1.1 con mayor media ponderada; las posiciones con espejo
 * (lateral/interior/extremo) se restringen al lado estable del jugador.
 * Strings detallados legacy (PO/DFC/MC/MD/…) mapean DIRECTO.
 */
export function deriveDetailedPosition(player: DerivablePlayer): DetailedPosition {
  const raw = String(player.position ?? 'MED').trim().toUpperCase();
  const direct = LEGACY_DIRECT[raw];
  if (direct) return direct;

  const macro = normalizeMacro(raw);
  const side = stableSide(player);
  const candidates = MACRO_CANDIDATES[macro].filter((code) => {
    const def = DETAILED_POSITIONS[code];
    return !def.side || def.side === side;
  });

  let best: DetailedPosition = candidates[0];
  let bestScore = -1;
  for (const code of candidates) {
    const score = profileScore(player, DETAILED_POSITIONS[code]);
    if (score > bestScore + 1e-9) {
      best = code;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Media por posición detallada = habilidades de peso 3+2 de la tabla §1.1
 * (ponderadas por su peso). Para POR: portería (peso 3).
 * Si el jugador no tiene posición detallada, el caller debe caer a la media
 * macro legacy (computeOverall) — ADITIVO.
 */
export function detailedOverall(detailed: string, p: Partial<SkillProfile>): number {
  const def = DETAILED_POSITIONS[detailed as DetailedPosition];
  if (!def) return 0;
  let sum = 0;
  let weightTotal = 0;
  for (const [skill, weight] of Object.entries(def.weights)) {
    if (!weight || weight < 2) continue;   // solo pesos 3 y 2 entran en la Media
    const fallback = detailed === 'POR' && skill === 'reflexes'
      ? num(p.goalkeeping)
      : 50;
    sum += num(p[skill as SkillKey], fallback) * weight;
    weightTotal += weight;
  }
  return weightTotal ? Math.max(0, Math.min(100, Math.round(sum / weightTotal))) : 0;
}

export function canonicalPlayerOverall(
  player: Pick<SkillProfile,
    'passing' | 'tackling' | 'shooting' | 'organization'
    | 'unmarking' | 'finishing' | 'dribbling' | 'goalkeeping'>
    & Partial<SkillProfile>
    & { position: string; detailedPosition?: string | null },
): number {
  if (player.detailedPosition && isDetailedPosition(player.detailedPosition)) {
    return detailedOverall(player.detailedPosition, player);
  }
  return playerOverall(player);
}

/**
 * GENERACIÓN (seed, cantera, regens): reparte los puntos según los pesos —
 * más en 3, menos en 2, residual en 1/0 — con varianza para que existan
 * híbridos (CT con salida, MC destructor, DC asociativo…). `rand` debe ser el
 * rng del caller para mantener su determinismo.
 *
 * Faltas: peso bajo generalizado pero la generación crea OUTLIERS (~12% de
 * especialistas a balón parado, manda el doc §1.1).
 */
export function generateSkillsFor(
  detailed: DetailedPosition,
  base: number,
  rand: () => number = deterministicSkillRng(detailed, base),
): SkillProfile {
  const def = DETAILED_POSITIONS[detailed];
  const gauss = () => {
    // Box-Muller simple sobre el rng inyectado.
    const u = Math.max(1e-9, 1 - rand());
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const clampSkill = (v: number) => Math.min(95, Math.max(5, Math.round(v)));
  // Offset por peso: 3 → +6, 2 → +2, 1 → −6, 0/— → −18 (residual).
  const OFFSET: Record<number, number> = { 3: 6, 2: 2, 1: -6, 0: -18 };

  const isGK = detailed === 'POR';
  const skills = {} as SkillProfile;
  const fieldKeys: SkillKey[] = ['passing', 'tackling', 'shooting', 'organization',
    'unmarking', 'finishing', 'dribbling', 'fouls'];

  for (const key of fieldKeys) {
    const weight = def.weights[key] ?? 0;
    if (isGK) {
      // El portero moderno conserva algo de pase/organización (peso 1 en tabla).
      const gkBase = weight > 0 ? base - 18 : base - 35;
      skills[key] = clampSkill(gkBase + gauss() * 5);
      continue;
    }
    skills[key] = clampSkill(base + (OFFSET[weight] ?? -18) + gauss() * 5);
  }
  // Outliers de faltas: especialistas a balón parado.
  if (!isGK && rand() < 0.12) {
    skills.fouls = clampSkill(base + 10 + gauss() * 6);
  }
  skills.goalkeeping = isGK
    ? clampSkill(base + 6 + gauss() * 4)
    : clampSkill(8 + rand() * 10);
  skills.reflexes = isGK
    ? clampSkill(base + 6 + gauss() * 4)
    : clampSkill(8 + rand() * 10);
  return skills;
}

function deterministicSkillRng(detailed: DetailedPosition, base: number): () => number {
  let state = [...detailed].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), base | 0) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distribución de posiciones detalladas para generar una plantilla coherente
 *  (≥2 POR, defensa/medio/delantera equilibradas con sus espejos). */
export const SQUAD_POSITION_TEMPLATE: DetailedPosition[] = [
  'POR', 'POR', 'POR',
  'LD', 'LD', 'LI', 'LI', 'CT', 'CT', 'CT', 'CT',
  'PIV', 'PIV', 'ORG', 'ORG', 'BOX', 'MCO', 'MP', 'INTD', 'INTI',
  'EXTD', 'EXTI', 'EXTD', 'EXTI', 'DC', 'DC', 'DC', 'F9', 'CT', 'ORG',
];

/** Pesos para sortear la posición de UN juvenil/regen nuevo (cantera). */
const YOUTH_POSITION_POOL: DetailedPosition[] = [
  'POR',
  'CT', 'CT', 'LD', 'LI',
  'PIV', 'ORG', 'BOX', 'MCO', 'MP', 'INTD', 'INTI',
  'EXTD', 'EXTI', 'DC', 'DC', 'F9',
];

export function pickYouthDetailedPosition(rand: () => number): DetailedPosition {
  return YOUTH_POSITION_POOL[Math.floor(rand() * YOUTH_POSITION_POOL.length)] ?? 'ORG';
}
