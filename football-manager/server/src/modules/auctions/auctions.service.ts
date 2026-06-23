import type { FastifyBaseLogger } from 'fastify';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../../config/env';
import prisma from '../../db/prisma';
import { getInGameDate } from '../../lib/inGameDate';
import { anticheatService } from '../admin/anticheat.service';
import { salaryCap } from '../game/tick.logic';
import { realtimeHub } from '../realtime/realtime.hub';
import { executePlayerTransfer, spendableBase } from '../market/transfer.core';
import { assertCanOperate, assertWindowOpen } from '../market/market.service';

// Auction { id, playerId, sellerClubId, startPrice, status(active|finished|cancelled), endsAt, winningClubId, closedNoSaleReason }
// AuctionBid { id, auctionId, managerId, amount, createdAt }

type PrismaRuntime = typeof prisma & {
  auction?: any;
  auctionBid?: any;
};

type TransferListingWithPlayer = {
  id: number;
  playerId: number;
  price: number;
  type: string;
  player: {
    id: number;
    name: string;
    clubId: number | null;
    salary: number;
    wage: number | null;
    marketValue: number;
  };
};

const db = prisma as PrismaRuntime;
const closeTimers = new Map<number, NodeJS.Timeout>();
const BID_SEAL_KID = 'auction-bid-v1';

function bidSealKey(): Buffer {
  return createHash('sha256').update(`${env.jwtSecret}:${BID_SEAL_KID}`).digest();
}

function sealBidFields(bid: { id: number; auctionId: number; managerId?: number | null; amount?: number | null }) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', bidSealKey(), iv);
  const plaintext = JSON.stringify({
    id: bid.id,
    auctionId: bid.auctionId,
    managerId: bid.managerId ?? null,
    amount: bid.amount ?? null,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'A256GCM',
    kid: BID_SEAL_KID,
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: tag.toString('base64url'),
  };
}

function publicBid(bid: any) {
  if (!bid) return null;
  return {
    id: bid.id,
    auctionId: bid.auctionId,
    createdAt: bid.createdAt,
    sealed: true,
    encrypted: sealBidFields(bid),
  };
}

function publicAuction(row: any) {
  const isFinished = row.status !== 'active';
  // AUDIT 5.3 (subasta SELLADA real): mientras la subasta está activa NO se expone
  // ningún dato del líder ni del precio actual. Antes, `...row` filtraba `currentBid`
  // (importe del mejor postor) y se anunciaba `publicPriceField: 'currentBid'`, lo que
  // la convertía de facto en subasta inglesa. Ahora `currentBid`/`winningClubId` solo
  // se revelan cuando la subasta ha terminado; lo único público en activo es
  // `startPrice` (reserva/mínimo, independiente de las pujas) y el nº de pujas.
  const bidCount = Array.isArray(row.bids) ? row.bids.length : 0;
  // Se extraen `currentBid`/`winningClubId` para revelarlos solo al terminar; `bids` y
  // `highestBid` quedan en `...rest` pero se SOBRESCRIBEN abajo (van cifrados).
  const { currentBid, winningClubId, ...rest } = row;
  return {
    ...rest,
    bids: [], // los importes y autores van cifrados; no se listan en claro
    bidCount,
    highestBid: null,
    currentBid: isFinished ? currentBid : null,
    winningClubId: isFinished ? winningClubId : null,
    bidPrivacy: {
      mode: 'sealed',
      publicPriceField: null,        // nada de precio en vivo
      revealedOnClose: ['currentBid', 'winningClubId'],
      encryptedFields: ['amount', 'managerId'],
      scheme: BID_SEAL_KID,
    },
  };
}

function stores() {
  if (!db.auction || !db.auctionBid) {
    throw new Error('Auction/AuctionBid no disponibles.');
  }
  return { auction: db.auction, auctionBid: db.auctionBid };
}

function asPositiveInt(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('El importe debe ser un entero positivo.');
  return value;
}

function playerWage(player: { wage?: number | null; salary: number }) {
  return Math.round(Number(player.wage ?? player.salary) || player.salary);
}

async function getListing(listingId: number): Promise<TransferListingWithPlayer> {
  const listing = await prisma.transferListing.findUnique({
    where: { id: listingId },
    include: { player: true },
  });
  if (!listing) throw new Error('TransferListing not found');
  if (listing.type !== 'transfer') throw new Error('Solo se pueden subastar listings de transferencia.');
  if (!listing.player.clubId) throw new Error('El jugador no pertenece a ningún club vendedor.');
  return listing;
}

