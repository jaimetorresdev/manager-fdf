import { describe, expect, it } from 'vitest';
import { officialMatchSeed, previewMatchSeed, persistedMatchPreview } from './previewSeed';

describe('semillas de previa', () => {
  it('una previa no jugada no comparte la semilla oficial y puede variar por petición', () => {
    const official = officialMatchSeed(42);
    const first = previewMatchSeed(42, 1);
    const second = previewMatchSeed(42, 2);
    expect(first).not.toBe(official);
    expect(second).not.toBe(official);
    expect(first).not.toBe(second);
  });

  it('un partido jugado reconstruye el resultado persistido sin resimular', () => {
    expect(persistedMatchPreview({
      homeGoals: 2,
      awayGoals: 1,
      motm: 'Nueve',
      homeStatsJson: JSON.stringify({ possession: 55, timeline: [{ minute: 3 }] }),
      awayStatsJson: JSON.stringify({ possession: 45 }),
    })).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      motm: 'Nueve',
      homeStats: { possession: 55 },
      awayStats: { possession: 45 },
      timeline: [{ minute: 3 }],
    });
  });
});
