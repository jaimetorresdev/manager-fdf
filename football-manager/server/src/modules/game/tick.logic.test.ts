import { describe, it, expect } from 'vitest';
import {
  makeRng, trainingChance, playerImproves, gateIncome, commercialIncome,
  monthlySalaries, monthlyNet, prestigeAfterRedMonth, crossedIntoNewMonth,
  COACH_CATEGORY_STATS, TRAINING_TYPE_STATS, eliteLiquidityMaintenance,
  selectStatToImprove, sponsorBreakPenalty, nextTickClaim, applyTrainingTurn,
  moraleDeltaForResult, shouldDecayMorale,
} from './tick.logic';

describe('tick.logic — RNG', () => {
  it('es determinista para una misma semilla', () => {
    const a = makeRng(42); const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('semillas distintas dan secuencias distintas', () => {
    expect(makeRng(1)()).not.toBe(makeRng(2)());
  });
  it('produce valores en [0,1)', () => {
    const r = makeRng(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('tick.logic — moral viva', () => {
  it('pausa el decay en mayo/junio y aplica los bonus del manual', () => {
    expect(shouldDecayMorale(new Date('2026-04-30T00:00:00Z'))).toBe(true);
    expect(shouldDecayMorale(new Date('2026-05-01T00:00:00Z'))).toBe(false);
    expect(shouldDecayMorale(new Date('2026-06-30T00:00:00Z'))).toBe(false);
    expect(moraleDeltaForResult('win')).toBe(9);
    expect(moraleDeltaForResult('draw')).toBe(5);
    expect(moraleDeltaForResult('loss')).toBe(4);
  });
});

describe('tick.logic — entrenamiento', () => {
  it('la probabilidad está acotada 2–45%', () => {
    expect(trainingChance(0, 40, 0)).toBeGreaterThanOrEqual(2);
    expect(trainingChance(99, 16, 99)).toBeLessThanOrEqual(45);
  });
  it('mejor entrenador ⇒ más probabilidad', () => {
    expect(trainingChance(5, 25, 60)).toBeGreaterThan(trainingChance(1, 25, 60));
  });
  it('más joven ⇒ más probabilidad', () => {
    expect(trainingChance(3, 18, 60)).toBeGreaterThan(trainingChance(3, 33, 60));
  });
  it('playerImproves respeta el umbral', () => {
    // chance(3,20,80) = 9 + 6 + 9.6 = 24.6% → rand 0.10*100=10 < 24.6 ⇒ true; 0.40 ⇒ false
    expect(playerImproves(3, 20, 80, 0.10)).toBe(true);
    expect(playerImproves(3, 20, 80, 0.40)).toBe(false);
  });
  it('cada categoría entrena atributos FDF válidos', () => {
    expect(COACH_CATEGORY_STATS.GK).toContain('goalkeeping');
    expect(COACH_CATEGORY_STATS.GK).toContain('reflexes');
    expect(TRAINING_TYPE_STATS.portero).toEqual(expect.arrayContaining(['goalkeeping', 'reflexes']));
    expect(COACH_CATEGORY_STATS.ATT).toContain('finishing');
  });
  it('un entrenamiento de portero puede mejorar salidas o reflejos', () => {
    expect(selectStatToImprove('portero', 'GK', 0)).toBe('goalkeeping');
    expect(selectStatToImprove('portero', 'GK', 0.99)).toBe('reflexes');
  });
  it('faltas/balón parado es entrenable por táctica y entrenador TAC', () => {
    expect(TRAINING_TYPE_STATS.táctica).toContain('fouls');
    expect(COACH_CATEGORY_STATS.TAC).toContain('fouls');
  });
  it('la categoría del entrenador restringe el atributo mejorado', () => {
    const result = applyTrainingTurn(
      { id: 1, age: 18, talent: 99, fitness: 90, isInjured: false },
      'táctica',
      10,
      0,
      0.99,
      0.5,
      'TAC',
    );
    expect(result.statImproved).toBe('fouls');
  });
  it('un lesionado no gana fitness en sesión normal; rehabilitación sí recupera', () => {
    const normal = applyTrainingTurn(
      { id: 1, age: 20, talent: 80, fitness: 60, isInjured: true },
      'medio', 5, 0, 0, 0.5, 'MID',
    );
    const rehab = applyTrainingTurn(
      { id: 1, age: 20, talent: 80, fitness: 60, isInjured: true },
      'rehabilitación', 5, 0, 0, 0.5, 'MID',
    );
    expect(normal.newFitness).toBe(60);
    expect(normal.improved).toBe(false);
    expect(rehab.newFitness).toBeGreaterThan(60);
  });
});

describe('tick.logic — finanzas', () => {
  const club = { stadiumCapacity: 20000, fans: 50000, socialMass: 100000, reputation: 50, countryLevel: 2, ticketPriceLevel: 'medium' };

  it('taquilla y comercial son positivos y escalan con la reputación', () => {
    expect(gateIncome(club)).toBeGreaterThan(0);
    expect(commercialIncome({ ...club, reputation: 90 })).toBeGreaterThan(commercialIncome({ ...club, reputation: 10 }));
  });
  it('mayor aforo ⇒ más taquilla', () => {
    expect(gateIncome({ ...club, stadiumCapacity: 80000 })).toBeGreaterThan(gateIncome(club));
  });
  it('neto = ingresos − salarios', () => {
    const players = [3000, 3000, 4000];
    const coaches = [2000];
    const expected = gateIncome(club) + commercialIncome(club) - monthlySalaries(players, coaches);
    expect(monthlyNet(club, players, coaches)).toBe(expected);
  });
  it('salarios desorbitados ⇒ neto negativo', () => {
    const players = Array(25).fill(900000);
    expect(monthlyNet(club, players, [])).toBeLessThan(0);
  });
  it('mantenimiento de élite solo drena caja excedente y escala con reputación', () => {
    expect(eliteLiquidityMaintenance({ budget: 180_000_000, reputation: 90 })).toBe(0);
    expect(eliteLiquidityMaintenance({ budget: 550_000_000, reputation: 95 })).toBeGreaterThan(
      eliteLiquidityMaintenance({ budget: 550_000_000, reputation: 76 }),
    );
  });
  it('mantenimiento de élite está acotado para no romper el tick', () => {
    expect(eliteLiquidityMaintenance({ budget: 5_000_000_000, reputation: 100 })).toBe(25_000_000);
  });
  it('romper un patrocinio nunca cuesta más que el ingreso restante', () => {
    const yearlyIncome = 1_200_000;
    const remainingIncome = yearlyIncome / 12 * 36;
    const penalty = sponsorBreakPenalty(yearlyIncome, 36, 3);
    expect(penalty).toBeGreaterThanOrEqual(0);
    expect(penalty).toBeLessThanOrEqual(remainingIncome);
  });
});

describe('tick.logic — prestigio y calendario', () => {
  it('caja roja reduce el prestigio a la mitad (floor, sin bajar de 0)', () => {
    expect(prestigeAfterRedMonth(100)).toBe(50);
    expect(prestigeAfterRedMonth(1)).toBe(0);
    expect(prestigeAfterRedMonth(0)).toBe(0);
  });
  it('detecta el cambio de mes in-game', () => {
    expect(crossedIntoNewMonth(new Date('2026-01-30T00:00:00Z'), new Date('2026-02-02T00:00:00Z'))).toBe(true);
    expect(crossedIntoNewMonth(new Date('2026-02-10T00:00:00Z'), new Date('2026-02-13T00:00:00Z'))).toBe(false);
    expect(crossedIntoNewMonth(new Date('2026-12-30T00:00:00Z'), new Date('2027-01-02T00:00:00Z'))).toBe(true);
  });
  it('el claim atómico adelanta fecha y turno juntos y un reintento no reclama el mismo turno', () => {
    const first = nextTickClaim({ turn: 7, inGameDate: new Date('2026-06-19T00:00:00Z') });
    expect(first).toEqual({
      turn: 8,
      inGameDate: new Date('2026-06-21T00:00:00Z'),
      prevInGameDate: new Date('2026-06-19T00:00:00Z'),
    });
    const retry = nextTickClaim(first);
    expect(retry.turn).toBe(9);
    expect(retry.turn).not.toBe(first.turn);
  });
});
