// ─── Market Service — Fase 3 ──────────────────────────────────────────────────
// Implementa ventanas de fichajes, cláusula de rescisión, cesiones y tope salarial.
import prisma from '../../db/prisma';
import { calcPlayerSalaryDemand } from '../../lib/playerValuation';
import { playerOverall } from '../../lib/playerOverall';
import { anticheatService } from '../admin/anticheat.service';
import {
  isTransferWindowOpen,
  isLoanWindowOpen,
  canClubOperate,
  salaryCap,
} from '../game/tick.logic';
import { effectsForClub } from '../manager/skillEffects';
import {
  assertFDFBuyerCounts,
  coreAssertAntiResale,
  executePlayerTransfer,
  lockClubRow,
  spendableBase,
} from './transfer.core';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getInGameDate(): Promise<Date> {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
  return state?.inGameDate ?? new Date();
}

type ContractShape = {
  contractYears: number;
  contractStartAt?: Date | string | null;
  contractEndAt?: Date | string | null;
};

type ClubSalaryShape = {
  budget: number;
  cash?: number | null;
  reputation?: number | null;
  players: { salary: number; wage?: number | null }[];
  coaches: { salary: number }[];
};

function parseContractDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function yearsLeftFromContract(player: ContractShape, at: Date): number {
  const endAt = parseContractDate(player.contractEndAt);
  if (endAt) {
    const msLeft = endAt.getTime() - at.getTime();
    return Math.max(0, Math.ceil(msLeft / (365 * 24 * 60 * 60 * 1000)));
  }

  const startAt = parseContractDate(player.contractStartAt);
  if (startAt) {
    const elapsed = Math.floor((at.getTime() - startAt.getTime()) / (365 * 24 * 60 * 60 * 1000));
    return Math.max(0, player.contractYears - elapsed);
  }

  return Math.max(1, player.contractYears);
}

function fdfSalaryCap(club: { budget: number; cash?: number | null }, discount: number = 0): number {
  return salaryCap(spendableBase(club), discount);
}

async function transferCommissionForClub(clubId: number, amount: number): Promise<number> {
  if (amount <= 0) return 0;
  const effects = await effectsForClub(clubId);
  const discount = Math.max(0, Math.min(100, effects.commissionDiscountPct));
  return Math.round(amount * 0.03 * (1 - discount / 100));
}

function usedMonthlySalaries(club: ClubSalaryShape): number {
  return club.players.reduce((sum, row) => sum + playerWage(row), 0)
    + club.coaches.reduce((sum, row) => sum + row.salary, 0);
}

function legalReleaseClauseMultiplier(yearsLeft: number): number {
  if (yearsLeft > 5) return 200;
  if (yearsLeft > 4) return 300;
  if (yearsLeft > 3) return 400;
  if (yearsLeft > 2) return 500;
  return 600;
}

function legalReleaseClauseMax(wage: number, yearsLeft: number): number {
  return Math.round(wage * legalReleaseClauseMultiplier(yearsLeft));
}

function assertFdfContract(contractYears: number, age: number, existingYearsLeft = 0): void {
  if (age >= 33) {
    throw new Error('Los jugadores con 33 años cumplidos no aceptan nuevos contratos.');
  }
  if (existingYearsLeft + contractYears > 5) {
    throw new Error('El contrato supera el máximo FDF de 5 temporadas acumuladas.');
  }
}

function assertLegalReleaseClause(releaseClause: number, wage: number, yearsLeft: number): void {
  const maxClause = legalReleaseClauseMax(wage, yearsLeft);
  if (releaseClause > maxClause) {
    throw new Error(`La cláusula supera el máximo legal FDF (${maxClause} €).`);
  }
}

export async function assertWindowOpen(type: 'transfer' | 'loan'): Promise<void> {
  const inGameDate = await getInGameDate();
  const open = type === 'transfer'
    ? isTransferWindowOpen(inGameDate)
    : isLoanWindowOpen(inGameDate);
  if (!open) {
    const desc = type === 'transfer'
      ? 'La ventana de fichajes está cerrada (solo enero, julio y agosto).'
      : 'La ventana de cesiones está cerrada (solo julio–diciembre).';
    throw new Error(desc);
  }
}

export async function assertCanOperate(clubId: number): Promise<void> {
  const manager = await prisma.manager.findFirst({ where: { clubId }, select: { createdAt: true, suspendedUntilTurn: true } });
  if (!manager) throw new Error('Manager not found');
  const inGameDate = await getInGameDate();
  if (!canClubOperate(manager.createdAt, inGameDate)) {
    throw new Error('No puedes operar en el mercado durante los primeros 7 días in-game tras crear tu cuenta.');
  }
  // AUDIT H-4 / 3.3: suspensión FIDA real — bloquea operaciones mientras el turno
  // actual no supere `suspendedUntilTurn`.
  if (manager.suspendedUntilTurn != null) {
    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } });
    const currentTurn = state?.turn ?? 0;
    if (currentTurn < manager.suspendedUntilTurn) {
      throw new Error(`Estás sancionado por la FIDA hasta el turno ${manager.suspendedUntilTurn} (turno actual ${currentTurn}).`);
    }
  }
}

function isCpuClub(clubId: number | null, humanClubIds: (number | null)[]): boolean {
  return !clubId || !humanClubIds.includes(clubId);
}

// ─── Límites de plantilla FDF (manual §4.1) ───────────────────────────────────
async function assertCanSign(clubId: number): Promise<void> {
  const [squad, loanedOut, pendingIncoming] = await Promise.all([
    prisma.player.count({ where: { clubId } }),
    prisma.player.count({ where: { loanOwnerClubId: clubId } }),
    // AUDIT 5.3: contar también las ofertas `pending` hacia el cupo de incorporaciones;
    // antes solo se contaban `accepted_pending_window`, permitiendo acumular ofertas que,
    // de aceptarse en bloque, rebasarían el tope de plantilla.
    prisma.transferOffer.count({ where: { fromClubId: clubId, status: { in: ['accepted_pending_window', 'pending'] } } }),
  ]);
  assertFDFBuyerCounts(squad, loanedOut, pendingIncoming);
}

