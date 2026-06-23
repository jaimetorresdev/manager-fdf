import prisma from '../../db/prisma';
import { realtimeHub } from '../realtime/realtime.hub';
import { isResultSeenForMatch } from './matchEventVisibility';

export interface LeagueMatchEventPayload {
  matchId: number;
  leagueId: number;
  minute: number;
  type: string;
  homeClubId: number;
  awayClubId: number;
  team?: 'home' | 'away';
  description: string;
  score?: { home: number; away: number };
}

const realtimeTimers = new Set<ReturnType<typeof setTimeout>>();

export function broadcastLeagueMatchEvent(event: LeagueMatchEventPayload) {
  return realtimeHub.broadcast(`league:${event.leagueId}`, 'match:event', event);
}

export function clearMatchdayRealtimeTimers() {
  for (const timer of realtimeTimers) clearTimeout(timer);
  realtimeTimers.clear();
}

export function sanitizeHiddenLeagueEvent(event: LeagueMatchEventPayload): LeagueMatchEventPayload {
  return {
    matchId: event.matchId,
    leagueId: event.leagueId,
    minute: 0,
    type: 'event',
    homeClubId: event.homeClubId,
    awayClubId: event.awayClubId,
    description: 'Evento de partido oculto hasta ver el resultado.',
  };
}

async function shouldHideLeagueEvent(event: LeagueMatchEventPayload): Promise<boolean> {
  const [match, managers] = await Promise.all([
    prisma.match.findUnique({
      where: { id: event.matchId },
      select: { id: true, status: true, homeStatsJson: true },
    }),
    prisma.manager.findMany({
      where: { clubId: { in: [event.homeClubId, event.awayClubId] } },
      select: { userId: true },
    }),
  ]);
  if (!match || match.status !== 'played' || managers.length === 0) return false;

  for (const manager of managers) {
    const seen = await isResultSeenForMatch(match.id, match.homeStatsJson, manager.userId);
    if (!seen) return true;
  }
  return false;
}

export function broadcastLeagueMatchTimeline(input: {
  leagueId: number;
  matchId: number;
  homeClubId: number;
  awayClubId: number;
  events: Array<{ minute: number; type: string; team?: 'home' | 'away'; description: string }>;
  intervalMs?: number;
  onGoal?: (payload: LeagueMatchEventPayload) => void | Promise<void>;
}) {
  const ordered = [...input.events].sort((a, b) => a.minute - b.minute);
  let home = 0;
  let away = 0;
  ordered.forEach((event, index) => {
    if (event.type === 'goal' && event.team === 'home') home++;
    if (event.type === 'goal' && event.team === 'away') away++;
    const payload: LeagueMatchEventPayload = {
      matchId: input.matchId,
      leagueId: input.leagueId,
      minute: event.minute,
      type: event.type,
      homeClubId: input.homeClubId,
      awayClubId: input.awayClubId,
      team: event.team,
      description: event.description,
      score: { home, away },
    };
    const timer = setTimeout(() => {
      realtimeTimers.delete(timer);
      void (async () => {
        const hidden = await shouldHideLeagueEvent(payload);
        const outgoing = hidden ? sanitizeHiddenLeagueEvent(payload) : payload;
        broadcastLeagueMatchEvent(outgoing);
        if (!hidden && payload.type === 'goal') void input.onGoal?.(payload);
      })();
    }, index * (input.intervalMs ?? 750));
    realtimeTimers.add(timer);
  });
  return { scheduled: ordered.length, channel: `league:${input.leagueId}` };
}
