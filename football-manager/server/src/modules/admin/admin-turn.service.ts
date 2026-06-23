import prisma from '../../db/prisma';
import { gameService } from '../game/game.service';
import { masterService } from '../master/master.service';

// TurnSnapshot tracks snapshots per turn for rollbacks.
// Total rollback of matches, finances, injuries requires saving the full DB state,
// but for now we store the core GameState variables.

type GameStateSnapshot = {
  gameStateId: number;
  seasonId: number;
  week: number;
  turn: number;
  inGameDate: string;
  nextTickAt: string | null;
  phase: string;
  isActive: boolean;
  createdBy: number | null;
  reason?: string;
};

function parseSnapshot(payload: string): GameStateSnapshot | null {
  try {
    const parsed = JSON.parse(payload) as Partial<GameStateSnapshot>;
    if (!parsed.gameStateId || !parsed.seasonId || !parsed.inGameDate) return null;
    return parsed as GameStateSnapshot;
  } catch {
    return null;
  }
}

async function createSnapshot(actorManagerId: number | null, reason?: string) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) throw new Error('No active game state');

  const payload: GameStateSnapshot = {
    gameStateId: state.id,
    seasonId: state.seasonId,
    week: state.week,
    turn: state.turn,
    inGameDate: state.inGameDate.toISOString(),
    nextTickAt: state.nextTickAt?.toISOString() ?? null,
    phase: state.phase,
    isActive: state.isActive,
    createdBy: actorManagerId,
    reason,
  };

  return prisma.turnSnapshot.create({
    data: {
      turn: state.turn,
      inGameDate: state.inGameDate,
      snapshotData: JSON.stringify(payload),
    },
  });
}

async function latestSnapshot() {
  const row = await prisma.turnSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  const payload = parseSnapshot(row.snapshotData);
  return payload ? { row, payload } : null;
}

async function logAdminAction(actorManagerId: number | null, target: string, reason: string) {
  return prisma.adminAction.create({
    data: {
      agentFifaId: actorManagerId ?? 0,
      target,
      reason,
    },
  });
}

export const adminTurnService = {
  async getControlState() {
    const [gameState, settings, snapshot] = await Promise.all([
      gameService.getState(),
      masterService.getSettings(),
      latestSnapshot(),
    ]);

    return {
      gameState,
      paused: settings.featureFlags.tick === false,
      nextTickAt: gameState.nextTickAt,
      lastSnapshot: snapshot
        ? {
          id: snapshot.row.id,
          date: snapshot.row.createdAt,
          turn: snapshot.payload.turn,
          week: snapshot.payload.week,
          inGameDate: snapshot.payload.inGameDate,
          reason: snapshot.payload.reason ?? null,
        }
        : null,
      rollbackMode: 'clock-only',
    };
  },

  async setPaused(paused: boolean) {
    const current = await masterService.getSettings();
    const settings = await masterService.setSettings({
      featureFlags: {
        ...current.featureFlags,
        tick: !paused,
      },
    });
    if (paused) {
      await prisma.gameState.updateMany({
        where: { isActive: true },
        data: { nextTickAt: null },
      });
    } else {
      await gameService.updateNextTickTime();
    }
    return {
      paused: settings.featureFlags.tick === false,
      gameState: await gameService.getState(),
    };
  },

  async advance(actorManagerId: number | null, reason?: string, count: number = 1) {
    const current = await prisma.gameState.findFirst({ where: { isActive: true }, select: { isLocked: true } });
    if (current?.isLocked) throw new Error('Ya hay un turno en curso.');
    
    const snapshot = await createSnapshot(actorManagerId, reason ?? 'manual_advance');
    const results = [];
    
    for (let i = 0; i < count; i++) {
      const result = await gameService.processTick();
      results.push(result);
    }
    
    return {
      ok: true,
      action: 'advanced',
      snapshotId: snapshot.id,
      count,
      results,
      gameState: await gameService.getState(),
    };
  },

  async unlock(actorManagerId: number | null, reason?: string) {
    const state = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!state) throw new Error('No active game state');
    const alreadyUnlocked = !state.isLocked;

    if (!alreadyUnlocked) {
      await prisma.gameState.update({ where: { id: state.id }, data: { isLocked: false } });
    }
    const audit = await logAdminAction(
      actorManagerId,
      `gameState:${state.id}`,
      `unlock_isLocked${alreadyUnlocked ? '_already_unlocked' : ''}: ${reason ?? 'admin panel'}`
    );
    
    return {
      ok: true,
      action: 'unlocked',
      alreadyUnlocked,
      adminActionId: audit.id,
      gameState: await gameService.getState(),
    };
  },

  async resimulateMatch(actorManagerId: number | null, matchId: number, reason?: string) {
    if (!Number.isInteger(matchId) || matchId <= 0) throw new Error('ID de partido no válido');
    const result = await gameService.resimulateMatchAudit(matchId);
    const audit = await logAdminAction(
      actorManagerId,
      `match:${matchId}`,
      `resimulate_seed_audit: ${reason ?? 'admin panel'}`
    );

    return {
      ok: true,
      ...result,
      adminActionId: audit.id,
    };
  },

  async rewind(snapshotId?: number, forceClockOnly = false) {
    const current = await prisma.gameState.findFirst({ where: { isActive: true }, select: { isLocked: true } });
    if (current?.isLocked) throw new Error('No se puede retroceder mientras hay un turno en curso.');

    const selected = snapshotId
      ? await prisma.turnSnapshot.findUnique({ where: { id: snapshotId } })
      : (await latestSnapshot())?.row ?? null;
    if (!selected) throw new Error('Snapshot de turno no encontrado');

    const payload = parseSnapshot(selected.snapshotData);
    if (!payload) throw new Error('Snapshot de turno no válido');

    const activeState = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { turn: true, week: true, inGameDate: true },
    });
    const clockMovedForward = activeState
      ? activeState.turn > payload.turn
        || activeState.week > payload.week
        || activeState.inGameDate.getTime() > new Date(payload.inGameDate).getTime()
      : false;
    if (clockMovedForward && !forceClockOnly) {
      throw new Error('Rollback completo no disponible. Reintenta con forceClockOnly=true para restaurar solo el reloj.');
    }

    await prisma.gameState.update({
      where: { id: payload.gameStateId },
      data: {
        seasonId: payload.seasonId,
        week: payload.week,
        turn: payload.turn,
        inGameDate: new Date(payload.inGameDate),
        nextTickAt: payload.nextTickAt ? new Date(payload.nextTickAt) : null,
        phase: payload.phase,
        isActive: payload.isActive,
        isLocked: false,
      },
    });

    return {
      ok: true,
      action: 'rewound',
      snapshotId: selected.id,
      restored: {
        turn: payload.turn,
        week: payload.week,
        inGameDate: payload.inGameDate,
      },
      gameState: await gameService.getState(),
      rollbackMode: 'clock-only',
      warning: 'Se ha restaurado el reloj/estado global. Los efectos del turno no se han revertido de forma completa.',
    };
  },
};
