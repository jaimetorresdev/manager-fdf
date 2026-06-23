import { describe, it, expect } from 'vitest';
import { youthPotential } from './youthProgression';

describe('youthPotential (AUDIT 5.5 — promoción determinista)', () => {
  it('es determinista: misma entrada → misma salida', () => {
    expect(youthPotential(60)).toBe(youthPotential(60));
    expect(youthPotential(60)).toBe(75);
  });

  it('coincide con la auto-promoción del tick (talent + 15)', () => {
    expect(youthPotential(40)).toBe(55);
    expect(youthPotential(70)).toBe(85);
  });

  it('respeta el tope 99 y el suelo 1', () => {
    expect(youthPotential(90)).toBe(99);
    expect(youthPotential(99)).toBe(99);
    expect(youthPotential(0)).toBe(15);
    expect(youthPotential(-100)).toBe(1);
  });

  it('redondea talentos fraccionarios', () => {
    expect(youthPotential(60.4)).toBe(75);
    expect(youthPotential(60.6)).toBe(76);
  });
});
