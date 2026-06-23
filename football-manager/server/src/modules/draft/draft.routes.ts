import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { draftService } from './draft.service';

const pickSchema = z.object({ playerId: z.number().int().positive() });
const startSchema = z.object({ rounds: z.number().int().min(1).max(10).optional() });

export async function draftRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('manager'));

  app.get('/', async (_request, reply) => {
    try {
      return reply.send(await draftService.getDraftState());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Draft error';
      return reply.code(400).send({ error: msg });
    }
  });

  // AUDIT H-26: selección real con validación de turno y avance atómico.
  app.post('/pick', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const body = pickSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'playerId requerido' });
    try {
      return reply.send(await draftService.makePick(clubId, body.data.playerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Draft error';
      return reply.code(400).send({ error: msg });
    }
  });

  // Inicio del draft (administrativo).
  app.post('/start', { preHandler: requireRole('admin') }, async (request, reply) => {
    const body = startSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'rounds inválido' });
    try {
      return reply.send(await draftService.startDraft(body.data.rounds ?? 1));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Draft error';
      return reply.code(400).send({ error: msg });
    }
  });
}
