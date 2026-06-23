export const MAX_SPECIAL_TRAINING_USES_PER_SEASON = 3;

export function canActivateSpecialTraining(
  currentTurn: number,
  activeUntilTurn: number | null | undefined,
  uses: number,
): boolean {
  if ((activeUntilTurn ?? -1) >= currentTurn) return false;
  return uses < MAX_SPECIAL_TRAINING_USES_PER_SEASON;
}