async function assertCanLetPlayerLeave(clubId: number, reason: 'venta' | 'cesion') {
  const [firstTeam, youth] = await Promise.all([
    prisma.player.count({ where: { clubId } }),
    prisma.youthPlayer.count({ where: { youthAcademy: { clubId } } }),
  ]);
  if (firstTeam - 1 < 16) {
    throw new Error(`Límite FDF: no puedes ${reason} si la primera plantilla baja de 16 jugadores (actual ${firstTeam}).`);
  }
  if (firstTeam - 1 + youth < 19) {
    throw new Error(`Límite FDF: no puedes ${reason} si primer equipo + juveniles baja de 19 (actual ${firstTeam + youth}).`);
  }
}

// ─── Anti-reventa FDF (manual §4.4) ──────────────────────────────────────────
// Un recién fichado no acepta ofertas si el año in-game actual es el de su llegada
// o el siguiente, salvo que la nueva oferta supere su último traspaso.
export const assertAntiResale = coreAssertAntiResale;

function playerWage(player: { wage?: number | null; salary: number }): number {
  return Math.round(Number(player.wage ?? player.salary) || player.salary);
}

function playerClause(player: {
  salary: number;
  wage?: number | null;
  releaseClause?: number | null;
  contractYears: number;
  contractStartAt?: Date | string | null;
  contractEndAt?: Date | string | null;
}, inGameDate: Date): number {
  const yearsLeft = yearsLeftFromContract(player, inGameDate);
  const legalMax = legalReleaseClauseMax(playerWage(player), yearsLeft);
  if (typeof player.releaseClause === 'number' && player.releaseClause > 0) {
    return Math.min(Math.round(player.releaseClause), legalMax);
  }
  return legalMax;
}

const MARKET_ATTRIBUTE_FIELDS = [
  'passing',
  'tackling',
  'shooting',
  'organization',
  'unmarking',
  'finishing',
  'dribbling',
  'goalkeeping',
] as const;

type MarketAttributeField = typeof MARKET_ATTRIBUTE_FIELDS[number];

const POSITION_ALIASES: Record<string, string[]> = {
  GK: ['POR'],
  POR: ['POR'],
  DEF: ['DEF'],
  DF: ['DEF'],
  CB: ['DEF'],
  DFC: ['DEF'],
  LI: ['DEF'],
  LD: ['DEF'],
  MID: ['MED'],
  MED: ['MED'],
  MC: ['MED'],
  MCD: ['MED'],
  MCO: ['MED'],
  ATT: ['DEL'],
  DEL: ['DEL'],
  DC: ['DEL'],
  ST: ['DEL'],
  EI: ['DEL'],
  ED: ['DEL'],
};

function clampSearchTake(raw: number | undefined): number {
  return Math.max(1, Math.min(20, raw ?? 20));
}

function parseAttrString(raw?: string): Partial<Record<MarketAttributeField, number>> {
  const attrs: Partial<Record<MarketAttributeField, number>> = {};
  if (!raw) return attrs;
  for (const part of raw.split(',')) {
    const [name, value] = part.split(/[:>=]/).map(piece => piece.trim());
    const field = name as MarketAttributeField;
    const parsed = Number(value);
    if (MARKET_ATTRIBUTE_FIELDS.includes(field) && Number.isFinite(parsed)) {
      attrs[field] = Math.max(0, Math.min(99, Math.floor(parsed)));
    }
  }
  return attrs;
}

function attrMinimum(filters: Record<string, any>, field: MarketAttributeField): number | undefined {
  const direct = filters[`${field}Min`];
  const legacy = filters[`min${field[0].toUpperCase()}${field.slice(1)}`];
  const parsed = Number(direct ?? legacy);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(99, Math.floor(parsed))) : undefined;
}

function normalizeMarketPosition(raw?: string): { broad: string[]; detailed: string | null } | null {
  if (!raw) return null;
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  return {
    broad: POSITION_ALIASES[value] ?? (['POR', 'DEF', 'MED', 'DEL'].includes(value) ? [value] : []),
    detailed: POSITION_ALIASES[value] ? null : value,
  };
}

function playerMatchesPosition(player: { position: string; preferredPosition?: string | null }, raw?: string): boolean {
  const filter = normalizeMarketPosition(raw);
  if (!filter) return true;
  if (filter.broad.length > 0 && filter.broad.includes(player.position)) return true;
  if (!filter.detailed) return false;
  return (player.preferredPosition ?? '').toUpperCase().includes(filter.detailed);
}

function compareSortValues(a: unknown, b: unknown, dir: 'asc' | 'desc'): number {
  const sign = dir === 'asc' ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * sign;
  return String(a ?? '').localeCompare(String(b ?? ''), 'es') * sign;
}

