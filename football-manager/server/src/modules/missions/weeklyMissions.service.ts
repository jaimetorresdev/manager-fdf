// ─── QW-20 · Misiones semanales ──────────────────────────────────────────────
// Generadas EN EL TICK (3/semana in-game por mánager humano con club), evaluadas
// automáticamente al cerrar la jornada y con claim automático (XP + prestigio,
// cero dinero, cero P2W). Modelo WeeklyMission (migración 20260611100000).
// Contrato en server/API_UI.md §BloqueQ (11 jun 2026).
import prisma from '../../db/prisma';
import { advisorService } from '../club/advisor.service';

// Cast defensivo hasta regenerar el cliente Prisma en el Mac (--build backend),
// mismo patrón que ideology.service.ts con IdeologyUnlock.
type PrismaRuntime = typeof prisma & { weeklyMission?: any };
function weeklyMissionModel() {
  const db = prisma as PrismaRuntime;
  if (!db.weeklyMission) {
    throw new Error('WeeklyMission no disponible: regenera el cliente Prisma (--build backend).');
  }
  return db.weeklyMission;
}

export type WeeklyMissionType =
  | 'clean_sheet'
  | 'academy_minutes'
  | 'renew_contract'
  | 'sign_u23'
  | 'beat_direct_rival'
  | 'win_next';

type MissionTemplate = {
  type: WeeklyMissionType;
  title: string;
  description: string;
  rewardXp: number;
  rewardPrestige: number;
};

const TEMPLATES: Record<WeeklyMissionType, MissionTemplate> = {
  clean_sheet: {
    type: 'clean_sheet',
    title: 'Portería a cero',
    description: 'Termina un partido de esta semana sin encajar goles.',
    rewardXp: 60,
    rewardPrestige: 1,
  },
  academy_minutes: {
    type: 'academy_minutes',
    title: 'Apuesta por la cantera',
    description: 'Dale minutos a un canterano en un partido de esta semana.',
    rewardXp: 80,
    rewardPrestige: 1,
  },
  renew_contract: {
    type: 'renew_contract',
    title: 'Blindar el vestuario',
    description: 'Renueva el contrato de un jugador de tu plantilla.',
    rewardXp: 70,
    rewardPrestige: 1,
  },
  sign_u23: {
    type: 'sign_u23',
    title: 'Ojo para el talento',
    description: 'Cierra el fichaje de un jugador sub-23.',
    rewardXp: 100,
    rewardPrestige: 2,
  },
  beat_direct_rival: {
    type: 'beat_direct_rival',
    title: 'Ganar el duelo directo',
    description: 'Vence a tu rival de la semana.',
    rewardXp: 120,
    rewardPrestige: 2,
  },
  win_next: {
    type: 'win_next',
    title: 'Sumar de tres',
    description: 'Gana un partido esta semana.',
    rewardXp: 50,
    rewardPrestige: 1,
  },
};

function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function parseBaseline(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function currentWeek() {
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) return null;
  // Cast defensivo (seasonWeek llegó en la migración 20260610210000).
  const week = (state as unknown as { seasonWeek?: number }).seasonWeek ?? state.week;
  return {
    seasonId: state.seasonId,
    weekKey: `s${state.seasonId}-w${week}`,
    inGameDate: state.inGameDate,
  };
}

