// ─── Matches Routes ───────────────────────────────────────────────────────────
import { createHash } from 'crypto';
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { maintenanceWriteGuard } from '../master/governance.guard';
import prisma from '../../db/prisma';
import { hideResult, isResultSeen, isResultSeenForMatch, markResultSeen, shouldHideResult } from './matchEventVisibility';
import { getMatchPreview, buildMatchAnalysis } from './matchExperience.service';
import { realtimeHub } from '../realtime/realtime.hub';
import { gameService } from '../game/game.service';

function parseStatsJson(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function positiveInt(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

const jsonishSchema = z.union([
  z.string().max(5000),
  z.record(z.any()),
  z.array(z.any()).max(12),
]).transform((value) => (typeof value === 'string' ? value : JSON.stringify(value)));

function hiddenStats(raw: any) {
  if (!raw) return null;
  const stats = { ...raw };
  delete stats.replay;
  delete stats.timeline;
  delete stats.ratings;
  delete stats.playerStats;
  delete stats.injuries;
  delete stats.allInjuries;
  return stats;
}

/** Rellena nombres faltantes en stats persistidas (legacy sin `name`). */
async function enrichPlayerStats(stats: unknown[] | null | undefined): Promise<unknown[] | null> {
  if (!Array.isArray(stats) || stats.length === 0) return stats ?? null;
  const rows = stats as Array<Record<string, unknown>>;
  // Enriquecemos TODAS las filas con jugador conocido (no solo las que faltan
  // nombre) para que el visor 2D pueda mostrar el DORSAL real (squadNumber) y la
  // POSICIÓN DETALLADA (alineación/formación). Aditivo: no pisa lo que ya venga.
  const ids = rows
    .map(r => Number(r.playerId))
    .filter(id => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return stats;
  const players = await prisma.player.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true, position: true, squadNumber: true, detailedPosition: true },
  });
  const byId = new Map(players.map(p => [p.id, p]));
  return rows.map(r => {
    const id = Number(r.playerId);
    const p = Number.isInteger(id) ? byId.get(id) : undefined;
    if (!p) return r;
    return {
      ...r,
      name: r.name ?? p.name,
      position: r.position ?? p.position,
      squadNumber: r.squadNumber ?? p.squadNumber ?? null,
      detailedPosition: r.detailedPosition ?? p.detailedPosition ?? null,
    };
  });
}


function timelineEntryCount(timeline: unknown): number {
  return Array.isArray(timeline) ? timeline.length : 0;
}

function timelineIsPruned(homeStatsRaw: any, raw: string | null): boolean {
  return Boolean(homeStatsRaw?.pruned)
    || homeStatsRaw?.tierPersistence?.timelineStored === false
    || (typeof raw === 'string' && raw.includes('"pruned"'));
}

function matchSeed(homeStatsRaw: any, matchId: number): number {
  const seed = Number(homeStatsRaw?.seed);
  return Number.isFinite(seed) ? seed : matchId * 1337;
}

function seedHash(matchId: number, seed: number): string {
  return createHash('sha256')
    .update(`manager-fdf:v1:match:${matchId}:seed:${seed}`)
    .digest('hex');
}

function buildSeedAudit(matchId: number, seed: number, status?: string, resultHidden = false) {
  return {
    algorithm: 'sha256',
    seedFormula: 'matchId * 1337',
    seed,
    canonicalSeed: matchId * 1337,
    seedHash: seedHash(matchId, seed),
    hashInputTemplate: 'manager-fdf:v1:match:<matchId>:seed:<seed>',
    verifyEndpoint: `/api/matches/${matchId}/audit`,
    timelineFromSeedEndpoint: `/api/matches/${matchId}/timeline-from-seed`,
    verifiable: status === 'played' && !resultHidden,
    resultHidden,
  };
}

function buildMatchCenterContract(match: {
  simulationTier?: string | null;
  priorityScore?: number | null;
  hasTimeline?: boolean | null;
  hasAdvancedStats?: boolean | null;
}, timeline: unknown, timelinePruned: boolean) {
  return {
    simulationTier: match.simulationTier ?? 'A',
    priorityScore: match.priorityScore ?? 0,
    hasTimeline: match.hasTimeline ?? true,
    hasAdvancedStats: match.hasAdvancedStats ?? true,
    timelinePruned,
    timelineEntryCount: timelineEntryCount(timeline),
    contracts: [
      'timeline[].lane',
      'timeline[].zone',
      'timeline[].duel',
      'timeline[].chain',
      'replay',
      'homeRatings',
      'awayRatings',
      'analysis.mvp',
      'analysis.momentum',
      'analysis.bestPlays',
      'analysis.clearChances',
      'analysis.xg',
      'analysis.keyDuels',
      'analysis.narrative',
      'archivedSummary',
      'seed',
    ],
  };
}

