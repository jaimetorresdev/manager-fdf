// ─── Market Routes — Fase 3 ───────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticatedRateLimitKey } from '../../lib/rateLimitIdentity';
import { tickZeroCached } from '../../lib/tickZeroCache';
import { authenticate } from '../../middleware/auth';
import { anticheatService } from '../admin/anticheat.service';
import { playerOverall } from '../../lib/playerOverall';
import { marketService } from './market.service';
import { rumorsService } from './rumors.service';
import { rumorSabotageService } from './rumorSabotage.service';
import { deadlineService } from './deadline.service';
import { evaluateOffer } from './market-evaluation.logic';
import { isTransferWindowOpen, salaryCap } from '../game/tick.logic';
import { featureGate, maintenanceWriteGuard } from '../master/governance.guard';
import prisma from '../../db/prisma';
import { corePlayerWage, executePlayerTransfer, spendableBase } from './transfer.core';
import { scoutService } from '../scout/scout.service';

const MAX_MONEY = 1_000_000_000;
const MAX_WAGE = 20_000_000;
const MARKET_MUTATION_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 12,
      timeWindow: '1 minute',
      keyGenerator: authenticatedRateLimitKey,
    },
  },
};
const MARKET_LIGHT_MUTATION_RATE_LIMIT = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
      keyGenerator: authenticatedRateLimitKey,
    },
  },
};

const marketQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).optional(),
  take: z.coerce.number().int().min(1).max(20).optional(),
  position: z.string().optional(),
  minAge: z.coerce.number().int().positive().optional(),
  maxAge: z.coerce.number().int().positive().optional(),
  ageMin: z.coerce.number().int().positive().optional(),
  ageMax: z.coerce.number().int().positive().optional(),
  minOverall: z.coerce.number().int().min(0).max(100).optional(),
  maxOverall: z.coerce.number().int().min(0).max(100).optional(),
  minPotential: z.coerce.number().int().min(0).max(100).optional(),
  maxPotential: z.coerce.number().int().min(0).max(100).optional(),
  maxPrice: z.coerce.number().int().positive().max(MAX_MONEY).optional(),
  valueMin: z.coerce.number().int().positive().max(MAX_MONEY).optional(),
  valueMax: z.coerce.number().int().positive().max(MAX_MONEY).optional(),
  maxWage: z.coerce.number().int().positive().max(MAX_WAGE).optional(),
  salaryMax: z.coerce.number().int().positive().max(MAX_WAGE).optional(),
  type: z.enum(['transfer', 'loan']).optional(),
  country: z.string().optional(),
  clubId: z.coerce.number().optional(),
  personality: z.string().optional(),
  attr: z.string().optional(),
  minPassing: z.coerce.number().optional(),
  passingMin: z.coerce.number().optional(),
  minTackling: z.coerce.number().optional(),
  tacklingMin: z.coerce.number().optional(),
  minShooting: z.coerce.number().optional(),
  shootingMin: z.coerce.number().optional(),
  minOrganization: z.coerce.number().optional(),
  organizationMin: z.coerce.number().optional(),
  minUnmarking: z.coerce.number().optional(),
  unmarkingMin: z.coerce.number().optional(),
  minFinishing: z.coerce.number().optional(),
  finishingMin: z.coerce.number().optional(),
  minDribbling: z.coerce.number().optional(),
  dribblingMin: z.coerce.number().optional(),
  minGoalkeeping: z.coerce.number().optional(),
  goalkeepingMin: z.coerce.number().optional(),
  sortBy: z.string().optional(),
  orderBy: z.string().optional(),
  sortDir: z.enum(['asc', 'desc']).optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

const listingSchema = z.object({
  playerId: z.number().int().positive(),
  price: z.number().int().positive().max(MAX_MONEY),
  type: z.enum(['transfer', 'loan']).optional(),
});

const freeAgentSignSchema = z.object({
  wage: z.number().int().positive().max(MAX_WAGE).optional(),
  contractYears: z.number().int().min(1).max(5).optional(),
  releaseClause: z.number().int().positive().max(MAX_MONEY).optional(),
});

function positiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isFundsError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('presupuesto insuficiente');
}

function focusedPlayerId(zone?: string | null): number | null {
  const match = /^player:(\d+)$/.exec(zone ?? '');
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function scoutingConfidence(points: number): 'low' | 'medium' | 'high' | 'complete' {
  if (points >= 100) return 'complete';
  if (points >= 75) return 'high';
  if (points >= 40) return 'medium';
  return 'low';
}

function offerIsActive(status: string): boolean {
  return ['pending', 'agent_proposed', 'accepted_pending_window'].includes(status);
}

function firstFailedEvaluationKey(evaluation: Awaited<ReturnType<typeof evaluateOffer>>) {
  return evaluation.keys.find((key) => !key.ok) ?? null;
}

async function validatePendingOfferEdit(
  clubId: number,
  offer: {
    id: number;
    playerId: number;
    amount: number;
    salary: number | null;
    contractYears: number | null;
    releaseClause: number | null;
  },
  patch: { amount?: number; salary?: number; years?: number; clause?: number },
) {
  const player = await prisma.player.findUnique({
    where: { id: offer.playerId },
    select: {
      id: true,
      salary: true,
      wage: true,
    },
  });
  if (!player) throw new Error('Jugador no encontrado.');

  const amount = patch.amount ?? offer.amount;
  const salary = patch.salary ?? offer.salary ?? corePlayerWage(player);
  const years = patch.years ?? offer.contractYears ?? 2;
  const clause = patch.clause ?? offer.releaseClause ?? salary * 400;

  const buyer = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      players: { select: { salary: true, wage: true } },
      coaches: { select: { salary: true } },
    },
  });
  if (!buyer) throw new Error('Club comprador no encontrado.');
  if (spendableBase(buyer) < amount) throw new Error('Presupuesto insuficiente para modificar la oferta.');

  const usedSalary = buyer.players.reduce((sum, row) => sum + corePlayerWage(row), 0)
    + buyer.coaches.reduce((sum, row) => sum + row.salary, 0);
  const cap = salaryCap(spendableBase(buyer), amount);
  if (usedSalary + salary > cap) {
    throw new Error(`Superas el tope salarial (${cap} €/mes) con el salario ofertado (${salary} €/mes).`);
  }

  const termsChanged = patch.salary !== undefined || patch.years !== undefined || patch.clause !== undefined;
  const evaluation = termsChanged
    ? await evaluateOffer(clubId, offer.playerId, salary, years, clause)
    : null;
  if (evaluation) {
    const failedKey = firstFailedEvaluationKey(evaluation);
    if (failedKey || evaluation.total < 50) {
      const reason = failedKey ? `${failedKey.label}: ${failedKey.detail}` : `valoración total ${evaluation.total}/99`;
      const err = new Error(`El jugador rechaza los nuevos términos (${reason}).`);
      (err as Error & { evaluation?: unknown }).evaluation = evaluation;
      throw err;
    }
  }

  return { amount, salary, years, clause, termsChanged, evaluation };
}

function serializeOffer(offer: any, clubId: number) {
  const received = offer.fromClubId !== clubId && (offer.toClubId === clubId || offer.player?.clubId === clubId);
  const sent = offer.fromClubId === clubId;
  const direction = received ? 'received' : sent ? 'sent' : 'history';
  const canRespond = received && (offer.status === 'pending' || offer.status === 'agent_proposed');
  const canEdit = sent && offer.status === 'pending';
  return {
    id: offer.id,
    status: offer.status,
    direction,
    amount: offer.amount,
    salary: offer.salary ?? null,
    years: offer.contractYears ?? null,
    clause: offer.releaseClause ?? null,
    effectiveAt: offer.effectiveAt,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
    player: offer.player
      ? {
          id: offer.player.id,
          name: offer.player.name,
          position: offer.player.position,
          marketValue: offer.player.marketValue,
          clubId: offer.player.clubId ?? null,
          club: offer.player.club ?? null,
        }
      : null,
    fromClub: offer.fromClub ?? null,
    toClub: offer.toClub ?? offer.player?.club ?? null,
    actions: {
      canAccept: canRespond,
      canReject: canRespond,
      canCounter: canRespond,
      canCancel: canEdit,
      canEdit,
      acceptEndpoint: canRespond ? `/api/market/offers/${offer.id}/accept` : null,
      rejectEndpoint: canRespond ? `/api/market/offers/${offer.id}/reject` : null,
      counterEndpoint: canRespond ? '/api/negotiations' : null,
      counterTemplate: canRespond ? {
        type: 'sale',
        playerId: offer.playerId,
        targetClubId: offer.fromClubId,
        amount: Math.max(1, Math.round(offer.amount * 1.1)),
      } : null,
      cancelEndpoint: canEdit ? `/api/market/offer/${offer.id}` : null,
      editEndpoint: canEdit ? `/api/market/offer/${offer.id}` : null,
    },
  };
}

