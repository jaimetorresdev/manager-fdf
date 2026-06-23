import prisma from '../../db/prisma';
import { vacationService } from '../vacation/vacation.service';
import { fansService } from '../fans/fans.service';
import { advisorService } from '../club/advisor.service';
import { shouldHideResult } from '../matches/matchEventVisibility';
import { PRESTIGE_ACHIEVEMENT_POINTS, PRESTIGE_LIMITS } from './prestige.constants';
import { aggregateSkillEffects, effectsForManager } from './skillEffects';
import {
  canonicalCareerNodeId,
  careerSkillPointState,
  careerSkillTreeState,
  careerXpProgress,
  validateCareerNodeUnlock,
} from './careerCurve';
import { npcCoachService } from './npcCoach.service';
import { sortStandings } from '../game/standings';
import { getInGameDate } from '../../lib/inGameDate';
import { returnWindowAllows } from './returnWindow';

const SEASON_FALLBACK = '2026/2027';
const TUTORIAL_STEPS = [
  { step: 1, key: 'choose_club', route: '/onboarding', objective: 'Elige club y define tu identidad de mánager' },
  { step: 2, key: 'club_context', route: '/', objective: 'Conoce tu club, el objetivo de temporada y la prioridad del próximo turno' },
  { step: 3, key: 'review_squad', route: '/squad', objective: 'Revisa la plantilla, las bajas y los contratos que requieren atención' },
  { step: 4, key: 'tactics_lineup', route: '/tactics', objective: 'Prepara táctica, once y balón parado' },
  { step: 5, key: 'training_plan', route: '/training', objective: 'Activa un plan de entrenamiento conectado con tu táctica' },
  { step: 6, key: 'watch_match', route: '/matches', objective: 'Sigue tu primer partido en Match Center' },
];

type TutorialPatch = {
  tutorialStep?: number;
  tutorialCompleted?: boolean;
  tutorialSkipped?: boolean;
};

function contractObjective(club: { budget: number; reputation: number }) {
  if (club.reputation >= 82 || club.budget > 50_000_000) return 'Ganar la Liga';
  if (club.reputation >= 68 || club.budget > 25_000_000) return 'Clasificar a Competiciones Europeas';
  if (club.reputation >= 50 || club.budget > 10_000_000) return 'Terminar en mitad de tabla';
  return 'Evitar el descenso';
}

async function activeSeasonName() {
  const season = await prisma.season.findFirst({ where: { isActive: true }, select: { name: true } });
  return season?.name ?? SEASON_FALLBACK;
}

async function managerPrestige(managerId: number) {
  const [manager, prestige] = await Promise.all([
    prisma.manager.findUnique({ where: { id: managerId }, select: { prestige: true } }),
    prisma.prestige.findFirst({
      where: { managerId },
      orderBy: { updatedAt: 'desc' },
      select: { value: true },
    }),
  ]);
  return Math.max(manager?.prestige ?? 0, prestige?.value ?? 0);
}

function achievementPoints(type: string): number {
  return PRESTIGE_ACHIEVEMENT_POINTS[type.toUpperCase()] ?? 1;
}

function objectivePoints(status: string): number {
  const normalized = status.toLowerCase();
  if (normalized.includes('complete') || normalized.includes('success') || normalized.includes('cumpl')) return PRESTIGE_LIMITS.objectiveCap;
  if (normalized.includes('fail') || normalized.includes('frac')) return -PRESTIGE_LIMITS.objectiveCap;
  return 0;
}

