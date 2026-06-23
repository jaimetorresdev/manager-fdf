import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { nationalService } from './national.service';

export async function nationalRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/teams', async (request, reply) => {
    try {
      const teams = await nationalService.getNationalTeams();
      return reply.send(teams);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get('/my-team', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });
    try {
      const team = await nationalService.getMyNationalTeam(userId);
      return reply.send(team || { notManager: true });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post('/apply', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });

    const body = z.object({ countryId: z.number() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      const result = await nationalService.applyForManager(userId, body.data.countryId);
      return reply.send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/call-up', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });

    const body = z.object({ playerId: z.number() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      const result = await nationalService.callPlayer(userId, body.data.playerId);
      return reply.send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.delete<{ Params: { id: string } }>('/call-up/:id', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });

    try {
      const callId = parseInt(request.params.id);
      const result = await nationalService.uncallPlayer(userId, callId);
      return reply.send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
