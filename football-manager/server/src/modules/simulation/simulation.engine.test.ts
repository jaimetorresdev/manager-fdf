import { describe, it, expect } from 'vitest';
import { simulateMatch } from './simulation.engine';
import type { SquadStats, TacticInput } from './simulation.engine';

const tactic: TacticInput = { formation: '4-4-2', construction: 50, destruction: 50 };
const homeNames = ['A', 'B', 'C'];
const awayNames = ['D', 'E', 'F'];

function squad(overrides: Partial<SquadStats> = {}): SquadStats {
  return {
    overall: 75, defense: 75, attack: 75, midfield: 75,
    fitness: 100, morale: 75, experience: 60,
    ...overrides,
  };
}

describe('Match Simulation Engine', () => {
  it('es determinista para una misma semilla', () => {
    const a = simulateMatch(squad(), squad(), tactic, tactic, homeNames, awayNames, 12345);
    const b = simulateMatch(squad(), squad(), tactic, tactic, homeNames, awayNames, 12345);
    expect(a).toEqual(b);
  });

  it('produce marcadores válidos y posesión que suma 100', () => {
    const res = simulateMatch(squad(), squad(), tactic, tactic, homeNames, awayNames, 999);
    expect(Number.isInteger(res.homeGoals)).toBe(true);
    expect(Number.isInteger(res.awayGoals)).toBe(true);
    expect(res.homeGoals).toBeGreaterThanOrEqual(0);
    expect(res.awayGoals).toBeGreaterThanOrEqual(0);
    expect(res.homeStats.possession + res.awayStats.possession).toBe(100);
  });

  it('el marcador coincide con los eventos de gol', () => {
    const res = simulateMatch(squad(), squad(), tactic, tactic, homeNames, awayNames, 7);
    const homeGoalEvents = res.events.filter(e => e.type === 'goal' && e.team === 'home').length;
    const awayGoalEvents = res.events.filter(e => e.type === 'goal' && e.team === 'away').length;
    expect(homeGoalEvents).toBe(res.homeGoals);
    expect(awayGoalEvents).toBe(res.awayGoals);
  });

  it('un equipo muy superior marca más de media en 200 simulaciones', () => {
    const strong = squad({ overall: 95, defense: 95, attack: 95, midfield: 95 });
    const weak   = squad({ overall: 45, defense: 45, attack: 45, midfield: 45 });
    let strongGoals = 0;
    let weakGoals = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const res = simulateMatch(strong, weak, tactic, tactic, homeNames, awayNames, seed);
      strongGoals += res.homeGoals;
      weakGoals += res.awayGoals;
    }
    expect(strongGoals).toBeGreaterThan(weakGoals);
  });
});
