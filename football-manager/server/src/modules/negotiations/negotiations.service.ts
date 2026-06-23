import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import { isLoanWindowOpen, isTransferWindowOpen, salaryCap } from '../game/tick.logic';
import { realtimeHub } from '../realtime/realtime.hub';
import { anticheatService } from '../admin/anticheat.service';
import { assertFDFBuyerCounts, coreAssertAntiResale, executePlayerTransfer, lockClubRow, spendableBase } from '../market/transfer.core';

// AUDIT 5.3 (TOCTOU): cliente Prisma intercambiable (global o transaccional) para
// que los asserts de tope salarial/plantilla puedan leer DENTRO de la transacción y
// del lock de club en `accept`, no fuera (donde dos aceptaciones concurrentes podían
// rebasar tope/plantilla por leer estado pre-commit).
type DbClient = typeof prisma | Prisma.TransactionClient;

// Schema actual:
// TransferAgreement { id, playerId, fromClubId, toClubId, amount, type, status, createdAt, updatedAt, proposerManagerId, counterpartyManagerId, parentId, message, offeredPlayerId, loanUntil, optionToBuyAmount, cashDelta }

type PrismaRuntime = typeof prisma & {
  transferAgreement?: any;
};

type AgreementInput = {
  type: 'sale' | 'loan' | 'exchange' | 'swap';
  targetClubId: number;
  playerId?: number;
  requestedPlayerId?: number;
  amount?: number;
  cashDelta?: number;
  offeredPlayerId?: number;
  loanUntil?: string;
  optionToBuyAmount?: number;
  message?: string;
};

const db = prisma as PrismaRuntime;

function agreementStore() {
  if (!db.transferAgreement) {
    throw new Error('TransferAgreement no disponible.');
  }
  return db.transferAgreement;
}

function playerWage(player: { wage?: number | null; salary: number }) {
  return Math.round(Number(player.wage ?? player.salary) || player.salary);
}

function agreementType(type: AgreementInput['type']) {
  if (type === 'sale') return 'transfer';
  if (type === 'swap') return 'exchange';
  return type;
}

async function clubWithSalary(clubId: number, db: DbClient = prisma) {
  const club = await db.club.findUnique({
    where: { id: clubId },
    include: {
      players: { select: { salary: true, wage: true } },
      coaches: { select: { salary: true } },
    },
  });
  if (!club) throw new Error('Club not found');
  const used = club.players.reduce((sum, player) => sum + playerWage(player), 0)
    + club.coaches.reduce((sum, coach) => sum + coach.salary, 0);
  return { club, used };
}

async function assertCanAcquire(clubId: number, player: { salary: number; wage?: number | null }, amount = 0, db: DbClient = prisma) {
  const { club, used } = await clubWithSalary(clubId, db);
  if (amount > 0 && spendableBase(club) < amount) throw new Error('Presupuesto insuficiente.');
  const cap = salaryCap(spendableBase(club), amount);
  if (used + playerWage(player) > cap) {
    throw new Error(`El club comprador supera el tope salarial (${cap} €/mes).`);
  }
}

async function inGameDate() {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
  return state?.inGameDate ?? new Date();
}

async function assertWindow(type: string) {
  const date = await inGameDate();
  if (type === 'loan') {
    if (!isLoanWindowOpen(date)) throw new Error('La ventana de cesiones está cerrada.');
  } else if (!isTransferWindowOpen(date)) {
    throw new Error('La ventana de fichajes está cerrada.');
  }
  return date;
}

async function assertSquadRoom(clubId: number, incoming = 1, outgoing = 0, db: DbClient = prisma) {
  const [squad, loanedOut, pendingIncoming] = await Promise.all([
    db.player.count({ where: { clubId } }),
    db.player.count({ where: { loanOwnerClubId: clubId } }),
    db.transferOffer.count({ where: { fromClubId: clubId, status: 'accepted_pending_window' } }),
  ]);
  assertFDFBuyerCounts(squad, loanedOut, pendingIncoming, incoming - outgoing);
}

