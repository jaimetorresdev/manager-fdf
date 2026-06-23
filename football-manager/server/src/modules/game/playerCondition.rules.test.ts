import { describe, expect, it } from 'vitest';
import {
  FATIGUE_COLLAPSE_THRESHOLD,
  lowFitnessSkillFor,
  motivationAffinityMatches,
  motivationProtectsMorale,
  nextAccumulatedFatigue,
} from './playerCondition.rules';

describe('estado persistente del jugador', () => {
  it('acumula fatiga sobre 90 y colapsa una sola vez a forma 40', () => {
    expect(nextAccumulatedFatigue(95, 0)).toEqual({
      fitness: 95,
      accumulatedFatigue: 1,
      collapsed: false,
    });
    expect(nextAccumulatedFatigue(96, FATIGUE_COLLAPSE_THRESHOLD - 1)).toEqual({
      fitness: 40,
      accumulatedFatigue: 0,
      collapsed: true,
    });
  });

  it('recupera fatiga acumulada fuera de la zona de sobreentrenamiento', () => {
    expect(nextAccumulatedFatigue(88, 3)).toEqual({
      fitness: 88,
      accumulatedFatigue: 2,
      collapsed: false,
    });
  });

  it('protege la moral permanente o temporal hasta el turno incluido', () => {
    expect(motivationProtectsMorale(true, null, 20)).toBe(true);
    expect(motivationProtectsMorale(false, 20, 20)).toBe(true);
    expect(motivationProtectsMorale(false, 19, 20)).toBe(false);
  });

  it('detecta afinidad permanente con mánager o psicólogo', () => {
    expect(motivationAffinityMatches('grupo-3', 'grupo-3', [])).toBe(true);
    expect(motivationAffinityMatches('grupo-3', 'grupo-1', ['grupo-3'])).toBe(true);
    expect(motivationAffinityMatches('grupo-3', 'grupo-1', ['grupo-2'])).toBe(false);
    expect(motivationAffinityMatches(null, 'grupo-1', ['grupo-2'])).toBe(false);
  });

  it('elige de forma determinista una habilidad que perder con forma inferior a 45', () => {
    expect(lowFitnessSkillFor(44, 7, 10)).toBe(lowFitnessSkillFor(44, 7, 10));
    expect(lowFitnessSkillFor(45, 7, 10)).toBeNull();
  });
});
