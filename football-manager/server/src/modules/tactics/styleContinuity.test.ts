import { describe, expect, it } from 'vitest';
import { nextStyleContinuity } from './styleContinuity';

describe('continuidad de estilo', () => {
  it('acumula hasta cuatro turnos sin cambiar de estilo', () => {
    expect(nextStyleContinuity('possession', 'possession', 0)).toEqual({
      continuity: 1,
      confidencePenalty: 0,
      changed: false,
    });
    expect(nextStyleContinuity('possession', 'possession', 4).continuity).toBe(4);
  });

  it('reinicia y penaliza exactamente los puntos de continuidad que faltaban', () => {
    expect(nextStyleContinuity('possession', 'direct', 1)).toEqual({
      continuity: 0,
      confidencePenalty: 3,
      changed: true,
    });
    expect(nextStyleContinuity('possession', 'direct', 4).confidencePenalty).toBe(0);
  });

  it('mantiene neutros los estilos no configurados', () => {
    expect(nextStyleContinuity(null, null, 3)).toEqual({
      continuity: 0,
      confidencePenalty: 0,
      changed: false,
    });
  });
});
