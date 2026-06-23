import prisma from '../../db/prisma';

const CLUB_SELECT = { id: true, name: true, shortName: true, badge: true } as const;
const PLAYER_SELECT = {
  id: true,
  name: true,
  position: true,
  nationality: true,
  club: { select: CLUB_SELECT },
} as const;

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

type Paging = {
  skip?: number;
  take?: number;
};

type PalmaresFilters = Paging & {
  season?: string;
  clubId?: number;
  playerId?: number;
  competitionId?: number;
};

type ArchiveFilters = Paging & {
  q?: string;
  type?: string;
};

function clampTake(value: number | undefined, max: number, fallback: number) {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(1, Math.min(max, Number(value)));
}

function clampSkip(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Number(value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function winnerFor(match: { homeClubId: number; awayClubId: number; homeGoals: number | null; awayGoals: number | null }, clubId: number) {
  const own = match.homeClubId === clubId ? match.homeGoals : match.awayGoals;
  const other = match.homeClubId === clubId ? match.awayGoals : match.homeGoals;
  if ((own ?? 0) > (other ?? 0)) return 'win';
  if ((own ?? 0) === (other ?? 0)) return 'draw';
  return 'loss';
}

function matchMemoryRow(match: any) {
  const homeGoals = match.homeGoals ?? 0;
  const awayGoals = match.awayGoals ?? 0;
  const homeWon = homeGoals > awayGoals;
  const awayWon = awayGoals > homeGoals;
  return {
    matchId: match.id,
    playedAt: match.playedAt,
    competition: match.matchday?.competition ?? null,
    homeClub: match.homeClub,
    awayClub: match.awayClub,
    homeGoals,
    awayGoals,
    score: `${homeGoals}-${awayGoals}`,
    totalGoals: homeGoals + awayGoals,
    goalDiff: Math.abs(homeGoals - awayGoals),
    winner: homeWon ? match.homeClub : awayWon ? match.awayClub : null,
    loser: homeWon ? match.awayClub : awayWon ? match.homeClub : null,
  };
}

async function recentPlayedMatches(take: number) {
  return prisma.match.findMany({
    where: { status: 'played', homeGoals: { not: null }, awayGoals: { not: null } },
    include: {
      homeClub: { select: CLUB_SELECT },
      awayClub: { select: CLUB_SELECT },
      matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
    },
    orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
    take,
  });
}

async function computedLegends(clubId: number, honours: Array<{ id: number; name: string; season: string; createdAt: Date }>) {
  const players = await prisma.player.findMany({
    where: { clubId },
    select: {
      id: true,
      name: true,
      position: true,
      age: true,
      nationality: true,
      seasonStats: {
        select: {
          matchesPlayed: true,
          goals: true,
          assists: true,
          averageRating: true,
        },
      },
    },
  });

  const clubHonourScore = honours.length * 2;
  return players
    .map(player => {
      const totals = player.seasonStats.reduce((acc, stat) => ({
        matches: acc.matches + stat.matchesPlayed,
        goals: acc.goals + stat.goals,
        assists: acc.assists + stat.assists,
        ratingTotal: acc.ratingTotal + stat.averageRating,
        ratingCount: acc.ratingCount + (stat.averageRating > 0 ? 1 : 0),
      }), { matches: 0, goals: 0, assists: 0, ratingTotal: 0, ratingCount: 0 });
      const averageRating = totals.ratingCount ? totals.ratingTotal / totals.ratingCount : 0;
      const legendScore = Math.round(
        totals.matches * 0.25 +
        totals.goals * 1.5 +
        totals.assists +
        averageRating * 4 +
        clubHonourScore
      );
      return {
        id: player.id,
        playerId: player.id,
        name: player.name,
        position: player.position,
        age: player.age,
        nationality: player.nationality,
        legendScore,
        totals: {
          matches: totals.matches,
          goals: totals.goals,
          assists: totals.assists,
          averageRating: round2(averageRating),
        },
        stages: [{ clubId, matchesPlayed: totals.matches, goals: totals.goals, assists: totals.assists }],
      };
    })
    .filter(player => player.legendScore > 0)
    .sort((a, b) => b.legendScore - a.legendScore || b.totals.goals - a.totals.goals)
    .slice(0, 20);
}

export const memoryService = {
  async overview(authManagerId: number) {
    const [honours, seasons, playedMatches, news, legends, latestHonours, latestNews, matches] = await Promise.all([
      prisma.honour.count(),
      prisma.seasonHistory.count(),
      prisma.match.count({ where: { status: 'played' } }),
      prisma.news.count(),
      prisma.clubLegend.count(),
      prisma.honour.findMany({
        include: {
          club: { select: CLUB_SELECT },
          player: { select: { id: true, name: true, position: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
      }),
      prisma.news.findMany({
        // AUDIT 3.1 (mismo vector que archive): News es bandeja PRIVADA. latestNews
        // se restringe al mánager autenticado; antes mostraba subject + destinatario
        // de las noticias privadas de CUALQUIER mánager.
        where: { recipientId: Number(authManagerId) || -1 },
        select: {
          id: true,
          type: true,
          subject: true,
          recipientId: true,
          createdAt: true,
          recipient: { select: { id: true, name: true, club: { select: CLUB_SELECT } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
      }),
      recentPlayedMatches(500),
    ]);

    return {
      counts: { honours, seasons, playedMatches, news, legends },
      latestHonours,
      latestNews,
      biggestWins: matches
        .map(matchMemoryRow)
        .filter(match => match.goalDiff > 0)
        .sort((a, b) => b.goalDiff - a.goalDiff || b.totalGoals - a.totalGoals)
        .slice(0, 5),
      uiNeed: '// NECESITO: Antigravity debe rehacer AwardsPage como Memoria del Mundo con tabs Palmarés/Hemeroteca/Récords/Leyendas.',
    };
  },

  async headToHead(clubAId: number, clubBId: number) {
    if (clubAId === clubBId) throw new Error('Choose two different clubs');
    const [clubA, clubB, matches] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubAId }, select: CLUB_SELECT }),
      prisma.club.findUnique({ where: { id: clubBId }, select: CLUB_SELECT }),
      prisma.match.findMany({
        where: {
          status: 'played',
          OR: [
            { homeClubId: clubAId, awayClubId: clubBId },
            { homeClubId: clubBId, awayClubId: clubAId },
          ],
        },
        include: {
          homeClub: { select: CLUB_SELECT },
          awayClub: { select: CLUB_SELECT },
          matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
        },
        orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    ]);
    if (!clubA || !clubB) throw new Error('Club not found');

    let clubAWins = 0;
    let clubBWins = 0;
    let draws = 0;
    let clubAGoals = 0;
    let clubBGoals = 0;
    for (const match of matches) {
      const aGoals = match.homeClubId === clubAId ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
      const bGoals = match.homeClubId === clubBId ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
      clubAGoals += aGoals;
      clubBGoals += bGoals;
      const result = winnerFor(match, clubAId);
      if (result === 'win') clubAWins++;
      else if (result === 'loss') clubBWins++;
      else draws++;
    }

    return {
      clubA,
      clubB,
      summary: {
        played: matches.length,
        clubAWins,
        clubBWins,
        draws,
        clubAGoals,
        clubBGoals,
      },
      recent: matches.slice(0, 10).map(match => ({
        id: match.id,
        playedAt: match.playedAt,
        homeClub: match.homeClub,
        awayClub: match.awayClub,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        competition: match.matchday?.competition ?? null,
      })),
    };
  },

  async palmares(filters: PalmaresFilters = {}) {
    const skip = clampSkip(filters.skip);
    const take = clampTake(filters.take, 100, 50);
    const honourWhere: any = {};
    const seasonWhere: any = {};

    if (filters.season) {
      honourWhere.season = filters.season;
      seasonWhere.season = filters.season;
    }
    if (filters.clubId) {
      honourWhere.clubId = filters.clubId;
      seasonWhere.clubId = filters.clubId;
    }
    if (filters.playerId) honourWhere.playerId = filters.playerId;
    if (filters.competitionId) seasonWhere.competitionId = filters.competitionId;

    const [totalHonours, honours, seasonHistory] = await Promise.all([
      prisma.honour.count({ where: honourWhere }),
      prisma.honour.findMany({
        where: honourWhere,
        include: {
          club: { select: CLUB_SELECT },
          player: { select: { id: true, name: true, position: true, nationality: true } },
        },
        orderBy: [{ season: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.seasonHistory.findMany({
        where: seasonWhere,
        include: {
          club: { select: CLUB_SELECT },
          competition: { select: { id: true, name: true, shortName: true, country: true, tier: true, type: true } },
        },
        orderBy: [{ season: 'desc' }, { competitionId: 'asc' }, { position: 'asc' }],
        skip,
        take,
      }),
    ]);

    return {
      skip,
      take,
      totalHonours,
      honours,
      seasonHistory,
    };
  },

  async archive(filters: ArchiveFilters, authManagerId: number) {
    const skip = clampSkip(filters.skip);
    const take = clampTake(filters.take, 100, 50);
    // AUDIT 3.1 (IDOR): `News.recipientId` NO es nullable → cada noticia es la
    // bandeja PRIVADA de un mánager. La hemeroteca DEBE restringirse al mánager
    // autenticado; nunca se confía en un managerId/clubId del query (eso permitía
    // a cualquier mánager leer la bandeja de otro). `|| -1` evita que un token sin
    // managerId degenere en `recipientId: undefined` (= sin filtro = fuga total).
    const newsWhere: any = { recipientId: Number(authManagerId) || -1 };
    const pressWhere: any = {};
    const q = filters.q?.trim();

    if (q) {
      newsWhere.OR = [{ subject: contains(q) }, { body: contains(q) }];
      pressWhere.OR = [{ headline: contains(q) }, { content: contains(q) }];
    }
    if (filters.type) newsWhere.type = filters.type;

    const includePressItems = !filters.type || filters.type === 'press';
    const [totalNews, totalPressItems, news, pressItems] = await Promise.all([
      prisma.news.count({ where: newsWhere }),
      includePressItems ? prisma.pressItem.count({ where: pressWhere }) : Promise.resolve(0),
      prisma.news.findMany({
        where: newsWhere,
        select: {
          id: true,
          type: true,
          subject: true,
          body: true,
          recipientId: true,
          createdAt: true,
          recipient: { select: { id: true, name: true, club: { select: CLUB_SELECT } } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      includePressItems
        ? prisma.pressItem.findMany({
          where: pressWhere,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
        })
        : Promise.resolve([]),
    ]);

    return {
      skip,
      take,
      totalNews,
      totalPressItems,
      news: news.map(item => ({ ...item, source: 'news' })),
      pressItems: pressItems.map(item => ({ ...item, source: 'press' })),
    };
  },

  async records(input: { take?: number } = {}) {
    const take = clampTake(input.take, 50, 10);
    const [matches, goalGroups, assistGroups, ratingGroups, clubRecords, playerRecords] = await Promise.all([
      recentPlayedMatches(5000),
      prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _sum: { goals: true, assists: true, minutes: true },
        _count: { playerId: true },
        orderBy: { _sum: { goals: 'desc' } },
        take,
      }),
      prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _sum: { goals: true, assists: true, minutes: true },
        _count: { playerId: true },
        orderBy: { _sum: { assists: 'desc' } },
        take,
      }),
      prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _avg: { rating: true },
        _count: { playerId: true },
        where: { rating: { gt: 0 } },
        orderBy: { _avg: { rating: 'desc' } },
        take,
      }),
      prisma.clubRecord.findMany({
        include: { club: { select: CLUB_SELECT } },
        orderBy: [{ value: 'desc' }, { updatedAt: 'desc' }],
        take,
      }),
      prisma.playerRecord.findMany({
        include: { player: { select: PLAYER_SELECT } },
        orderBy: [{ value: 'desc' }, { updatedAt: 'desc' }],
        take,
      }),
    ]);
    const playerIds = Array.from(new Set([
      ...goalGroups.map(row => row.playerId),
      ...assistGroups.map(row => row.playerId),
      ...ratingGroups.map(row => row.playerId),
    ]));
    const players = await prisma.player.findMany({ where: { id: { in: playerIds } }, select: PLAYER_SELECT });
    const playerById = new Map(players.map(player => [player.id, player]));
    const matchRows = matches.map(matchMemoryRow);

    const orderedMatches = [...matches].sort((a, b) => {
      const left = a.playedAt?.getTime() ?? 0;
      const right = b.playedAt?.getTime() ?? 0;
      return left - right || a.id - b.id;
    });
    const streaks = new Map<number, { club: any; current: number; best: number }>();
    const ensureStreak = (club: any) => {
      const existing = streaks.get(club.id);
      if (existing) return existing;
      const fresh = { club, current: 0, best: 0 };
      streaks.set(club.id, fresh);
      return fresh;
    };
    const applyResult = (club: any, result: 'win' | 'draw' | 'loss') => {
      const streak = ensureStreak(club);
      streak.current = result === 'loss' ? 0 : streak.current + 1;
      streak.best = Math.max(streak.best, streak.current);
    };
    for (const match of orderedMatches) {
      applyResult(match.homeClub, winnerFor(match, match.homeClubId));
      applyResult(match.awayClub, winnerFor(match, match.awayClubId));
    }

    const goalsRow = (row: typeof goalGroups[number]) => ({
      player: playerById.get(row.playerId) ?? { id: row.playerId },
      goals: row._sum.goals ?? 0,
      assists: row._sum.assists ?? 0,
      minutes: row._sum.minutes ?? 0,
      matches: row._count.playerId,
    });
    const ratingRow = (row: typeof ratingGroups[number]) => ({
      player: playerById.get(row.playerId) ?? { id: row.playerId },
      averageRating: round2(row._avg.rating ?? 0),
      matches: row._count.playerId,
    });

    return {
      biggestWins: matchRows
        .filter(match => match.goalDiff > 0)
        .sort((a, b) => b.goalDiff - a.goalDiff || b.totalGoals - a.totalGoals)
        .slice(0, take),
      highestScoringMatches: matchRows
        .sort((a, b) => b.totalGoals - a.totalGoals || b.goalDiff - a.goalDiff)
        .slice(0, take),
      topScorers: goalGroups.map(goalsRow),
      topAssisters: assistGroups.map(goalsRow),
      topRatings: ratingGroups.map(ratingRow),
      bestUnbeatenStreaks: Array.from(streaks.values())
        .sort((a, b) => b.best - a.best)
        .slice(0, take)
        .map(row => ({ club: row.club, matches: row.best })),
      clubRecords,
      playerRecords,
    };
  },

  async legends(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: CLUB_SELECT,
    });
    if (!club) throw new Error('Club not found');

    const [persisted, honours] = await Promise.all([
      prisma.clubLegend.findMany({
        where: { clubId },
        orderBy: [{ legendScore: 'desc' }, { matchesPlayed: 'desc' }, { goals: 'desc' }],
        take: 30,
      }),
      prisma.honour.findMany({
        where: { clubId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    if (persisted.length > 0) {
      return {
        club,
        legends: persisted.map(row => ({
          id: row.id,
          playerId: row.playerId,
          name: row.name,
          position: row.position,
          nationality: row.nationality,
          legendScore: row.legendScore,
          retiredAt: row.retiredAt,
          totals: {
            matches: row.matchesPlayed,
            goals: row.goals,
            assists: row.assists,
            averageRating: null,
          },
          stages: [{ clubId: row.clubId, matchesPlayed: row.matchesPlayed, goals: row.goals, assists: row.assists }],
        })),
        honours: honours.map(honour => ({
          id: honour.id,
          name: honour.name,
          season: honour.season,
          createdAt: honour.createdAt,
        })),
        storage: 'persisted',
        uiNeed: '// NECESITO: Antigravity debe mostrar Leyendas en Memoria del Mundo y enlazar jugador/modal si playerId existe.',
      };
    }

    return {
      club,
      legends: await computedLegends(clubId, honours),
      honours: honours.map(honour => ({
        id: honour.id,
        name: honour.name,
        season: honour.season,
        createdAt: honour.createdAt,
      })),
      storage: 'computed_fallback',
      uiNeed: '// NECESITO: Antigravity debe mostrar Leyendas en Memoria del Mundo y enlazar jugador/modal si playerId existe.',
    };
  },
};
