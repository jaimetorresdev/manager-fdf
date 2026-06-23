import prisma from '../../db/prisma';
import { advisorService } from '../club/advisor.service';

const PLANT_COST = 120;
const DEBUNK_COST = 60;
const MOOD_PENALTY = 8;

export const rumorSabotageService = {
  async plant(attackerManagerId: number, targetClubId: number) {
    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true, seasonWeek: true } });
    if (!state) throw new Error('No hay temporada activa.');

    const [attacker, target] = await Promise.all([
      prisma.manager.findUnique({ where: { id: attackerManagerId }, select: { id: true, clubId: true, prestige: true, name: true } }),
      prisma.club.findUnique({ where: { id: targetClubId }, select: { id: true, name: true, shortName: true, manager: { select: { id: true } } } }),
    ]);
    if (!attacker?.clubId) throw new Error('Necesitas un club para plantar un rumor.');
    if (!target) throw new Error('Club rival no encontrado.');
    if (target.id === attacker.clubId) throw new Error('No puedes sabotear a tu propio club.');
    if (attacker.prestige < PLANT_COST) throw new Error(`Necesitas ${PLANT_COST} de prestigio (tienes ${attacker.prestige}).`);

    const rivalry = await prisma.rivalry.findFirst({
      where: {
        OR: [
          { clubAId: attacker.clubId, clubBId: targetClubId },
          { clubAId: targetClubId, clubBId: attacker.clubId },
        ],
      },
    });
    const rivalWeek = await advisorService.getRivalOfTheWeek(attacker.clubId);
    const derbyContext = Boolean(rivalry) || rivalWeek.rival?.id === targetClubId;
    if (!derbyContext) throw new Error('Solo puedes plantar crisis de vestuario antes de un derbi o contra un rival declarado.');

    const existing = await prisma.rumorSabotage.findUnique({
      where: {
        attackerManagerId_targetClubId_seasonId_seasonWeek: {
          attackerManagerId,
          targetClubId,
          seasonId: state.seasonId,
          seasonWeek: state.seasonWeek,
        },
      },
    });
    if (existing) throw new Error('Ya has gastado tu rumor informativo contra este club esta semana.');

    const headline = `CRISIS en el vestuario del ${target.shortName ?? target.name}: la prensa habla de división interna`;
    const row = await prisma.$transaction(async (tx) => {
      await tx.manager.update({
        where: { id: attackerManagerId },
        data: { prestige: { decrement: PLANT_COST } },
      });
      await tx.managerPrestigeLog.create({
        data: {
          managerId: attackerManagerId,
          points: -PLANT_COST,
          description: `Sabotaje informativo contra ${target.name}`,
        },
      });
      return tx.rumorSabotage.create({
        data: {
          attackerManagerId,
          targetClubId,
          seasonId: state.seasonId,
          seasonWeek: state.seasonWeek,
          prestigeSpent: PLANT_COST,
          headline,
          moodPenalty: MOOD_PENALTY,
        },
      });
    });

    await prisma.pressItem.create({
      data: {
        headline,
        content: `Fuentes cercanas al ${target.name} hablan de tensión en el vestuario. La afición rival lo celebra en la taberna.`,
      },
    });

    return { ok: true, sabotage: row, prestigeSpent: PLANT_COST, limits: { plantCost: PLANT_COST, debunkCost: DEBUNK_COST, perWeek: 1 } };
  },

  async debunk(defenderManagerId: number, sabotageId: number) {
    const defender = await prisma.manager.findUnique({ where: { id: defenderManagerId }, select: { id: true, clubId: true, prestige: true } });
    if (!defender?.clubId) throw new Error('Necesitas un club para desmentir.');

    const row = await prisma.rumorSabotage.findUnique({ where: { id: sabotageId } });
    if (!row || row.targetClubId !== defender.clubId) throw new Error('Rumor no encontrado o no te afecta.');
    if (row.debunked) throw new Error('Este rumor ya fue desmentido.');
    if (defender.prestige < DEBUNK_COST) throw new Error(`Necesitas ${DEBUNK_COST} de prestigio para desmentir.`);

    await prisma.$transaction([
      prisma.manager.update({ where: { id: defenderManagerId }, data: { prestige: { decrement: DEBUNK_COST } } }),
      prisma.managerPrestigeLog.create({
        data: {
          managerId: defenderManagerId,
          points: -DEBUNK_COST,
          description: 'Desmentido de crisis de vestuario (N4-2)',
        },
      }),
      prisma.rumorSabotage.update({
        where: { id: sabotageId },
        data: { debunked: true, debunkedAt: new Date(), debunkManagerId: defenderManagerId, moodPenalty: Math.floor(row.moodPenalty / 2) },
      }),
    ]);

    return { ok: true, moodPenaltyReduced: Math.floor(row.moodPenalty / 2) };
  },

  async activeAgainstClub(clubId: number) {
    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true, seasonWeek: true } });
    if (!state) return [];
    return prisma.rumorSabotage.findMany({
      where: { targetClubId: clubId, seasonId: state.seasonId, seasonWeek: state.seasonWeek, debunked: false },
      orderBy: { createdAt: 'desc' },
    });
  },

  async moodPenaltyForClub(clubId: number) {
    const rows = await this.activeAgainstClub(clubId);
    return rows.reduce((sum, r) => sum + r.moodPenalty, 0);
  },
};