function buildArchivedSummary(input: {
  match: { status: string; homeGoals?: number | null; awayGoals?: number | null; motm?: string | null; hasTimeline?: boolean | null; simulationTier?: string | null };
  seed: number;
  timeline: unknown;
  timelinePruned: boolean;
  analysis: any;
}) {
  if (input.match.status !== 'played') return null;
  const timelineCount = timelineEntryCount(input.timeline);
  const hasSeed = Number.isFinite(input.seed);
  const canRegenerateFromSeed = hasSeed
    && timelineCount === 0
    && (input.timelinePruned || input.match.simulationTier === 'C');
  const source = timelineCount > 0 ? 'timeline' : canRegenerateFromSeed ? 'seed-regenerable' : 'score-only';
  return {
    source,
    timelinePruned: input.timelinePruned,
    timelineAvailable: timelineCount > 0,
    timelineEntryCount: timelineCount,
    seed: input.seed,
    canRegenerateFromSeed,
    score: { home: input.match.homeGoals ?? null, away: input.match.awayGoals ?? null },
    motm: input.match.motm ?? null,
    bestPlays: Array.isArray(input.analysis?.bestPlays) ? input.analysis.bestPlays : [],
    xg: input.analysis?.xg ?? null,
    keyDuels: Array.isArray(input.analysis?.keyDuels) ? input.analysis.keyDuels : [],
    narrative: Array.isArray(input.analysis?.narrative) ? input.analysis.narrative : [],
    reason: timelineCount > 0
      ? 'timeline_disponible'
      : canRegenerateFromSeed
        ? 'timeline_podado_seed_preservada'
        : 'timeline_no_disponible',
  };
}

const calendarQuerySchema = z.object({
  clubId: z.coerce.number().int().positive().optional(),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  // Q2 (aditivo): por defecto el calendario es de la TEMPORADA ACTIVA;
  // season=all conserva el comportamiento histórico anterior.
  season: z.enum(['active', 'all']).optional(),
});

/**
 * Q3 · Tipado de competición para la UI a partir del nombre/shortName/type.
 * league | cup | champions | uel | uecl | supercup | friendly | other
 */
export function competitionKind(competition?: { name?: string | null; shortName?: string | null; type?: string | null } | null): string {
  if (!competition) return 'friendly';
  const type = (competition.type ?? '').toLowerCase();
  const short = (competition.shortName ?? '').toUpperCase();
  const name = (competition.name ?? '').toLowerCase();
  if (short === 'UCL' || name.includes('champions')) return 'champions';
  if (short === 'UEL' || name.includes('europa league')) return 'uel';
  if (short === 'UECL' || name.includes('conference')) return 'uecl';
  if (type === 'supercup' || name.includes('supercopa')) return 'supercup';
  if (type === 'cup') return 'cup';
  if (type === 'league') return 'league';
  if (type === 'friendly') return 'friendly';
  return 'other';
}

function calendarPayload(m: any) {
  const seed = m.id * 1337;
  return {
    id: m.id,
    status: m.status,
    homeClubId: m.homeClubId,
    awayClubId: m.awayClubId,
    homeClub: m.homeClub,
    awayClub: m.awayClub,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    weatherCondition: m.weatherCondition,
    temperature: m.temperature,
    competition: m.matchday?.competition,
    competitionKind: competitionKind(m.matchday?.competition),
    matchdayNum: m.matchday?.number,
    week: m.matchday?.number,
    playedAt: m.playedAt,
    seed,
    audit: buildSeedAudit(m.id, seed, m.status),
    matchCenter: {
      simulationTier: m.simulationTier ?? 'A',
      priorityScore: m.priorityScore ?? 0,
      hasTimeline: m.hasTimeline ?? true,
      hasAdvancedStats: m.hasAdvancedStats ?? true,
    },
  };
}

/** Q2/Q3: filtro de temporada activa para queries de Match (vía matchday→competition). */
async function activeSeasonMatchFilter(): Promise<Record<string, unknown>> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true },
  });
  return state ? { matchday: { competition: { seasonId: state.seasonId } } } : {};
}

