// ─── Núcleo transaccional de transferencias — AUDIT-2026 (d)+(e) ─────────────
// UNA única función transaccional para TODO movimiento definitivo de jugador
// (cláusula, oferta directa, aceptación de oferta, subasta, negociación, tick).
// Guardas centralizadas:
//   · Propiedad atómica: updateMany({ id, clubId: sellerClubId }) — si otro
//     proceso lo vendió antes, count=0 y la operación se aborta.
//   · loanOwnerClubId: un jugador CEDIDO no puede venderse por ninguna vía.
//   · Ventana de fichajes (salvo skipWindowCheck para flujos ya validados).
//   · Límites de plantilla FDF 30/26 (comprador) y 16/19 (vendedor).
//   · Tope salarial del comprador con el salario OFERTADO (no el actual).
//   · Anti-reventa FDF única (manual §4.4) — implementación canónica.
//   · Fondos atómicos: decremento guardado con { budget: { gte: total } }.
//
// (e) DECISIÓN DE DISEÑO (documentada): `Club.budget` es la FUENTE ÚNICA de
// verdad del dinero. `Club.cash` queda como ESPEJO y se actualiza SIEMPRE
// junto a budget en todos los módulos (la migración 20260610090000 los
// resincroniza una vez). Todos los checks de fondos/tope leen budget.
//
// Contrato para el tick (Claude): llamar a executePendingWindowOffers() desde
// market.service al abrir una ventana de fichajes. La función procesa ofertas
// status='accepted_pending_window' con este core y devuelve contadores
// { processed, accepted, rejected, errors } sin lanzar por ofertas individuales.

import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import { isTransferWindowOpen, salaryCap } from '../game/tick.logic';

type Tx = Prisma.TransactionClient;

export type TransferSource =
  | 'clause'
  | 'offer_direct'
  | 'offer_accept'
  | 'auction'
  | 'negotiation'
  | 'tick'
  | 'loan_option';

export interface TransferTerms {
  /** Salario mensual OFERTADO; si no viene, se mantiene el actual del jugador. */
  salary?: number | null;
  contractYears?: number | null;
  releaseClause?: number | null;
}

export interface ExecuteTransferInput {
  playerId: number;
  buyerClubId: number;
  /** Club vendedor ESPERADO (guarda de propiedad). null = agente libre. */
  sellerClubId: number | null;
  /** Importe del traspaso que cobra el vendedor. */
  amount: number;
  /** Coste extra del comprador que NO cobra el vendedor (comisión de cláusula). */
  buyerExtraCost?: number;
  /** true si el vendedor es CPU y no debe cobrar (legacy buyClause CPU). */
  sellerIsCpu?: boolean;
  terms?: TransferTerms;
  source: TransferSource;
  inGameDate: Date;
  /** Flujos con ventana ya validada o reglas especiales (opción de cesión). */
  skipWindowCheck?: boolean;
  /** El vendedor CPU del tick no aplica mínimos 16/19 si quedaría ilegal: rechaza. */
  skipAntiResale?: boolean;
}

/** Límites FDF de plantilla (manual §4.1) — fuente única de verdad. */
export const FDF_MAX_SQUAD = 30;
export const FDF_MAX_SQUAD_WITH_LOANS = 26;

/** Valida los límites de plantilla del comprador sin acceso a BD (pure).
 *  Lanza si el estado ACTUAL (antes de fichar) ya bloquea un fichaje más. */
export function assertFDFBuyerCounts(
  squad: number,
  loanedOut: number,
  pendingIncoming: number,
  delta = 0,
): void {
  if (squad + delta + pendingIncoming >= FDF_MAX_SQUAD)
    throw new Error(`Límite de plantilla FDF: primer equipo + entrantes confirmados no puede superar ${FDF_MAX_SQUAD} (tienes ${squad}+${pendingIncoming}).`);
  if (squad + delta + loanedOut + pendingIncoming >= FDF_MAX_SQUAD_WITH_LOANS)
    throw new Error(`Límite FDF: primer equipo + cedidos fuera no puede superar ${FDF_MAX_SQUAD_WITH_LOANS} (tienes ${squad + delta}+${loanedOut}).`);
}

/** Base de caja única (e): budget manda; cash es espejo. */
export function spendableBase(club: { budget: number }): number {
  return Math.max(0, Number(club.budget) || 0);
}

export function corePlayerWage(player: { wage?: number | null; salary: number }): number {
  return Math.round(Number(player.wage ?? player.salary) || player.salary);
}

