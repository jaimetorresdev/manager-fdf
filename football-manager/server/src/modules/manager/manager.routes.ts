import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import type { JwtPayload } from '../../middleware/auth';
import { managerService } from './manager.service';

const idParams = z.object({ id: z.coerce.number().int().positive() });
const vacationSchema = z.object({ active: z.boolean().optional() }).optional();
// S11: nodeId acotado — id de nodo del árbol de carrera (string corto, sin payloads raros).
const unlockSkillSchema = z.object({ nodeId: z.string().trim().min(1).max(80) });
const tutorialPatchSchema = z.object({
  tutorialStep: z.number().int().min(0).max(8).optional(),
  tutorialCompleted: z.boolean().optional(),
  tutorialSkipped: z.boolean().optional(),
}).refine((body) => Object.keys(body).length > 0, 'At least one field required');

function signSessionToken(app: FastifyInstance, user: JwtPayload, clubId: number | null) {
  return app.jwt.sign({
    userId: user.userId,
    managerId: user.managerId,
    clubId,
    username: user.username,
    role: user.role,
    // AUDIT 3.3: conserva la tokenVersion vigente en el token reemitido (evita
    // re-login auto-infligido tras incrementos de tokenVersion por ban/rol).
    tokenVersion: user.tokenVersion ?? 0,
  }, { expiresIn: '30d' });
}

function isHiringResult(result: unknown): result is { clubId: number; objective: string; season: string } {
  if (!result || typeof result !== 'object') return false;
  const row = result as { clubId?: unknown; objective?: unknown; season?: unknown };
  return typeof row.clubId === 'number'
    && typeof row.objective === 'string'
    && typeof row.season === 'string';
}

export async function managerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/tutorial', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getTutorial(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.patch('/tutorial', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const body = tutorialPatchSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Datos no válidos' });
    try {
      return reply.send(await managerService.updateTutorial(managerId, body.data));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/career', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });
    try {
      const career = await managerService.getManagerCareer(userId);
      return reply.send(career);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post('/skills/unlock', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const body = unlockSkillSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'nodeId required' });
    try {
      return reply.send(await managerService.unlockSkill(managerId, body.data.nodeId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/vacation', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const body = vacationSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await managerService.setVacation(managerId, body.data?.active));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/profile', async (request, reply) => {
    const userId = request.user.userId;
    if (!userId) return reply.code(400).send({ error: 'No user ID' });
    try {
      const profile = await managerService.getManagerProfile(userId);
      return reply.send(profile);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // AUDIT 3.7: GET puro (no muta la BD).
  app.get('/prestige', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getPrestigeBreakdown(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // AUDIT 3.7: recálculo PERSISTENTE (escritura) separado del GET.
  app.post('/prestige/recalc', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.recalcPrestige(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get('/prestige/ranking', async (request, reply) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(50) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await managerService.getPrestigeRanking(query.data.limit));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get('/pressure', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getPressure(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>('/public/:id', async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid manager id' });
    try {
      return reply.send(await managerService.getPublicManager(params.data.id, request.user.userId, request.user.clubId ?? null));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  app.get('/offers', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getOffers(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get('/vacancies', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getVacancies(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get('/clubs-seeking-manager', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    try {
      return reply.send(await managerService.getClubsSeekingManager(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post<{ Params: { clubId: string } }>('/clubs-seeking-manager/:clubId/apply', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const clubId = Number.parseInt(request.params.clubId, 10);
    if (!Number.isSafeInteger(clubId) || clubId <= 0) return reply.code(400).send({ error: 'Invalid club id' });
    try {
      return reply.send(await managerService.applyToSeekingClub(managerId, clubId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>('/offers/:id/accept', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid offer id' });
    try {
      const result = await managerService.acceptOffer(managerId, params.data.id);
      return reply.send({
        ...result,
        token: signSessionToken(app, request.user, result.clubId),
      });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>('/offers/:id/reject', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid offer id' });
    try {
      return reply.send(await managerService.rejectOffer(managerId, params.data.id));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>('/vacancies/:id/apply', async (request, reply) => {
    const managerId = request.user.managerId;
    if (!managerId) return reply.code(400).send({ error: 'No manager ID' });
    const params = idParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid vacancy id' });
    try {
      const result = await managerService.applyToVacancy(managerId, params.data.id);
      if (!isHiringResult(result)) return reply.send(result);
      return reply.send({
        ...result,
        token: signSessionToken(app, request.user, result.clubId),
      });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
