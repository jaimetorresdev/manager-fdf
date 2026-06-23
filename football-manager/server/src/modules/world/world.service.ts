import prisma from '../../db/prisma';
import { moneyToNumber, type DecimalLike } from '../../lib/roundMoney';
import { canonicalPlayerOverall } from '../players/detailedPositions';
import { sortStandings, withHeadToHeadPoints } from '../game/standings';
import { MIN_RATING_MATCHES } from '../leaderboards/leaderboards.logic';
import {
  competitionMovementSlots,
  movementZoneForIndex,
  type MovementSlots,
} from './standingsZones';

interface ClubSearchFilters {
  country?: string;
  q?: string;
  competitionId?: number;
  take?: number;
}

interface StandingsFilters {
  division?: string;
  country?: string;
  tier?: number;
}

interface LeaderboardFilters {
  competitionId?: number;
  country?: string;
  take?: number;
}

interface GenerateGroupsInput {
  groupSize?: number;
}

interface GroupStandingRow {
  groupName: string;
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

const FDF_POSITIONS = ['PO', 'LI', 'DFC', 'LD', 'MD', 'MI', 'PIV', 'MC', 'MCO', 'EXT IZQ', 'EXT DERECHA', 'DC'];
const TARGET_SQUAD_SIZE = 22;

function normalizePosition(position: string) {
  const value = position.trim().toUpperCase();
  if (value === 'POR') return 'PO';
  if (value === 'DEL') return 'DC';
  if (value === 'MED') return 'MC';
  if (value === 'DEF') return 'DFC';
  if (value === 'EXT_I' || value === 'EI') return 'EXT IZQ';
  if (value === 'EXT_D' || value === 'ED') return 'EXT DERECHA';
  return value;
}

function goalDifference(row: { goalsFor: number; goalsAgainst: number }) {
  return row.goalsFor - row.goalsAgainst;
}

function sortTable<T extends { points: number; goalsFor: number; goalsAgainst: number; won: number }>(rows: T[]) {
  return sortStandings(rows);
}

function tableRow(row: {
  club: {
    id: number;
    name: string;
    shortName: string;
    badge: string;
    city?: string;
    country?: string;
    reputation?: number;
    budget?: number | DecimalLike | null;
  };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}, index: number, totalRows: number, slots: MovementSlots) {
  return {
    position: index + 1,
    club: {
      ...row.club,
      budget: moneyToNumber(row.club.budget),
    },
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: goalDifference(row),
    points: row.points,
    movementZone: movementZoneForIndex(index, totalRows, slots),
  };
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function winnerClubId(match: {
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeStatsJson: string | null;
}) {
  const stats = parseJsonObject(match.homeStatsJson);
  const stored = numberValue(stats.winnerClubId);
  if (stored) return Math.round(stored);
  if (match.homeGoals == null || match.awayGoals == null) return null;
  if (match.homeGoals > match.awayGoals) return match.homeClubId;
  if (match.awayGoals > match.homeGoals) return match.awayClubId;
  return null;
}

function groupLabel(index: number): string {
  const letter = String.fromCharCode('A'.charCodeAt(0) + index);
  return `Grupo ${letter}`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

function sortGroupTable<T extends { points: number; goalsFor: number; goalsAgainst: number; won: number }>(rows: T[]) {
  return sortStandings(rows);
}

function squadAudit(club: { id: number; name: string; shortName: string; players: Array<{ id: number; position: string; isStarter: boolean }> }) {
  const counts = new Map<string, number>();
  const starterCounts = new Map<string, number>();
  for (const player of club.players) {
    const pos = normalizePosition(player.position);
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
    if (player.isStarter) starterCounts.set(pos, (starterCounts.get(pos) ?? 0) + 1);
  }
  const positionCounts = FDF_POSITIONS.map((position) => ({
    position,
    total: counts.get(position) ?? 0,
    starters: starterCounts.get(position) ?? 0,
    hasBackup: (counts.get(position) ?? 0) >= 2,
  }));
  const knownPositions = new Set(FDF_POSITIONS);
  const unknownPositions = [...counts.keys()].filter((position) => !knownPositions.has(position));

  return {
    club: { id: club.id, name: club.name, shortName: club.shortName },
    totalPlayers: club.players.length,
    targetPlayers: TARGET_SQUAD_SIZE,
    isTargetSize: club.players.length === TARGET_SQUAD_SIZE,
    positionCounts,
    missingPositions: positionCounts.filter((row) => row.total === 0).map((row) => row.position),
    thinPositions: positionCounts.filter((row) => row.total === 1).map((row) => row.position),
    positionsWithBackup: positionCounts.filter((row) => row.hasBackup).map((row) => row.position),
    unknownPositions,
  };
}

// ─── WorldEconomy & Rankings ──────────────────────────────────────────────────

export const worldEconomyService = {
  // Get latest WorldEconomy record
  async getLatest() {
    return prisma.worldEconomy.findFirst({ orderBy: { id: 'desc' } });
  },

  // Get history (last N records)
  async getHistory(take = 30) {
    return prisma.worldEconomy.findMany({
      orderBy: { id: 'desc' },
      take: Math.max(1, Math.min(200, take)),
    });
  },

  // Compute world economy value and inflation based on aggregate demand
  async computeIndex(
    inGameDate: Date,
    currentTurn?: number,
  ): Promise<{ value: number; inflationIndex: number; demandFactor: number }> {
    const clubs = await prisma.club.findMany({ select: { cash: true, fixedAssets: true } });
    const baselineValue = 5_500_000;
    
    let avg = baselineValue;
    if (clubs.length) {
      avg = clubs.reduce(
        (sum, c) => sum + moneyToNumber(c.cash) + moneyToNumber(c.fixedAssets),
        0,
      ) / clubs.length;
    }
    const value = Math.round((avg / baselineValue) * 100 * 100) / 100;

    const turn = currentTurn ?? (await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { turn: true },
    }))?.turn ?? 0;

    // 30 in-game days ≈ 10 turns (DAYS_PER_TURN=3 in game.service.ts).
    const TURNS_IN_30_DAYS = 10;
    const minTurn = Math.max(0, turn - TURNS_IN_30_DAYS);

    const thirtyDaysAgo = new Date(inGameDate);
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

    // TransferAgreement/AuctionBid: createdAt anclado a inGameDate al crear; excluir
    // timestamps de reloj real (siempre > inGameDate) con lte inGameDate.
    const inGameCreatedAtWindow = { gte: thirtyDaysAgo, lte: inGameDate };

    const [transferOffers, transferAgreements, auctionBids] = await Promise.all([
      prisma.transferOffer.aggregate({
        _sum: { amount: true },
        where: { turn: { gte: minTurn } },
      }),
      prisma.transferAgreement.aggregate({
        _sum: { amount: true },
        where: { createdAt: inGameCreatedAtWindow },
      }),
      prisma.auctionBid.aggregate({
        _sum: { amount: true },
        where: { createdAt: inGameCreatedAtWindow },
      }),
    ]);

    const totalDemand = (transferOffers._sum.amount || 0) + 
                        (transferAgreements._sum.amount || 0) + 
                        (auctionBids._sum.amount || 0);

    // Baseline demand assumption: e.g., 10M per club per month
    const expectedDemand = clubs.length * 10_000_000;
    const demandFactor = expectedDemand > 0 ? totalDemand / expectedDemand : 1.0;

    // Historical index smoothing: previous inflation
    const lastRecord = await this.getLatest();
    const oldInflation = lastRecord?.inflationIndex ?? 1.0;

    // K-factor = 0.05 max variation per month
    const delta = (demandFactor - 1.0) * 0.05;
    
    // Bounds between 0.8 (-20% deflación extrema) and 1.5 (+50% inflación extrema)
    let newInflation = oldInflation + delta;
    newInflation = Math.max(0.8, Math.min(1.5, newInflation));
    
    // Round to 3 decimals
    newInflation = Math.round(newInflation * 1000) / 1000;

    return { value, inflationIndex: newInflation, demandFactor };
  },

  // Record a new world economy value
  async record(stats: { value: number; inflationIndex: number; demandFactor: number }, inGameDate: Date) {
    return prisma.worldEconomy.create({ 
      data: { 
        value: stats.value, 
        inflationIndex: stats.inflationIndex,
        demandFactor: stats.demandFactor,
        inGameDate 
      } 
    });
  },
};

export const rankingService = {
  // Generate and persist a ranking snapshot
  async snapshot(type: string, payload: object) {
    return prisma.rankingSnapshot.create({
      data: { type, payload: JSON.stringify(payload) },
    });
  },

  // Get latest snapshot of a type
  async getLatest(type: string) {
    const snap = await prisma.rankingSnapshot.findFirst({
      where: { type },
      orderBy: { id: 'desc' },
    });
    if (!snap) return null;
    try {
      return { ...snap, payload: JSON.parse(snap.payload) };
    } catch {
      return { ...snap, payload: null };
    }
  },

  // Manager of the Year: most prestige gained in the current season
  async managerOfTheYear() {
    const managers = await prisma.manager.findMany({
      select: {
        id: true,
        name: true,
        prestige: true,
        user: { select: { username: true } },
        club: { select: { shortName: true } },
        prestiges: { orderBy: { updatedAt: 'desc' }, take: 1 },
      },
      orderBy: { prestige: 'desc' },
      take: 20,
    });
    return managers.map((m, i) => ({
      rank: i + 1,
      managerId: m.id,
      name: m.name,
      username: m.user.username,
      clubShortName: m.club?.shortName ?? null,
      prestige: m.prestige,
      latestPrestige: m.prestiges[0]?.value ?? 0,
    }));
  },

  // Richest managers (wealth field)
  async richestManagers() {
    const managers = await prisma.manager.findMany({
      select: {
        id: true,
        name: true,
        wealth: true,
        user: { select: { username: true } },
        club: { select: { shortName: true } },
      },
      orderBy: { wealth: 'desc' },
      take: 20,
    });
    return managers.map((m, i) => ({
      rank: i + 1,
      managerId: m.id,
      name: m.name,
      username: m.user.username,
      clubShortName: m.club?.shortName ?? null,
      wealth: moneyToNumber(m.wealth),
    }));
  },

  // Average salary (market salary of all players)
  async averageSalary() {
    const result = await prisma.player.aggregate({ _avg: { wage: true }, _count: true });
    return {
      averageSalary: Math.round((result._avg.wage ?? 0) * 100) / 100,
      totalPlayers: result._count,
    };
  },

  // Top transfers: highest market value players
  async topTransfers() {
    const players = await prisma.player.findMany({
      select: {
        id: true,
        name: true,
        nationality: true,
        position: true,
        marketValue: true,
        wage: true,
        club: { select: { id: true, shortName: true } },
      },
      orderBy: { marketValue: 'desc' },
      take: 20,
    });
    return players.map((p, i) => ({
      rank: i + 1,
      playerId: p.id,
      name: p.name,
      nationality: p.nationality,
      position: p.position,
      marketValue: p.marketValue,
      salary: p.wage,
      club: p.club ?? null,
    }));
  },

  // Economic flow: clubs ranked by cash flow (cash as proxy)
  async economicFlow() {
    const clubs = await prisma.club.findMany({
      select: {
        id: true,
        name: true,
        shortName: true,
        cash: true,
        fixedAssets: true,
        budget: true,
        reputation: true,
        manager: { select: { id: true, name: true } },
      },
      orderBy: { cash: 'desc' },
      take: 30,
    });
    return clubs.map((c, i) => ({
      rank: i + 1,
      clubId: c.id,
      name: c.name,
      shortName: c.shortName,
      cash: moneyToNumber(c.cash),
      fixedAssets: moneyToNumber(c.fixedAssets),
      budget: moneyToNumber(c.budget),
      reputation: c.reputation,
      managerName: c.manager?.name ?? null,
    }));
  },

  // UEFA/CONMEBOL-style coefficients: 5-year sum
  async continentalCoefficients() {
    const activeSeason = await prisma.season.findFirst({ where: { isActive: true } });
    const currentSeasonId = activeSeason?.id ?? 0;
    
    // Get all club coefficients from the last 5 seasons (current season included)
    // We assume season IDs are sequential for simplicity, or we just fetch top 5 seasons
    const recentSeasons = await prisma.season.findMany({
      orderBy: { id: 'desc' },
      take: 5,
      select: { id: true }
    });
    const seasonIds = recentSeasons.map(s => s.id);

    const clubCoefs = await prisma.clubCoefficient.findMany({
      where: { seasonId: { in: seasonIds } },
      include: {
        club: { select: { id: true, name: true, shortName: true, country: true, reputation: true } },
        season: { select: { name: true } }
      }
    });

    const clubTotals = new Map<number, { club: typeof clubCoefs[0]['club']; points: number; seasons: { season: string; points: number }[] }>();
    for (const coef of clubCoefs) {
      const entry = clubTotals.get(coef.clubId) ?? { club: coef.club, points: 0, seasons: [] };
      entry.points += coef.points;
      entry.seasons.push({ season: coef.season.name, points: coef.points });
      clubTotals.set(coef.clubId, entry);
    }

    const clubs = [...clubTotals.values()]
      .sort((a, b) => b.points - a.points || b.club.reputation - a.club.reputation)
      .map((e, i) => ({
        rank: i + 1,
        clubId: e.club.id,
        name: e.club.name,
        shortName: e.club.shortName,
        country: e.club.country,
        reputation: e.club.reputation,
        points: e.points,
        seasons: e.seasons
      }));

    const leagueCoefs = await prisma.leagueCoefficient.findMany({
      where: { seasonId: { in: seasonIds } }
    });

    const leagueTotals = new Map<string, { country: string; points: number }>();
    for (const lc of leagueCoefs) {
      const current = leagueTotals.get(lc.country) ?? { country: lc.country, points: 0 };
      current.points += lc.points;
      leagueTotals.set(lc.country, current);
    }

    // Get slots for next season based on current allocations
    const slots = await prisma.europeanSlotAllocation.findMany({
      where: { seasonId: currentSeasonId }
    });
    const slotMap = new Map(slots.map(s => [s.country, { ucl: s.ucl, uel: s.uel, uecl: s.uecl }]));

    const leagues = [...leagueTotals.values()]
      .sort((a, b) => b.points - a.points)
      .map((l, i) => ({
        rank: i + 1,
        country: l.country,
        points: l.points,
        slots: slotMap.get(l.country) ?? { ucl: 0, uel: 0, uecl: 0 }
      }));

    return { clubs, leagues };
  },

  // Tick step: generate all ranking snapshots
  async stepGenerateRankings(inGameDate: Date) {
    const [moy, rich, avg, topT, eco, coef] = await Promise.all([
      this.managerOfTheYear(),
      this.richestManagers(),
      this.averageSalary(),
      this.topTransfers(),
      this.economicFlow(),
      this.continentalCoefficients(),
    ]);
    await Promise.all([
      this.snapshot('manager_of_year', { date: inGameDate, data: moy }),
      this.snapshot('richest_managers', { date: inGameDate, data: rich }),
      this.snapshot('average_salary', { date: inGameDate, data: avg }),
      this.snapshot('top_transfers', { date: inGameDate, data: topT }),
      this.snapshot('economic_flow', { date: inGameDate, data: eco }),
      this.snapshot('continental_coefficients', { date: inGameDate, data: coef }),
    ]);
    return 6;
  },
};

export const worldService = {
  async getSummary() {
    const [competitions, clubs, playerCount] = await Promise.all([
      prisma.competition.findMany({
        select: {
          id: true,
          name: true,
          shortName: true,
          country: true,
          type: true,
          _count: { select: { standings: true, matchdays: true } },
        },
        orderBy: [{ country: 'asc' }, { name: 'asc' }],
      }),
      prisma.club.findMany({
        select: {
          id: true,
          country: true,
          _count: { select: { players: true } },
        },
      }),
      prisma.player.count(),
    ]);

    const clubsByCountry = new Map<string, { clubs: number; players: number; clubsWithTargetSquad: number }>();
    for (const club of clubs) {
      const current = clubsByCountry.get(club.country) ?? { clubs: 0, players: 0, clubsWithTargetSquad: 0 };
      current.clubs += 1;
      current.players += club._count.players;
      if (club._count.players === TARGET_SQUAD_SIZE) current.clubsWithTargetSquad += 1;
      clubsByCountry.set(club.country, current);
    }

    return {
      totals: {
        competitions: competitions.length,
        leagues: competitions.filter((competition) => competition.type === 'league').length,
        clubs: clubs.length,
        players: playerCount,
        targetSquadSize: TARGET_SQUAD_SIZE,
        clubsWithTargetSquad: clubs.filter((club) => club._count.players === TARGET_SQUAD_SIZE).length,
        averageSquadSize: clubs.length ? Math.round((playerCount / clubs.length) * 10) / 10 : 0,
      },
      competitions: competitions.map((competition) => ({
        id: competition.id,
        name: competition.name,
        shortName: competition.shortName,
        country: competition.country,
        type: competition.type,
        clubCount: competition._count.standings,
        matchdayCount: competition._count.matchdays,
      })),
      countries: [...clubsByCountry.entries()].map(([country, data]) => ({
        country,
        ...data,
        averageSquadSize: data.clubs ? Math.round((data.players / data.clubs) * 10) / 10 : 0,
      })).sort((a, b) => a.country.localeCompare(b.country)),
    };
  },

  async getCompetitions() {
    const season = await prisma.season.findFirst({
      where: { isActive: true },
      include: {
        competitions: {
          include: {
            _count: { select: { matchdays: true, standings: true } },
          },
          orderBy: [{ country: 'asc' }, { name: 'asc' }],
        },
      },
    });

    const competitions = season
      ? season.competitions
      : await prisma.competition.findMany({
          include: { _count: { select: { matchdays: true, standings: true } } },
          orderBy: [{ country: 'asc' }, { name: 'asc' }],
        });

    // Defensive deduplication by name
    const uniqueCompetitions = Array.from(
      new Map(competitions.map(c => [c.name, c])).values()
    );

    return {
      season: season ? { id: season.id, name: season.name, year: season.year } : null,
      competitions: uniqueCompetitions.map((competition) => ({
        id: competition.id,
        name: competition.name,
        shortName: competition.shortName,
        type: competition.type,
        country: competition.country,
        clubCount: competition._count.standings,
        matchdayCount: competition._count.matchdays,
      })),
    };
  },

  async getStandings(filters: StandingsFilters = {}) {
    const season = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true, year: true } });
    const divisionId = filters.division && /^\d+$/.test(filters.division)
      ? Number(filters.division)
      : undefined;
    const tierFromDivision = filters.division && /^tier:\d+$/i.test(filters.division)
      ? Number(filters.division.split(':')[1])
      : undefined;

    const competitions = await prisma.competition.findMany({
      where: {
        type: 'league',
        ...(season ? { seasonId: season.id } : {}),
        ...(divisionId ? { id: divisionId } : {}),
        ...(filters.country ? { country: filters.country } : {}),
        ...(filters.tier ?? tierFromDivision ? { tier: filters.tier ?? tierFromDivision } : {}),
        ...(!divisionId && filters.division && !/^tier:\d+$/i.test(filters.division) ? {
          OR: [
            { name: { contains: filters.division } },
            { shortName: { contains: filters.division } },
            { country: { contains: filters.division } },
          ],
        } : {}),
      },
      include: {
        season: true,
        standings: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                shortName: true,
                badge: true,
                primaryColor: true,
                secondaryColor: true,
                city: true,
                country: true,
                reputation: true,
                budget: true,
                manager: { select: { id: true, name: true } },
              },
            },
          },
        },
        matchdays: {
          select: {
            matches: {
              select: {
                homeClubId: true,
                awayClubId: true,
                homeGoals: true,
                awayGoals: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: [{ country: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    });

    const maxTierByCountry = new Map<string, number>();
    for (const competition of competitions) {
      const country = competition.country ?? '';
      maxTierByCountry.set(country, Math.max(maxTierByCountry.get(country) ?? 1, competition.tier));
    }

    return {
      season,
      filters,
      competitions: competitions.map((competition) => {
        const sorted = sortTable(withHeadToHeadPoints(
          competition.standings,
          competition.matchdays.flatMap((matchday) => matchday.matches),
        ));
        const slots = competitionMovementSlots(
          competition.tier,
          maxTierByCountry.get(competition.country ?? '') ?? competition.tier,
          sorted.length,
        );
        const table = sorted.map((row, index) => tableRow(row, index, sorted.length, slots));
        return {
          id: competition.id,
          name: competition.name,
          shortName: competition.shortName,
          country: competition.country,
          tier: competition.tier,
          table,
          promotionSlots: slots.promotionSlots,
          relegationSlots: slots.relegationSlots,
          promotionCandidates: table.slice(0, slots.promotionSlots),
          relegationCandidates: slots.relegationSlots > 0
            ? table.slice(table.length - slots.relegationSlots)
            : [],
        };
      }),
    };
  },

  async getCup(filters: { country?: string; competitionId?: number } = {}) {
    const season = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true, year: true } });
    const cups = await prisma.competition.findMany({
      where: {
        type: 'cup',
        ...(season ? { seasonId: season.id } : {}),
        ...(filters.country ? { country: filters.country } : {}),
        ...(filters.competitionId ? { id: filters.competitionId } : {}),
      },
      include: {
        matchdays: {
          orderBy: { number: 'asc' },
          include: {
            matches: {
              orderBy: { id: 'asc' },
              include: {
                homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
                awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
              },
            },
          },
        },
      },
      orderBy: [{ country: 'asc' }, { name: 'asc' }],
    });

    return {
      season,
      cups: cups.map((cup) => {
        const rounds = cup.matchdays.map((matchday) => ({
          id: matchday.id,
          number: matchday.number,
          status: matchday.status,
          matches: matchday.matches.map((match) => {
            const homeStats = parseJsonObject(match.homeStatsJson);
            return {
              id: match.id,
              status: match.status,
              homeClub: match.homeClub,
              awayClub: match.awayClub,
              homeGoals: match.homeGoals,
              awayGoals: match.awayGoals,
              winnerClubId: winnerClubId(match),
              penalties: homeStats.penalties ?? null,
              playedAt: match.playedAt,
            };
          }),
        }));
        const playedFinal = [...cup.matchdays]
          .sort((a, b) => b.number - a.number)
          .flatMap(matchday => matchday.matches)
          .find(match => match.status === 'played' && winnerClubId(match) != null);
        const championId = playedFinal ? winnerClubId(playedFinal) : null;
        return {
          id: cup.id,
          name: cup.name,
          shortName: cup.shortName,
          country: cup.country,
          championId,
          rounds,
        };
      }),
    };
  },

  async getCompetitionGroups(competitionId: number) {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, name: true, shortName: true, type: true, country: true },
    });
    if (!competition) throw new Error('Competition not found');

    const matches = await prisma.match.findMany({
      where: {
        matchday: { competitionId },
        OR: [{ groupName: { not: null } }, { matchday: { groupId: { not: null } } }],
      },
      include: {
        homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
        awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
        matchday: { select: { id: true, number: true, status: true, group: { select: { name: true } } } },
      },
      orderBy: [{ matchday: { number: 'asc' } }, { id: 'asc' }],
    });

    const resolveGroupName = (match: (typeof matches)[number]) =>
      match.matchday?.group?.name ?? match.groupName ?? 'Grupo';

    const clubs = new Map<number, { id: number; name: string; shortName: string; badge: string }>();
    const rows = new Map<string, GroupStandingRow>();
    const ensure = (groupName: string, club: { id: number; name: string; shortName: string; badge: string }) => {
      clubs.set(club.id, club);
      const key = `${groupName}:${club.id}`;
      const row = rows.get(key) ?? {
        groupName,
        clubId: club.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      };
      rows.set(key, row);
      return row;
    };

    for (const match of matches) {
      const groupName = resolveGroupName(match);
      const home = ensure(groupName, match.homeClub);
      const away = ensure(groupName, match.awayClub);
      if (match.status !== 'played' || match.homeGoals == null || match.awayGoals == null) continue;

      home.played += 1;
      away.played += 1;
      home.goalsFor += match.homeGoals;
      home.goalsAgainst += match.awayGoals;
      away.goalsFor += match.awayGoals;
      away.goalsAgainst += match.homeGoals;
      if (match.homeGoals > match.awayGoals) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (match.awayGoals > match.homeGoals) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    const groups = new Map<string, GroupStandingRow[]>();
    for (const row of rows.values()) {
      const list = groups.get(row.groupName) ?? [];
      list.push(row);
      groups.set(row.groupName, list);
    }

    return {
      competition,
      groups: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([groupName, table]) => {
        const groupMatches = matches.filter((match) => resolveGroupName(match) === groupName);
        const sorted = sortGroupTable(withHeadToHeadPoints(table, groupMatches));
        return {
          name: groupName,
          table: sorted.map((row, index) => ({
            position: index + 1,
            club: clubs.get(row.clubId),
            played: row.played,
            won: row.won,
            drawn: row.drawn,
            lost: row.lost,
            goalsFor: row.goalsFor,
            goalsAgainst: row.goalsAgainst,
            goalDifference: goalDifference(row),
            points: row.points,
            qualifies: index < 2,
          })),
          fixtures: groupMatches
            .map(match => ({
              id: match.id,
              matchday: match.matchday,
              status: match.status,
              homeClub: match.homeClub,
              awayClub: match.awayClub,
              homeGoals: match.homeGoals,
              awayGoals: match.awayGoals,
              weatherCondition: match.weatherCondition,
              temperature: match.temperature,
            })),
        };
      }),
    };
  },

  async generateGroupFixtures(competitionId: number, input: GenerateGroupsInput = {}) {
    const groupSize = Math.max(3, Math.min(6, input.groupSize ?? 4));
    const existing = await prisma.match.count({
      where: { matchday: { competitionId }, groupName: { not: null } },
    });
    if (existing > 0) return { created: 0, reason: 'groups_already_exist' };

    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        standings: {
          include: { club: { select: { id: true, reputation: true } } },
        },
      },
    });
    if (!competition) throw new Error('Competition not found');
    const clubs = competition.standings
      .map(row => row.club)
      .sort((a, b) => b.reputation - a.reputation || a.id - b.id);
    if (clubs.length < groupSize) throw new Error('No hay suficientes clubes para generar grupos.');

    const groups = chunk(clubs, groupSize).filter(group => group.length >= 2);
    const lastMatchday = await prisma.matchday.findFirst({
      where: { competitionId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    const startNumber = (lastMatchday?.number ?? 0) + 1;
    const maxPairs = Math.max(...groups.map(group => (group.length * (group.length - 1)) / 2));
    let created = 0;

    for (let round = 0; round < maxPairs; round++) {
      const matchday = await prisma.matchday.create({
        data: { competitionId, number: startNumber + round, status: 'pending' },
      });
      const matchesToCreate: Array<{ homeClubId: number; awayClubId: number; groupName: string; matchdayId: number }> = [];
      groups.forEach((group, groupIndex) => {
        const pairs: Array<[number, number]> = [];
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) pairs.push([group[i].id, group[j].id]);
        }
        const pair = pairs[round];
        if (pair) {
          matchesToCreate.push({
            matchdayId: matchday.id,
            homeClubId: pair[0],
            awayClubId: pair[1],
            groupName: groupLabel(groupIndex),
          });
        }
      });

      if (matchesToCreate.length > 0) {
        await prisma.match.createMany({ data: matchesToCreate });
        created += matchesToCreate.length;
      }
    }

    return { created, groups: groups.length, groupSize };
  },

  async getLeaderboards(filters: LeaderboardFilters = {}) {
    const season = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true, name: true, year: true } });
    const take = Math.max(1, Math.min(100, filters.take ?? 25));
    if (!season) {
      return {
        season: null,
        filters,
        topScorers: [],
        topAssists: [],
        topXG: [],
        bestAverageRatings: [],
      };
    }
    const competitionWhere = {
      ...(filters.competitionId ? { competitionId: filters.competitionId } : {}),
    };

    const stats = await prisma.playerSeasonStat.findMany({
      where: {
        seasonId: season.id,
        ...competitionWhere,
      },
      include: {
        player: {
          select: { name: true, club: { select: { id: true, name: true, shortName: true, badge: true } } }
        }
      }
    });

    const rows = stats.map(s => {
      const club = s.player.club;
      const averageRating = s.ratingCount > 0 ? Math.round((s.ratingTotal / s.ratingCount) * 10) / 10 : 0;
      return {
        playerId: s.playerId,
        name: s.player.name,
        club: club ? {
          id: club.id,
          name: club.name,
          shortName: club.shortName,
          badge: club.badge,
        } : null,
        matches: s.matchesPlayed,
        minutes: s.minutes,
        goals: s.goals,
        assists: s.assists,
        xG: s.xG,
        shots: s.shots,
        shotsOnTarget: s.shotsOnTarget,
        keyPasses: s.keyPasses,
        interceptions: s.interceptions,
        averageRating,
      };
    });

    return {
      season,
      filters,
      topScorers: [...rows].sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.xG - a.xG).slice(0, take),
      topAssists: [...rows].sort((a, b) => b.assists - a.assists || b.keyPasses - a.keyPasses || b.goals - a.goals).slice(0, take),
      topXG: [...rows].sort((a, b) => b.xG - a.xG || b.shots - a.shots).slice(0, take),
      bestAverageRatings: [...rows]
        .filter(row => row.matches >= MIN_RATING_MATCHES)
        .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0) || b.goals - a.goals)
        .slice(0, take),
    };
  },

  async getCompetition(competitionId: number) {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      include: {
        season: true,
        standings: {
          include: {
            club: {
              select: {
                id: true,
                name: true,
                shortName: true,
                badge: true,
                primaryColor: true,
                secondaryColor: true,
                city: true,
                country: true,
                reputation: true,
                budget: true,
                manager: { select: { id: true, name: true } },
              },
            },
          },
        },
        matchdays: {
          orderBy: { number: 'asc' },
          include: {
            _count: { select: { matches: true } },
            matches: {
              select: {
                homeClubId: true,
                awayClubId: true,
                homeGoals: true,
                awayGoals: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!competition) throw new Error('Competition not found');

    return {
      id: competition.id,
      name: competition.name,
      shortName: competition.shortName,
      type: competition.type,
      country: competition.country,
      season: {
        id: competition.season.id,
        name: competition.season.name,
        year: competition.season.year,
      },
      table: sortTable(withHeadToHeadPoints(
        competition.standings,
        competition.matchdays.flatMap((matchday) => matchday.matches),
      )).map((row, index) => ({
        position: index + 1,
        club: {
          ...row.club,
          budget: moneyToNumber(row.club.budget),
        },
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: goalDifference(row),
        points: row.points,
      })),
      matchdays: competition.matchdays.map((matchday) => ({
        id: matchday.id,
        number: matchday.number,
        status: matchday.status,
        matchCount: matchday._count.matches,
      })),
    };
  },

  async getCompetitionFixtures(competitionId: number) {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, name: true, shortName: true, country: true },
    });
    if (!competition) throw new Error('Competition not found');

    const matchdays = await prisma.matchday.findMany({
      where: { competitionId },
      orderBy: { number: 'asc' },
      include: {
        matches: {
          orderBy: { id: 'asc' },
          include: {
            homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
            awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
          },
        },
      },
    });

    return {
      competition,
      matchdays: matchdays.map((matchday) => ({
        id: matchday.id,
        number: matchday.number,
        status: matchday.status,
        matches: matchday.matches.map((match) => ({
          id: match.id,
          status: match.status,
          homeClub: match.homeClub,
          awayClub: match.awayClub,
          homeGoals: match.homeGoals,
          awayGoals: match.awayGoals,
          playedAt: match.playedAt,
        })),
      })),
    };
  },

  async searchClubs(filters: ClubSearchFilters) {
    const take = Math.max(1, Math.min(100, filters.take ?? 50));
    let allowedClubIds: number[] | undefined;

    if (filters.competitionId) {
      const standings = await prisma.standing.findMany({
        where: { competitionId: filters.competitionId },
        select: { clubId: true },
      });
      allowedClubIds = standings.map((row) => row.clubId);
      if (allowedClubIds.length === 0) return [];
    }

    const clubs = await prisma.club.findMany({
      where: {
        ...(filters.country ? { country: filters.country } : {}),
        ...(filters.q ? {
          OR: [
            { name: { contains: filters.q } },
            { shortName: { contains: filters.q } },
            { city: { contains: filters.q } },
          ],
        } : {}),
        ...(allowedClubIds ? { id: { in: allowedClubIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        country: true,
        budget: true,
        reputation: true,
        stadiumName: true,
        stadiumCapacity: true,
        fans: true,
      },
      orderBy: [{ country: 'asc' }, { reputation: 'desc' }, { name: 'asc' }],
      take,
    });
    return clubs.map((club) => ({
      ...club,
      budget: moneyToNumber(club.budget),
    }));
  },

  async getClub(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        players: {
          orderBy: [{ position: 'asc' }, { isStarter: 'desc' }, { marketValue: 'desc' }],
        },
        standings: {
          include: {
            competition: { select: { id: true, name: true, shortName: true, country: true } },
          },
        },
      },
    });
    if (!club) throw new Error('Club not found');

    return {
      id: club.id,
      name: club.name,
      shortName: club.shortName,
      badge: club.badge,
      city: club.city,
      country: club.country,
      budget: moneyToNumber(club.budget),
      reputation: club.reputation,
      stadiumName: club.stadiumName,
      stadiumCapacity: club.stadiumCapacity,
      fans: club.fans,
      standings: club.standings.map((row) => ({
        competition: row.competition,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: goalDifference(row),
        points: row.points,
      })),
      squad: club.players.map((player) => ({
        id: player.id,
        name: player.name,
        nationality: player.nationality,
        flag: player.flag,
        age: player.age,
        position: player.position,
        squadNumber: player.squadNumber,
        isStarter: player.isStarter,
        overall: canonicalPlayerOverall(player),
        marketValue: player.marketValue,
        salary: player.wage,
        contractYears: player.contractYears,
      })),
    };
  },

  async getClubSquadAudit(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        shortName: true,
        players: {
          select: {
            id: true,
            position: true,
            isStarter: true,
          },
        },
      },
    });
    if (!club) throw new Error('Club not found');
    return squadAudit(club);
  },

  async getCompetitionSquadAudit(competitionId: number) {
    const competition = await prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, name: true, shortName: true, country: true },
    });
    if (!competition) throw new Error('Competition not found');

    const standings = await prisma.standing.findMany({
      where: { competitionId },
      select: { clubId: true },
    });
    const clubs = await prisma.club.findMany({
      where: { id: { in: standings.map((row) => row.clubId) } },
      select: {
        id: true,
        name: true,
        shortName: true,
        players: {
          select: {
            id: true,
            position: true,
            isStarter: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    const audits = clubs.map((club) => squadAudit(club));

    return {
      competition,
      targetPlayers: TARGET_SQUAD_SIZE,
      expectedPositions: FDF_POSITIONS,
      clubs: audits,
      summary: {
        clubCount: audits.length,
        targetSizeOk: audits.filter((audit) => audit.isTargetSize).length,
        clubsWithMissingPositions: audits.filter((audit) => audit.missingPositions.length > 0).length,
        clubsWithThinPositions: audits.filter((audit) => audit.thinPositions.length > 0).length,
      },
    };
  },
};
