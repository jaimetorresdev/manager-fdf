import { describe, expect, it } from 'vitest';
import { MIN_RATING_MATCHES, seasonStatsWhere } from './leaderboards.logic';

describe('leaderboards — alcance competitivo', () => {
  it('filtra las estadísticas por temporada activa', () => {
    expect(seasonStatsWhere(12)).toEqual({
      match: { matchday: { competition: { seasonId: 12 } } },
    });
  });

  it('exige el mismo mínimo robusto que el MVP', () => {
    expect(MIN_RATING_MATCHES).toBe(10);
  });
});
