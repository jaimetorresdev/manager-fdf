// ─── FIFA Service — policía del juego ─────────────────────────────────────────
import prisma from '../../db/prisma';
import { getInGameDate } from '../../lib/inGameDate';

export interface SanctionInput {
  managerId: number;      // manager being sanctioned
  reason: string;
  budgetPenalty?: number; // amount to deduct from club budget
  suspendTurns?: number;  // not persisted in players, stored in Sanction reason
  ban?: boolean;          // AUDIT 3.3: baneo real (isBanned + tokenVersion++ → mata JWT)
  agentFifaId: number;    // manager ID of the FIFA agent performing the action
}

export interface RepresentationInput {
  playerId: number;
  commission?: number;
}

export interface ContractNegotiationInput {
  representationId: number;
  wage?: number;
  contractYears?: number;
  releaseClause?: number;
  commission?: number;
}

export interface AgentOfferInput {
  representationId: number;
  clubId: number;
  price?: number;
}

async function ensureAgent(userId: number) {
  return prisma.agent.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

function clampCommission(value: number | undefined): number {
  return Math.max(0.02, Math.min(0.25, value ?? 0.10));
}

export const fifaService = {
  // ── Agent portfolio ────────────────────────────────────────────────────────

  async getAgentPortfolio(userId: number) {
    const agent = await ensureAgent(userId);
    const representations = await prisma.agentRepresentation.findMany({
      where: { agentId: agent.id },
      include: {
        player: {
          include: {
            club: { select: { id: true, name: true, shortName: true, badge: true } },
            legacyOffers: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: {
                fromClub: { select: { id: true, name: true, shortName: true } },
                toClub: { select: { id: true, name: true, shortName: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { agent, representations };
  },

  async representPlayer(userId: number, input: RepresentationInput) {
    const agent = await ensureAgent(userId);
    const player = await prisma.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new Error('Jugador no encontrado');

    const representation = await prisma.agentRepresentation.upsert({
      where: { playerId: input.playerId },
      create: {
        agentId: agent.id,
        playerId: input.playerId,
        commission: clampCommission(input.commission),
      },
      update: {
        agentId: agent.id,
        commission: clampCommission(input.commission),
      },
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId: agent.id,
        target: `player:${input.playerId}`,
        reason: `Agent representation updated`,
      },
    });

    return representation;
  },

  async negotiateContract(userId: number, input: ContractNegotiationInput) {
    const agent = await ensureAgent(userId);
    const rep = await prisma.agentRepresentation.findFirst({
      where: { id: input.representationId, agentId: agent.id },
      include: { player: true },
    });
    if (!rep) throw new Error('Representación no encontrada');

    const data: Record<string, unknown> = {};
    if (typeof input.wage === 'number') {
      const wage = Math.max(500, Math.round(input.wage));
      data.wage = wage;
      data.salary = wage;
    }
    if (typeof input.contractYears === 'number') {
      const years = Math.max(1, Math.min(5, input.contractYears));
      const start = await getInGameDate();
      const end = new Date(start);
      end.setUTCFullYear(end.getUTCFullYear() + years);
      data.contractYears = years;
      data.contractStartAt = start;
      data.contractEndAt = end;
    }
    if (typeof input.releaseClause === 'number') {
      data.releaseClause = Math.max(0, Math.round(input.releaseClause));
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (typeof input.commission === 'number') {
        await tx.agentRepresentation.update({
          where: { id: rep.id },
          data: { commission: clampCommission(input.commission) },
        });
      }
      return tx.player.update({
        where: { id: rep.playerId },
        data,
      });
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId: agent.id,
        target: `player:${rep.playerId}`,
        reason: `Contract negotiated by FIFA agent`,
      },
    });

    return updated;
  },

  async offerRepresentedToClub(userId: number, input: AgentOfferInput) {
    const agent = await ensureAgent(userId);
    const rep = await prisma.agentRepresentation.findFirst({
      where: { id: input.representationId, agentId: agent.id },
      include: { player: true },
    });
    if (!rep) throw new Error('Representación no encontrada');
    if (rep.player.clubId === input.clubId) throw new Error('El jugador ya pertenece a ese club');

    const price = Math.max(0, Math.round(input.price ?? rep.player.marketValue));
    if (rep.player.clubId) {
      const gameState = await prisma.gameState.findFirst({
        where: { isActive: true },
        select: { turn: true },
      });
      const offer = await prisma.transferOffer.create({
        data: {
          playerId: rep.playerId,
          fromClubId: input.clubId,
          toClubId: rep.player.clubId,
          amount: price,
          status: 'agent_proposed',
          turn: gameState?.turn ?? 0,
        },
      });
      await prisma.transferListing.upsert({
        where: { playerId: rep.playerId },
        create: { playerId: rep.playerId, price, type: 'transfer' },
        update: { price, type: 'transfer' },
      });
      return { offer, listingCreated: true };
    }

    const listing = await prisma.transferListing.upsert({
      where: { playerId: rep.playerId },
      create: { playerId: rep.playerId, price, type: 'transfer' },
      update: { price, type: 'transfer' },
    });
    return { listing, freeAgent: true };
  },

  // ── AnticheatAlerts ────────────────────────────────────────────────────────

  async getAlerts() {
    return prisma.anticheatAlert.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, username: true, email: true, role: true } },
      },
    });
  },

  async resolveAlert(
    alertId: number,
    resolverUserId: number,
    decision: 'ignored' | 'banned' = 'ignored',
  ) {
    // AUDIT 5.9: antes el alert se cerraba SIEMPRE como `resolved_ignored` y no
    // registraba quién lo resolvió. Ahora respeta la decisión del agente FIFA
    // (ignorar vs sancionar) y persiste `resolvedBy` (FK a User) para auditoría.
    const status = decision === 'banned' ? 'resolved_banned' : 'resolved_ignored';
    const alert = await prisma.anticheatAlert.update({
      where: { id: alertId },
      data: {
        status,
        resolvedBy: resolverUserId,
        resolvedAt: new Date(),
      },
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId: resolverUserId,
        target: `alert:${alertId}`,
        reason: `Alert resolved by agent (${decision})`,
      },
    });

    return alert;
  },

  // ── Chat Moderation ────────────────────────────────────────────────────────

  async getChatMessages(take = 50) {
    return prisma.chatMessage.findMany({
      orderBy: { timestamp: 'desc' },
      take,
      include: {
        channel: { select: { id: true, name: true, type: true } },
      },
    });
  },

  async deleteChatMessage(messageId: number, agentFifaId: number) {
    const msg = await prisma.chatMessage.delete({
      where: { id: messageId },
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId,
        target: `chat_message:${messageId}`,
        reason: `Chat message deleted by FIFA agent`,
      },
    });

    return msg;
  },

  // ── Forum Moderation ───────────────────────────────────────────────────────

  async getForumPosts(take = 50) {
    return prisma.forumPost.findMany({
      orderBy: { id: 'desc' },
      take,
      include: {
        thread: { select: { id: true, title: true, category: true } },
      },
    });
  },

  async deleteForumPost(postId: number, agentFifaId: number) {
    const post = await prisma.forumPost.delete({
      where: { id: postId },
    });

    await prisma.adminAction.create({
      data: {
        agentFifaId,
        target: `forum_post:${postId}`,
        reason: `Forum post deleted by FIFA agent`,
      },
    });

    return post;
  },

  // ── Sanctions ─────────────────────────────────────────────────────────────

  async sanctionManager(input: SanctionInput) {
    const { managerId, reason, budgetPenalty, suspendTurns, ban, agentFifaId } = input;

    // Get the manager's club
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      include: { club: { select: { id: true, name: true } }, user: { select: { id: true, username: true } } },
    });

    if (!manager) throw new Error('Manager no encontrado');

    const results: Record<string, unknown> = { managerId, reason };

    // AUDIT 3.3: un baneo real debe tener efecto inmediato sobre las sesiones.
    // `isBanned` hace que authenticate() devuelva 401; `tokenVersion++` invalida
    // cualquier JWT ya emitido (auth.ts compara la versión del token con la del
    // usuario). Así un baneado con un JWT todavía "vivo" recibe 401 al instante.
    if (ban) {
      await prisma.user.update({
        where: { id: manager.userId },
        data: {
          isBanned: true,
          bannedReason: reason,
          tokenVersion: { increment: 1 },
        },
      });
      results.banned = true;
    }

    // Deduct budget penalty from club if specified
    if (budgetPenalty && budgetPenalty > 0 && manager.clubId && manager.club) {
      // QB6: atomic decrement — avoids TOCTOU race vs concurrent reads of budget/cash
      await prisma.club.update({
        where: { id: manager.clubId },
        data: {
          budget: { decrement: budgetPenalty },
          cash:   { decrement: budgetPenalty },
        },
      });
      results.budgetPenalty = budgetPenalty;
    }

    // AUDIT H-4 / 3.3: suspensión REAL del mánager (antes era decorativa). Se persiste
    // el turno hasta el que queda suspendido (`turn + suspendTurns`); `assertCanOperate`
    // lo comprueba y bloquea sus operaciones de mercado mientras dure.
    if (suspendTurns && suspendTurns > 0) {
      const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } });
      const currentTurn = state?.turn ?? 0;
      await prisma.manager.update({
        where: { id: managerId },
        data: { suspendedUntilTurn: currentTurn + suspendTurns },
      });
      results.suspendTurns = suspendTurns;
      results.suspendedUntilTurn = currentTurn + suspendTurns;
    }

    // Log AdminAction
    const fullReason = [
      reason,
      budgetPenalty ? `Budget penalty: ${budgetPenalty}` : '',
      suspendTurns ? `Suspend turns: ${suspendTurns}` : '',
      ban ? 'BAN (JWT invalidado)' : '',
    ].filter(Boolean).join(' | ');

    await prisma.adminAction.create({
      data: {
        agentFifaId,
        target: `manager:${managerId}`,
        reason: fullReason,
      },
    });

    return results;
  },

  // ── Read-only economy/turn data ────────────────────────────────────────────

  async getEconomySummary() {
    const [state, recentFinance] = await Promise.all([
      prisma.gameState.findFirst({
        where: { isActive: true },
        select: { week: true, turn: true, phase: true, inGameDate: true, nextTickAt: true },
      }),
      prisma.financeSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          week: true,
          season: true,
          budget: true,
          income: true,
          expenses: true,
          club: { select: { id: true, name: true, shortName: true } },
        },
      }),
    ]);

    return { gameState: state, recentFinance };
  },
};
