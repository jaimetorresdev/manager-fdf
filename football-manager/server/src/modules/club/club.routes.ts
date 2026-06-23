// ─── Club Routes ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { clubService } from './club.service';
import { clubKitsService } from './club-kits.service';
import { advisorService } from './advisor.service';

const sponsorSchema = z.object({
  tier: z.enum(['A', 'B', 'C']).default('B'),
  years: z.number().int().min(1).max(3).default(2),
  sponsorName: z.string().min(2).max(80).optional(),
});

const decisionSignalQuery = z.object({
  action: z.enum(['sign', 'sell', 'renew', 'stadium']),
  playerId: z.coerce.number().int().positive().optional(),
  amount: z.coerce.number().min(0).optional(),
  salary: z.coerce.number().min(0).optional(),
  years: z.coerce.number().int().min(1).max(5).optional(),
  clause: z.coerce.number().positive().optional(),
  workKey: z.string().trim().min(1).max(80).optional(),
});

const kitDesignSchema = z.object({
  kind: z.enum(['home', 'away', 'third']),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  pattern: z.string().min(2).max(40).optional(),
  sponsorName: z.string().min(2).max(80).optional(),
});

export async function clubRoutes(app: FastifyInstance) {
  // All club routes require auth
  app.addHook('preHandler', authenticate);

  // GET /api/club — my club overview
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    try {
      const club = await clubService.getMyClub(clubId);
      return reply.send(club);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(404).send({ error: msg });
    }
  });

  // ─── QW-9 · GET /api/club/advisor — «El DD recomienda» ──────────────────────
  app.get('/advisor', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    try {
      return reply.send(await advisorService.getRecommendations(clubId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudieron generar las recomendaciones';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── QW-7 · GET /api/club/rival-week — rival de la semana ──────────────────
  app.get('/rival-week', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    try {
      return reply.send(await advisorService.getRivalOfTheWeek(clubId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo detectar el rival de la semana';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/club/economy

  // GET /api/club/public/:id
  app.get<{ Params: { id: string } }>('/public/:id', async (request, reply) => {
    try {
      const club = await clubService.getPublicClub(parseInt(request.params.id));
      return reply.send(club);
    } catch {
      return reply.code(404).send({ error: 'Club not found' });
    }
  });

  // GET /api/club/public/:id/squad
  app.get<{ Params: { id: string } }>('/public/:id/squad', async (request, reply) => {
    try {
      const squad = await clubService.getClubSquad(parseInt(request.params.id));
      return reply.send(squad);
    } catch {
      return reply.code(404).send({ error: 'Squad not found' });
    }
  });

  // GET /api/club/public/:id/staff
  app.get<{ Params: { id: string } }>('/public/:id/staff', async (request, reply) => {
    try {
      const staff = await clubService.getClubStaff(parseInt(request.params.id));
      return reply.send(staff);
    } catch {
      return reply.code(404).send({ error: 'Staff not found' });
    }
  });

  app.get('/economy', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    try {
      return reply.send(await clubService.getEconomy(clubId));
    } catch {
      return reply.code(500).send({ error: 'Economy fetch failed' });
    }
  });

  app.get('/health-map', async (request, reply) => {
    const { clubId, managerId } = request.user;
    if (!clubId || !managerId) return reply.code(400).send({ error: 'No tienes club asignado' });
    try {
      return reply.send(await clubService.getHealthMap(clubId, managerId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo calcular el mapa de calor';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/decision-signal', async (request, reply) => {
    const { clubId, managerId } = request.user;
    if (!clubId || !managerId) return reply.code(400).send({ error: 'No tienes club asignado' });
    const query = decisionSignalQuery.safeParse(request.query);
    if (!query.success) {
      const issue = query.error.issues[0];
      return reply.code(400).send({ error: `Consulta no válida (${issue?.path.join('.') || 'query'}): ${issue?.message ?? 'dato inválido'}` });
    }
    try {
      return reply.send(await clubService.getDecisionSignal(clubId, managerId, query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo calcular el semáforo de decisión';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/club/standings
  app.get('/standings', async (_request, reply) => {
    try {
      return reply.send(await clubService.getStandings());
    } catch {
      return reply.code(500).send({ error: 'Standings fetch failed' });
    }
  });

  app.get('/kits', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    try {
      return reply.send(await clubKitsService.getKits(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kits fetch failed';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/kits/sponsor/renegotiate', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    const body = sponsorSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await clubKitsService.renegotiateSponsor(clubId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sponsor renegotiation failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.put('/kits/sponsor', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    const body = sponsorSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await clubKitsService.renegotiateSponsor(clubId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sponsor update failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/kits/design', async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    const body = kitDesignSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await clubKitsService.saveDesign(clubId, userId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kit design failed';
      return reply.code(400).send({ error: msg });
    }
  });

  app.put('/kits/design', async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club assigned' });
    const body = kitDesignSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await clubKitsService.saveDesign(clubId, userId, body.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Kit design failed';
      return reply.code(400).send({ error: msg });
    }
  });
}