export async function matchesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', maintenanceWriteGuard);

  // GET /api/matches/calendar
  app.get('/calendar', async (request, reply) => {
    try {
      const parsed = calendarQuerySchema.safeParse(request.query);
      if (!parsed.success) return reply.code(400).send({ error: 'Consulta de calendario no válida' });

      const viewerClubId = request.user.clubId ?? null;
      const filterClubId = parsed.data.clubId ?? viewerClubId ?? undefined;
      // Q2: por defecto SOLO la temporada activa (la "jornada 145" era el
      // calendario acumulado de 13 temporadas); season=all para el histórico.
      const seasonFilter = parsed.data.season === 'all' ? {} : await activeSeasonMatchFilter();
      const where: any = {
        ...(filterClubId
          ? { OR: [{ homeClubId: filterClubId }, { awayClubId: filterClubId }] }
          : {}),
        ...seasonFilter,
      };
      const take = parsed.data.take ?? 60;
      const total = await prisma.match.count({ where });
      let skip = parsed.data.skip;

      if (typeof skip !== 'number') {
        const nextMatch = await prisma.match.findFirst({
          where: { ...where, status: 'scheduled' },
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        if (nextMatch) {
          const matchesBeforeNext = await prisma.match.count({
            where: { ...where, id: { lt: nextMatch.id } },
          });
          skip = Math.max(0, matchesBeforeNext - 10);
        } else {
          skip = Math.max(0, total - take);
        }
      }

      const matches = await prisma.match.findMany({
        where,
        orderBy: { id: 'asc' },
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true, city: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true, city: true } },
          matchday: { include: { competition: { select: { name: true, shortName: true, type: true } } } },
        },
        skip,
        take,
      });

      const seenRows = matches.length > 0
        ? await prisma.matchSeen.findMany({
            where: { userId: request.user.userId, matchId: { in: matches.map((m) => m.id) } },
            select: { matchId: true },
          })
        : [];
      const seenMatchIds = new Set(seenRows.map((row) => row.matchId));

      reply
        .header('X-Total-Count', total)
        .header('X-Skip', skip)
        .header('X-Take', take);

      return reply.send(matches.map((m: any) => hideResult(
        calendarPayload(m),
        shouldHideResult(m, viewerClubId, request.user.userId, seenMatchIds.has(m.id)),
      )));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar el calendario';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── GET /api/matches/mine — Q3 · sección "Partidos" de mi club ────────────
  // Jugados + pendientes de la TEMPORADA ACTIVA, con competición tipada
  // (league|cup|champions|uel|uecl|supercup), flag E15 hideResult para el último
  // no visto, flag `seen` y disponibilidad real del timeline (puede estar podado
  // por stepDbCleanup a los 30 días in-game). Marcar visto: POST /api/matches/:id/seen.
  app.get('/mine', async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    try {
      const seasonFilter = await activeSeasonMatchFilter();
      const matches = await prisma.match.findMany({
        where: { OR: [{ homeClubId: clubId }, { awayClubId: clubId }], ...seasonFilter },
        orderBy: { id: 'asc' },
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true, city: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true, city: true } },
          matchday: { include: { competition: { select: { id: true, name: true, shortName: true, type: true } } } },
        },
      });

      const seenRows = matches.length > 0
        ? await prisma.matchSeen.findMany({
            where: { userId, matchId: { in: matches.map((m) => m.id) } },
            select: { matchId: true },
          })
        : [];
      const seenMatchIds = new Set(seenRows.map((row) => row.matchId));

      const rows = matches.map((m: any) => {
        const seen = seenMatchIds.has(m.id) || isResultSeen(m.homeStatsJson, userId);
        const pruned = m.status === 'played' && typeof m.homeStatsJson === 'string' && m.homeStatsJson.includes('"pruned"');
        const hasTimeline = m.status === 'played' && !pruned && typeof m.homeStatsJson === 'string'
          && (m.homeStatsJson.includes('"timeline"') || m.homeStatsJson.includes('"replay"'));
        return hideResult({
          ...calendarPayload(m),
          seen,
          timelineAvailable: hasTimeline,
          timelinePruned: pruned,
        }, shouldHideResult(m, clubId, userId, seen));
      });

      return reply.send({
        played: rows.filter((r: any) => r.status === 'played'),
        upcoming: rows.filter((r: any) => r.status !== 'played'),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar tus partidos';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/matches/public/:id
  // Q3: además de la fila cruda (compatibilidad), expone timeline/replay y
  // ratings PARSEADOS (antes el front recibía homeStatsJson como string y el
  // Match Center no tenía nada que reproducir por esta vía).
  app.get<{ Params: { id: string } }>('/public/:id', async (request, reply) => {
    try {
      const matchId = positiveInt(request.params.id);
      if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        include: {
          homeClub: { select: { name: true, shortName: true, badge: true, city: true } },
          awayClub: { select: { name: true, shortName: true, badge: true, city: true } },
          matchday: { include: { competition: { select: { name: true, shortName: true, type: true } } } },
        }
      });
      if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });

      const homeStatsRaw = parseStatsJson(match.homeStatsJson);
      const awayStatsRaw = parseStatsJson(match.awayStatsJson);
      const timeline = homeStatsRaw?.timeline ?? homeStatsRaw?.replay ?? null;
      const homeRatings = await enrichPlayerStats(homeStatsRaw?.playerStats ?? homeStatsRaw?.ratings ?? null);
      const awayRatings = await enrichPlayerStats(awayStatsRaw?.playerStats ?? awayStatsRaw?.ratings ?? null);
      const timelinePruned = timelineIsPruned(homeStatsRaw, match.homeStatsJson);
      const seed = matchSeed(homeStatsRaw, match.id);
      const analysis = match.status === 'played'
        ? buildMatchAnalysis(timeline, homeRatings, awayRatings, {
            home: match.homeClub.shortName ?? match.homeClub.name,
            away: match.awayClub.shortName ?? match.awayClub.name,
          })
        : null;
      const resultSeen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
      const hidden = shouldHideResult(match, request.user.clubId ?? null, request.user.userId, resultSeen);
      const payload = {
        ...match,
        homeStatsJson: hidden ? null : match.homeStatsJson,
        awayStatsJson: hidden ? null : match.awayStatsJson,
        competitionKind: competitionKind(match.matchday?.competition),
        seed,
        audit: buildSeedAudit(match.id, seed, match.status, hidden),
        timeline,
        replay: timeline,
        homeRatings,
        awayRatings,
        timelinePruned,
        timelineAvailable: timelineEntryCount(timeline) > 0,
        matchCenter: buildMatchCenterContract(match, timeline, timelinePruned),
        // Punto 0 (Q27): análisis post-partido derivado del timeline YA expuesto
        // por esta misma ruta (MVP, momentum por tramos, mejores jugadas; 11 jun
        // tarde: + xg, keyDuels y narrative — aditivos).
        analysis: hidden ? null : analysis,
        archivedSummary: hidden ? null : buildArchivedSummary({ match, seed, timeline, timelinePruned, analysis }),
      };
      return reply.send(hideResult(payload, hidden));
    } catch {
      return reply.code(500).send({ error: 'Error' });
    }
  });

  // ─── Punto 0 (Q3+Q27) · GET /api/matches/:id/preview — previa cinematográfica
  // Forma reciente, head-to-head, jugador clave por rating, clima/aforo, duelo
  // táctico y frase previa. Para partidos programados Y jugados. NO incluye el
  // resultado del propio partido: cero conflicto con E15.
  app.get<{ Params: { id: string } }>('/:id/preview', async (request, reply) => {
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
    try {
      const preview = await getMatchPreview(matchId);
      if (!preview) return reply.code(404).send({ error: 'Partido no encontrado' });
      return reply.send(preview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar la previa';
      return reply.code(500).send({ error: msg });
    }
  });

  // X1 · GET /api/matches/:id/timeline-from-seed
  // Re-simula audit-only por semilla para reconstruir un replay de partidos Tier C
  // o podados por limpieza, sin mutar marcador, standings, XP ni finanzas.
  app.get<{ Params: { id: string } }>('/:id/timeline-from-seed', async (request, reply) => {
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
    try {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          status: true,
          homeClubId: true,
          awayClubId: true,
          homeGoals: true,
          awayGoals: true,
          homeStatsJson: true,
          simulationTier: true,
          hasTimeline: true,
          hasAdvancedStats: true,
          homeClub: { select: { name: true, shortName: true } },
          awayClub: { select: { name: true, shortName: true } },
        },
      });
      if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
      if (match.status !== 'played') return reply.code(400).send({ error: 'El partido aún no se ha jugado' });

      const seen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
      const hidden = shouldHideResult(match, request.user.clubId ?? null, request.user.userId, seen);
      if (hidden) return reply.code(403).send({ error: 'Debes ver el resultado antes de revivir este partido' });

      const regenerated = await gameService.regenerateTimelineFromSeed(matchId) as any;
      const timeline = regenerated.timeline ?? [];
      const homeRatings = regenerated.homeRatings ?? [];
      const awayRatings = regenerated.awayRatings ?? [];
      const analysis = buildMatchAnalysis(timeline, homeRatings, awayRatings, {
        home: match.homeClub.shortName ?? match.homeClub.name,
        away: match.awayClub.shortName ?? match.awayClub.name,
      });

      return reply.send({
        ok: true,
        matchId,
        source: 'seed-regenerated',
        seed: regenerated.seed,
        audit: buildSeedAudit(matchId, regenerated.seed, match.status, false),
        simulationTier: match.simulationTier ?? 'C',
        reproducesPersistedScore: regenerated.reproducesPersistedScore,
        persisted: regenerated.persisted,
        resimulated: regenerated.resimulated,
        timeline,
        replay: timeline,
        timelineAvailable: timelineEntryCount(timeline) > 0,
        homeRatings,
        awayRatings,
        events: regenerated.events ?? [],
        analysis,
        warning: regenerated.reproducesPersistedScore
          ? null
          : 'La semilla reproduce un marcador distinto con el motor actual; mostrar como recreación no canónica.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo regenerar el timeline';
      return reply.code(500).send({ error: msg });
    }
  });

  // N2-3 · GET /api/matches/:id/audit
  // Verificación pública/autenticada de semilla: compacta, audit-only y sin mutar
  // marcador, standings, XP, finanzas ni eventos persistidos.
  app.get<{ Params: { id: string } }>('/:id/audit', async (request, reply) => {
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
    try {
      const match = await prisma.match.findUnique({
        where: { id: matchId },
        select: {
          id: true,
          status: true,
          homeClubId: true,
          awayClubId: true,
          homeGoals: true,
          awayGoals: true,
          homeStatsJson: true,
          playedAt: true,
          homeClub: { select: { id: true, name: true, shortName: true } },
          awayClub: { select: { id: true, name: true, shortName: true } },
        },
      });
      if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });

      const homeStatsRaw = parseStatsJson(match.homeStatsJson);
      const seed = matchSeed(homeStatsRaw, match.id);
      const seen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
      const hidden = shouldHideResult(match, request.user.clubId ?? null, request.user.userId, seen);
      const audit = buildSeedAudit(match.id, seed, match.status, hidden);

      if (hidden) {
        return reply.code(403).send({
          error: 'Debes ver el resultado antes de auditar este partido',
          audit,
        });
      }

      if (match.status !== 'played') {
        return reply.send({
          ok: true,
          matchId,
          status: match.status,
          homeClub: match.homeClub,
          awayClub: match.awayClub,
          audit,
          verification: null,
          message: 'El partido aún no se ha jugado; el hash queda publicado como compromiso previo.',
        });
      }

      const verification = await gameService.resimulateMatchAudit(matchId) as any;
      return reply.send({
        ok: true,
        matchId,
        status: match.status,
        homeClub: match.homeClub,
        awayClub: match.awayClub,
        audit,
        verification: {
          mode: verification.mode,
          persisted: verification.persisted,
          resimulated: verification.resimulated,
          reproducesPersistedScore: verification.reproducesPersistedScore,
          checkedAt: new Date().toISOString(),
          timelineFromSeedEndpoint: `/api/matches/${matchId}/timeline-from-seed`,
        },
        uiNeed: '// NECESITO Cowork: panel de auditoría pública que muestre seedHash y compare persisted vs resimulated.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo auditar el partido';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    const matches = await prisma.match.findMany({
      where: {
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
      },
      include: {
        homeClub: { select: { name: true, shortName: true, city: true } },
        awayClub: { select: { name: true, shortName: true, city: true } },
        matchday: { include: { competition: { select: { name: true, shortName: true } } } },
      },
      orderBy: { id: 'asc' },
    });

    const matchIds = matches.map((m) => m.id);
    const seenRows = matchIds.length > 0
      ? await prisma.matchSeen.findMany({
          where: { userId: request.user.userId, matchId: { in: matchIds } },
          select: { matchId: true },
        })
      : [];
    const seenMatchIds = new Set(seenRows.map((row) => row.matchId));

    return reply.send(matches.map((m: any) => hideResult({
      id:            m.id,
      status:        m.status,
      homeClubId:    m.homeClubId,
      awayClubId:    m.awayClubId,
      homeClub:      m.homeClub,
      awayClub:      m.awayClub,
      homeGoals:     m.homeGoals,
      awayGoals:     m.awayGoals,
      homeFormation:    m.homeFormation,
      awayFormation:    m.awayFormation,
      homeConstruction: m.homeConstruction,
      awayConstruction: m.awayConstruction,
      homeDestruction:  m.homeDestruction,
      awayDestruction:  m.awayDestruction,
      homeOffensiveStyle: m.homeOffensiveStyle,
      awayOffensiveStyle: m.awayOffensiveStyle,
      homeDefensiveStyle: m.homeDefensiveStyle,
      awayDefensiveStyle: m.awayDefensiveStyle,
      homeAttackZones: m.homeAttackZones,
      awayAttackZones: m.awayAttackZones,
      homeDefenseReinforcement: m.homeDefenseReinforcement,
      awayDefenseReinforcement: m.awayDefenseReinforcement,
      homeSubsLogic: m.homeSubsLogic,
      awaySubsLogic: m.awaySubsLogic,
      weatherCondition: m.weatherCondition,
      temperature:      m.temperature,
      competition:   m.matchday?.competition,
      matchdayNum:   m.matchday?.number,
      week:          m.matchday?.number,
      playedAt:      m.playedAt,
    }, shouldHideResult(m, clubId, request.user.userId, seenMatchIds.has(m.id)))));
  });

  // GET /api/matches/:id — full match details
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { clubId } = request.user;
    const matchId    = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

    const match = await prisma.match.findUnique({
      where:   { id: matchId },
      include: {
        homeClub: { select: { id: true, name: true, shortName: true, city: true } },
        awayClub: { select: { id: true, name: true, shortName: true, city: true } },
        events:   { orderBy: { minute: 'asc' } },
        matchday: { include: { competition: true } },
      },
    });
    if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
    // Only expose match details if user's club is involved (or match is played)
    if (match.homeClub.id !== clubId && match.awayClub.id !== clubId && match.status !== 'played') {
      return reply.code(403).send({ error: 'Acceso denegado' });
    }

    // Parse stats JSON
    const homeStatsRaw = parseStatsJson(match.homeStatsJson);
    const awayStatsRaw = parseStatsJson(match.awayStatsJson);

    // Separate replay from stats (replay is stored in homeStatsJson)
    const timeline = homeStatsRaw?.timeline ?? homeStatsRaw?.replay ?? null;
    const replay = timeline;
    const homeStats = hiddenStats(homeStatsRaw);
    const awayStats = hiddenStats(awayStatsRaw);
    const homePlayerStats = await enrichPlayerStats(homeStatsRaw?.playerStats ?? homeStatsRaw?.ratings ?? null);
    const awayPlayerStats = await enrichPlayerStats(awayStatsRaw?.playerStats ?? awayStatsRaw?.ratings ?? null);
    const injuries = homeStatsRaw?.allInjuries ?? [
      ...(Array.isArray(homeStatsRaw?.injuries) ? homeStatsRaw.injuries : []),
      ...(Array.isArray(awayStatsRaw?.injuries) ? awayStatsRaw.injuries : []),
    ];
    const timelinePruned = timelineIsPruned(homeStatsRaw, match.homeStatsJson);
    const seed = matchSeed(homeStatsRaw, match.id);
    const analysis = match.status === 'played'
      ? buildMatchAnalysis(timeline, homePlayerStats, awayPlayerStats, {
          home: match.homeClub.shortName ?? match.homeClub.name,
          away: match.awayClub.shortName ?? match.awayClub.name,
        })
      : null;
    const resultSeen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
    const hidden = shouldHideResult(match, clubId ?? null, request.user.userId, resultSeen);

    const payload = {
      id:            match.id,
      status:        match.status,
      homeClubId:    match.homeClubId,
      awayClubId:    match.awayClubId,
      homeClub:      match.homeClub,
      awayClub:      match.awayClub,
      homeGoals:     match.homeGoals,
      awayGoals:     match.awayGoals,
      motm:          match.motm,
      homeFormation:    match.homeFormation,
      awayFormation:    match.awayFormation,
      homeConstruction: match.homeConstruction,
      awayConstruction: match.awayConstruction,
      homeDestruction:  match.homeDestruction,
      awayDestruction:  match.awayDestruction,
      homeOffensiveStyle: match.homeOffensiveStyle,
      awayOffensiveStyle: match.awayOffensiveStyle,
      homeDefensiveStyle: match.homeDefensiveStyle,
      awayDefensiveStyle: match.awayDefensiveStyle,
      homeAttackZones: match.homeAttackZones,
      awayAttackZones: match.awayAttackZones,
      homeDefenseReinforcement: match.homeDefenseReinforcement,
      awayDefenseReinforcement: match.awayDefenseReinforcement,
      homeSubsLogic: match.homeSubsLogic,
      awaySubsLogic: match.awaySubsLogic,
      weatherCondition: homeStatsRaw?.weatherCondition ?? match.weatherCondition,
      temperature:      homeStatsRaw?.temperature ?? match.temperature,
      competition:   match.matchday?.competition,
      competitionKind: competitionKind(match.matchday?.competition),
      matchdayNum:   match.matchday?.number,
      playedAt:      match.playedAt,
      // Semilla usada para simular este partido (determinista: matchId × 1337).
      // Permite reproducir exactamente la misma simulación con el mismo motor.
      seed,
      audit: buildSeedAudit(match.id, seed, match.status, hidden),
      homeStats,
      awayStats,
      homeRatings:   homePlayerStats,
      awayRatings:   awayPlayerStats,
      homePlayerStats,
      awayPlayerStats,
      injuries: hidden ? [] : injuries,
      timeline,
      replay,
      events:        match.events,
      timelinePruned,
      timelineAvailable: timelineEntryCount(timeline) > 0,
      matchCenter: buildMatchCenterContract(match, timeline, timelinePruned),
      analysis: hidden ? null : analysis,
      archivedSummary: hidden ? null : buildArchivedSummary({ match, seed, timeline, timelinePruned, analysis }),
    };
    return reply.send(hideResult(payload, hidden));
  });

  app.post<{ Params: { id: string } }>('/:id/seen', async (request, reply) => {
    const { clubId, userId } = request.user;
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, status: true, homeClubId: true, awayClubId: true },
    });
    if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
    if (match.status !== 'played') return reply.code(400).send({ error: 'El partido aún no se ha jugado' });
    if (!clubId || (match.homeClubId !== clubId && match.awayClubId !== clubId)) {
      return reply.code(403).send({ error: 'Acceso denegado' });
    }

    try {
      return reply.send(await markResultSeen(matchId, userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  /**
   * GET /api/matches/:id/replay — paso a paso del partido (Championship Manager style).
   * Devuelve el array de ReplayStep con posición en campo, fases resueltas y descripción.
   * Solo disponible para partidos jugados y accesibles por el usuario.
   */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/:id/replay',
    async (request, reply) => {
      const { clubId } = request.user;
      const matchId = positiveInt(request.params.id);
      if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

      const match = await prisma.match.findUnique({
        where:   { id: matchId },
        include: {
          homeClub: { select: { id: true } },
          awayClub: { select: { id: true } },
        },
      });

      if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
      if (match.status !== 'played') {
        return reply.code(400).send({ error: 'El partido aún no se ha jugado' });
      }
      if (match.homeClub.id !== clubId && match.awayClub.id !== clubId) {
        return reply.code(403).send({ error: 'Acceso denegado' });
      }
      const resultSeen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
      if (shouldHideResult(match, clubId ?? null, request.user.userId, resultSeen)) {
        return reply.code(403).send({
          error: 'Resultado oculto hasta abrir el partido',
          resultHidden: true,
          revealEndpoint: `/api/matches/${matchId}/seen`,
        });
      }

      const homeStatsRaw = parseStatsJson(match.homeStatsJson);
      const replay = homeStatsRaw?.timeline ?? homeStatsRaw?.replay ?? [];

      if (!Array.isArray(replay) || replay.length === 0) {
        return reply.code(404).send({ error: 'Replay no disponible para este partido' });
      }

      // Filtrado opcional por rango de índices
      const rawFrom = request.query.from ? Number.parseInt(request.query.from, 10) : 0;
      const rawTo   = request.query.to   ? Number.parseInt(request.query.to, 10)   : replay.length;
      const fromIdx = Number.isInteger(rawFrom) ? Math.max(0, rawFrom) : 0;
      const toIdx   = Number.isInteger(rawTo) ? Math.max(fromIdx, rawTo) : replay.length;
      const page    = replay.slice(fromIdx, toIdx);

      return reply.send({
        matchId,
        total: replay.length,
        from:  fromIdx,
        to:    Math.min(toIdx, replay.length),
        steps: page,
      });
    },
  );

  /**
   * GET /api/matches/:id/ratings — notas y estadísticas individuales del partido.
   */
  app.get<{ Params: { id: string } }>('/:id/ratings', async (request, reply) => {
    const { clubId } = request.user;
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

    const match = await prisma.match.findUnique({
      where:   { id: matchId },
      include: {
        homeClub: { select: { id: true } },
        awayClub: { select: { id: true } },
      },
    });

    if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
    if (match.status !== 'played') {
      return reply.code(400).send({ error: 'El partido aún no se ha jugado' });
    }
    if (match.homeClub.id !== clubId && match.awayClub.id !== clubId) {
      return reply.code(403).send({ error: 'Acceso denegado' });
    }
    const resultSeen = await isResultSeenForMatch(match.id, match.homeStatsJson, request.user.userId);
    if (shouldHideResult(match, clubId ?? null, request.user.userId, resultSeen)) {
      return reply.code(403).send({
        error: 'Resultado oculto hasta abrir el partido',
        resultHidden: true,
        revealEndpoint: `/api/matches/${matchId}/seen`,
      });
    }

    const homeStatsRaw = parseStatsJson(match.homeStatsJson);
    const awayStatsRaw = parseStatsJson(match.awayStatsJson);
    const homeRatings = await enrichPlayerStats(homeStatsRaw?.playerStats ?? homeStatsRaw?.ratings ?? []);
    const awayRatings = await enrichPlayerStats(awayStatsRaw?.playerStats ?? awayStatsRaw?.ratings ?? []);

    return reply.send({
      matchId,
      motm: match.motm,
      homeRatings: homeRatings ?? [],
      awayRatings: awayRatings ?? [],
      homePlayerStats: homeRatings ?? [],
      awayPlayerStats: awayRatings ?? [],
    });
  });

  // POST /api/matches/:id/tactics — save tactics before simulation
  app.post<{ Params: { id: string } }>('/:id/tactics', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    const body = z.object({
      formation:    z.string(),
      construction: z.number().min(0).max(100),
      destruction:  z.number().min(0).max(100),
      pressing:     z.number().min(0).max(100).optional(),
      tempo:        z.number().min(0).max(100).optional(),
      width:        z.number().min(0).max(100).optional(),
      // R3: mentality 0-100 numérico (se persiste como string en Match.*Mentality);
      // los strings legacy siguen aceptados.
      mentality:    z.union([z.string(), z.number().min(0).max(100).transform(String)]).optional(),
      marking:      z.string().optional(),
      offensiveStyle: z.string().optional(),
      defensiveStyle: z.string().optional(),
      attackZones: jsonishSchema.optional(),
      defenseReinforcement: jsonishSchema.optional(),
      subsLogic: jsonishSchema.optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Táctica no válida' });

    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
    const match   = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match)            return reply.code(404).send({ error: 'Partido no encontrado' });
    if (match.status !== 'scheduled') return reply.code(400).send({ error: 'El partido ya se ha jugado' });

    const isHome = match.homeClubId === clubId;
    const isAway = match.awayClubId === clubId;
    if (!isHome && !isAway) return reply.code(403).send({ error: 'No es tu partido' });

    await prisma.match.update({
      where: { id: matchId },
      data: isHome ? {
        homeFormation:    body.data.formation,
        homeConstruction: body.data.construction,
        homeDestruction:  body.data.destruction,
        ...(body.data.pressing !== undefined ? { homePressing: body.data.pressing } : {}),
        ...(body.data.tempo !== undefined ? { homeTempo: body.data.tempo } : {}),
        ...(body.data.width !== undefined ? { homeWidth: body.data.width } : {}),
        ...(body.data.mentality !== undefined ? { homeMentality: body.data.mentality } : {}),
        ...(body.data.marking !== undefined ? { homeMarking: body.data.marking } : {}),
        ...(body.data.offensiveStyle !== undefined ? { homeOffensiveStyle: body.data.offensiveStyle } : {}),
        ...(body.data.defensiveStyle !== undefined ? { homeDefensiveStyle: body.data.defensiveStyle } : {}),
        ...(body.data.attackZones !== undefined ? { homeAttackZones: body.data.attackZones } : {}),
        ...(body.data.defenseReinforcement !== undefined ? { homeDefenseReinforcement: body.data.defenseReinforcement } : {}),
        ...(body.data.subsLogic !== undefined ? { homeSubsLogic: body.data.subsLogic } : {}),
      } : {
        awayFormation:    body.data.formation,
        awayConstruction: body.data.construction,
        awayDestruction:  body.data.destruction,
        ...(body.data.pressing !== undefined ? { awayPressing: body.data.pressing } : {}),
        ...(body.data.tempo !== undefined ? { awayTempo: body.data.tempo } : {}),
        ...(body.data.width !== undefined ? { awayWidth: body.data.width } : {}),
        ...(body.data.mentality !== undefined ? { awayMentality: body.data.mentality } : {}),
        ...(body.data.marking !== undefined ? { awayMarking: body.data.marking } : {}),
        ...(body.data.offensiveStyle !== undefined ? { awayOffensiveStyle: body.data.offensiveStyle } : {}),
        ...(body.data.defensiveStyle !== undefined ? { awayDefensiveStyle: body.data.defensiveStyle } : {}),
        ...(body.data.attackZones !== undefined ? { awayAttackZones: body.data.attackZones } : {}),
        ...(body.data.defenseReinforcement !== undefined ? { awayDefenseReinforcement: body.data.defenseReinforcement } : {}),
        ...(body.data.subsLogic !== undefined ? { awaySubsLogic: body.data.subsLogic } : {}),
      },
    });

    return reply.send({ ok: true });
  });

  // GET /api/matches/:id/comments
  app.get<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

    const comments = await prisma.matchComment.findMany({
      where: { matchId },
      include: {
        user: { select: { id: true, username: true, manager: { select: { id: true, name: true, club: { select: { shortName: true } } } } } }
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send(comments.map(c => ({
      id: c.id,
      text: c.text,
      minute: c.minute,
      createdAt: c.createdAt,
      author: {
        id: c.user.id,
        username: c.user.username,
        name: c.user.manager?.name ?? c.user.username,
        clubShortName: c.user.manager?.club?.shortName ?? null,
      }
    })));
  });

  // POST /api/matches/:id/comments
  app.post<{ Params: { id: string } }>('/:id/comments', async (request, reply) => {
    const { userId, clubId } = request.user;
    const matchId = positiveInt(request.params.id);
    if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });

    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, homeClubId: true, awayClubId: true }
    });
    if (!match) return reply.code(404).send({ error: 'Partido no encontrado' });
    
    // Only involved managers can comment
    if (match.homeClubId !== clubId && match.awayClubId !== clubId) {
      return reply.code(403).send({ error: 'No es tu partido' });
    }

    const body = z.object({
      text: z.string().min(1).max(500),
      minute: z.number().nullable().optional(),
    }).safeParse(request.body);

    if (!body.success) return reply.code(400).send({ error: 'Comentario no válido' });

    const comment = await prisma.matchComment.create({
      data: {
        matchId,
        userId,
        text: body.data.text.trim(),
        minute: body.data.minute ?? null,
      },
      include: {
        user: { select: { id: true, username: true, manager: { select: { id: true, name: true, club: { select: { shortName: true } } } } } }
      }
    });

    const payload = {
      id: comment.id,
      text: comment.text,
      minute: comment.minute,
      createdAt: comment.createdAt,
      author: {
        id: comment.user.id,
        username: comment.user.username,
        name: comment.user.manager?.name ?? comment.user.username,
        clubShortName: comment.user.manager?.club?.shortName ?? null,
      }
    };

    realtimeHub.broadcast(`match:${matchId}`, 'match:comment', payload);
    return reply.send(payload);
  });
}
