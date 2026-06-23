import { describe, expect, it } from 'vitest';
import { competitionMovementSlots, movementZoneForIndex } from './standingsZones';

describe('zonas de clasificación por nivel', () => {
  it('no marca ascenso en primera ni descenso en la última división', () => {
    expect(competitionMovementSlots(1, 3, 20)).toEqual({
      promotionSlots: 0,
      relegationSlots: 3,
    });
    expect(competitionMovementSlots(3, 3, 20)).toEqual({
      promotionSlots: 3,
      relegationSlots: 0,
    });
  });

  it('marca solo las plazas que existen en divisiones intermedias', () => {
    const slots = competitionMovementSlots(2, 3, 20);
    expect(movementZoneForIndex(0, 20, slots)).toBe('promotion');
    expect(movementZoneForIndex(10, 20, slots)).toBe('safe');
    expect(movementZoneForIndex(19, 20, slots)).toBe('relegation');
  });
});
