import prisma from '../../db/prisma';
import { moneyToNumber } from '../../lib/roundMoney';
import { buildRoster, simulateGame } from '../simulation/engineClient';
import type { TacticInput } from '../simulation/simulation.engine';
import {
  friendlyFitnessAfterMatch,
  friendlyResultLabel,
  friendlySeasonBounds,
  friendlySeed,
  isFriendlyWindow,
} from './friendlies.logic';

// ─── Constants (FDF spec) ─────────────────────────────────────────────────────
// Preseason window: July 5 – August 20 (in-game).
// Max 7 friendlies per season per club.
const MAX_FRIENDLIES_PER_SEASON = 7;
// Preseason: month 7 day 5 to month 8 day 20 (in-game date)
const PRESEASON_START_MONTH = 7; // July
const PRESEASON_START_DAY = 5;
const PRESEASON_END_MONTH = 8;  // August
const PRESEASON_END_DAY = 20;
const FRIENDLY_TACTIC = {
  formation: '4-4-2',
  construction: 50,
  destruction: 50,
  pressing: 50,
  tempo: 50,
  width: 50,
  mentality: 50,
} satisfies TacticInput;

async function clubMap(ids: number[]) {
  const clubs = ids.length
    ? await prisma.club.findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: { id: true, name: true, shortName: true, reputation: true, fans: true },
      })
    : [];
  return new Map(clubs.map((club) => [club.id, club]));
}

function projectedIncome(homeFans: number, awayFans: number, reputation: number): number {
  // Preseason attendance factor: 35% of home fans + 8% of away fans, capped at 70% capacity
  const attendance = Math.round(Math.min(homeFans * 0.35 + awayFans * 0.08, homeFans * 0.7));
  const ticket = 12 + Math.round(reputation / 10);
  return Math.max(25000, attendance * ticket);
}

