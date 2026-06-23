import { describe, expect, it } from 'vitest';
import {
  MAX_SPECIAL_TRAINING_USES_PER_SEASON,
  canActivateSpecialTraining,
} from './training.controls';
import { cappedTrainingValue } from './training.service';

describe('controles especiales de entrenamiento', () => {
  it('impide repetir mientras el efecto está activo', () => {
    expect(canActivateSpecialTraining(10, 12, 0)).toBe(false);
  });

  it('impone un máximo por temporada', () => {
    expect(canActivateSpecialTraining(10, 9, MAX_SPECIAL_TRAINING_USES_PER_SEASON)).toBe(false);
    expect(canActivateSpecialTraining(10, 9, MAX_SPECIAL_TRAINING_USES_PER_SEASON - 1)).toBe(true);
  });
});

describe('techo canónico de entrenamiento', () => {
  it('respeta potencial y penalización por edad', () => {
    const veteran = { age: 34, potential: 82 };
    expect(cappedTrainingValue(67, veteran, 'passing')).toBe(68);
    expect(cappedTrainingValue(68, veteran, 'passing')).toBe(68);
  });

  it('mantiene los campos de estado en escala 0..100', () => {
    expect(cappedTrainingValue(99, { age: 40, potential: 40 }, 'fitness')).toBe(100);
  });
});
