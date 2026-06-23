function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function stableUnit(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 0x1_0000_0000;
}

/** QA3: probabilidad anual de retirada para estabilizar edad media global. */
export function retirementProbability(age: number): number {
  if (age < 34) return 0;
  if (age === 34) return 0.10;
  if (age === 35) return 0.24;
  if (age === 36) return 0.42;
  if (age === 37) return 0.68;
  return 1;
}

export function shouldRetirePlayer(playerId: number, age: number, year: number): boolean {
  const probability = retirementProbability(age);
  if (probability <= 0) return false;
  if (probability >= 1) return true;
  const roll = stableUnit(playerId * 1_000_003 + year * 97_409 + age * 257);
  return roll < clamp(probability, 0, 1);
}

export function targetYouthProspects(level: number, residences: number): number {
  const capacity = Math.max(0, residences * 10);
  const target = Math.max(3, Math.min(6, 2 + level));
  return Math.min(capacity, target);
}
