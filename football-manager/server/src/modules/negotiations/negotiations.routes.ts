import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatedRateLimitKey } from '../../lib/rateLimitIdentity';
import { requireRole } from '../../middleware/auth';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';
import { negotiationsService } from './negotiations.service';

const MAX_NEGOTIATION_MONEY = 1_000_000_000;
const NEGOTIATION_MUTATION_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 12,
      timeWindow: '1 minute',
      keyGenerator: authenticatedRateLimitKey,
    },
  },
};

// Q5 (BLOQUE Q): el schema acepta importes con decimales (se redondean) y
// loanUntil como fecha simple o datetime ISO — antes cualquier desviación del
// front acababa en un 400 "Datos no válidos" sin contexto.
const moneySchema = (min: number) => z.number().min(min).max(MAX_NEGOTIATION_MONEY).transform(v => Math.round(v));

const agreementSchema = z.object({
  type: z.enum(['sale', 'loan', 'exchange', 'swap']),
  targetClubId: z.number().int().positive(),
  playerId: z.number().int().positive().optional(),
  requestedPlayerId: z.number().int().positive().optional(),
  amount: moneySchema(0).optional(),
  cashDelta: z.number().min(-MAX_NEGOTIATION_MONEY).max(MAX_NEGOTIATION_MONEY).transform(v => Math.round(v)).optional(),
  offeredPlayerId: z.number().int().positive().optional(),
  loanUntil: z.union([z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),
  optionToBuyAmount: moneySchema(0).optional(),
  message: z.string().max(500).optional(),
}).refine((body) => body.playerId || body.requestedPlayerId, { message: 'Falta el jugador objetivo de la negociación.' });

// Q5: errores de validación LEGIBLES en español para que la UI los muestre.
function formatZodError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return 'Datos no válidos';
  const field = issue.path.join('.') || 'datos';
  return `Propuesta no válida (${field}): ${issue.message}`;
}

function positiveInt(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function negotiationsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('manager'));
  app.addHook('preHandler', featureGate('market'));
  app.addHook('preHandler', maintenanceWriteGuard);

  app.get<{ Querystring: { status?: string } }>('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await negotiationsService.listAgreements(clubId, { status: request.query.status }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post('/', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { managerId, clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club: no puedes negociar traspasos.' });
    const body = agreementSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: formatZodError(body.error) });
    try {
      return reply.send(await negotiationsService.propose({ managerId, clubId }, body.data as any));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    try {
      return reply.send(await negotiationsService.getAgreement(clubId, agreementId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 404).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/accept', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    try {
      return reply.send(await negotiationsService.accept(clubId, agreementId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/exercise-option', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    try {
      return reply.send(await negotiationsService.exerciseLoanOption(clubId, agreementId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  // Q4/Q5 (aditivo): retirar MI propuesta mientras siga pendiente.
  app.post<{ Params: { id: string } }>('/:id/withdraw', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    try {
      return reply.send(await negotiationsService.withdraw(clubId, agreementId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/reject', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    try {
      return reply.send(await negotiationsService.reject(clubId, agreementId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/counter', NEGOTIATION_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { managerId, clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const agreementId = positiveInt(request.params.id);
    if (!agreementId) return reply.code(400).send({ error: 'Invalid agreement id' });
    const body = agreementSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: formatZodError(body.error) });
    try {
      return reply.send(await negotiationsService.counter(
        { managerId, clubId },
        agreementId,
        body.data as any,
      ));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Negotiation error';
      return reply.code(msg.includes('NECESITO') ? 501 : 400).send({ error: msg });
    }
  });
}
