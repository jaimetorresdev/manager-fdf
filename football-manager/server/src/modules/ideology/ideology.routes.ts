import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { ideologyService } from './ideology.service';

const valuesSchema = z.object({
  values: z.array(z.string().min(2).max(40)).min(1).max(6),
});

const emblematicSchema = z.object({
  playerId: z.number().int().positive(),
  retireYear: z.number().int().min(2002).max(2100),
});

export async function ideologyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/ideology — ideology state, values, emblematic players, bonuses
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await ideologyService.getIdeology(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // PUT /api/ideology/values — update ideology values (1-6 strings)
  app.put('/values', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = valuesSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await ideologyService.updateValues(clubId, body.data.values));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /api/ideology/eligible-emblematics — C2: retirados en el club con ≥450 PJ
  // aún fuera del pool (candidatos para el selector de IdeologyPage). Aditivo.
  app.get('/eligible-emblematics', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await ideologyService.getEligibleEmblematicCandidates(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /api/ideology/emblematic — C2: solo retirados en el club con ≥450 PJ allí
  app.post('/emblematic', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = emblematicSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(
        await ideologyService.addEmblematicPlayer(clubId, body.data.playerId, body.data.retireYear),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /api/ideology/unlock — Q7 · gastar puntos de ideología en una mejora
  // real (catálogo en GET /api/ideology → catalog). Persistido en IdeologyUnlock.
  app.post('/unlock', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({ key: z.string().min(3).max(60) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await ideologyService.unlockUpgrade(clubId, body.data.key));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // DELETE /api/ideology/emblematic/:id — remove emblematic player
  app.delete<{ Params: { id: string } }>('/emblematic/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(
        await ideologyService.removeEmblematicPlayer(clubId, parseInt(request.params.id, 10)),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