/** Anti-reventa FDF canónica (manual §4.4): año de llegada o el siguiente,
 *  solo salen por MÁS de su último traspaso (rechaza también el empate). */
export function coreAssertAntiResale(
  player: { name: string; lastTransferAt?: Date | null; lastTransferValue?: number | null },
  amount: number,
  inGameDate: Date,
): void {
  if (!player.lastTransferAt) return;
  const arrivalYear = player.lastTransferAt.getUTCFullYear();
  const currentYear = inGameDate.getUTCFullYear();
  if (currentYear <= arrivalYear + 1) {
    const lastValue = Number(player.lastTransferValue ?? 0);
    if (lastValue > 0 && amount <= lastValue) {
      throw new Error(
        `Anti-reventa FDF: ${player.name} llegó en ${arrivalYear} y solo acepta ofertas superiores a su último traspaso (${Math.round(lastValue)} €).`,
      );
    }
  }
}

/** Límites de plantilla del comprador (manual §4.1): <30 con entrantes y <26 con cedidos fuera. */
async function assertBuyerSquadLimits(tx: Tx, buyerClubId: number): Promise<void> {
  const [squad, loanedOut, pendingIncoming] = await Promise.all([
    tx.player.count({ where: { clubId: buyerClubId } }),
    tx.player.count({ where: { loanOwnerClubId: buyerClubId } }),
    tx.transferOffer.count({ where: { fromClubId: buyerClubId, status: 'accepted_pending_window' } }),
  ]);
  assertFDFBuyerCounts(squad, loanedOut, pendingIncoming);
}

/** Mínimos del vendedor (manual §4.1): no bajar de 16 primera plantilla ni de 19 con juveniles. */
async function assertSellerSquadMinimums(tx: Tx, sellerClubId: number): Promise<void> {
  const [firstTeam, youth] = await Promise.all([
    tx.player.count({ where: { clubId: sellerClubId } }),
    tx.youthPlayer.count({ where: { youthAcademy: { clubId: sellerClubId } } }),
  ]);
  if (firstTeam - 1 < 16) {
    throw new Error(`Límite FDF: el vendedor no puede bajar de 16 jugadores de primera plantilla (actual ${firstTeam}).`);
  }
  if (firstTeam - 1 + youth < 19) {
    throw new Error(`Límite FDF: el vendedor no puede bajar de 19 entre primer equipo y juveniles (actual ${firstTeam + youth}).`);
  }
}

/** Tope salarial del comprador con el salario OFERTADO y el gasto del traspaso descontado. */
async function assertBuyerSalaryCap(
  tx: Tx,
  buyerClubId: number,
  offeredWage: number,
  totalSpend: number,
): Promise<void> {
  const buyer = await tx.club.findUnique({
    where: { id: buyerClubId },
    include: {
      players: { select: { salary: true, wage: true } },
      coaches: { select: { salary: true } },
    },
  });
  if (!buyer) throw new Error('Club comprador no encontrado.');
  const used = buyer.players.reduce((sum, p) => sum + corePlayerWage(p), 0)
    + buyer.coaches.reduce((sum, c) => sum + c.salary, 0);
  const cap = salaryCap(spendableBase(buyer), totalSpend);
  if (used + offeredWage > cap) {
    throw new Error(`Superas el tope salarial (${cap} €/mes) con el salario ofertado (${offeredWage} €/mes).`);
  }
}

export interface ExecuteTransferResult {
  playerId: number;
  buyerClubId: number;
  sellerClubId: number | null;
  amount: number;
  buyerTotalCost: number;
}

/**
 * Ejecuta una transferencia definitiva de jugador con TODAS las guardas, en una
 * única transacción. Lanza Error con mensaje en español si alguna guarda falla.
 */
