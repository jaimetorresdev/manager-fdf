// ─── Economy Routes — Fase 3 ──────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { economyService } from './economy.service';

export async function economyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // GET /api/economy — snapshot completo de economía del club
  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await economyService.getEconomy(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // PUT /api/economy/ticket-prices — cambiar nivel de precio de entradas
  app.put('/ticket-prices', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({ level: z.enum(['low', 'medium', 'high']) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'level must be low | medium | high' });

    try {
      await economyService.updateTicketPrices(clubId, body.data.level);
      return reply.send({ ok: true, level: body.data.level });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // GET /api/economy/sponsors — listar contratos de patrocinio
  app.get('/sponsors', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await economyService.listSponsors(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // POST /api/economy/sponsors — firmar nuevo contrato de patrocinio (máx 3 años)
  app.post('/sponsors', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      type:  z.enum(['tv', 'ads', 'merch']),
      years: z.number().int().min(1).max(3),
      tier:  z.enum(['A', 'B', 'C']).optional().default('A'),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Datos no válidos' });

    try {
      return reply.send(await economyService.signSponsor(clubId, body.data.type, body.data.years, body.data.tier));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // DELETE /api/economy/sponsors/:id — romper contrato (paga penalización)
  app.delete<{ Params: { id: string } }>('/sponsors/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const sponsorId = parseInt(request.params.id, 10);
    if (isNaN(sponsorId)) return reply.code(400).send({ error: 'Invalid sponsor id' });

    try {
      return reply.send(await economyService.breakSponsor(clubId, sponsorId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // GET /api/economy/outsourcings — listar subcontrataciones
  app.get('/outsourcings', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await economyService.getOutsourcings(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // PUT /api/economy/subcontracts — activar/desactivar subcontrataciones
  app.put('/subcontracts', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const schema = z.object({
      travelAgency: z.number().int().min(0).max(1).optional(),
      maintenance:  z.number().int().min(0).max(1).optional(),
      cleaning:     z.number().int().min(0).max(1).optional(),
      security:     z.number().int().min(0).max(1).optional(),
      food:         z.number().int().min(0).max(1).optional(),
      medical:      z.number().int().min(0).max(1).optional(),
      media:        z.number().int().min(0).max(1).optional(),
    });

    const body = schema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    const data: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.data)) {
      if (v !== undefined) data[k] = v;
    }

    if (Object.keys(data).length === 0) return reply.code(400).send({ error: 'No fields provided' });

    try {
      return reply.send(await economyService.updateSubcontracts(clubId, data));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // GET /api/economy/forecast — previsión parametrizable.
  // Q15 (aditivo): admite ?horizon=30d|90d|6m|1y (mapea a meses) además del
  // ?months= legado. Respuesta: desglose por categoría y por mes + resumen.
  app.get('/forecast', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const q = request.query as Record<string, string>;
    const HORIZON_MONTHS: Record<string, number> = { '30d': 1, '90d': 3, '6m': 6, '1y': 12 };
    let months: number;
    if (q.horizon) {
      const mapped = HORIZON_MONTHS[q.horizon];
      if (!mapped) return reply.code(400).send({ error: 'horizon debe ser 30d, 90d, 6m o 1y' });
      months = mapped;
    } else {
      months = q.months ? parseInt(q.months, 10) : 12;
    }

    if (isNaN(months) || months < 1 || months > 60) {
      return reply.code(400).send({ error: 'months debe estar entre 1 y 60' });
    }

    try {
      const forecast = await economyService.getForecast(clubId, months);
      return reply.send({ ...forecast, horizon: q.horizon ?? null });
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // GET /api/economy/cash-history — Q15 · serie histórica de caja para gráficos.
  // Devuelve los FinanceSnapshot del club (budget/ingresos/gastos desglosados)
  // en orden cronológico; ?take= limita los puntos (por defecto 52).
  app.get('/cash-history', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const query = z.object({
      take: z.coerce.number().int().min(1).max(520).optional().default(52),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Consulta no válida' });

    try {
      return reply.send(await economyService.getCashHistory(clubId, query.data.take));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // GET /api/economy/competition-income — premios europeos/copas devengados
  app.get('/competition-income', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await economyService.getCompetitionIncome(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // GET /api/economy/analysis — ratios, evolución y comparativa de liga
  app.get('/analysis', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await economyService.getAnalysis(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // GET /api/economy/manager — presupuesto personal y prestigio del manager
  app.get('/manager', async (request, reply) => {
    const { managerId } = request.user;
    try {
      return reply.send(await economyService.getManagerWealth(managerId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });
}
