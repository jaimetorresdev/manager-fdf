export type ProgressionField =
  | 'passing'
  | 'tackling'
  | 'shooting'
  | 'organization'
  | 'unmarking'
  | 'finishing'
  | 'dribbling'
  | 'fouls'
  | 'goalkeeping'
  | 'reflexes'
  | 'fitness'
  | 'muscularFitness'
  | 'mentalSharpness'
  | 'matchRhythm'
  | 'morale'
  | 'experience';

const STATE_FIELDS = new Set<ProgressionField>([
  'fitness',
  'muscularFitness',
  'mentalSharpness',
  'matchRhythm',
  'morale',
]);

const SKILL_FIELDS = new Set<ProgressionField>([
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
]);

function clampStat(value: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function isProgressionSkill(field: ProgressionField): boolean {
  return SKILL_FIELDS.has(field);
}

export function progressionAttributeCeiling(player: { age: number; potential: number }): number {
  const potential = Number.isFinite(player.potential) ? player.potential : 70;
  const age = Number.isFinite(player.age) ? player.age : 24;
  const agePenalty = age <= 29 ? 0
    : age === 30 ? 2
    : age === 31 ? 4
    : age === 32 ? 7
    : age === 33 ? 10
    : age === 34 ? 14
    : 20;
  return clampStat(potential - agePenalty, 35, 99);
}

function ageDeclineStep(age: number): number {
  if (age < 30) return 0;
  if (age <= 32) return 1;
  if (age <= 34) return 2;
  return 3;
}

export function resolveProgressionValue(
  current: number,
  change: number,
  field: ProgressionField,
  player: { age: number; potential: number },
): number {
  const isStateField = STATE_FIELDS.has(field);
  if (isStateField) return clampStat(current + change, 0, 100);
  if (!SKILL_FIELDS.has(field)) return clampStat(current + change, 1, 99);

  const ceiling = progressionAttributeCeiling(player);
  let next = current + change;
  if (current > ceiling) {
    next = Math.min(next, current - ageDeclineStep(player.age));
  } else if (change > 0) {
    next = Math.min(next, ceiling);
  }
  return clampStat(next, 1, 99);
}
