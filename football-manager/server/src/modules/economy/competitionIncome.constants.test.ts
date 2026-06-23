import { describe, it, expect } from 'vitest';
import { gatePerMatch, GATE_MATCHES_PER_MONTH, competitionPrizeTier, COMPETITION_PRIZES } from './competitionIncome.constants';

describe('gatePerMatch (AUDIT H-10 / 1.3 — taquilla de copa por partido)', () => {
  it('divide la taquilla mensual entre los partidos/mes', () => {
    expect(gatePerMatch(1000)).toBe(500);
    expect(GATE_MATCHES_PER_MONTH).toBe(2);
  });

  it('redondea a entero (sin sub-céntimos)', () => {
    expect(gatePerMatch(999)).toBe(500); // 499.5 → 500
    expect(gatePerMatch(1001)).toBe(501); // 500.5 → 501 (round half up)
    expect(Number.isInteger(gatePerMatch(12_345))).toBe(true);
  });

  it('una eliminatoria de un partido nunca cobra 2× la taquilla', () => {
    const monthly = gatePerMatch(2_000_000) * GATE_MATCHES_PER_MONTH;
    // El ingreso de un partido es exactamente la mitad del mensual (±redondeo).
    expect(monthly).toBe(2_000_000);
  });
});

describe('competitionPrizeTier', () => {
  it('clasifica continentales y copa', () => {
    expect(competitionPrizeTier({ name: 'UEFA Champions League', shortName: 'UCL', type: 'continental', isContinental: true })).toBe('ucl');
    expect(competitionPrizeTier({ name: 'Europa League', shortName: 'UEL', type: 'continental', isContinental: true })).toBe('uel');
    expect(competitionPrizeTier({ name: 'Conference', shortName: 'UECL', type: 'continental', isContinental: true })).toBe('uecl');
    expect(competitionPrizeTier({ name: 'Copa del Rey', shortName: 'CdR', type: 'cup', isContinental: false })).toBe('domestic_cup');
    expect(competitionPrizeTier({ name: 'Liga', shortName: 'L1', type: 'league', isContinental: false })).toBe('none');
  });

  it('tablas continentales definen el premio de participación', () => {
    expect(COMPETITION_PRIZES.ucl.participation).toBeGreaterThan(0);
    expect(COMPETITION_PRIZES.uel.participation).toBeGreaterThan(0);
    expect(COMPETITION_PRIZES.uecl.participation).toBeGreaterThan(0);
  });
});
