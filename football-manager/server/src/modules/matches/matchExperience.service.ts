// ─── Punto 0 (11 jun 2026) · Soporte backend al Día de partido (Q3+Q27/V4-3) ─
// Previa cinematográfica (GET /api/matches/:id/preview) y análisis post-partido
// (campo aditivo `analysis` en GET /api/matches/public/:id). TODO derivado de
// datos existentes: cero cambios en engine/ (pytest intacto por construcción).
import prisma from '../../db/prisma';
import { memoryService } from '../memory/memory.service';
import { sortStandings, withHeadToHeadPoints } from '../game/standings';

const CLUB_SELECT = { id: true, name: true, shortName: true, badge: true } as const;

// ─── Helpers comunes ──────────────────────────────────────────────────────────

type FormEntry = { matchId: number; result: 'W' | 'D' | 'L'; score: string; rivalShortName: string; home: boolean };

async function recentForm(clubId: number, beforeMatchId: number, take = 5): Promise<FormEntry[]> {
  const matches = await prisma.match.findMany({
    where: {
      status: 'played',
      id: { lt: beforeMatchId },
      OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
    },
    orderBy: { id: 'desc' },
    take,
    include: {
      homeClub: { select: { shortName: true } },
      awayClub: { select: { shortName: true } },
    },
  });
  return matches.map((m) => {
    const home = m.homeClubId === clubId;
    const mine = home ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
    const theirs = home ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
    return {
      matchId: m.id,
      result: mine > theirs ? 'W' as const : mine === theirs ? 'D' as const : 'L' as const,
      score: `${m.homeGoals ?? 0}-${m.awayGoals ?? 0}`,
      rivalShortName: home ? m.awayClub.shortName : m.homeClub.shortName,
      home,
    };
  });
}

/** Jugador clave: mejor rating medio de la temporada activa (≥3 partidos); fallback al mayor valor de mercado. */
async function keyPlayer(clubId: number) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true } });
  if (state) {
    const top = await prisma.playerSeasonStat.findFirst({
      where: {
        seasonId: state.seasonId,
        matchesPlayed: { gte: 3 },
        player: { clubId },
      },
      orderBy: { averageRating: 'desc' },
      include: { player: { select: { id: true, name: true, position: true } } },
    });
    if (top && top.averageRating > 0) {
      return {
        playerId: top.player.id,
        name: top.player.name,
        position: top.player.position,
        avgRating: Math.round(top.averageRating * 10) / 10,
        goals: top.goals,
        basis: 'rating' as const,
      };
    }
  }
  const fallback = await prisma.player.findFirst({
    where: { clubId },
    orderBy: { marketValue: 'desc' },
    select: { id: true, name: true, position: true, marketValue: true },
  });
  return fallback
    ? { playerId: fallback.id, name: fallback.name, position: fallback.position, avgRating: null, goals: null, basis: 'value' as const }
    : null;
}

async function leaguePositions(homeClubId: number, awayClubId: number) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true } });
  if (!state) return { home: null, away: null, sameLeague: false, pointsGap: null };
  const standings = await prisma.standing.findMany({
    where: {
      competition: { seasonId: state.seasonId, type: 'league' },
      clubId: { in: [homeClubId, awayClubId] },
    },
    select: { competitionId: true, clubId: true, points: true },
  });
  const result = { home: null as number | null, away: null as number | null, sameLeague: false, pointsGap: null as number | null };
  const byClub = new Map(standings.map((s) => [s.clubId, s]));
  const home = byClub.get(homeClubId);
  const away = byClub.get(awayClubId);
  if (home) {
    const [table, matches] = await Promise.all([
      prisma.standing.findMany({
        where: { competitionId: home.competitionId },
        select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
      }),
      prisma.match.findMany({
        where: { matchday: { competitionId: home.competitionId }, status: 'played' },
        select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true, status: true },
      }),
    ]);
    const sorted = sortStandings(withHeadToHeadPoints(table, matches));
    result.home = sorted.findIndex((row) => row.clubId === homeClubId) + 1 || null;
    if (away && away.competitionId === home.competitionId) {
      result.away = sorted.findIndex((row) => row.clubId === awayClubId) + 1 || null;
      result.sameLeague = true;
      result.pointsGap = Math.abs(home.points - away.points);
    }
  }
  if (!result.away && away) {
    const [table, matches] = await Promise.all([
      prisma.standing.findMany({
        where: { competitionId: away.competitionId },
        select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
      }),
      prisma.match.findMany({
        where: { matchday: { competitionId: away.competitionId }, status: 'played' },
        select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true, status: true },
      }),
    ]);
    const sorted = sortStandings(withHeadToHeadPoints(table, matches));
    result.away = sorted.findIndex((row) => row.clubId === awayClubId) + 1 || null;
  }
  return result;
}

