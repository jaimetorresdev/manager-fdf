import prisma from '../../db/prisma';
import { playerOverall } from '../../lib/playerOverall';

const contains = (q: string) => ({ contains: q, mode: 'insensitive' as const });

async function visibleClubIdsFor(myClubId: number): Promise<Set<number>> {
  const scoutStaffs = await prisma.staffMember.findMany({
    where: { staff: { clubId: myClubId }, role: 'scout' },
    select: { id: true },
  });
  if (scoutStaffs.length === 0) return new Set();
  const assignments = await prisma.scoutAssignment.findMany({
    where: {
      scoutStaffId: { in: scoutStaffs.map((s) => s.id) },
      analysisPoints: { gte: 40 },
    },
    select: { clubTargetId: true },
  });
  return new Set(assignments.map((a) => a.clubTargetId));
}

function playerVisible(
  player: { clubId: number | null; transferOffers?: unknown[] },
  myClubId: number,
  scoutedClubIds: Set<number>,
): boolean {
  if (player.clubId == null) return true;
  if (player.clubId === myClubId) return true;
  if (scoutedClubIds.has(player.clubId)) return true;
  if (player.transferOffers && player.transferOffers.length > 0) return true;
  return false;
}

export const searchService = {
  async global(q: string, limit: number, myClubId: number) {
    const query = q.trim();
    if (query.length < 2) {
      return { players: [], clubs: [], managers: [] };
    }

    const scoutedClubIds = await visibleClubIdsFor(myClubId);

    const [players, clubs, users] = await Promise.all([
      prisma.player.findMany({
        where: { name: contains(query) },
        take: limit * 3,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          position: true,
          age: true,
          clubId: true,
          passing: true,
          tackling: true,
          shooting: true,
          organization: true,
          unmarking: true,
          finishing: true,
          dribbling: true,
          goalkeeping: true,
          detailedPosition: true,
          club: { select: { name: true } },
          // NOTA: `transferOffers` es en realidad la relación a TransferListing (1:1,
          // sin estado). Una listing existente = jugador ACTUALMENTE listado → visible
          // públicamente es correcto. (El hallazgo 5.10 confundía TransferListing con
          // TransferOffer; el "leak" depende de que las listings se borren al vender —
          // ver market.service. No se filtra por estado porque la listing no lo tiene.)
          transferOffers: { select: { id: true }, take: 1 },
        },
      }),
      prisma.club.findMany({
        where: {
          OR: [
            { name: contains(query) },
            { shortName: contains(query) },
          ],
        },
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          shortName: true,
          badge: true,
          country: true,
        },
      }),
      prisma.user.findMany({
        where: {
          manager: { isNot: null },
          OR: [
            { username: contains(query) },
            { manager: { is: { name: contains(query) } } },
          ],
        },
        take: limit,
        orderBy: { username: 'asc' },
        select: {
          username: true,
          manager: {
            select: {
              id: true,
              name: true,
              club: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    return {
      players: players
        .filter((player) => playerVisible(player, myClubId, scoutedClubIds))
        .slice(0, limit)
        .map((player) => ({
          id: player.id,
          name: player.name,
          position: player.position,
          age: player.age,
          overall: playerOverall(player),
          clubId: player.clubId,
          clubName: player.club?.name ?? null,
        })),
      clubs,
      managers: users
        .filter((user) => user.manager)
        .map((user) => ({
          id: user.manager!.id,
          username: user.username,
          name: user.manager!.name,
          clubId: user.manager!.club?.id ?? null,
          clubName: user.manager!.club?.name ?? null,
        })),
    };
  },
};
