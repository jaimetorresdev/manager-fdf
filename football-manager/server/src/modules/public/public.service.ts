import prisma from '../../db/prisma';
import { computeNextTick } from '../game/game.service';
import { competitionKind } from '../matches/matches.routes';
import { isResultSeen } from '../matches/matchEventVisibility';
import { rumorsService } from '../market/rumors.service';
import { clubService } from '../club/club.service';
import { managerService } from '../manager/manager.service';
import { npcCoachService } from '../manager/npcCoach.service';
import { playersService } from '../players/players.service';
import { warmTickZeroCache } from '../../lib/tickZeroCache';
// AUDIT 2.1: comparador CANÓNICO de clasificación (propiedad del Agente C).
// Lo IMPORTAMOS; no se redefine ningún criterio de desempate localmente.
import { sortStandings } from '../game/standings';

// ─── Q25 · helpers ────────────────────────────────────────────────────────────

const ACTIVE_MANAGER_DAYS = 7;

async function activeSeason() {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    include: { season: { select: { id: true, name: true } } },
  });
  return state;
}

function parseTurnHours(raw: string | null | undefined): number[] {
  try {
    const parsed = JSON.parse(raw ?? '[11, 23]');
    if (Array.isArray(parsed) && parsed.every((h) => typeof h === 'number')) return parsed;
  } catch { /* fallback */ }
  return [11, 23];
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const COUNTRY_CONTINENTS: Record<string, string> = {
  argentina: 'Sudamerica',
  austria: 'Europa',
  belgica: 'Europa',
  belgium: 'Europa',
  brasil: 'Sudamerica',
  brazil: 'Sudamerica',
  chile: 'Sudamerica',
  china: 'Asia',
  colombia: 'Sudamerica',
  croacia: 'Europa',
  denmark: 'Europa',
  dinamarca: 'Europa',
  england: 'Europa',
  escocia: 'Europa',
  espana: 'Europa',
  france: 'Europa',
  francia: 'Europa',
  germany: 'Europa',
  grecia: 'Europa',
  holanda: 'Europa',
  inglaterra: 'Europa',
  ireland: 'Europa',
  irlanda: 'Europa',
  italia: 'Europa',
  japon: 'Asia',
  japan: 'Asia',
  mexico: 'Norteamerica',
  noruega: 'Europa',
  paises_bajos: 'Europa',
  portugal: 'Europa',
  rusia: 'Europa',
  scotland: 'Europa',
  spain: 'Europa',
  suecia: 'Europa',
  suiza: 'Europa',
  turquia: 'Europa',
  ukraine: 'Europa',
  uruguay: 'Sudamerica',
  usa: 'Norteamerica',
  estados_unidos: 'Norteamerica',
};

function continentForCountry(country: string): string {
  const key = normalizeKey(country).replace(/\s+/g, '_');
  return COUNTRY_CONTINENTS[key] ?? 'Mundo';
}

function clampTake(value: number | undefined, fallback = 50, max = 100): number {
  if (!Number.isFinite(value ?? NaN)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value!)));
}

async function serializePublicMatches(matches: any[]) {
  if (matches.length === 0) return [];
  const clubIds = [...new Set(matches.flatMap((m) => [m.homeClubId, m.awayClubId]))];
  const humanManagers = await prisma.manager.findMany({
    where: { clubId: { in: clubIds } },
    select: { clubId: true, userId: true },
  });
  const humanUsersByClub = new Map<number, number[]>();
  for (const manager of humanManagers) {
    if (!manager.clubId) continue;
    const list = humanUsersByClub.get(manager.clubId) ?? [];
    list.push(manager.userId);
    humanUsersByClub.set(manager.clubId, list);
  }
  const playedHumanMatches = matches.filter((m) =>
    m.status === 'played'
    && ((humanUsersByClub.get(m.homeClubId)?.length ?? 0) > 0
      || (humanUsersByClub.get(m.awayClubId)?.length ?? 0) > 0));
  const seenRows = playedHumanMatches.length
    ? await prisma.matchSeen.findMany({
        where: { matchId: { in: playedHumanMatches.map((m) => m.id) } },
        select: { matchId: true, userId: true },
      })
    : [];
  const seenByMatch = new Map<number, Set<number>>();
  for (const row of seenRows) {
    const set = seenByMatch.get(row.matchId) ?? new Set<number>();
    set.add(row.userId);
    seenByMatch.set(row.matchId, set);
  }

  return matches.map((m) => {
    const users = [
      ...(humanUsersByClub.get(m.homeClubId) ?? []),
      ...(humanUsersByClub.get(m.awayClubId) ?? []),
    ];
    const seenUsers = seenByMatch.get(m.id) ?? new Set<number>();
    const resultHidden = m.status === 'played'
      && users.some((userId) => !seenUsers.has(userId) && !isResultSeen(m.homeStatsJson, userId));
    return {
      id: m.id,
      status: m.status,
      homeClub: m.homeClub,
      awayClub: m.awayClub,
      competition: m.matchday?.competition
        ? {
            id: m.matchday.competition.id,
            name: m.matchday.competition.name,
            shortName: m.matchday.competition.shortName,
            type: m.matchday.competition.type,
            tier: m.matchday.competition.tier,
          }
        : null,
      competitionKind: competitionKind(m.matchday?.competition),
      matchdayNum: m.matchday?.number ?? null,
      playedAt: m.playedAt,
      homeGoals: resultHidden ? null : m.homeGoals,
      awayGoals: resultHidden ? null : m.awayGoals,
      resultHidden,
      matchCenter: {
        simulationTier: m.simulationTier ?? 'A',
        priorityScore: m.priorityScore ?? 0,
        hasTimeline: m.hasTimeline ?? true,
        hasAdvancedStats: m.hasAdvancedStats ?? true,
      },
    };
  });
}

function summarizeLeagueHumanStatus(input: {
  tableSize: number;
  humanManagersCount: number;
  humanStatus?: string | null;
}) {
  const freeClubs = Math.max(0, input.tableSize - input.humanManagersCount);
  return {
    status: input.humanStatus ?? (freeClubs === 0 ? 'CLOSED' : freeClubs <= 4 ? 'WAITLIST' : 'OPEN'),
    humanManagers: input.humanManagersCount,
    freeClubs,
  };
}

function playerRadar(player: any) {
  const avg = (values: number[]) => Math.round(values.reduce((sum, value) => sum + (Number(value) || 0), 0) / values.length);
  return {
    technical: avg([player.passing, player.dribbling, player.shooting, player.finishing]),
    tactical: avg([player.organization, player.unmarking, player.tackling]),
    physical: avg([player.speed, player.physical, player.fitness, player.muscularFitness]),
    mentality: avg([player.morale, player.mentalSharpness, player.consistency, player.experience]),
  };
}

