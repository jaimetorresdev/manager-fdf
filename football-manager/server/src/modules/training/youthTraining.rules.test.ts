import { describe, expect, it } from 'vitest';
import {
  nextYouthTrainingValue,
  youthCoachSuccessThreshold,
} from './youthTraining.rules';

describe('entrenador juvenil', () => {
  it('aplica los penalizadores del manual por grupo', () => {
    expect(youthCoachSuccessThreshold(10, 'goalkeeping')).toBe(60);
    expect(youthCoachSuccessThreshold(10, 'defense')).toBe(65);
    expect(youthCoachSuccessThreshold(10, 'midfield')).toBe(65);
    expect(youthCoachSuccessThreshold(10, 'attack')).toBe(65);
    expect(youthCoachSuccessThreshold(10, 'experience')).toBe(40);
  });

  it('solo mejora con tirada inferior al umbral y nunca supera potencial', () => {
    expect(nextYouthTrainingValue(69, 70, 49, 50)).toBe(70);
    expect(nextYouthTrainingValue(69, 70, 50, 50)).toBe(69);
    expect(nextYouthTrainingValue(70, 70, 1, 100)).toBe(70);
  });
});
