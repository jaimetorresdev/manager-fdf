import { describe, expect, it } from 'vitest';
import { effectiveManagerPrestige, NATIONAL_MANAGER_MIN_PRESTIGE } from './national.logic';

describe('selección nacional — gate de prestigio', () => {
  it('exige prestigio positivo real', () => {
    expect(NATIONAL_MANAGER_MIN_PRESTIGE).toBeGreaterThan(0);
    expect(effectiveManagerPrestige(0)).toBe(0);
    expect(effectiveManagerPrestige(4)).toBe(4);
    expect(effectiveManagerPrestige(9)).toBe(9);
  });
});
