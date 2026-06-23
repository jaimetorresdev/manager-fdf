import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/prisma';

export async function awardsRoutes(app: FastifyInstance) {
  
  app.get('/', async (request, reply) => {
    const querySchema = z.object({ season: z.string().optional() });
    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });

    const where = query.data.season ? { season: query.data.season } : {};
    const awards = await prisma.award.findMany({
      where,
      include: {
        player: { select: { id: true, name: true, position: true } },
        club: { select: { id: true, name: true, shortName: true, badge: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send(awards);
  });

  app.get('/club/:id/honours', async (request, reply) => {
    const id = parseInt((request.params as any).id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid club id' });

    const [honours, seasonHistories] = await Promise.all([
      prisma.honour.findMany({
        where: { clubId: id },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.seasonHistory.findMany({
        where: { clubId: id },
        include: { competition: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return reply.send({ honours, history: seasonHistories });
  });
}