async function assertCanLetPlayerLeave(clubId: number, db: DbClient = prisma) {
  const [firstTeam, youth] = await Promise.all([
    db.player.count({ where: { clubId } }),
    db.youthPlayer.count({ where: { youthAcademy: { clubId } } }),
  ]);
  if (firstTeam - 1 < 16) {
    throw new Error(`Límite FDF: el vendedor no puede bajar de 16 jugadores de primera plantilla (actual ${firstTeam}).`);
  }
  if (firstTeam - 1 + youth < 19) {
    throw new Error(`Límite FDF: el vendedor no puede bajar de 19 entre primer equipo y juveniles (actual ${firstTeam + youth}).`);
  }
}

const assertAntiResale = coreAssertAntiResale;

async function assertSwapSalary(clubAId: number, incomingToA: { salary: number; wage?: number | null }, outgoingFromA: { salary: number; wage?: number | null }, cashEffectA = 0, db: DbClient = prisma) {
  const { club, used } = await clubWithSalary(clubAId, db);
  if (cashEffectA < 0 && spendableBase(club) < Math.abs(cashEffectA)) throw new Error('Presupuesto insuficiente para el intercambio.');
  const cap = salaryCap(spendableBase(club), Math.max(0, -cashEffectA));
  const nextUsed = used - playerWage(outgoingFromA) + playerWage(incomingToA);
  if (nextUsed > cap) throw new Error(`El intercambio supera el tope salarial (${cap} €/mes).`);
}

