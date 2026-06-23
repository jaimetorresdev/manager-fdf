// ─── Players Service ──────────────────────────────────────────────────────────
import prisma from '../../db/prisma';
import { moneyToNumber, type DecimalLike } from '../../lib/roundMoney';
import { soulForPlayers } from './playerSoul';
import { canonicalPlayerOverall, deriveDetailedPosition, labelOf } from './detailedPositions';
import { lockClubRow } from '../market/transfer.core';
import { revealablePlayerAttributes } from './playerInspection';

const POSITION_COMPATIBILITY: Record<string, string[]> = {
  DEF: ['MED'],
  MED: ['DEF', 'DEL'],
  DEL: ['MED'],
};

async function getInGameDate(): Promise<Date> {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } });
  return state?.inGameDate ?? new Date();
}

function isGoalkeeper(player: { position: string; detailedPosition?: string | null }) {
  const pos = player.detailedPosition ?? player.position;
  return pos === 'POR' || player.position === 'POR';
}

function isRepositionWindowOpen(date: Date): boolean {
  const month = date.getUTCMonth() + 1;
  return month >= 8 || month <= 2;
}

type OverallPlayer = {
  position: string;
  passing: number;
  tackling: number;
  shooting: number;
  organization: number;
  unmarking: number;
  finishing: number;
  dribbling: number;
  fouls: number;
  goalkeeping: number;
  reflexes?: number;
};

// WT1 · Media por posición DETALLADA (habilidades de peso 3+2 de la tabla §1.1
// del doc de diseño) con fallback a la media macro legacy si el jugador aún no
// tiene detailedPosition (universos sin migrar) — mismo campo `overall`, aditivo.
export function overallFor(player: OverallPlayer & { detailedPosition?: string | null }): number {
  return canonicalPlayerOverall(player);
}

// WT1 · Campos aditivos de posición detallada para cualquier payload de jugador.
function detailedFields(player: { detailedPosition?: string | null }) {
  return {
    detailedPosition: player.detailedPosition ?? null,
    detailedPositionLabel: labelOf(player.detailedPosition),
  };
}

