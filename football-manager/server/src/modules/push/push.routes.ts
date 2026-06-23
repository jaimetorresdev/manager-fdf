import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { pushService } from './push.service';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().optional(),
    auth: z.string().optional(),
  }).optional(),
});

export async function pushRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/config', async (_request, reply) => {
    return reply.send(pushService.publicConfig());
  });

  app.post('/subscriptions', async (request, reply) => {
    const body = subscriptionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Suscripción no válida' });
    try {
      return reply.send(await pushService.subscribe(request.user.userId, body.data as any, request.headers['user-agent'] ?? null));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la suscripción';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/subscribe', async (request, reply) => {
    const body = subscriptionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Suscripción no válida' });
    try {
      return reply.send(await pushService.subscribe(request.user.userId, body.data as any, request.headers['user-agent'] ?? null));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la suscripción';
      return reply.code(400).send({ error: msg });
    }
  });

  app.delete('/subscriptions', async (request, reply) => {
    const body = z.object({ endpoint: z.string().url() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Endpoint no válido' });
    return reply.send(await pushService.unsubscribe(request.user.userId, body.data.endpoint));
  });

  app.delete('/subscribe', async (request, reply) => {
    const body = z.object({ endpoint: z.string().url() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Endpoint no válido' });
    return reply.send(await pushService.unsubscribe(request.user.userId, body.data.endpoint));
  });

  app.post(
    '/test',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = z.object({
        title: z.string().min(1).max(120).default('Manager FDF'),
        message: z.string().min(1).max(500).default('Notificación de prueba'),
      }).safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
      return reply.send(await pushService.notifyUser(request.user.userId, {
        type: 'push_test',
        title: body.data.title,
        message: body.data.message,
      }));
    },
  );
}
