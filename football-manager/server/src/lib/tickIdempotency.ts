// AUDIT 2.8 / H-20 — idempotencia reanudable del tick (Carril 1 lib, consumido por game).
import prisma from '../db/prisma';
import { nextTickClaim } from '../modules/game/tick.logic';

type GameStateSlice = {
  id: number;
  turn: number;
  seasonId: number;
  inGameDate: Date;
  phase: string;
};

export type TickBegin =
  | { skipped: true; turn: number }
  | {
      mode: 'fresh' | 'resume';
      runId: number;
      nextTurn: number;
      nextDate: Date;
      prevInGameDate: Date | null;
      skipCalendar: boolean;
    };

/** Inicia o reanuda un `TickRun` para el turno reclamado. */
export async function beginOrResumeTick(state: GameStateSlice): Promise<TickBegin> {
  const running = await prisma.tickRun.findFirst({
    where: { status: 'running' },
    orderBy: { turn: 'asc' },
  });
  const claim = nextTickClaim(state);

  if (running) {
    if (state.turn >= running.turn) {
      return {
        mode: 'resume',
        runId: running.id,
        nextTurn: running.turn,
        nextDate: state.inGameDate,
        prevInGameDate: null,
        skipCalendar: true,
      };
    }
    return {
      mode: 'fresh',
      runId: running.id,
      nextTurn: running.turn,
      nextDate: claim.inGameDate,
      prevInGameDate: claim.prevInGameDate,
      skipCalendar: false,
    };
  }

  const existing = await prisma.tickRun.findUnique({ where: { turn: claim.turn } });
  if (existing?.status === 'completed') {
    return { skipped: true, turn: claim.turn };
  }

  const run = await prisma.tickRun.create({
    data: {
      turn: claim.turn,
      seasonId: state.seasonId,
      inGameDate: claim.inGameDate,
      status: 'running',
    },
  });
  return {
    mode: 'fresh',
    runId: run.id,
    nextTurn: claim.turn,
    nextDate: claim.inGameDate,
    prevInGameDate: claim.prevInGameDate,
    skipCalendar: false,
  };
}

/** Ejecuta un paso aditivo solo si aún no consta en `TickStep`. */
export async function runTickStep(runId: number, step: string, fn: () => Promise<void>) {
  const existing = await prisma.tickStep.findUnique({
    where: { tickRunId_step: { tickRunId: runId, step } },
  });
  if (existing) return;
  await fn();
  try {
    await prisma.tickStep.create({ data: { tickRunId: runId, step, status: 'done' } });
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') return;
    throw err;
  }
}

export async function completeTickRun(runId: number) {
  await prisma.tickRun.update({
    where: { id: runId },
    data: { status: 'completed', finishedAt: new Date() },
  });
}
