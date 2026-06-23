export const FATIGUE_COLLAPSE_THRESHOLD = 6;

export const LOW_FITNESS_SKILLS = [
  'passing',
  'tackling',
  'shooting',
  'organization',
  'unmarking',
  'finishing',
  'dribbling',
  'fouls',
  'goalkeeping',
  'reflexes',
] as const;

export type LowFitnessSkill = typeof LOW_FITNESS_SKILLS[number];

export function nextAccumulatedFatigue(
  fitness: number,
  accumulatedFatigue: number,
): { fitness: number; accumulatedFatigue: number; collapsed: boolean } {
  const safeFitness = Math.max(0, Math.min(100, Math.round(fitness)));
  const safeFatigue = Math.max(0, Math.trunc(accumulatedFatigue) || 0);

  if (safeFitness > 90) {
    const nextFatigue = safeFatigue + 1;
    if (nextFatigue >= FATIGUE_COLLAPSE_THRESHOLD) {
      return { fitness: 40, accumulatedFatigue: 0, collapsed: true };
    }
    return { fitness: safeFitness, accumulatedFatigue: nextFatigue, collapsed: false };
  }
  return {
    fitness: safeFitness,
    accumulatedFatigue: Math.max(0, safeFatigue - 1),
    collapsed: false,
  };
}

export function motivationProtectsMorale(
  isPermanentlyMotivated: boolean,
  motivatedUntilTurn: number | null | undefined,
  currentTurn: number,
): boolean {
  return isPermanentlyMotivated || (motivatedUntilTurn ?? -1) >= currentTurn;
}

function normalizedAffinity(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function motivationAffinityMatches(
  playerAffinity: string | null | undefined,
  managerAffinity: string | null | undefined,
  psychologistAffinities: string[],
): boolean {
  const player = normalizedAffinity(playerAffinity);
  if (!player) return false;
  if (player === normalizedAffinity(managerAffinity)) return true;
  return psychologistAffinities.some((affinity) => normalizedAffinity(affinity) === player);
}

export function lowFitnessSkillFor(
  fitness: number,
  playerId: number,
  turn: number,
): LowFitnessSkill | null {
  if (fitness >= 45) return null;
  const index = Math.abs(Math.imul(playerId, 31) + Math.imul(turn, 17)) % LOW_FITNESS_SKILLS.length;
  return LOW_FITNESS_SKILLS[index];
}
