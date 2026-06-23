export function friendlySeed(friendlyId: number): number {
  return Math.max(1, Math.imul(Math.trunc(friendlyId), 7919) >>> 0);
}

export function friendlyResultLabel(homeGoals: number, awayGoals: number): string {
  return `${Math.max(0, Math.trunc(homeGoals))}-${Math.max(0, Math.trunc(awayGoals))}`;
}

export function friendlyFitnessAfterMatch(currentFitness: number): number {
  return Math.max(0, Math.min(100, Math.round(currentFitness) - 2));
}

export function isFriendlyWindow(date: Date): boolean {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const preseason = (month === 7 && day >= 5) || (month === 8 && day <= 20);
  const winterBreak = month === 1 && day >= 2 && day <= 15;
  return preseason || winterBreak;
}

export function friendlySeasonBounds(date: Date): { start: Date; end: Date } {
  const year = date.getUTCFullYear();
  const seasonStartYear = date.getUTCMonth() >= 6 ? year : year - 1;
  return {
    start: new Date(Date.UTC(seasonStartYear, 6, 1)),
    end: new Date(Date.UTC(seasonStartYear + 1, 5, 30, 23, 59, 59, 999)),
  };
}
