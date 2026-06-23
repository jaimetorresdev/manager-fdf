export const NATIONAL_MANAGER_MIN_PRESTIGE = 1;

export function effectiveManagerPrestige(managerPrestige: number): number {
  return Math.max(0, Number(managerPrestige) || 0);
}
