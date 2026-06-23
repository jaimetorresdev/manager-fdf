import { describe, expect, it } from 'vitest';
import { compareStandings, sortStandings, withHeadToHeadPoints } from './standings';

const row = (name: string, points: number, goalsFor: number, goalsAgainst: number, clubId: number) => ({
  clubId,
  club: { name },
  points,
  goalsFor,
  goalsAgainst,
});

describe('standings — comparador canónico FDF', () => {
  it('ordena por puntos, diferencia de goles y goles a favor', () => {
    const rows = [
      row('GF', 20, 30, 20, 3),
      row('DG', 20, 25, 10, 2),
      row('PTS', 21, 1, 20, 1),
    ];
    expect(sortStandings(rows).map(r => r.club.name)).toEqual(['PTS', 'DG', 'GF']);
  });

  it('usa GC y sorteo determinista como desempates finales sin mutar la entrada', () => {
    const rows = [
      row('Beta', 20, 25, 11, 3),
      row('Alfa', 20, 24, 10, 2),
      row('Alfa', 20, 25, 10, 1),
    ];
    const sorted = sortStandings(rows);
    expect(sorted[0].clubId).toBe(1);
    expect(rows.map(r => r.clubId)).toEqual([3, 2, 1]);
    expect(compareStandings(sorted[0], sorted[1])).toBeLessThan(0);
  });

  it('prioriza el mini-grupo head-to-head cuando el consumidor lo aporta', () => {
    const rows = [
      { ...row('A', 20, 20, 10, 1), headToHeadPoints: 1 },
      { ...row('B', 20, 18, 10, 2), headToHeadPoints: 4 },
    ];
    expect(sortStandings(rows)[0].clubId).toBe(2);
  });

  it('calcula la mini-liga H2H solo entre clubes empatados a puntos', () => {
    const rows = [
      row('A', 20, 30, 10, 1),
      row('B', 20, 18, 17, 2),
      row('C', 20, 16, 18, 3),
      row('D', 19, 40, 5, 4),
    ];
    const enriched = withHeadToHeadPoints(rows, [
      { homeClubId: 1, awayClubId: 2, homeGoals: 0, awayGoals: 1, status: 'played' },
      { homeClubId: 2, awayClubId: 3, homeGoals: 2, awayGoals: 0, status: 'played' },
      { homeClubId: 3, awayClubId: 1, homeGoals: 1, awayGoals: 1, status: 'played' },
      { homeClubId: 4, awayClubId: 2, homeGoals: 0, awayGoals: 5, status: 'played' },
    ]);

    expect(enriched.map((entry) => entry.headToHeadPoints)).toEqual([1, 6, 1, 0]);
    expect(sortStandings(enriched).map((entry) => entry.clubId)).toEqual([2, 1, 3, 4]);
    expect(rows).not.toHaveProperty('0.headToHeadPoints');
  });
});
