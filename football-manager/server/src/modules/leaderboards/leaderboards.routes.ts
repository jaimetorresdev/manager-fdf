
import { FastifyInstance } from 'fastify';
import prisma from '../../db/prisma';
import { MIN_RATING_MATCHES, seasonStatsWhere } from './leaderboards.logic';

async function activeSeasonId(): Promise<number | null> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true },
  });
  return state?.seasonId ?? null;
}

export async function leaderboardsRoutes(app: FastifyInstance) {
  app.get('/goals', async (request, reply) => {
    try {
      const seasonId = await activeSeasonId();
      if (!seasonId) return reply.send([]);
      const stats = await prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _sum: { goals: true, minutes: true },
        having: { goals: { _sum: { gt: 0 } } },
        orderBy: { _sum: { goals: 'desc' } },
        take: 20,
        where: seasonStatsWhere(seasonId),
      });
      
      const players = await prisma.player.findMany({
        where: { id: { in: stats.map(s => s.playerId) } },
        select: { id: true, name: true, club: { select: { shortName: true } } }
      });
      
      const results = stats.map(s => {
        const player = players.find(p => p.id === s.playerId);
        return {
          id: player?.id,
          name: player?.name,
          club: player?.club?.shortName,
          goals: s._sum.goals,
          minutes: s._sum.minutes
        };
      }).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0));
      
      return reply.send(results);
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  app.get('/assists', async (request, reply) => {
    try {
      const seasonId = await activeSeasonId();
      if (!seasonId) return reply.send([]);
      const stats = await prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _sum: { assists: true, minutes: true },
        having: { assists: { _sum: { gt: 0 } } },
        orderBy: { _sum: { assists: 'desc' } },
        take: 20,
        where: seasonStatsWhere(seasonId),
      });
      
      const players = await prisma.player.findMany({
        where: { id: { in: stats.map(s => s.playerId) } },
        select: { id: true, name: true, club: { select: { shortName: true } } }
      });
      
      const results = stats.map(s => {
        const player = players.find(p => p.id === s.playerId);
        return {
          id: player?.id,
          name: player?.name,
          club: player?.club?.shortName,
          assists: s._sum.assists,
          minutes: s._sum.minutes
        };
      }).sort((a, b) => (b.assists ?? 0) - (a.assists ?? 0));
      
      return reply.send(results);
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });
  app.get('/ratings', async (request, reply) => {
    try {
      const seasonId = await activeSeasonId();
      if (!seasonId) return reply.send([]);
      const stats = await prisma.playerMatchStat.groupBy({
        by: ['playerId'],
        _avg: { rating: true },
        _count: { matchId: true },
        having: { matchId: { _count: { gte: MIN_RATING_MATCHES } } },
        orderBy: { _avg: { rating: 'desc' } },
        take: 20,
        where: seasonStatsWhere(seasonId),
      });
      
      const players = await prisma.player.findMany({
        where: { id: { in: stats.map(s => s.playerId) } },
        select: { id: true, name: true, club: { select: { shortName: true } } }
      });
      
      const results = stats.map(s => {
        const player = players.find(p => p.id === s.playerId);
        return {
          id: player?.id,
          name: player?.name,
          club: player?.club?.shortName,
          rating: s._avg.rating ? parseFloat(s._avg.rating.toFixed(2)) : null,
          matches: s._count.matchId
        };
      }).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      
      return reply.send(results);
    } catch (err: unknown) {
      return reply.code(500).send({ error: String(err) });
    }
  });
}
