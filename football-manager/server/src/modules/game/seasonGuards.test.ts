import { describe, expect, it } from 'vitest';
import {
  assertPreviousSeasonComplete,
  rolloverCompetitionMetadata,
} from './season.service';
import {
  buildRedSuspensionCandidates,
  buildYellowSuspensionCandidates,
  shouldCleanCardMarker,
} from './suspensions.logic';

describe('guardas de rollover', () => {
  it('rechaza sembrar una temporada con jornadas pendientes', () => {
    expect(() => assertPreviousSeasonComplete(1)).toThrow(/pendiente/i);
    expect(() => assertPreviousSeasonComplete(0)).not.toThrow();
  });

  it('rechaza sembrar si queda un partido programado aunque la jornada figure cerrada', () => {
    expect(() => assertPreviousSeasonComplete(0, 1)).toThrow(/partido/i);
  });

  it('identifica marcadores de tarjetas de una temporada cerrada', () => {
    expect(shouldCleanCardMarker('cards:yellow:s12:2', 12)).toBe(true);
    expect(shouldCleanCardMarker('cards:red:s12:event:44', 12)).toBe(true);
    expect(shouldCleanCardMarker('cards:yellow:s13:2', 12)).toBe(false);
  });

  it('construye sanciones de tarjetas en lote con razones únicas por temporada', () => {
    expect(buildYellowSuspensionCandidates([
      { playerId: 7, total: 11 },
      { playerId: 8, total: 4 },
    ], 12)).toEqual([
      { playerId: 7, matches: 1, reason: 'cards:yellow:s12:1' },
      { playerId: 7, matches: 1, reason: 'cards:yellow:s12:2' },
    ]);

    expect(buildRedSuspensionCandidates([
      { id: 41, playerId: 7, cardCount: 1, description: 'Roja directa' },
      { id: 42, playerId: 8, cardCount: 2, description: 'Doble amarilla' },
      { id: 43, playerId: 9, cardCount: 1, description: 'Agresión violenta' },
    ], 12)).toEqual([
      { playerId: 7, matches: 2, reason: 'cards:red:s12:event:41' },
      { playerId: 8, matches: 1, reason: 'cards:red:s12:event:42' },
      { playerId: 9, matches: 3, reason: 'cards:red:s12:event:43' },
    ]);
  });

  it('conserva el shard al crear la competición de la temporada siguiente', () => {
    const base = {
      country: 'España',
      tier: 1,
      humanStatus: 'OPEN',
      defaultSimulationTier: 'B',
      activityScore: 12,
      humanManagersCount: 2,
      lastHumanLoginAt: null,
    };
    expect(rolloverCompetitionMetadata({
      ...base,
      processingShard: 'europa:es:1',
    }).processingShard).toBe('europa:es:1');
    expect(rolloverCompetitionMetadata({
      ...base,
      processingShard: null,
    }).processingShard).toBe('españa:1');
  });
});
