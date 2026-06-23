// ─── Elections Routes ──────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { electionsService } from './elections.service';
import prisma from '../../db/prisma';

const applySchema = z.object({ electionId: z.number().int().positive() });
const voteSchema = z.object({
  electionId: z.number().int().positive(),
  candidateManagerId: z.number().int().positive(),
});
const createElectionSchema = z.object({
  countryId: z.number().int().positive(),
});

export async function electionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /elections — list all elections
  app.get('/', async (request, reply) => {
    const q = z.object({
      countryId: z.coerce.number().int().positive().optional(),
      period: z.string().optional(),
    }).safeParse(request.query);
    try {
      return reply.send(await electionsService.list(q.success ? q.data : {}));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /elections/open — open (or return existing) election for a country
  app.post('/open', async (request, reply) => {
    const body = createElectionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      const state = await prisma.gameState.findFirst({ where: { isActive: true } });
      const inGameDate = state?.inGameDate ?? new Date();
      return reply.send(
        await electionsService.getOrCreateForCountry(body.data.countryId, inGameDate)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /elections/apply — apply as candidate
  app.post('/apply', async (request, reply) => {
    const body = applySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await electionsService.apply(request.user.userId, body.data.electionId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /elections/vote — cast a vote
  app.post('/vote', async (request, reply) => {
    const body = voteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(
        await electionsService.vote(
          request.user.userId,
          body.data.electionId,
          body.data.candidateManagerId
        )
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /elections/:id/close — manually close an election (admin-like action)
  app.post<{ Params: { id: string } }>('/:id/close', { preHandler: [requireAdmin] }, async (request, reply) => {
    const electionId = parseInt(request.params.id);
    if (Number.isNaN(electionId)) return reply.code(400).send({ error: 'ID no válido' });
    try {
      return reply.send(await electionsService.closeElection(electionId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /elections/:id — single election detail
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const electionId = parseInt(request.params.id);
    if (Number.isNaN(electionId)) return reply.code(400).send({ error: 'ID no válido' });
    try {
      const results = await electionsService.list({});
      const el = results.find((e) => e.id === electionId);
      if (!el) return reply.code(404).send({ error: 'Elección no encontrada' });
      return reply.send(el);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
