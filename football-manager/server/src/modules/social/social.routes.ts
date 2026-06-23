import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { goalOfWeekService } from './goalOfWeek.service';

const voteSchema = z.object({
  goalKey: z.string().min(1).max(220),
  weekKey: z.string().max(40).optional(),
});

export async function socialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { weekKey?: string } }>('/goal-of-week', async (request, reply) => {
    const { userId, managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });
    try {
      return reply.send(await goalOfWeekService.getGoalOfWeek({
        userId,
        managerId,
        weekKey: request.query.weekKey,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar el gol de la semana';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post(
    '/goal-of-week/vote',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { userId, managerId } = request.user;
      if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });
      const body = voteSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Voto no válido' });
      try {
        return reply.send(await goalOfWeekService.voteGoalOfWeek({
          userId,
          managerId,
          goalKey: body.data.goalKey,
          weekKey: body.data.weekKey,
        }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo votar';
        return reply.code(400).send({ error: msg });
      }
    },
  );
}
