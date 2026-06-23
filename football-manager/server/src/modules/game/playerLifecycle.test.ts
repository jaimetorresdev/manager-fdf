import { describe, expect, it } from 'vitest';
import {
  retirementProbability,
  shouldRetirePlayer,
  targetYouthProspects,
} from './playerLifecycle';

describe('playerLifecycle', () => {
  it('aumenta la probabilidad de retirada desde 34 y fuerza a 38+', () => {
    expect(retirementProbability(33)).toBe(0);
    expect(retirementProbability(35)).toBeGreaterThan(retirementProbability(34));
    expect(retirementProbability(37)).toBeGreaterThan(retirementProbability(36));
    expect(retirementProbability(38)).toBe(1);
  });

  it('la decision de retirada es determinista por jugador y año', () => {
    expect(shouldRetirePlayer(123, 35, 2030)).toBe(shouldRetirePlayer(123, 35, 2030));
    expect(shouldRetirePlayer(123, 38, 2030)).toBe(true);
    expect(shouldRetirePlayer(123, 30, 2030)).toBe(false);
  });

  it('mantiene un minimo de juveniles sin superar capacidad', () => {
    expect(targetYouthProspects(1, 1)).toBe(3);
    expect(targetYouthProspects(5, 1)).toBe(6);
    expect(targetYouthProspects(5, 0)).toBe(0);
  });
});