async function executeAcceptedOffer(input: {
  offer: any;
  sellerClubId: number;
  sellerUserId: number;
}) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
  const inGameDate = state?.inGameDate ?? new Date();

  if (state && !isTransferWindowOpen(state.inGameDate)) {
    await prisma.transferOffer.update({ where: { id: input.offer.id }, data: { status: 'accepted_pending_window' } });
    return { ok: true, status: 'accepted_pending_window' };
  }

  const buyerManager = await prisma.manager.findFirst({ where: { clubId: input.offer.fromClubId } });
  if (buyerManager) {
    await anticheatService.checkMultiAccount(input.sellerUserId, buyerManager.userId);
    await anticheatService.logSuspiciousTransfer(
      input.sellerUserId,
      input.sellerClubId,
      input.offer.amount,
      input.offer.player.marketValue,
      input.offer.playerId,
      'ACEPTAR_OFERTA',
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await executePlayerTransfer({
        playerId: input.offer.playerId,
        buyerClubId: input.offer.fromClubId,
        sellerClubId: input.sellerClubId,
        amount: input.offer.amount,
        terms: {
          salary: input.offer.salary,
          contractYears: input.offer.contractYears,
          releaseClause: input.offer.releaseClause,
        },
        source: 'offer_accept',
        inGameDate,
      }, tx);
      await tx.transferOffer.update({ where: { id: input.offer.id }, data: { status: 'accepted' } });
    });
  } catch (err) {
    if (isFundsError(err)) {
      await prisma.transferOffer.update({ where: { id: input.offer.id }, data: { status: 'rejected' } });
    }
    throw err;
  }

  return { ok: true, status: 'accepted' };
}