function serializePlayerMoney<T extends {
  releaseClause?: number | DecimalLike | null;
  lastTransferValue?: number | DecimalLike | null;
}>(player: T) {
  return {
    ...player,
    ...(Object.prototype.hasOwnProperty.call(player, 'releaseClause')
      ? { releaseClause: player.releaseClause == null ? null : moneyToNumber(player.releaseClause) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(player, 'lastTransferValue')
      ? { lastTransferValue: player.lastTransferValue == null ? null : moneyToNumber(player.lastTransferValue) }
      : {}),
  };
}

function parseShotmap(raw: string | null | undefined) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function statNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseContractDate(value: Date | string | null | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function yearsLeft(player: { contractYears: number; contractStartAt?: Date | string | null; contractEndAt?: Date | string | null }, at: Date) {
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
  return Math.max(0, player.contractYears);
}

async function assertCanMarkTransferable(clubId: number) {
  const [firstTeam, youth] = await Promise.all([
    prisma.player.count({ where: { clubId } }),
    prisma.youthPlayer.count({ where: { youthAcademy: { clubId } } }),
  ]);
  if (firstTeam + youth < 19) {
    throw new Error(`Límite FDF: necesitas al menos 19 jugadores entre primer equipo y juveniles para poner transferibles (actual ${firstTeam + youth}).`);
  }
}

export const playersService = {

async getPlayerPublic(playerId: number) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        injuries: { where: { weeksLeft: { gt: 0 } } },
        suspensions: { where: { matches: { gt: 0 } } },
        sanctions: { where: { matches: { gt: 0 } } },
        club: { select: { id: true, name: true, shortName: true, badge: true } },
        matchStats: {
          orderBy: { match: { playedAt: 'desc' } },
          take: 10,
          include: { match: { select: { id: true, homeClub: { select: { id: true, shortName: true } }, awayClub: { select: { id: true, shortName: true } }, homeGoals: true, awayGoals: true, playedAt: true } } }
        },
        development: {
          orderBy: { createdAt: 'asc' },
          take: 20
        },
        // E7: trayectoria por temporada + palmarés individual (aditivo)
        seasonStats: { include: { season: { select: { name: true } } }, orderBy: { seasonId: 'asc' } },
        honours: { orderBy: { createdAt: 'asc' } },
        legacyOffers: {
          include: {
            fromClub: { select: { id: true, name: true, shortName: true, badge: true } },
            toClub: { select: { id: true, name: true, shortName: true, badge: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
        transferAgreements: {
          include: {
            fromClub: { select: { id: true, name: true, shortName: true, badge: true } },
            toClub: { select: { id: true, name: true, shortName: true, badge: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    });
    if (!player) throw new Error('Player not found');
    const { legacyOffers, transferAgreements, sanctions, ...publicPlayer } = player;
    
    const matchStats = player.matchStats.reverse().map((stat) => {
      const legacy = parseShotmap(stat.shotmap);
      return {
        ...stat,
        shotsOnTarget: stat.shotsOnTarget || statNumber(legacy.shotsOnTarget),
        passesCompleted: stat.passesCompleted || statNumber(legacy.passesCompleted),
        passAccuracy: stat.passAccuracy || statNumber(legacy.passAccuracy),
        tackles: stat.tackles || statNumber(legacy.tackles),
        interceptions: stat.interceptions || statNumber(legacy.interceptions),
        keyPasses: stat.keyPasses || statNumber(legacy.keyPasses),
      };
    });

    const activeInjuries = player.injuries ?? [];
    const activeSuspensions = [
      ...(player.suspensions ?? []),
      ...(sanctions ?? []),
    ].filter((row: any) => Number(row.matches ?? 0) > 0);
    const inGameDate = await getInGameDate();
    const transferHistory = [
      ...legacyOffers.map((offer) => ({
        id: offer.id,
        type: 'offer',
        status: offer.status,
        amount: offer.amount,
        fromClub: offer.fromClub,
        toClub: offer.toClub,
        salary: offer.salary,
        contractYears: offer.contractYears,
        releaseClause: offer.releaseClause == null ? null : moneyToNumber(offer.releaseClause),
        createdAt: offer.createdAt,
        updatedAt: offer.updatedAt,
      })),
      ...transferAgreements.map((agreement) => ({
        id: agreement.id,
        type: agreement.type,
        status: agreement.status,
        amount: agreement.amount,
        fromClub: agreement.fromClub,
        toClub: agreement.toClub,
        loanUntil: agreement.loanUntil,
        optionToBuyAmount: agreement.optionToBuyAmount,
        cashDelta: agreement.cashDelta,
        createdAt: agreement.createdAt,
        updatedAt: agreement.updatedAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 16);

    // QW-6/14/15: alma del jugador también en la ficha pública
    const souls = await soulForPlayers([player]);

    return {
      ...serializePlayerMoney(publicPlayer),
      matchStats,
      ...souls.get(player.id),
      ...detailedFields(player),
      overall: overallFor(player),
      availability: {
        injured: activeInjuries.length > 0 || (player.injuredUntil != null && player.injuredUntil > inGameDate),
        suspended: activeSuspensions.length > 0 || player.suspendedMatches > 0,
        injuries: activeInjuries,
        suspensions: activeSuspensions,
        injuredUntil: player.injuredUntil,
        suspendedMatches: player.suspendedMatches,
        statusText: activeInjuries.length > 0
          ? `Lesionado (${activeInjuries[0].weeksLeft} semana(s))`
          : activeSuspensions.length > 0 || player.suspendedMatches > 0
            ? `Sancionado (${activeSuspensions[0]?.matches ?? player.suspendedMatches} partido(s))`
            : 'Disponible',
      },
      contract: {
        salary: player.wage,
        wage: player.wage,
        contractYears: player.contractYears,
        contractStartAt: player.contractStartAt,
        contractEndAt: player.contractEndAt,
        yearsLeft: yearsLeft(player, inGameDate),
        releaseClause: player.releaseClause == null ? null : moneyToNumber(player.releaseClause),
      },
      transferHistory,
      uiNeed: '// NECESITO: Antigravity debe mostrar estado, contrato completo e historial de traspasos en PlayerPage.',
    };
  },

  async getSquad(clubId: number) {
    const players = await prisma.player.findMany({
      where:   { clubId },
      orderBy: [{ isStarter: 'desc' }, { position: 'asc' }, { squadNumber: 'asc' }],
    });
    // QW-6/14/15: tags + bioSummary + legendStatus (aditivo, 3 queries batch)
    const souls = await soulForPlayers(players);
    return players.map((p: any) => ({
      ...serializePlayerMoney(p),
      overall: overallFor(p),
      ...detailedFields(p),
      ...souls.get(p.id),
    }));
  },

  async getLoanedOut(clubId: number) {
    const players = await prisma.player.findMany({
      where: { loanOwnerClubId: clubId },
      include: { club: { select: { id: true, name: true, shortName: true, badge: true } } },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    const souls = await soulForPlayers(players);
    return players.map((p: any) => ({
      ...serializePlayerMoney(p),
      overall: overallFor(p),
      ...detailedFields(p),
      ...souls.get(p.id),
      onLoanAt: p.club,
    }));
  },

  async getPlayer(playerId: number, clubId: number) {
    const player = await prisma.player.findFirst({
      where:   { id: playerId, clubId },
      include: {
        injuries:    { where: { weeksLeft: { gt: 0 } } },
        suspensions: { where: { matches: { gt: 0 } } },
      },
    });
    if (!player) throw new Error('Player not found');
    const souls = await soulForPlayers([player]);
    return {
      ...serializePlayerMoney(player),
      overall: overallFor(player),
      ...detailedFields(player),
      ...souls.get(player.id),
    };
  },

  async setStarter(playerId: number, clubId: number, isStarter: boolean) {
    // Only allow if player belongs to club
    const player = await prisma.player.findFirst({
      where: { id: playerId, clubId },
      include: {
        injuries: { where: { weeksLeft: { gt: 0 } } },
        suspensions: { where: { matches: { gt: 0 } } },
      },
    });
    if (!player) throw new Error('Player not found in your squad');

    // Validate: max 11 starters, 1 GK required if setting as starter
    if (isStarter) {
      if (player.squadNumber == null) {
        throw new Error('Un jugador sin dorsal/ficha no puede jugar.');
      }
      const inGameDate = await getInGameDate();
      if (player.injuredUntil && player.injuredUntil > inGameDate) {
        throw new Error('Un jugador lesionado no puede marcarse como titular.');
      }
      if ((player.injuries?.length ?? 0) > 0) {
        throw new Error('Un jugador lesionado no puede marcarse como titular.');
      }
      if (player.suspendedMatches > 0 || (player.suspensions?.length ?? 0) > 0) {
        throw new Error('Un jugador sancionado no puede marcarse como titular.');
      }
      const otherStarters = await prisma.player.findMany({
        where: { clubId, isStarter: true, id: { not: playerId } },
        select: { id: true, position: true, detailedPosition: true },
      });
      if (otherStarters.length >= 11) throw new Error('Maximum 11 starters allowed');

      const playerIsGk = isGoalkeeper(player);
      const otherGkCount = otherStarters.filter(isGoalkeeper).length;
      if (playerIsGk && otherGkCount >= 1) {
        throw new Error('Solo puede haber un portero titular.');
      }
      if (!playerIsGk && otherStarters.length >= 10 && otherGkCount === 0) {
        throw new Error('Debe haber al menos un portero entre los titulares.');
      }
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data:  { isStarter },
    });
    return serializePlayerMoney(updated);
  },

  async setForSale(playerId: number, clubId: number, forSale: boolean, price?: number) {
    const player = await prisma.player.findFirst({ where: { id: playerId, clubId } });
    if (!player) throw new Error('Player not found in your squad');
    if (forSale) await assertCanMarkTransferable(clubId);
    if (forSale && (price == null || price < 0)) {
        throw new Error('El precio de venta debe ser un número positivo.');
    }
    const updated = await prisma.player.update({
      where: { id: playerId },
      data:  { isForSale: forSale, salePrice: forSale ? price : null },
    });
    return serializePlayerMoney(updated);
  },

  async repositionPlayer(playerId: number, clubId: number, newPosition: string) {
    const target = newPosition.toUpperCase();
    if (!['DEF', 'MED', 'DEL'].includes(target)) {
      throw new Error('Posición destino inválida');
    }

    const player = await prisma.player.findFirst({ where: { id: playerId, clubId } });
    if (!player) throw new Error('Player not found in your squad');

    const current = player.position.toUpperCase();
    if (['POR', 'PO', 'GK'].includes(current)) {
      throw new Error('El portero no puede cambiar de posición.');
    }
    if (current === target) return serializePlayerMoney(player);
    if (!(POSITION_COMPATIBILITY[current] ?? []).includes(target)) {
      throw new Error('Solo se permiten cambios a posiciones compatibles/adyacentes.');
    }
    if (player.experience < 75) {
      throw new Error('Cambiar de posición requiere al menos 75% de experiencia.');
    }

    const inGameDate = await getInGameDate();
    if (!isRepositionWindowOpen(inGameDate)) {
      throw new Error('El reposicionamiento solo está abierto entre agosto y febrero.');
    }

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        position: target,
        preferredPosition: target,
        // WT1: la posición detallada se re-deriva para la nueva macro (coherencia).
        detailedPosition: deriveDetailedPosition({ ...player, position: target }),
        experience: Math.max(0, player.experience - 15),
      },
    });
    return serializePlayerMoney(updated);
  },

  async inspectPlayer(playerId: number, clubId: number) {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { turn: true },
    });
    if (!state) throw new Error('No active game state');

    return prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const existing = await tx.playerSpecialInspection.findFirst({
        where: { clubId, turn: state.turn },
        select: { id: true },
      });
      if (existing) throw new Error('La lupa ya se ha utilizado en este turno');

      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) throw new Error('Player not found');
      const revealed = revealablePlayerAttributes(player);
      const inspection = await tx.playerSpecialInspection.create({
        data: {
          playerId,
          clubId,
          turn: state.turn,
          revealed: JSON.stringify(revealed),
        },
      });
      return { ...inspection, revealed };
    });
  },

  // Market: players available from other clubs
  async getMarketPlayers(filters: {
    position?: string;
    maxAge?: number;
    minOverall?: number;
    maxPrice?: number;
  }, excludeClubId: number) {
    const players = await prisma.player.findMany({
      where: {
        clubId:    { not: excludeClubId },
        ...(filters.position ? { position: filters.position } : {}),
        ...(filters.maxAge   ? { age: { lte: filters.maxAge } } : {}),
        ...(filters.maxPrice ? { salePrice: { lte: filters.maxPrice } } : {}),
      },
      include: { club: { select: { name: true, shortName: true } } },
      take:    50,
    });
    const result = players.map((p: any) => ({
      ...serializePlayerMoney(p),
      overall: overallFor(p),
      ...detailedFields(p),
    }));
    if (filters.minOverall) {
      return result.filter((p: any) => p.overall >= (filters.minOverall ?? 0));
    }
    return result;
  },
};
