import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findDue: vi.fn(),
  findClub: vi.fn(),
  transaction: vi.fn(),
  simulateGame: vi.fn(),
  friendlyUpdateMany: vi.fn(),
  clubUpdate: vi.fn(),
  playerUpdate: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  default: {
    friendly: { findMany: mocks.findDue },
    club: { findUnique: mocks.findClub },
    $transaction: mocks.transaction,
  },
}));

vi.mock('../simulation/engineClient', () => ({
  buildRoster: (players: Array<Record<string, unknown>>) => players.map(player => ({
    ...player,
    id: String(player.id),
  })),
  simulateGame: mocks.simulateGame,
}));

import { friendliesService } from './friendlies.service';

function squad(start: number) {
  return Array.from({ length: 11 }, (_, index) => ({
    id: start + index,
    name: `P${start + index}`,
    position: index === 0 ? 'POR' : 'DEF',
    isStarter: true,
    fitness: index === 0 ? 1 : 90,
  }));
}

describe('friendliesService.processDue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDue.mockResolvedValue([{
      id: 4,
      clubAId: 1,
      clubBId: 2,
      dateTurn: new Date('2026-07-10T00:00:00Z'),
      incomeA: 650,
      incomeB: 350,
      result: null,
    }]);
    mocks.findClub
      .mockResolvedValueOnce({ id: 1, players: squad(1) })
      .mockResolvedValueOnce({ id: 2, players: squad(101) });
    mocks.simulateGame.mockResolvedValue({ homeGoals: 2, awayGoals: 1 });
    mocks.friendlyUpdateMany.mockResolvedValue({ count: 1 });
    mocks.clubUpdate.mockResolvedValue({});
    mocks.playerUpdate.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      friendly: { updateMany: mocks.friendlyUpdateMany },
      club: { update: mocks.clubUpdate },
      player: { update: mocks.playerUpdate },
    }));
  });

  it('reclama el amistoso una vez, paga ingresos y desgasta solo al XI', async () => {
    const result = await friendliesService.processDue(new Date('2026-07-11T00:00:00Z'));

    expect(result).toEqual({ played: 1, incomePaid: 1000 });
    expect(mocks.friendlyUpdateMany).toHaveBeenCalledWith({
      where: { id: 4, result: null },
      data: { result: '2-1' },
    });
    expect(mocks.clubUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.playerUpdate).toHaveBeenCalledTimes(22);
    expect(mocks.playerUpdate).toHaveBeenCalledWith({ where: { id: 1 }, data: { fitness: 0 } });
  });

  it('si otro tick ya lo reclamó no vuelve a pagar', async () => {
    mocks.friendlyUpdateMany.mockResolvedValue({ count: 0 });
    const result = await friendliesService.processDue(new Date('2026-07-11T00:00:00Z'));

    expect(result).toEqual({ played: 0, incomePaid: 0 });
    expect(mocks.clubUpdate).not.toHaveBeenCalled();
    expect(mocks.playerUpdate).not.toHaveBeenCalled();
  });

  it('convierte ingresos Decimal a number sin filtrar objetos ni mezclar aritmética', async () => {
    mocks.findDue.mockResolvedValue([{
      id: 4,
      clubAId: 1,
      clubBId: 2,
      dateTurn: new Date('2026-07-10T00:00:00Z'),
      incomeA: { toNumber: () => 650.25 },
      incomeB: { toNumber: () => 349.75 },
      result: null,
    }]);

    const result = await friendliesService.processDue(new Date('2026-07-11T00:00:00Z'));

    expect(result).toEqual({ played: 1, incomePaid: 1000 });
    expect(mocks.clubUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { budget: { increment: 650.25 }, cash: { increment: 650.25 } },
    });
    expect(mocks.clubUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { budget: { increment: 349.75 }, cash: { increment: 349.75 } },
    });
  });
});
