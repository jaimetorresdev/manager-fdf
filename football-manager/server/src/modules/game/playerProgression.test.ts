import { describe, expect, it } from 'vitest';
import {
  progressionAttributeCeiling,
  resolveProgressionValue,
} from './playerProgression.rules';

describe('playerProgression QA5 ceiling', () => {
  it('limita las subidas al potencial del jugador', () => {
    const player = { age: 24, potential: 72 };
    expect(resolveProgressionValue(72, 1, 'passing', player)).toBe(72);
    expect(resolveProgressionValue(71, 2, 'tackling', player)).toBe(72);
  });

  it('reduce el techo con la edad', () => {
    expect(progressionAttributeCeiling({ age: 24, potential: 82 })).toBe(82);
    expect(progressionAttributeCeiling({ age: 34, potential: 82 })).toBe(68);
    expect(progressionAttributeCeiling({ age: 36, potential: 82 })).toBe(62);
  });

  it('los veteranos por encima de techo declinan aunque el delta sea positivo', () => {
    const player = { age: 35, potential: 82 };
    expect(resolveProgressionValue(90, 1, 'dribbling', player)).toBe(87);
  });

  it('mantiene estados de forma con límites 0-100', () => {
    const player = { age: 35, potential: 82 };
    expect(resolveProgressionValue(99, 5, 'fitness', player)).toBe(100);
    expect(resolveProgressionValue(1, -5, 'morale', player)).toBe(0);
  });

  it('aplica el mismo techo canónico a reflexes', () => {
    const player = { age: 34, potential: 82 };
    expect(resolveProgressionValue(67, 1, 'reflexes', player)).toBe(68);
    expect(resolveProgressionValue(68, 1, 'reflexes', player)).toBe(68);
  });
});
