// ─── Rutas del motor de simulación (preview sin persistir) ────────────────────
// Permite previsualizar un partido entre dos clubes (o un Match existente) con
// el motor por fases FDF, devolviendo replay + ratings sin escribir en BD.
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/auth';
import { simulateGame, buildRoster } from './engineClient';
import { isResultSeenForMatch } from '../matches/matchEventVisibility';
import type { TacticInput } from './simulation.engine';
import { persistedMatchPreview, previewMatchSeed } from './previewSeed';

const DEFAULT_TACTIC: TacticInput = {
  formation: '4-4-2',
  mentality: 'balanced',
} as unknown as TacticInput;

async function rosterForClub(clubId: number, inGameDate?: Date) {
  const players = await prisma.player.findMany({
    where: { clubId },
    include: {
      injuries: { where: { weeksLeft: { gt: 0 } } },
      suspensions: { where: { matches: { gt: 0 } } },
    },
  });
  return buildRoster(players as unknown as Array<Record<string, unknown>>, undefined, inGameDate);
}

export async function simulationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /api/simulation/preview { homeClubId, awayClubId, seed? }
  app.post('/preview', async (request, reply) => {
    const body = z
      .object({
        homeClubId: z.number(),
        awayClubId: z.number(),
        seed: z.number().optional(),
      })
      .safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body' });

    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
    if (!state) return reply.code(503).send({ error: 'No active game state' });
    const [home, away] = await Promise.all([
      rosterForClub(body.data.homeClubId, state.inGameDate),
      rosterForClub(body.data.awayClubId, state.inGameDate),
    ]);
    if (!home.length || !away.length) {
      return reply.code(404).send({ error: 'Club sin plantilla' });
    }

    const seed = body.data.seed ?? (body.data.homeClubId * 1009 + body.data.awayClubId);
    const result = await simulateGame(
      home,
      away,
      DEFAULT_TACTIC,
      DEFAULT_TACTIC,
      seed,
    );
    return reply.send(result);
  });

  // GET /api/simulation/preview/:matchId — previsualiza un Match programado
  app.get<{ Params: { matchId: string } }>('/preview/:matchId', async (request, reply) => {
    const matchId = Number(request.params.matchId);
    if (!Number.isFinite(matchId)) return reply.code(400).send({ error: 'Bad matchId' });

    const match = await prisma.match.findUnique({ where: { id: matchId } });
    if (!match) return reply.code(404).send({ error: 'Match not found' });

    const clubId = request.user.clubId;
    if (!clubId || (match.homeClubId !== clubId && match.awayClubId !== clubId)) {
      return reply.code(403).send({ error: 'Solo puedes previsualizar partidos de tu club' });
    }
    if (match.status === 'played') {
      const seen = await isResultSeenForMatch(matchId, match.homeStatsJson, request.user.userId);
      if (!seen) {
        return reply.code(403).send({ error: 'Resultado no visto' });
      }
      return reply.send(persistedMatchPreview(match));
    }

    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
    if (!state) return reply.code(503).send({ error: 'No active game state' });
    const [home, away] = await Promise.all([
      rosterForClub(match.homeClubId, state.inGameDate),
      rosterForClub(match.awayClubId, state.inGameDate),
    ]);
    const result = await simulateGame(home, away, DEFAULT_TACTIC, DEFAULT_TACTIC, previewMatchSeed(matchId));
    return reply.send(result);
  });
}