export const friendliesService = {
  async processDue(inGameDate: Date): Promise<{ played: number; incomePaid: number }> {
    const due = await prisma.friendly.findMany({
      where: { result: null, dateTurn: { lte: inGameDate } },
      orderBy: { id: 'asc' },
      take: 100,
    });
    let played = 0;
    let incomePaid = 0;

    for (const friendly of due) {
      const incomeA = moneyToNumber(friendly.incomeA);
      const incomeB = moneyToNumber(friendly.incomeB);
      const [home, away] = await Promise.all([
        prisma.club.findUnique({
          where: { id: friendly.clubAId },
          include: {
            players: {
              include: {
                injuries: { where: { weeksLeft: { gt: 0 } } },
                suspensions: { where: { matches: { gt: 0 } } },
              },
            },
          },
        }),
        prisma.club.findUnique({
          where: { id: friendly.clubBId },
          include: {
            players: {
              include: {
                injuries: { where: { weeksLeft: { gt: 0 } } },
                suspensions: { where: { matches: { gt: 0 } } },
              },
            },
          },
        }),
      ]);
      if (!home || !away) continue;

      const homeRoster = buildRoster(home.players, undefined, inGameDate);
      const awayRoster = buildRoster(away.players, undefined, inGameDate);
      const result = await simulateGame(
        homeRoster,
        awayRoster,
        FRIENDLY_TACTIC,
        FRIENDLY_TACTIC,
        friendlySeed(friendly.id),
      );
      const label = friendlyResultLabel(result.homeGoals, result.awayGoals);
      const fitnessById = new Map<number, number>();
      for (const [players, roster] of [[home.players, homeRoster], [away.players, awayRoster]] as const) {
        const starterIds = new Set(
          roster.filter(player => player.isStarter).map(player => Number(player.id)).filter(Number.isSafeInteger),
        );
        for (const player of players) {
          if (starterIds.has(player.id)) {
            fitnessById.set(player.id, friendlyFitnessAfterMatch(player.fitness));
          }
        }
      }

      const claimed = await prisma.$transaction(async (tx) => {
        const claim = await tx.friendly.updateMany({
          where: { id: friendly.id, result: null },
          data: { result: label },
        });
        if (claim.count === 0) return false;

        await Promise.all([
          tx.club.update({
            where: { id: friendly.clubAId },
            data: { budget: { increment: incomeA }, cash: { increment: incomeA } },
          }),
          tx.club.update({
            where: { id: friendly.clubBId },
            data: { budget: { increment: incomeB }, cash: { increment: incomeB } },
          }),
          ...[...fitnessById].map(([id, fitness]) =>
            tx.player.update({ where: { id }, data: { fitness } })),
        ]);
        return true;
      });

      if (claimed) {
        played++;
        incomePaid += incomeA + incomeB;
      }
    }

    return { played, incomePaid };
  },

  async list(clubId: number) {
    const friendlies = await prisma.friendly.findMany({
      where: {
        OR: [{ clubAId: clubId }, { clubBId: clubId }],
      },
      orderBy: { dateTurn: 'asc' },
      take: 50,
    });
    const clubs = await clubMap(friendlies.flatMap((friendly) => [friendly.clubAId, friendly.clubBId]));
    return friendlies.map((friendly) => ({
      ...friendly,
      incomeA: moneyToNumber(friendly.incomeA),
      incomeB: moneyToNumber(friendly.incomeB),
      clubA: clubs.get(friendly.clubAId) ?? null,
      clubB: clubs.get(friendly.clubBId) ?? null,
    }));
  },

  async create(clubId: number, opponentClubId: number, dateTurn: Date) {
    if (clubId === opponentClubId) throw new Error('Cannot create a friendly against your own club');
    if (Number.isNaN(dateTurn.getTime())) throw new Error('Invalid date');

    if (!isFriendlyWindow(dateTurn)) {
      throw new Error(
        'Los amistosos solo se pueden programar en pretemporada (5 Jul–20 Ago) o parón invernal (2–15 Ene)'
      );
    }

    const [home, away] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId } }),
      prisma.club.findUnique({ where: { id: opponentClubId } }),
    ]);
    if (!home || !away) throw new Error('Club not found');

    // Check per-season cap (use UTC year of the friendly date as season proxy)
    const { start: seasonStart, end: seasonEnd } = friendlySeasonBounds(dateTurn);

    const seasonCount = await prisma.friendly.count({
      where: {
        OR: [{ clubAId: clubId }, { clubBId: clubId }],
        dateTurn: { gte: seasonStart, lte: seasonEnd },
      },
    });
    if (seasonCount >= MAX_FRIENDLIES_PER_SEASON) {
      throw new Error(`Has alcanzado el máximo de ${MAX_FRIENDLIES_PER_SEASON} amistosos por temporada`);
    }

    const existing = await prisma.friendly.findFirst({
      where: {
        dateTurn,
        OR: [
          { clubAId: clubId },
          { clubBId: clubId },
          { clubAId: opponentClubId },
          { clubBId: opponentClubId },
        ],
      },
    });
    if (existing) throw new Error('One of the clubs already has a friendly at that date');

    const income = projectedIncome(home.fans, away.fans, Math.max(home.reputation, away.reputation));
    await prisma.friendly.create({
      data: {
        clubAId: clubId,
        clubBId: opponentClubId,
        dateTurn,
        incomeA: Math.round(income * 0.65),
        incomeB: Math.round(income * 0.35),
      },
    });

    return this.list(clubId);
  },

  async cancel(clubId: number, friendlyId: number) {
    const friendly = await prisma.friendly.findUnique({ where: { id: friendlyId } });
    if (!friendly || (friendly.clubAId !== clubId && friendly.clubBId !== clubId)) {
      throw new Error('Friendly not found');
    }
    if (friendly.result) throw new Error('Cannot cancel a played friendly');

    await prisma.friendly.delete({ where: { id: friendlyId } });
    return this.list(clubId);
  },

  // Returns preseason window info + remaining slots for a club
  async preseasonInfo(clubId: number, inGameDate: Date) {
    const seasonYear = inGameDate.getUTCFullYear();
    const { start: seasonStart, end: seasonEnd } = friendlySeasonBounds(inGameDate);

    const count = await prisma.friendly.count({
      where: {
        OR: [{ clubAId: clubId }, { clubBId: clubId }],
        dateTurn: { gte: seasonStart, lte: seasonEnd },
      },
    });

    return {
      preseasonStart: new Date(Date.UTC(seasonYear, PRESEASON_START_MONTH - 1, PRESEASON_START_DAY)),
      preseasonEnd: new Date(Date.UTC(seasonYear, PRESEASON_END_MONTH - 1, PRESEASON_END_DAY)),
      maxFriendlies: MAX_FRIENDLIES_PER_SEASON,
      usedFriendlies: count,
      remainingFriendlies: Math.max(0, MAX_FRIENDLIES_PER_SEASON - count),
      isPreseasonActive: isFriendlyWindow(inGameDate),
    };
  },
};
