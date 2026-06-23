import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { academyService } from './academy.service';

export async function academyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/academy — academy state and youth players
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    try {
      return reply.send(await academyService.getAcademy(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/academy/expand — upgrade level or add residence
  app.post('/expand', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    const body = z.object({ type: z.enum(['level', 'residences']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid type (level | residences)' });

    try {
      return reply.send(await academyService.expand(clubId, body.data.type));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /api/academy/promote/:id — promote youth player to first team
  // F4: acepta términos de contrato opcionales { salary, years } (negociación).
  // Sin términos: contrato por defecto (demanda del juvenil, 3 años).
  app.post<{ Params: { id: string } }>('/promote/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    const body = z.object({
      salary: z.number().positive().optional(),
      years:  z.number().int().min(1).max(5).optional(),
    }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Invalid contract terms' });

    try {
      const player = await academyService.promotePlayer(clubId, parseInt(request.params.id, 10), body.data);
      return reply.code(201).send(player);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // DELETE /api/academy/dismiss/:id — dismiss youth player at no cost
  app.delete<{ Params: { id: string } }>('/dismiss/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    try {
      return reply.send(await academyService.dismissPlayer(clubId, parseInt(request.params.id, 10)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /api/academy/next-player — manually trigger youth player generation
  app.post('/next-player', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    try {
      const yp = await academyService.requestNextPlayer(clubId);
      return reply.code(201).send(yp);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // Legacy: POST /api/academy/accept (deprecated)
  app.post('/accept', async (_request, reply) => {
    return reply.code(410).send({ error: 'Deprecated: use POST /api/academy/next-player' });
  });

  // Legacy: POST /api/academy/upgrade — maps to expand
  app.post('/upgrade', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });

    const body = z.object({ type: z.enum(['capacity', 'level']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid upgrade type' });

    const mapped: 'level' | 'residences' = body.data.type === 'capacity' ? 'residences' : 'level';
    try {
      return reply.send(await academyService.expand(clubId, mapped));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
