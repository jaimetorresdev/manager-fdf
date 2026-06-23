import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { scoutService } from './scout.service';

const assignSchema = z.object({
  scoutStaffId: z.number().int().positive(),
  clubTargetId: z.number().int().positive(),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

const hireScoutSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  candidateIndex: z.number().int().min(0).max(2).optional(),
  level: z.number().int().min(1).max(5).optional(),
  zone: z.string().min(2).max(60).optional(),
});

const assignZoneSchema = z.object({
  zone: z.string().min(2).max(60),
});

export async function scoutRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await scoutService.getOverview(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/assignments', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = assignSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await scoutService.assignScout(clubId, body.data.scoutStaffId, body.data.clubTargetId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/players', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await scoutService.getScoutedPlayers(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/players/:id/track', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid player id' });

    try {
      return reply.send(await scoutService.trackPlayer(clubId, params.data.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/staff', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await scoutService.getScoutStaff(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/staff/hire', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = hireScoutSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await scoutService.hireScout(clubId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/staff/:id/assign', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid scout id' });
    const body = assignZoneSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await scoutService.assignScoutZone(clubId, params.data.id, body.data.zone));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // AUDIT H-25: rate-limit + guarda por turno en el servicio impiden spamear el ojeo.
  app.post<{ Params: { id: string } }>('/assignments/:id/progress', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid assignment id' });

    try {
      return reply.send(await scoutService.progressAssignment(clubId, params.data.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.delete<{ Params: { id: string } }>('/assignments/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid assignment id' });

    try {
      return reply.send(await scoutService.cancelAssignment(clubId, params.data.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
