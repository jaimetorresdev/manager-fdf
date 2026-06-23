// ─── Shares Routes ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { sharesService } from './shares.service';

const buySchema = z.object({
  clubId: z.number().int().positive(),
  shares: z.number().int().min(1),
});

const sellSchema = z.object({
  clubId: z.number().int().positive(),
  shares: z.number().int().min(1),
});

export async function sharesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /shares/ranking — richest managers
  app.get('/ranking', async (_request, reply) => {
    try {
      return reply.send(await sharesService.richestManagers());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /shares/portfolio — cartera multipropiedad del usuario autenticado
  app.get('/portfolio', async (request, reply) => {
    try {
      return reply.send(await sharesService.getPortfolio(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /shares/:clubId/history — historico de precio por club
  app.get<{ Params: { clubId: string } }>('/:clubId/history', async (request, reply) => {
    const clubId = parseInt(request.params.clubId);
    if (Number.isNaN(clubId)) return reply.code(400).send({ error: 'Invalid clubId' });
    const query = z.object({ take: z.coerce.number().int().min(1).max(120).optional().default(30) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await sharesService.getClubPriceHistory(clubId, query.data.take));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /shares/:clubId — share breakdown for a club
  app.get<{ Params: { clubId: string } }>('/:clubId', async (request, reply) => {
    const clubId = parseInt(request.params.clubId);
    if (Number.isNaN(clubId)) return reply.code(400).send({ error: 'Invalid clubId' });
    try {
      return reply.send(await sharesService.getClubShares(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /shares/buy
  app.post('/buy', async (request, reply) => {
    const body = buySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(
        await sharesService.buyShares(request.user.userId, body.data.clubId, body.data.shares)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /shares/sell
  app.post('/sell', async (request, reply) => {
    const body = sellSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(
        await sharesService.sellShares(request.user.userId, body.data.clubId, body.data.shares)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
