// Contrato publico (Y10):
// - getFormationDefinition(formation) -> definicion de catalogo o null.
// - validateFormationLineup(lineup, formation) -> slots + penalizaciones 0/-10/-20.
// - computeFormationCounter(home, away) -> bonus suave de ataque/defensa/medio.
// - computePhysicalDemand(formation) -> demanda 1-5 y notas de carrileros/BOX.
// - autoPlaceLineup(players, formation) -> XI determinista + banquillo, sin persistir.
//
// Modulo puro: no React, no fetch, no estado global. Fuente de reglas:
// docs/diseno-posiciones-y-formaciones.md y manual §2.3/§2.5/§2.6.

export type MacroPosition = 'POR' | 'DEF' | 'MED' | 'DEL';
export type DetailedPosition =
  | 'POR'
  | 'LD' | 'LI' | 'CT'
  | 'PIV' | 'ORG' | 'MCO' | 'BOX' | 'INTD' | 'INTI' | 'MP'
  | 'EXTD' | 'EXTI' | 'DC' | 'F9';

export type ModernRole =
  | 'portero_libero'
  | 'lateral_invertido'
  | 'carrilero'
  | 'central_salidor'
  | 'pierna_cambiada'
  | 'falso_9';

export interface FormationSlot {
  index: number;
  positions: readonly DetailedPosition[];
  label: string;
  roles?: readonly ModernRole[];
}

export interface FormationDefinition {
  key: string;
  name: string;
  shape: string;
  slots: readonly FormationSlot[];
  counters: { strongVs: readonly string[]; weakVs: readonly string[] };
  physicalDemand: 1 | 2 | 3 | 4 | 5;
  style: 'posesion' | 'contraataque' | 'equilibrada' | 'defensiva' | 'ofensiva' | 'historica';
}

export interface TacticPlayer {
  id: number | string;
  name: string;
  position?: string | null;
  detailedPosition?: string | null;
  squadNumber?: number | null;
  overall?: number | null;
  fitness?: number | null;
  morale?: number | null;
  isInjured?: boolean | null;
  isSuspended?: boolean | null;
  injuredUntil?: string | Date | null;
  suspendedMatches?: number | null;
  passing?: number | null;
  tackling?: number | null;
  shooting?: number | null;
  organization?: number | null;
  unmarking?: number | null;
  finishing?: number | null;
  dribbling?: number | null;
  fouls?: number | null;
  goalkeeping?: number | null;
}

export interface SlotAssignment {
  slotIndex: number;
  slotLabel: string;
  requiredPositions: readonly DetailedPosition[];
  roles: readonly ModernRole[];
  assignedLine: MacroPosition;
  player: TacticPlayer | null;
  naturalPosition: DetailedPosition | null;
  macro: MacroPosition;
  outOfPosition: boolean;
  penalty: 0 | -10 | -20;
  severity: 'natural' | 'adapted' | 'emergency' | 'empty';
  score: number;
}

export interface LineupValidation {
  formationKey: string | null;
  valid: boolean;
  assignments: SlotAssignment[];
  warnings: string[];
  missingSlots: number[];
  outOfPositionCount: number;
  emergencyCount: number;
}

export interface AutoLineupResult extends LineupValidation {
  xi: SlotAssignment[];
  bench: TacticPlayer[];
}

export interface FormationCounter {
  home: { attack: number; defense: number; midfield: number };
  away: { attack: number; defense: number; midfield: number };
  favored: 'home' | 'away';
  reason: string;
}

export interface PhysicalDemandReport {
  formationKey: string | null;
  demand: 1 | 2 | 3 | 4 | 5 | null;
  fatigueModifier: number;
  wingBackSlotIndexes: number[];
  boxToBoxSlotIndexes: number[];
  notes: string[];
}

type Skill =
  | 'passing' | 'tackling' | 'shooting' | 'organization'
  | 'unmarking' | 'finishing' | 'dribbling' | 'fouls' | 'goalkeeping';

type SlotSpec = readonly [readonly DetailedPosition[], string, (readonly ModernRole[])?];

const MACRO_BY_POSITION: Record<DetailedPosition, MacroPosition> = {
  POR: 'POR',
  LD: 'DEF',
  LI: 'DEF',
  CT: 'DEF',
  PIV: 'MED',
  ORG: 'MED',
  MCO: 'MED',
  BOX: 'MED',
  INTD: 'MED',
  INTI: 'MED',
  MP: 'MED',
  EXTD: 'DEL',
  EXTI: 'DEL',
  DC: 'DEL',
  F9: 'DEL',
};

