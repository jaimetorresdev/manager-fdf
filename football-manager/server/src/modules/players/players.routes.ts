// ─── Players Routes ───────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { playersService } from './players.service';

function positiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function playersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/players — my squad
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    return reply.send(await playersService.getSquad(clubId));
  });

  // GET /api/players/loaned-out — jugadores propios cedidos a otros clubes
  app.get('/loaned-out', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    return reply.send(await playersService.getLoanedOut(clubId));
  });

  // GET /api/players/:id
  
  // GET /api/players/public/:id
  app.get<{ Params: { id: string } }>('/public/:id', async (request, reply) => {
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });
    try {
      const player = await playersService.getPlayerPublic(playerId);
      return reply.send(player);
    } catch {
      return reply.code(404).send({ error: 'Player not found' });
    }
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });
    try {
      const player = await playersService.getPlayer(playerId, clubId);
      return reply.send(player);
    } catch {
      return reply.code(404).send({ error: 'Player not found' });
    }
  });

  // PATCH /api/players/:id/starter
  app.patch<{ Params: { id: string } }>('/:id/starter', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({ isStarter: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });

    try {
      const player = await playersService.setStarter(
        playerId,
        clubId,
        body.data.isStarter
      );
      return reply.send(player);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // PATCH /api/players/:id/sell
  app.patch<{ Params: { id: string } }>('/:id/sell', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      forSale: z.boolean(),
      price:   z.number().optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });

    try {
      const player = await playersService.setForSale(
        playerId,
        clubId,
        body.data.forSale,
        body.data.price
      );
      return reply.send(player);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // PATCH /api/players/:id/position
  app.patch<{ Params: { id: string } }>('/:id/position', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({ position: z.enum(['DEF', 'MED', 'DEL']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });

    try {
      return reply.send(await playersService.repositionPlayer(playerId, clubId, body.data.position));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/inspect', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const playerId = positiveInt(request.params.id);
    if (!playerId) return reply.code(400).send({ error: 'Invalid player id' });
    try {
      return reply.send(await playersService.inspectPlayer(playerId, clubId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });
}
