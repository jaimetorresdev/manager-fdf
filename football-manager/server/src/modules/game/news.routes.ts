import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/auth';
import { effectsForManager } from '../manager/skillEffects';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  clubId: z.coerce.number().int().positive().optional(),
});

const pressConferenceSchema = z.object({
  topic: z.enum(['pre_match', 'post_match', 'transfer', 'board', 'fans']).default('post_match'),
  tone: z.enum(['calm', 'ambitious', 'protective', 'critical']),
  quote: z.string().min(4).max(500),
});

const toneEffects = {
  calm: { reputation: 0, fans: 80, morale: 1 },
  ambitious: { reputation: 1, fans: 120, morale: 0 },
  protective: { reputation: 0, fans: 40, morale: 2 },
  critical: { reputation: -1, fans: -120, morale: -1 },
} as const;

export async function newsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const { userId } = request.user;
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });

    const query = querySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });

    const { page, limit, clubId } = query.data;
    const skip = (page - 1) * limit;

    // We fetch PressItems and News for this manager and combine them. 
    // Or maybe just return them separately? The prompt says "feed paginado de PressItem y los News (bandeja de entrada) ... con opción de filtro por club".
    // "GET /api/news (feed paginado, filtrable por club) y marcar leído."
    
    // Feed = PressItems. 
    // Inbox = News.
    // Let's just return both in an object if no type is specified, or combine them?
    // Let's return them separately in the same payload for ease of use.
    
    // P3 #128: el filtro por club ahora es REAL (antes clubId se validaba y se
    // ignoraba). PressItem no tiene columna clubId, así que se filtra por mención
    // del nombre del club en titular o cuerpo.
    let pressWhere: Record<string, unknown> = {};
    if (clubId) {
      const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } });
      if (club) {
        pressWhere = {
          OR: [
            { headline: { contains: club.name } },
            { content: { contains: club.name } },
          ],
        };
      }
    }

    // Q9 (BLOQUE Q): las preguntas de rueda de prensa legacy (News con
    // type 'press_question') NO son noticias — viven en /api/press/pending.
    // Sin este filtro, "Actualidad" se llenaba de preguntas sin responder.
    const inboxWhere = { recipientId: manager.id, type: { not: 'press_question' } };
    const [pressTotal, pressItems, inboxTotal, inboxItems] = await Promise.all([
      prisma.pressItem.count({ where: pressWhere }),
      prisma.pressItem.findMany({
        where: pressWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.news.count({ where: inboxWhere }),
      prisma.news.findMany({
        where: inboxWhere,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      })
    ]);

    return reply.send({
      press: {
        data: pressItems,
        total: pressTotal,
        page,
        totalPages: Math.ceil(pressTotal / limit)
      },
      inbox: {
        data: inboxItems,
        total: inboxTotal,
        page,
        totalPages: Math.ceil(inboxTotal / limit)
      }
    });
  });

  app.put<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const { userId } = request.user;
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });

    const id = parseInt(request.params.id, 10);
    if (isNaN(id)) return reply.code(400).send({ error: 'Invalid news id' });
    try {
      await prisma.news.updateMany({
        where: { id, recipientId: manager.id },
        data: { isRead: true }
      });
      return reply.send({ ok: true });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/press-conference/options', async (_request, reply) => {
    return reply.send({
      topics: ['pre_match', 'post_match', 'transfer', 'board', 'fans'],
      tones: [
        { id: 'calm', label: 'Sereno', effects: toneEffects.calm },
        { id: 'ambitious', label: 'Ambicioso', effects: toneEffects.ambitious },
        { id: 'protective', label: 'Protector', effects: toneEffects.protective },
        { id: 'critical', label: 'Crítico', effects: toneEffects.critical },
      ],
    });
  });

  app.post('/press-conference', async (request, reply) => {
    const { userId, clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const manager = await prisma.manager.findUnique({ where: { userId }, include: { club: true } });
    if (!manager || !manager.club) return reply.code(400).send({ error: 'No manager' });
    const body = pressConferenceSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Invalid body' });

    const skillEffects = await effectsForManager(manager.id);
    const baseEffects = toneEffects[body.data.tone];
    const effects = { ...baseEffects, morale: baseEffects.morale + skillEffects.moraleSpeechBonus };
    const headline = `${manager.name}: "${body.data.quote}"`;
    const content = JSON.stringify({
      topic: body.data.topic,
      tone: body.data.tone,
      clubId,
      managerId: manager.id,
      quote: body.data.quote,
      effects,
    });

    const result = await prisma.$transaction(async (tx) => {
      const conference = await tx.pressConference.create({
        data: {
          managerId: manager.id,
          topic: body.data.topic,
          tone: body.data.tone,
          effectsJson: effects,
        },
      });
      const press = await tx.pressItem.create({ data: { headline, content } });
      const updatedClub = await tx.club.update({
        where: { id: clubId },
        data: {
          reputation: { increment: effects.reputation },
          fans: { increment: effects.fans },
          socialMass: { increment: effects.fans },
        },
        select: { id: true, name: true, reputation: true, fans: true },
      });
      await tx.player.updateMany({
        where: { clubId },
        data: { morale: { increment: effects.morale } },
      });
      const news = await tx.news.create({
        data: {
          recipientId: manager.id,
          type: 'media',
          subject: 'Rueda de prensa publicada',
          body: `Tu declaración ha sido recogida por la prensa. Efectos: reputación ${effects.reputation >= 0 ? '+' : ''}${effects.reputation}, afición ${effects.fans >= 0 ? '+' : ''}${effects.fans}, moral ${effects.morale >= 0 ? '+' : ''}${effects.morale}.`,
        },
      });
      return { press, conference, news, club: updatedClub };
    });

    return reply.send({
      ok: true,
      pressItem: result.press,
      pressConference: result.conference,
      news: result.news,
      club: result.club,
      effects,
    });
  });
}
