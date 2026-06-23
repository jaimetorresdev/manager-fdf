import { describe, expect, it } from 'vitest';
import { aggregateSuspensionMatches, buildYellowSuspensionCandidates } from './suspensions.logic';

describe('aggregateSuspensionMatches', () => {
  it('suma sanciones concurrentes del mismo jugador', () => {
    expect(aggregateSuspensionMatches([
      { playerId: 7, matches: 1 },
      { playerId: 7, matches: 2 },
      { playerId: 9, matches: 1 },
    ])).toEqual(new Map([[7, 3], [9, 1]]));
  });

  it('ignora sanciones agotadas y aplica un tope defensivo', () => {
    expect(aggregateSuspensionMatches([
      { playerId: 7, matches: 0 },
      { playerId: 7, matches: -1 },
      { playerId: 7, matches: 80 },
      { playerId: 7, matches: 80 },
    ]).get(7)).toBe(99);
  });
});

describe('buildYellowSuspensionCandidates', () => {
  it('separa acumulación por competición y aplica umbrales 2/3/5', () => {
    const candidates = buildYellowSuspensionCandidates([
      { playerId: 7, total: 4, competitionId: 10, competitionType: 'cup' },
      { playerId: 7, total: 6, competitionId: 11, competitionType: 'league_phase' },
      { playerId: 7, total: 10, competitionId: 12, competitionType: 'league' },
    ], 3);
    expect(candidates).toHaveLength(6);
    expect(candidates.map((row) => row.reason)).toContain('cards:yellow:s3:c10:2:2');
    expect(candidates.map((row) => row.reason)).toContain('cards:yellow:s3:c11:3:2');
    expect(candidates.map((row) => row.reason)).toContain('cards:yellow:s3:c12:5:2');
  });
});
