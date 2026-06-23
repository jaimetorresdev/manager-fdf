import prisma from '../../db/prisma';

export type SeenStats = Record<string, unknown> & { resultSeenByUserIds?: number[] };

export function parseSeenStats(raw: string | null): SeenStats {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function isResultSeen(raw: string | null, userId: number): boolean {
  const stats = parseSeenStats(raw);
  return Array.isArray(stats.resultSeenByUserIds) && stats.resultSeenByUserIds.includes(userId);
}

export async function isResultSeenForMatch(matchId: number, raw: string | null, userId: number): Promise<boolean> {
  const seen = await prisma.matchSeen.findUnique({
    where: { matchId_userId: { matchId, userId } },
    select: { matchId: true },
  });
  return Boolean(seen) || isResultSeen(raw, userId);
}

export async function markResultSeen(matchId: number, userId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true },
  });
  if (!match) throw new Error('Partido no encontrado');
  await prisma.matchSeen.upsert({
    where: { matchId_userId: { matchId, userId } },
    update: { seenAt: new Date() },
    create: { matchId, userId },
  });
  return { ok: true, matchId, resultSeen: true };
}

/**
 * Política E15 canónica: devuelve true si el resultado del partido debe ocultarse
 * al usuario (es su partido y aún no lo ha marcado como visto).
 * Usar SIEMPRE esta función en todas las rutas que puedan exponer goles/stats.
 */
export function shouldHideResult(
  match: { status: string; homeClubId: number; awayClubId: number; homeStatsJson: string | null },
  clubId: number | null,
  userId: number,
  seenInTable = false,
): boolean {
  if (match.status !== 'played') return false;
  if (!clubId || (match.homeClubId !== clubId && match.awayClubId !== clubId)) return false;
  return !(seenInTable || isResultSeen(match.homeStatsJson, userId));
}

export function hideResult<T extends {
  status: string;
  homeGoals?: number | null;
  awayGoals?: number | null;
  motm?: string | null;
  homeStats?: unknown;
  awayStats?: unknown;
  homeRatings?: unknown;
  awayRatings?: unknown;
  homePlayerStats?: unknown;
  awayPlayerStats?: unknown;
  events?: unknown;
  timeline?: unknown;
  replay?: unknown;
  injuries?: unknown;
  winner?: string | null;
  winnerClubId?: number | null;
  decidedBy?: string | null;
  penaltiesHome?: number | null;
  penaltiesAway?: number | null;
  penalties?: unknown;
}>(payload: T, hidden: boolean): T & { resultHidden: boolean } {
  if (!hidden) return { ...payload, resultHidden: false };
  return {
    ...payload,
    homeGoals: null,
    awayGoals: null,
    motm: null,
    homeStats: null,
    awayStats: null,
    homeRatings: null,
    awayRatings: null,
    homePlayerStats: null,
    awayPlayerStats: null,
    events: [],
    timeline: null,
    replay: null,
    injuries: [],
    winner: null,
    winnerClubId: null,
    decidedBy: null,
    penaltiesHome: null,
    penaltiesAway: null,
    penalties: null,
    resultHidden: true,
  };
}
