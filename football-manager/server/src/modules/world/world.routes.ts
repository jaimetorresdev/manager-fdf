import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tickZeroCached } from '../../lib/tickZeroCache';
import { authenticate, requireAdmin } from '../../middleware/auth';
import { worldService, worldEconomyService, rankingService } from './world.service';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';

const clubQuerySchema = z.object({
  country: z.string().optional(),
  q: z.string().optional(),
  competitionId: z.coerce.number().int().positive().optional(),
  take: z.coerce.number().int().positive().max(100).optional(),
});

const standingsQuerySchema = z.object({
  division: z.string().optional(),
  country: z.string().optional(),
  tier: z.coerce.number().int().positive().max(10).optional(),
});

const cupQuerySchema = z.object({
  country: z.string().optional(),
  competitionId: z.coerce.number().int().positive().optional(),
});

const leaderboardQuerySchema = z.object({
  competitionId: z.coerce.number().int().positive().optional(),
  country: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).optional(),
});

const generateGroupsSchema = z.object({
  groupSize: z.number().int().min(3).max(6).optional(),
});

export async function worldRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/summary', async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('world:summary', {}, () => worldService.getSummary()));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/competitions', async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('world:competitions', {}, () => worldService.getCompetitions()));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/competitions/coefficients', async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('world:coefficients', {}, () => rankingService.continentalCoefficients()));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/world/standings?division=&country=&tier=
  app.get('/standings', async (request, reply) => {
    const query = standingsQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await worldService.getStandings(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/world/cup?country=&competitionId=
  app.get('/cup', async (request, reply) => {
    const query = cupQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await worldService.getCup(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /api/world/leaderboards?competitionId=&country=&take=
  app.get('/leaderboards', async (request, reply) => {
    const query = leaderboardQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    try {
      return reply.send(await worldService.getLeaderboards(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/competitions/:id', async (request, reply) => {
    try {
      return reply.send(await worldService.getCompetition(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/competitions/:id/fixtures', async (request, reply) => {
    try {
      return reply.send(await worldService.getCompetitionFixtures(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // GET /api/world/competitions/:id/groups
  app.get<{ Params: { id: string } }>(
    '/competitions/:id/groups',
    { preHandler: [featureGate('groups')] },
    async (request, reply) => {
    try {
      return reply.send(await worldService.getCompetitionGroups(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
    },
  );

  // POST /api/world/competitions/:id/groups/generate — admin/master
  app.post<{ Params: { id: string } }>(
    '/competitions/:id/groups/generate',
    { preHandler: [requireAdmin, maintenanceWriteGuard, featureGate('groups')] },
    async (request, reply) => {
      const body = generateGroupsSchema.safeParse(request.body ?? {});
      if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
      try {
        return reply.send(await worldService.generateGroupFixtures(parseInt(request.params.id), body.data));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error';
        return reply.code(400).send({ error: msg });
      }
    },
  );

  app.get<{ Params: { id: string } }>('/competitions/:id/squad-audit', async (request, reply) => {
    try {
      return reply.send(await worldService.getCompetitionSquadAudit(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/clubs', async (request, reply) => {
    const query = clubQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });

    try {
      return reply.send(await worldService.searchClubs(query.data));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/clubs/:id', async (request, reply) => {
    try {
      return reply.send(await worldService.getClub(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/clubs/:id/squad-audit', async (request, reply) => {
    try {
      return reply.send(await worldService.getClubSquadAudit(parseInt(request.params.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  // ── WorldEconomy ────────────────────────────────────────────────────────────

  // GET /world/economy — latest world economy index
  app.get('/economy', async (_request, reply) => {
    try {
      return reply.send(await worldEconomyService.getLatest());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /world/economy/history?take=30
  app.get('/economy/history', async (request, reply) => {
    const q = z.object({ take: z.coerce.number().int().positive().max(200).optional() }).safeParse(request.query);
    const take = q.success ? (q.data.take ?? 30) : 30;
    try {
      return reply.send(await worldEconomyService.getHistory(take));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // ── Rankings ────────────────────────────────────────────────────────────────

  // GET /world/rankings/:type — latest snapshot of a ranking type
  app.get<{ Params: { type: string } }>('/rankings/:type', async (request, reply) => {
    try {
      const snap = await rankingService.getLatest(request.params.type);
      if (!snap) return reply.code(404).send({ error: 'No ranking snapshot found for this type' });
      return reply.send(snap);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  // GET /world/rankings — live rankings (computed on the fly)
  app.get('/rankings', async (_request, reply) => {
    try {
      const [moy, rich, avg, topT, eco, coef] = await Promise.all([
        rankingService.managerOfTheYear(),
        rankingService.richestManagers(),
        rankingService.averageSalary(),
        rankingService.topTransfers(),
        rankingService.economicFlow(),
        rankingService.continentalCoefficients(),
      ]);
      return reply.send({
        managerOfYear: moy,
        richestManagers: rich,
        averageSalary: avg,
        topTransfers: topT,
        economicFlow: eco,
        continentalCoefficients: coef,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });
}
