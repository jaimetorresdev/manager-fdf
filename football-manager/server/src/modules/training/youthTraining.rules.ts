export type YouthTrainingGroup = 'goalkeeping' | 'defense' | 'midfield' | 'attack' | 'experience';

const YOUTH_GROUP_PENALTY: Record<YouthTrainingGroup, number> = {
  goalkeeping: 40,
  defense: 35,
  midfield: 35,
  attack: 35,
  experience: 60,
};

export function youthCoachSuccessThreshold(level: number, group: YouthTrainingGroup): number {
  const progression = Math.max(0, Math.min(100, Math.round(level) * 10));
  return Math.max(0, progression - YOUTH_GROUP_PENALTY[group]);
}

export function nextYouthTrainingValue(
  current: number,
  potential: number,
  roll: number,
  successThreshold: number,
): number {
  const safeCurrent = Math.max(1, Math.min(99, Math.round(current)));
  const ceiling = Math.max(1, Math.min(99, Math.round(potential)));
  if (roll >= successThreshold || safeCurrent >= ceiling) return safeCurrent;
  return Math.min(ceiling, safeCurrent + 1);
}
