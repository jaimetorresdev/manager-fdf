import { describe, expect, it } from 'vitest';
import {
  calcPlayerMarketValue,
  calcPlayerSalaryDemand,
  calcPlayerSportingOverall,
  nextSalaryTowardsDemand,
  type PlayerAttrs,
} from './playerValuation';

function player(overall: number, extra: Partial<PlayerAttrs> = {}): PlayerAttrs {
  return {
    passing: overall,
    tackling: overall,
    shooting: overall,
    organization: overall,
    unmarking: overall,
    finishing: overall,
    dribbling: overall,
    fouls: overall,
    goalkeeping: overall,
    reflexes: overall,
    age: 25,
    potential: overall,
    position: 'MED',
    detailedPosition: 'MCO',
    ...extra,
  };
}

describe('playerValuation', () => {
  it('calcula un overall deportivo estable para la formula economica', () => {
    expect(calcPlayerSportingOverall(player(72))).toBe(72);
  });

  it('relaciona salario mensual con valor anualizado en una banda realista', () => {
    const p = player(82, { potential: 86 });
    const salary = calcPlayerSalaryDemand({ ...p, marketValue: 40_000_000 }, { clubReputation: 90 });
    const annualPct = (salary * 12) / 40_000_000;

    expect(salary).toBeGreaterThan(180_000);
    expect(annualPct).toBeGreaterThanOrEqual(0.055);
    expect(annualPct).toBeLessThanOrEqual(0.095);
  });

  it('mantiene suelos razonables para jugadores de rotacion', () => {
    const p = player(62, { potential: 66, age: 28 });
    const salary = calcPlayerSalaryDemand({ ...p, marketValue: 2_500_000 }, { clubReputation: 55 });

    expect(salary).toBeGreaterThanOrEqual(8_000);
    expect(salary).toBeLessThan(20_000);
  });

  it('sube salarios infrapagados de forma gradual sin bajar contratos altos', () => {
    const target = 220_000;

    expect(nextSalaryTowardsDemand(9_600, target)).toBeGreaterThan(9_600);
    expect(nextSalaryTowardsDemand(9_600, target)).toBeLessThan(target);
    expect(nextSalaryTowardsDemand(250_000, target)).toBe(250_000);
  });

  it('mantiene valores de mercado crecientes con el overall', () => {
    expect(calcPlayerMarketValue(player(80))).toBeGreaterThan(calcPlayerMarketValue(player(65)));
  });
});
