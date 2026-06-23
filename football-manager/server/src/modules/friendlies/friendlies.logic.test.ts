import { describe, expect, it } from 'vitest';
import {
  friendlyResultLabel,
  friendlySeasonBounds,
  friendlySeed,
  friendlyFitnessAfterMatch,
  isFriendlyWindow,
} from './friendlies.logic';

describe('amistosos — resolución pura', () => {
  it('usa semilla estable distinta por amistoso', () => {
    expect(friendlySeed(10)).toBe(friendlySeed(10));
    expect(friendlySeed(10)).not.toBe(friendlySeed(11));
  });

  it('persiste un marcador compacto compatible con la UI', () => {
    expect(friendlyResultLabel(3, 2)).toBe('3-2');
  });

  it('aplica desgaste acotado sin fitness negativo', () => {
    expect(friendlyFitnessAfterMatch(90)).toBe(88);
    expect(friendlyFitnessAfterMatch(1)).toBe(0);
  });

  it('admite pretemporada y parón invernal, no fechas competitivas ordinarias', () => {
    expect(isFriendlyWindow(new Date('2026-07-05T00:00:00Z'))).toBe(true);
    expect(isFriendlyWindow(new Date('2027-01-10T00:00:00Z'))).toBe(true);
    expect(isFriendlyWindow(new Date('2027-02-01T00:00:00Z'))).toBe(false);
  });

  it('atribuye enero a la temporada iniciada el julio anterior', () => {
    expect(friendlySeasonBounds(new Date('2027-01-10T00:00:00Z')).start.toISOString())
      .toBe('2026-07-01T00:00:00.000Z');
  });
});
