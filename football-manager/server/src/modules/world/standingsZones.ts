export type MovementZone = 'promotion' | 'relegation' | 'safe';

export interface MovementSlots {
  promotionSlots: number;
  relegationSlots: number;
}

export function competitionMovementSlots(
  tier: number,
  maxTier: number,
  totalRows: number,
): MovementSlots {
  const boundedRows = Math.max(0, Math.trunc(totalRows));
  const promotionSlots = tier > 1 ? Math.min(3, boundedRows) : 0;
  const relegationSlots = tier < maxTier
    ? Math.min(3, Math.max(0, boundedRows - promotionSlots))
    : 0;
  return { promotionSlots, relegationSlots };
}

export function movementZoneForIndex(
  index: number,
  totalRows: number,
  slots: MovementSlots,
): MovementZone {
  if (index < slots.promotionSlots) return 'promotion';
  if (slots.relegationSlots > 0 && index >= totalRows - slots.relegationSlots) {
    return 'relegation';
  }
  return 'safe';
}
