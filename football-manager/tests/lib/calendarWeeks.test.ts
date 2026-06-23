import { describe, expect, it } from 'vitest';
import { deriveMaxMatchweek } from '../../src/lib/calendarWeeks';

describe('deriveMaxMatchweek', () => {
  it('devuelve 18 para calendario corto', () => {
    const matches = Array.from({ length: 9 }, (_, i) => ({ matchdayNum: i + 1 }));
    expect(deriveMaxMatchweek(matches, 5, 18)).toBe(18);
  });

  it('devuelve 34 para liga estándar', () => {
    const matches = Array.from({ length: 17 }, (_, i) => ({ week: i + 1 }));
    expect(deriveMaxMatchweek(matches, 10, 34)).toBe(34);
  });

  it('devuelve 38 para liga larga y respeta jornada actual', () => {
    const matches = [{ matchdayNum: 38 }, { matchdayNum: 12 }];
    expect(deriveMaxMatchweek(matches, 20, 38)).toBe(38);
    expect(deriveMaxMatchweek(matches, 40, 38)).toBe(40);
  });

  it('funciona con copa (pocas jornadas) sin imponer 38', () => {
    const matches = [{ matchdayNum: 1 }, { matchdayNum: 2 }, { matchdayNum: 3 }];
    expect(deriveMaxMatchweek(matches, 2, 0)).toBe(3);
  });
});
