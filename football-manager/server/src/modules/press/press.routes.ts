import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { pressService } from './press.service';

export async function pressRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/pending', async (request, reply) => {
    const { managerId, clubId } = request.user;
    if (!managerId || !clubId) return reply.code(400).send({ error: 'No manager/club' });
    try {
      return reply.send(await pressService.pending(managerId, clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Press error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/answer', async (request, reply) => {
    const { managerId, clubId } = request.user;
    if (!managerId || !clubId) return reply.code(400).send({ error: 'No manager/club' });
    const body = z.object({
      questionId: z.number().int().positive(),
      choice: z.enum(['humble', 'neutral', 'aggressive']),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await pressService.answer(managerId, clubId, body.data.questionId, body.data.choice));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Press error';
      return reply.code(400).send({ error: msg });
    }
  });
}