async function loadAgreement(id: number) {
  const agreement = agreementStore();
  const row = await agreement.findUnique({ where: { id } });
  if (!row) throw new Error('Agreement not found');

  const [fromClub, toClub, player] = await Promise.all([
    prisma.club.findUnique({ where: { id: row.fromClubId }, select: { id: true, name: true, shortName: true, badge: true } }),
    prisma.club.findUnique({ where: { id: row.toClubId }, select: { id: true, name: true, shortName: true, badge: true } }),
    prisma.player.findUnique({
      where: { id: row.playerId },
      select: {
        id: true,
        name: true,
        clubId: true,
        salary: true,
        wage: true,
        marketValue: true,
        age: true,
        position: true,
        personality: true,
        mentality: true,
        isForSale: true,
        contractYears: true,
      },
    }),
  ]);

  const decoded = decodeMessage(row.message);
  const offeredPlayer = row.offeredPlayerId
    ? await prisma.player.findUnique({ where: { id: row.offeredPlayerId }, select: { id: true, name: true, clubId: true, salary: true, wage: true, marketValue: true } })
    : null;
  return {
    ...row,
    amount: row.cashDelta ?? decoded.cashDelta ?? row.amount,
    message: decoded.message,
    optionToBuyAmount: row.optionToBuyAmount ?? decoded.optionToBuyAmount,
    cashDelta: row.cashDelta ?? decoded.cashDelta ?? row.amount,
    fromClub,
    toClub,
    player,
    offeredPlayer,
    agentMessage: buildAgentMessage(row, player, row.cashDelta ?? decoded.cashDelta ?? row.amount),
  };
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildAgentMessage(
  agreement: { id: number; type: string; status: string },
  player: {
    id: number;
    name: string;
    age: number;
    position: string;
    marketValue: number;
    personality: string;
    mentality: string;
    isForSale: boolean;
    contractYears: number;
  } | null,
  amount: number | null | undefined,
) {
  if (!player) return 'El agente pide revisar la operación: el jugador ya no está localizable en el mercado.';
  const name = player.name;
  const personality = `${player.personality} ${player.mentality}`.toLowerCase();
  const fee = Math.abs(Math.round(Number(amount) || 0));
  const strongOffer = fee > 0 && fee >= player.marketValue * 1.1;
  const lowOffer = fee > 0 && fee < player.marketValue * 0.75;
  const pool: string[] = [];

  if (agreement.type === 'loan') {
    pool.push(`El entorno de ${name} quiere minutos claros. Si la cesión es para mirar desde el banquillo, no van a empujar.`);
    pool.push(`${name} aceptaría moverse cedido si el plan deportivo está bien explicado desde el primer día.`);
  }
  if (agreement.type === 'exchange') {
    pool.push(`El agente de ${name} pregunta por el encaje del intercambio: no quieren que parezca una salida de saldo.`);
  }
  if (player.isForSale) {
    pool.push(`El agente de ${name} sabe que el club escucha ofertas. Hay vía, pero pide una propuesta limpia.`);
  }
  if (player.contractYears <= 1) {
    pool.push(`El contrato de ${name} no da para tensar mucho la cuerda. Su agente cree que es momento de decidir.`);
  }
  if (player.age <= 21) {
    pool.push(`El entorno de ${name} no solo mira dinero: quiere un proyecto donde el chico juegue y crezca.`);
  }
  if (strongOffer) {
    pool.push(`La cifra ha llamado la atención del agente de ${name}. Ahora toca convencer al club sin ruido.`);
  }
  if (lowOffer) {
    pool.push(`El agente de ${name} avisa: con esa cantidad, la conversación empieza cuesta arriba.`);
  }
  if (personality.includes('ambic') || personality.includes('ambit')) {
    pool.push(`${name} es ambicioso: su agente preguntará por objetivos, minutos y escaparate antes de hablar de sueldo.`);
  }
  if (personality.includes('leal') || personality.includes('loyal')) {
    pool.push(`${name} no quiere salir de cualquier manera. Su agente pide respeto por el club y una explicación honesta.`);
  }
  if (pool.length === 0) {
    pool.push(`El entorno de ${name} pide claridad: si el proyecto deportivo es serio, escucharán la propuesta sin montar ruido.`);
    pool.push(`El agente de ${name} deja la puerta entreabierta, pero quiere ver intención real en la mesa.`);
    pool.push(`${name} no está forzando nada. Su agente escuchará, tomará nota y medirá el tono de la operación.`);
  }

  const index = stableHash(`${agreement.id}:${agreement.type}:${agreement.status}:${player.id}:${player.personality}:${player.mentality}`) % pool.length;
  return pool[index];
}

function emitAgreement(clubId: number, type: string, payload: unknown) {
  realtimeHub.broadcast(`club:${clubId}`, type, payload);
}

function decodeMessage(raw: string | null | undefined) {
  if (!raw) return { message: null, optionToBuyAmount: null, cashDelta: undefined };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && ('optionToBuyAmount' in parsed || 'cashDelta' in parsed)) {
      return {
        message: typeof parsed.body === 'string' ? parsed.body : '',
        optionToBuyAmount: typeof parsed.optionToBuyAmount === 'number' ? parsed.optionToBuyAmount : null,
        cashDelta: typeof parsed.cashDelta === 'number' ? parsed.cashDelta : undefined,
      };
    }
  } catch {
    // plain legacy message
  }
  return { message: raw, optionToBuyAmount: null, cashDelta: undefined };
}

async function resolveDealShape(agreement: any) {
  const player = await prisma.player.findUnique({ where: { id: agreement.playerId } });
  if (!player) throw new Error('Player not found');

  if (player.clubId === agreement.fromClubId) {
    return { sellerClubId: agreement.fromClubId, buyerClubId: agreement.toClubId, player };
  }
  if (player.clubId === agreement.toClubId) {
    return { sellerClubId: agreement.toClubId, buyerClubId: agreement.fromClubId, player };
  }
  throw new Error('El jugador ya no pertenece a ninguno de los clubes negociadores.');
}

async function validateNegotiationPlayer(
  requestedPlayerId: number,
  clubA: number,
  clubB: number,
  type: string,
) {
  const player = await prisma.player.findUnique({ where: { id: requestedPlayerId } });
  if (!player) throw new Error('El jugador ya no existe.');
  if (player.clubId !== clubA && player.clubId !== clubB) {
    throw new Error('El jugador debe pertenecer a uno de los dos clubes negociadores.');
  }
  if (player.loanOwnerClubId != null && type !== 'loan') {
    throw new Error('No se puede traspasar un jugador que está cedido: primero debe volver a su club.');
  }
  return player;
}