function previewTagline(input: {
  rivalryName: string | null;
  sameLeague: boolean;
  pointsGap: number | null;
  homeShort: string;
  awayShort: string;
  homePos: number | null;
  awayPos: number | null;
}): string {
  if (input.rivalryName) return `${input.rivalryName}: noventa minutos que valen una temporada.`;
  if (input.sameLeague && input.homePos && input.awayPos && input.homePos <= 5 && input.awayPos <= 5) {
    return `Duelo en la zona noble: ${input.homeShort} (${input.homePos}º) contra ${input.awayShort} (${input.awayPos}º).`;
  }
  if (input.sameLeague && input.pointsGap !== null && input.pointsGap <= 3) {
    return input.pointsGap === 0
      ? 'Empatados a puntos: el que gane, manda.'
      : `Solo ${input.pointsGap} punto${input.pointsGap === 1 ? '' : 's'} separan a estos dos equipos.`;
  }
  return `${input.homeShort} y ${input.awayShort} se ven las caras. Tres puntos en juego.`;
}

// ─── Previa (GET /api/matches/:id/preview) ───────────────────────────────────

export async function getMatchPreview(matchId: number) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      homeClub: { select: { ...CLUB_SELECT, fans: true, stadiumName: true, stadiumCapacity: true, stadium: { select: { capacity: true } } } },
      awayClub: { select: CLUB_SELECT },
      matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true, tier: true } } } },
    },
  });
  if (!match) return null;

  const [homeForm, awayForm, h2h, homeKey, awayKey, positions, rivalry] = await Promise.all([
    recentForm(match.homeClubId, match.id),
    recentForm(match.awayClubId, match.id),
    memoryService.headToHead(match.homeClubId, match.awayClubId).catch(() => null),
    keyPlayer(match.homeClubId),
    keyPlayer(match.awayClubId),
    leaguePositions(match.homeClubId, match.awayClubId),
    prisma.rivalry.findFirst({
      where: {
        OR: [
          { clubAId: match.homeClubId, clubBId: match.awayClubId },
          { clubAId: match.awayClubId, clubBId: match.homeClubId },
        ],
      },
      select: { name: true, intensity: true },
    }),
  ]);

  return {
    matchId: match.id,
    status: match.status,
    playedAt: match.playedAt,
    competition: match.matchday?.competition ?? null,
    matchdayNum: match.matchday?.number ?? null,
    matchCenter: {
      simulationTier: match.simulationTier ?? 'A',
      priorityScore: match.priorityScore ?? 0,
      hasTimeline: match.hasTimeline ?? true,
      hasAdvancedStats: match.hasAdvancedStats ?? true,
    },
    homeClub: { id: match.homeClub.id, name: match.homeClub.name, shortName: match.homeClub.shortName, badge: match.homeClub.badge },
    awayClub: match.awayClub,
    venue: {
      stadiumName: match.homeClub.stadiumName,
      capacity: match.homeClub.stadium?.capacity ?? match.homeClub.stadiumCapacity,
      fans: match.homeClub.fans,
      weatherCondition: match.weatherCondition,
      temperature: match.temperature,
    },
    form: { home: homeForm, away: awayForm },
    headToHead: h2h
      ? {
          played: h2h.summary.played,
          homeWins: h2h.summary.clubAWins,
          awayWins: h2h.summary.clubBWins,
          draws: h2h.summary.draws,
          lastMatch: h2h.recent[0] ?? null,
        }
      : null,
    keyPlayers: { home: homeKey, away: awayKey },
    positions,
    rivalry,
    // Duelo táctico: presente solo si el partido ya tiene táctica asignada.
    tacticalDuel: {
      home: { formation: match.homeFormation, offensiveStyle: match.homeOffensiveStyle, defensiveStyle: match.homeDefensiveStyle },
      away: { formation: match.awayFormation, offensiveStyle: match.awayOffensiveStyle, defensiveStyle: match.awayDefensiveStyle },
    },
    tagline: previewTagline({
      rivalryName: rivalry?.name ?? null,
      sameLeague: positions.sameLeague,
      pointsGap: positions.pointsGap,
      homeShort: match.homeClub.shortName,
      awayShort: match.awayClub.shortName,
      homePos: positions.home,
      awayPos: positions.away,
    }),
  };
}

