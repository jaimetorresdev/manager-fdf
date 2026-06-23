import { describe, expect, it } from 'vitest';
import { sortStandings } from '../game/standings';
import { simulatePhasedMatch } from './simulation.phases.engine';
import type { EnginePlayer } from './engineClient';
import { fromCents, roundMoney, toCents } from '../../lib/roundMoney';

const tactic = {
  formation: '4-4-2',
  construction: 50,
  destruction: 50,
  pressing: 50,
  tempo: 50,
  width: 50,
  mentality: 50,
  homeAdvantage: 4,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function roster(clubId: number, level: number): EnginePlayer[] {
  const positions = ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'MED', 'DEL', 'DEL'];
  return positions.map((position, index) => {
    const skill = clamp(level + (index % 3) - 1);
    return {
      id: `${clubId}-${index}`,
      name: `C${clubId}-P${index}`,
      position,
      passing: skill,
      tackling: skill,
      shooting: skill,
      organization: skill,
      unmarking: skill,
      finishing: skill,
      dribbling: skill,
      fouls: 50,
      goalkeeping: position === 'POR' ? clamp(skill + 8) : 10,
      fitness: 90,
      muscularFitness: 90,
      mentalSharpness: 90,
      matchRhythm: 90,
      morale: 75,
      experience: 60,
      isStarter: true,
    };
  });
}

describe('regresión larga de competición', () => {
  it('simula 10 temporadas sin deriva, duplicados ni tablas incoherentes', () => {
    const clubIds = Array.from({ length: 8 }, (_, index) => index + 1);
    let matches = 0;
    const statKeys = new Set<string>();

    for (let season = 0; season < 10; season++) {
      const table = clubIds.map(clubId => ({
        clubId,
        club: { name: `Club ${clubId}` },
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
      }));

      for (const homeId of clubIds) {
        for (const awayId of clubIds) {
          if (homeId === awayId) continue;
          const home = table.find(row => row.clubId === homeId)!;
          const away = table.find(row => row.clubId === awayId)!;
          const homeRoster = roster(homeId, 58 + homeId * 3 + (season % 3));
          const awayRoster = roster(awayId, 58 + awayId * 3 + (season % 3));

          for (const player of [...homeRoster, ...awayRoster]) {
            for (const attribute of [
              player.passing, player.tackling, player.shooting, player.organization,
              player.unmarking, player.finishing, player.dribbling, player.fouls,
              player.goalkeeping, player.fitness, player.morale, player.experience,
            ]) {
              expect(attribute).toBeGreaterThanOrEqual(0);
              expect(attribute).toBeLessThanOrEqual(100);
            }
          }

          const result = simulatePhasedMatch(
            homeRoster,
            awayRoster,
            tactic,
            tactic,
            season * 10_000 + homeId * 100 + awayId,
          );
          const replay = simulatePhasedMatch(
            homeRoster,
            awayRoster,
            tactic,
            tactic,
            season * 10_000 + homeId * 100 + awayId,
          );
          const matchId = matches++;

          expect({
            homeGoals: replay.homeGoals,
            awayGoals: replay.awayGoals,
            homeRatings: replay.homeRatings,
            awayRatings: replay.awayRatings,
          }).toEqual({
            homeGoals: result.homeGoals,
            awayGoals: result.awayGoals,
            homeRatings: result.homeRatings,
            awayRatings: result.awayRatings,
          });
          expect(result.homeGoals).toBeGreaterThanOrEqual(0);
          expect(result.awayGoals).toBeGreaterThanOrEqual(0);
          expect(result.homeStats.shotsOnTarget).toBeLessThanOrEqual(result.homeStats.shots);
          expect(result.awayStats.shotsOnTarget).toBeLessThanOrEqual(result.awayStats.shots);

          for (const [side, ratings] of [['home', result.homeRatings], ['away', result.awayRatings]] as const) {
            expect(ratings).toHaveLength(11);
            for (const rating of ratings) {
              const key = `${matchId}:${side}:${rating.name}`;
              expect(statKeys.has(key)).toBe(false);
              statKeys.add(key);
              expect(rating.rating).toBeGreaterThanOrEqual(3);
              expect(rating.rating).toBeLessThanOrEqual(10);
            }
          }

          home.goalsFor += result.homeGoals;
          home.goalsAgainst += result.awayGoals;
          away.goalsFor += result.awayGoals;
          away.goalsAgainst += result.homeGoals;
          if (result.homeGoals > result.awayGoals) home.points += 3;
          else if (result.awayGoals > result.homeGoals) away.points += 3;
          else {
            home.points += 1;
            away.points += 1;
          }
        }
      }

      const sorted = sortStandings(table);
      expect(sortStandings(table)).toEqual(sorted);
      expect(sorted).toHaveLength(clubIds.length);
      for (let index = 1; index < sorted.length; index++) {
        expect(sortStandings([sorted[index - 1], sorted[index]])).toEqual([
          sorted[index - 1],
          sorted[index],
        ]);
      }
    }

    expect(matches).toBe(560);
    expect(statKeys.size).toBe(matches * 22);
  }, 20_000);

  it('mantiene 10 temporadas económicas cuantizadas sin deriva', () => {
    const balances = Array.from({ length: 200 }, (_, clubId) =>
      roundMoney(500_000 + clubId * 12_345.67));
    let operations = 0;

    for (let season = 0; season < 10; season++) {
      for (let month = 0; month < 12; month++) {
        for (let clubId = 0; clubId < balances.length; clubId++) {
          const income = roundMoney(90_000 + ((clubId * 97 + season * 31 + month) % 25_000) + 0.1);
          const expenses = roundMoney(82_000 + ((clubId * 53 + season * 17 + month) % 22_000) + 0.2);
          balances[clubId] = roundMoney(balances[clubId] + income - expenses);
          expect(fromCents(toCents(balances[clubId]))).toBe(balances[clubId]);
          operations++;
        }
      }
    }

    expect(operations).toBe(24_000);
    expect(balances.every((balance) => Math.abs(balance) < 500_000_000)).toBe(true);
  });
});