function clampPrestige(value: number): number {
  return Math.max(0, Math.min(PRESTIGE_LIMITS.max, Math.round(value)));
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function pressureLevel(score: number): { level: 'calm' | 'watch' | 'tense' | 'crisis'; label: string } {
  if (score >= 75) return { level: 'crisis', label: 'Crisis en el cargo' };
  if (score >= 55) return { level: 'tense', label: 'Presión alta' };
  if (score >= 35) return { level: 'watch', label: 'Situación vigilada' };
  return { level: 'calm', label: 'Cargo estable' };
}

function vacancyScore(club: { reputation: number; budget: number }, prestige: number) {
  const financialPull = Math.min(18, Math.floor(club.budget / 5_000_000));
  return prestige + financialPull - club.reputation;
}

function availability(score: number) {
  if (score >= 8) return 'offer';
  if (score >= -8) return 'apply';
  return 'locked';
}

function vacancyDays(openedAt: Date | null | undefined, fallback: Date) {
  const start = openedAt ?? fallback;
  const ms = Date.now() - start.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

function vacancyUrgency(daysVacant: number) {
  if (daysVacant >= 14) return 'high';
  if (daysVacant >= 5) return 'medium';
  return 'low';
}

function serializeVacancy(club: {
  id: number;
  name: string;
  shortName: string;
  badge: string;
  city: string;
  country: string;
  budget: number;
  reputation: number;
  stadiumName: string;
  stadiumCapacity: number;
  createdAt: Date;
  vacancyOpenedAt?: Date | null;
}, prestige: number) {
  const score = vacancyScore(club, prestige);
  const status = availability(score);
  const daysVacant = vacancyDays(club.vacancyOpenedAt, club.createdAt);
  return {
    id: club.id,
    clubId: club.id,
    club: {
      id: club.id,
      name: club.name,
      shortName: club.shortName,
      badge: club.badge,
      city: club.city,
      country: club.country,
      budget: club.budget,
      reputation: club.reputation,
      stadiumName: club.stadiumName,
      stadiumCapacity: club.stadiumCapacity,
      vacancyOpenedAt: club.vacancyOpenedAt ?? club.createdAt,
      daysVacant,
    },
    daysVacant,
    objective: contractObjective(club),
    salary: Math.round(8_000 + club.reputation * 360 + Math.min(club.budget, 80_000_000) * 0.00045),
    years: club.reputation >= 70 ? 3 : 2,
    score,
    status,
    reason: status === 'offer'
      ? 'El club te quiere como primera opción.'
      : status === 'apply'
        ? 'Puedes presentar candidatura.'
        : 'Necesitas más prestigio para optar a esta vacante.',
  };
}

function emptyManagerRecord(source = 'currentClubMatches') {
  return {
    wins: 0,
    draws: 0,
    losses: 0,
    played: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    source,
  };
}

async function currentClubRecord(clubId: number | null, joinedAt?: Date | null) {
  if (!clubId) return emptyManagerRecord('noCurrentClub');
  // AUDIT 5.6: el balance del MÁNAGER en su club actual debe contar solo los partidos
  // disputados DESDE que se incorporó (`clubJoinedAt`), no toda la historia del club.
  // Para mánagers antiguos sin `clubJoinedAt` (datos previos a esta columna) se mantiene
  // el comportamiento anterior (todo el historial) como degradación elegante.
  const matches = await prisma.match.findMany({
    where: {
      status: 'played',
      OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
      homeGoals: { not: null },
      awayGoals: { not: null },
      ...(joinedAt ? { playedAt: { gte: joinedAt } } : {}),
    },
    select: {
      homeClubId: true,
      awayClubId: true,
      homeGoals: true,
      awayGoals: true,
    },
  });

  const record = emptyManagerRecord();
  for (const match of matches) {
    const goalsFor = match.homeClubId === clubId ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
    const goalsAgainst = match.homeClubId === clubId ? match.awayGoals ?? 0 : match.homeGoals ?? 0;
    record.played++;
    record.goalsFor += goalsFor;
    record.goalsAgainst += goalsAgainst;
    if (goalsFor > goalsAgainst) record.wins++;
    else if (goalsFor < goalsAgainst) record.losses++;
    else record.draws++;
  }
  return record;
}

function tutorialPayload(manager: {
  id: number;
  tutorialStep: number;
  tutorialCompleted: boolean;
  tutorialSkipped: boolean;
}) {
  return {
    managerId: manager.id,
    tutorialStep: manager.tutorialStep,
    tutorialCompleted: manager.tutorialCompleted,
    tutorialSkipped: manager.tutorialSkipped,
    steps: TUTORIAL_STEPS,
    uiNeed: '// NECESITO: Antigravity debe crear rutas guiadas de onboarding, saltable, que lea/actualice este estado.',
  };
}

// ─── AUDIT 3.7: prestigio — cómputo PURO + persistencia separada ─────────────
// Antes `getPrestigeBreakdown` (servido por GET /manager/prestige) MUTABA la BD en
// cada lectura (manager.update + prestige.create). Se separa lectura/escritura y
// se fija la fuente canónica ÚNICA = columna `manager.prestige`; la tabla
// `Prestige` queda como historial/auditoría.
type PrestigeManagerInput = {
  level: number;
  xp: number;
  wealth: number;
  objectiveStatus: string;
  achievements: Array<{ id: number; type: string; title: string; date: Date }>;
};

function computePrestige(manager: PrestigeManagerInput) {
  const achievementRows = manager.achievements.map((achievement) => ({
    id: achievement.id,
    type: achievement.type,
    title: achievement.title,
    points: achievementPoints(achievement.type),
    date: achievement.date,
  }));
  const achievementTotal = achievementRows.reduce((sum, row) => sum + row.points, 0);
  const achievementScore = Math.max(-25, Math.min(PRESTIGE_LIMITS.achievementCap, achievementTotal));
  const experienceScore = Math.min(PRESTIGE_LIMITS.experienceCap, Math.floor(manager.level * 2 + manager.xp / 500));
  const wealthScore = Math.min(PRESTIGE_LIMITS.wealthCap, Math.floor(manager.wealth / 1_000_000));
  const objectiveScore = objectivePoints(manager.objectiveStatus);
  const value = clampPrestige(achievementScore + experienceScore + wealthScore + objectiveScore);
  return { achievementRows, achievementScore, experienceScore, wealthScore, objectiveScore, value };
}

function buildPrestigeResponse(
  manager: { id: number; name: string; club: unknown; level: number; xp: number; wealth: number; objectiveStatus: string },
  computed: ReturnType<typeof computePrestige>,
) {
  return {
    managerId: manager.id,
    name: manager.name,
    club: manager.club,
    value: computed.value,
    max: PRESTIGE_LIMITS.max,
    breakdown: {
      achievements: { score: computed.achievementScore, cap: PRESTIGE_LIMITS.achievementCap, items: computed.achievementRows },
      experience: { score: computed.experienceScore, cap: PRESTIGE_LIMITS.experienceCap, level: manager.level, xp: manager.xp },
      wealth: { score: computed.wealthScore, cap: PRESTIGE_LIMITS.wealthCap, wealth: manager.wealth },
      objective: { score: computed.objectiveScore, cap: PRESTIGE_LIMITS.objectiveCap, status: manager.objectiveStatus },
    },
  };
}

export const managerService = {
  async getTutorial(managerId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, tutorialStep: true, tutorialCompleted: true, tutorialSkipped: true },
    });
    if (!manager) throw new Error('Manager not found');
    return tutorialPayload(manager);
  },

  async updateTutorial(managerId: number, input: TutorialPatch) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, tutorialStep: true, tutorialCompleted: true, tutorialSkipped: true },
    });
    if (!manager) throw new Error('Manager not found');

    const requestedStep = input.tutorialStep ?? manager.tutorialStep;
    const tutorialCompleted = manager.tutorialCompleted || input.tutorialCompleted === true;
    const tutorialSkipped = manager.tutorialSkipped || input.tutorialSkipped === true;
    const tutorialStep = tutorialCompleted
      ? Math.max(TUTORIAL_STEPS.length, requestedStep)
      : Math.max(0, Math.min(TUTORIAL_STEPS.length, requestedStep));

    const updated = await prisma.manager.update({
      where: { id: managerId },
      data: {
        tutorialStep,
        tutorialCompleted,
        tutorialSkipped,
      },
      select: { id: true, tutorialStep: true, tutorialCompleted: true, tutorialSkipped: true },
    });
    return tutorialPayload(updated);
  },

  // AUDIT 3.7: GET PURO — sin escritura. (Antes mutaba la BD en cada lectura:
  // manager.update + prestige.create colgando de un GET.) El recálculo persistente
  // vive en recalcPrestige (POST /manager/prestige/recalc) y/o en el tick.
  async getPrestigeBreakdown(managerId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      include: {
        achievements: { orderBy: { date: 'desc' } },
        club: { select: { id: true, name: true, shortName: true, badge: true } },
      },
    });
    if (!manager) throw new Error('Manager not found');
    return buildPrestigeResponse(manager, computePrestige(manager));
  },

  // AUDIT 3.7: ESCRITURA explícita. Recalcula y PERSISTE el prestigio en la fuente
  // canónica única (columna manager.prestige) + fila de historial Prestige (auditoría).
  async recalcPrestige(managerId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      include: {
        achievements: { orderBy: { date: 'desc' } },
        club: { select: { id: true, name: true, shortName: true, badge: true } },
      },
    });
    if (!manager) throw new Error('Manager not found');
    const computed = computePrestige(manager);
    const history = {
      event: 'prestige_2_0_recalc',
      achievementScore: computed.achievementScore,
      experienceScore: computed.experienceScore,
      wealthScore: computed.wealthScore,
      objectiveScore: computed.objectiveScore,
      value: computed.value,
      at: new Date().toISOString(),
    };
    await prisma.$transaction([
      prisma.manager.update({ where: { id: managerId }, data: { prestige: computed.value } }),
      prisma.prestige.create({ data: { managerId, value: computed.value, history: JSON.stringify(history) } }),
    ]);
    return buildPrestigeResponse(manager, computed);
  },

  async getPrestigeRanking(limit = 50) {
    const managers = await prisma.manager.findMany({
      orderBy: [{ prestige: 'desc' }, { reputation: 'desc' }, { name: 'asc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        prestige: true,
        reputation: true,
        level: true,
        club: { select: { id: true, name: true, shortName: true, badge: true } },
        user: { select: { username: true } },
      },
    });
    return managers.map((manager, index) => ({
      rank: index + 1,
      managerId: manager.id,
      name: manager.name,
      username: manager.user.username,
      prestige: manager.prestige,
      reputation: manager.reputation,
      level: manager.level,
      club: manager.club,
    }));
  },

  async getPressure(managerId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: {
        id: true,
        clubId: true,
        objectiveStatus: true,
        club: { select: { id: true, name: true, shortName: true, reputation: true, budget: true } },
      },
    });
    if (!manager) throw new Error('Manager not found');
    if (!manager.clubId || !manager.club) throw new Error('No tienes club asignado');

    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { seasonId: true, season: { select: { name: true } } },
    });
    const seasonName = state?.season?.name ?? await activeSeasonName();

    const [mood, recentMatches, boardConfidence, contract, boardObjectives] = await Promise.all([
      fansService.getMood(manager.clubId),
      prisma.match.findMany({
        where: {
          status: 'played',
          OR: [{ homeClubId: manager.clubId }, { awayClubId: manager.clubId }],
          ...(state?.seasonId ? { matchday: { competition: { seasonId: state.seasonId } } } : {}),
        },
        orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
        take: 5,
        select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
      }),
      prisma.boardConfidence.findFirst({
        where: { clubId: manager.clubId, OR: [{ managerId }, { managerId: null }] },
        orderBy: { updatedAt: 'desc' },
        select: { level: true, updatedAt: true },
      }),
      prisma.managerContract.findFirst({
        where: { managerId, clubId: manager.clubId },
        orderBy: { id: 'desc' },
        select: { objective: true, season: true },
      }),
      prisma.boardObjective.findMany({
        where: { clubId: manager.clubId, season: seasonName },
        select: { type: true, targetPosition: true, targetAmount: true, status: true },
      }),
    ]);

    let score = 35;
    const reasons: string[] = [];
    const sources = new Set<string>(['forma', 'fans/mood', 'clasificacion', 'directiva', 'objetivos']);

    const components: Record<string, { delta: number; label: string; [key: string]: unknown }> = {};

    const results = recentMatches.map((match) => {
      const own = match.homeClubId === manager.clubId ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
      const other = match.homeClubId === manager.clubId ? match.awayGoals ?? 0 : match.homeGoals ?? 0;
      return own > other ? 'W' : own === other ? 'D' : 'L';
    });
    let formDelta = 0;
    let formLabel = 'Sin muestra reciente suficiente';
    if (results.length > 0) {
      let winless = 0;
      while (winless < results.length && results[winless] !== 'W') winless++;
      let losing = 0;
      while (losing < results.length && results[losing] === 'L') losing++;
      if (winless >= 5) formDelta = 22;
      else if (winless >= 3) formDelta = 12;
      else if (losing >= 2) formDelta = 10;
      else if (results[0] === 'W') formDelta = -7;
      else if (results[0] === 'D') formDelta = 2;
      if (winless >= 3) {
        formLabel = `${winless} partidos sin ganar`;
        reasons.push(`-${formLabel}`);
      } else if (losing >= 2) {
        formLabel = `${losing} derrotas seguidas`;
        reasons.push(`-${formLabel}`);
      } else if (results[0] === 'W') {
        formLabel = 'Victoria reciente';
        reasons.push('+el último resultado calma el entorno');
      } else {
        formLabel = results[0] === 'D' ? 'Empate reciente' : 'Derrota reciente';
        if (results[0] === 'L') reasons.push('-derrota en el último partido');
      }
    }
    score += formDelta;
    components.form = { delta: formDelta, label: formLabel };

    let expectationDelta = 0;
    let expectationLabel = 'Sin clasificación comparable';
    if (state?.seasonId) {
      const myStanding = await prisma.standing.findFirst({
        where: { clubId: manager.clubId, competition: { seasonId: state.seasonId, type: 'league' } },
        select: { competitionId: true },
      });
      if (myStanding) {
        const table = await prisma.standing.findMany({
          where: { competitionId: myStanding.competitionId },
          select: {
            clubId: true,
            points: true,
            goalsFor: true,
            goalsAgainst: true,
            club: { select: { id: true, reputation: true } },
          },
        });
        const actualTable = sortStandings(table);
        const expectedTable = [...table].sort((a, b) => b.club.reputation - a.club.reputation || a.club.id - b.club.id);
        const actual = actualTable.findIndex((row) => row.clubId === manager.clubId) + 1;
        const expected = expectedTable.findIndex((row) => row.clubId === manager.clubId) + 1;
        if (actual > 0 && expected > 0) {
          const rankDelta = actual - expected;
          if (rankDelta >= 2) {
            expectationDelta = Math.min(24, rankDelta * 4);
            expectationLabel = `${rankDelta} puestos por debajo de lo esperado`;
            reasons.push(`-${expectationLabel}`);
          } else if (rankDelta <= -2) {
            expectationDelta = -Math.min(14, Math.abs(rankDelta) * 3);
            expectationLabel = `${Math.abs(rankDelta)} puestos por encima de lo esperado`;
            reasons.push(`+${expectationLabel}`);
          } else {
            expectationLabel = 'Rendimiento en línea con la expectativa';
          }
        }
      }
    }
    score += expectationDelta;
    components.expectation = { delta: expectationDelta, label: expectationLabel };

    let fansDelta = 0;
    let fansLabel = 'Afición neutral';
    if (mood.mood === 'red') {
      fansDelta = 16;
      fansLabel = 'La grada está nerviosa';
      reasons.push('-la grada está nerviosa');
    } else if (mood.mood === 'yellow') {
      fansDelta = 4;
      fansLabel = 'La afición espera señales';
      reasons.push('-la afición espera señales');
    } else {
      fansDelta = -8;
      fansLabel = 'La afición todavía confía';
      reasons.push('+la afición todavía confía');
    }
    score += fansDelta;
    components.fans = { delta: fansDelta, label: fansLabel, mood: mood.mood, score: mood.score };

    let boardDelta = 0;
    let boardLabel = 'Sin señales recientes de la directiva';
    if (boardConfidence) {
      if (boardConfidence.level < 40) {
        boardDelta = 18;
        boardLabel = 'La directiva pide reacción';
        reasons.push('-la directiva pide reacción');
      } else if (boardConfidence.level < 60) {
        boardDelta = 8;
        boardLabel = 'Confianza de directiva en observación';
      } else if (boardConfidence.level >= 70) {
        boardDelta = -8;
        boardLabel = 'La directiva mantiene la confianza';
        reasons.push('+la directiva mantiene la confianza');
      } else {
        boardLabel = 'Confianza de directiva estable';
      }
    }
    score += boardDelta;
    components.board = { delta: boardDelta, label: boardLabel, confidence: boardConfidence?.level ?? null };

    const failedObjectives = boardObjectives.filter((objective) => objective.status.toLowerCase().includes('fail')).length;
    const achievedObjectives = boardObjectives.filter((objective) => objective.status.toLowerCase().includes('achiev')).length;
    const objectiveStatus = manager.objectiveStatus.toLowerCase();
    let objectiveDelta = -4;
    let objectiveLabel = contract?.objective
      ? `Objetivo en plazo: ${contract.objective}`
      : 'Objetivo todavía en plazo';
    if (failedObjectives > 0 || objectiveStatus.includes('fail') || objectiveStatus.includes('frac')) {
      objectiveDelta = 18;
      objectiveLabel = 'Objetivo comprometido';
      reasons.push('-objetivo comprometido');
    } else if (achievedObjectives > 0 || objectiveStatus.includes('complete') || objectiveStatus.includes('achiev') || objectiveStatus.includes('cumpl')) {
      objectiveDelta = -10;
      objectiveLabel = 'Objetivo bien encaminado';
      reasons.push('+objetivo bien encaminado');
    } else {
      reasons.push('+objetivo todavía en plazo');
    }
    score += objectiveDelta;
    components.objectives = {
      delta: objectiveDelta,
      label: objectiveLabel,
      contractObjective: contract?.objective ?? null,
      boardObjectives: boardObjectives.length,
    };

    const finalScore = clampPressure(score);
    const level = pressureLevel(finalScore);
    return {
      score: finalScore,
      level: level.level,
      label: level.label,
      reasons: reasons.slice(0, 5),
      sources: [...sources],
      components,
    };
  },

  async getPublicManager(managerId: number, viewerUserId?: number, viewerClubId?: number | null) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: {
        id: true,
        name: true,
        nationality: true,
        personality: true,
        mentality: true,
        level: true,
        reputation: true,
        prestige: true,
        clubId: true,
        clubJoinedAt: true,
        avatarSeed: true,
        createdAt: true,
        user: { select: { username: true } },
        club: { select: { id: true, name: true, shortName: true, badge: true, country: true, reputation: true } },
        achievements: { orderBy: { date: 'desc' }, take: 12 },
      },
    });
    if (!manager) throw new Error('Manager not found');

    const [prestige, record, recentPrestige, recentMatches, rivalry] = await Promise.all([
      managerPrestige(manager.id),
      currentClubRecord(manager.clubId, manager.clubJoinedAt),
      prisma.managerPrestigeLog.findMany({
        where: { managerId: manager.id },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, description: true, points: true, createdAt: true },
      }),
      manager.clubId
        ? prisma.match.findMany({
            where: {
              status: 'played',
              OR: [{ homeClubId: manager.clubId }, { awayClubId: manager.clubId }],
            },
            orderBy: { playedAt: 'desc' },
            take: 6,
            select: {
              id: true,
              homeClubId: true,
              awayClubId: true,
              homeGoals: true,
              awayGoals: true,
              homeStatsJson: true,
              playedAt: true,
              homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
              awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
              matchday: { select: { number: true, competition: { select: { id: true, name: true, shortName: true } } } },
            },
          })
        : [],
      manager.clubId ? advisorService.getFormalRivalry(manager.clubId).catch(() => null) : Promise.resolve(null),
    ]);
    const styleTags = [
      manager.personality,
      manager.mentality,
      prestige >= 75 ? 'Elite' : prestige >= 40 ? 'Consolidado' : 'Emergente',
    ].filter(Boolean);

    const seenMatches = viewerUserId != null && recentMatches.length > 0
      ? await prisma.matchSeen.findMany({
          where: { userId: viewerUserId, matchId: { in: recentMatches.map((m) => m.id) } },
          select: { matchId: true }
        }).then((res) => new Set(res.map((r) => r.matchId)))
      : new Set<number>();

    const form = recentMatches.map((match) => {
      // E15: ocultar resultado si el viewer es el mánager del club involucrado y aún no lo vio
      const hidden = viewerUserId != null
        ? shouldHideResult(
            { status: 'played', homeClubId: match.homeClubId, awayClubId: match.awayClubId, homeStatsJson: match.homeStatsJson },
            viewerClubId ?? null,
            viewerUserId,
            seenMatches.has(match.id)
          )
        : false;
      if (hidden) {
        return {
          matchId: match.id,
          result: null,
          goalsFor: null,
          goalsAgainst: null,
          resultHidden: true,
          opponent: (match.homeClubId === manager.clubId ? match.awayClub : match.homeClub),
          playedAt: match.playedAt,
          competition: match.matchday?.competition ?? null,
          matchdayNum: match.matchday?.number ?? null,
        };
      }
      const isHome = match.homeClubId === manager.clubId;
      const goalsFor = isHome ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
      const goalsAgainst = isHome ? match.awayGoals ?? 0 : match.homeGoals ?? 0;
      return {
        matchId: match.id,
        result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
        goalsFor,
        goalsAgainst,
        opponent: isHome ? match.awayClub : match.homeClub,
        playedAt: match.playedAt,
        competition: match.matchday?.competition ?? null,
        matchdayNum: match.matchday?.number ?? null,
      };
    });

    return {
      managerId: manager.id,
      name: manager.name,
      username: manager.user.username,
      nationality: manager.nationality,
      personality: manager.personality,
      mentality: manager.mentality,
      level: manager.level,
      reputation: manager.reputation,
      prestige,
      avatarUrl: `/api/public/avatar/${manager.id}`,
      joinedAt: manager.createdAt,
      club: manager.club,
      rivalry,
      record,
      form,
      styleTags,
      careerSummary: {
        stage: manager.level >= 20 ? 'leyenda' : manager.level >= 10 ? 'consolidado' : 'promesa',
        level: manager.level,
        prestige,
        clubReputation: manager.club?.reputation ?? null,
      },
      achievements: manager.achievements.map((achievement) => ({
        id: achievement.id,
        type: achievement.type,
        title: achievement.title,
        date: achievement.date,
        points: achievementPoints(achievement.type),
      })),
      recentPrestige,
      dm: { toManagerId: manager.id },
      uiNeed: '// NECESITO: Antigravity debe usar este contrato para ManagerLink modal + pagina publica.',
    };
  },

  async getManagerProfile(userId: number) {
    const manager = await prisma.manager.findFirst({
      where: { userId },
      include: {
        club: true,
      }
    });

    if (!manager) {
      throw new Error('Manager not found');
    }

    // AUDIT 3.7 / cross-request [C → A]: este es un GET y DEBE ser estrictamente de
    // solo-lectura. Antes creaba una fila `Prestige` y un `ManagerContract` "por
    // defecto" en cada llamada (crecimiento ilimitado de filas, mutación oculta tras
    // un GET). La fuente canónica de prestigio es la columna `manager.prestige`; el
    // contrato se devuelve tal cual exista (null si aún no hay). La creación de
    // contratos vive en el flujo de fichaje/rollover, no aquí.
    const currentPrestige = manager.prestige ?? 0;

    const currentContract = await prisma.managerContract.findFirst({
      where: { managerId: manager.id, clubId: manager.clubId || undefined },
      orderBy: { id: 'desc' }
    });

    return {
      manager,
      prestige: currentPrestige,
      contract: currentContract
    };
  },

  async getManagerCareer(userId: number) {
    const manager = await prisma.manager.findFirst({
      where: { userId },
      include: {
        skills: true,
        achievements: { orderBy: { date: 'desc' } },
        club: { select: { name: true, shortName: true, badge: true } },
      }
    });
    if (!manager) throw new Error('Manager not found');

    const prestige = await managerPrestige(manager.id);
    const rawSkills = manager.skills.map(s => s.nodeId);
    const canonicalSkills = [...new Set(rawSkills.map(canonicalCareerNodeId))];
    
    return {
      level: manager.level,
      xp: manager.xp,
      xpCurve: careerXpProgress(manager.level, manager.xp),
      skillPoints: careerSkillPointState(manager.level, rawSkills),
      skillTree: careerSkillTreeState(manager.level, rawSkills),
      reputation: manager.reputation,
      prestige,
      skills: [...new Set([...rawSkills, ...canonicalSkills])],
      rawSkills,
      canonicalSkills,
      skillEffects: aggregateSkillEffects(rawSkills),
      achievements: manager.achievements,
      currentClub: manager.club,
      uiNeed: '// NECESITO: Antigravity debe usar xpCurve/skillPoints/skillTree; el calculo local de XP y puntos queda obsoleto.',
    };
  },

  async unlockSkill(managerId: number, nodeId: string) {
    // AUDIT 3.6 (TOCTOU): leer + validar + crear dentro de UNA transacción, con un
    // lock FOR UPDATE de la fila del mánager para SERIALIZAR desbloqueos concurrentes
    // (antes dos peticiones podían validar contra el mismo set de nodos y gastar los
    // mismos puntos en nodos distintos). El @@unique([managerId, nodeId]) + el manejo
    // de P2002 cierran además el doble-click del mismo nodo.
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Manager" WHERE id = ${managerId} FOR UPDATE`;
      const manager = await tx.manager.findUnique({ where: { id: managerId }, include: { skills: true } });
      if (!manager) throw new Error('Manager not found');
      const currentNodeIds = manager.skills.map(skill => skill.nodeId);
      const unlock = validateCareerNodeUnlock(manager.level, currentNodeIds, nodeId);
      const skill = await tx.managerSkill.create({ data: { managerId, nodeId: unlock.nodeId } });
      return { skill, level: manager.level, nextNodeIds: [...currentNodeIds, unlock.nodeId] };
    }).catch((e: any) => {
      if (e?.code === 'P2002') throw new Error('Esa habilidad ya está desbloqueada.');
      throw e;
    });
    return {
      ok: true,
      skill: result.skill,
      effects: await effectsForManager(managerId),
      skillPoints: careerSkillPointState(result.level, result.nextNodeIds),
      skillTree: careerSkillTreeState(result.level, result.nextNodeIds),
    };
  },

  async getOffers(managerId: number) {
    // Fetch persisted JobOffers for this manager
    const offers = await prisma.managerOffer.findMany({
      where: { managerId, status: 'PENDING' },
      include: { club: { select: { id: true, name: true, budget: true, reputation: true } } }
    });

    return offers.map((offer) => ({
      offerId: offer.id,
      clubId: offer.clubId,
      club: offer.club,
      objective: contractObjective(offer.club as any),
      salary: offer.wage,
      years: 2,
      score: 10,
      status: 'offer',
      reason: 'El club te quiere como primera opción.',
      wage: offer.wage,
    }));
  },

  /**
   * CONTRATO Carril 2 (manual §3): ¿puede el mánager REGRESAR a un club que ya dirigió?
   * Jul-dic: sí. Ene-jun: solo si no ha dirigido esta temporada. "Haber jugado/dirigido"
   * se aproxima por tener un `ManagerContract` activo en la temporada en curso (cualquier
   * club que ya dirigió esta campaña).
   */
  async canReturn(managerId: number, clubId: number, inGameDate?: Date) {
    const date = inGameDate ?? await getInGameDate();
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { season: { select: { name: true } } },
    });
    const seasonName = state?.season?.name ?? await activeSeasonName();
    const contractsThisSeason = await prisma.managerContract.count({
      where: { managerId, season: seasonName },
    });
    const decision = returnWindowAllows(date, contractsThisSeason > 0);
    return { ...decision, clubId, seasonName };
  },

  async getVacancies(managerId: number) {
    const manager = await prisma.manager.findUnique({ where: { id: managerId } });
    if (!manager) return [];

    const prestige = manager.prestige;
    const freeClubs = await prisma.club.findMany({
      where: { manager: null },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        country: true,
        budget: true,
        reputation: true,
        stadiumName: true,
        stadiumCapacity: true,
        countryLevel: true,
        createdAt: true,
        vacancyOpenedAt: true,
      },
      orderBy: [{ country: 'asc' }, { reputation: 'desc' }, { name: 'asc' }],
      take: 120,
    });

    // Q6 (aditivo): estado de MI candidatura por club para que la UI muestre
    // "solicitud enviada / en lista corta" sin llamadas extra.
    const myApps = await prisma.managerApplication.findMany({
      where: { managerId, clubId: { in: freeClubs.map((c) => c.id) } },
      orderBy: { createdAt: 'desc' },
      select: { clubId: true, status: true, createdAt: true },
    });
    const latestAppByClub = new Map<number, { status: string; createdAt: Date }>();
    for (const app of myApps) {
      if (!latestAppByClub.has(app.clubId)) latestAppByClub.set(app.clubId, app);
    }

    return freeClubs.map((club) => ({
      ...serializeVacancy(club, prestige),
      myApplication: latestAppByClub.get(club.id) ?? null,
    }));
  },

  async getVacancyForClub(managerId: number, clubId: number) {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, prestige: true },
    });
    if (!manager) throw new Error('Mánager no encontrado.');

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        country: true,
        budget: true,
        reputation: true,
        stadiumName: true,
        stadiumCapacity: true,
        createdAt: true,
        vacancyOpenedAt: true,
        manager: { select: { id: true } },
      },
    });
    if (!club) throw new Error('Club no encontrado.');
    if (club.manager && club.manager.id !== managerId) throw new Error('El club ya tiene mánager.');

    return serializeVacancy(club, manager.prestige);
  },

  async evaluateVacanciesForClubs(managerId: number, clubIds: number[]) {
    const uniqueIds = [...new Set(clubIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
    if (uniqueIds.length === 0) return new Map<number, ReturnType<typeof serializeVacancy>>();

    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, prestige: true },
    });
    if (!manager) throw new Error('Mánager no encontrado.');

    const clubs = await prisma.club.findMany({
      where: { id: { in: uniqueIds }, manager: null, isUserClub: false },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        country: true,
        budget: true,
        reputation: true,
        stadiumName: true,
        stadiumCapacity: true,
        createdAt: true,
        vacancyOpenedAt: true,
      },
    });

    return new Map(clubs.map((club) => [club.id, serializeVacancy(club, manager.prestige)]));
  },

  async getClubsSeekingManager(managerId: number) {
    const vacancies = await this.getVacancies(managerId);
    return vacancies.map((vacancy) => ({
      ...vacancy,
      seekingManager: true,
      urgency: vacancyUrgency(vacancy.daysVacant),
      pitch: vacancy.status === 'offer'
        ? `${vacancy.club.name} te considera primera opción para su banquillo.`
        : vacancy.status === 'apply'
          ? `${vacancy.club.name} acepta candidaturas de mánagers con tu prestigio.`
          : `${vacancy.club.name} busca mánager, pero exige más prestigio.`,
    }));
  },

  async applyToSeekingClub(managerId: number, clubId: number) {
    return this.applyToVacancy(managerId, clubId);
  },

  /**
   * Q6 (BLOQUE Q): contratación REAL compartida por acceptOffer y por el camino
   * "offer" de applyToVacancy. Transaccional: libera el club anterior, asigna el
   * nuevo, crea el contrato y (si existe) marca la ManagerOffer como aceptada.
   */
  async hireManagerAtClub(managerId: number, clubId: number, offerId?: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { manager: { select: { id: true } } },
    });
    if (!club) throw new Error('El club ya no existe.');
    if (club.manager && club.manager.id !== managerId) throw new Error('La vacante ya está ocupada.');

    const manager = await prisma.manager.findUnique({ where: { id: managerId } });
    if (!manager) throw new Error('Mánager no encontrado.');
    if (manager.clubId === clubId) throw new Error('Ya diriges este club.');

    const season = await activeSeasonName();
    // AUDIT 5.6: sello de incorporación del mánager al club, para acotar su balance
    // (`currentClubRecord`) a los partidos disputados desde que llegó.
    const joinedAt = await getInGameDate();

    await prisma.$transaction(async (tx) => {
      // AUDIT 3.6 (TOCTOU): el chequeo de ocupación (L993) vive fuera de la tx, así
      // que dos mánagers podían pasarlo y reclamar la MISMA vacante. La reclamación
      // se hace ahora ATÓMICA y condicional: updateMany sobre `isUserClub: false`
      // sólo casa para el primero; el segundo obtiene count 0 y se rechaza.
      const claimed = await tx.club.updateMany({
        where: { id: club.id, isUserClub: false },
        data: { isUserClub: true, vacancyOpenedAt: null },
      });
      if (claimed.count !== 1) throw new Error('La vacante ya está ocupada.');
      if (manager.clubId) {
        await tx.club.update({ where: { id: manager.clubId }, data: { isUserClub: false, vacancyOpenedAt: new Date() } });
      }
      await tx.manager.update({ where: { id: managerId }, data: { club: { connect: { id: club.id } }, objectiveStatus: 'Pending', clubJoinedAt: joinedAt } });
      await tx.managerContract.create({
        data: {
          managerId,
          clubId: club.id,
          objective: contractObjective(club),
          season,
        },
      });
      if (offerId) {
        await tx.managerOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
      }
      // Cerrar mis otras candidaturas pendientes: ya tengo banquillo.
      await tx.managerApplication.updateMany({
        where: { managerId, status: { in: ['PENDING', 'SHORTLISTED'] } },
        data: { status: 'REJECTED' },
      });
    });

    if (!club.manager) {
      await npcCoachService.releaseOnHumanHire(club.id, club.name);
    }

    return { ok: true, clubId: club.id, clubName: club.name, objective: contractObjective(club), season };
  },

  async acceptOffer(managerId: number, offerId: number) {
    const offerRecord = await prisma.managerOffer.findFirst({
      where: { id: offerId, managerId, status: 'PENDING' },
      include: { club: { include: { manager: { select: { id: true } } } } }
    });
    if (!offerRecord) throw new Error('Oferta no encontrada o ya procesada.');
    if (offerRecord.club.manager) throw new Error('La vacante ya está ocupada.');
    return this.hireManagerAtClub(managerId, offerRecord.clubId, offerId);
  },

  async rejectOffer(managerId: number, offerId: number) {
    const offerRecord = await prisma.managerOffer.findFirst({
      where: { id: offerId, managerId, status: 'PENDING' },
      include: { club: true }
    });
    if (!offerRecord) throw new Error('Offer not found or already processed');

    await prisma.managerOffer.update({
      where: { id: offerId },
      data: { status: 'REJECTED' }
    });

    return { ok: true, managerId, offerId, status: 'rejected', message: `Oferta de ${offerRecord.club.name} rechazada.` };
  },

  async applyToVacancy(managerId: number, vacancyId: number) {
    const vacancy = (await this.getVacancies(managerId)).find((row) => row.id === vacancyId);
    if (!vacancy) throw new Error('Vacante no encontrada.');
    if (vacancy.status === 'locked') throw new Error(vacancy.reason);

    if (vacancy.status === 'offer') {
      // Q6 (BUG RAÍZ): aquí se llamaba a acceptOffer(managerId, vacancyId)
      // pasando el ID DEL CLUB como id de ManagerOffer → "Offer not found"
      // SIEMPRE que tu prestigio daba para el club. Ahora: si existe una
      // ManagerOffer pendiente para ese club se acepta; si no, contratación
      // directa (el club te quiere como primera opción).
      const pendingOffer = await prisma.managerOffer.findFirst({
        where: { managerId, clubId: vacancy.clubId, status: 'PENDING' },
        select: { id: true },
      });
      const accepted = pendingOffer
        ? await this.acceptOffer(managerId, pendingOffer.id)
        : await this.hireManagerAtClub(managerId, vacancy.clubId);
      return { ...accepted, applicationStatus: 'accepted' };
    }

    // Q6: candidatura idempotente — no duplicar solicitudes vivas al mismo club.
    const existingApp = await prisma.managerApplication.findFirst({
      where: { managerId, clubId: vacancy.clubId, status: { in: ['PENDING', 'SHORTLISTED'] } },
    });
    if (existingApp) {
      return {
        ok: true,
        vacancyId,
        clubId: vacancy.clubId,
        applicationStatus: existingApp.status,
        message: 'Ya tienes una candidatura viva para este club: se resolverá en el próximo turno por orden de prestigio.',
      };
    }

    const appStatus = vacancy.score >= 0 ? 'SHORTLISTED' : 'PENDING';

    await prisma.managerApplication.create({
      data: {
        managerId,
        clubId: vacancy.clubId,
        status: appStatus
      }
    });

    return {
      ok: true,
      vacancyId,
      clubId: vacancy.clubId,
      applicationStatus: appStatus,
      message: vacancy.score >= 0
        ? 'Tu candidatura ha entrado en la lista corta de la directiva.'
        : 'Candidatura enviada. La directiva necesita más garantías.',
    };
  },

  async setVacation(managerId: number, active?: boolean) {
    const state = await vacationService.setState(managerId, active);
    const log = await vacationService.getDecisionLog(managerId, 10);
    return { ok: true, vacation: state, decisions: log };
  },
};