async function loadWorldLeagueBase(seasonId: number) {
  const leagues = await prisma.competition.findMany({
    where: { seasonId, type: 'league' },
    orderBy: [{ country: 'asc' }, { tier: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      shortName: true,
      country: true,
      tier: true,
      humanStatus: true,
      defaultSimulationTier: true,
      activityScore: true,
      humanManagersCount: true,
      lastHumanLoginAt: true,
      processingShard: true,
    },
  });
  if (leagues.length === 0) return [];

  const standings = await prisma.standing.findMany({
    where: { competitionId: { in: leagues.map((league) => league.id) } },
    select: {
      competitionId: true,
      clubId: true,
      club: { select: { manager: { select: { id: true } } } },
    },
  });
  const byCompetition = new Map<number, typeof standings>();
  for (const row of standings) {
    const list = byCompetition.get(row.competitionId) ?? [];
    list.push(row);
    byCompetition.set(row.competitionId, list);
  }

  return leagues.map((league) => {
    const rows = byCompetition.get(league.id) ?? [];
    const humanManagers = Math.max(
      league.humanManagersCount,
      rows.filter((row) => row.club.manager != null).length,
    );
    const status = summarizeLeagueHumanStatus({
      tableSize: rows.length,
      humanManagersCount: humanManagers,
      humanStatus: league.humanStatus,
    });
    return {
      ...league,
      continent: continentForCountry(league.country),
      clubsCount: rows.length,
      humanManagersCount: humanManagers,
      freeClubsCount: status.freeClubs,
      humanStatus: status.status,
    };
  });
}

// ─── QA2 · reparto de presupuesto por cuartil de liga ────────────────────────
// Ordena las ligas (type='league') de la temporada activa por presupuesto medio
// de club y las parte en 4 cuartiles. Para cada cuartil devuelve el presupuesto
// medio de club entre TODOS los clubes de las ligas de ese cuartil. Q1 = ligas
// más modestas, Q4 = élite. Determinista (orden estable) y sin datos sensibles
// por club (solo agregados). Consumido por `GlobalEconomicDistribution`.
const QUARTILE_LABELS: { quartile: string; label: string; tierLabel: string }[] = [
  { quartile: 'Q1', label: 'Modestas', tierLabel: 'Modestas' },
  { quartile: 'Q2', label: 'Intermedias', tierLabel: 'Intermedias' },
  { quartile: 'Q3', label: 'Fuertes', tierLabel: 'Fuertes' },
  { quartile: 'Q4', label: 'Élite', tierLabel: 'Élite' },
];

// AUDIT 2.1 / manual §6 (desempate H2H): rellena `headToHeadPoints` para los clubes
// EMPATADOS a puntos, calculando una mini-liga con los partidos jugados ENTRE ellos en
// la competición. `sortStandings` (game/standings.ts, propiedad Carril 2) ya usa
// `headToHeadPoints` como 2º criterio tras los puntos; aquí solo se aporta el dato para
// la vista pública. Los clubes sin empate quedan con 0 (no afecta al orden).
async function attachHeadToHead<T extends { points: number; clubId: number; headToHeadPoints?: number }>(
  competitionId: number,
  rows: T[],
): Promise<T[]> {
  const byPoints = new Map<number, T[]>();
  for (const r of rows) {
    const arr = byPoints.get(r.points) ?? [];
    arr.push(r);
    byPoints.set(r.points, arr);
  }
  for (const group of byPoints.values()) {
    if (group.length < 2) {
      for (const r of group) r.headToHeadPoints = 0;
      continue;
    }
    const ids = group.map((r) => r.clubId);
    const matches = await prisma.match.findMany({
      where: {
        status: 'played',
        matchday: { competitionId },
        homeClubId: { in: ids },
        awayClubId: { in: ids },
      },
      select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
    });
    const h2h = new Map<number, number>(ids.map((id) => [id, 0]));
    for (const m of matches) {
      if (m.homeGoals == null || m.awayGoals == null) continue;
      if (m.homeGoals > m.awayGoals) h2h.set(m.homeClubId, (h2h.get(m.homeClubId) ?? 0) + 3);
      else if (m.homeGoals < m.awayGoals) h2h.set(m.awayClubId, (h2h.get(m.awayClubId) ?? 0) + 3);
      else {
        h2h.set(m.homeClubId, (h2h.get(m.homeClubId) ?? 0) + 1);
        h2h.set(m.awayClubId, (h2h.get(m.awayClubId) ?? 0) + 1);
      }
    }
    for (const r of group) r.headToHeadPoints = h2h.get(r.clubId) ?? 0;
  }
  return rows;
}

async function computeBudgetByLeagueQuartile(seasonId: number) {
  const leagues = await prisma.competition.findMany({
    where: { seasonId, type: 'league' },
    select: { id: true },
  });
  if (leagues.length === 0) return [];

  const standings = await prisma.standing.findMany({
    where: { competitionId: { in: leagues.map((l) => l.id) } },
    select: { competitionId: true, club: { select: { budget: true } } },
  });
  if (standings.length === 0) return [];

  // Presupuesto medio por liga (orden estable por id para determinismo).
  const byLeague = new Map<number, { total: number; count: number }>();
  for (const row of standings) {
    const agg = byLeague.get(row.competitionId) ?? { total: 0, count: 0 };
    agg.total += Number(row.club?.budget) || 0;
    agg.count += 1;
    byLeague.set(row.competitionId, agg);
  }
  const leagueAverages = [...byLeague.entries()]
    .map(([competitionId, agg]) => ({
      competitionId,
      avgBudget: agg.count > 0 ? agg.total / agg.count : 0,
      total: agg.total,
      clubCount: agg.count,
    }))
    .sort((a, b) => a.avgBudget - b.avgBudget || a.competitionId - b.competitionId);

  // Reparto en 4 cuartiles contiguos lo más equilibrados posible.
  const n = leagueAverages.length;
  const buckets: (typeof leagueAverages)[] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const q = Math.min(3, Math.floor((i * 4) / n));
    buckets[q].push(leagueAverages[i]);
  }

  return buckets
    .map((bucket, i) => {
      const total = bucket.reduce((sum, l) => sum + l.total, 0);
      const clubCount = bucket.reduce((sum, l) => sum + l.clubCount, 0);
      const meta = QUARTILE_LABELS[i];
      return {
        quartile: meta.quartile,
        label: meta.label,
        tierLabel: meta.tierLabel,
        avgBudget: clubCount > 0 ? Math.round(total / clubCount) : 0,
        leagueCount: bucket.length,
        clubCount,
      };
    })
    .filter((q) => q.clubCount > 0);
}

// ─── Q22 · avatar procedural SVG determinista ────────────────────────────────

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

type CountryMapMeta = { lat: number; lng: number; zoom: number };

const WORLD_COUNTRY_META: Record<string, CountryMapMeta> = {
  argentina: { lat: -34.6, lng: -58.4, zoom: 4 },
  austria: { lat: 47.5, lng: 14.5, zoom: 5 },
  belgica: { lat: 50.8, lng: 4.5, zoom: 6 },
  belgium: { lat: 50.8, lng: 4.5, zoom: 6 },
  brasil: { lat: -15.8, lng: -47.9, zoom: 4 },
  brazil: { lat: -15.8, lng: -47.9, zoom: 4 },
  chile: { lat: -33.4, lng: -70.7, zoom: 4 },
  china: { lat: 35.9, lng: 104.2, zoom: 3 },
  colombia: { lat: 4.7, lng: -74.1, zoom: 5 },
  croacia: { lat: 45.1, lng: 15.2, zoom: 5 },
  denmark: { lat: 56.0, lng: 10.0, zoom: 5 },
  dinamarca: { lat: 56.0, lng: 10.0, zoom: 5 },
  england: { lat: 52.4, lng: -1.6, zoom: 5 },
  escocia: { lat: 56.5, lng: -4.2, zoom: 5 },
  espana: { lat: 40.4, lng: -3.7, zoom: 5 },
  france: { lat: 46.2, lng: 2.2, zoom: 5 },
  francia: { lat: 46.2, lng: 2.2, zoom: 5 },
  germany: { lat: 51.2, lng: 10.4, zoom: 5 },
  grecia: { lat: 39.1, lng: 22.9, zoom: 5 },
  holanda: { lat: 52.1, lng: 5.3, zoom: 6 },
  inglaterra: { lat: 52.4, lng: -1.6, zoom: 5 },
  ireland: { lat: 53.4, lng: -8.2, zoom: 5 },
  irlanda: { lat: 53.4, lng: -8.2, zoom: 5 },
  italia: { lat: 42.8, lng: 12.5, zoom: 5 },
  japon: { lat: 36.2, lng: 138.2, zoom: 4 },
  japan: { lat: 36.2, lng: 138.2, zoom: 4 },
  mexico: { lat: 23.6, lng: -102.5, zoom: 4 },
  noruega: { lat: 60.5, lng: 8.5, zoom: 4 },
  paises_bajos: { lat: 52.1, lng: 5.3, zoom: 6 },
  portugal: { lat: 39.4, lng: -8.2, zoom: 5 },
  rusia: { lat: 55.8, lng: 37.6, zoom: 3 },
  scotland: { lat: 56.5, lng: -4.2, zoom: 5 },
  spain: { lat: 40.4, lng: -3.7, zoom: 5 },
  suecia: { lat: 60.1, lng: 18.6, zoom: 4 },
  suiza: { lat: 46.8, lng: 8.2, zoom: 6 },
  turquia: { lat: 39.0, lng: 35.2, zoom: 5 },
  ukraine: { lat: 49.0, lng: 31.4, zoom: 5 },
  uruguay: { lat: -34.9, lng: -56.2, zoom: 5 },
  usa: { lat: 39.8, lng: -98.6, zoom: 3 },
  estados_unidos: { lat: 39.8, lng: -98.6, zoom: 3 },
};

