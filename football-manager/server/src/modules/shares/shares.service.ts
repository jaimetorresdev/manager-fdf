// ─── Shares Service ────────────────────────────────────────────────────────────
// Each club has exactly 1,500 shares distributed across managers (and possibly
// the club itself for non-human-owned portions). Share value is recalculated
// every tick based on infrastructure + cash + squad quality.

import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import { lockClubRow } from '../market/transfer.core';
import { roundMoney } from '../../lib/roundMoney';

const TOTAL_SHARES = 1500;
const MAX_MANAGER_SHARE_PCT = 5;
const MAX_MANAGER_SHARES_PER_CLUB = Math.floor((MAX_MANAGER_SHARE_PCT / 100) * TOTAL_SHARES);

// ─── Value formula ─────────────────────────────────────────────────────────────
// shareValue = (cash + fixedAssets + squadValue) / totalShares
// squadValue ≈ sum of player market values

type ShareValuation = {
  shareValue: number;
  totalAssets: number;
  cash: number;
  fixedAssets: number;
  squadValue: number;
};

// roundMoney imported from lib/roundMoney

function sharesToPct(shares: number): number {
  const clamped = Math.max(0, Math.min(TOTAL_SHARES, Math.round(shares)));
  return (clamped / TOTAL_SHARES) * 100;
}

function pctToShares(pct: number): number {
  return Math.round((pct / 100) * TOTAL_SHARES);
}

/** Fuerza pct a un múltiplo exacto de 1/TOTAL_SHARES (evita drift tras compraventas). */
function normalizePct(pct: number): number {
  return sharesToPct(pctToShares(pct));
}

async function activeInGameDate(): Promise<Date | null> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true },
  });
  return state?.inGameDate ?? null;
}

async function computeShareValuation(clubId: number): Promise<ShareValuation> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: {
      cash: true,
      fixedAssets: true,
      players: { select: { marketValue: true } },
    },
  });
  if (!club) return { shareValue: 0, totalAssets: 0, cash: 0, fixedAssets: 0, squadValue: 0 };
  const squadValue = club.players.reduce((sum, p) => sum + p.marketValue, 0);
  const totalAssets = club.cash + club.fixedAssets + squadValue;
  return {
    shareValue: Math.max(1, roundMoney(totalAssets / TOTAL_SHARES)),
    totalAssets: roundMoney(totalAssets),
    cash: roundMoney(club.cash),
    fixedAssets: roundMoney(club.fixedAssets),
    squadValue: roundMoney(squadValue),
  };
}

async function buildShareValueMap(clubIds: number[]): Promise<Map<number, number>> {
  const unique = [...new Set(clubIds)];
  const entries = await Promise.all(unique.map(async (clubId) => {
    const valuation = await computeShareValuation(clubId);
    return [clubId, valuation.shareValue] as const;
  }));
  return new Map(entries);
}

async function recordPriceSnapshot(clubId: number, valuation?: ShareValuation, tx?: any) {
  const db = tx ?? prisma;
  const snapshot = valuation ?? await computeShareValuation(clubId);
  const inGameDate = await activeInGameDate();
  return db.sharePriceHistory.create({
    data: {
      clubId,
      shareValue: snapshot.shareValue,
      totalShares: TOTAL_SHARES,
      totalAssets: snapshot.totalAssets,
      cash: snapshot.cash,
      fixedAssets: snapshot.fixedAssets,
      squadValue: snapshot.squadValue,
      inGameDate,
    },
  });
}

async function recordTransaction(input: {
  clubId: number;
  ownerId: number;
  type: 'buy' | 'sell';
  shares: number;
  pct: number;
  pricePerShare: number;
  grossAmount: number;
}, tx: any) {
  return tx.shareTransaction.create({
    data: {
      clubId: input.clubId,
      ownerId: input.ownerId,
      type: input.type,
      shares: input.shares,
      pct: input.pct,
      pricePerShare: input.pricePerShare,
      grossAmount: roundMoney(input.grossAmount),
      inGameDate: await activeInGameDate(),
    },
  });
}

