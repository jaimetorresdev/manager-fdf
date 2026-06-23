import prisma from '../../db/prisma';
import { isResultSeenForMatch } from '../matches/matchEventVisibility';
import { realtimeHub } from '../realtime/realtime.hub';

type GoalCandidate = {
  goalKey: string;
  matchId: number;
  minute: number;
  team: 'home' | 'away';
  text: string;
  scorer: { playerId: number | null; name: string | null };
  lane: string | null;
  chain: unknown[];
  duel: unknown | null;
  replay: unknown[];
  match: {
    homeClub: { id: number; shortName: string; badge: string | null };
    awayClub: { id: number; shortName: string; badge: string | null };
    homeGoals: number | null;
    awayGoals: number | null;
    competition: { id: number; name: string; shortName: string } | null;
  };
  score: number;
  votes: number;
  votedByMe: boolean;
};

function parseJson(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function timelineFromStats(raw: string | null): any[] {
  const stats = parseJson(raw);
  return Array.isArray(stats.timeline) ? stats.timeline : Array.isArray(stats.replay) ? stats.replay : [];
}

function currentWeekKey(state: { seasonId: number | null; seasonWeek: number | null } | null): string {
  return `s${state?.seasonId ?? 0}-w${state?.seasonWeek ?? 0}`;
}

async function visibleForSocial(match: {
  id: number;
  homeStatsJson: string | null;
  homeClub: { manager: { userId: number } | null };
  awayClub: { manager: { userId: number } | null };
}) {
  const userIds = [match.homeClub.manager?.userId, match.awayClub.manager?.userId]
    .filter((id): id is number => Number.isSafeInteger(id));
  for (const userId of userIds) {
    if (!(await isResultSeenForMatch(match.id, match.homeStatsJson, userId))) return false;
  }
  return true;
}

export const goalOfWeekService = {
  async getGoalOfWeek(input: { userId: number; managerId: number; weekKey?: string }) {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { seasonId: true, seasonWeek: true },
    });
    const weekKey = input.weekKey ?? currentWeekKey(state);

    const matches = await prisma.match.findMany({
      where: {
        status: 'played',
        homeStatsJson: { not: null },
        matchday: { competition: { seasonId: state?.seasonId ?? undefined } },
      },
      orderBy: { playedAt: 'desc' },
      take: 80,
      select: {
        id: true,
        homeClubId: true,
        awayClubId: true,
        homeGoals: true,
        awayGoals: true,
        homeStatsJson: true,
        playedAt: true,
        homeClub: { select: { id: true, shortName: true, badge: true, manager: { select: { userId: true } } } },
        awayClub: { select: { id: true, shortName: true, badge: true, manager: { select: { userId: true } } } },
        matchday: { select: { number: true, competition: { select: { id: true, name: true, shortName: true } } } },
      },
    });

    const candidates: GoalCandidate[] = [];
    for (const match of matches) {
      if (!(await visibleForSocial(match))) continue;
      const timeline = timelineFromStats(match.homeStatsJson);
      const goals = timeline
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.phase === 'gol');
      for (const { entry, index } of goals) {
        const minute = Number(entry.minute ?? 0);
        const playerId = Number.isSafeInteger(Number(entry.playerId)) ? Number(entry.playerId) : null;
        const chain = Array.isArray(entry.chain) ? entry.chain : [];
        const replay = timeline.filter((step) => Math.abs(Number(step?.minute ?? -999) - minute) <= 1).slice(0, 8);
        const key = `m${match.id}:${minute}:${playerId ?? entry.text ?? index}:${index}`;
        candidates.push({
          goalKey: key,
          matchId: match.id,
          minute,
          team: entry.team === 'away' ? 'away' : 'home',
          text: String(entry.text ?? 'Gol de la semana'),
          scorer: { playerId, name: entry.duel?.att?.name ?? null },
          lane: typeof entry.lane === 'string' ? entry.lane : null,
          chain,
          duel: entry.duel ?? null,
          replay,
          match: {
            homeClub: { id: match.homeClub.id, shortName: match.homeClub.shortName, badge: match.homeClub.badge },
            awayClub: { id: match.awayClub.id, shortName: match.awayClub.shortName, badge: match.awayClub.badge },
            homeGoals: match.homeGoals,
            awayGoals: match.awayGoals,
            competition: match.matchday?.competition ?? null,
          },
          score: chain.length * 20 + minute / 3 + (entry.lane ? 5 : 0),
          votes: 0,
          votedByMe: false,
        });
      }
    }

    candidates.sort((a, b) => b.score - a.score || a.minute - b.minute || a.goalKey.localeCompare(b.goalKey));
    const top = candidates.slice(0, 5);
    const keys = new Set(top.map((goal) => goal.goalKey));
    const votes = await prisma.goalOfWeekVote.findMany({ where: { weekKey } });
    const counts = new Map<string, number>();
    for (const vote of votes) counts.set(vote.goalKey, (counts.get(vote.goalKey) ?? 0) + 1);
    const myVote = votes.find((vote) => vote.managerId === input.managerId)?.goalKey ?? null;

    return {
      weekKey,
      candidates: top.map((goal) => ({
        ...goal,
        votes: counts.get(goal.goalKey) ?? 0,
        votedByMe: myVote === goal.goalKey,
      })),
      myVote: myVote && keys.has(myVote) ? myVote : null,
      votingOpen: top.length > 0,
    };
  },

  async voteGoalOfWeek(input: { userId: number; managerId: number; goalKey: string; weekKey?: string }) {
    const current = await this.getGoalOfWeek({
      userId: input.userId,
      managerId: input.managerId,
    });
    if (!current.candidates.some((goal) => goal.goalKey === input.goalKey)) {
      throw new Error('Ese gol no está entre los candidatos de la semana.');
    }
    const vote = await prisma.goalOfWeekVote.upsert({
      where: { weekKey_managerId: { weekKey: current.weekKey, managerId: input.managerId } },
      update: { goalKey: input.goalKey },
      create: { weekKey: current.weekKey, managerId: input.managerId, goalKey: input.goalKey },
    });
    const payload = await this.getGoalOfWeek(input);
    realtimeHub.broadcast('chat:social', 'goal_of_week:vote', {
      weekKey: current.weekKey,
      goalKey: input.goalKey,
      managerId: input.managerId,
    });
    return { ok: true, vote, ...payload };
  },
};