const CONTINENT_CENTER: Record<string, { lat: number; lng: number }> = {
  Europa: { lat: 49, lng: 12 },
  Sudamerica: { lat: -15, lng: -60 },
  Norteamerica: { lat: 40, lng: -98 },
  Asia: { lat: 34, lng: 95 },
  Mundo: { lat: 20, lng: 0 },
};

function countryMapPoint(country: string, continent?: string, salt = 0): CountryMapMeta {
  const key = normalizeKey(country).replace(/\s+/g, '_');
  const known = WORLD_COUNTRY_META[key];
  if (known) return known;

  const center = CONTINENT_CENTER[continent ?? continentForCountry(country)] ?? CONTINENT_CENTER.Mundo;
  const hash = hashString(`${country}:${salt}`);
  const latOffset = ((hash % 1800) / 100) - 9;
  const lngOffset = ((((hash >> 8) % 3200) / 100) - 16);
  return {
    lat: Math.max(-55, Math.min(70, Math.round((center.lat + latOffset) * 10) / 10)),
    lng: Math.max(-170, Math.min(170, Math.round((center.lng + lngOffset) * 10) / 10)),
    zoom: 4,
  };
}

function worldPulse(input: { freeClubs: number; humanManagers: number; activityScore: number; leagues: number }) {
  if (input.activityScore >= 75 || input.humanManagers >= Math.max(6, input.leagues * 4)) {
    return { tone: 'hot', label: 'Zona caliente', summary: 'Muchas decisiones humanas y partidos con foco.' };
  }
  if (input.freeClubs === 0) {
    return { tone: 'closed', label: 'Liga llena', summary: 'No quedan banquillos libres ahora mismo.' };
  }
  if (input.freeClubs <= Math.max(2, input.leagues)) {
    return { tone: 'watchlist', label: 'Ultimos banquillos', summary: 'Quedan pocas plazas libres para nuevos mánagers.' };
  }
  return { tone: 'open', label: 'Mundo abierto', summary: 'Hay clubes disponibles para empezar partida.' };
}

function leagueStoryState(league: {
  humanStatus: string;
  activityScore: number;
  freeClubsCount: number;
  humanManagersCount: number;
  tier: number;
}) {
  if (league.humanStatus === 'CLOSED') {
    return { tone: 'closed', label: 'Liga completa', summary: 'Todos los banquillos importantes están ocupados.' };
  }
  if (league.activityScore >= 75 || league.humanManagersCount >= 8) {
    return { tone: 'hot', label: 'Alta tensión', summary: 'La liga está llena de actividad humana.' };
  }
  if (league.freeClubsCount <= 3) {
    return { tone: 'watchlist', label: 'Pocas plazas', summary: 'Aún se puede entrar, pero quedan pocos clubes libres.' };
  }
  if (league.tier === 1) {
    return { tone: 'featured', label: 'Primera línea', summary: 'Escaparate principal del país.' };
  }
  return { tone: 'open', label: 'Banquillos abiertos', summary: 'Buen punto de entrada para nuevos mánagers.' };
}

export function proceduralAvatarSvg(seed: string, name: string): string {
  const hash = hashString(seed || name || 'fdf');
  const hue = hash % 360;
  const hue2 = (hue + 40 + (hash % 80)) % 360;
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join('') || 'M';
  // Sin dependencias: gradiente + iniciales. Determinista por seed.
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
    `<stop offset="0%" stop-color="hsl(${hue}, 62%, 42%)"/>`,
    `<stop offset="100%" stop-color="hsl(${hue2}, 70%, 30%)"/>`,
    '</linearGradient></defs>',
    '<rect width="128" height="128" rx="16" fill="url(#g)"/>',
    `<circle cx="${32 + (hash % 64)}" cy="${24 + ((hash >> 3) % 24)}" r="${18 + (hash % 14)}" fill="hsl(${hue2}, 70%, 55%)" opacity="0.25"/>`,
    `<text x="64" y="80" font-family="system-ui, sans-serif" font-size="48" font-weight="700" fill="#fff" text-anchor="middle">${initials}</text>`,
    '</svg>',
  ].join('');
}

