import { describe, expect, it } from 'vitest';
import { continentalMatchPoints } from './coefficient.service';

describe('continentalMatchPoints', () => {
  it('aplica +4/+2 en Champions y Libertadores', () => {
    expect(continentalMatchPoints('UCL', 'win')).toBe(4);
    expect(continentalMatchPoints('Libertadores', 'draw')).toBe(2);
  });

  it('aplica +2/+1 en competiciones continentales secundarias', () => {
    expect(continentalMatchPoints('UEL', 'win')).toBe(2);
    expect(continentalMatchPoints('Sudamericana', 'draw')).toBe(1);
    expect(continentalMatchPoints('UECL', 'loss')).toBe(0);
  });
});
