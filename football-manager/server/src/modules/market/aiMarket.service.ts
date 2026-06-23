// ─── QA7 · Mercado vivo de la IA — orquestación de BD ─────────────────────────
// Lee clubes NPC (sin mánager humano) + el pool de objetivos disponibles, llama
// a la decisión PURA (aiMarket.logic) y persiste el resultado de forma ADITIVA:
//   · crea TransferOffer 'pending' (las adjudica la subasta a 3 turnos del tick)
//   · marca isForSale en el excedente NPC (crea oferta de jugadores al mundo)
// No ejecuta traspasos por su cuenta: eso lo hace executePlayerTransfer desde
// stepTransfers con todas las guardas FDF.

import prisma from '../../db/prisma';
import {
  planAiMarketPass,
  type AiClubView,
  type AiTargetView,
} from './aiMarket.logic';

/** Cota del pool de objetivos por pase (acota el coste del tick — QA4). */
const TARGET_POOL_LIMIT = 800;

export interface AiMarketPassResult {
  npcClubs: number;
  offersCreated: number;
  listedForSale: number;
  clubsActed: number;
}

const EMPTY: AiMarketPassResult = { npcClubs: 0, offersCreated: 0, listedForSale: 0, clubsActed: 0 };

function wageOf(p: { wage: number | null; salary: number }): number {
  return Math.round(Number(p.wage ?? p.salary) || p.salary || 0);
}

/**
 * Un pase de mercado de la IA. Idempotente por turno en la práctica: si un club
 * ya tiene una oferta pendiente no genera otra, y solo lista jugadores aún no
 * marcados isForSale.
 */
export async function runAiMarketPass(inGameDate: Date, turn: number): Promise<AiMarketPassResult> {
  // 1. Clubes NPC (sin mánager humano) con plantilla + economía.
  const npcClubs = await prisma.club.findMany({
    where: { manager: null },
    select: {
      id: true,
      country: true,
      reputation: true,
      budget: true,
      players: {
        select: {
          id: true, position: true, detailedPosition: true, salary: true, wage: true,
          marketValue: true, talent: true, potential: true, isForSale: true,
        },
      },
      coaches: { select: { salary: true } },
    },
  });
  if (npcClubs.length === 0) return EMPTY;

  // 2. Pool de objetivos disponibles: agentes libres (contrato vivo, NO retirados)
  //    + cualquier jugador listado en venta. Acotado y ordenado por valor para
  //    que los compradores encuentren calidad. Las guardas finas (estrella, edad,
  //    moral, cedido) las aplica la lógica pura y la adjudicación.
  const rawTargets = await prisma.player.findMany({
    where: {
      loanOwnerClubId: null,
      age: { lt: 33 },
      morale: { gte: 11 },
      OR: [
        { clubId: null, contractYears: { gt: 0 } }, // agentes libres (no retirados)
        { isForSale: true },                        // listados (NPC o humanos)
      ],
    },
    select: {
      id: true, clubId: true, position: true, detailedPosition: true,
      nationality: true, age: true, potential: true, talent: true,
      marketValue: true, salary: true, morale: true, isForSale: true,
      lastTransferAt: true, lastTransferValue: true,
      passing: true, tackling: true, shooting: true, organization: true,
      unmarking: true, finishing: true, dribbling: true, fouls: true,
      goalkeeping: true, reflexes: true,
      club: { select: { country: true, manager: { select: { id: true } } } },
    },
    orderBy: { marketValue: 'desc' },
    take: TARGET_POOL_LIMIT,
  });

  const pool: AiTargetView[] = rawTargets.map((p) => ({
    id: p.id,
    clubId: p.clubId,
    ownerIsHuman: !!p.club?.manager,
    nationality: p.nationality,
    country: p.club?.country ?? null,
    position: p.position,
    detailedPosition: p.detailedPosition,
    age: p.age,
    potential: p.potential,
    talent: p.talent,
    marketValue: p.marketValue,
    salary: p.salary,
    morale: p.morale,
    isForSale: p.isForSale,
    lastTransferAt: p.lastTransferAt,
    lastTransferValue: p.lastTransferValue,
    passing: p.passing,
    tackling: p.tackling,
    shooting: p.shooting,
    organization: p.organization,
    unmarking: p.unmarking,
    finishing: p.finishing,
    dribbling: p.dribbling,
    fouls: p.fouls,
    goalkeeping: p.goalkeeping,
    reflexes: p.reflexes,
    loaned: false, // el filtro loanOwnerClubId:null ya excluye cedidos
  }));

  // 3. Dedupe: clubes/jugadores con oferta pendiente NPC viva.
  const npcClubIds = npcClubs.map((c) => c.id);
  const pending = await prisma.transferOffer.findMany({
    where: { status: 'pending', fromClubId: { in: npcClubIds } },
    select: { fromClubId: true, playerId: true },
  });
  const existingOfferClubIds = new Set(pending.map((o) => o.fromClubId));
  const existingOfferPlayerIds = new Set(pending.map((o) => o.playerId));

  // 4. Vista de clubes para la decisión pura.
  const clubViews: AiClubView[] = npcClubs.map((c) => ({
    id: c.id,
    country: c.country,
    reputation: c.reputation,
    budget: c.budget,
    usedSalaryMonthly:
      c.players.reduce((s, p) => s + wageOf(p), 0) +
      c.coaches.reduce((s, co) => s + co.salary, 0),
    squad: c.players.map((p) => ({
      id: p.id,
      position: p.position,
      detailedPosition: p.detailedPosition,
      marketValue: p.marketValue,
      talent: p.talent,
      potential: p.potential,
      isForSale: p.isForSale,
    })),
  }));

  // 5. Plan determinista.
  const plan = planAiMarketPass(clubViews, pool, {
    turn,
    inGameYear: inGameDate.getUTCFullYear(),
    existingOfferClubIds,
    existingOfferPlayerIds,
  });

  // 6. Persistencia aditiva.
  if (plan.offers.length > 0) {
    await prisma.transferOffer.createMany({
      data: plan.offers.map((o) => ({
        playerId: o.playerId,
        fromClubId: o.buyerClubId,
        toClubId: o.sellerClubId,
        amount: o.amount,
        salary: o.salary,
        contractYears: o.contractYears,
        releaseClause: o.releaseClause,
        status: 'pending',
        turn,
      })),
    });
  }

  let listedForSale = 0;
  if (plan.listings.length > 0) {
    const res = await prisma.player.updateMany({
      where: { id: { in: plan.listings }, isForSale: false },
      data: { isForSale: true },
    });
    listedForSale = res.count;
  }

  return {
    npcClubs: npcClubs.length,
    offersCreated: plan.offers.length,
    listedForSale,
    clubsActed: plan.clubsActed,
  };
}
