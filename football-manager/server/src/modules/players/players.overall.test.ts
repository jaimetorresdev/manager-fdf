import { describe, expect, it, vi } from 'vitest';

vi.mock('../../db/prisma', () => ({ default: {} }));
vi.mock('./playerSoul', () => ({ soulForPlayers: vi.fn() }));

import { playerOverall } from '../../lib/playerOverall';
import { overallFor } from './players.service';

describe('players.service — overall canónico', () => {
  it('usa playerOverall como fallback macro único', () => {
    const player = {
      position: 'MED',
      detailedPosition: null,
      passing: 80,
      tackling: 70,
      shooting: 60,
      organization: 75,
      unmarking: 65,
      finishing: 55,
      dribbling: 85,
      fouls: 40,
      goalkeeping: 10,
    };
    expect(overallFor(player)).toBe(playerOverall(player));
  });
});