const POSITION_ALIASES: Record<string, DetailedPosition> = {
  PO: 'POR',
  POR: 'POR',
  DFC: 'CT',
  CT: 'CT',
  LD: 'LD',
  LI: 'LI',
  MC: 'ORG',
  MCC: 'ORG',
  ORG: 'ORG',
  PIV: 'PIV',
  MCO: 'MCO',
  MCTT: 'BOX',
  BOX: 'BOX',
  MD: 'INTD',
  INTD: 'INTD',
  MI: 'INTI',
  INTI: 'INTI',
  MP: 'MP',
  EXTD: 'EXTD',
  'EXT DERECHA': 'EXTD',
  EXTI: 'EXTI',
  'EXT IZQ': 'EXTI',
  DC: 'DC',
  S9: 'F9',
  'FALSO 9': 'F9',
  F9: 'F9',
};

const WEIGHTS: Record<DetailedPosition, Partial<Record<Skill, number>>> = {
  POR: { goalkeeping: 6, organization: 1, passing: 1 },
  CT: { tackling: 3, passing: 2, organization: 1, finishing: 1, fouls: 1 },
  LD: { tackling: 3, passing: 2, dribbling: 2, organization: 1, unmarking: 1, finishing: 1, fouls: 1 },
  LI: { tackling: 3, passing: 2, dribbling: 2, organization: 1, unmarking: 1, finishing: 1, fouls: 1 },
  PIV: { tackling: 3, organization: 3, passing: 2, dribbling: 1, shooting: 1, fouls: 1 },
  ORG: { organization: 3, passing: 3, tackling: 2, shooting: 2, fouls: 2, unmarking: 1, dribbling: 1 },
  BOX: { organization: 3, passing: 3, tackling: 3, fouls: 2, unmarking: 1, dribbling: 1, shooting: 1 },
  INTD: { passing: 3, tackling: 2, organization: 2, unmarking: 2, dribbling: 2, shooting: 1, finishing: 1, fouls: 1 },
  INTI: { passing: 3, tackling: 2, organization: 2, unmarking: 2, dribbling: 2, shooting: 1, finishing: 1, fouls: 1 },
  MCO: { organization: 3, passing: 3, shooting: 3, unmarking: 2, dribbling: 2, fouls: 2, tackling: 1, finishing: 1 },
  MP: { organization: 3, passing: 3, shooting: 3, unmarking: 2, dribbling: 2, fouls: 2, tackling: 1, finishing: 1 },
  EXTD: { unmarking: 3, dribbling: 3, passing: 2, shooting: 2, finishing: 2, tackling: 1, organization: 1, fouls: 1 },
  EXTI: { unmarking: 3, dribbling: 3, passing: 2, shooting: 2, finishing: 2, tackling: 1, organization: 1, fouls: 1 },
  DC: { finishing: 3, unmarking: 3, shooting: 2, dribbling: 2, passing: 1, fouls: 1 },
  F9: { unmarking: 3, passing: 2, dribbling: 2, shooting: 2, finishing: 2, organization: 1, fouls: 1 },
};

const GK: SlotSpec = [['POR'], 'Portero', ['portero_libero']];

function slots(specs: readonly SlotSpec[]): readonly FormationSlot[] {
  return specs.map(([positions, label, roles], i) => ({
    index: i + 1,
    positions,
    label,
    ...(roles && roles.length ? { roles } : {}),
  }));
}

