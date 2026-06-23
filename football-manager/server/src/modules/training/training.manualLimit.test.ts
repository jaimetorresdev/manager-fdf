import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, txMock, lockClubRowMock } = vi.hoisted(() => {
  const tx = {
    trainingSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  return {
    txMock: tx,
    lockClubRowMock: vi.fn(),
    prismaMock: {
      coach: { findFirst: vi.fn() },
      player: { findMany: vi.fn(), update: vi.fn() },
      gameState: { findFirst: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: any) => unknown) => callback(tx)),
    },
  };
});

vi.mock('../../db/prisma', () => ({ default: prismaMock }));
vi.mock('../market/transfer.core', () => ({ lockClubRow: lockClubRowMock }));
vi.mock('../manager/skillEffects', () => ({ effectsForClub: vi.fn() }));

import { trainingService } from './training.service';

describe('entrenamiento manual — límite por turno', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.coach.findFirst.mockResolvedValue({
      id: 77,
      clubId: 5,
      category: 'MID',
      level: 5,
    });
    prismaMock.player.findMany.mockResolvedValue([{
      id: 9,
      clubId: 5,
      name: 'Centrocampista',
      squadNumber: 8,
      age: 24,
      talent: 70,
      potential: 80,
      fitness: 85,
      passing: 72,
      tackling: 55,
      shooting: 62,
      organization: 75,
      unmarking: 65,
      finishing: 58,
      dribbling: 70,
      goalkeeping: 8,
      injuries: [],
    }]);
    prismaMock.gameState.findFirst.mockResolvedValue({ turn: 14 });
  });

  it('rechaza una segunda sesión del mismo entrenador en el mismo turno', async () => {
    txMock.trainingSession.findFirst.mockResolvedValue({ id: 100 });

    await expect(trainingService.runTrainingSession(5, {
      coachId: 77,
      trainingType: 'medio',
      playerIds: [9],
    })).rejects.toThrow(/ya hizo una sesión manual/i);

    expect(lockClubRowMock).toHaveBeenCalledWith(txMock, 5);
    expect(txMock.trainingSession.findFirst).toHaveBeenCalledWith({
      where: { turnId: 14, clubId: 5, type: 'manual:77' },
      select: { id: true },
    });
    expect(txMock.trainingSession.create).not.toHaveBeenCalled();
    expect(prismaMock.player.update).not.toHaveBeenCalled();
  });
});