export const negotiationsService = {
  async listAgreements(clubId: number, filters: { status?: string } = {}) {
    const agreement = agreementStore();
    const rows = await agreement.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        OR: [{ fromClubId: clubId }, { toClubId: clubId }],
      },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row: { id: number }) => loadAgreement(row.id)));
  },

  async getAgreement(clubId: number, id: number) {
    const row = await loadAgreement(id);
    if (row.fromClubId !== clubId && row.toClubId !== clubId) throw new Error('Not your agreement');
    return row;
  },

  async propose(proposer: { managerId: number; clubId: number }, input: AgreementInput) {
    if (input.targetClubId === proposer.clubId) throw new Error('No puedes negociar contigo mismo.');
    const type = agreementType(input.type);
    const requestedPlayerId = input.requestedPlayerId ?? input.playerId;
    if (!requestedPlayerId) throw new Error('requestedPlayerId/playerId required.');
    if (type === 'exchange' && !input.offeredPlayerId) {
      throw new Error('Debe proporcionar el id del jugador ofrecido para un intercambio.');
    }
    await assertWindow(type);

    await validateNegotiationPlayer(requestedPlayerId, proposer.clubId, input.targetClubId, type);
    const targetClub = await prisma.club.findUnique({
      where: { id: input.targetClubId },
      select: { id: true, name: true },
    });
    if (!targetClub) throw new Error('El club destinatario no existe.');
    const duplicated = await agreementStore().findFirst({
      where: {
        status: 'proposed',
        playerId: requestedPlayerId,
        OR: [
          { fromClubId: proposer.clubId, toClubId: input.targetClubId },
          { fromClubId: input.targetClubId, toClubId: proposer.clubId },
        ],
      },
      select: { id: true },
    });
    if (duplicated) {
      throw new Error('Ya hay una negociación abierta por este jugador con ese club: responde o retira la existente.');
    }

    const agreement = agreementStore();
    const row = await agreement.create({
      data: {
        type,
        status: 'proposed',
        fromClubId: proposer.clubId,
        toClubId: input.targetClubId,
        playerId: requestedPlayerId,
        amount: input.cashDelta !== undefined ? Math.round(input.cashDelta) : (input.amount ? Math.round(input.amount) : 0),
        cashDelta: input.cashDelta !== undefined ? Math.round(input.cashDelta) : (input.amount !== undefined ? Math.round(input.amount) : null),
        optionToBuyAmount: input.optionToBuyAmount !== undefined ? Math.round(input.optionToBuyAmount) : null,
        offeredPlayerId: type === 'exchange' ? input.offeredPlayerId : null,
        loanUntil: type === 'loan' ? (input.loanUntil ? new Date(input.loanUntil) : null) : null,
        proposerManagerId: proposer.managerId,
        message: input.message,
      },
    });
    const payload = await loadAgreement(row.id);
    emitAgreement(input.targetClubId, 'negotiation:proposed', payload);
    return payload;
  },

  // Q4/Q5 (aditivo): el club PROPONENTE puede retirar su propuesta mientras
  // siga en estado 'proposed' (claim atómico para no pisar un accept simultáneo).
  async withdraw(clubId: number, id: number) {
    const agreement = agreementStore();
    const current = await loadAgreement(id);
    if (current.fromClubId !== clubId) throw new Error('Solo el club proponente puede retirar la propuesta.');
    const claimed = await agreement.updateMany({
      where: { id, status: 'proposed' },
      data: { status: 'withdrawn' },
    });
    if (claimed.count === 0) throw new Error('La negociación ya fue resuelta y no se puede retirar.');
    const payload = await loadAgreement(id);
    emitAgreement(current.toClubId, 'negotiation:withdrawn', payload);
    return payload;
  },

  async reject(clubId: number, id: number) {
    const agreement = agreementStore();
    const current = await loadAgreement(id);
    if (current.toClubId !== clubId) throw new Error('Solo el club destinatario puede rechazar.');
    // AUDIT 5.3-6: claim atómico (como withdraw/accept) para no pisar un accept/counter
    // simultáneo; antes el check de estado y el update eran independientes (doble resolución).
    const claimed = await agreement.updateMany({ where: { id, status: 'proposed' }, data: { status: 'rejected' } });
    if (claimed.count === 0) throw new Error('Agreement already resolved');
    const payload = await loadAgreement(id);
    emitAgreement(current.fromClubId, 'negotiation:rejected', payload);
    return payload;
  },

  async counter(club: { managerId: number; clubId: number }, id: number, input: AgreementInput) {
    const agreement = agreementStore();
    const current = await loadAgreement(id);
    if (current.toClubId !== club.clubId) throw new Error('Solo el club destinatario puede contraofertar.');
    if (current.status !== 'proposed') throw new Error('Agreement already resolved');
    const type = agreementType(input.type);
    const requestedPlayerId = input.requestedPlayerId ?? input.playerId;
    if (!requestedPlayerId) throw new Error('requestedPlayerId/playerId required.');
    if (type === 'exchange' && !input.offeredPlayerId) {
      throw new Error('Debe proporcionar el id del jugador ofrecido para un intercambio.');
    }
    await assertWindow(type);

    await validateNegotiationPlayer(requestedPlayerId, club.clubId, current.fromClubId, type);
    if (type === 'exchange' && input.offeredPlayerId) {
      await validateNegotiationPlayer(input.offeredPlayerId, club.clubId, current.fromClubId, type);
    }

    // AUDIT 5.3-6: reclamar atómicamente la propuesta actual antes de crear la contra
    // (evita doble resolución si un accept/reject concurrente la resuelve a la vez).
    const claimed = await agreement.updateMany({ where: { id, status: 'proposed' }, data: { status: 'rejected' } });
    if (claimed.count === 0) throw new Error('Agreement already resolved');
    const row = await agreement.create({
      data: {
        type,
        status: 'proposed',
        fromClubId: club.clubId,
        toClubId: current.fromClubId,
        playerId: requestedPlayerId,
        amount: input.cashDelta !== undefined ? Math.round(input.cashDelta) : (input.amount ? Math.round(input.amount) : 0),
        cashDelta: input.cashDelta !== undefined ? Math.round(input.cashDelta) : (input.amount !== undefined ? Math.round(input.amount) : null),
        optionToBuyAmount: input.optionToBuyAmount !== undefined ? Math.round(input.optionToBuyAmount) : null,
        offeredPlayerId: type === 'exchange' ? input.offeredPlayerId : null,
        loanUntil: type === 'loan' ? (input.loanUntil ? new Date(input.loanUntil) : null) : null,
        proposerManagerId: club.managerId,
        counterpartyManagerId: current.proposerManagerId,
        parentId: id,
        message: input.message,
      },
    });
    const payload = await loadAgreement(row.id);
    emitAgreement(current.fromClubId, 'negotiation:countered', payload);
    return payload;
  },

  async accept(clubId: number, id: number) {
    agreementStore(); // guard: lanza si TransferAgreement no está disponible
    const current = await loadAgreement(id);
    if (current.toClubId !== clubId) throw new Error('Solo el club destinatario puede aceptar.');
    if (current.status !== 'proposed') return current;
    if (current.type === 'loan' && !current.loanUntil) {
      throw new Error('Cesiones deben tener loanUntil.');
    }
    const participants = await prisma.manager.findMany({
      where: { clubId: { in: [current.fromClubId, current.toClubId] } },
      select: { clubId: true, userId: true },
    });
    const proposerUserId = participants.find(manager => manager.clubId === current.fromClubId)?.userId;
    const counterpartyUserId = participants.find(manager => manager.clubId === current.toClubId)?.userId;
    if (proposerUserId && counterpartyUserId) {
      await anticheatService.checkMultiAccount(proposerUserId, counterpartyUserId);
      await anticheatService.logSuspiciousTransfer(
        counterpartyUserId,
        clubId,
        Math.abs(Math.round(Number(current.cashDelta ?? current.amount) || 0)),
        current.player?.marketValue ?? 0,
        current.playerId,
        'NEGOCIACION_ACEPTADA',
      );
    }

    const accepted = await prisma.$transaction(async (tx: any) => {
      const locked = await tx.transferAgreement.updateMany({
        where: { id, status: 'proposed' },
        data: { status: 'accepted' },
      });
      if (locked.count === 0) return tx.transferAgreement.findUnique({ where: { id } });

      const date = await assertWindow(current.type);
      const shape = await resolveDealShape(current);
      const amount = Math.round(Number(current.cashDelta ?? current.amount) || 0);

      // AUDIT 5.3 (TOCTOU): bloquear AMBOS clubes implicados en orden de id ascendente
      // (evita deadlocks con aceptaciones cruzadas) ANTES de validar tope/plantilla, y
      // pasar `tx` a los asserts para que lean dentro del lock. Antes, los asserts
      // leían con el cliente global fuera de la tx → dos aceptaciones simultáneas
      // podían rebasar el tope salarial o el límite de plantilla.
      for (const cid of [shape.buyerClubId, shape.sellerClubId].sort((a, b) => a - b)) {
        await lockClubRow(tx, cid);
      }

      if (current.type === 'loan') {
        await assertSquadRoom(shape.buyerClubId, 1, 0, tx);
        await assertCanLetPlayerLeave(shape.sellerClubId, tx);
        await assertCanAcquire(shape.buyerClubId, shape.player, 0, tx);
        if (shape.player.loanOwnerClubId != null) throw new Error('Este jugador ya está cedido.');
        const moved = await tx.player.updateMany({
          where: { id: shape.player.id, clubId: shape.sellerClubId, loanOwnerClubId: null },
          data: {
            clubId: shape.buyerClubId,
            loanOwnerClubId: shape.sellerClubId,
            loanEndDate: current.loanUntil,
          },
        });
        if (moved.count === 0) throw new Error('El jugador ya no está disponible para cesión.');
      } else if (current.type === 'exchange' && current.offeredPlayerId) {
        const offered = await tx.player.findUnique({ where: { id: current.offeredPlayerId } });
        if (offered && offered.clubId === shape.buyerClubId) {
          if (shape.player.loanOwnerClubId != null || offered.loanOwnerClubId != null) {
            throw new Error('No se pueden intercambiar jugadores cedidos.');
          }
          await assertSquadRoom(shape.buyerClubId, 1, 1, tx);
          await assertSquadRoom(shape.sellerClubId, 1, 1, tx);
          await assertSwapSalary(shape.buyerClubId, shape.player, offered, amount, tx);
          await assertSwapSalary(shape.sellerClubId, offered, shape.player, -amount, tx);
          assertAntiResale(shape.player, Math.max(0, amount), date);
          assertAntiResale(offered, Math.max(0, -amount), date);
          if (amount > 0) {
            const charged = await tx.club.updateMany({
              where: { id: shape.buyerClubId, budget: { gte: amount } },
              data: { budget: { decrement: amount }, cash: { decrement: amount } },
            });
            if (charged.count === 0) throw new Error('Presupuesto insuficiente para el intercambio.');
            await tx.club.update({ where: { id: shape.sellerClubId }, data: { budget: { increment: amount }, cash: { increment: amount } } });
          } else if (amount < 0) {
            const reverse = Math.abs(amount);
            const charged = await tx.club.updateMany({
              where: { id: shape.sellerClubId, budget: { gte: reverse } },
              data: { budget: { decrement: reverse }, cash: { decrement: reverse } },
            });
            if (charged.count === 0) throw new Error('Presupuesto insuficiente para el intercambio.');
            await tx.club.update({ where: { id: shape.buyerClubId }, data: { budget: { increment: reverse }, cash: { increment: reverse } } });
          }
          const movedMain = await tx.player.updateMany({
            where: { id: shape.player.id, clubId: shape.sellerClubId, loanOwnerClubId: null },
            data: {
              clubId: shape.buyerClubId,
              isForSale: false,
              salePrice: null,
              lastTransferAt: date,
              lastTransferValue: Math.max(0, offered.marketValue + amount),
            },
          });
          const movedOffered = await tx.player.updateMany({
            where: { id: current.offeredPlayerId, clubId: shape.buyerClubId, loanOwnerClubId: null },
            data: {
              clubId: shape.sellerClubId,
              isForSale: false,
              salePrice: null,
              lastTransferAt: date,
              lastTransferValue: Math.max(0, shape.player.marketValue - amount),
            },
          });
          if (movedMain.count === 0 || movedOffered.count === 0) {
            throw new Error('Algún jugador ya fue movido por otra operación.');
          }
        } else {
          throw new Error('El jugador ofrecido para intercambio ya no es válido.');
        }
      } else {
        const transferValue = Math.max(0, amount);
        if (amount < 0) {
          const reverse = Math.abs(amount);
          const charged = await tx.club.updateMany({
            where: { id: shape.sellerClubId, budget: { gte: reverse } },
            data: { budget: { decrement: reverse }, cash: { decrement: reverse } },
          });
          if (charged.count === 0) throw new Error('Presupuesto insuficiente para el pago pactado.');
          await tx.club.update({ where: { id: shape.buyerClubId }, data: { budget: { increment: reverse }, cash: { increment: reverse } } });
        }
        await executePlayerTransfer({
          playerId: shape.player.id,
          buyerClubId: shape.buyerClubId,
          sellerClubId: shape.sellerClubId,
          amount: transferValue,
          source: 'negotiation',
          inGameDate: date,
        }, tx);
      }

      await tx.transferListing.deleteMany({ where: { playerId: shape.player.id } });
      await tx.transferOffer.updateMany({
        where: { playerId: shape.player.id, status: 'pending' },
        data: { status: 'rejected' },
      });
      return tx.transferAgreement.findUnique({ where: { id } });
    });

    const payload = await loadAgreement(accepted.id);
    emitAgreement(current.fromClubId, 'negotiation:accepted', payload);
    emitAgreement(current.toClubId, 'negotiation:accepted', payload);
    return payload;
  },

  async exerciseLoanOption(clubId: number, id: number) {
    const current = await loadAgreement(id);
    if (current.toClubId !== clubId) throw new Error('Solo el club cesionario puede ejercer la opción.');
    if (current.type !== 'loan' || current.status !== 'accepted') throw new Error('La opción solo aplica a cesiones aceptadas.');
    if (!current.optionToBuyAmount || current.optionToBuyAmount <= 0) {
      throw new Error('Esta cesión no tiene opción de compra pactada.');
    }
    const date = await assertWindow('transfer');
    const price = Math.round(current.optionToBuyAmount);

    const result = await prisma.$transaction(async (tx: any) => {
      const player = await tx.player.findUnique({ where: { id: current.playerId } });
      if (!player) throw new Error('Jugador no encontrado.');
      if (player.clubId !== clubId || player.loanOwnerClubId !== current.fromClubId) {
        throw new Error('El jugador no está cedido en tu club desde el club propietario pactado.');
      }
      await assertSquadRoom(clubId, 0, 0);
      await assertCanAcquire(clubId, player, price);
      assertAntiResale(player, price, date);
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: price } },
        data: { budget: { decrement: price }, cash: { decrement: price } },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente para ejercer la opción.');
      await tx.club.update({ where: { id: current.fromClubId }, data: { budget: { increment: price }, cash: { increment: price } } });
      await tx.player.update({
        where: { id: player.id },
        data: {
          loanOwnerClubId: null,
          loanEndDate: null,
          lastTransferAt: date,
          lastTransferValue: price,
          isForSale: false,
          salePrice: null,
        },
      });
      await tx.transferAgreement.update({ where: { id }, data: { status: 'option_exercised' } });
      return tx.transferAgreement.findUnique({ where: { id } });
    });

    const payload = await loadAgreement(result.id);
    emitAgreement(current.fromClubId, 'negotiation:option_exercised', payload);
    emitAgreement(current.toClubId, 'negotiation:option_exercised', payload);
    return { ok: true, agreement: payload, price };
  },
};