export const FORMATION_CATALOG: readonly FormationDefinition[] = [
  {
    key: '4-4-2', name: '4-4-2 - la clasica', shape: '4-4-2',
    slots: slots([GK, [['LD'], 'Lateral derecho', ['lateral_invertido']], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo', ['lateral_invertido']], [['INTD'], 'Interior derecho'], [['ORG', 'BOX'], 'Mediocentro'], [['ORG', 'BOX'], 'Mediocentro'], [['INTI'], 'Interior izquierdo'], [['DC'], 'Delantero centro'], [['F9', 'DC'], 'Segundo punta', ['falso_9']]]),
    counters: { strongVs: ['4-3-2-1', '4-1-2-1-2'], weakVs: ['3-5-2', '4-5-1'] },
    physicalDemand: 3, style: 'equilibrada',
  },
  {
    key: '4-5-1', name: '4-5-1 - cerrojo de contraataque', shape: '4-5-1',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['EXTD', 'INTD'], 'Banda derecha', ['pierna_cambiada']], [['ORG'], 'Organizador'], [['PIV'], 'Pivote'], [['ORG', 'BOX'], 'Mediocentro'], [['EXTI', 'INTI'], 'Banda izquierda', ['pierna_cambiada']], [['DC'], 'Delantero centro']]),
    counters: { strongVs: ['4-3-3'], weakVs: ['4-2-4'] },
    physicalDemand: 3, style: 'contraataque',
  },
  {
    key: '4-3-3', name: '4-3-3 - posesion y presion', shape: '4-3-3',
    slots: slots([GK, [['LD'], 'Lateral derecho', ['lateral_invertido']], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo', ['lateral_invertido']], [['PIV'], 'Pivote'], [['ORG', 'BOX'], 'Mediocentro'], [['MCO'], 'Mediocentro ofensivo'], [['EXTD'], 'Extremo derecho', ['pierna_cambiada']], [['DC', 'F9'], 'Delantero centro', ['falso_9']], [['EXTI'], 'Extremo izquierdo', ['pierna_cambiada']]]),
    counters: { strongVs: ['4-4-2', '3-5-2'], weakVs: ['4-5-1', '5-4-1'] },
    physicalDemand: 4, style: 'posesion',
  },
  {
    key: '4-3-2-1', name: '4-3-2-1 - arbol de Navidad', shape: '4-3-2-1',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['PIV'], 'Pivote'], [['ORG'], 'Organizador'], [['BOX'], 'Box-to-box'], [['MCO', 'MP'], 'Enganche'], [['MP'], 'Media punta'], [['DC'], 'Delantero centro']]),
    counters: { strongVs: ['3-4-3'], weakVs: ['4-4-2', '4-2-4'] },
    physicalDemand: 3, style: 'posesion',
  },
  {
    key: '4-1-3-2', name: '4-1-3-2 - ofensiva', shape: '4-1-3-2',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['PIV'], 'Pivote'], [['INTD'], 'Interior derecho'], [['MCO', 'ORG'], 'Mediocentro ofensivo'], [['INTI'], 'Interior izquierdo'], [['DC'], 'Delantero centro'], [['F9'], 'Segundo punta', ['falso_9']]]),
    counters: { strongVs: ['4-4-2'], weakVs: ['3-5-2'] },
    physicalDemand: 4, style: 'ofensiva',
  },
  {
    key: '5-4-1', name: '5-4-1 - catenaccio', shape: '5-4-1',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Libero', ['central_salidor']], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['INTD'], 'Interior derecho'], [['ORG'], 'Organizador'], [['PIV'], 'Pivote'], [['INTI'], 'Interior izquierdo'], [['DC'], 'Delantero centro']]),
    counters: { strongVs: ['4-3-3'], weakVs: ['4-2-4', '4-3-2-1'] },
    physicalDemand: 2, style: 'defensiva',
  },
  {
    key: '4-1-2-1-2', name: '4-1-2-1-2 - diamante', shape: '4-1-2-1-2',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['PIV'], 'Pivote'], [['INTD'], 'Interior derecho'], [['INTI'], 'Interior izquierdo'], [['MP'], 'Media punta'], [['DC'], 'Delantero centro'], [['F9', 'DC'], 'Segundo punta', ['falso_9']]]),
    counters: { strongVs: ['4-4-2'], weakVs: ['4-3-3', '4-2-4'] },
    physicalDemand: 4, style: 'ofensiva',
  },
  {
    key: '3-5-2', name: '3-5-2 - dominio del centro', shape: '3-5-2',
    slots: slots([GK, [['CT'], 'Central'], [['CT'], 'Central'], [['CT'], 'Central'], [['LD'], 'Carrilero derecho', ['carrilero']], [['INTD', 'ORG'], 'Interior derecho'], [['PIV'], 'Pivote'], [['INTI', 'ORG'], 'Interior izquierdo'], [['LI'], 'Carrilero izquierdo', ['carrilero']], [['DC'], 'Delantero centro'], [['F9', 'DC'], 'Segundo punta', ['falso_9']]]),
    counters: { strongVs: ['4-4-2', '4-1-3-2'], weakVs: ['4-3-3'] },
    physicalDemand: 5, style: 'equilibrada',
  },
  {
    key: '5-3-2', name: '5-3-2 - candado con salida', shape: '5-3-2',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['ORG'], 'Organizador'], [['PIV'], 'Pivote'], [['BOX'], 'Box-to-box'], [['DC'], 'Delantero centro'], [['F9', 'DC'], 'Segundo punta', ['falso_9']]]),
    counters: { strongVs: ['4-2-4'], weakVs: ['4-3-3'] },
    physicalDemand: 4, style: 'defensiva',
  },
  {
    key: '4-2-3-1', name: '4-2-3-1 - navaja suiza', shape: '4-2-3-1',
    slots: slots([GK, [['LD'], 'Lateral derecho', ['lateral_invertido']], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo', ['lateral_invertido']], [['PIV'], 'Pivote'], [['BOX', 'PIV'], 'Doble pivote'], [['EXTD', 'INTD'], 'Banda derecha', ['pierna_cambiada']], [['MP'], 'Media punta'], [['EXTI', 'INTI'], 'Banda izquierda', ['pierna_cambiada']], [['DC'], 'Delantero centro']]),
    counters: { strongVs: [], weakVs: [] },
    physicalDemand: 3, style: 'equilibrada',
  },
  {
    key: '3-4-3', name: '3-4-3 - apisonadora', shape: '3-4-3',
    slots: slots([GK, [['CT'], 'Central'], [['CT'], 'Central salidor', ['central_salidor']], [['CT'], 'Central'], [['LD'], 'Carrilero derecho', ['carrilero']], [['PIV', 'ORG'], 'Mediocentro'], [['BOX'], 'Box-to-box'], [['LI'], 'Carrilero izquierdo', ['carrilero']], [['EXTD'], 'Extremo derecho', ['pierna_cambiada']], [['DC'], 'Delantero centro'], [['EXTI'], 'Extremo izquierdo', ['pierna_cambiada']]]),
    counters: { strongVs: ['4-4-2', '4-5-1'], weakVs: ['4-1-2-1-2', '4-3-2-1'] },
    physicalDemand: 5, style: 'ofensiva',
  },
  {
    key: '3-2-4-1', name: '3-2-4-1 - transicion moderna', shape: '3-2-4-1',
    slots: slots([GK, [['CT'], 'Central'], [['CT'], 'Central salidor', ['central_salidor']], [['CT'], 'Central'], [['PIV'], 'Pivote'], [['PIV', 'CT'], 'Pivote/libero'], [['INTD'], 'Interior derecho'], [['MCO'], 'Mediocentro ofensivo'], [['MCO'], 'Mediocentro ofensivo'], [['INTI'], 'Interior izquierdo'], [['DC'], 'Delantero centro']]),
    counters: { strongVs: [], weakVs: ['4-3-3'] },
    physicalDemand: 4, style: 'posesion',
  },
  {
    key: 'wm-3-2-5', name: 'WM 3-2-5 - historica', shape: '3-2-5',
    slots: slots([GK, [['CT'], 'Central'], [['CT'], 'Central'], [['CT'], 'Central'], [['PIV'], 'Pivote'], [['PIV'], 'Pivote'], [['EXTD'], 'Extremo derecho'], [['INTD', 'MCO'], 'Interior derecho'], [['DC'], 'Delantero centro'], [['INTI', 'MCO'], 'Interior izquierdo'], [['EXTI'], 'Extremo izquierdo']]),
    counters: { strongVs: [], weakVs: ['4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '4-5-1'] },
    physicalDemand: 3, style: 'historica',
  },
  {
    key: 'metodo-2-3-2-3', name: 'Metodo 2-3-2-3 - historica', shape: '2-3-2-3',
    slots: slots([GK, [['CT'], 'Central'], [['CT'], 'Central'], [['PIV'], 'Pivote'], [['ORG'], 'Organizador'], [['PIV'], 'Pivote'], [['MCO', 'MP'], 'Enganche'], [['MCO', 'MP'], 'Enganche'], [['EXTD'], 'Extremo derecho'], [['DC'], 'Delantero centro'], [['EXTI'], 'Extremo izquierdo']]),
    counters: { strongVs: ['wm-3-2-5'], weakVs: ['4-4-2', '3-5-2', '4-2-4'] },
    physicalDemand: 3, style: 'historica',
  },
  {
    key: '4-2-4', name: '4-2-4 - ataque total', shape: '4-2-4',
    slots: slots([GK, [['LD'], 'Lateral derecho'], [['CT'], 'Central'], [['CT'], 'Central'], [['LI'], 'Lateral izquierdo'], [['ORG'], 'Organizador'], [['BOX'], 'Box-to-box'], [['EXTD'], 'Extremo derecho'], [['DC'], 'Delantero centro'], [['DC', 'F9'], 'Segundo punta', ['falso_9']], [['EXTI'], 'Extremo izquierdo']]),
    counters: { strongVs: ['5-4-1', '4-5-1', '4-3-2-1'], weakVs: ['3-5-2', '4-3-3', '4-2-3-1'] },
    physicalDemand: 4, style: 'ofensiva',
  },
];

export function normalizeDetailedPosition(value: unknown): DetailedPosition | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  return POSITION_ALIASES[raw.toUpperCase()] ?? null;
}

export function macroOfPosition(value: unknown): MacroPosition {
  const detailed = normalizeDetailedPosition(value);
  if (detailed) return MACRO_BY_POSITION[detailed];
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (raw === 'DEF') return 'DEF';
  if (raw === 'MED') return 'MED';
  if (raw === 'DEL') return 'DEL';
  return raw === 'POR' ? 'POR' : 'MED';
}

export function slotMacro(slot: Pick<FormationSlot, 'positions'>): MacroPosition {
  return MACRO_BY_POSITION[slot.positions[0] ?? 'ORG'];
}

export function getFormationDefinition(formation: unknown): FormationDefinition | null {
  if (typeof formation !== 'string') return null;
  const key = formation.trim().toLowerCase();
  if (!key) return null;
  return FORMATION_CATALOG.find((f) => f.key === key || f.shape === key) ?? null;
}

function parseLegacyShape(formation: unknown): FormationDefinition | null {
  if (typeof formation !== 'string') return null;
  const parts = formation.trim().split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.length > 4 || parts.some((part) => !Number.isInteger(part) || part < 1)) {
    return null;
  }
  const total = parts.reduce((acc, part) => acc + part, 0);
  if (total !== 10) return null;
  const def = parts[0] ?? 4;
  const fwd = parts[parts.length - 1] ?? 2;
  const mid = total - def - fwd;
  const legacySlots: SlotSpec[] = [GK];
  for (let i = 0; i < def; i += 1) legacySlots.push([['LD', 'CT', 'LI'], 'Defensa']);
  for (let i = 0; i < mid; i += 1) legacySlots.push([['PIV', 'ORG', 'BOX', 'MCO', 'INTD', 'INTI', 'MP'], 'Mediocampo']);
  for (let i = 0; i < fwd; i += 1) legacySlots.push([['DC', 'F9', 'EXTD', 'EXTI'], 'Ataque']);
  return {
    key: formation.trim(),
    name: `${formation.trim()} - libre`,
    shape: formation.trim(),
    slots: slots(legacySlots),
    counters: { strongVs: [], weakVs: [] },
    physicalDemand: 3,
    style: 'equilibrada',
  };
}

function formationOrLegacy(formation: unknown): FormationDefinition | null {
  return getFormationDefinition(formation) ?? parseLegacyShape(formation);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function idKey(player: TacticPlayer): string {
  return String(player.id);
}

function playerDetailed(player: TacticPlayer): DetailedPosition | null {
  return normalizeDetailedPosition(player.detailedPosition) ?? normalizeDetailedPosition(player.position);
}

function playerAvailable(player: TacticPlayer, referenceDate?: Date): boolean {
  if (player.isInjured || player.isSuspended) return false;
  if (num(player.suspendedMatches) > 0) return false;
  if (player.injuredUntil == null) return true;
  const until = player.injuredUntil instanceof Date ? player.injuredUntil : new Date(player.injuredUntil);
  const now = referenceDate ?? new Date();
  return Number.isNaN(until.getTime()) || until <= now;
}

export function detailedOverall(position: DetailedPosition, player: TacticPlayer): number {
  const weights = WEIGHTS[position];
  let total = 0;
  let weighted = 0;
  for (const [skill, weight] of Object.entries(weights) as [Skill, number][]) {
    const value = num(player[skill], Number.NaN);
    if (!Number.isFinite(value)) continue;
    total += weight;
    weighted += value * weight;
  }
  if (total > 0) return weighted / total;
  return num(player.overall, 50);
}

function fitPenalty(player: TacticPlayer | null, slot: FormationSlot): 0 | -10 | -20 {
  if (!player) return -20;
  const detailed = playerDetailed(player);
  const macro = detailed ? MACRO_BY_POSITION[detailed] : macroOfPosition(player.position);
  const targetMacro = slotMacro(slot);
  if (targetMacro === 'POR') return macro === 'POR' ? 0 : -20;
  if (macro === 'POR') return -20;
  if (detailed && slot.positions.includes(detailed)) return 0;
  return macro === targetMacro ? -10 : -20;
}

function assignmentFor(slot: FormationSlot, player: TacticPlayer | null, score = 0): SlotAssignment {
  const detailed = player ? playerDetailed(player) : null;
  const macro = detailed ? MACRO_BY_POSITION[detailed] : macroOfPosition(player?.position);
  const penalty = fitPenalty(player, slot);
  const severity = !player ? 'empty' : penalty === 0 ? 'natural' : penalty === -10 ? 'adapted' : 'emergency';
  return {
    slotIndex: slot.index,
    slotLabel: slot.label,
    requiredPositions: slot.positions,
    roles: slot.roles ?? [],
    assignedLine: slotMacro(slot),
    player,
    naturalPosition: detailed,
    macro,
    outOfPosition: penalty < 0,
    penalty,
    severity,
    score,
  };
}

function scoreForSlot(player: TacticPlayer, slot: FormationSlot): number {
  const preferred = playerDetailed(player);
  const reference = preferred && slot.positions.includes(preferred) ? preferred : slot.positions[0] ?? 'ORG';
  const base = detailedOverall(reference, player);
  const penalty = fitPenalty(player, slot);
  const fitFactor = penalty === 0 ? 1.06 : penalty === -10 ? 0.82 : 0.58;
  const fitness = Math.max(0.55, Math.min(1.1, 0.75 + num(player.fitness, 80) / 400));
  const morale = Math.max(0.9, Math.min(1.05, 0.95 + num(player.morale, 60) / 1200));
  return base * fitFactor * fitness * morale;
}

function sortCandidates(players: readonly TacticPlayer[], slot: FormationSlot, used: Set<string>): TacticPlayer[] {
  return [...players]
    .filter((player) => !used.has(idKey(player)))
    .filter((player) => slotMacro(slot) === 'POR' || macroOfPosition(player.position) !== 'POR')
    .sort((a, b) =>
      scoreForSlot(b, slot) - scoreForSlot(a, slot)
      || num(a.squadNumber, 99) - num(b.squadNumber, 99)
      || String(a.id).localeCompare(String(b.id)));
}

export function validateFormationLineup(lineup: readonly (TacticPlayer | null)[], formation: unknown): LineupValidation {
  const definition = formationOrLegacy(formation);
  if (!definition) {
    return {
      formationKey: null,
      valid: false,
      assignments: [],
      warnings: ['Formacion no valida o no soportada.'],
      missingSlots: [],
      outOfPositionCount: 0,
      emergencyCount: 0,
    };
  }
  const assignments = definition.slots.map((slot, index) => assignmentFor(slot, lineup[index] ?? null));
  const missingSlots = assignments.filter((item) => !item.player).map((item) => item.slotIndex);
  const outOfPositionCount = assignments.filter((item) => item.penalty === -10).length;
  const emergencyCount = assignments.filter((item) => item.penalty === -20 && item.player).length;
  const warnings: string[] = [];
  if (missingSlots.length) warnings.push(`Faltan ${missingSlots.length} huecos por cubrir.`);
  if (outOfPositionCount) warnings.push(`${outOfPositionCount} jugador(es) adaptados fuera de posicion natural.`);
  if (emergencyCount) warnings.push(`${emergencyCount} emergencia(s) de linea o porteria.`);
  return {
    formationKey: definition.key,
    valid: missingSlots.length === 0 && emergencyCount === 0,
    assignments,
    warnings,
    missingSlots,
    outOfPositionCount,
    emergencyCount,
  };
}

export function autoPlaceLineup(
  players: readonly TacticPlayer[],
  formation: unknown,
  referenceDate?: Date,
): AutoLineupResult {
  const definition = formationOrLegacy(formation);
  if (!definition) {
    return {
      formationKey: null,
      valid: false,
      assignments: [],
      xi: [],
      bench: [...players],
      warnings: ['Formacion no valida o no soportada.'],
      missingSlots: [],
      outOfPositionCount: 0,
      emergencyCount: 0,
    };
  }

  const pool = players.filter((player) => playerAvailable(player, referenceDate));
  const usablePool = pool.length >= 11 ? pool : [...players];
  const used = new Set<string>();
  const xi: SlotAssignment[] = [];

  for (const slot of definition.slots) {
    const exact = sortCandidates(usablePool, slot, used).filter((player) => fitPenalty(player, slot) === 0);
    const fallback = exact[0] ?? sortCandidates(usablePool, slot, used)[0] ?? null;
    if (fallback) used.add(idKey(fallback));
    xi.push(assignmentFor(slot, fallback, fallback ? scoreForSlot(fallback, slot) : 0));
  }

  const starterIds = new Set(xi.flatMap((item) => item.player ? [idKey(item.player)] : []));
  const bench = usablePool
    .filter((player) => !starterIds.has(idKey(player)))
    .sort((a, b) => num(b.overall, 0) - num(a.overall, 0) || String(a.id).localeCompare(String(b.id)));
  const validation = validateFormationLineup(xi.map((item) => item.player), definition.key);
  return { ...validation, assignments: xi, xi, bench };
}

export function computeFormationCounter(homeFormation: unknown, awayFormation: unknown): FormationCounter | null {
  const home = getFormationDefinition(homeFormation);
  const away = getFormationDefinition(awayFormation);
  if (!home || !away || home.key === away.key) return null;
  const advantage = (a: FormationDefinition, b: FormationDefinition): number =>
    (a.counters.strongVs.includes(b.key) ? 1 : 0) - (a.counters.weakVs.includes(b.key) ? 1 : 0);
  const net = Math.max(-1, Math.min(1, advantage(home, away) - advantage(away, home)));
  if (net === 0) return null;
  const side = (sign: number) => ({ attack: 2 * sign, defense: 1 * sign, midfield: 1.5 * sign });
  return {
    home: side(net),
    away: side(-net),
    favored: net > 0 ? 'home' : 'away',
    reason: net > 0 ? `${home.key} castiga a ${away.key}` : `${away.key} castiga a ${home.key}`,
  };
}

export function computePhysicalDemand(formation: unknown): PhysicalDemandReport {
  const definition = getFormationDefinition(formation);
  if (!definition) {
    return {
      formationKey: null,
      demand: null,
      fatigueModifier: 0,
      wingBackSlotIndexes: [],
      boxToBoxSlotIndexes: [],
      notes: ['Formacion fuera de catalogo: demanda fisica neutra.'],
    };
  }
  const wingBackSlotIndexes = definition.slots
    .filter((slot) => (slot.roles ?? []).includes('carrilero'))
    .map((slot) => slot.index);
  const boxToBoxSlotIndexes = definition.slots
    .filter((slot) => slot.positions.includes('BOX'))
    .map((slot) => slot.index);
  const notes: string[] = [];
  if (definition.physicalDemand > 3) notes.push('Demanda alta: rota mejor tras el partido.');
  if (definition.physicalDemand < 3) notes.push('Bloque de baja demanda fisica.');
  if (wingBackSlotIndexes.length) notes.push('Carrileros con desgaste extra.');
  if (boxToBoxSlotIndexes.length && definition.physicalDemand >= 4) notes.push('BOX con desgaste adicional.');
  return {
    formationKey: definition.key,
    demand: definition.physicalDemand,
    fatigueModifier: (definition.physicalDemand - 3) * 2,
    wingBackSlotIndexes,
    boxToBoxSlotIndexes,
    notes,
  };
}

export function defensiveReinforcementPoints(formation: unknown): number {
  const definition = formationOrLegacy(formation);
  if (!definition) return 0;
  const defenders = definition.slots.filter((slot) => slotMacro(slot) === 'DEF').length;
  if (defenders >= 5) return 3;
  if (defenders >= 4) return 2;
  return defenders >= 3 ? 1 : 0;
}
