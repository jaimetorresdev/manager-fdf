// ─── Game Routes ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { gameService } from './game.service';
import prisma from '../../db/prisma';
import { maintenanceWriteGuard } from '../master/governance.guard';
import { sortStandings, withHeadToHeadPoints } from './standings';
import { shouldHideResult } from '../matches/matchEventVisibility';
import { moneyToNumber } from '../../lib/roundMoney';

export async function gameRoutes(app: FastifyInstance) {

  // GET /api/game/dashboard
  app.get('/dashboard', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
      if (!manager || !manager.clubId) return reply.code(404).send({ error: 'Manager or Club not found' });
      
      const clubId = manager.clubId;

      // Q1 (BLOQUE Q): TODAS las queries de partidos filtran por TEMPORADA
      // ACTIVA. Con 13 temporadas en BD, el findFirst sin filtro cogía partidos
      // 'scheduled' huérfanos de temporadas viejas y arrastraba standings y
      // competición incorrectos (el "Centro de mando no carga datos").
      // (select sin seasonWeek: compat con cliente Prisma aún no regenerado;
      // se lee con cast defensivo, mismo patrón que transferAgreement)
      const activeState = await prisma.gameState.findFirst({
        where: { isActive: true },
        select: { seasonId: true, week: true },
      }) as { seasonId: number; week: number; seasonWeek?: number } | null;
      const seasonFilter = activeState
        ? { matchday: { competition: { seasonId: activeState.seasonId } } }
        : {};

      // Next Match
      const nextMatch = await prisma.match.findFirst({
        where: {
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
          status: 'scheduled',
          ...seasonFilter,
        },
        orderBy: { id: 'asc' },
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
          matchday: { include: { competition: { select: { name: true } } } }
        }
      });

      // Form (last 5 matches)
      const recentMatches = await prisma.match.findMany({
        where: {
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
          status: 'played',
          ...seasonFilter,
        },
        orderBy: { playedAt: 'desc' },
        take: 5,
        include: { homeClub: { select: { shortName: true } }, awayClub: { select: { shortName: true } } }
      });
      const seenRecent = recentMatches.length > 0
        ? await prisma.matchSeen.findMany({
            where: { userId: request.user.userId, matchId: { in: recentMatches.map((match) => match.id) } },
            select: { matchId: true },
          })
        : [];
      const seenRecentIds = new Set(seenRecent.map((row) => row.matchId));
      
      const form = recentMatches.map(m => {
        const hidden = shouldHideResult(m, clubId, request.user.userId, seenRecentIds.has(m.id));
        if (hidden) {
          const rival = m.homeClubId === clubId ? m.awayClub.shortName : m.homeClub.shortName;
          return { result: null, score: null, rival, resultHidden: true };
        }
        const isHome = m.homeClubId === clubId;
        const goalsFor = isHome ? m.homeGoals! : m.awayGoals!;
        const goalsAgainst = isHome ? m.awayGoals! : m.homeGoals!;
        const result = goalsFor > goalsAgainst ? 'V' : goalsFor === goalsAgainst ? 'E' : 'D';
        const score = isHome ? `${m.homeGoals}-${m.awayGoals}` : `${m.awayGoals}-${m.homeGoals}`;
        const rival = isHome ? m.awayClub.shortName : m.homeClub.shortName;
        return { result, score, rival, resultHidden: false };
      }).reverse();
      
      // Inbox — Q9: las preguntas de prensa legacy (type 'press_question')
      // viven en /api/press/pending, NUNCA en el feed de noticias.
      const unreadCount = await prisma.news.count({
        where: { recipientId: manager.id, isRead: false, type: { not: 'press_question' } },
      });
      const inbox = await prisma.news.findMany({
        where: { recipientId: manager.id, type: { not: 'press_question' } },
        orderBy: { createdAt: 'desc' },
        take: 5
      });
      
      // Board
      const confidences = await prisma.boardConfidence.findMany({
        where: { clubId },
        orderBy: { updatedAt: 'desc' },
        take: 1
      });
      const objectives = await prisma.boardObjective.findMany({
        where: { clubId }
      });
      
      // Mini-standings (top 5 or around club)
      // Q1: si no hay próximo partido (fin de temporada/pretemporada), caer a la
      // LIGA del club en la temporada activa en vez de dejar el panel vacío.
      let standingsCompetitionId: number | null = nextMatch?.matchday?.competitionId ?? null;
      if (!standingsCompetitionId && activeState) {
        const leagueStanding = await prisma.standing.findFirst({
          where: { clubId, competition: { seasonId: activeState.seasonId, type: 'league' } },
          select: { competitionId: true },
        });
        standingsCompetitionId = leagueStanding?.competitionId ?? null;
      }
      let standings: any[] = [];
      let rank = 0;
      if (standingsCompetitionId) {
        const [standingRows, standingMatches] = await Promise.all([
          prisma.standing.findMany({
            where: { competitionId: standingsCompetitionId },
            include: { club: { select: { name: true, shortName: true, badge: true } } }
          }),
          prisma.match.findMany({
            where: { matchday: { competitionId: standingsCompetitionId }, status: 'played' },
            select: {
              homeClubId: true,
              awayClubId: true,
              homeGoals: true,
              awayGoals: true,
              status: true,
            },
          }),
        ]);
        const fullStandings = sortStandings(withHeadToHeadPoints(standingRows, standingMatches));
        
        // Find club's rank
        const clubRankIndex = fullStandings.findIndex(s => s.clubId === clubId);
        if (clubRankIndex !== -1) {
          rank = clubRankIndex + 1;
          const start = Math.max(0, clubRankIndex - 2);
          const end = Math.min(fullStandings.length, clubRankIndex + 3);
          standings = fullStandings.slice(start, end).map((s, idx) => ({ ...s, rank: start + idx + 1 }));
        } else {
          standings = fullStandings.slice(0, 5).map((s, idx) => ({ ...s, rank: idx + 1 }));
        }
      }

      // KPIs
      const club = await prisma.club.findUnique({
        where: { id: clubId },
        include: { players: { select: { morale: true } } }
      });
      const avgMorale = club?.players.length ? Math.round(club.players.reduce((sum, p) => sum + p.morale, 0) / club.players.length) : 75;
      
      const kpis = {
        rank,
        fdfValuation: club?.fdfValuation || 0,
        prestige: manager.prestige || 0,
        cash: moneyToNumber(club?.cash),
        avgMorale
      };
      
      return reply.send({
        kpis,
        form,

        nextMatch,
        inbox,
        unreadNewsCount: unreadCount,
        board: { confidence: confidences[0], objectives },
        standings,
        // Q1/Q2 (aditivo): contexto de temporada para la UI.
        seasonId: activeState?.seasonId ?? null,
        seasonWeek: activeState?.seasonWeek ?? activeState?.week ?? null,
      });
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // GET /api/game/state — public game clock info
  app.get('/state', { preHandler: [authenticate] }, async (_request, reply) => {
    try {
      return reply.send(await gameService.getState());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/game/test-tactic — run a local simulation
  app.post<{ Body: { formation: string, construction: number, destruction: number } }>(
    '/test-tactic',
    { preHandler: [authenticate, maintenanceWriteGuard] },
    async (request, reply) => {
      try {
        if (!request.user.clubId) {
          return reply.code(400).send({ error: 'No tienes club' });
        }
        const result = await gameService.testTactic(request.user.clubId, request.body);
        return reply.send(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // POST /api/game/advance — ADMIN ONLY: advance week & simulate matches
  app.post('/advance', { preHandler: [requireAdmin, maintenanceWriteGuard] }, async (_request, reply) => {
    try {
      const result = await gameService.advanceWeek();
      return reply.send(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/game/simulate-match/:id — ADMIN ONLY: simulate a specific match
  app.post<{ Params: { id: string } }>(
    '/simulate-match/:id',
    { preHandler: [requireAdmin, maintenanceWriteGuard] },
    async (request, reply) => {
      try {
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) return reply.code(400).send({ error: 'Invalid match id' });
        const result = await gameService.simulateMatch(id);
        return reply.send(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // GET /api/game/notifications
  app.get('/notifications', { preHandler: [authenticate] }, async (request, reply) => {
    return reply.send(await gameService.getNotifications(request.user.userId));
  });

  // POST /api/game/notifications/:id/read
  app.post<{ Params: { id: string } }>(
    '/notifications/:id/read',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const id = parseInt(request.params.id, 10);
      if (isNaN(id)) return reply.code(400).send({ error: 'Invalid notification id' });
      await gameService.markNotificationRead(id, request.user.userId);
      return reply.send({ ok: true });
    }
  );

  // GET /api/game/tactics
  app.get('/tactics', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
      if (!manager) return reply.code(404).send({ error: 'Manager no encontrado' });
      const tactic = await prisma.tactic.findFirst({ where: { managerId: manager.id, isDefault: true } });
      return reply.send(tactic || {});
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // POST /api/game/tactics
  app.post<{ Body: { formation: string, construction: number, destruction: number, advanced?: any } }>(
    '/tactics',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
        if (!manager) return reply.code(404).send({ error: 'Manager no encontrado' });
        
        const tacticData = {
          name: 'Default',
          formation: request.body.formation || '4-4-2',
          construction: request.body.construction ?? 50,
          destruction: request.body.destruction ?? 50,
          subsLogic: request.body.advanced ? JSON.stringify(request.body.advanced) : null, // Storing advanced here
          isDefault: true
        };

        const existing = await prisma.tactic.findFirst({ where: { managerId: manager.id, isDefault: true } });
        if (existing) {
          const updated = await prisma.tactic.update({ where: { id: existing.id }, data: tacticData });
          return reply.send(updated);
        } else {
          const created = await prisma.tactic.create({ data: { ...tacticData, managerId: manager.id } });
          return reply.send(created);
        }
      } catch (err: unknown) {
        return reply.code(500).send({ error: String(err) });
      }
    }
  );

  // GET /api/game/inbox
  app.get('/inbox', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
      if (!manager) return reply.send([]);
      // Q9: las preguntas de prensa legacy no son noticias (viven en /api/press).
      const news = await prisma.news.findMany({
        where: { recipientId: manager.id, type: { not: 'press_question' } },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      return reply.send(news);
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  // POST /api/game/inbox/:id/read
  app.post<{ Params: { id: string } }>(
    '/inbox/:id/read',
    { preHandler: [authenticate] },
    async (request, reply) => {
      try {
        const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
        if (!manager) return reply.code(404).send({ error: 'Manager no encontrado' });
        const id = parseInt(request.params.id, 10);
        if (isNaN(id)) return reply.code(400).send({ error: 'Invalid news id' });
        await prisma.news.updateMany({
          where: { id, recipientId: manager.id },
          data: { isRead: true }
        });
        return reply.send({ ok: true });
      } catch (err: unknown) {
        return reply.code(500).send({ error: String(err) });
      }
    }
  );

  // GET /api/game/board
  app.get('/board', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const manager = await prisma.manager.findUnique({ where: { userId: request.user.userId } });
      if (!manager || !manager.clubId) return reply.code(404).send({ error: 'Sin club' });
      const confidences = await prisma.boardConfidence.findMany({
        where: { clubId: manager.clubId },
        orderBy: { updatedAt: 'desc' },
        take: 1
      });
      const objectives = await prisma.boardObjective.findMany({
        where: { clubId: manager.clubId }
      });
      return reply.send({ confidence: confidences[0], objectives });
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });
}
