import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findRunning: vi.fn(),
  findRun: vi.fn(),
  createRun: vi.fn(),
  findStep: vi.fn(),
  createStep: vi.fn(),
  updateRun: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  default: {
    tickRun: {
      findFirst: mocks.findRunning,
      findUnique: mocks.findRun,
      create: mocks.createRun,
      update: mocks.updateRun,
    },
    tickStep: {
      findUnique: mocks.findStep,
      create: mocks.createStep,
    },
  },
}));

import { beginOrResumeTick, runTickStep } from '../../lib/tickIdempotency';

describe('TickRun/TickStep — reanudación tras crash', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reanuda el mismo turno sin volver a avanzar el calendario', async () => {
    mocks.findRunning.mockResolvedValue({ id: 9, turn: 42, status: 'running' });
    const result = await beginOrResumeTick({
      id: 1,
      turn: 42,
      seasonId: 3,
      inGameDate: new Date('2026-02-04T00:00:00Z'),
      phase: 'regular',
    });
    expect(result).toMatchObject({
      mode: 'resume',
      runId: 9,
      nextTurn: 42,
      skipCalendar: true,
    });
  });

  it('salta pasos ya confirmados y ejecuta únicamente el siguiente tras el crash', async () => {
    const first = vi.fn().mockResolvedValue(undefined);
    const second = vi.fn().mockResolvedValue(undefined);
    mocks.findStep
      .mockResolvedValueOnce({ id: 1, tickRunId: 9, step: 'finances' })
      .mockResolvedValueOnce(null);
    mocks.createStep.mockResolvedValue({ id: 2 });

    await runTickStep(9, 'finances', first);
    await runTickStep(9, 'matches', second);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(mocks.createStep).toHaveBeenCalledWith({
      data: { tickRunId: 9, step: 'matches', status: 'done' },
    });
  });
});
