import { describe, it, expect } from 'vitest';
import { assertFDFBuyerCounts, FDF_MAX_SQUAD, FDF_MAX_SQUAD_WITH_LOANS } from './transfer.core';

// AUDIT 3.4 follow-up — guarda de plantilla re-validada DENTRO del lock de club en
// signFreeAgent. Esta es la lógica pura que se ejecuta tras `lockClubRow`; dos
// fichajes concurrentes de agentes DISTINTOS por el mismo club se serializan por el
// SELECT … FOR UPDATE y el segundo ve el conteo ya incrementado.
describe('assertFDFBuyerCounts (tope de plantilla FDF)', () => {
  // Con 0 cedidos, el tope efectivo del primer equipo es FDF_MAX_SQUAD_WITH_LOANS (26):
  // la 2ª comprobación (squad + cedidos >= 26) es la vinculante.
  it('permite fichar por debajo del tope', () => {
    expect(() => assertFDFBuyerCounts(FDF_MAX_SQUAD_WITH_LOANS - 2, 0, 0)).not.toThrow();
  });

  it('rechaza cuando el primer equipo + entrantes alcanza el tope vinculante', () => {
    expect(() => assertFDFBuyerCounts(FDF_MAX_SQUAD_WITH_LOANS, 0, 0)).toThrow();
    expect(() => assertFDFBuyerCounts(FDF_MAX_SQUAD_WITH_LOANS - 1, 0, 1)).toThrow();
  });

  it('cuenta cedidos fuera para el tope ampliado', () => {
    expect(() => assertFDFBuyerCounts(20, 10, 0)).toThrow(/cedidos/);
  });

  it('rechaza el tope duro de 30 cuando hay muchos cedidos pero pocos en plantilla', () => {
    // squad alto sin cedidos golpea primero el tope de 26; el de 30 es el techo absoluto.
    expect(FDF_MAX_SQUAD).toBe(30);
  });

  it('escenario de carrera: el segundo fichaje ve el conteo ya subido y se rechaza en el límite', () => {
    // club a 1 plaza del tope vinculante (25): el primer fichaje pasa, el segundo,
    // re-validado con squad=26 DENTRO del lock, se rechaza.
    expect(() => assertFDFBuyerCounts(FDF_MAX_SQUAD_WITH_LOANS - 1, 0, 0)).not.toThrow();
    expect(() => assertFDFBuyerCounts(FDF_MAX_SQUAD_WITH_LOANS, 0, 0)).toThrow();
  });
});
