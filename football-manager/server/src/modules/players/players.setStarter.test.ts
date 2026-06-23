import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  player: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  gameState: {
    findFirst: vi.fn(),
  },
}));

vi.mock('../../db/prisma', () => ({ default: prismaMock }));

import { playersService } from './players.service';

describe('players.service — setStarter eligibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.gameState.findFirst.mockResolvedValue({ inGameDate: new Date('2026-01-01') });
    prismaMock.player.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
  });

  it('rejects injured players', async () => {
    prismaMock.player.findFirst.mockResolvedValue({
      id: 1,
      clubId: 10,
      squadNumber: 7,
      injuredUntil: new Date('2026-06-01'),
      suspendedMatches: 0,
      position: 'MED',
      detailedPosition: null,
    });

    await expect(playersService.setStarter(1, 10, true)).rejects.toThrow(/lesionado/i);
  });

  it('rejects suspended players', async () => {
    prismaMock.player.findFirst.mockResolvedValue({
      id: 1,
      clubId: 10,
      squadNumber: 7,
      injuredUntil: null,
      suspendedMatches: 2,
      position: 'MED',
      detailedPosition: null,
    });

    await expect(playersService.setStarter(1, 10, true)).rejects.toThrow(/sancionado/i);
  });

  it('rejects a second goalkeeper starter', async () => {
    prismaMock.player.findFirst.mockResolvedValue({
      id: 2,
      clubId: 10,
      squadNumber: 1,
      injuredUntil: null,
      suspendedMatches: 0,
      position: 'POR',
      detailedPosition: 'POR',
    });
    prismaMock.player.findMany.mockResolvedValue([
      { id: 1, position: 'POR', detailedPosition: 'POR' },
    ]);

    await expect(playersService.setStarter(2, 10, true)).rejects.toThrow(/portero titular/i);
  });

  it('requires a goalkeeper when filling the XI with outfield players', async () => {
    prismaMock.player.findFirst.mockResolvedValue({
      id: 12,
      clubId: 10,
      squadNumber: 9,
      injuredUntil: null,
      suspendedMatches: 0,
      position: 'DEL',
      detailedPosition: 'DC',
    });
    prismaMock.player.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        position: 'MED',
        detailedPosition: 'MC',
      })),
    );

    await expect(playersService.setStarter(12, 10, true)).rejects.toThrow(/portero/i);
  });
});