function marketSortValue(player: any, sortBy: string): unknown {
  switch (sortBy) {
    case 'club':
    case 'clubName':
      return player.club?.name ?? '';
    case 'country':
    case 'nationality':
      return player.nationality ?? '';
    case 'value':
    case 'marketValue':
      return player.marketValue ?? 0;
    case 'wage':
    case 'salary':
      return player.wage ?? player.salary ?? 0;
    case 'overall':
      return player.overall ?? 0;
    default:
      return player[sortBy] ?? '';
  }
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface BuyClauseResult {
  success: boolean;
  message: string;
  status: 'accepted' | 'rejected';
}

export interface LoanResult {
  loanId: number;
  playerId: number;
  receivingClubId: number;
  salary: number;
}

export interface ListingInput {
  playerId: number;
  price: number;
  type?: 'transfer' | 'loan';
}

export async function executePendingWindowOffers() {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true },
  });
  const inGameDate = state?.inGameDate ?? new Date();
  if (!isTransferWindowOpen(inGameDate)) {
    return { processed: 0, accepted: 0, rejected: 0, skipped: 'ventana_cerrada' };
  }

  const offers = await prisma.transferOffer.findMany({
    where: { status: 'accepted_pending_window' },
    include: { player: true },
    orderBy: { createdAt: 'asc' },
    take: 250,
  });

  let accepted = 0;
  let rejected = 0;
  const errors: Array<{ offerId: number; error: string }> = [];

  for (const offer of offers) {
    const sellerClubId = offer.toClubId ?? offer.player.clubId;
    if (!sellerClubId) {
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'rejected' } });
      rejected++;
      errors.push({ offerId: offer.id, error: 'El club vendedor ya no existe.' });
      continue;
    }

    try {
      const commission = offer.effectiveAt ? await transferCommissionForClub(offer.fromClubId, offer.amount) : 0;
      await prisma.$transaction(async (tx) => {
        await executePlayerTransfer({
          playerId: offer.playerId,
          buyerClubId: offer.fromClubId,
          sellerClubId,
          amount: offer.amount,
          buyerExtraCost: commission,
          terms: {
            salary: offer.salary,
            contractYears: offer.contractYears,
            releaseClause: offer.releaseClause,
          },
          source: 'offer_accept',
          inGameDate,
        }, tx);
        await tx.transferOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } });
      });
      accepted++;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo ejecutar la oferta pendiente.';
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'rejected' } });
      rejected++;
      errors.push({ offerId: offer.id, error: message });
    }
  }

  return { processed: offers.length, accepted, rejected, errors };
}

// ─── Market Service ───────────────────────────────────────────────────────────

