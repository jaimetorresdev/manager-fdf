import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { chatService } from './chat.service';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';

const postMessageSchema = z.object({
  text: z.string().min(1).max(500),
});

const reactionSchema = z.object({
  emoji: z.string().min(1).max(8),
});

export async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', featureGate('chat'));
  app.addHook('preHandler', maintenanceWriteGuard);

  // GET /chat/channels — list all channels with message counts
  app.get('/channels', async (_request, reply) => {
    try {
      return reply.send(await chatService.getChannels());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /chat/tavern/events — titulares vivos para la taberna
  app.get<{ Querystring: { take?: string } }>('/tavern/events', async (request, reply) => {
    const take = request.query.take ? parseInt(request.query.take) : undefined;
    if (request.query.take && (isNaN(take!) || take! <= 0)) {
      return reply.code(400).send({ error: 'Parámetro take inválido' });
    }
    try {
      return reply.send(await chatService.getTavernEvents(take));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /chat/:channel — get messages by channel type name (e.g. 'general', 'league')
  // This is the primary polling endpoint: GET /chat/general?take=50&before=123
  app.get<{ Params: { channel: string } }>('/:channel/presence', async (request, reply) => {
    try {
      return reply.send(await chatService.getPresence(request.params.channel));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post<{ Params: { channel: string; messageId: string } }>(
    '/:channel/messages/:messageId/reactions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = reactionSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Reacción no válida' });
      const messageId = Number.parseInt(request.params.messageId, 10);
      if (!Number.isSafeInteger(messageId) || messageId <= 0) return reply.code(400).send({ error: 'ID de mensaje no válido' });
      try {
        const ch = await chatService.getChannelByType(request.params.channel);
        return reply.send(await chatService.toggleReaction(ch.id, messageId, request.user.userId, body.data.emoji));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.get<{
    Params: { channel: string };
    Querystring: { take?: string; before?: string };
  }>('/:channel', async (request, reply) => {
    const take = request.query.take ? parseInt(request.query.take) : 50;
    const before = request.query.before ? parseInt(request.query.before) : undefined;
    try {
      const ch = await chatService.getChannelByType(request.params.channel);
      return reply.send(await chatService.getMessages(ch.id, take, before, request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /chat/:channel — send message to channel by type name
  app.post<{ Params: { channel: string } }>(
    '/:channel',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = postMessageSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Mensaje no válido' });
      try {
        const ch = await chatService.getChannelByType(request.params.channel);
        return reply.send(await chatService.postMessage(ch.id, request.user.userId, body.data.text));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // ── Legacy routes by numeric channel id ──────────────────────────────────────
  app.get<{ Params: { id: string }; Querystring: { take?: string; before?: string } }>(
    '/channels/:id/messages',
    async (request, reply) => {
      const take = request.query.take ? parseInt(request.query.take) : 50;
      const before = request.query.before ? parseInt(request.query.before) : undefined;
      try {
        return reply.send(await chatService.getMessages(parseInt(request.params.id), take, before, request.user.userId));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    }
  );

  app.post<{ Params: { id: string } }>(
    '/channels/:id/messages',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = postMessageSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Mensaje no válido' });
      try {
        return reply.send(
          await chatService.postMessage(parseInt(request.params.id), request.user.userId, body.data.text)
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { id: string; messageId: string } }>(
    '/channels/:id/messages/:messageId/reactions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = reactionSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Reacción no válida' });
      const channelId = Number.parseInt(request.params.id, 10);
      const messageId = Number.parseInt(request.params.messageId, 10);
      if (!Number.isSafeInteger(channelId) || channelId <= 0 || !Number.isSafeInteger(messageId) || messageId <= 0) {
        return reply.code(400).send({ error: 'ID no válido' });
      }
      try {
        return reply.send(await chatService.toggleReaction(channelId, messageId, request.user.userId, body.data.emoji));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );
}
