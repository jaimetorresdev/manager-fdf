import prisma from '../../db/prisma';
import { Prisma } from '@prisma/client';

// MissionProgress(managerId, missionId, progress, target, completedAt?, rewardClaimedAt?)
// persists partial progress. Fallback computed progress is still used if DB records are missing.

export type MissionId =
  | 'derby_win'
  | 'unbeaten_5'
  | 'promotion'
  | 'academy_debut'
  | 'unbeaten_10'
  | 'first_signing'
  | 'first_academy_debut'
  | 'epic_comeback'
  | 'season_no_deficit';

type MissionCatalogItem = {
  id: MissionId;
  title: string;
  description: string;
  target: number;
  rewardXp: number;
  category: 'match' | 'season' | 'academy' | 'market';
};

export const MISSION_CATALOG: MissionCatalogItem[] = [
  {
    id: 'derby_win',
    title: 'Ganar un derbi',
    description: 'Vence a un rival histórico en partido oficial.',
    target: 1,
    rewardXp: 100,
    category: 'match',
  },
  {
    id: 'unbeaten_5',
    title: 'Invicto 5 jornadas',
    description: 'Encadena cinco partidos oficiales sin perder.',
    target: 5,
    rewardXp: 150,
    category: 'match',
  },
  {
    id: 'promotion',
    title: 'Ascenso',
    description: 'Termina la temporada en una posición de ascenso.',
    target: 1,
    rewardXp: 250,
    category: 'season',
  },
  {
    id: 'academy_debut',
    title: 'Debut canterano',
    description: 'Haz debutar o promociona un jugador de cantera.',
    target: 1,
    rewardXp: 120,
    category: 'academy',
  },
  {
    id: 'unbeaten_10',
    title: 'Diez sin perder',
    description: 'Encadena diez partidos oficiales sin perder.',
    target: 10,
    rewardXp: 250,
    category: 'match',
  },
  {
    id: 'first_signing',
    title: 'Primer fichaje',
    description: 'Cierra tu primer refuerzo desde el mercado.',
    target: 1,
    rewardXp: 120,
    category: 'market',
  },
  {
    id: 'first_academy_debut',
    title: 'Primer juvenil debutado',
    description: 'Da minutos oficiales a un jugador formado en tu cantera.',
    target: 1,
    rewardXp: 160,
    category: 'academy',
  },
  {
    id: 'epic_comeback',
    title: 'Remontada épica',
    description: 'Gana un partido en el que tu equipo llegó a ir por detrás.',
    target: 1,
    rewardXp: 220,
    category: 'match',
  },
  {
    id: 'season_no_deficit',
    title: 'Temporada sin déficit',
    description: 'Mantén el balance económico de la temporada en positivo.',
    target: 1,
    rewardXp: 200,
    category: 'season',
  },
];

const BASE_MISSION_IDS = new Set<MissionId>(['derby_win', 'unbeaten_5', 'promotion', 'academy_debut']);
const MILESTONE_IDS = new Set<MissionId>(['unbeaten_10', 'first_signing', 'first_academy_debut', 'epic_comeback', 'season_no_deficit']);

const awardsInProgress = new Set<string>();

function missionType(id: MissionId) {
  return `MISSION_${id.toUpperCase()}`;
}

function nextLevelForXp(xp: number) {
  return Math.max(1, Math.floor(xp / 1000) + 1);
}

async function managerClub(managerId: number) {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: { id: true, clubId: true, xp: true, level: true },
  });
  if (!manager) throw new Error('Manager not found');
  return manager;
}

async function recentMatchesForClub(clubId: number, take = 5) {
  return prisma.match.findMany({
    where: {
      status: 'played',
      OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
    },
    include: { matchday: { include: { competition: true } } },
    orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
    take,
  });
}

function resultForClub(match: { homeClubId: number; awayClubId: number; homeGoals: number | null; awayGoals: number | null }, clubId: number) {
  const home = match.homeGoals ?? 0;
  const away = match.awayGoals ?? 0;
  if (home === away) return 'draw';
  const wonHome = home > away;
  return (match.homeClubId === clubId && wonHome) || (match.awayClubId === clubId && !wonHome) ? 'win' : 'loss';
}

async function progressDerbyWin(clubId: number, recentMatchIds?: number[]) {
  const rivalries = await prisma.rivalry.findMany({
    where: { OR: [{ clubAId: clubId }, { clubBId: clubId }] },
  });
  if (rivalries.length === 0) return 0;
  const rivalIds = new Set(rivalries.map((row) => row.clubAId === clubId ? row.clubBId : row.clubAId));
  const matches = await prisma.match.findMany({
    where: {
      status: 'played',
      ...(recentMatchIds?.length ? { id: { in: recentMatchIds } } : {}),
      OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
    },
    orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
    take: recentMatchIds?.length ? recentMatchIds.length : 100,
  });
  return matches.some((match) => {
    const opponentId = match.homeClubId === clubId ? match.awayClubId : match.homeClubId;
    return rivalIds.has(opponentId) && resultForClub(match, clubId) === 'win';
  }) ? 1 : 0;
}