export const marketService = {

  async searchPlayers(myClubId: number, filters: {
    page?: number; limit?: number; skip?: number; take?: number; position?: string;
    minAge?: number; maxAge?: number; ageMin?: number; ageMax?: number; minOverall?: number; maxOverall?: number;
    maxPrice?: number; maxWage?: number; minPotential?: number; maxPotential?: number;
    valueMin?: number; valueMax?: number; salaryMax?: number;
    country?: string; clubId?: number; personality?: string; attr?: string;
    minPassing?: number; passingMin?: number; minTackling?: number; tacklingMin?: number; minShooting?: number; shootingMin?: number;
    minOrganization?: number; organizationMin?: number; minUnmarking?: number; unmarkingMin?: number; minFinishing?: number; finishingMin?: number;
    minDribbling?: number; dribblingMin?: number; minGoalkeeping?: number; goalkeepingMin?: number;
    sortBy?: string; orderBy?: string; sortDir?: 'asc' | 'desc'; orderDir?: 'asc' | 'desc';
  } = {}) {
    const take = clampSearchTake(filters.take ?? filters.limit);
    const skip = Math.max(0, filters.skip ?? ((filters.page ?? 1) - 1) * take);
    const page = Math.floor(skip / take) + 1;
    const ageMin = filters.ageMin ?? filters.minAge;
    const ageMax = filters.ageMax ?? filters.maxAge;
    const valueMin = filters.valueMin;
    const valueMax = filters.valueMax ?? filters.maxPrice;
    const salaryMax = filters.salaryMax ?? filters.maxWage;
    const sortBy = filters.orderBy ?? filters.sortBy ?? 'marketValue';
    const sortDir = filters.orderDir ?? filters.sortDir ?? 'desc';
    const attrFilters = {
      ...parseAttrString(filters.attr),
    } as Partial<Record<MarketAttributeField, number>>;
    for (const field of MARKET_ATTRIBUTE_FIELDS) {
      const min = attrMinimum(filters as Record<string, any>, field);
      if (min != null) attrFilters[field] = min;
    }

    // Visibilidad
    const scoutStaffs = await prisma.staffMember.findMany({
      where: { staff: { clubId: myClubId }, role: 'scout' }
    });
    const scoutStaffIds = scoutStaffs.map(s => s.id);
    const visibleAssignments = await prisma.scoutAssignment.findMany({
      where: { scoutStaffId: { in: scoutStaffIds }, analysisPoints: { gte: 40 } }
    });
    const visibleClubIds = visibleAssignments.map(a => a.clubTargetId);

    const where: any = {
      OR: [
        { clubId: null },
        { clubId: myClubId },
        { clubId: { in: visibleClubIds } },
        { transferOffers: { some: {} } }
      ],
      NOT: { clubId: null, contractYears: 0 },
    };

    const positionFilter = normalizeMarketPosition(filters.position);
    if (positionFilter?.broad.length && !positionFilter.detailed) where.position = { in: positionFilter.broad };
    if (ageMin || ageMax) {
      where.age = {};
      if (ageMin) where.age.gte = ageMin;
      if (ageMax) where.age.lte = ageMax;
    }
    if (filters.country) where.nationality = filters.country;
    if (filters.clubId) where.clubId = filters.clubId;
    if (filters.personality) where.personality = filters.personality;
    if (salaryMax) where.salary = { lte: salaryMax };
    
    if (filters.minPotential || filters.maxPotential) {
      where.potential = {};
      if (filters.minPotential) where.potential.gte = filters.minPotential;
      if (filters.maxPotential) where.potential.lte = filters.maxPotential;
    }

    for (const field of MARKET_ATTRIBUTE_FIELDS) {
      const min = attrFilters[field];
      if (min != null) where[field] = { gte: min };
    }

    const players = await prisma.player.findMany({
      where,
      include: {
        club: { select: { id: true, name: true, shortName: true, badge: true, country: true } },
        transferOffers: { select: { price: true, type: true }, orderBy: { createdAt: 'desc' }, take: 1 }
      },
    });

    let data = players.map(player => ({
      ...player,
      marketValue: player.transferOffers[0]?.price ?? player.marketValue,
      listingType: player.transferOffers[0]?.type ?? null,
      wage: playerWage(player),
      overall: playerOverall(player),
    }));

    data = data.filter((player) => {
      if (!playerMatchesPosition(player, filters.position)) return false;
      if (filters.minOverall != null && player.overall < filters.minOverall) return false;
      if (filters.maxOverall != null && player.overall > filters.maxOverall) return false;
      if (valueMin != null && player.marketValue < valueMin) return false;
      if (valueMax != null && player.marketValue > valueMax) return false;
      return true;
    });

    data.sort((a, b) => {
      const primary = compareSortValues(marketSortValue(a, sortBy), marketSortValue(b, sortBy), sortDir);
      if (primary !== 0) return primary;
      return compareSortValues(a.id, b.id, 'asc');
    });

    const total = data.length;
    const paginated = data.slice(skip, skip + take);

    const normalizedFilters = {
      position: filters.position,
      ageMin,
      ageMax,
      valueMin,
      valueMax,
      salaryMax,
      country: filters.country,
      clubId: filters.clubId,
      personality: filters.personality,
      attrs: attrFilters,
      minOverall: filters.minOverall,
      maxOverall: filters.maxOverall,
      minPotential: filters.minPotential,
      maxPotential: filters.maxPotential,
    };

    return {
      data: paginated,
      total,
      skip,
      take,
      page,
      totalPages: Math.max(1, Math.ceil(total / take)),
      sortBy,
      sortDir,
      filters: normalizedFilters,
    };
  },

  async listMarket(filters: {
    page?: number;
    limit?: number;
    position?: string;
    minAge?: number;
    maxAge?: number;
    minOverall?: number;
    maxPrice?: number;
    minPotential?: number;
    maxPotential?: number;
    type?: 'transfer' | 'loan';
  } = {}) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where = {
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.maxPrice ? { price: { lte: filters.maxPrice } } : {}),
      player: {
        ...(filters.position ? { position: filters.position } : {}),
        ...(filters.minAge ? { age: { gte: filters.minAge } } : {}),
        ...(filters.maxAge ? { age: { lte: filters.maxAge } } : {}),
        ...(filters.minPotential ? { potential: { gte: filters.minPotential } } : {}),
        ...(filters.maxPotential ? { potential: { lte: filters.maxPotential } } : {}),
      },
    };

    const [total, listings] = await Promise.all([
      prisma.transferListing.count({ where }),
      prisma.transferListing.findMany({
        where,
        include: {
          player: {
            include: {
              club: { select: { id: true, name: true, shortName: true, badge: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      })
    ]);

    const data = listings
      .map((listing) => ({
        ...listing,
        player: {
          ...listing.player,
          wage: playerWage(listing.player),
          overall: playerOverall(listing.player),
        },
      }))
      .filter(row => !filters.minOverall || row.player.overall >= filters.minOverall);

    return { data, total };
  },

  async listFreeAgents(filters: {
    position?: string;
    maxAge?: number;
    minOverall?: number;
    maxWage?: number;
  } = {}) {
    // No existe modelo FreeAgent local: usamos Player.clubId=null como fuente canónica.
    const players = await prisma.player.findMany({
      where: {
        clubId: null,
        contractYears: { gt: 0 },
        ...(filters.position ? { position: filters.position } : {}),
        ...(filters.maxAge ? { age: { lte: filters.maxAge } } : {}),
        ...(filters.maxWage ? { wage: { lte: filters.maxWage } } : {}),
      },
      include: {
        agentRepresentation: {
          include: { agent: { include: { user: { select: { id: true, username: true } } } } },
        },
      },
      orderBy: [{ marketValue: 'desc' }, { age: 'asc' }],
      take: 100,
    });

    return players
      .map(player => ({ ...player, wage: playerWage(player), overall: playerOverall(player) }))
      .filter(player => !filters.minOverall || player.overall >= filters.minOverall);
  },

  async createListing(clubId: number, input: ListingInput) {
    await assertCanOperate(clubId);
    const player = await prisma.player.findFirst({ where: { id: input.playerId, clubId } });
    if (!player) throw new Error('Player not found in your squad');
    if (input.price <= 0) throw new Error('Price must be positive');
    const inGameDate = await getInGameDate();
    if (player.lastTransferAt) {
      const daysSinceTransfer = (inGameDate.getTime() - player.lastTransferAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceTransfer < 180 && player.lastTransferValue && input.price < player.lastTransferValue) {
        throw new Error('Anti-reventa FDF: No puedes vender a un jugador por menos de lo que costó durante los primeros 6 meses.');
      }
    }

    await assertCanLetPlayerLeave(clubId, 'venta');

    const price = Math.max(1, Math.round(input.price));
    return prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const listing = await tx.transferListing.upsert({
        where: { playerId: input.playerId },
        create: {
          playerId: input.playerId,
          price,
          type: input.type ?? 'transfer',
        },
        update: {
          price,
          type: input.type ?? 'transfer',
        },
      });
      await tx.player.update({
        where: { id: input.playerId },
        data: { isForSale: true, salePrice: price },
      });
      return listing;
    });
  },

  async removeListing(clubId: number, listingId: number) {
    const listing = await prisma.transferListing.findUnique({
      where: { id: listingId },
      include: { player: true },
    });
    if (!listing) throw new Error('Listing not found');
    if (listing.player.clubId !== clubId) throw new Error('Not your player');
    await prisma.$transaction([
      prisma.transferListing.delete({ where: { id: listing.id } }),
      prisma.player.update({
        where: { id: listing.playerId },
        data: { isForSale: false, salePrice: null },
      }),
    ]);
    return { ok: true };
  },

  async signFreeAgent(clubId: number, playerId: number, input: {
    wage?: number;
    contractYears?: number;
    releaseClause?: number;
  }) {
    // Pre-checks baratos de fast-fail (no dependen de carreras): la ventana de fichajes
    // y el estado operativo del club no cambian por concurrencia.
    await assertWindowOpen('transfer');
    await assertCanOperate(clubId);

    const now = await getInGameDate();

    // AUDIT 3.4 + follow-up (TOCTOU de plantilla/tope salarial): TODA la validación
    // sensible a carreras (disponibilidad del agente, límite de plantilla, tope
    // salarial) se hace DENTRO de la transacción tras tomar el lock del club. Antes,
    // los checks de plantilla/tope corrían fuera de la $transaction, así que dos
    // peticiones concurrentes fichando agentes DISTINTOS para el MISMO club podían
    // rebasar el tope (ambas leían el estado previo). `lockClubRow` serializa las
    // transacciones del mismo club: la segunda re-lee el estado ya con el primer
    // fichaje aplicado y rechaza si excede.
    return prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);

      const player = await tx.player.findFirst({ where: { id: playerId, clubId: null, contractYears: { gt: 0 } } });
      if (!player) throw new Error('El agente libre ya no está disponible.');

      const contractYears = Math.max(1, Math.min(5, input.contractYears ?? 2));
      assertFdfContract(contractYears, player.age);

      const club = await tx.club.findUnique({
        where: { id: clubId },
        include: {
          players: { select: { salary: true, wage: true } },
          coaches: { select: { salary: true } },
        },
      });
      if (!club) throw new Error('Club not found');

      // Re-validar límite de plantilla con el conteo ACTUAL dentro del lock.
      const [squad, loanedOut, pendingIncoming] = await Promise.all([
        tx.player.count({ where: { clubId } }),
        tx.player.count({ where: { loanOwnerClubId: clubId } }),
        tx.transferOffer.count({ where: { fromClubId: clubId, status: 'accepted_pending_window' } }),
      ]);
      assertFDFBuyerCounts(squad, loanedOut, pendingIncoming);

      const demandWage = calcPlayerSalaryDemand(player, { clubReputation: club.reputation });
      const agreedWage = Math.max(500, Math.round(input.wage ?? demandWage));
      if (agreedWage < demandWage) {
        throw new Error(`El jugador pide al menos ${demandWage.toLocaleString('es-ES')} €/mes.`);
      }
      const releaseClause = Math.round(input.releaseClause ?? player.releaseClause ?? legalReleaseClauseMax(agreedWage, contractYears));
      assertLegalReleaseClause(releaseClause, agreedWage, contractYears);

      // Re-validar tope salarial con la masa salarial ACTUAL dentro del lock.
      const usedSalary = usedMonthlySalaries(club);
      const cap = fdfSalaryCap(club);
      if (usedSalary + agreedWage > cap) {
        throw new Error(`Superas el tope salarial (${cap} €/mes).`);
      }

      const end = new Date(now);
      end.setUTCFullYear(end.getUTCFullYear() + contractYears);

      // `updateMany` condicional sobre `clubId: null`: atómico, cierra el doble-fichaje
      // del MISMO agente (3.4) aunque dos requests entren al mismo tiempo.
      const signed = await tx.player.updateMany({
        where: { id: playerId, clubId: null, contractYears: { gt: 0 } },
        data: {
          clubId,
          wage: agreedWage,
          salary: agreedWage,
          contractYears,
          contractStartAt: now,
          contractEndAt: end,
          releaseClause,
        },
      });
      if (signed.count !== 1) {
        throw new Error('El agente libre ya no está disponible.');
      }
      return tx.player.findUniqueOrThrow({ where: { id: playerId } });
    });
  },

  // ─── Información de tope salarial ─────────────────────────────────────────

  async getSalaryCap(clubId: number) {
    const club = await prisma.club.findUnique({
      where:   { id: clubId },
      include: { players: { select: { salary: true, wage: true } }, coaches: { select: { salary: true } } },
    });
    if (!club) throw new Error('Club not found');

    const cap          = fdfSalaryCap(club);
    const usedSalaries = usedMonthlySalaries(club);

    return {
      cashBase:       spendableBase(club),
      capMonthly:    cap,
      usedMonthly:   usedSalaries,
      remaining:     Math.max(0, cap - usedSalaries),
      overCap:       Math.max(0, usedSalaries - cap),
      isOverCap:     usedSalaries > cap,
    };
  },

  // ─── Cláusula de rescisión de un jugador ──────────────────────────────────

  async getPlayerClause(playerId: number) {
    const player = await prisma.player.findUnique({
      where:  { id: playerId },
      select: {
        id: true,
        name: true,
        salary: true,
        wage: true,
        releaseClause: true,
        contractYears: true,
        contractStartAt: true,
        contractEndAt: true,
      },
    });
    if (!player) throw new Error('Player not found');

    const inGameDate = await getInGameDate();
    const yearsLeft = yearsLeftFromContract(player, inGameDate);
    const clause = playerClause(player, inGameDate);
    const legalMax = legalReleaseClauseMax(playerWage(player), yearsLeft);
    return {
      playerId: player.id,
      name: player.name,
      salary: player.salary,
      wage: playerWage(player),
      contractYears: player.contractYears,
      yearsLeft,
      releaseClause: player.releaseClause,
      legalMax,
      legalMultiplier: legalReleaseClauseMultiplier(yearsLeft),
      clause,
      clauseWasCapped: typeof player.releaseClause === 'number' && player.releaseClause > legalMax,
    };
  },

  // ─── Comprar pagando cláusula de rescisión (CPU o cualquier club) ─────────

  async buyClause(
    buyerUserId: number,
    buyerClubId: number,
    playerId: number,
    amountOffered: number,
  ): Promise<BuyClauseResult> {
    // 1. Ventana, bloqueo inicial y límite de plantilla
    await assertWindowOpen('transfer');
    await assertCanOperate(buyerClubId);
    await assertCanSign(buyerClubId);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player)              throw new Error('Player not found');
    if (!player.clubId)       throw new Error('El jugador es agente libre; usa /offer para ficharlo.');
    if (player.clubId === buyerClubId) throw new Error('No puedes comprar a tu propio jugador.');

    // 2. Calcular cláusula real
    const inGameDate = await getInGameDate();
    const clause = playerClause(player, inGameDate);

    if (amountOffered < clause) {
      return {
        success: false,
        message: `Oferta insuficiente (${amountOffered} €). La cláusula de rescisión es ${clause} €.`,
        status: 'rejected',
      };
    }

    // 3. Comprobar si es club CPU (si no tiene manager humano → solo se paga cláusula completa)
    const humanManagers = await prisma.manager.findMany({ where: { clubId: { not: null } } });
    const humanClubIds  = humanManagers.map(m => m.clubId);
    const sellerIsCpu   = isCpuClub(player.clubId, humanClubIds);

    // Para CPU: se exige la cláusula completa (ya validada arriba).
    // Para clubs humanos: también se exige la cláusula completa en este endpoint.
    const finalAmount = clause;

    // 4. Caja del comprador
    const buyer = await prisma.club.findUnique({
      where: { id: buyerClubId },
      include: {
        players: { select: { salary: true, wage: true } },
        coaches: { select: { salary: true } },
      },
    });
    const commission = await transferCommissionForClub(buyerClubId, finalAmount);
    if (!buyer || spendableBase(buyer) < finalAmount + commission) throw new Error('Presupuesto insuficiente para pagar la cláusula y comisión.');

    const cap = fdfSalaryCap(buyer, finalAmount + commission);
    const usedSalary = usedMonthlySalaries(buyer);
    if (usedSalary + playerWage(player) > cap) {
      throw new Error(`Superas el tope salarial (${cap} €/mes). Libera masa salarial antes.`);
    }

    // 5. Anticheat
    const sellerManager = await prisma.manager.findFirst({ where: { clubId: player.clubId } });
    if (sellerManager) {
      await anticheatService.checkMultiAccount(buyerUserId, sellerManager.userId);
      await anticheatService.logSuspiciousTransfer(buyerUserId, buyerClubId, finalAmount, player.marketValue, player.id, 'PAGO_CLAUSULA');
    }

    await executePlayerTransfer({
      playerId: player.id,
      buyerClubId,
      sellerClubId: player.clubId,
      amount: finalAmount,
      buyerExtraCost: commission,
      sellerIsCpu,
      source: 'clause',
      inGameDate,
    });

    return {
      success: true,
      message: `Has fichado a ${player.name} pagando su cláusula de ${finalAmount} € y comisión de ${commission} €.`,
      status: 'accepted',
    };
  },

  // ─── Hacer oferta formal (solo entre clubs humanos, en ventana) ────────────

  async makeOffer(
    buyerUserId: number,
    buyerClubId: number,
    playerId: number,
    amount: number,
    terms?: { salary?: number; contractYears?: number; releaseClause?: number },
  ): Promise<{ offerId: number; message: string }> {
    await assertCanOperate(buyerClubId);
    await assertCanSign(buyerClubId);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player)                               throw new Error('Player not found');
    if (player.clubId === buyerClubId)         throw new Error('Cannot buy your own player');

    // Validar términos de contrato si vienen (oferta multi-apartado FDF)
    if (terms?.contractYears != null) {
      assertFdfContract(terms.contractYears, player.age);
      if (terms.releaseClause != null && terms.salary != null) {
        assertLegalReleaseClause(terms.releaseClause, terms.salary, terms.contractYears);
      }
    }

    // F5 (QA Jaime): la guarda "CPU no negocia" era de la FASE 3 y quedó OBSOLETA —
    // stepTransfers ya resuelve las pujas a clubes CPU a 3 turnos con multi-evaluate
    // (#20, Antigravity). Bloqueaba TODAS las ofertas en un mundo de 1 humano.
    // Las ofertas a CPU se crean 'pending' y el tick las adjudica; /clause sigue
    // siendo la vía inmediata.

    // Tope salarial: verificar que el comprador puede asumir el salario
    const buyer = await prisma.club.findUnique({
      where:   { id: buyerClubId },
      include: { players: { select: { salary: true, wage: true } }, coaches: { select: { salary: true } } },
    });
    if (!buyer || spendableBase(buyer) < amount) throw new Error('Presupuesto insuficiente.');

    const cap         = fdfSalaryCap(buyer, amount);
    const usedSal     = usedMonthlySalaries(buyer);
    const offeredWage = terms?.salary != null ? Math.round(terms.salary) : playerWage(player);
    if (usedSal + offeredWage > cap) {
      throw new Error(`Superas el tope salarial (${cap} €/mes). Libera masa salarial antes.`);
    }

    // Anticheat
    const sellerManager = await prisma.manager.findFirst({ where: { clubId: player.clubId ?? undefined } });
    if (sellerManager) {
      await anticheatService.checkMultiAccount(buyerUserId, sellerManager.userId);
      await anticheatService.logSuspiciousTransfer(buyerUserId, buyerClubId, amount, player.marketValue, player.id, 'OFERTA_FICHAJE');
    }

    const gameState = await prisma.gameState.findFirst({ where: { isActive: true } });
    const inGameDate = gameState?.inGameDate ?? new Date();
    const currentTurn = gameState?.turn ?? 0;
    const clause = playerClause(player, inGameDate);

    if (amount >= clause) {
      if (!isTransferWindowOpen(inGameDate)) {
        // TransferOffer.effectiveAt/status accepted_pending_window para ejecutar cláusulas aceptadas cuando abra mercado.
        // AUDIT 5.3: `effectiveAt` debe caer en la PRÓXIMA ventana REAL de fichajes
        // (meses definidos por `isTransferWindowOpen`), no en un "+1 mes" fijo que podía
        // apuntar a un mes sin mercado. Avanzamos mes a mes desde el 1.º del mes siguiente
        // hasta encontrar un mes con ventana abierta.
        const nextDate = new Date(Date.UTC(inGameDate.getUTCFullYear(), inGameDate.getUTCMonth() + 1, 1));
        for (let i = 0; i < 13 && !isTransferWindowOpen(nextDate); i++) {
          nextDate.setUTCMonth(nextDate.getUTCMonth() + 1);
        }
        const pendingClauseOffer = await prisma.transferOffer.create({
          data: {
            playerId,
            fromClubId: buyerClubId,
            toClubId: player.clubId ?? undefined,
            amount,
            status: 'accepted_pending_window',
            effectiveAt: nextDate,
            turn: currentTurn,
            salary: terms?.salary != null ? Math.round(terms.salary) : undefined,
            contractYears: terms?.contractYears ?? undefined,
            releaseClause: terms?.releaseClause ?? undefined,
          },
        });
        return {
          offerId: pendingClauseOffer.id,
          message: `Oferta registrada por ${player.name}; la incorporación queda pendiente de ventana de mercado.`,
        };
      }
      // Oferta igual o superior a la cláusula → compra directa
      const commission = await transferCommissionForClub(buyerClubId, amount);
      const directBuyer = await prisma.club.findUnique({ where: { id: buyerClubId }, select: { budget: true, cash: true } });
      if (!directBuyer || spendableBase(directBuyer) < amount + commission) throw new Error('Presupuesto insuficiente para pagar la cláusula y comisión.');
      await executePlayerTransfer({
        playerId: player.id,
        buyerClubId,
        sellerClubId: player.clubId,
        amount,
        buyerExtraCost: commission,
        terms,
        source: 'offer_direct',
        inGameDate,
      });
      return { offerId: -1, message: `Cláusula pagada. Has fichado a ${player.name}. Comisión: ${commission} €.` };
    }

    // Oferta pendiente de aceptación
    const offer = await prisma.transferOffer.create({
      data: {
        playerId,
        fromClubId: buyerClubId,
        toClubId:   player.clubId ?? undefined,
        amount,
        status:     'pending',
        turn:       currentTurn,
        salary: terms?.salary != null ? Math.round(terms.salary) : undefined,
        contractYears: terms?.contractYears ?? undefined,
        releaseClause: terms?.releaseClause ?? undefined,
      },
    });

    return { offerId: offer.id, message: `Oferta de ${amount} € enviada por ${player.name}.` };
  },

  // ─── Renovación de contrato (manual §4.2-§4.3) ────────────────────────────
  // Los años nuevos se SUMAN al contrato vigente (máx. 5 acumulados); el contrato
  // resultante termina el 30 de junio. La aceptación la decide la valoración
  // multi-apartado (market-evaluation.logic), que valida el resto de llaves.

  async renewPlayer(clubId: number, playerId: number, terms: {
    salary: number;
    years: number;
    clause?: number;
  }) {
    const player = await prisma.player.findFirst({ where: { id: playerId, clubId } });
    if (!player) throw new Error('Player not found in your squad');

    const inGameDate = await getInGameDate();
    const yearsLeft = yearsLeftFromContract(player, inGameDate);
    const totalYears = Math.min(5, yearsLeft + terms.years);
    assertFdfContract(terms.years, player.age, yearsLeft);

    const newWage = Math.round(terms.salary);
    const newClause = terms.clause != null ? Math.round(terms.clause) : legalReleaseClauseMax(newWage, totalYears);
    assertLegalReleaseClause(newClause, newWage, totalYears);

    // Tope salarial con el nuevo sueldo (sustituye al actual del jugador)
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { players: { select: { id: true, salary: true, wage: true } }, coaches: { select: { salary: true } } },
    });
    if (!club) throw new Error('Club not found');
    const demandWage = calcPlayerSalaryDemand(player, { clubReputation: club.reputation });
    if (newWage < demandWage) {
      throw new Error(`El jugador pide al menos ${demandWage.toLocaleString('es-ES')} €/mes para renovar.`);
    }
    const usedWithoutPlayer = club.players
      .filter(p => p.id !== playerId)
      .reduce((sum, p) => sum + playerWage(p), 0)
      + club.coaches.reduce((sum, c) => sum + c.salary, 0);
    const cap = fdfSalaryCap(club);
    if (usedWithoutPlayer + newWage > cap) {
      throw new Error(`La renovación supera el tope salarial (${cap} €/mes).`);
    }

    // Fin de contrato: 30 de junio del año correspondiente (manual §4.2)
    const endYear = inGameDate.getUTCFullYear() + totalYears;
    const contractEndAt = new Date(Date.UTC(endYear, 5, 30));

    return prisma.player.update({
      where: { id: playerId },
      data: {
        salary: newWage,
        wage: newWage,
        contractYears: totalYears,
        contractStartAt: inGameDate,
        contractEndAt,
        releaseClause: newClause,
      },
    });
  },

  // ─── Cesiones ─────────────────────────────────────────────────────────────

  /**
   * Ceder un jugador a otro club durante jul–dic.
   * El club receptor paga el 100% del salario; no se puede revertir antes de fin de temporada.
   * Implementado como transfer temporal: se marca el player con loanClubId y loanEndDate.
   * Como el schema no tiene campos de cesión, usamos un TransferOffer con status='loan'
   * y anotamos en un campo libre.
   */
  async loanPlayer(
    _ownerUserId: number,
    ownerClubId: number,
    playerId: number,
    receivingClubId: number,
  ): Promise<LoanResult> {
    await assertWindowOpen('loan');
    await assertCanOperate(ownerClubId);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player)                          throw new Error('Player not found');
    if (player.clubId !== ownerClubId)    throw new Error('Este jugador no es tuyo.');
    if (receivingClubId === ownerClubId)  throw new Error('No puedes cederte el jugador a ti mismo.');
    if (player.loanOwnerClubId != null)   throw new Error('Este jugador ya está cedido.');
    const receiverManager = await prisma.manager.findFirst({ where: { clubId: receivingClubId } });
    if (receiverManager) {
      throw new Error('Las cesiones a clubes humanos deben pactarse por negociaciones.');
    }
    await assertCanLetPlayerLeave(ownerClubId, 'cesion');
    await assertCanSign(receivingClubId);

    // Club receptor paga 100% de la ficha mensual → comprobar su budget
    const receiver = await prisma.club.findUnique({
      where:   { id: receivingClubId },
      include: { players: { select: { salary: true, wage: true } }, coaches: { select: { salary: true } } },
    });
    if (!receiver) throw new Error('Receiving club not found');

    const cap       = fdfSalaryCap(receiver);
    const usedSal   = usedMonthlySalaries(receiver);
    const monthlyWage = playerWage(player);
    if (usedSal + monthlyWage > cap) {
      throw new Error('El club receptor supera el tope salarial con este jugador.');
    }
    if (receiver.budget < monthlyWage) {
      throw new Error('El club receptor no tiene presupuesto para asumir el salario del cedido.');
    }

    // Se registra la cesión como TransferOffer con status='loan' (campo no estándar pero compatible)
    // El jugador pasa al club receptor; al final de temporada el servicio de tick deberá devolverlo.
    // Player.loanOwnerClubId y Player.loanEndDate para devolver la cesión sin depender del tick.
    const inGameDate = await getInGameDate();
    const seasonEnd  = new Date(inGameDate);
    // Fin de temporada = siguiente 30 de junio in-game
    seasonEnd.setUTCMonth(5);  // junio
    seasonEnd.setUTCDate(30);
    if (seasonEnd <= inGameDate) seasonEnd.setUTCFullYear(seasonEnd.getUTCFullYear() + 1);

    const offer = await prisma.transferOffer.create({
      data: {
        playerId,
        fromClubId: ownerClubId,
        toClubId:   receivingClubId,
        amount:     playerWage(player), // el receptor paga el salario mensual
        status:     'loan',        // status extendido para cesiones
        turn:       (await prisma.gameState.findFirst({ where: { isActive: true } }))?.turn ?? 0,
      },
    });

    const moved = await prisma.player.updateMany({
      where: { id: playerId, clubId: ownerClubId, loanOwnerClubId: null },
      data:  {
        clubId: receivingClubId,
        loanOwnerClubId: ownerClubId,
        loanEndDate: seasonEnd,
      },
    });
    if (moved.count === 0) throw new Error('El jugador ya no está disponible para cesión.');

    return {
      loanId:          offer.id,
      playerId,
      receivingClubId,
      salary:          playerWage(player),
    };
  },

  // ─── Estado de ventanas ───────────────────────────────────────────────────

  async getWindowStatus() {
    const inGameDate     = await getInGameDate();
    const transferOpen   = isTransferWindowOpen(inGameDate);
    const loanOpen       = isLoanWindowOpen(inGameDate);
    const month          = inGameDate.getUTCMonth() + 1;
    return {
      inGameDate:    inGameDate.toISOString(),
      month,
      transferWindow: transferOpen,
      loanWindow:     loanOpen,
      nextTransferWindow: nextWindowInfo(inGameDate),
    };
  },

  async getSquadLimits(clubId: number) {
    const [firstTeam, loanedOut, youth, pendingIncoming] = await Promise.all([
      prisma.player.count({ where: { clubId } }),
      prisma.player.count({ where: { loanOwnerClubId: clubId } }),
      prisma.youthPlayer.count({ where: { youthAcademy: { clubId } } }),
      prisma.transferOffer.count({ where: { fromClubId: clubId, status: 'accepted_pending_window' } }),
    ]);
    return {
      firstTeam,
      loanedOut,
      youth,
      pendingIncoming,
      limits: {
        minFirstTeamAfterExit: 16,
        minFirstTeamPlusYouthForExit: 19,
        maxFirstTeamPlusIncoming: 30,
        maxFirstTeamPlusLoanedOut: 26,
        maxYouth: 22,
      },
      canSign: firstTeam + pendingIncoming < 30 && firstTeam + loanedOut + pendingIncoming < 26,
      canLoanOut: firstTeam - 1 >= 16 && firstTeam - 1 + youth >= 19,
      canListTransfer: firstTeam + youth >= 19,
      uiNeed: '// NECESITO: Antigravity debe mostrar este indicador en Squad/Market antes de acciones de fichar, vender o ceder.',
    };
  },

};

// ─── Helper: próxima apertura de ventana ──────────────────────────────────────

function nextWindowInfo(inGameDate: Date): string {
  const month = inGameDate.getUTCMonth() + 1;
  const year  = inGameDate.getUTCFullYear();
  const windows = [1, 7, 8];
  const next = windows.find(m => m > month) ?? windows[0];
  const nextYear = next <= month ? year + 1 : year;
  return `${next}/${nextYear}`;
}
