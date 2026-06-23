import { describe, expect, it } from 'vitest';
import { applyCoachConfidence, buildRoster, getExperiencePenalty, isPlayerEligible } from './engineClient';

const player = (id: number, position: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `P${id}`,
  position,
  squadNumber: id,
  isStarter: id <= 11,
  goalkeeping: position === 'POR' ? 85 : 10,
  ...extra,
});

describe('modificadores deportivos canónicos', () => {
  const tactic = (construction: number) => ({
    formation: '4-4-2',
    construction,
    destruction: 50,
  });

  it('aplica la tabla de experiencia por tramos del manual', () => {
    expect([95, 85, 75, 65, 55, 45, 35, 25, 15].map(getExperiencePenalty))
      .toEqual([0, 1, 3, 4, 5, 7, 8, 9, 12]);
  });

  it('consume la diferencia de confianza y acota construcción', () => {
    const adjusted = applyCoachConfidence(tactic(80), tactic(80), 58, 50);
    expect(adjusted.home.construction).toBe(100);
    expect(adjusted.away.construction).toBe(56);
  });
});

describe('buildRoster — elegibilidad competitiva', () => {
  const matchDate = new Date('2026-06-19T00:00:00Z');

  it('excluye sancionados y lesionados activos', () => {
    expect(isPlayerEligible(player(1, 'POR', { suspendedMatches: 1 }), matchDate)).toBe(false);
    expect(isPlayerEligible(player(2, 'DEF', { injuredUntil: new Date('2026-06-20T00:00:00Z') }), matchDate)).toBe(false);
    expect(isPlayerEligible(player(3, 'DEF', { injuredUntil: new Date('2026-06-18T00:00:00Z') }), matchDate)).toBe(true);
    expect(isPlayerEligible(player(4, 'DEF', { injuries: [{ weeksLeft: 2 }] }), matchDate)).toBe(false);
    expect(isPlayerEligible(player(5, 'DEF', { suspensions: [{ matches: 1 }] }), matchDate)).toBe(false);
  });

  it('reemplaza titulares inelegibles y mantiene un XI elegible de 11', () => {
    const players: Array<Record<string, unknown>> = [
      player(1, 'POR'),
      ...Array.from({ length: 13 }, (_, i) => player(i + 2, i < 4 ? 'DEF' : i < 8 ? 'MED' : 'DEL')),
    ];
    players[5] = { ...players[5], suspendedMatches: 2 };
    const roster = buildRoster(players, Array.from({ length: 11 }, (_, i) => i + 1), matchDate);
    expect(roster).toHaveLength(13);
    expect(roster.filter(p => p.isStarter)).toHaveLength(11);
    expect(roster.some(p => p.id === '6')).toBe(false);
    expect(roster.filter(p => p.isStarter && p.position === 'POR')).toHaveLength(1);
  });
});
