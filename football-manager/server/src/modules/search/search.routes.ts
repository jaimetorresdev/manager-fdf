import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { searchService } from './search.service';

const querySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(25).optional().default(8),
});

export async function searchRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid query' });

    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await searchService.global(parsed.data.q, parsed.data.limit, clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });
}