// ─── Post-partido (campo `analysis` en GET /api/matches/public/:id) ──────────
// El timeline tiene DOS formas según el camino de simulación: EngineTimelineEntry
// (motor Python: minute/phase/team/text) y ReplayStep (fallback TS: minute/team/
// kind/outcome/description). Normalizamos defensivamente.

type RawEntry = Record<string, unknown>;

function entryTag(e: RawEntry): string {
  return [e.phase, e.kind, e.outcome, e.type, e.action]
    .filter((v) => typeof v === 'string')
    .join(' ')
    .toLowerCase();
}

function entryText(e: RawEntry): string {
  const text = e.text ?? e.description ?? e.action ?? '';
  return typeof text === 'string' ? text : '';
}

function entryWeight(tag: string): number {
  if (tag.includes('gol') || tag.includes('goal')) return 5;
  if (tag.includes('remate') || tag.includes('shot')) return 3;
  if (tag.includes('parada') || tag.includes('save')) return 2;
  if (tag.includes('progresion') || tag.includes('progress')) return 1;
  return 0.5;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** xG heurístico de una entrada del timeline (fallback cuando los ratings no traen xg). */
function entryXg(tag: string, lane: unknown): number {
  let base = 0;
  if (tag.includes('gol') || tag.includes('goal')) base = 0.4;
  else if (tag.includes('parada') || tag.includes('save')) base = 0.25;
  else if (tag.includes('remate') || tag.includes('shot')) base = 0.12;
  if (base === 0) return 0;
  // Carril: el centro genera ocasiones más claras que la banda.
  if (lane === 'center' || lane === 'centro') return base * 1.25;
  if (lane === 'left' || lane === 'right' || lane === 'izquierda' || lane === 'derecha') return base * 0.85;
  return base;
}

type DuelSide = { playerId: number | null; name: string; position: string; attrs: Record<string, number> };

/** Normaliza un lado del `duel` del motor (playerId/name/position/attrs numéricos). */
function duelSide(raw: unknown): DuelSide | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as RawEntry;
  const attrsRaw = r.attrs;
  const attrs: Record<string, number> = {};
  if (attrsRaw && typeof attrsRaw === 'object') {
    for (const [k, v] of Object.entries(attrsRaw as Record<string, unknown>)) {
      if (typeof v === 'number') attrs[k] = v;
    }
  }
  if (typeof r.name !== 'string' || Object.keys(attrs).length === 0) return null;
  return {
    playerId: typeof r.playerId === 'number' ? r.playerId : null,
    name: r.name,
    position: typeof r.position === 'string' ? r.position : '',
    attrs,
  };
}

