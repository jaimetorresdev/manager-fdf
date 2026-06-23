import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { friendliesService } from './friendlies.service';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';
import prisma from '../../db/prisma';

const createFriendlySchema = z.object({
  opponentClubId: z.number().int().positive(),
  dateTurn: z.string().datetime(),
});

const idParams = z.object({ id: z.coerce.number().int().positive() });

export async function friendliesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', featureGate('friendlies'));
  app.addHook('preHandler', maintenanceWriteGuard);

  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await friendliesService.list(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = createFriendlySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await friendliesService.create(clubId, body.data.opponentClubId, new Date(body.data.dateTurn)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid friendly id' });

    try {
      return reply.send(await friendliesService.cancel(clubId, params.data.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /friendlies/preseason — preseason window info + remaining slots
  app.get('/preseason', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      const state = await prisma.gameState.findFirst({ where: { isActive: true } });
      const inGameDate = state?.inGameDate ?? new Date();
      return reply.send(await friendliesService.preseasonInfo(clubId, inGameDate));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });
}
