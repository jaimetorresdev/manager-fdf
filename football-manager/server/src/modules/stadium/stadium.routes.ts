import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { stadiumService } from './stadium.service';

const upgradeSchema = z.object({
  type: z.enum(['north', 'south', 'east', 'west', 'seats', 'boxes', 'parking', 'sportsCity']),
  slot: z.number().int().min(0).max(4).optional(),
});

export async function stadiumRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/stadium — stadium state, works queue, metrics
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await stadiumService.getStadium(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/stadium/upgrade — enqueue a construction work
  app.post('/upgrade', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = upgradeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos', details: body.error.issues });

    try {
      return reply.send(await stadiumService.enqueueWork(clubId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /api/stadium/works — alias for upgrade (backwards compat)
  app.post('/works', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = upgradeSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await stadiumService.enqueueWork(clubId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
