import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { fansService } from './fans.service';

const campaignSchema = z.object({
  type: z.enum(['familyDay', 'schoolProgram', 'vipHospitality', 'cityCampaign', 'derbyHype']),
});

export async function fansRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/fans — fan base state, segments, campaigns
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await fansService.getFans(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/fans/analysis — evolución, conversión taquilla y comparativa
  app.get('/analysis', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await fansService.getAnalysis(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/fans/mood — QW-4: humor de la afición (fuente única de verdad)
  app.get('/mood', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await fansService.getMood(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/fans/campaigns — start a fan campaign
  app.post('/campaigns', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = campaignSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid campaign type' });

    try {
      return reply.send(await fansService.startCampaign(clubId, body.data.type));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