async function buyerSalaryUse(clubId: number) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    include: {
      players: { select: { salary: true, wage: true } },
      coaches: { select: { salary: true } },
    },
  });
  if (!club) throw new Error('Buyer club not found');
  const usedMonthly = club.players.reduce((sum, player) => sum + playerWage(player), 0)
    + club.coaches.reduce((sum, coach) => sum + coach.salary, 0);
  return { club, usedMonthly };
}

async function assertBuyerCanAfford(clubId: number, player: { salary: number; wage?: number | null }, amount: number) {
  const { club, usedMonthly } = await buyerSalaryUse(clubId);
  if (spendableBase(club) < amount) throw new Error('Presupuesto insuficiente para esta puja.');
  const cap = salaryCap(spendableBase(club), amount);
  if (usedMonthly + playerWage(player) > cap) {
    throw new Error(`Buyer salary cap exceeded (${cap} €/mes).`);
  }
  return club;
}

async function loadAuctionInternal(auctionId: number) {
  const { auction, auctionBid } = stores();
  const row = await auction.findUnique({
    where: { id: auctionId },
    include: {
      player: true,
      sellerClub: { select: { id: true, name: true, shortName: true, badge: true } },
    },
  });
  if (!row) throw new Error('Auction not found');

  const bids = await auctionBid.findMany({
    where: { auctionId },
    orderBy: [{ amount: 'desc' }, { createdAt: 'asc' }],
    include: { manager: { select: { id: true, clubId: true, userId: true } } },
  });

  return {
    ...row,
    listing: null,
    bids,
    highestBid: bids[0] ?? null,
    currentBid: bids[0]?.amount ?? row.startPrice,
    winningClubId: bids[0]?.manager?.clubId ?? null,
  };
}

async function loadAuctionPublic(auctionId: number) {
  return publicAuction(await loadAuctionInternal(auctionId));
}

function emitAuction(auctionId: number, type: string, payload: unknown, log?: FastifyBaseLogger) {
  realtimeHub.broadcast(`auction:${auctionId}`, type, payload, log);
}

export function scheduleAuctionClose(auctionId: number, endsAt: Date | string, log?: FastifyBaseLogger) {
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(end.getTime())) return;

  const current = closeTimers.get(auctionId);
  if (current) clearTimeout(current);

  const delay = Math.max(0, Math.min(end.getTime() - Date.now(), 2_147_483_647));
  const timer = setTimeout(() => {
    auctionsService.closeAuction(auctionId, { system: true }, log).catch((err) => {
      log?.warn({ err, auctionId }, 'Auction auto-close failed');
    });
  }, delay);
  closeTimers.set(auctionId, timer);
}

export async function initAuctionTimers(log?: FastifyBaseLogger) {
  try {
    const { auction } = stores();
    const openAuctions = await auction.findMany({
      where: { status: 'active' },
      select: { id: true, endsAt: true },
    });
    for (const row of openAuctions) scheduleAuctionClose(row.id, row.endsAt, log);
    log?.info({ auctions: openAuctions.length }, 'Auction timers initialized');
  } catch (err) {
    log?.warn({ err }, 'Auction timers not initialized');
  }
}

