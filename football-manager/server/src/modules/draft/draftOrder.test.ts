import { describe, it, expect } from 'vitest';
import { nextDraftPosition } from './draftOrder';

describe('nextDraftPosition (AUDIT H-26 — avance de turno del draft)', () => {
  it('avanza al siguiente pick dentro de la ronda', () => {
    expect(nextDraftPosition(1, 1, 4, 2)).toEqual({ round: 1, pick: 2, status: 'active' });
    expect(nextDraftPosition(1, 3, 4, 2)).toEqual({ round: 1, pick: 4, status: 'active' });
  });

  it('pasa a la siguiente ronda al agotar la actual', () => {
    expect(nextDraftPosition(1, 4, 4, 2)).toEqual({ round: 2, pick: 1, status: 'active' });
  });

  it('marca completado al agotar la última ronda', () => {
    expect(nextDraftPosition(2, 4, 4, 2)).toEqual({ round: 2, pick: 4, status: 'completed' });
  });

  it('un solo round/pick termina inmediatamente', () => {
    expect(nextDraftPosition(1, 1, 1, 1)).toEqual({ round: 1, pick: 1, status: 'completed' });
  });

  it('defensivo ante entradas inválidas', () => {
    expect(nextDraftPosition(1, 1, 0, 0).status).toBe('completed');
  });
});