export async function marketRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', featureGate('market'));
  app.addHook('preHandler', maintenanceWriteGuard);

  app.get('/deadline-day', async (request, reply) => {
    try {
      return reply.send(await deadlineService.getDeadlineDay(request.user.clubId ?? null));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar Deadline Day';
      return reply.code(500).send({ error: msg });
    }
  });

  app.get('/squad-limits', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    return reply.send(await marketService.getSquadLimits(clubId));
  });

  // W6 (QW-13): el semáforo de decisión vive en `GET /api/club/decision-signal`
  // (fuente ÚNICA, ver API_UI.md §BloqueQ W6). Aquí solo queda squad-limits,
  // que decision-signal ya incorpora a su dimensión de viabilidad.

  // ─── Shortlist (Favoritos del Mercado) ────────────────────────────────────

  app.get('/shortlist', async (request, reply) => {
    const { userId } = request.user;
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });

    const shortlists = await prisma.marketShortlist.findMany({
      where: { managerId: manager.id },
      include: {
        player: {
          include: { club: { select: { id: true, name: true, shortName: true, badge: true } } }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    const staff = manager.clubId
      ? await prisma.staff.findUnique({
          where: { clubId: manager.clubId },
          include: { members: { where: { role: 'scout' }, select: { id: true } } },
        })
      : null;
    const scoutIds = (staff?.members ?? []).map((member) => member.id);
    const assignments = scoutIds.length
      ? await prisma.scoutAssignment.findMany({ where: { scoutStaffId: { in: scoutIds } } })
      : [];

    const players = shortlists.map(s => {
      const p = s.player;
      const overall = playerOverall(p);
      const assignment = assignments.find((row) => focusedPlayerId(row.zone) === p.id)
        ?? assignments.find((row) => p.clubId != null && row.clubTargetId === p.clubId);
      return {
        ...p,
        overall,
        shortlistId: s.id,
        followedAt: s.createdAt,
        scouting: assignment
          ? {
              assignmentId: assignment.id,
              scoutStaffId: assignment.scoutStaffId,
              analysisPoints: assignment.analysisPoints,
              confidence: scoutingConfidence(assignment.analysisPoints),
              focus: focusedPlayerId(assignment.zone) === p.id ? 'player' : 'club',
              reportEta: assignment.analysisPoints >= 100 ? 'complete' : 'next_turn',
            }
          : null,
      };
    });

    return reply.send(players);
  });

  app.post<{ Params: { playerId: string } }>('/shortlist/:playerId', MARKET_LIGHT_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { userId } = request.user;
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });

    try {
      await prisma.marketShortlist.upsert({
        where: { managerId_playerId: { managerId: manager.id, playerId } },
        create: { managerId: manager.id, playerId },
        update: {}
      });
      return reply.send({ ok: true });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.delete<{ Params: { playerId: string } }>('/shortlist/:playerId', MARKET_LIGHT_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { userId } = request.user;
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });

    try {
      await prisma.marketShortlist.delete({
        where: { managerId_playerId: { managerId: manager.id, playerId } }
      });
      return reply.send({ ok: true });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Params: { playerId: string } }>('/shortlist/:playerId/scout', MARKET_LIGHT_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { userId, clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });
    const body = z.object({
      scoutStaffId: z.coerce.number().int().positive().optional(),
    }).safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    const followed = await prisma.marketShortlist.findUnique({
      where: { managerId_playerId: { managerId: manager.id, playerId } },
      select: { id: true },
    });
    if (!followed) return reply.code(404).send({ error: 'El jugador no está en tu lista de seguimiento.' });

    try {
      return reply.send(await scoutService.assignScoutToFollowedPlayer(clubId, playerId, body.data.scoutStaffId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });


  // ─── GET /api/market — jugadores disponibles ──────────────────────────────

  app.get('/search', async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });

    const query = marketQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    
    const searchResult = await marketService.searchPlayers(clubId, query.data);
    
    // Fetch shortlist
    const tracked = await prisma.marketShortlist.findMany({
      where: { managerId: manager.id },
      select: { playerId: true }
    });
    const shortlistIds = tracked.map(t => t.playerId);
    
    return reply.send({
      data: searchResult.data,
      total: searchResult.total,
      skip: searchResult.skip,
      take: searchResult.take,
      page: searchResult.page,
      totalPages: searchResult.totalPages,
      sortBy: searchResult.sortBy,
      sortDir: searchResult.sortDir,
      filters: searchResult.filters,
      shortlistIds,
      uiNeed: '// NECESITO: Antigravity debe consumir /market/search como tabla paginada de 20 con filtros profundos y orden por columna.',
    });
  });

  app.get('/', async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const manager = await prisma.manager.findUnique({ where: { userId } });
    if (!manager) return reply.code(400).send({ error: 'No manager' });

    const query = marketQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    
    const marketResult = await marketService.listMarket(query.data);
    
    // Fetch shortlist
    const tracked = await prisma.marketShortlist.findMany({
      where: { managerId: manager.id },
      select: { playerId: true }
    });
    const shortlistIds = tracked.map(t => t.playerId);
    
    return reply.send({
      data: marketResult.data,
      total: marketResult.total,
      page: query.data.page,
      totalPages: Math.ceil(marketResult.total / query.data.limit),
      shortlistIds
    });
  });

  app.get('/listings', async (request, reply) => {
    const query = marketQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    return reply.send(await marketService.listMarket(query.data));
  });

  app.post('/listings', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const body = listingSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await marketService.createListing(clubId, body.data));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.delete<{ Params: { id: string } }>('/listings/:id', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const listingId = positiveInt(request.params.id);
    if (!listingId) return reply.code(400).send({ error: 'Invalid listing id' });
    try {
      return reply.send(await marketService.removeListing(clubId, listingId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.get('/free-agents', async (request, reply) => {
    const query = marketQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    return reply.send(await marketService.listFreeAgents(query.data));
  });

  app.post<{ Params: { playerId: string } }>('/free-agents/:playerId/sign', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const body = freeAgentSignSchema.safeParse(request.body ?? {});
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });
    try {
      return reply.send(await marketService.signFreeAgent(clubId, playerId, body.data));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── GET /api/market/window — estado de ventanas de fichajes ─────────────

  app.get('/window', async (_request, reply) => {
    try {
      return reply.send(await marketService.getWindowStatus());
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // ─── GET /api/market/salary-cap — tope salarial del club ─────────────────

  app.get('/salary-cap', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await marketService.getSalaryCap(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  // ─── GET /api/market/clause/:playerId — cláusula de rescisión ────────────

  app.get<{ Params: { playerId: string } }>('/clause/:playerId', async (request, reply) => {
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });
    try {
      return reply.send(await marketService.getPlayerClause(playerId));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // ─── POST /api/market/clause — pagar cláusula de rescisión ───────────────

  app.post('/clause', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      playerId: z.number().int().positive(),
      amount:   z.number().int().positive().max(MAX_MONEY),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await marketService.buyClause(userId, clubId, body.data.playerId, body.data.amount));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── GET /api/market/offers — ofertas recibidas ───────────────────────────

  app.get('/offers', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const offers = await prisma.transferOffer.findMany({
      where:   { player: { clubId }, status: 'pending' },
      include: {
        player:   { select: { name: true, position: true, marketValue: true } },
        fromClub: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(offers);
  });

  // ─── GET /api/market/offers-hub — bandejas Y-offers ─────────────────────
  // Agregador aditivo para UI: recibidas, enviadas e historial con acciones
  // calculadas. No sustituye a /offers ni /my-offers.
  app.get('/offers-hub', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const query = z.object({
      status: z.string().max(32).optional(),
      take: z.coerce.number().int().min(1).max(200).default(80),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Consulta no válida' });

    const statusFilter = query.data.status ? { status: query.data.status } : {};
    const offers = await prisma.transferOffer.findMany({
      where: {
        OR: [
          { fromClubId: clubId },
          { toClubId: clubId },
          { player: { clubId } },
        ],
        ...statusFilter,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            marketValue: true,
            clubId: true,
            club: { select: { id: true, name: true, shortName: true, badge: true } },
          },
        },
        fromClub: { select: { id: true, name: true, shortName: true, badge: true } },
        toClub: { select: { id: true, name: true, shortName: true, badge: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: query.data.take,
    });

    const rows = offers.map((offer) => serializeOffer(offer, clubId));
    const received = rows.filter((offer) => offer.direction === 'received' && offerIsActive(offer.status));
    const sent = rows.filter((offer) => offer.direction === 'sent' && offerIsActive(offer.status));
    const history = rows.filter((offer) => !offerIsActive(offer.status));
    return reply.send({
      received,
      sent,
      history,
      counts: {
        received: received.length,
        sent: sent.length,
        history: history.length,
        pendingActions: received.filter((offer) => offer.actions.canAccept || offer.actions.canReject).length,
      },
      statuses: ['pending', 'agent_proposed', 'accepted_pending_window', 'accepted', 'rejected', 'withdrawn', 'expired'],
    });
  });

  // ─── QW-8 · GET /api/market/rumors — Rumorómetro ──────────────────────────
  // Señales 🔥👀💰🧊 por reglas + ruido plausible; mezcla determinista por
  // semana in-game. `confidence` es interno: el front NO lo muestra en crudo.
  app.get('/rumors', async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('market:rumors', {}, () => rumorsService.getRumors()));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cargar el rumorómetro';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── N4-2 · Sabotaje informativo (prestigio · contexto derbi) ─────────────
  app.post<{ Body: { targetClubId: number } }>('/rumor-sabotage', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No manager' });
    const body = z.object({ targetClubId: z.number().int().positive() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'targetClubId inválido' });
    try {
      return reply.send(await rumorSabotageService.plant(managerId, body.data.targetClubId));
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'No se pudo plantar el rumor' });
    }
  });

  app.post<{ Params: { id: string } }>('/rumor-sabotage/:id/debunk', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No manager' });
    const id = Number.parseInt(request.params.id, 10);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'ID inválido' });
    try {
      return reply.send(await rumorSabotageService.debunk(managerId, id));
    } catch (e: unknown) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : 'No se pudo desmentir' });
    }
  });

  app.get('/rumor-sabotage/active', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      const rows = await rumorSabotageService.activeAgainstClub(clubId);
      return reply.send({ sabotages: rows });
    } catch (e: unknown) {
      return reply.code(500).send({ error: e instanceof Error ? e.message : 'Error' });
    }
  });

  // ─── GET /api/market/my-offers — ofertas enviadas ────────────────────────

  // Q4 (BLOQUE Q): listado completo de MIS ofertas enviadas con su estado
  // (pending | accepted | accepted_pending_window | rejected | withdrawn |
  // expired), filtrable por ?status=. Cancelar: DELETE /api/market/offer/:id.
  // Modificar mientras está pending: PATCH /api/market/offer/:id.
  app.get('/my-offers', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const query = z.object({ status: z.string().max(32).optional() }).safeParse(request.query);
    const statusFilter = query.success && query.data.status ? { status: query.data.status } : {};

    const offers = await prisma.transferOffer.findMany({
      where:   { fromClubId: clubId, ...statusFilter },
      include: {
        player: { select: { id: true, name: true, position: true, marketValue: true, clubId: true } },
        toClub: { select: { id: true, name: true, shortName: true, badge: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send(offers.map(o => ({
      ...o,
      canCancel: o.status === 'pending',
      canEdit: o.status === 'pending',
    })));
  });

  // ─── POST /api/market/evaluate — valoración multi-apartado FDF (manual §4.3)
  // Previsualiza cómo valoraría el JUGADOR una oferta/renovación: 4 bloques +
  // llaves 🔑. Lo consume OfferPanel.tsx antes de enviar la oferta real.

  app.post('/evaluate', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    // Flexible como Q5: acepta decimales/strings numéricos y redondea (el front
    // manda lo que el usuario teclea); error claro por campo.
    const body = z.object({
      playerId: z.coerce.number().int().positive(),
      salary:   z.coerce.number().positive().max(MAX_WAGE).transform(Math.round),
      years:    z.coerce.number().int().min(1).max(5),
      clause:   z.coerce.number().positive().max(MAX_MONEY).transform(Math.round).optional(),
    }).safeParse(request.body);
    if (!body.success) {
      const f = body.error.issues[0];
      return reply.code(400).send({ error: `Datos no válidos: ${f?.path?.join('.') || 'body'} — ${f?.message || ''}` });
    }

    try {
      const evaluation = await evaluateOffer(
        clubId, body.data.playerId, body.data.salary, body.data.years,
        body.data.clause ?? body.data.salary * 400,
      );
      return reply.send({ ...evaluation, accepted: evaluation.total >= 50 });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── POST /api/market/players/:playerId/renew — renovar contrato ──────────
  // Evalúa la oferta de renovación con la valoración multi-apartado; si el
  // jugador la acepta (llaves + total ≥ 50), se aplica (años SUMAN, máx. 5).

  app.post<{ Params: { playerId: string } }>('/players/:playerId/renew', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const playerId = positiveInt(request.params.playerId);
    if (!playerId) return reply.code(400).send({ error: 'Invalid playerId' });

    const body = z.object({
      salary: z.coerce.number().positive().max(MAX_WAGE).transform(Math.round),
      years:  z.coerce.number().int().min(1).max(5),
      clause: z.coerce.number().positive().max(MAX_MONEY).transform(Math.round).optional(),
    }).safeParse(request.body);
    if (!body.success) {
      const f = body.error.issues[0];
      return reply.code(400).send({ error: `Datos no válidos: ${f?.path?.join('.') || 'body'} — ${f?.message || ''}` });
    }

    try {
      const evaluation = await evaluateOffer(
        clubId, playerId, body.data.salary, body.data.years,
        body.data.clause ?? body.data.salary * 400,
      );
      const accepted = evaluation.total >= 50;
      if (!accepted) {
        return reply.send({ ok: false, accepted: false, evaluation, message: 'El jugador rechaza la renovación.' });
      }
      const player = await marketService.renewPlayer(clubId, playerId, body.data);
      return reply.send({ ok: true, accepted: true, evaluation, player });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── POST /api/market/offer — hacer oferta formal (clubs humanos) ─────────
  // Para clubs CPU se devuelve error indicando que deben usar /clause.
  // Acepta términos de contrato opcionales (salary/years/clause): si vienen, el
  // JUGADOR evalúa la oferta multi-apartado y puede rechazarla de entrada.

  app.post('/offer', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      playerId: z.number().int().positive(),
      amount:   z.number().int().positive().max(MAX_MONEY),
      salary:   z.number().int().positive().max(MAX_WAGE).optional(),
      years:    z.number().int().min(1).max(5).optional(),
      clause:   z.number().int().positive().max(MAX_MONEY).optional(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      // Si la oferta trae términos de contrato, el jugador la valora primero.
      if (body.data.salary != null && body.data.years != null) {
        const evaluation = await evaluateOffer(
          clubId, body.data.playerId, body.data.salary, body.data.years,
          body.data.clause ?? body.data.salary * 400,
        );
        if (evaluation.total < 50) {
          return reply.code(422).send({
            error: 'El jugador rechaza los términos de la oferta.',
            evaluation,
          });
        }
      }
      return reply.send(await marketService.makeOffer(
        userId, clubId, body.data.playerId, body.data.amount,
        { salary: body.data.salary, contractYears: body.data.years, releaseClause: body.data.clause },
      ));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── POST /api/market/offer/:id/respond — aceptar/rechazar oferta ────────

  app.post<{ Params: { id: string } }>('/offer/:id/respond', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({ accept: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const offerId = positiveInt(request.params.id);
    if (!offerId) return reply.code(400).send({ error: 'Invalid offer id' });

    const offer = await prisma.transferOffer.findUnique({
      where:   { id: offerId },
      include: { player: true, fromClub: true },
    });
    if (!offer)                           return reply.code(404).send({ error: 'Offer not found' });
    if (offer.player.clubId !== clubId)   return reply.code(403).send({ error: 'Not your player' });
    if (offer.status !== 'pending')       return reply.code(400).send({ error: 'Offer already resolved' });

    if (body.data.accept) {
      try {
        const result = await executeAcceptedOffer({ offer, sellerClubId: clubId, sellerUserId: request.user.userId });
        return reply.send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo ejecutar el traspaso.';
        return reply.code(400).send({ error: msg });
      }
    } else {
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'rejected' } });
    }

    return reply.send({ ok: true, status: body.data.accept ? 'accepted' : 'rejected' });
  });

  app.post<{ Params: { id: string } }>('/offers/:id/reject', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const offerId = positiveInt(request.params.id);
    if (!offerId) return reply.code(400).send({ error: 'Invalid offer id' });
    const offer = await prisma.transferOffer.findUnique({
      where: { id: offerId },
      include: { player: true },
    });
    if (!offer) return reply.code(404).send({ error: 'Offer not found' });
    if (offer.player.clubId !== clubId) return reply.code(403).send({ error: 'Not your player' });
    if (offer.status !== 'pending' && offer.status !== 'agent_proposed') {
      return reply.code(400).send({ error: 'Offer already resolved' });
    }
    await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'rejected' } });
    return reply.send({ ok: true, status: 'rejected' });
  });

  app.post<{ Params: { id: string } }>('/offers/:id/accept', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const offerId = positiveInt(request.params.id);
    if (!offerId) return reply.code(400).send({ error: 'Invalid offer id' });

    const offer = await prisma.transferOffer.findUnique({
      where: { id: offerId },
      include: { player: true },
    });
    if (!offer) return reply.code(404).send({ error: 'Offer not found' });
    if (offer.player.clubId !== clubId) return reply.code(403).send({ error: 'Not your player' });
    if (offer.status !== 'pending' && offer.status !== 'agent_proposed') {
      return reply.code(400).send({ error: 'Offer already resolved' });
    }

    try {
      return reply.send(await executeAcceptedOffer({ offer, sellerClubId: clubId, sellerUserId: request.user.userId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo ejecutar el traspaso.';
      return reply.code(400).send({ error: msg });
    }
  });

  // ─── DELETE /api/market/offer/:id — retirar oferta ───────────────────────

  app.delete<{ Params: { id: string } }>('/offer/:id', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const offerId = positiveInt(request.params.id);
    if (!offerId) return reply.code(400).send({ error: 'Invalid offer id' });

    const offer = await prisma.transferOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.fromClubId !== clubId) return reply.code(403).send({ error: 'Not your offer' });

    // Q4: solo se puede retirar una oferta que sigue pendiente (claim atómico).
    const withdrawn = await prisma.transferOffer.updateMany({
      where: { id: offer.id, status: 'pending' },
      data: { status: 'withdrawn' },
    });
    if (withdrawn.count === 0) {
      return reply.code(400).send({ error: 'La oferta ya fue resuelta y no se puede retirar.' });
    }
    return reply.send({ ok: true, status: 'withdrawn' });
  });

  // ─── PATCH /api/market/offer/:id — Q4 · modificar oferta pendiente ─────────
  // Permite ajustar importe y/o términos de contrato mientras la oferta siga
  // pending. Claim atómico (updateMany con status) para no pisar respuestas.
  app.patch<{ Params: { id: string } }>('/offer/:id', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const offerId = positiveInt(request.params.id);
    if (!offerId) return reply.code(400).send({ error: 'Invalid offer id' });

    const body = z.object({
      amount: z.coerce.number().int().positive().max(MAX_MONEY).optional(),
      salary: z.coerce.number().int().positive().max(MAX_WAGE).optional(),
      years:  z.coerce.number().int().min(1).max(5).optional(),
      clause: z.coerce.number().int().positive().max(MAX_MONEY).optional(),
    }).refine(b => b.amount !== undefined || b.salary !== undefined || b.years !== undefined || b.clause !== undefined, {
      message: 'Debes indicar al menos un campo a modificar',
    }).safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.issues[0]?.message ?? 'Datos no válidos' });
    }

    const offer = await prisma.transferOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.fromClubId !== clubId) return reply.code(403).send({ error: 'No es tu oferta.' });
    if (offer.status !== 'pending') {
      return reply.code(400).send({ error: 'Solo se pueden modificar ofertas pendientes.' });
    }

    try {
      const validated = await validatePendingOfferEdit(clubId, offer, body.data);
      const updated = await prisma.$transaction(async (tx) => {
        const claimed = await tx.transferOffer.updateMany({
          where: { id: offerId, status: 'pending' },
          data: {
            ...(body.data.amount !== undefined ? { amount: validated.amount } : {}),
            ...(validated.termsChanged ? {
              salary: validated.salary,
              contractYears: validated.years,
              releaseClause: validated.clause,
            } : {}),
          },
        });
        if (claimed.count === 0) throw new Error('La oferta ya fue resuelta y no se puede modificar.');
        return tx.transferOffer.findUnique({
          where: { id: offerId },
          include: {
            player: { select: { id: true, name: true, position: true, marketValue: true } },
            toClub: { select: { id: true, name: true, shortName: true, badge: true } },
          },
        });
      });

      return reply.send({ ok: true, offer: updated, evaluation: validated.evaluation });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo modificar la oferta.';
      return reply.code(400).send({
        error: msg,
        evaluation: err instanceof Error ? (err as Error & { evaluation?: unknown }).evaluation ?? undefined : undefined,
      });
    }
  });

  // ─── POST /api/market/loan — ceder jugador ────────────────────────────────

  app.post('/loan', MARKET_MUTATION_RATE_LIMIT, async (request, reply) => {
    const { clubId, userId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      playerId:         z.number().int().positive(),
      receivingClubId:  z.number().int().positive(),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await marketService.loanPlayer(userId, clubId, body.data.playerId, body.data.receivingClubId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
