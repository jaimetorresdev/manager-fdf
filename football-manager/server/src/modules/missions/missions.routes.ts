import type { FastifyInstance } from 'fastify';
import { requireRole } from '../../middleware/auth';
import { missionsService } from './missions.service';
import { weeklyMissionsService } from './weeklyMissions.service';

export async function missionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('manager'));

  app.get('/', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      const base = await missionsService.getMissions(managerId);
      // QW-20 (aditivo): misiones semanales con claim automático en el tick.
      const weekly = await weeklyMissionsService.getWeekly(managerId);
      return reply.send({ ...base, weekly });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Missions error';
      return reply.code(400).send({ error: msg });
    }
  });
}
