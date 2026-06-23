import { describe, it, expect } from 'vitest';
import { simulatePhasedMatch, PLAYS_PER_TEAM_PER_HALF } from './simulation.phases.engine';
import { simulateGame, type EnginePlayer } from './engineClient';

const tactic = { formation: '4-4-2', construction: 55, destruction: 50, homeAdvantage: 4 };

function player(name: string, pos: string, skill: number, starter = true): EnginePlayer {
  return {
    name,
    position: pos,
    passing: skill,
    tackling: skill,
    shooting: skill,
    organization: skill,
    unmarking: skill,
    finishing: skill,
    dribbling: skill,
    fouls: skill,
    goalkeeping: pos === 'POR' ? skill + 5 : 40,
    fitness: 88,
    muscularFitness: 88,
    mentalSharpness: 88,
    matchRhythm: 88,
    morale: 72,
    experience: 55,
    isStarter: starter,
  };
}

function roster(skill: number, prefix: string): EnginePlayer[] {
  return [
    player(`${prefix}-GK`, 'POR', skill),
    ...Array.from({ length: 4 }, (_, i) => player(`${prefix}-D${i}`, 'DEF', skill)),
    ...Array.from({ length: 4 }, (_, i) => player(`${prefix}-M${i}`, 'MED', skill)),
    ...Array.from({ length: 2 }, (_, i) => player(`${prefix}-F${i}`, 'DEL', skill + 3)),
  ];
}

describe('simulation.phases.engine', () => {
  it('genera 60 jugadas de replay, espejo del presupuesto base Python', () => {
    const res = simulatePhasedMatch(roster(70, 'H'), roster(65, 'A'), tactic, tactic, 42);
    expect(res.replay.length).toBe(PLAYS_PER_TEAM_PER_HALF * 2 * 2);
  });

  it('es determinista con la misma semilla', () => {
    const a = simulatePhasedMatch(roster(72, 'H'), roster(68, 'A'), tactic, tactic, 999);
    const b = simulatePhasedMatch(roster(72, 'H'), roster(68, 'A'), tactic, tactic, 999);
    expect(a.homeGoals).toBe(b.homeGoals);
    expect(a.awayGoals).toBe(b.awayGoals);
    expect(a.replay[0]?.outcome).toBe(b.replay[0]?.outcome);
  });

  it('cada jugada de campo tiene 5 fases', () => {
    const res = simulatePhasedMatch(roster(70, 'H'), roster(70, 'A'), tactic, tactic, 7);
    const field = res.replay.filter((s) => s.kind === 'field');
    expect(field.length).toBeGreaterThan(0);
    expect(field.every((s) => s.phases.length <= 5)).toBe(true);
  });

  it('el marcador coincide con eventos de gol', () => {
    const res = simulatePhasedMatch(roster(80, 'H'), roster(55, 'A'), tactic, tactic, 123);
    const homeGoals = res.events.filter((e) => e.type === 'goal' && e.team === 'home').length;
    const awayGoals = res.events.filter((e) => e.type === 'goal' && e.team === 'away').length;
    expect(homeGoals).toBe(res.homeGoals);
    expect(awayGoals).toBe(res.awayGoals);
  });

  it('equipo fuerte marca más de media en 150 partidos', () => {
    let strongTotal = 0;
    let weakTotal = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const res = simulatePhasedMatch(roster(88, 'H'), roster(52, 'A'), tactic, tactic, seed);
      strongTotal += res.homeGoals;
      weakTotal += res.awayGoals;
    }
    expect(strongTotal).toBeGreaterThan(weakTotal);
  });

  it('incluye notas 0-10 por jugador', () => {
    const res = simulatePhasedMatch(roster(70, 'H'), roster(70, 'A'), tactic, tactic, 1);
    expect(res.homeRatings.length).toBeGreaterThanOrEqual(11);
    expect(res.homeRatings.every((r) => r.rating >= 3 && r.rating <= 10)).toBe(true);
  });

  it('las tarjetas incluyen playerId aunque existan homónimos', () => {
    const home = roster(70, 'H').map((p, index) => ({ ...p, id: index + 1 }));
    const away = roster(70, 'A').map((p, index) => ({
      ...p,
      id: index + 101,
      name: index < 2 ? 'García' : p.name,
    }));
    const cards = [];
    for (let seed = 1; seed <= 30 && cards.length === 0; seed++) {
      cards.push(...simulatePhasedMatch(home, away, tactic, tactic, seed).events
        .filter(event => event.type === 'yellow' || event.type === 'red'));
    }
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(event => Number.isSafeInteger(event.playerId))).toBe(true);
  });

  it('el fallback knockout resuelve empates en prórroga', async () => {
    let res;
    for (let seed = 1; seed <= 100 && !res; seed++) {
      const candidate = await simulateGame(roster(50, 'H'), roster(50, 'A'), tactic, tactic, seed, { knockout: true });
      if (candidate.decidedBy === 'extra_time') res = candidate;
    }
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.knockout).toBe(true);
    expect(res.decidedBy).toBe('extra_time');
    expect(res.winner).toMatch(/home|away/);
    expect(res.homeGoals).not.toBe(res.awayGoals);
  });

  it('el fallback knockout resuelve empates persistentes por penaltis', async () => {
    let res;
    for (let seed = 1; seed <= 100 && !res; seed++) {
      const candidate = await simulateGame(roster(50, 'H'), roster(50, 'A'), tactic, tactic, seed, { knockout: true });
      if (candidate.decidedBy === 'penalties') res = candidate;
    }
    expect(res).toBeDefined();
    if (!res) return;
    expect(res.knockout).toBe(true);
    expect(res.decidedBy).toBe('penalties');
    expect(res.winner).toMatch(/home|away/);
    expect(res.homeGoals).toBe(res.awayGoals);
    expect(res.homePenalties).not.toBe(res.awayPenalties);
  });
});