export const auctionsService = {
  async listAuctions(filters: { status?: string; listingId?: number } = {}) {
    const { auction } = stores();
    const rows = await auction.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.listingId ? { playerId: (await getListing(filters.listingId)).playerId } : {}),
      },
      orderBy: { endsAt: 'asc' },
    });
    return Promise.all(rows.map((row: { id: number }) => loadAuctionPublic(row.id)));
  },

  async getAuction(auctionId: number) {
    return loadAuctionPublic(auctionId);
  },

  async createAuction(
    sellerClubId: number,
    input: { listingId: number; durationSeconds?: number; reservePrice?: number },
    log?: FastifyBaseLogger,
  ) {
    const { auction } = stores();
    const listing = await getListing(input.listingId);
    if (listing.player.clubId !== sellerClubId) throw new Error('No puedes subastar un jugador que no es tuyo.');

    const existing = await auction.findFirst({
      where: { playerId: listing.playerId, sellerClubId, status: 'active' },
    });
    if (existing) return loadAuctionPublic(existing.id);

    const durationSeconds = Math.max(60, Math.min(86_400, input.durationSeconds ?? 3_600));
    const endsAt = new Date(Date.now() + durationSeconds * 1000);
    const reservePrice = asPositiveInt(input.reservePrice ?? listing.price);

    const row = await auction.create({
      data: {
        playerId: listing.playerId,
        sellerClubId,
        status: 'active',
        endsAt,
        startPrice: reservePrice,
      },
    });
    scheduleAuctionClose(row.id, row.endsAt, log);
    const payload = await loadAuctionPublic(row.id);
    emitAuction(row.id, 'auction:created', payload, log);
    return payload;
  },

  async placeBid(
    bidder: { userId: number; managerId: number; clubId: number },
    auctionId: number,
    amount: number,
    log?: FastifyBaseLogger,
  ) {
    stores();
    const bidAmount = asPositiveInt(amount);
    const current = await loadAuctionInternal(auctionId);

    if (current.status !== 'active') throw new Error('Auction is not open');
    await assertWindowOpen('transfer');
    await assertCanOperate(bidder.clubId);
    if (new Date(current.endsAt).getTime() <= Date.now()) {
      await this.closeAuction(auctionId, { system: true }, log);
      throw new Error('Auction already expired');
    }
    if (current.player.clubId === bidder.clubId || current.sellerClubId === bidder.clubId) {
      throw new Error('No puedes pujar por tu propia subasta.');
    }

    // AUDIT 5.3: mínimo INDEPENDIENTE del líder. Antes era `max(startPrice,
    // mejorPuja) + 1` (líder+1) → revelaba el precio actual y la hacía inglesa.
    // En una subasta sellada el mínimo solo depende de la reserva (`startPrice`) y,
    // como mucho, de la PROPIA puja anterior del club (dato no secreto para él), nunca
    // de las pujas ajenas. No se revela si el club va líder.
    const ownBids = (current.bids as Array<{ amount: number; manager?: { clubId?: number | null } | null }>)
      .filter((b) => b.manager?.clubId === bidder.clubId)
      .map((b) => b.amount);
    const ownHighest = ownBids.length ? Math.max(...ownBids) : 0;
    const minimum = Math.max(Number(current.startPrice) || 0, ownHighest + 1);
    if (bidAmount < minimum) throw new Error(`La puja mínima es ${minimum}.`);

    await assertBuyerCanAfford(bidder.clubId, current.player, bidAmount);

    const sellerManager = await prisma.manager.findFirst({ where: { clubId: current.sellerClubId } });
    if (sellerManager) {
      await anticheatService.checkMultiAccount(bidder.userId, sellerManager.userId);
      await anticheatService.logSuspiciousTransfer(
        bidder.userId,
        bidder.clubId,
        bidAmount,
        current.player.marketValue,
        current.playerId,
        'AUCTION_BID',
      );
    }

    const now = new Date();
    const endsAt = new Date(current.endsAt);
    const antiSnipeEndsAt = endsAt.getTime() - now.getTime() <= 30_000
      ? new Date(now.getTime() + 30_000)
      : endsAt;

    const [bid] = await prisma.$transaction(async (tx: any) => {
      // AUDIT 3.5: el DESEMPATE de pujas (closeAuction, orderBy amount desc) NO debe
      // depender de `createdAt`: con la fecha in-game todas las pujas del mismo día
      // de juego comparten `createdAt` y el desempate quedaba indefinido. Se desempata
      // ahora por `id` (autoincremento = orden de inserción real, monótono e
      // independiente del reloj). Así `createdAt` puede seguir siendo la fecha in-game
      // —la base que consume world.service.computeIndex para su ventana de 30 días
      // in-game—, mientras los TEMPORIZADORES de la subasta (endsAt/anti-snipe/cierre)
      // siguen en reloj real. Cada reloj se usa donde corresponde; la corrección del
      // cierre ya no mezcla bases.
      const inGameDate = await getInGameDate();
      const createdBid = await tx.auctionBid.create({
        data: {
          auctionId,
          managerId: bidder.managerId,
          amount: bidAmount,
          createdAt: inGameDate,
        },
      });
      const updatedAuction = await tx.auction.update({
        where: { id: auctionId },
        data: {
          endsAt: antiSnipeEndsAt,
        },
      });
      return [createdBid, updatedAuction];
    });

    // AUDIT 5.3 (anti-snipe consistente): reprogramar SIEMPRE tras una puja válida.
    // Antes solo se reprogramaba si hubo extensión; si el timer previo ya había
    // disparado (o se perdió en un reinicio), el cierre podía no quedar agendado. Como
    // `scheduleAuctionClose` limpia y re-crea el timer, esto es idempotente y garantiza
    // que el temporizador coincide siempre con el `endsAt` persistido.
    scheduleAuctionClose(auctionId, antiSnipeEndsAt, log);

    const auction = await loadAuctionPublic(auctionId);
    emitAuction(auctionId, 'auction:bid', { auction, bid: publicBid(bid) }, log);
    return { auction, bid };
  },

  async closeAuction(
    auctionId: number,
    actor: { clubId?: number; system?: boolean },
    log?: FastifyBaseLogger,
  ) {
    const { auctionBid } = stores();
    const current = await loadAuctionInternal(auctionId);
    if (current.status !== 'active') return publicAuction(current);
    const endsAtMs = new Date(current.endsAt).getTime();
    if (!actor.system && actor.clubId !== current.sellerClubId && endsAtMs > Date.now()) {
      throw new Error('Solo el vendedor puede cerrar antes; el resto debe esperar a que expire.');
    }
    if (!actor.system && actor.clubId === current.sellerClubId && endsAtMs > Date.now()) {
      const cancelled = await prisma.auction.update({
        where: { id: auctionId },
        data: {
          status: 'cancelled',
          closedNoSaleReason: 'Cancelada anticipadamente por el vendedor',
        },
      });
      const timer = closeTimers.get(auctionId);
      if (timer) clearTimeout(timer);
      closeTimers.delete(auctionId);
      const payload = await loadAuctionPublic(cancelled.id);
      emitAuction(auctionId, 'auction:closed', payload, log);
      return payload;
    }

    const bids = await auctionBid.findMany({
      where: { auctionId },
      // AUDIT 3.5: desempate por id (orden de inserción real, monótono) en lugar de
      // createdAt (in-game, idéntico para pujas del mismo día → desempate indefinido).
      orderBy: [{ amount: 'desc' }, { id: 'asc' }],
      include: { manager: { select: { clubId: true } } },
    });

    const closed = await prisma.$transaction(async (tx: any) => {
      const locked = await tx.auction.updateMany({
        where: { id: auctionId, status: 'active' },
        data: { status: 'closing' },
      });
      if (locked.count === 0) return tx.auction.findUnique({ where: { id: auctionId } });

      const state = await tx.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
      const inGameDate = state?.inGameDate ?? new Date();

      // AUDIT 5.3: adjudicación al SIGUIENTE postor válido. Antes, un fallo de
      // tope/plantilla/anti-reventa del MEJOR postor cancelaba TODA la subasta en vez
      // de probar al siguiente. Ahora se distingue:
      //  - Bloqueo GLOBAL (ventana de fichajes cerrada, regla de 7 días): afecta a
      //    todos por igual → cancelar sin seguir probando.
      //  - Bloqueo del POSTOR (tope salarial, plantilla, fondos, anti-reventa relativa
      //    a su importe): probar al siguiente mejor postor.
      // Los asserts bidder-specific se lanzan ANTES de cualquier escritura en `tx`, así
      // que la transacción sigue siendo usable para el siguiente intento.
      let lastReason = '';
      for (const bid of bids) {
        const bidClubId = bid.manager?.clubId;
        if (!bidClubId) continue;
        try {
          await executePlayerTransfer({
            playerId: current.playerId,
            buyerClubId: bidClubId,
            sellerClubId: current.sellerClubId,
            amount: bid.amount,
            source: 'auction',
            inGameDate,
          }, tx);
          return tx.auction.update({
            where: { id: auctionId },
            data: {
              status: 'finished',
              winningClubId: bidClubId,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastReason = msg;
          // Bloqueo global → cancelar de inmediato.
          if (/ventana de fichajes|primeros 7 días/i.test(msg)) {
            return tx.auction.update({
              where: { id: auctionId },
              data: {
                status: 'cancelled',
                closedNoSaleReason: msg,
              },
            });
          }
          // Bloqueo del postor (tope/plantilla/fondos/anti-reventa) → siguiente postor.
        }
      }

      return tx.auction.update({
        where: { id: auctionId },
        data: {
          status: 'cancelled',
          closedNoSaleReason: lastReason
            ? `Sin postor válido (último motivo: ${lastReason})`
            : 'Sin pujas válidas',
        },
      });
    });

    const timer = closeTimers.get(auctionId);
    if (timer) clearTimeout(timer);
    closeTimers.delete(auctionId);

    const payload = await loadAuctionPublic(closed.id);
    emitAuction(auctionId, 'auction:closed', payload, log);
    return payload;
  },

  async getEvents(auctionId: number, afterBidId?: number) {
    const { auctionBid } = stores();
    const auction = await loadAuctionPublic(auctionId);
    const bids = await auctionBid.findMany({
      where: {
        auctionId,
        ...(afterBidId ? { id: { gt: afterBidId } } : {}),
      },
      orderBy: { id: 'asc' },
    });
    return {
      auction,
      events: bids.map((bid: unknown) => ({ type: 'auction:bid', payload: { bid: publicBid(bid) } })),
      nextAfter: bids[bids.length - 1]?.id ?? afterBidId ?? null,
    };
  },
};
