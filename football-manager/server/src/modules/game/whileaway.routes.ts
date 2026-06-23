// ─── QW-29 · «Mientras no estabas» ───────────────────────────────────────────
// GET /api/dashboard/while-away — digest por secciones desde User.lastLoginAt.
// Como el login ACTUALIZA lastLoginAt antes de que el front pueda pedir el
// digest, se acepta ?since=ISO (el login devuelve previousLoginAt para esto);
// sin parámetro: lastLoginAt si tiene >30 min, si no las últimas 72h.
import { FastifyInstance } from 'fastify';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/auth';
import { isResultSeen, shouldHideResult } from '../matches/matchEventVisibility';
import { competitionKind } from '../matches/matches.routes';
import { advisorService, youthName } from '../club/advisor.service';
import { sortStandings, withHeadToHeadPoints } from './standings';

const CLUB_SELECT = { id: true, name: true, shortName: true, badge: true } as const;
const FALLBACK_HOURS = 72;
const FRESH_LOGIN_MINUTES = 30;

/** Compartido con zone-badges (QW-10): mismo criterio de "desde cuándo hay novedades". */
export async function resolveSince(userId: number, sinceParam?: string): Promise<Date> {
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastLoginAt: true },
  });
  const fallback = new Date(Date.now() - FALLBACK_HOURS * 60 * 60 * 1000);
  if (!user?.lastLoginAt) return fallback;
  const minutesAgo = (Date.now() - user.lastLoginAt.getTime()) / 60000;
  // El login de esta misma sesión ya pisó lastLoginAt: no sirve como "desde".
  return minutesAgo < FRESH_LOGIN_MINUTES ? fallback : user.lastLoginAt;
}

