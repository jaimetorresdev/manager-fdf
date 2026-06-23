// ─── Forum Routes ──────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';
import { forumService } from './forum.service';

const createThreadSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(3).max(200),
  text: z.string().min(5).max(10000),
});

const replySchema = z.object({
  text: z.string().min(1).max(5000),
});

export async function forumRoutes(app: FastifyInstance) {
  // AUDIT 5.8: el foro carecía de feature flag y de guarda de mantenimiento (a diferencia
  // del chat). Se alinea con chat.routes: `featureGate('forum')` permite a master desactivar
  // el módulo y `maintenanceWriteGuard` bloquea escrituras en modo mantenimiento.
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', featureGate('forum'));
  app.addHook('preHandler', maintenanceWriteGuard);

  // GET /forum/threads — list all threads (query ?category=dudas)
  app.get('/threads', async (request, reply) => {
    const q = z.object({ category: z.string().optional() }).safeParse(request.query);
    const category = q.success ? q.data.category : undefined;
    try {
      return reply.send(await forumService.listThreads(category));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // POST /forum/threads — create thread with first post
  app.post(
    '/threads',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = createThreadSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
      try {
        return reply.send(
          await forumService.createThread(
            request.user.userId,
            body.data.category,
            body.data.title,
            body.data.text
          )
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  // GET /forum/threads/:id — thread detail with posts
  app.get<{ Params: { id: string } }>('/threads/:id', async (request, reply) => {
    const threadId = parseInt(request.params.id);
    if (Number.isNaN(threadId)) return reply.code(400).send({ error: 'Invalid id' });
    try {
      return reply.send(await forumService.getThread(threadId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /forum/threads/:id/reply — reply to thread
  app.post<{ Params: { id: string } }>(
    '/threads/:id/reply',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const threadId = parseInt(request.params.id);
      if (Number.isNaN(threadId)) return reply.code(400).send({ error: 'Invalid id' });
      const body = replySchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
      try {
        return reply.send(await forumService.reply(request.user.userId, threadId, body.data.text));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );
}