function attrMean(side: DuelSide): number {
  const values = Object.values(side.attrs);
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function buildMatchAnalysis(
  timeline: unknown,
  homeRatings: unknown,
  awayRatings: unknown,
  names?: { home: string; away: string },
) {
  const entries: RawEntry[] = Array.isArray(timeline)
    ? timeline.filter((e): e is RawEntry => !!e && typeof e === 'object')
    : [];

  // ── MVP: mejor rating de ambos equipos
  const ratingRows = (raw: unknown, team: 'home' | 'away') =>
    Array.isArray(raw)
      ? raw
          .filter((r): r is RawEntry => !!r && typeof r === 'object' && typeof (r as RawEntry).rating === 'number')
          .map((r) => ({
            playerId: typeof r.playerId === 'number' ? r.playerId : null,
            name: typeof r.name === 'string' ? r.name : 'Desconocido',
            rating: r.rating as number,
            goals: typeof r.goals === 'number' ? r.goals : 0,
            team,
          }))
      : [];
  const allRatings = [...ratingRows(homeRatings, 'home'), ...ratingRows(awayRatings, 'away')];
  const mvp = allRatings.length
    ? allRatings.reduce((best, row) => (row.rating > best.rating ? row : best))
    : null;

  if (entries.length === 0 && !mvp) return null;

  // ── Momentum por tramos de 15'
  const maxMinute = entries.reduce((max, e) => Math.max(max, Number(e.minute) || 0), 90);
  const buckets: Array<{ from: number; to: number; home: number; away: number; balance: number }> = [];
  for (let from = 0; from < Math.max(90, maxMinute); from += 15) {
    buckets.push({ from, to: Math.min(from + 15, Math.max(90, Math.ceil(maxMinute))), home: 0, away: 0, balance: 0 });
  }
  for (const e of entries) {
    const minute = Number(e.minute) || 0;
    const team = e.team === 'home' || e.team === 'away' ? e.team : null;
    if (!team) continue;
    const bucket = buckets[Math.min(buckets.length - 1, Math.floor(minute / 15))];
    bucket[team] += entryWeight(entryTag(e));
  }
  for (const b of buckets) {
    const total = b.home + b.away;
    // balance: -100 (todo visitante) … +100 (todo local); 0 = equilibrio o sin acción
    b.balance = total > 0 ? Math.round(((b.home - b.away) / total) * 100) : 0;
    b.home = Math.round(b.home * 10) / 10;
    b.away = Math.round(b.away * 10) / 10;
  }

  // ── Mejores jugadas: goles primero, luego paradas/remates destacados
  const scored = entries
    .map((e) => ({
      minute: Number(e.minute) || 0,
      team: e.team === 'away' ? 'away' as const : 'home' as const,
      tag: entryTag(e),
      text: entryText(e),
      weight: entryWeight(entryTag(e)),
    }))
    .filter((e) => e.text && e.weight >= 2);
  const goals = scored.filter((e) => e.weight === 5);
  const others = scored.filter((e) => e.weight < 5).sort((a, b) => b.weight - a.weight || a.minute - b.minute);
  const bestPlays = [...goals, ...others].slice(0, 6).sort((a, b) => a.minute - b.minute)
    .map((e) => ({
      minute: e.minute,
      team: e.team,
      kind: e.weight === 5 ? 'gol' : e.tag.includes('parada') || e.tag.includes('save') ? 'parada' : 'ocasion',
      text: e.text,
    }));

  // ── Ocasiones claras por equipo (remates + goles)
  const clearChances = { home: 0, away: 0 };
  for (const e of scored) {
    if (e.weight >= 3) clearChances[e.team] += 1;
  }

  // ── xG por equipo (mejora proactiva 11 jun tarde). Fuente primaria: el xG
  // REAL del motor, que ya acumula `xg` por jugador en los ratings remate a
  // remate. Fallback: heurística por tipo de remate + carril sobre el timeline
  // (camino TS antiguo sin campo xg).
  const sumRatingsXg = (raw: unknown): number =>
    Array.isArray(raw)
      ? raw.reduce((s: number, r) => s + (r && typeof r === 'object' && typeof (r as RawEntry).xg === 'number' ? (r as { xg: number }).xg : 0), 0)
      : 0;
  let xgHome = sumRatingsXg(homeRatings);
  let xgAway = sumRatingsXg(awayRatings);
  let xgSource: 'ratings' | 'timeline' = 'ratings';
  if (xgHome + xgAway === 0 && entries.length > 0) {
    xgSource = 'timeline';
    for (const e of entries) {
      const team = e.team === 'home' || e.team === 'away' ? e.team : null;
      if (!team) continue;
      const value = entryXg(entryTag(e), e.lane);
      if (team === 'home') xgHome += value;
      else xgAway += value;
    }
  }
  const xg = xgHome + xgAway > 0
    ? { home: round2(xgHome), away: round2(xgAway), source: xgSource }
    : null;

  // ── Duelos destacados: las 3 entradas `duel` más decisivas e igualadas.
  // Prioridad por fase (gol > parada > resto), desempate por menor diferencia
  // entre las medias de atributos (gap) — el duelo que se decidió por un pelo.
  const duels = entries
    .map((e) => {
      const duelRaw = e.duel;
      if (!duelRaw || typeof duelRaw !== 'object') return null;
      const att = duelSide((duelRaw as RawEntry).att);
      const def = duelSide((duelRaw as RawEntry).def);
      if (!att || !def) return null;
      const tag = entryTag(e);
      const phaseWeight = tag.includes('gol') || tag.includes('goal') ? 3
        : tag.includes('parada') || tag.includes('save') ? 2
        : 1;
      return {
        minute: Number(e.minute) || 0,
        team: e.team === 'away' ? 'away' as const : 'home' as const,
        kind: phaseWeight === 3 ? 'gol' : phaseWeight === 2 ? 'parada' : 'duelo',
        text: entryText(e),
        att,
        def,
        gap: Math.round(Math.abs(attrMean(att) - attrMean(def)) * 10) / 10,
        phaseWeight,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.phaseWeight - a.phaseWeight || a.gap - b.gap || a.minute - b.minute)
    .slice(0, 3)
    .sort((a, b) => a.minute - b.minute)
    .map((duel) => {
      const publicDuel = { ...duel } as Partial<typeof duel>;
      delete publicDuel.phaseWeight;
      return publicDuel;
    });

  // ── Narración por tramos (estilo crónica de radio): 1 frase por bucket de
  // momentum, en español, mencionando los goles del tramo.
  const homeName = names?.home ?? 'el equipo local';
  const awayName = names?.away ?? 'el visitante';
  const goalMinutes = entries
    .filter((e) => entryWeight(entryTag(e)) === 5)
    .map((e) => ({ minute: Number(e.minute) || 0 }));
  const narrative = buckets.map((b) => {
    const goalsInBucket = goalMinutes.filter((g) => g.minute >= b.from && g.minute < b.to).length;
    const span = `Del ${b.from}' al ${b.to}'`;
    let text: string;
    if (b.home + b.away === 0) text = `${span}, tramo sin ocasiones: dominó el respeto.`;
    else if (b.balance >= 50) text = `${span}, dominio claro de ${homeName}.`;
    else if (b.balance >= 20) text = `${span}, ${homeName} llevó la iniciativa.`;
    else if (b.balance > -20) text = `${span}, tramo igualado con alternativas para ambos.`;
    else if (b.balance > -50) text = `${span}, ${awayName} dio un paso adelante.`;
    else text = `${span}, dominio claro de ${awayName}.`;
    if (goalsInBucket > 0) {
      text += goalsInBucket === 1 ? ' Cayó 1 gol en este tramo.' : ` Cayeron ${goalsInBucket} goles en este tramo.`;
    }
    return { from: b.from, to: b.to, balance: b.balance, text };
  });

  return {
    mvp,
    momentum: buckets,
    bestPlays,
    clearChances,
    xg,
    keyDuels: duels,
    narrative,
    source: entries.length > 0 ? 'timeline' : 'ratings-only',
  };
}