export async function whileAwayRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { since?: string } }>('/while-away', async (request, reply) => {
    const { clubId, userId, managerId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    try {
      const since = await resolveSince(userId, request.query.since);
      const state = await prisma.gameState.findFirst({
        where: { isActive: true },
        select: { seasonId: true },
      });
      const seasonFilter = state
        ? { matchday: { competition: { seasonId: state.seasonId } } }
        : {};

      // ── Mis partidos jugados desde entonces (E15: resultado oculto si no visto)
      const myMatches = await prisma.match.findMany({
        where: {
          status: 'played',
          playedAt: { gte: since },
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
          ...seasonFilter,
        },
        orderBy: { id: 'asc' },
        include: {
          homeClub: { select: CLUB_SELECT },
          awayClub: { select: CLUB_SELECT },
          matchday: { include: { competition: { select: { name: true, shortName: true, type: true } } } },
        },
      });
      const seenRows = myMatches.length
        ? await prisma.matchSeen.findMany({
            where: { userId, matchId: { in: myMatches.map((m) => m.id) } },
            select: { matchId: true },
          })
        : [];
      const seenIds = new Set(seenRows.map((r) => r.matchId));
      const myMatchesPayload = myMatches.map((m) => {
        const hidden = !seenIds.has(m.id) && !isResultSeen(m.homeStatsJson, userId);
        const home = m.homeClubId === clubId;
        return {
          id: m.id,
          rival: home ? m.awayClub : m.homeClub,
          home,
          homeGoals: hidden ? null : m.homeGoals,
          awayGoals: hidden ? null : m.awayGoals,
          resultHidden: hidden,
          competitionKind: competitionKind(m.matchday?.competition),
          playedAt: m.playedAt,
        };
      });

      // ── Qué hizo el rival de la semana (QW-7)
      let rivalWatch: Array<Record<string, unknown>> = [];
      try {
        const rivalWeek = await advisorService.getRivalOfTheWeek(clubId);
        if (rivalWeek.rival) {
          const rivalId = rivalWeek.rival.id;
          const rivalMatches = await prisma.match.findMany({
            where: {
              status: 'played',
              playedAt: { gte: since },
              OR: [{ homeClubId: rivalId }, { awayClubId: rivalId }],
              ...seasonFilter,
            },
            orderBy: { id: 'asc' },
            select: { id: true, homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true, homeStatsJson: true },
            take: 5,
          });
          rivalWatch = rivalMatches.map((m) => {
            // E15: si el partido implica al propio club y aún no fue visto, ocultar marcador
            const hidden = shouldHideResult(
              { status: 'played', homeClubId: m.homeClubId, awayClubId: m.awayClubId, homeStatsJson: m.homeStatsJson },
              clubId,
              request.user.userId,
            );
            if (hidden) return { matchId: m.id, rival: rivalWeek.rival, score: null, result: null, resultHidden: true };
            const rivalGoals = m.homeClubId === rivalId ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
            const otherGoals = m.homeClubId === rivalId ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
            return {
              matchId: m.id,
              rival: rivalWeek.rival,
              score: `${m.homeGoals ?? 0}-${m.awayGoals ?? 0}`,
              result: rivalGoals > otherGoals ? 'won' : rivalGoals === otherGoals ? 'draw' : 'lost',
            };
          });
        }
      } catch { /* rival opcional: el digest no debe romperse por esto */ }

      // ── Ofertas: recibidas pendientes + resueltas desde entonces
      const offerInclude = {
        player: { select: { id: true, name: true, position: true } },
        fromClub: { select: CLUB_SELECT },
        toClub: { select: CLUB_SELECT },
      } as const;
      const [received, resolved] = await Promise.all([
        prisma.transferOffer.findMany({
          where: { toClubId: clubId, status: 'pending', createdAt: { gte: since } },
          include: offerInclude,
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.transferOffer.findMany({
          where: {
            fromClubId: clubId,
            status: { in: ['accepted', 'accepted_pending_window', 'rejected', 'expired'] },
            updatedAt: { gte: since },
          },
          include: offerInclude,
          orderBy: { updatedAt: 'desc' },
          take: 10,
        }),
      ]);
      const offers = {
        received: received.map((o) => ({
          id: o.id,
          player: o.player.name,
          playerId: o.player.id,
          fromClub: o.fromClub.shortName,
          amount: o.amount,
          status: o.status,
        })),
        resolved: resolved.map((o) => ({
          id: o.id,
          player: o.player.name,
          playerId: o.player.id,
          toClub: o.toClub?.shortName ?? null,
          amount: o.amount,
          status: o.status,
        })),
      };

      // ── Cambio de posición en la liga: tabla actual vs tabla "rebobinada"
      // (restando los partidos de liga jugados desde `since`).
      let standingsSection: Record<string, unknown> | null = null;
      if (state) {
        const myStanding = await prisma.standing.findFirst({
          where: { clubId, competition: { seasonId: state.seasonId, type: 'league' } },
          include: { competition: { select: { id: true, name: true } } },
        });
        if (myStanding) {
          const [table, recentLeagueMatches, allLeagueMatches] = await Promise.all([
            prisma.standing.findMany({
              where: { competitionId: myStanding.competitionId },
              select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
            }),
            prisma.match.findMany({
              where: {
                status: 'played',
                playedAt: { gte: since },
                matchday: { competitionId: myStanding.competitionId },
              },
              select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
            }),
            prisma.match.findMany({
              where: {
                status: 'played',
                matchday: { competitionId: myStanding.competitionId },
              },
              select: {
                homeClubId: true,
                awayClubId: true,
                homeGoals: true,
                awayGoals: true,
                status: true,
                playedAt: true,
              },
            }),
          ]);
          const rank = (
            rows: Array<{ clubId: number; points: number; goalsFor: number; goalsAgainst: number }>,
            matches: typeof allLeagueMatches,
          ) => {
            const sorted = sortStandings(withHeadToHeadPoints(rows, matches));
            return sorted.findIndex((row) => row.clubId === clubId) + 1;
          };
          const position = rank(table, allLeagueMatches);
          // Rebobinar: restar puntos/goles de los partidos desde `since`.
          const rewound = table.map((row) => ({ ...row }));
          const byId = new Map(rewound.map((row) => [row.clubId, row]));
          for (const m of recentLeagueMatches) {
            const home = byId.get(m.homeClubId);
            const away = byId.get(m.awayClubId);
            const hg = m.homeGoals ?? 0;
            const ag = m.awayGoals ?? 0;
            if (home) {
              home.goalsFor -= hg; home.goalsAgainst -= ag;
              home.points -= hg > ag ? 3 : hg === ag ? 1 : 0;
            }
            if (away) {
              away.goalsFor -= ag; away.goalsAgainst -= hg;
              away.points -= ag > hg ? 3 : hg === ag ? 1 : 0;
            }
          }
          const previousPosition = rank(
            rewound,
            allLeagueMatches.filter((match) => !match.playedAt || match.playedAt < since),
          );
          standingsSection = {
            position,
            previousPosition,
            delta: previousPosition - position,
            league: myStanding.competition.name,
          };
        }
      }

      // ── Cantera: juveniles listos para promocionar
      const academy = await prisma.youthAcademy.findUnique({
        where: { clubId },
        include: { youthPlayers: { select: { age: true, potential: true, attributes: true } } },
      });
      const academySection = (academy?.youthPlayers ?? [])
        .filter((y) => y.age >= 17 && y.potential >= 75)
        .slice(0, 5)
        .map((y) => ({ name: youthName(y.attributes), age: y.age, note: 'listo para promocionar' }));

      // ── Lesiones y sanciones nuevas
      const [injuries, suspensions] = await Promise.all([
        prisma.injury.findMany({
          where: { createdAt: { gte: since }, weeksLeft: { gt: 0 }, player: { clubId } },
          include: { player: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.suspension.findMany({
          where: { createdAt: { gte: since }, player: { clubId } },
          include: { player: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);
      const health = {
        injuries: injuries.map((i) => ({ player: i.player.name, type: i.type, weeksLeft: i.weeksLeft })),
        suspensions: suspensions.map((s) => ({ player: s.player.name, matches: s.matches, reason: s.reason })),
      };

      // ── Noticias clave (sin press_question legacy)
      const news = await prisma.news.findMany({
        where: {
          recipientId: managerId,
          createdAt: { gte: since },
          type: { not: 'press_question' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, type: true, subject: true, createdAt: true },
      });

      return reply.send({
        since,
        sections: {
          myMatches: myMatchesPayload,
          rivalWatch,
          offers,
          standings: standingsSection,
          academy: academySection,
          health,
          news,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el resumen';
      return reply.code(500).send({ error: msg });
    }
  });
}