async function progressUnbeaten(clubId: number, take = 5) {
  const matches = await recentMatchesForClub(clubId, take);
  let streak = 0;
  for (const match of matches) {
    if (resultForClub(match, clubId) === 'loss') break;
    streak += 1;
  }
  return streak;
}

async function progressPromotion(clubId: number) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true } });
  const standings = await prisma.standing.findMany({
    where: {
      clubId,
      competition: {
        type: 'league',
        ...(state?.seasonId ? { seasonId: state.seasonId } : {}),
      },
    },
    include: { competition: true },
  });
  return standings.some((row) => row.competition.tier > 1 && row.points > 0 && row.played > 0 && row.won >= 1)
    ? 1
    : 0;
}

async function progressAcademyDebut(clubId: number) {
  const officialHomegrownMinutes = await prisma.playerMatchStat.count({
    where: { minutes: { gt: 0 }, player: { clubId, homegrown: true } },
  });
  if (officialHomegrownMinutes > 0) return 1;
  const academy = await prisma.youthAcademy.findUnique({
    where: { clubId },
    include: { youthPlayers: true },
  });
  if (!academy) return 0;
  // Sin relación YouthPlayer -> Player, el progreso persistente real requiere schema.
  return academy.youthPlayers.some((player) => player.age >= 17 && player.potential >= 75) ? 1 : 0;
}

async function progressFirstSigning(clubId: number) {
  const [closedOffers, transferredPlayers] = await Promise.all([
    prisma.transferOffer.count({
      where: { fromClubId: clubId, status: { in: ['accepted', 'accepted_pending_window'] } },
    }),
    prisma.player.count({ where: { clubId, lastTransferAt: { not: null } } }),
  ]);
  return closedOffers > 0 || transferredPlayers > 0 ? 1 : 0;
}

async function progressEpicComeback(clubId: number, recentMatchIds?: number[]) {
  const matches = await prisma.match.findMany({
    where: {
      status: 'played',
      ...(recentMatchIds?.length ? { id: { in: recentMatchIds } } : {}),
      OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
    },
    orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
    take: recentMatchIds?.length ? recentMatchIds.length : 80,
    include: {
      events: { where: { type: { in: ['goal', 'gol'] } }, orderBy: { minute: 'asc' } },
    },
  });

  for (const match of matches) {
    if (resultForClub(match, clubId) !== 'win') continue;
    let home = 0;
    let away = 0;
    let trailed = false;
    const myTeam = match.homeClubId === clubId ? 'home' : 'away';
    for (const goal of match.events) {
      if (myTeam === 'home' && home < away) trailed = true;
      if (myTeam === 'away' && away < home) trailed = true;
      if (goal.team === 'home') home += 1;
      else away += 1;
    }
    if (trailed) return 1;
  }
  return 0;
}

async function progressSeasonNoDeficit(clubId: number) {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { season: { select: { name: true } } },
  });
  const seasonName = state?.season?.name;
  if (!seasonName) return 0;
  const snapshots = await prisma.financeSnapshot.findMany({
    where: {
      clubId,
      season: seasonName,
    },
    select: { income: true, expenses: true },
  });
  if (snapshots.length < 4) return 0;
  const net = snapshots.reduce((sum, row) => sum + row.income - row.expenses, 0);
  return net >= 0 ? 1 : 0;
}

async function progressForMission(managerId: number, missionId: MissionId, recentMatchIds?: number[]) {
  const manager = await managerClub(managerId);
  if (!manager.clubId) return 0;
  if (missionId === 'derby_win') return progressDerbyWin(manager.clubId, recentMatchIds);
  if (missionId === 'unbeaten_5') return progressUnbeaten(manager.clubId, 5);
  if (missionId === 'promotion') return progressPromotion(manager.clubId);
  if (missionId === 'academy_debut') return progressAcademyDebut(manager.clubId);
  if (missionId === 'unbeaten_10') return progressUnbeaten(manager.clubId, 10);
  if (missionId === 'first_signing') return progressFirstSigning(manager.clubId);
  if (missionId === 'first_academy_debut') return progressAcademyDebut(manager.clubId);
  if (missionId === 'epic_comeback') return progressEpicComeback(manager.clubId, recentMatchIds);
  if (missionId === 'season_no_deficit') return progressSeasonNoDeficit(manager.clubId);
  return 0;
}

