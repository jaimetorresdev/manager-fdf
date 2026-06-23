// ─── FIFA Routes — policía del juego (rol agente_fifa) ────────────────────────
// Antitrampas, moderación de chat/foro, sanciones a managers. Solo lectura sobre
// economía/turnos.
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { fifaService } from './fifa.service';
import { maintenanceWriteGuard } from '../master/governance.guard';

const representSchema = z.object({
  playerId: z.number().int().positive(),
  commission: z.number().min(0.02).max(0.25).optional(),
});

const contractSchema = z.object({
  wage: z.number().positive().optional(),
  contractYears: z.number().int().min(1).max(5).optional(),
  releaseClause: z.number().positive().optional(),
  commission: z.number().min(0.02).max(0.25).optional(),
});

const agentOfferSchema = z.object({
  representationId: z.number().int().positive(),
  clubId: z.number().int().positive(),
  price: z.number().int().positive().max(1_000_000_000).optional(),
});

const sanctionSchema = z.object({
  managerId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  budgetPenalty: z.number().int().positive().max(1_000_000_000).optional(),
  suspendTurns: z.number().int().positive().max(20).optional(),
  ban: z.boolean().optional(), // AUDIT 3.3: baneo real (invalida JWT del objetivo)
});

export async function fifaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('agente_fifa'));
  app.addHook('preHandler', maintenanceWriteGuard);

  // GET /api/fifa/ping — comprobación de acceso FIFA
  app.get('/ping', async () => ({ ok: true, role: 'agente_fifa' }));

  // ── Agentes FIFA deportivos ────────────────────────────────────────────────

  app.get('/agent/portfolio', async (req, reply) => {
    try {
      return reply.send(await fifaService.getAgentPortfolio(req.user.userId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/agent/represent', async (req, reply) => {
    const body = representSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await fifaService.representPlayer(req.user.userId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/agent/representations/:id/contract', async (req, reply) => {
    const body = contractSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await fifaService.negotiateContract(req.user.userId, {
        representationId: parseInt(req.params.id, 10),
        ...body.data,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/agent/offer', async (req, reply) => {
    const body = agentOfferSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await fifaService.offerRepresentedToClub(req.user.userId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // ── AnticheatAlerts ──────────────────────────────────────────────────────────

  // GET /api/fifa/alerts
  app.get('/alerts', async (_req, reply) => {
    const alerts = await fifaService.getAlerts();
    return reply.send(alerts);
  });

  // POST /api/fifa/alerts/:id/resolve  { decision?: 'ignored' | 'banned' }
  app.post<{ Params: { id: string }; Body: { decision?: 'ignored' | 'banned' } }>(
    '/alerts/:id/resolve',
    async (req, reply) => {
      const alertId = Number(req.params.id);
      // AUDIT 5.9: `resolvedBy` es FK a User → se registra el userId del agente.
      const resolverUserId = req.user.userId;
      const decision = req.body?.decision === 'banned' ? 'banned' : 'ignored';
      const alert = await fifaService.resolveAlert(alertId, resolverUserId, decision);
      return reply.send({ ok: true, alert });
    }
  );

  // ── Chat Moderation ──────────────────────────────────────────────────────────

  // GET /api/fifa/moderation/chat
  app.get('/moderation/chat', async (req, reply) => {
    const qs = req.query as { take?: string };
    const take = qs.take ? Number(qs.take) : 50;
    const messages = await fifaService.getChatMessages(take);
    return reply.send(messages);
  });

  // DELETE /api/fifa/moderation/chat/:id
  app.delete<{ Params: { id: string } }>(
    '/moderation/chat/:id',
    async (req, reply) => {
      const messageId = Number(req.params.id);
      const agentFifaId = req.user.managerId ?? 0;
      await fifaService.deleteChatMessage(messageId, agentFifaId);
      return reply.send({ ok: true });
    }
  );

  // ── Forum Moderation ─────────────────────────────────────────────────────────

  // GET /api/fifa/moderation/forum
  app.get('/moderation/forum', async (req, reply) => {
    const qs = req.query as { take?: string };
    const take = qs.take ? Number(qs.take) : 50;
    const posts = await fifaService.getForumPosts(take);
    return reply.send(posts);
  });

  // DELETE /api/fifa/moderation/forum/:id
  app.delete<{ Params: { id: string } }>(
    '/moderation/forum/:id',
    async (req, reply) => {
      const postId = Number(req.params.id);
      const agentFifaId = req.user.managerId ?? 0;
      await fifaService.deleteForumPost(postId, agentFifaId);
      return reply.send({ ok: true });
    }
  );

  // ── Sanctions ─────────────────────────────────────────────────────────────────

  // POST /api/fifa/sanction
  app.post<{
    Body: z.infer<typeof sanctionSchema>;
  }>(
    '/sanction',
    async (req, reply) => {
      const parsed = sanctionSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'Sanción no válida' });
      const { managerId, reason, budgetPenalty, suspendTurns, ban } = parsed.data;
      const agentFifaId = req.user.managerId ?? 0;
      const result = await fifaService.sanctionManager({
        managerId,
        reason,
        budgetPenalty,
        suspendTurns,
        ban,
        agentFifaId,
      });
      return reply.send({ ok: true, ...result });
    }
  );

  // ── Read-only economy/turns ──────────────────────────────────────────────────

  // GET /api/fifa/economy
  app.get('/economy', async (_req, reply) => {
    const data = await fifaService.getEconomySummary();
    return reply.send(data);
  });
}
