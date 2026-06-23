import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatedRateLimitKey } from '../../lib/rateLimitIdentity';
import { requireRole } from '../../middleware/auth';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';
import { auctionsService } from './auctions.service';

const MAX_AUCTION_MONEY = 1_000_000_000;
const AUCTION_MUTATION_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 6,
      timeWindow: '1 minute',
      keyGenerator: authenticatedRateLimitKey,
    },
  },
};
const AUCTION_BID_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 6,
      timeWindow: '10 seconds',
      keyGenerator: authenticatedRateLimitKey,
    },
  },
};

const createAuctionSchema = z.object({
  listingId: z.number().int().positive(),
  durationSeconds: z.number().int().min(60).max(86_400).optional(),
  reservePrice: z.number().int().positive().max(MAX_AUCTION_MONEY).optional(),
});

const bidSchema = z.object({
  amount: z.number().int().positive().max(MAX_AUCTION_MONEY),
});

function positiveInt(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function auctionsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('manager'));
  app.addHook('preHandler', featureGate('market'));
  app.addHook('preHandler', maintenanceWriteGuard);

  app.get<{ Querystring: { status?: string; listingId?: string } }>('/', async (request, reply) => {
    const parsedListingId = request.query.listingId ? positiveInt(request.query.listingId) : null;
    if (request.query.listingId && !parsedListingId) return reply.code(400).send({ error: 'Invalid listingId' });
    try {
      return reply.send(await auctionsService.listAuctions({
        status: request.query.status,
        listingId: parsedListingId ?? undefined,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post('/', AUCTION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const body = createAuctionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await auctionsService.createAuction(clubId, body.data, app.log));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const auctionId = positiveInt(request.params.id);
    if (!auctionId) return reply.code(400).send({ error: 'Invalid auction id' });
    try {
      return reply.send(await auctionsService.getAuction(auctionId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 404).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string }; Querystring: { afterBidId?: string } }>('/:id/events', async (request, reply) => {
    const auctionId = positiveInt(request.params.id);
    if (!auctionId) return reply.code(400).send({ error: 'Invalid auction id' });
    const parsedAfterBidId = request.query.afterBidId ? positiveInt(request.query.afterBidId) : null;
    if (request.query.afterBidId && !parsedAfterBidId) return reply.code(400).send({ error: 'Invalid afterBidId' });
    try {
      return reply.send(await auctionsService.getEvents(
        auctionId,
        parsedAfterBidId ?? undefined,
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/bids', AUCTION_BID_RATE_LIMIT, async (request, reply) => {
    const { userId, managerId, clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const auctionId = positiveInt(request.params.id);
    if (!auctionId) return reply.code(400).send({ error: 'Invalid auction id' });
    const body = bidSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await auctionsService.placeBid(
        { userId, managerId, clubId },
        auctionId,
        body.data.amount,
        app.log,
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/close', AUCTION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const auctionId = positiveInt(request.params.id);
    if (!auctionId) return reply.code(400).send({ error: 'Invalid auction id' });

    try {
      return reply.send(await auctionsService.closeAuction(
        auctionId,
        { clubId },
        app.log,
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Auction error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });
}