export const sharesService = {
  // ─── GET /shares/:clubId ─────────────────────────────────────────────────────
  async getClubShares(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, shortName: true, cash: true, fixedAssets: true },
    });
    if (!club) throw new Error('Club not found');

    const shares = await prisma.share.findMany({
      where: { clubId },
      orderBy: { pct: 'desc' },
    });

    const valuation = await computeShareValuation(clubId);
    const shareValue = valuation.shareValue;
    const totalPct = shares.reduce((sum, s) => sum + s.pct, 0);

    // Enrich with owner labels
    const ownerIds = [...new Set(shares.map((s) => s.ownerId))];
    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: {
            id: true,
            username: true,
            manager: { select: { name: true } },
          },
        })
      : [];
    const ownerMap = new Map(owners.map((u) => [u.id, u]));

    return {
      club,
      totalShares: TOTAL_SHARES,
      maxPctPerManagerClub: MAX_MANAGER_SHARE_PCT,
      maxSharesPerManagerClub: MAX_MANAGER_SHARES_PER_CLUB,
      shareValue,
      valuation,
      totalPct: Math.round(totalPct * 100) / 100,
      shares: shares.map((s) => {
        const u = ownerMap.get(s.ownerId);
        const ownedShares = pctToShares(s.pct);
        return {
          id: s.id,
          ownerId: s.ownerId,
          ownerUsername: u?.username ?? 'unknown',
          ownerName: u?.manager?.name ?? u?.username ?? 'Unknown',
          pct: normalizePct(s.pct),
          shares: ownedShares,
          totalValue: roundMoney(ownedShares * shareValue),
        };
      }),
    };
  },

  async getPortfolio(userId: number) {
    const stakes = await prisma.share.findMany({
      where: { ownerId: userId },
      include: { club: { select: { id: true, name: true, shortName: true, badge: true, country: true } } },
      orderBy: [{ clubId: 'asc' }, { id: 'asc' }],
    });
    const transactions = await prisma.shareTransaction.findMany({
      where: { ownerId: userId },
      select: { clubId: true, type: true, grossAmount: true },
    });
    const investedByClub = new Map<number, number>();
    for (const tx of transactions) {
      const sign = tx.type === 'sell' ? -1 : 1;
      investedByClub.set(tx.clubId, (investedByClub.get(tx.clubId) ?? 0) + sign * tx.grossAmount);
    }

    const clubIds = stakes.map((stake) => stake.clubId);
    const valueMap = await buildShareValueMap(clubIds);
    const positions = [];
    for (const stake of stakes) {
      const shareValue = valueMap.get(stake.clubId) ?? 0;
      const shares = pctToShares(stake.pct);
      const currentValue = roundMoney(shares * shareValue);
      const invested = roundMoney(investedByClub.get(stake.clubId) ?? stake.value);
      positions.push({
        club: stake.club,
        shares,
        pct: normalizePct(stake.pct),
        shareValue,
        currentValue,
        invested,
        unrealizedPnl: roundMoney(currentValue - invested),
      });
    }

    const totalValue = roundMoney(positions.reduce((sum, position) => sum + position.currentValue, 0));
    const totalInvested = roundMoney(positions.reduce((sum, position) => sum + position.invested, 0));
    return {
      ownerId: userId,
      totalValue,
      totalInvested,
      unrealizedPnl: roundMoney(totalValue - totalInvested),
      maxPctPerManagerClub: MAX_MANAGER_SHARE_PCT,
      maxSharesPerManagerClub: MAX_MANAGER_SHARES_PER_CLUB,
      positions,
      uiNeed: '// NECESITO: Antigravity debe crear cartera multipropiedad con P&L y grafica por club.',
    };
  },

  async getClubPriceHistory(clubId: number, take = 30) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true },
    });
    if (!club) throw new Error('Club not found');

    const valuation = await computeShareValuation(clubId);
    const history = await prisma.sharePriceHistory.findMany({
      where: { clubId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(120, take)),
    });

    return {
      clubId,
      current: { shareValue: valuation.shareValue, totalShares: TOTAL_SHARES, valuation },
      history,
      uiNeed: '// NECESITO: Antigravity debe pintar grafica por club con este historico.',
    };
  },

  // ─── POST /shares/buy ────────────────────────────────────────────────────────
  // userId buys `sharesToBuy` shares of clubId at current share value.
  async buyShares(userId: number, clubId: number, sharesToBuy: number) {
    if (sharesToBuy < 1) throw new Error('Debes comprar al menos 1 acción');
    if (sharesToBuy > TOTAL_SHARES) throw new Error(`No puedes comprar más de ${TOTAL_SHARES} acciones`);

    // Q8 (BLOQUE Q): regla de servidor — solo se pueden COMPRAR acciones del
    // club que diriges. Vender las que ya tengas de otros clubes sigue
    // permitido (sellShares no cambia).
    const buyerManager = await prisma.manager.findFirst({
      where: { userId },
      select: { clubId: true },
    });
    if (!buyerManager) throw new Error('Mánager no encontrado');
    if (!buyerManager.clubId) {
      throw new Error('Sin club no puedes comprar acciones: solo se compran acciones del club que diriges.');
    }
    if (buyerManager.clubId !== clubId) {
      throw new Error('Solo puedes comprar acciones del club que diriges. Las acciones de otros clubes solo se pueden vender.');
    }

    const buyPct = sharesToPct(sharesToBuy);
    let cost = 0;
    let shareValue = 0;

    await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const priced = await computeShareValuation(clubId);
      shareValue = priced.shareValue;
      // AUDIT 1.1: cuantiza en el BORDE. shareValue lleva 2 decimales, así que
      // int * float arrastra residuo IEEE-754; sin esto la resta a wealth (Float)
      // deriva sub-céntimo en cada compra. roundMoney = fromCents(toCents(x)).
      cost = roundMoney(sharesToBuy * shareValue);
      const manager = await tx.manager.findFirst({
        where: { userId },
        select: { id: true, wealth: true },
      });
      if (!manager) throw new Error('Mánager no encontrado');

      const existing = await tx.share.findMany({ where: { clubId } });
      const soldShares = existing.reduce((sum, s) => sum + pctToShares(s.pct), 0);
      if (soldShares + sharesToBuy > TOTAL_SHARES) {
        const availableShares = Math.max(0, TOTAL_SHARES - soldShares);
        throw new Error(`Solo quedan ${availableShares} acciones disponibles`);
      }

      const myStake = existing.find((s) => s.ownerId === userId);
      const myShares = myStake ? pctToShares(myStake.pct) : 0;
      if (myShares + sharesToBuy > MAX_MANAGER_SHARES_PER_CLUB) {
        const remainingShares = Math.max(0, MAX_MANAGER_SHARES_PER_CLUB - myShares);
        throw new Error(`Límite anti-manipulación: máximo ${MAX_MANAGER_SHARE_PCT}% por mánager y club (${remainingShares} acciones disponibles para ti).`);
      }

      const paid = await tx.manager.updateMany({
        where: { id: manager.id, wealth: { gte: cost } },
        data: { wealth: { decrement: cost } },
      });
      if (paid.count === 0) {
        throw new Error(`Fondos insuficientes: necesitas ${cost.toFixed(2)} €.`);
      }

      // AUDIT 5.2-3 — CONSERVACIÓN DE RIQUEZA. Antes, el dinero que el mánager pagaba
      // por las acciones se DESTRUÍA (solo bajaba `wealth`, sin contraparte) y al
      // vender se CREABA de la nada. Contraparte real = TESORERÍA DEL CLUB (mercado
      // primario: el club emite/recompra autocartera). Invariante:
      //   Δ manager.wealth + Δ club.cash = 0.
      // La realimentación valoración→precio es despreciable (cost/1500 por acción).
      await tx.club.update({
        where: { id: clubId },
        data: { cash: { increment: cost }, budget: { increment: cost } },
      });

      if (myStake) {
        const newShares = pctToShares(myStake.pct) + sharesToBuy;
        const newPct = sharesToPct(newShares);
        await tx.share.update({
          where: { id: myStake.id },
          data: {
            pct: newPct,
            value: roundMoney(newShares * shareValue),
          },
        });
      } else {
        await tx.share.create({
          data: {
            clubId,
            ownerId: userId,
            pct: buyPct,
            value: roundMoney(cost),
          },
        });
      }
      await recordTransaction({ clubId, ownerId: userId, type: 'buy', shares: sharesToBuy, pct: buyPct, pricePerShare: shareValue, grossAmount: cost }, tx);
      await recordPriceSnapshot(clubId, priced, tx);
    });

    return {
      ...(await this.getClubShares(clubId)),
      bought: sharesToBuy,
      cost: roundMoney(cost),
      shareValue,
    };
  },

  // ─── POST /shares/sell ───────────────────────────────────────────────────────
  async sellShares(userId: number, clubId: number, sharesToSell: number) {
    if (sharesToSell < 1) throw new Error('Debes vender al menos 1 acción');

    const sellPct = sharesToPct(sharesToSell);
    let ownedShares = 0;
    let proceeds = 0;
    let shareValue = 0;

    await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const priced = await computeShareValuation(clubId);
      shareValue = priced.shareValue;
      // AUDIT 1.1: cuantiza en el BORDE antes de persistir (wealth increment L387
      // y grossAmount L383). Evita deriva acumulada en ventas repetidas.
      proceeds = roundMoney(sharesToSell * shareValue);
      const [stake, manager] = await Promise.all([
        tx.share.findFirst({ where: { clubId, ownerId: userId } }),
        tx.manager.findFirst({ where: { userId }, select: { id: true } }),
      ]);
      if (!stake) throw new Error('No tienes acciones de este club');
      if (!manager) throw new Error('Mánager no encontrado');
      ownedShares = pctToShares(stake.pct);
      if (sharesToSell > ownedShares) {
        throw new Error(`Solo tienes ${ownedShares} acciones`);
      }
      const newShares = ownedShares - sharesToSell;
      const newPct = sharesToPct(newShares);
      if (newShares <= 0) {
        const deleted = await tx.share.deleteMany({
          where: { id: stake.id, ownerId: userId, clubId, pct: { gte: sellPct } },
        });
        if (deleted.count === 0) throw new Error('No tienes suficientes acciones para vender.');
      } else {
        const updated = await tx.share.updateMany({
          where: { id: stake.id, ownerId: userId, clubId, pct: { gte: sellPct } },
          data: {
            pct: newPct,
            value: roundMoney(newShares * shareValue),
          },
        });
        if (updated.count === 0) throw new Error('No tienes suficientes acciones para vender.');
      }
      await recordTransaction({ clubId, ownerId: userId, type: 'sell', shares: sharesToSell, pct: sellPct, pricePerShare: shareValue, grossAmount: proceeds }, tx);
      await recordPriceSnapshot(clubId, priced, tx);
      await tx.manager.update({
        where: { id: manager.id },
        data: { wealth: { increment: proceeds } },
      });
      // AUDIT 5.2-3 — contraparte real de la venta: el club RECOMPRA su autocartera
      // pagando desde tesorería. Invariante Δ wealth + Δ cash = 0 (riqueza conservada).
      await tx.club.update({
        where: { id: clubId },
        data: { cash: { decrement: proceeds }, budget: { decrement: proceeds } },
      });
    });

    return {
      sold: sharesToSell,
      proceeds: roundMoney(proceeds),
      shareValue,
      remainingShares: Math.max(0, ownedShares - sharesToSell),
    };
  },

  // ─── GET /shares/ranking ─────────────────────────────────────────────────────
  // Ranking of richest managers (sum of wealth + portfolio value).
  async richestManagers() {
    const managers = await prisma.manager.findMany({
      select: {
        id: true,
        name: true,
        wealth: true,
        userId: true,
        club: { select: { shortName: true } },
        user: { select: { username: true } },
      },
      orderBy: { wealth: 'desc' },
      take: 50,
    });

    // Compute portfolio value per manager from shares
    const allShares = await prisma.share.findMany({
      select: { ownerId: true, clubId: true, pct: true },
    });
    const clubIds = [...new Set(allShares.map((s) => s.clubId))];
    const valueMap = await buildShareValueMap(clubIds);
    const portfolioByOwner = new Map<number, number>();
    for (const s of allShares) {
      const shareValue = valueMap.get(s.clubId) ?? 0;
      // AUDIT 1.1: cuantiza cada término para que el acumulado se mantenga en
      // céntimos enteros (evita deriva en la suma de carteras grandes).
      portfolioByOwner.set(s.ownerId, (portfolioByOwner.get(s.ownerId) ?? 0) + roundMoney(pctToShares(s.pct) * shareValue));
    }

    return managers.map((m, idx) => ({
      rank: idx + 1,
      managerId: m.id,
      name: m.name,
      username: m.user.username,
      clubShortName: m.club?.shortName ?? null,
      wealth: m.wealth,
      portfolioValue: roundMoney(portfolioByOwner.get(m.userId) ?? 0),
      totalNetWorth: roundMoney(m.wealth + (portfolioByOwner.get(m.userId) ?? 0)),
    }));
  },

  // ─── stepShareValues — called from the tick pipeline ─────────────────────────
  // Recalculates the `value` field of every Share based on current club state.
  async recalcAllShareValues() {
    const clubs = await prisma.club.findMany({ select: { id: true } });
    let updated = 0;
    const inGameDate = await activeInGameDate();
    // AUDIT 5.2-2: antes cada Share se actualizaba con un `await` suelto (N+1) y la
    // historia de precios se creaba aparte, todo FUERA de transacción → un fallo a
    // mitad dejaba unos Share revaluados y otros no, y la fila de historial podía
    // faltar o quedar incoherente. Ahora cada club agrupa sus escrituras (todos los
    // Share + la fila de historial) en UNA `$transaction`: consistencia atómica por
    // club (o se aplican todas o ninguna), y se reduce el round-trip por share.
    for (const club of clubs) {
      const valuation = await computeShareValuation(club.id);
      const shareValue = valuation.shareValue;
      const shares = await prisma.share.findMany({ where: { clubId: club.id } });

      const ops: Prisma.PrismaPromise<unknown>[] = shares.map((s) => {
        const ownedShares = pctToShares(s.pct);
        return prisma.share.update({
          where: { id: s.id },
          data: { pct: sharesToPct(ownedShares), value: roundMoney(ownedShares * shareValue) },
        });
      });
      ops.push(
        prisma.sharePriceHistory.create({
          data: {
            clubId: club.id,
            shareValue,
            totalShares: TOTAL_SHARES,
            totalAssets: valuation.totalAssets,
            cash: valuation.cash,
            fixedAssets: valuation.fixedAssets,
            squadValue: valuation.squadValue,
            inGameDate,
          },
        }),
      );

      await prisma.$transaction(ops);
      updated += shares.length;
    }
    return updated;
  },
};