// ─── Evaluación de UNA misión pendiente ──────────────────────────────────────
async function evaluateMission(
  mission: {
    id: number; managerId: number; type: string; baseline: string | null;
    createdAt: Date; target: number; progress: number;
  },
  clubId: number,
  tickMatchIds: number[],
): Promise<boolean> {
  const baseline = parseBaseline(mission.baseline);

  const myTickMatches = tickMatchIds.length
    ? await prisma.match.findMany({
        where: {
          id: { in: tickMatchIds },
          status: 'played',
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        },
        select: { id: true, homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
      })
    : [];

  const won = (m: { homeClubId: number; homeGoals: number | null; awayGoals: number | null }) => {
    const mine = m.homeClubId === clubId ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
    const theirs = m.homeClubId === clubId ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
    return mine > theirs;
  };

  switch (mission.type as WeeklyMissionType) {
    case 'clean_sheet':
      return myTickMatches.some((m) => (m.homeClubId === clubId ? m.awayGoals ?? 0 : m.homeGoals ?? 0) === 0);

    case 'win_next':
      return myTickMatches.some(won);

    case 'beat_direct_rival': {
      const rivalClubId = Number(baseline.rivalClubId);
      if (!rivalClubId) return false;
      return myTickMatches.some((m) =>
        (m.homeClubId === rivalClubId || m.awayClubId === rivalClubId) && won(m));
    }

    case 'academy_minutes': {
      if (myTickMatches.length === 0) return false;
      const count = await prisma.playerMatchStat.count({
        where: {
          matchId: { in: myTickMatches.map((m) => m.id) },
          minutes: { gt: 0 },
          player: { clubId, homegrown: true },
        },
      });
      return count > 0;
    }

    case 'renew_contract': {
      // renewPlayer fija contractStartAt = inGameDate del momento de renovar.
      const sinceInGame = baseline.inGameDate ? new Date(String(baseline.inGameDate)) : mission.createdAt;
      const renewed = await prisma.player.count({
        where: {
          clubId,
          contractStartAt: { gte: sinceInGame },
          updatedAt: { gte: mission.createdAt },
        },
      });
      return renewed > 0;
    }

    case 'sign_u23': {
      const signed = await prisma.transferOffer.count({
        where: {
          fromClubId: clubId,
          status: { in: ['accepted', 'accepted_pending_window'] },
          updatedAt: { gte: mission.createdAt },
          player: { age: { lte: 23 } },
        },
      });
      return signed > 0;
    }

    default:
      return false;
  }
}

export const weeklyMissionsService = {
  // ─── Llamado desde el tick (game.service) tras simular la jornada ───────────
  async processTick(tickMatchIds: number[]) {
    let model;
    try {
      model = weeklyMissionModel();
    } catch {
      return { evaluated: 0, completed: 0, generated: 0, skipped: 'client' };
    }
    const week = await currentWeek();
    if (!week) return { evaluated: 0, completed: 0, generated: 0 };

    const managers = await prisma.manager.findMany({
      where: { clubId: { not: null } },
      select: { id: true, clubId: true },
    });
    const clubByManager = new Map(managers.map((m) => [m.id, m.clubId as number]));

    // 1 · Evaluar TODAS las pendientes (también las de la semana que se cierra)
    const pending = await model.findMany({ where: { status: 'pending' } });
    let completed = 0;
    for (const mission of pending) {
      const clubId = clubByManager.get(mission.managerId);
      if (!clubId) continue;
      try {
        const done = await evaluateMission(mission, clubId, tickMatchIds);
        if (!done) continue;
        // Claim automático en transacción: misión + recompensa + noticia.
        await prisma.$transaction(async (tx) => {
          const txModel = (tx as unknown as { weeklyMission: any }).weeklyMission;
          const claimed = await txModel.updateMany({
            where: { id: mission.id, status: 'pending' },
            data: { status: 'claimed', progress: mission.target },
          });
          if (claimed.count === 0) return; // claim atómico: otro proceso llegó antes
          const manager = await tx.manager.findUnique({
            where: { id: mission.managerId },
            select: { xp: true, prestige: true },
          });
          await tx.manager.update({
            where: { id: mission.managerId },
            data: {
              xp: (manager?.xp ?? 0) + mission.rewardXp,
              prestige: (manager?.prestige ?? 0) + mission.rewardPrestige,
            },
          });
          await tx.news.create({
            data: {
              recipientId: mission.managerId,
              type: 'mission',
              subject: `Misión semanal completada: ${mission.title}`,
              body: `Recompensa: ${mission.rewardXp} XP y +${mission.rewardPrestige} de prestigio.`,
            },
          });
          completed += 1;
        });
      } catch (err) {
        console.error(`[weekly-missions] error evaluando misión ${mission.id}:`, err);
      }
    }

    // 2 · Expirar pendientes de semanas anteriores
    await model.updateMany({
      where: { status: 'pending', weekKey: { not: week.weekKey } },
      data: { status: 'expired' },
    });

    // 3 · Generar 3 misiones para la semana actual a quien no las tenga
    let generated = 0;
    for (const manager of managers) {
      const existing = await model.count({
        where: { managerId: manager.id, weekKey: week.weekKey },
      });
      if (existing > 0) continue;
      try {
        generated += await this.generateForManager(manager.id, manager.clubId as number, week);
      } catch (err) {
        console.error(`[weekly-missions] error generando para mánager ${manager.id}:`, err);
      }
    }

    return { evaluated: pending.length, completed, generated };
  },

  // ─── Generación por reglas (determinista por mánager+semana) ────────────────
  async generateForManager(
    managerId: number,
    clubId: number,
    week: { seasonId: number; weekKey: string; inGameDate: Date },
  ): Promise<number> {
    const model = weeklyMissionModel();
    const oneYear = new Date(week.inGameDate.getTime() + 365 * 24 * 60 * 60 * 1000);

    const [homegrownCount, expiringCount, rivalWeek] = await Promise.all([
      prisma.player.count({ where: { clubId, homegrown: true } }),
      prisma.player.count({ where: { clubId, contractEndAt: { lte: oneYear } } }),
      advisorService.getRivalOfTheWeek(clubId).catch(() => ({ rival: null as null | { id: number } })),
    ]);

    // Pool de elegibles, en orden de "interés" fijo; selección rotada por hash.
    const pool: Array<{ template: MissionTemplate; baseline: Record<string, unknown> }> = [];
    pool.push({ template: TEMPLATES.win_next, baseline: {} });
    pool.push({ template: TEMPLATES.clean_sheet, baseline: {} });
    if (homegrownCount > 0) pool.push({ template: TEMPLATES.academy_minutes, baseline: {} });
    if (expiringCount > 0) pool.push({ template: TEMPLATES.renew_contract, baseline: { inGameDate: week.inGameDate.toISOString() } });
    if (rivalWeek.rival) {
      pool.push({
        template: TEMPLATES.beat_direct_rival,
        baseline: { rivalClubId: rivalWeek.rival.id },
      });
    }
    pool.push({ template: TEMPLATES.sign_u23, baseline: {} });

    const offset = hashString(`${managerId}:${week.weekKey}`) % pool.length;
    const chosen: typeof pool = [];
    for (let i = 0; i < pool.length && chosen.length < 3; i++) {
      chosen.push(pool[(offset + i) % pool.length]);
    }

    let created = 0;
    for (const { template, baseline } of chosen) {
      try {
        await model.create({
          data: {
            managerId,
            seasonId: week.seasonId,
            weekKey: week.weekKey,
            type: template.type,
            title: template.title,
            description: template.description,
            target: 1,
            rewardXp: template.rewardXp,
            rewardPrestige: template.rewardPrestige,
            baseline: Object.keys(baseline).length ? JSON.stringify(baseline) : null,
          },
        });
        created += 1;
      } catch {
        // unique (managerId, weekKey, type): generación idempotente ante reintento de tick
      }
    }
    return created;
  },

  // ─── GET /api/missions · campo aditivo `weekly` ─────────────────────────────
  async getWeekly(managerId: number) {
    let model;
    try {
      model = weeklyMissionModel();
    } catch {
      return { weekKey: null, missions: [] };
    }
    const week = await currentWeek();
    if (!week) return { weekKey: null, missions: [] };
    const missions = await model.findMany({
      where: { managerId, weekKey: week.weekKey },
      orderBy: { id: 'asc' },
    });
    return {
      weekKey: week.weekKey,
      missions: missions.map((m: any) => ({
        id: m.id,
        type: m.type,
        title: m.title,
        description: m.description,
        target: m.target,
        progress: m.progress,
        status: m.status,
        reward: { xp: m.rewardXp, prestige: m.rewardPrestige },
      })),
    };
  },
};
