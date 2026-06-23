import { describe, expect, it } from 'vitest';
import {
  competitionMovementSlots,
  leagueDisplayZone,
  movementZoneForIndex,
  standingsLegend,
} from '../../src/lib/standingsZones';

describe('standingsZones', () => {
  it('calcula promoción y descenso canónicos por tier', () => {
    expect(competitionMovementSlots(2, 3, 20)).toEqual({ promotionSlots: 3, relegationSlots: 3 });
    expect(competitionMovementSlots(1, 3, 18)).toEqual({ promotionSlots: 0, relegationSlots: 3 });
    expect(movementZoneForIndex(0, 20, { promotionSlots: 3, relegationSlots: 3 })).toBe('promotion');
    expect(movementZoneForIndex(19, 20, { promotionSlots: 3, relegationSlots: 3 })).toBe('relegation');
  });

  it('asigna zonas continentales en 1ª división (18 equipos)', () => {
    const meta = { tier: 1, maxTier: 3, totalRows: 18, matchdayCount: 34 };
    expect(leagueDisplayZone(1, meta)).toBe('champion');
    expect(leagueDisplayZone(4, meta)).toBe('champion');
    expect(leagueDisplayZone(5, meta)).toBe('europa');
    expect(leagueDisplayZone(6, meta)).toBe('europa');
    expect(leagueDisplayZone(16, meta)).toBe('relegated');
    expect(leagueDisplayZone(18, meta)).toBe('relegated');
    expect(leagueDisplayZone(10, meta)).toBe('normal');
  });

  it('asigna zonas continentales en liga de 34 jornadas / 20 equipos', () => {
    const meta = { tier: 1, maxTier: 2, totalRows: 20, matchdayCount: 34 };
    expect(leagueDisplayZone(4, meta)).toBe('champion');
    expect(leagueDisplayZone(6, meta)).toBe('europa');
    expect(leagueDisplayZone(18, meta)).toBe('relegated');
    const legend = standingsLegend(meta);
    expect(legend.some((l) => l.key === 'champion')).toBe(true);
    expect(legend.some((l) => l.key === 'relegated')).toBe(true);
  });

  it('usa promoción en 2ª división y fase suiza en 36 equipos', () => {
    const second = { tier: 2, maxTier: 3, totalRows: 22, matchdayCount: 42 };
    expect(leagueDisplayZone(1, second)).toBe('champion');
    expect(leagueDisplayZone(3, second)).toBe('champion');
    expect(leagueDisplayZone(4, second)).toBe('normal');
    expect(leagueDisplayZone(20, second)).toBe('relegated');

    const swiss = { tier: 1, maxTier: 1, totalRows: 36, matchdayCount: 8 };
    expect(leagueDisplayZone(8, swiss)).toBe('champion');
    expect(leagueDisplayZone(20, swiss)).toBe('europa');
    expect(leagueDisplayZone(30, swiss)).toBe('normal');
    expect(standingsLegend(swiss).map((l) => l.key)).toEqual(['champion', 'europa']);
  });
});
