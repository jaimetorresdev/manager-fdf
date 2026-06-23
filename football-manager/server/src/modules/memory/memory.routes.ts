import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { memoryService } from './memory.service';

const headToHeadSchema = z.object({
  clubA: z.coerce.number().int().positive(),
  clubB: z.coerce.number().int().positive(),
});

const pagingSchema = z.object({
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

const palmaresSchema = pagingSchema.extend({
  season: z.string().trim().min(1).optional(),
  clubId: z.coerce.number().int().positive().optional(),
  playerId: z.coerce.number().int().positive().optional(),
  competitionId: z.coerce.number().int().positive().optional(),
});

const archiveSchema = pagingSchema.extend({
  q: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  // AUDIT 3.1: managerId/clubId retirados del query — la hemeroteca se restringe
  // siempre al mánager autenticado (request.user.managerId), no a un id del query.
});

const recordsSchema = z.object({
  take: z.coerce.number().int().min(1).max(50).optional(),
});

export async function memoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/overview', async (request, reply) => {
    try {
      return reply.send(await memoryService.overview(request.user.managerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/head-to-head', async (request, reply) => {
    const query = headToHeadSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await memoryService.headToHead(query.data.clubA, query.data.clubB));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/palmares', async (request, reply) => {
    const query = palmaresSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await memoryService.palmares(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/archive', async (request, reply) => {
    const query = archiveSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await memoryService.archive(query.data, request.user.managerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/records', async (request, reply) => {
    const query = recordsSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await memoryService.records(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get<{ Params: { clubId: string } }>('/clubs/:clubId/legends', async (request, reply) => {
    const clubId = Number.parseInt(request.params.clubId, 10);
    if (!Number.isSafeInteger(clubId) || clubId <= 0) return reply.code(400).send({ error: 'Invalid club id' });
    try {
      return reply.send(await memoryService.legends(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