export async function executePlayerTransfer(
  input: ExecuteTransferInput,
  client: Tx | typeof prisma = prisma,
): Promise<ExecuteTransferResult> {
  const run = async (tx: Tx): Promise<ExecuteTransferResult> => {
    const amount = Math.max(0, Math.round(input.amount));
    const extra = Math.max(0, Math.round(input.buyerExtraCost ?? 0));
    const totalCost = amount + extra;

    // 0. Ventana de fichajes
    if (!input.skipWindowCheck && !isTransferWindowOpen(input.inGameDate)) {
      throw new Error('La ventana de fichajes está cerrada (solo enero, julio y agosto).');
    }

    // 1. Releer el jugador DENTRO de la transacción
    const player = await tx.player.findUnique({ where: { id: input.playerId } });
    if (!player) throw new Error('Jugador no encontrado.');
    if (player.clubId === input.buyerClubId) throw new Error('El jugador ya pertenece al club comprador.');
    if ((player.clubId ?? null) !== (input.sellerClubId ?? null)) {
      throw new Error('El jugador ya no pertenece al club vendedor.');
    }
    // Guarda de cesión: un cedido NO se vende (salvo loan_option, que limpia la cesión).
    if (player.loanOwnerClubId != null && input.source !== 'loan_option') {
      throw new Error(`${player.name} está CEDIDO: el cesionario no puede traspasarlo.`);
    }

    // 2. Anti-reventa única
    if (!input.skipAntiResale) {
      coreAssertAntiResale(player, amount, input.inGameDate);
    }

    // 3. Límites de plantilla
    await assertBuyerSquadLimits(tx, input.buyerClubId);
    if (input.sellerClubId != null && input.source !== 'loan_option') {
      await assertSellerSquadMinimums(tx, input.sellerClubId);
    }

    // 4. Tope salarial con el salario OFERTADO
    const offeredWage = input.terms?.salary != null
      ? Math.round(input.terms.salary)
      : corePlayerWage(player);
    await assertBuyerSalaryCap(tx, input.buyerClubId, offeredWage, totalCost);

    // 5. Fondos del comprador, atómico (budget = fuente única; cash espejo)
    if (totalCost > 0) {
      const charged = await tx.club.updateMany({
        where: { id: input.buyerClubId, budget: { gte: totalCost } },
        data: { budget: { decrement: totalCost }, cash: { decrement: totalCost } },
      });
      if (charged.count === 0) {
        throw new Error(`Presupuesto insuficiente (${totalCost} € necesarios).`);
      }
    }

    // 6. El vendedor humano (o CPU con club) cobra el importe del traspaso
    if (amount > 0 && input.sellerClubId != null && !input.sellerIsCpu) {
      await tx.club.update({
        where: { id: input.sellerClubId },
        data: { budget: { increment: amount }, cash: { increment: amount } },
      });
    }

    // 7. Movimiento de jugador con GUARDA DE PROPIEDAD atómica
    const contractData = input.terms?.contractYears != null
      ? {
        contractYears: input.terms.contractYears,
        contractStartAt: input.inGameDate,
        contractEndAt: new Date(Date.UTC(input.inGameDate.getUTCFullYear() + input.terms.contractYears, 5, 30)),
      }
      : {};
    const moved = await tx.player.updateMany({
      where: {
        id: input.playerId,
        clubId: input.sellerClubId,
        ...(input.source === 'loan_option' ? {} : { loanOwnerClubId: null }),
      },
      data: {
        clubId: input.buyerClubId,
        loanOwnerClubId: null,
        loanEndDate: null,
        isForSale: false,
        salePrice: null,
        lastTransferAt: input.inGameDate,
        lastTransferValue: amount,
        squadNumber: null,
        ...(input.terms?.salary != null ? { salary: Math.round(input.terms.salary), wage: Math.round(input.terms.salary) } : {}),
        ...contractData,
        ...(input.terms?.releaseClause != null ? { releaseClause: input.terms.releaseClause } : {}),
      },
    });
    if (moved.count === 0) {
      // Otro proceso movió al jugador entre la lectura y el update: abortar TODO.
      throw new Error('El jugador ya fue transferido por otra operación (carrera detectada).');
    }

    // 8. Limpieza: listing fuera y resto de ofertas pendientes rechazadas
    await tx.transferListing.deleteMany({ where: { playerId: input.playerId } });
    await tx.transferOffer.updateMany({
      where: { playerId: input.playerId, status: 'pending' },
      data: { status: 'rejected' },
    });

    return {
      playerId: input.playerId,
      buyerClubId: input.buyerClubId,
      sellerClubId: input.sellerClubId,
      amount,
      buyerTotalCost: totalCost,
    };
  };

  // Si ya nos pasan una transacción, reutilizarla; si no, abrir una.
  if (client !== prisma) return run(client as Tx);
  return prisma.$transaction(run, { timeout: 15000 });
}

/**
 * Bloqueo pesimista por fila de club (SELECT … FOR UPDATE) para serializar
 * checks "leer-validar-crear" por club (sponsors, campañas, obras, staff).
 */
export async function lockClubRow(tx: Tx, clubId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Club" WHERE id = ${clubId} FOR UPDATE`;
}