// Persistencia del progreso (deuda §misiones resuelta, 11 jun tarde): cada
// evaluación del tick deja el progreso en MissionProgress. Sin unique
// (managerId, missionId) en el modelo → findFirst+update/create (el tick es
// secuencial, sin carrera real). El progreso puede BAJAR (p. ej. racha rota):
// se escribe el valor actual, no el máximo.
async function persistProgress(managerId: number, item: MissionCatalogItem, progress: number, completed: boolean) {
  try {
    const existing = await prisma.missionProgress.findFirst({
      where: { managerId, missionId: item.id },
      select: { id: true, completedAt: true },
    });
    const completedAt = existing?.completedAt ?? (completed ? new Date() : null);
    if (existing) {
      await prisma.missionProgress.update({
        where: { id: existing.id },
        data: {
          progress: Math.min(item.target, progress),
          target: item.target,
          completedAt,
          // claim automático: la recompensa se aplica al completar (awardMission)
          rewardClaimedAt: completedAt,
        },
      });
    } else {
      await prisma.missionProgress.create({
        data: {
          managerId,
          missionId: item.id,
          progress: Math.min(item.target, progress),
          target: item.target,
          completedAt,
          rewardClaimedAt: completedAt,
        },
      });
    }
  } catch (err) {
    // La persistencia es mejora, no requisito: el cálculo derivado sigue siendo
    // el fallback y el tick no debe romperse por esto.
    console.error(`[missions] no se pudo persistir el progreso de ${item.id} (mánager ${managerId}):`, err);
  }
}

async function awardMission(managerId: number, item: MissionCatalogItem) {
  const type = missionType(item.id);
  const key = `${managerId}:${type}`;
  if (awardsInProgress.has(key)) return false;
  awardsInProgress.add(key);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.managerAchievement.findFirst({
        where: { managerId, type },
        select: { id: true },
      });
      if (existing) return false;

      const manager = await tx.manager.findUnique({ where: { id: managerId }, select: { xp: true } });
      const nextXp = (manager?.xp ?? 0) + item.rewardXp;
      await tx.manager.update({
        where: { id: managerId },
        data: { xp: nextXp, level: nextLevelForXp(nextXp) },
      });
      await tx.managerAchievement.create({
        data: {
          managerId,
          type,
          title: item.title,
        },
      });
      await tx.news.create({
        data: {
          recipientId: managerId,
          type: 'mission',
          subject: `Misión completada: ${item.title}`,
          body: `Recompensa aplicada: ${item.rewardXp} XP.`,
        },
      });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } finally {
    awardsInProgress.delete(key);
  }
}

export const missionsService = {
  catalog() {
    return MISSION_CATALOG;
  },

  async getMissions(managerId: number) {
    const [achievements, persisted] = await Promise.all([
      prisma.managerAchievement.findMany({ where: { managerId } }),
      prisma.missionProgress.findMany({ where: { managerId } }),
    ]);
    const completed = new Set(achievements.map((row) => row.type));
    const persistedById = new Map(persisted.map((row) => [row.missionId, row]));
    const rows = await Promise.all(MISSION_CATALOG.map(async (item) => {
      // Progreso persistido (lo escribe cada tick); cálculo derivado como fallback.
      const saved = persistedById.get(item.id);
      const progress = saved
        ? Math.min(item.target, saved.progress)
        : Math.min(item.target, await progressForMission(managerId, item.id));
      const isCompleted = completed.has(missionType(item.id));
      return {
        ...item,
        progress: isCompleted ? item.target : progress,
        completed: isCompleted,
        completedAt: achievements.find((row) => row.type === missionType(item.id))?.date ?? null,
      };
    }));
    return {
      catalog: rows,
      storage: {
        completed: 'ManagerAchievement/MissionProgress',
        progress: persisted.length > 0 ? 'MissionProgress' : 'computed-fallback',
      },
    };
  },

  async evaluateManager(managerId: number, recentMatchIds?: number[], scope: 'base' | 'milestones' | 'all' = 'base') {
    const awarded: MissionId[] = [];
    const scopedCatalog = MISSION_CATALOG.filter((item) => {
      if (scope === 'all') return true;
      if (scope === 'milestones') return MILESTONE_IDS.has(item.id);
      return BASE_MISSION_IDS.has(item.id);
    });
    for (const item of scopedCatalog) {
      const progress = await progressForMission(managerId, item.id, recentMatchIds);
      const isAwarded = progress >= item.target && await awardMission(managerId, item);
      if (isAwarded) awarded.push(item.id);
      await persistProgress(managerId, item, progress, progress >= item.target);
    }
    return awarded;
  },

  async evaluateTick(recentMatchIds: number[] = []) {
    const managers = await prisma.manager.findMany({
      where: { clubId: { not: null } },
      select: { id: true },
    });
    let completed = 0;
    for (const manager of managers) {
      completed += (await this.evaluateManager(manager.id, recentMatchIds)).length;
    }
    return { managers: managers.length, completed };
  },

  async evaluateMilestonesTick(recentMatchIds: number[] = []) {
    const managers = await prisma.manager.findMany({
      where: { clubId: { not: null } },
      select: { id: true },
    });
    let completed = 0;
    for (const manager of managers) {
      completed += (await this.evaluateManager(manager.id, recentMatchIds, 'milestones')).length;
    }
    return { managers: managers.length, completed };
  },
};