export const publicService = {
  async getRanking() {
    // Top 100 managers by prestige
    const topManagers = await prisma.prestige.findMany({
      orderBy: { value: 'desc' },
      take: 100,
      include: {
        manager: {
          select: { name: true, club: { select: { name: true } } }
        }
      }
    });

    // Top 100 clubs by public reputation/fan base only.
    const topClubs = await prisma.club.findMany({
      orderBy: [{ reputation: 'desc' }, { fans: 'desc' }],
      take: 100,
      select: { id: true, name: true, shortName: true, badge: true, reputation: true, fans: true }
    });

    return { topManagers, topClubs };
  },

  async getClubExport(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        country: true,
        stadiumName: true,
        reputation: true,
        fans: true,
        players: {
          select: {
            id: true,
            name: true,
            position: true,
            age: true,
            nationality: true,
            marketValue: true,
            wage: true,
          }
        },
        manager: {
          select: { name: true }
        }
      }
    });

    if (!club) throw new Error('Club no encontrado');
    return club;
  },

  // ─── Q22 · GET /api/public/avatar/:managerId ───────────────────────────────
  async getAvatar(managerId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { avatarImage: true, avatarImageMime: true, avatarSeed: true, name: true },
    });
    if (!manager) return null;
    if (manager.avatarImage && manager.avatarImageMime) {
      return { kind: 'image' as const, mime: manager.avatarImageMime, body: Buffer.from(manager.avatarImage) };
    }
    return {
      kind: 'svg' as const,
      mime: 'image/svg+xml',
      body: proceduralAvatarSvg(manager.avatarSeed ?? `manager-${managerId}`, manager.name),
    };
  },

  // ─── Q25 · GET /api/public/next-tick ───────────────────────────────────────
  async getNextTick() {
    const [state, settings] = await Promise.all([
      prisma.gameState.findFirst({ where: { isActive: true }, select: { nextTickAt: true } }),
      prisma.globalSettings.findFirst({ select: { turnHours: true } }),
    ]);
    const turnHours = parseTurnHours(settings?.turnHours);
    const now = new Date();
    let nextTickAt = state?.nextTickAt ?? null;
    if (!nextTickAt || nextTickAt.getTime() <= now.getTime()) {
      nextTickAt = computeNextTick(now, turnHours);
    }
    return {
      nextTickAt,
      serverTime: now,
      secondsRemaining: Math.max(0, Math.floor((nextTickAt.getTime() - now.getTime()) / 1000)),
      turnHours,
    };
  },

  // ─── Q25 · GET /api/public/stats ───────────────────────────────────────────
  async getPublicStats() {
    const state = await activeSeason();
    const activeSince = new Date(Date.now() - ACTIVE_MANAGER_DAYS * 24 * 60 * 60 * 1000);
    const [activeManagers, humanClubs, totalClubs, budgetByLeagueQuartile] = await Promise.all([
      prisma.user.count({ where: { isBanned: false, lastLoginAt: { gte: activeSince } } }),
      prisma.manager.count({ where: { clubId: { not: null } } }),
      prisma.club.count(),
      state ? computeBudgetByLeagueQuartile(state.seasonId) : Promise.resolve([]),
    ]);
    return {
      activeManagers,
      humanClubs,
      totalClubs,
      // QA2 · reparto por cuartil de liga (Q1 modestas → Q4 élite); [] si no hay temporada/datos.
      budgetByLeagueQuartile,
      season: state
        ? { id: state.season.id, name: state.season.name, seasonWeek: state.seasonWeek }
        : null,
    };
  },

  // ─── Q25 · GET /api/public/standings?league= ───────────────────────────────
  async getPublicStandings(leagueId?: number) {
    const state = await activeSeason();
    if (!state) return { leagues: [] };

    // Incluye ligas Y copas (cup/supercup) por país; cada una con su `type`.
    const PUBLIC_COMP_TYPES = ['league', 'cup', 'supercup'];
    if (!leagueId) {
      const leagues = await prisma.competition.findMany({
        where: { seasonId: state.seasonId, type: { in: PUBLIC_COMP_TYPES } },
        orderBy: [{ country: 'asc' }, { type: 'asc' }, { tier: 'asc' }],
        select: { id: true, name: true, shortName: true, country: true, tier: true, type: true },
      });
      return { leagues };
    }

    const league = await prisma.competition.findFirst({
      where: { id: leagueId, seasonId: state.seasonId, type: { in: PUBLIC_COMP_TYPES } },
      select: { id: true, name: true, shortName: true, country: true, tier: true, type: true },
    });
    if (!league) return null;

    const standings = await prisma.standing.findMany({
      where: { competitionId: league.id },
      include: { club: { select: { id: true, name: true, shortName: true, badge: true } } },
    });
    const sorted = sortStandings(await attachHeadToHead(league.id, standings));

    return {
      league,
      table: sorted.map((row, index) => ({
        pos: index + 1,
        club: row.club,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDiff: row.goalsFor - row.goalsAgainst,
        points: row.points,
      })),
    };
  },

  // ─── Y2 · GET /api/public/world/continents ────────────────────────────────
  async getWorldContinents() {
    const state = await activeSeason();
    if (!state) return { season: null, continents: [] };

    const leagues = await loadWorldLeagueBase(state.seasonId);
    const grouped = new Map<string, {
      continent: string;
      countries: Set<string>;
      leagues: number;
      clubs: number;
      humanManagers: number;
      freeClubs: number;
      activityScore: number;
    }>();
    for (const league of leagues) {
      const row = grouped.get(league.continent) ?? {
        continent: league.continent,
        countries: new Set<string>(),
        leagues: 0,
        clubs: 0,
        humanManagers: 0,
        freeClubs: 0,
        activityScore: 0,
      };
      row.countries.add(league.country);
      row.leagues += 1;
      row.clubs += league.clubsCount;
      row.humanManagers += league.humanManagersCount;
      row.freeClubs += league.freeClubsCount;
      row.activityScore += league.activityScore;
      grouped.set(league.continent, row);
    }

    return {
      season: { id: state.seasonId, name: state.season.name, seasonWeek: state.seasonWeek },
      continents: [...grouped.values()]
        .map((row) => ({
          continent: row.continent,
          countries: row.countries.size,
          leagues: row.leagues,
          clubs: row.clubs,
          humanManagers: row.humanManagers,
          freeClubs: row.freeClubs,
          activityScore: Math.min(100, Math.round(row.activityScore / Math.max(1, row.leagues))),
          href: `/api/public/world/countries?continent=${encodeURIComponent(row.continent)}`,
        }))
        .sort((a, b) => b.leagues - a.leagues || a.continent.localeCompare(b.continent)),
      uiNeed: '// NECESITO: Landing map usa continents[].href para drill-down sin login.',
    };
  },

  // ─── Y5 · GET /api/public/world/map ───────────────────────────────────────
  async getWorldMap(filters: { continent?: string } = {}) {
    const state = await activeSeason();
    if (!state) {
      return {
        season: null,
        projection: { type: 'mercator-lite', center: { lat: 20, lng: 0 }, zoom: 1 },
        countries: [],
        featuredLeagues: [],
        hotMatches: [],
        availableClubs: [],
        ticker: [],
      };
    }

    const requestedContinent = filters.continent ? normalizeKey(filters.continent) : null;
    const leagues = (await loadWorldLeagueBase(state.seasonId))
      .filter((league) => !requestedContinent || normalizeKey(league.continent) === requestedContinent);
    const grouped = new Map<string, {
      country: string;
      continent: string;
      leagues: number;
      clubs: number;
      humanManagers: number;
      freeClubs: number;
      topTier: number;
      activityScore: number;
      leagueSummaries: Array<{
        id: number;
        name: string;
        shortName: string;
        tier: number;
        status: string;
        activityScore: number;
        freeClubs: number;
        humanManagers: number;
      }>;
    }>();

    for (const league of leagues) {
      const row = grouped.get(league.country) ?? {
        country: league.country,
        continent: league.continent,
        leagues: 0,
        clubs: 0,
        humanManagers: 0,
        freeClubs: 0,
        topTier: league.tier,
        activityScore: 0,
        leagueSummaries: [],
      };
      row.leagues += 1;
      row.clubs += league.clubsCount;
      row.humanManagers += league.humanManagersCount;
      row.freeClubs += league.freeClubsCount;
      row.topTier = Math.min(row.topTier, league.tier);
      row.activityScore += league.activityScore;
      row.leagueSummaries.push({
        id: league.id,
        name: league.name,
        shortName: league.shortName,
        tier: league.tier,
        status: league.humanStatus,
        activityScore: league.activityScore,
        freeClubs: league.freeClubsCount,
        humanManagers: league.humanManagersCount,
      });
      grouped.set(league.country, row);
    }

    const countries = [...grouped.values()]
      .map((row, index) => {
        const activityScore = Math.min(100, Math.round(row.activityScore / Math.max(1, row.leagues)));
        const pulse = worldPulse({
          freeClubs: row.freeClubs,
          humanManagers: row.humanManagers,
          activityScore,
          leagues: row.leagues,
        });
        const point = countryMapPoint(row.country, row.continent, index);
        const status = row.freeClubs === 0 ? 'CLOSED' : row.freeClubs <= 4 ? 'WAITLIST' : 'OPEN';
        const featuredLeague = [...row.leagueSummaries]
          .sort((a, b) => a.tier - b.tier || b.activityScore - a.activityScore || a.id - b.id)[0] ?? null;
        return {
          country: row.country,
          continent: row.continent,
          coords: { lat: point.lat, lng: point.lng, zoom: point.zoom },
          status,
          pulse,
          leagues: row.leagues,
          clubs: row.clubs,
          humanManagers: row.humanManagers,
          freeClubs: row.freeClubs,
          topTier: row.topTier,
          activityScore,
          featuredLeague,
          href: `/api/public/world/leagues?country=${encodeURIComponent(row.country)}`,
        };
      })
      .sort((a, b) => b.activityScore - a.activityScore || a.country.localeCompare(b.country));

    const [featuredMatches, availableClubs, tickerPayload] = await Promise.all([
      this.getFeaturedMatches(),
      this.getAvailableWorldClubs({ take: 8 }),
      this.getTicker(),
    ]);
    const hotMatches = [...featuredMatches.upcoming, ...featuredMatches.recent]
      .slice(0, 10)
      .map((match) => ({
        ...match,
        route: `/matches/${match.id}`,
      }));

    return {
      season: { id: state.seasonId, name: state.season.name, seasonWeek: state.seasonWeek },
      projection: {
        type: 'mercator-lite',
        center: requestedContinent && countries[0] ? countries[0].coords : { lat: 20, lng: 0 },
        zoom: requestedContinent ? 2.5 : 1,
      },
      filters: { continent: filters.continent ?? null },
      totals: {
        countries: countries.length,
        leagues: leagues.length,
        clubs: leagues.reduce((sum, league) => sum + league.clubsCount, 0),
        humanManagers: leagues.reduce((sum, league) => sum + league.humanManagersCount, 0),
        freeClubs: leagues.reduce((sum, league) => sum + league.freeClubsCount, 0),
      },
      countries,
      featuredLeagues: [...leagues]
        .sort((a, b) => b.activityScore - a.activityScore || b.humanManagersCount - a.humanManagersCount || a.tier - b.tier || a.id - b.id)
        .slice(0, 12)
        .map((league) => ({
          id: league.id,
          name: league.name,
          shortName: league.shortName,
          country: league.country,
          continent: league.continent,
          tier: league.tier,
          status: league.humanStatus,
          activityScore: league.activityScore,
          humanManagers: league.humanManagersCount,
          freeClubs: league.freeClubsCount,
          coords: countryMapPoint(league.country, league.continent, league.id),
          storyState: leagueStoryState(league),
          href: `/api/public/world/leagues/${league.id}`,
        })),
      hotMatches,
      availableClubs: availableClubs.clubs,
      ticker: tickerPayload.items.slice(0, 6),
      uiNeed: '// NECESITO: Landing pública debe pintar mapa clicable con countries[].coords, pulse, featuredLeagues, hotMatches y availableClubs sin login.',
    };
  },

  // ─── Y2 · GET /api/public/world/countries ─────────────────────────────────
  async getWorldCountries(filters: { continent?: string }) {
    const state = await activeSeason();
    if (!state) return { season: null, countries: [] };

    const requestedContinent = filters.continent ? normalizeKey(filters.continent) : null;
    const leagues = (await loadWorldLeagueBase(state.seasonId))
      .filter((league) => !requestedContinent || normalizeKey(league.continent) === requestedContinent);
    const grouped = new Map<string, {
      country: string;
      continent: string;
      leagues: number;
      clubs: number;
      humanManagers: number;
      freeClubs: number;
      topTier: number;
      activityScore: number;
    }>();
    for (const league of leagues) {
      const row = grouped.get(league.country) ?? {
        country: league.country,
        continent: league.continent,
        leagues: 0,
        clubs: 0,
        humanManagers: 0,
        freeClubs: 0,
        topTier: league.tier,
        activityScore: 0,
      };
      row.leagues += 1;
      row.clubs += league.clubsCount;
      row.humanManagers += league.humanManagersCount;
      row.freeClubs += league.freeClubsCount;
      row.topTier = Math.min(row.topTier, league.tier);
      row.activityScore += league.activityScore;
      grouped.set(league.country, row);
    }

    return {
      season: { id: state.seasonId, name: state.season.name, seasonWeek: state.seasonWeek },
      countries: [...grouped.values()]
        .map((row, index) => {
          const activityScore = Math.min(100, Math.round(row.activityScore / Math.max(1, row.leagues)));
          const point = countryMapPoint(row.country, row.continent, index);
          const status = row.freeClubs === 0 ? 'CLOSED' : row.freeClubs <= 4 ? 'WAITLIST' : 'OPEN';
          return {
            ...row,
            coords: { lat: point.lat, lng: point.lng, zoom: point.zoom },
            activityScore,
            status,
            pulse: worldPulse({ freeClubs: row.freeClubs, humanManagers: row.humanManagers, activityScore, leagues: row.leagues }),
            href: `/api/public/world/leagues?country=${encodeURIComponent(row.country)}`,
          };
        })
        .sort((a, b) => b.activityScore - a.activityScore || a.country.localeCompare(b.country)),
      uiNeed: '// NECESITO: El mapa debe poder pintar paises con status y activityScore.',
    };
  },

  // ─── Y2 · GET /api/public/world/leagues ───────────────────────────────────
  async getWorldLeagues(filters: {
    continent?: string;
    country?: string;
    status?: string;
    take?: number;
    cursor?: number;
  }) {
    const state = await activeSeason();
    if (!state) return { season: null, leagues: [], pagination: { nextCursor: null, hasMore: false } };

    const take = clampTake(filters.take, 50, 100);
    const continent = filters.continent ? normalizeKey(filters.continent) : null;
    const country = filters.country ? normalizeKey(filters.country) : null;
    const status = filters.status ? normalizeKey(filters.status) : null;
    const filtered = (await loadWorldLeagueBase(state.seasonId))
      .filter((league) => !filters.cursor || league.id > filters.cursor)
      .filter((league) => !continent || normalizeKey(league.continent) === continent)
      .filter((league) => !country || normalizeKey(league.country) === country)
      .filter((league) => !status || normalizeKey(league.humanStatus) === status)
      .sort((a, b) => a.country.localeCompare(b.country) || a.tier - b.tier || a.id - b.id);
    const page = filtered.slice(0, take);

    return {
      season: { id: state.seasonId, name: state.season.name, seasonWeek: state.seasonWeek },
      leagues: page.map((league) => ({
        id: league.id,
        name: league.name,
        shortName: league.shortName,
        country: league.country,
        continent: league.continent,
        tier: league.tier,
        status: league.humanStatus,
        defaultSimulationTier: league.defaultSimulationTier,
        activityScore: league.activityScore,
        clubsCount: league.clubsCount,
        humanManagers: league.humanManagersCount,
        freeClubs: league.freeClubsCount,
        coords: countryMapPoint(league.country, league.continent, league.id),
        storyState: leagueStoryState(league),
        lastHumanLoginAt: league.lastHumanLoginAt,
        processingShard: league.processingShard,
        href: `/api/public/world/leagues/${league.id}`,
      })),
      pagination: {
        take,
        cursor: filters.cursor ?? null,
        nextCursor: filtered.length > take ? page[page.length - 1]?.id ?? null : null,
        hasMore: filtered.length > take,
      },
    };
  },

  // ─── Y2 · GET /api/public/world/leagues/:id ───────────────────────────────
  async getWorldLeague(leagueId: number) {
    const state = await activeSeason();
    if (!state) return null;

    const league = await prisma.competition.findFirst({
      where: { id: leagueId, seasonId: state.seasonId, type: 'league' },
      select: {
        id: true,
        name: true,
        shortName: true,
        country: true,
        tier: true,
        humanStatus: true,
        defaultSimulationTier: true,
        activityScore: true,
        humanManagersCount: true,
        lastHumanLoginAt: true,
        processingShard: true,
      },
    });
    if (!league) return null;

    const [standings, recentMatches, upcomingMatches] = await Promise.all([
      prisma.standing.findMany({
        where: { competitionId: league.id },
        include: {
          club: {
            select: {
              id: true,
              name: true,
              shortName: true,
              badge: true,
              city: true,
              country: true,
              // AUDIT 3.2: `budget` (economía privada) NO se expone en endpoints
              // públicos sin auth. Se elimina del select; el cálculo de NPC coach
              // (resolveManyForClubs) hace su propia query con budget si lo necesita.
              reputation: true,
              manager: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.match.findMany({
        where: { status: 'played', matchday: { competitionId: league.id } },
        orderBy: { id: 'desc' },
        take: 8,
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
          matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
        },
      }),
      prisma.match.findMany({
        where: { status: 'scheduled', matchday: { competitionId: league.id } },
        orderBy: { id: 'asc' },
        take: 8,
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
          matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
        },
      }),
    ]);
    const sorted = sortStandings(await attachHeadToHead(league.id, standings));
    const status = summarizeLeagueHumanStatus({
      tableSize: standings.length,
      humanManagersCount: Math.max(league.humanManagersCount, standings.filter((row) => row.club.manager != null).length),
      humanStatus: league.humanStatus,
    });

    return {
      league: {
        ...league,
        continent: continentForCountry(league.country),
        status: status.status,
        humanManagers: status.humanManagers,
        freeClubs: status.freeClubs,
        coords: countryMapPoint(league.country, continentForCountry(league.country), league.id),
        storyState: leagueStoryState({
          ...league,
          humanStatus: status.status,
          humanManagersCount: status.humanManagers,
          freeClubsCount: status.freeClubs,
        }),
      },
      table: await (async () => {
        const coachMap = await npcCoachService.resolveManyForClubs(sorted.map((row) => row.club));
        return sorted.map((row, index) => ({
          pos: index + 1,
          club: {
            ...row.club,
            npcCoach: coachMap.get(row.club.id) ?? null,
          },
          played: row.played,
          won: row.won,
          drawn: row.drawn,
          lost: row.lost,
          goalsFor: row.goalsFor,
          goalsAgainst: row.goalsAgainst,
          goalDiff: row.goalsFor - row.goalsAgainst,
          points: row.points,
        }));
      })(),
      matches: {
        recent: await serializePublicMatches(recentMatches),
        upcoming: await serializePublicMatches(upcomingMatches),
      },
      links: {
        availableClubs: `/api/public/world/clubs/available?league=${league.id}`,
        standings: `/api/public/standings?league=${league.id}`,
      },
      uiNeed: '// NECESITO: Landing/LeaguePage debe usar table + matches + links.availableClubs sin login.',
    };
  },

  // ─── Y2/Y3 · GET /api/public/world/clubs/available ────────────────────────
  async getAvailableWorldClubs(filters: { league?: number; country?: string; take?: number }) {
    const state = await activeSeason();
    if (!state) return { clubs: [], pagination: { take: 0 } };
    const take = clampTake(filters.take, 24, 50);
    const competitionFilter = filters.league
      ? { competitionId: filters.league }
      : filters.country
        ? { competition: { seasonId: state.seasonId, type: 'league', country: filters.country } }
        : { competition: { seasonId: state.seasonId, type: 'league' } };
    const rows = await prisma.standing.findMany({
      where: {
        ...competitionFilter,
        club: { manager: null, isUserClub: false },
      },
      take,
      orderBy: [{ club: { reputation: 'asc' } }, { clubId: 'asc' }],
      include: {
        competition: { select: { id: true, name: true, shortName: true, country: true, tier: true } },
        club: {
          select: {
            id: true,
            name: true,
            shortName: true,
            badge: true,
            city: true,
            country: true,
            stadiumName: true,
            stadiumCapacity: true,
            reputation: true,
            fans: true,
            primaryColor: true,
            secondaryColor: true,
          },
        },
      },
    });

    const coachMap = await npcCoachService.resolveManyForClubs(rows.map((row) => row.club));

    return {
      clubs: rows.map((row) => ({
        ...row.club,
        league: row.competition,
        npcCoach: coachMap.get(row.club.id) ?? null,
        onboarding: {
          canChoose: true,
          chooseEndpoint: '/api/onboarding/choose-club',
          requiredFields: ['clubId', 'nationality', 'personality'],
        },
      })),
      pagination: { take, returned: rows.length },
    };
  },

  async getPublicNpcCoach(npcCoachId: string) {
    return npcCoachService.getPublicProfile(npcCoachId);
  },

  // ─── Y3 · GET /api/public/world/clubs/:id ─────────────────────────────────
  async getWorldClub(clubId: number) {
    const [club, active] = await Promise.all([
      clubService.getPublicClub(clubId) as Promise<any>,
      activeSeason(),
    ]);
    const [leagueRow, manager, stars, rivalries] = await Promise.all([
      active
        ? prisma.standing.findFirst({
            where: { clubId, competition: { seasonId: active.seasonId, type: 'league' } },
            include: { competition: { select: { id: true, name: true, shortName: true, country: true, tier: true } } },
            orderBy: { competition: { tier: 'asc' } },
          })
        : null,
      prisma.manager.findFirst({
        where: { clubId },
        select: { id: true, name: true, nationality: true, personality: true, level: true, reputation: true, prestige: true },
      }),
      prisma.player.findMany({
        where: { clubId },
        orderBy: [{ marketValue: 'desc' }, { age: 'asc' }],
        take: 5,
        select: {
          id: true,
          name: true,
          position: true,
          detailedPosition: true,
          nationality: true,
          flag: true,
          age: true,
          marketValue: true,
          morale: true,
          fitness: true,
          passing: true,
          tackling: true,
          shooting: true,
          organization: true,
          unmarking: true,
          finishing: true,
          dribbling: true,
          goalkeeping: true,
        },
      }),
      prisma.rivalry.findMany({
        where: { OR: [{ clubAId: clubId }, { clubBId: clubId }] },
        include: {
          clubA: { select: { id: true, name: true, shortName: true, badge: true } },
          clubB: { select: { id: true, name: true, shortName: true, badge: true } },
        },
        take: 6,
      }),
    ]);
    // AUDIT 3.2: la vista pública NUNCA expone economía privada. Se omiten
    // budget/cash/fixedAssets sin destructurar variables muertas (lint-clean).
    const safeClub: Record<string, unknown> = { ...club };
    delete safeClub.budget;
    delete safeClub.cash;
    delete safeClub.fixedAssets;

    return {
      ...safeClub,
      identity: {
        badge: club.badge,
        colors: { primary: club.primaryColor, secondary: club.secondaryColor },
        city: club.city,
        country: club.country,
        stadiumName: club.stadiumName,
      },
      league: leagueRow?.competition ?? null,
      manager,
      npcCoach: manager ? null : await npcCoachService.ensureForClub({
        id: club.id,
        name: club.name,
        shortName: club.shortName,
        city: club.city,
        country: club.country,
        reputation: club.reputation,
        budget: club.budget,
      }),
      stars: stars.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.detailedPosition ?? player.position,
        nationality: player.nationality,
        flag: player.flag,
        age: player.age,
        marketValue: player.marketValue,
        form: { fitness: player.fitness, morale: player.morale },
        radar: playerRadar(player),
      })),
      rivalries: rivalries.map((rivalry) => ({
        id: rivalry.id,
        name: rivalry.name,
        intensity: rivalry.intensity,
        rival: rivalry.clubAId === clubId ? rivalry.clubB : rivalry.clubA,
      })),
      uiNeed: '// NECESITO: Club ficha premium con identidad, estadio, estrellas, rivalidades y manager link.',
    };
  },

  // ─── Y3 · GET /api/public/player/:id ──────────────────────────────────────
  async getPublicPlayerFicha(playerId: number) {
    const player = await playersService.getPlayerPublic(playerId) as any;
    const ratings = (player.matchStats ?? [])
      .map((stat: any) => Number(stat.rating) || 0)
      .filter((rating: number) => rating > 0);
    return {
      ...player,
      visualProfile: {
        headline: `${player.name} - ${player.detailedPosition ?? player.position}`,
        nationality: player.nationality,
        flag: player.flag,
        status: player.availability?.statusText ?? 'Disponible',
        club: player.club ?? null,
      },
      form: {
        fitness: player.fitness,
        morale: player.morale,
        rhythm: player.matchRhythm,
        lastRatings: ratings.slice(-5),
        averageLastFive: ratings.length
          ? Math.round((ratings.slice(-5).reduce((sum: number, rating: number) => sum + rating, 0) / Math.min(5, ratings.length)) * 10) / 10
          : null,
      },
      radar: playerRadar(player),
      uiNeed: '// NECESITO: PlayerPage/visor 3D debe consumir visualProfile, form y radar.',
    };
  },

  // ─── Y3 · GET /api/public/manager/:id ─────────────────────────────────────
  async getPublicManagerFicha(managerId: number) {
    const manager = await managerService.getPublicManager(managerId) as any;
    return {
      ...manager,
      avatarUrl: `/api/public/avatar/${manager.managerId}`,
      visualProfile: {
        headline: manager.club ? `${manager.name} (${manager.club.shortName})` : manager.name,
        nationality: manager.nationality,
        style: manager.personality,
        mentality: manager.mentality,
        level: manager.level,
      },
      links: {
        club: manager.club ? `/api/public/world/clubs/${manager.club.id}` : null,
        dm: manager.dm,
      },
      uiNeed: '// NECESITO: ManagerPage publica con avatar, club, logros, estilo y CTA de DM si hay login.',
    };
  },

  // ─── Q25 · GET /api/public/matches/featured ────────────────────────────────
  // Interés por reglas: clubes humanos > derbi (Rivalry) > duelo de cabeza
  // (ambos top-5 de su liga) > tier. E15 respetado: si un mánager humano
  // implicado no vio su resultado, los goles van ocultos también en público.
  async getFeaturedMatches() {
    const state = await activeSeason();
    if (!state) return { upcoming: [], recent: [] };

    const matchInclude = {
      homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
      awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
      matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
    } as const;
    const seasonFilter = { matchday: { competition: { seasonId: state.seasonId } } };

    const [upcomingPool, recentPool, humanManagers, rivalries, leagueStandings] = await Promise.all([
      prisma.match.findMany({
        where: { status: 'scheduled', ...seasonFilter },
        orderBy: { id: 'asc' },
        take: 200,
        include: matchInclude,
      }),
      prisma.match.findMany({
        where: { status: 'played', ...seasonFilter },
        orderBy: { id: 'desc' },
        take: 200,
        include: matchInclude,
      }),
      prisma.manager.findMany({
        where: { clubId: { not: null } },
        select: { clubId: true, userId: true },
      }),
      prisma.rivalry.findMany({ select: { clubAId: true, clubBId: true } }),
      prisma.standing.findMany({
        where: { competition: { seasonId: state.seasonId, type: 'league' } },
        select: { competitionId: true, clubId: true, points: true, goalsFor: true, goalsAgainst: true },
      }),
    ]);

    const humanClubIds = new Set(humanManagers.map((m) => m.clubId as number));
    const humanUsersByClub = new Map<number, number[]>();
    for (const m of humanManagers) {
      const list = humanUsersByClub.get(m.clubId as number) ?? [];
      list.push(m.userId);
      humanUsersByClub.set(m.clubId as number, list);
    }
    const rivalryKeys = new Set(rivalries.map((r) => `${Math.min(r.clubAId, r.clubBId)}-${Math.max(r.clubAId, r.clubBId)}`));

    // posición por club en su liga (para "duelo de cabeza")
    const byCompetition = new Map<number, typeof leagueStandings>();
    for (const row of leagueStandings) {
      const list = byCompetition.get(row.competitionId) ?? [];
      list.push(row);
      byCompetition.set(row.competitionId, list);
    }
    const topFive = new Set<string>();
    for (const [competitionId, rows] of byCompetition) {
      sortStandings(rows)
        .slice(0, 5)
        .forEach((row) => topFive.add(`${competitionId}:${row.clubId}`));
    }

    type PoolMatch = (typeof upcomingPool)[number];
    const score = (m: PoolMatch): { score: number; interest: string[] } => {
      const interest: string[] = [];
      let total = 0;
      if (humanClubIds.has(m.homeClubId)) { total += 50; }
      if (humanClubIds.has(m.awayClubId)) { total += 50; }
      if (humanClubIds.has(m.homeClubId) || humanClubIds.has(m.awayClubId)) interest.push('humano');
      const pairKey = `${Math.min(m.homeClubId, m.awayClubId)}-${Math.max(m.homeClubId, m.awayClubId)}`;
      if (rivalryKeys.has(pairKey)) { total += 30; interest.push('derbi'); }
      const competitionId = m.matchday?.competition?.id;
      if (competitionId
        && topFive.has(`${competitionId}:${m.homeClubId}`)
        && topFive.has(`${competitionId}:${m.awayClubId}`)) {
        total += 20;
        interest.push('cabeza');
      }
      const tier = m.matchday?.competition?.tier ?? 2;
      total += Math.max(0, (3 - tier) * 5);
      return { score: total, interest };
    };

    const pick = (pool: PoolMatch[]) => pool
      .map((m) => ({ m, ...score(m) }))
      .sort((a, b) => b.score - a.score || b.m.id - a.m.id)
      .slice(0, 6);

    const seenCache = new Map<number, boolean>();
    const isHiddenForHumans = async (m: PoolMatch): Promise<boolean> => {
      if (m.status !== 'played') return false;
      const users = [
        ...(humanUsersByClub.get(m.homeClubId) ?? []),
        ...(humanUsersByClub.get(m.awayClubId) ?? []),
      ];
      if (users.length === 0) return false;
      if (seenCache.has(m.id)) return seenCache.get(m.id)!;
      const seenRows = await prisma.matchSeen.findMany({
        where: { matchId: m.id, userId: { in: users } },
        select: { userId: true },
      });
      const seenUserIds = new Set(seenRows.map((row) => row.userId));
      const hidden = users.some((userId) => !seenUserIds.has(userId) && !isResultSeen(m.homeStatsJson, userId));
      seenCache.set(m.id, hidden);
      return hidden;
    };

    const toPayload = async (entry: { m: PoolMatch; interest: string[] }) => {
      const { m, interest } = entry;
      const hidden = await isHiddenForHumans(m);
      return {
        id: m.id,
        status: m.status,
        homeClub: m.homeClub,
        awayClub: m.awayClub,
        competition: m.matchday?.competition
          ? { id: m.matchday.competition.id, name: m.matchday.competition.name, shortName: m.matchday.competition.shortName }
          : null,
        competitionKind: competitionKind(m.matchday?.competition),
        matchdayNum: m.matchday?.number ?? null,
        playedAt: m.playedAt,
        homeGoals: hidden ? null : m.homeGoals,
        awayGoals: hidden ? null : m.awayGoals,
        resultHidden: hidden,
        interest,
        matchCenter: {
          simulationTier: m.simulationTier ?? 'A',
          priorityScore: m.priorityScore ?? 0,
          hasTimeline: m.hasTimeline ?? true,
          hasAdvancedStats: m.hasAdvancedStats ?? true,
        },
      };
    };

    return {
      upcoming: await Promise.all(pick(upcomingPool).map(toPayload)),
      recent: await Promise.all(pick(recentPool).map(toPayload)),
    };
  },

  // ─── QW-1 · GET /api/public/ticker ─────────────────────────────────────────
  // «Última hora FDF»: 10-15 items cortos del MUNDO. DETERMINISTA entre ticks:
  // orden fijo por categoría y recencia (ids desc), cero aleatoriedad fuera del
  // rumorómetro (ya determinista por semana). E15: nunca un resultado oculto.
  async getTicker() {
    type TickerItem = { id: string; icon: string; text: string; route?: string };
    const items: TickerItem[] = [];

    const fmtAmount = (amount: number): string => amount >= 1_000_000
      ? `~${Math.round(amount / 1_000_000)}M`
      : `~${Math.round(amount / 1000)}K`;

    const [transfers, featured, clubRecords, playerRecords, rumorsPayload] = await Promise.all([
      // ✍️ Fichajes cerrados recientes (fromClub = comprador, toClub = vendedor)
      prisma.transferOffer.findMany({
        where: { status: { in: ['accepted', 'accepted_pending_window'] } },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: {
          id: true,
          amount: true,
          player: { select: { id: true, name: true } },
          fromClub: { select: { shortName: true } },
          toClub: { select: { shortName: true } },
        },
      }),
      // ⚽ Resultados destacados (reusa el scoring de matches/featured, E15 incluido)
      this.getFeaturedMatches(),
      // 📜 Récords nuevos
      prisma.clubRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
        include: { club: { select: { shortName: true } } },
      }),
      prisma.playerRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: { player: { select: { id: true, name: true } } },
      }),
      // 🗞️ Rumorómetro (QW-8, determinista por semana)
      rumorsService.getRumors().catch(() => ({ weekKey: '', rumors: [] })),
    ]);

    for (const t of transfers) {
      items.push({
        id: `tk-transfer-${t.id}`,
        icon: '✍️',
        text: `FICHAJE: el ${t.fromClub.shortName} cierra la llegada de ${t.player.name} procedente del ${t.toClub?.shortName ?? 'mercado'} (${fmtAmount(t.amount)}).`,
        route: `/player/${t.player.id}`,
      });
    }

    for (const m of featured.recent.filter((r) => !r.resultHidden && r.homeGoals != null).slice(0, 4)) {
      const comp = m.competition ? `${m.competition.name}${m.matchdayNum ? `, J${m.matchdayNum}` : ''}` : 'Amistoso';
      items.push({
        id: `tk-result-${m.id}`,
        icon: '⚽',
        text: `${m.homeClub.shortName} ${m.homeGoals}-${m.awayGoals} ${m.awayClub.shortName} (${comp}).`,
        route: `/matches/${m.id}`,
      });
    }

    // 👑 Cambio de líder en ligas tier 1: líder actual vs líder REBOBINANDO la
    // última jornada simulada (mismo truco que while-away: restar sus partidos).
    const state = await activeSeason();
    if (state) {
      const tierOneLeagues = await prisma.competition.findMany({
        where: { seasonId: state.seasonId, type: 'league', tier: 1 },
        orderBy: { id: 'asc' },
        select: { id: true, name: true },
      });
      for (const league of tierOneLeagues) {
        if (items.filter((i) => i.id.startsWith('tk-leader-')).length >= 2) break;
        const lastMatchday = await prisma.matchday.findFirst({
          where: { competitionId: league.id, status: 'simulated' },
          orderBy: { number: 'desc' },
          select: { id: true },
        });
        if (!lastMatchday) continue;
        const [table, lastMatches] = await Promise.all([
          prisma.standing.findMany({
            where: { competitionId: league.id },
            select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
          }),
          prisma.match.findMany({
            where: { matchdayId: lastMatchday.id, status: 'played' },
            select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
          }),
        ]);
        if (table.length === 0 || lastMatches.length === 0) continue;
        const leaderNow = sortStandings(table)[0]?.clubId;
        const rewound = table.map((row) => ({ ...row }));
        const byId = new Map(rewound.map((row) => [row.clubId, row]));
        for (const m of lastMatches) {
          const home = byId.get(m.homeClubId);
          const away = byId.get(m.awayClubId);
          const hg = m.homeGoals ?? 0;
          const ag = m.awayGoals ?? 0;
          if (home) { home.goalsFor -= hg; home.goalsAgainst -= ag; home.points -= hg > ag ? 3 : hg === ag ? 1 : 0; }
          if (away) { away.goalsFor -= ag; away.goalsAgainst -= hg; away.points -= ag > hg ? 3 : hg === ag ? 1 : 0; }
        }
        const leaderBefore = sortStandings(rewound)[0]?.clubId;
        if (leaderNow && leaderBefore && leaderNow !== leaderBefore) {
          const club = await prisma.club.findUnique({ where: { id: leaderNow }, select: { shortName: true } });
          if (club) {
            items.push({
              id: `tk-leader-${league.id}`,
              icon: '👑',
              text: `El ${club.shortName} es el nuevo líder de ${league.name}.`,
              route: '/league',
            });
          }
        }
      }
    }

    for (const r of clubRecords) {
      items.push({
        id: `tk-record-c${r.id}`,
        icon: '📜',
        text: `Récord: ${r.description ?? `${r.recordType} del ${r.club.shortName}`}.`,
        route: '/awards',
      });
    }
    for (const r of playerRecords) {
      items.push({
        id: `tk-record-p${r.id}`,
        icon: '📜',
        text: `Récord: ${r.description ?? `${r.recordType} de ${r.player.name}`}.`,
        route: '/awards',
      });
    }

    // 🗞️ Rumor del día: top confidence del rumorómetro, SIN exponer confidence.
    const topRumor = [...rumorsPayload.rumors]
      .sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0];
    if (topRumor) {
      items.push({
        id: `tk-rumor-${topRumor.id}`,
        icon: '🗞️',
        text: `Rumor del día: ${topRumor.headline}`,
        route: '/market',
      });
    }

    return { items: items.slice(0, 15) };
  },
};

export async function warmPublicWorldTickZeroCache() {
  return warmTickZeroCache([
    { namespace: 'public:stats', params: {}, producer: () => publicService.getPublicStats() },
    { namespace: 'public:matches:featured', params: {}, producer: () => publicService.getFeaturedMatches() },
    { namespace: 'public:ticker', params: {}, producer: () => publicService.getTicker() },
    { namespace: 'market:rumors', params: {}, producer: () => rumorsService.getRumors() },
    { namespace: 'public:world:continents', params: {}, producer: () => publicService.getWorldContinents() },
    { namespace: 'public:world:map', params: { continent: null }, producer: () => publicService.getWorldMap({ continent: undefined }) },
    { namespace: 'public:world:countries', params: { continent: null }, producer: () => publicService.getWorldCountries({ continent: undefined }) },
    { namespace: 'public:world:leagues', params: { take: undefined, cursor: undefined }, producer: () => publicService.getWorldLeagues({}) },
  ]);
}
