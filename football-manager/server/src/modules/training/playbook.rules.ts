export const FDF_PLAY_TYPES = [
  'field_attack',
  'field_defense',
  'setpiece_attack',
  'setpiece_defense',
] as const;

export const LEGACY_PLAY_TYPES = ['attack', 'defense', 'freekick'] as const;
export const TRAINED_PLAY_TYPES = [...FDF_PLAY_TYPES, ...LEGACY_PLAY_TYPES] as const;

export type FdfPlayType = typeof FDF_PLAY_TYPES[number];
export type TrainedPlayTypeInput = typeof TRAINED_PLAY_TYPES[number];

export const ACTIVE_MATCH_PLAY_MAX = 8;

export interface ActiveTrainedPlay {
  type: string;
  level: number;
  isActive?: boolean;
  status?: string;
  executorPlayerIds?: string | number[] | null;
}

export interface PlaybookProfileBonus {
  attack: number;
  defense: number;
  midfield: number;
}

export function normalizeTrainedPlayType(type: string): FdfPlayType {
  switch (type) {
    case 'field_attack':
    case 'field_defense':
    case 'setpiece_attack':
    case 'setpiece_defense':
      return type;
    case 'attack':
      return 'field_attack';
    case 'defense':
      return 'field_defense';
    case 'freekick':
      return 'setpiece_attack';
    default:
      throw new Error(`Tipo de jugada inválido. Opciones: ${FDF_PLAY_TYPES.join(', ')}`);
  }
}

/**
 * Efecto mecánico de las jugadas activas sobre el perfil del partido.
 *
 * El manual usa puntuaciones por presencia de tres ejecutores, datos que el
 * schema actual todavía no guarda. Hasta ese cutover, el nivel acumulado es la
 * fuente observable: campo pesa completo y balón parado a la mitad. El bonus
 * queda acotado para que ocho jugadas de nivel 15 no saquen atributos de rango.
 */
function executorIds(raw: ActiveTrainedPlay['executorPlayerIds']): number[] | null {
  if (raw == null) return null;
  try {
    const parsed = Array.isArray(raw) ? raw : JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 3);
  } catch {
    return [];
  }
}

export function playbookProfileBonus(
  plays: ActiveTrainedPlay[],
  starterPlayerIds: Array<number | string> = [],
): PlaybookProfileBonus {
  let attackScore = 0;
  let defenseScore = 0;
  const starterIds = new Set(starterPlayerIds.map((id) => Number(id)).filter(Number.isSafeInteger));

  for (const play of plays) {
    if (play.isActive === false || play.status === 'developing') continue;
    const level = Math.max(0, Math.min(15, Math.trunc(play.level)));
    const executors = executorIds(play.executorPlayerIds);
    const effectiveLevel = executors == null
      ? level
      : Math.floor(level * executors.filter((id) => starterIds.has(id)).length / 3);
    const type = normalizeTrainedPlayType(play.type);
    const weight = type.startsWith('setpiece_') ? 0.5 : 1;
    if (type.endsWith('_attack')) attackScore += effectiveLevel * weight;
    else defenseScore += effectiveLevel * weight;
  }

  const scale = (score: number) => Math.max(0, Math.min(6, Math.floor(score / 5)));
  const attack = scale(attackScore);
  const defense = scale(defenseScore);
  return {
    attack,
    defense,
    midfield: Math.max(-6, Math.min(6, attack - defense)) / 2,
  };
}
