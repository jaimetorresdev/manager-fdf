import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { messagesService } from './messages.service';

const sendSchema = z.object({
  toId: z.number().int().positive().optional(),
  toManagerId: z.number().int().positive().optional(),
  subject: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(4000),
}).refine((body) => body.toId || body.toManagerId, { message: 'Recipient required' });

export async function messagesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/inbox', async (request, reply) => {
    try {
      return reply.send(await messagesService.inbox(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/sent', async (request, reply) => {
    try {
      return reply.send(await messagesService.sent(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/conversations', async (request, reply) => {
    try {
      return reply.send(await messagesService.conversations(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get<{ Params: { managerId: string }, Querystring: { limit?: string } }>('/thread/:managerId', async (request, reply) => {
    const managerId = Number.parseInt(request.params.managerId, 10);
    const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 50;
    if (!Number.isSafeInteger(managerId) || managerId <= 0) return reply.code(400).send({ error: 'Invalid manager id' });
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 200) return reply.code(400).send({ error: 'Invalid limit' });

    try {
      return reply.send(await messagesService.thread(request.user.userId, managerId, limit));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // AUDIT H-41: read-receipt de hilo (marca leídos los mensajes del otro mánager).
  app.post<{ Params: { managerId: string } }>('/thread/:managerId/read', async (request, reply) => {
    const managerId = Number.parseInt(request.params.managerId, 10);
    if (!Number.isSafeInteger(managerId) || managerId <= 0) return reply.code(400).send({ error: 'Invalid manager id' });
    try {
      return reply.send(await messagesService.markThreadRead(request.user.userId, managerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post(
    '/',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = sendSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

      try {
        const subject = body.data.subject ?? 'Mensaje directo';
        if (body.data.toManagerId) {
          return reply.send(await messagesService.sendToManager(request.user.userId, body.data.toManagerId, subject, body.data.body));
        }
        return reply.send(await messagesService.send(request.user.userId, body.data.toId!, subject, body.data.body));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    // AUDIT 5.8: validar el id (antes parseInt → NaN llegaba a Prisma).
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid message id' });
    try {
      return reply.send(await messagesService.markRead(request.user.userId, id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // DELETE /messages/:id — delete a message (sender or recipient)
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    // AUDIT 5.8: validar el id (antes parseInt → NaN llegaba a Prisma).
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid message id' });
    try {
      return reply.send(
        await messagesService.deleteMessage(request.user.userId, id)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /messages/read-all — mark all inbox messages as read
  app.post('/read-all', async (request, reply) => {
    try {
      return reply.send(await messagesService.markAllRead(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /messages/unread-count
  app.get('/unread-count', async (request, reply) => {
    try {
      return reply.send(await messagesService.unreadCount(request.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });
}
