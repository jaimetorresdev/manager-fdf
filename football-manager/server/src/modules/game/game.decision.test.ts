import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma', () => ({ default: {} }));

import { persistedDecision } from './game.service';

describe('persistencia de decisión knockout', () => {
  it('conserva extra_time en vez de degradarlo a regular', () => {
    expect(persistedDecision(
      { decidedBy: 'extra_time' },
      { knockout: true, winnerTeam: 'home', winnerClubId: 1 },
    )).toBe('extra_time');
  });

  it('penaltis prevalece sobre cualquier etiqueta del motor', () => {
    expect(persistedDecision(
      { decidedBy: 'extra_time' },
      { knockout: true, winnerTeam: 'away', winnerClubId: 2, penalties: { home: 4, away: 5 } },
    )).toBe('penalties');
  });
});
