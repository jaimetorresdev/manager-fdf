// ─── Training Service FDF ─────────────────────────────────────────────────────
// 6 jugadores por entrenador y turno; 5 tipos (táctica, portero, defensa,
// medio, delantero) + rehabilitación; forma objetivo 86–90%; jugadas entrenadas:
// desarrollar=20 turnos, entrenar=15 turnos, nivel 1–15, máx 50 por entrenador.

import prisma from '../../db/prisma';
import { canonicalPlayerOverall } from '../players/detailedPositions';
import {
  makeRng,
  TrainingType,
  TRAINING_TYPE_STATS,
  COACH_CATEGORY_STATS,
  PLAY_DEVELOP_TURNS,
  PLAY_TRAIN_TURNS,
  PLAY_MAX_LEVEL,
  PLAYS_PER_COACH_MAX,
  nextPlayerForm,
  trainingChance,
  trainingPenalty,
  selectStatToImprove,
  advanceTrainedPlay,
  applyTrainingTurn,
} from '../game/tick.logic';
import {
  ACTIVE_MATCH_PLAY_MAX,
  normalizeTrainedPlayType,
} from './playbook.rules';
import { effectsForClub } from '../manager/skillEffects';
import { lockClubRow } from '../market/transfer.core';
import {
  MAX_SPECIAL_TRAINING_USES_PER_SEASON,
  canActivateSpecialTraining,
} from './training.controls';
import {
  resolveProgressionValue,
  type ProgressionField,
} from '../game/playerProgression.rules';
import {
  nextYouthTrainingValue,
  youthCoachSuccessThreshold,
  type YouthTrainingGroup,
} from './youthTraining.rules';

// Re-export for routes
export type { TrainingType };
export { TRAINING_TYPE_STATS, COACH_CATEGORY_STATS };
export { ACTIVE_MATCH_PLAY_MAX, FDF_PLAY_TYPES, TRAINED_PLAY_TYPES } from './playbook.rules';

/** Categorías de entrenador disponibles en FDF. */
export const COACH_CATEGORIES = ['GK', 'DEF', 'MID', 'ATT', 'TAC'] as const;
export type CoachCategory = typeof COACH_CATEGORIES[number];
export const COACH_ROLES = ['FIRST_TEAM', 'YOUTH', 'TECHNICAL'] as const;
export type CoachRole = typeof COACH_ROLES[number];

/**
 * Tope de progresión por entrenamiento. Un atributo sube como mucho +1, nunca
 * por encima del `potential` del jugador (techo de "media máxima alcanzable"),
 * y nunca por debajo de su valor actual (un potencial inferior al valor ya
 * alcanzado no debe degradar la estadística). Antes se usaba `min(99, val+1)`,
 * que ignoraba el potencial y permitía subir cualquier atributo hasta 99.
 */
export function cappedTrainingValue(
  currentVal: number,
  player: { age: number; potential: number },
  stat: ProgressionField,
): number {
  return resolveProgressionValue(currentVal, 1, stat, player);
}

/** Tipos de entrenamiento disponibles. */
export const TRAINING_TYPES: TrainingType[] = [
  'táctica', 'portero', 'defensa', 'medio', 'delantero', 'rehabilitación',
];

export interface TrainingSessionInput {
  coachId: number;
  trainingType: TrainingType;
  playerIds: number[]; // máx 6
}

export interface TrainingSessionResult {
  coachId: number;
  trainingType: TrainingType;
  results: Array<{
    playerId: number;
    playerName: string;
    improved: boolean;
    statImproved?: string;
    delta?: number;
    newFitness: number;
    isRehab: boolean;
  }>;
}

function parseAssignedPlayers(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0);
  } catch {
    return [];
  }
}

export const trainingService = {
  async getTrainingControl(clubId: number) {
    const [club, state] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { trainingClosedUntilTurn: true, trainingClosedUses: true, homeStimulatedUntilTurn: true, homeStimulatedUses: true },
      }),
      prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } }),
    ]);
    if (!club) throw new Error('Club not found');
    const turn = state?.turn ?? 0;
    return {
      turn,
      trainingClosedUntilTurn: club.trainingClosedUntilTurn,
      trainingClosedUses: club.trainingClosedUses,
      homeStimulatedUntilTurn: club.homeStimulatedUntilTurn,
      homeStimulatedUses: club.homeStimulatedUses,
      trainingClosedActive: (club.trainingClosedUntilTurn ?? 0) >= turn,
      homeStimulatedActive: (club.homeStimulatedUntilTurn ?? 0) >= turn,
      uiNeed: '// NECESITO: Antigravity debe añadir controles de cierre/discurso en TrainingPage o Dashboard.',
    };
  },

  async setTrainingClosed(clubId: number) {
    const [club, state] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { trainingClosedUses: true, trainingClosedUntilTurn: true },
      }),
      prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } }),
    ]);
    if (!club) throw new Error('Club not found');
    const turn = state?.turn ?? 0;
    if (!canActivateSpecialTraining(turn, club.trainingClosedUntilTurn, club.trainingClosedUses)) {
      throw new Error(
        club.trainingClosedUses >= MAX_SPECIAL_TRAINING_USES_PER_SEASON
          ? 'Has agotado los cierres de entrenamiento de esta temporada.'
          : 'El entrenamiento ya está cerrado durante estos turnos.',
      );
    }
    const targetTurn = turn + 3;
    const claim = await prisma.club.updateMany({
      where: {
        id: clubId,
        trainingClosedUses: { lt: MAX_SPECIAL_TRAINING_USES_PER_SEASON },
        OR: [{ trainingClosedUntilTurn: null }, { trainingClosedUntilTurn: { lt: turn } }],
      },
      data: { trainingClosedUntilTurn: targetTurn, trainingClosedUses: { increment: 1 } },
    });
    if (claim.count === 0) throw new Error('El cierre de entrenamiento ya fue activado.');
    if (club.trainingClosedUses >= 2) {
      await prisma.boardConfidence.updateMany({ where: { clubId }, data: { level: { decrement: 1 } } });
    }
    const updated = await prisma.club.findUniqueOrThrow({ where: { id: clubId } });
    return { ok: true, trainingClosedUntilTurn: updated.trainingClosedUntilTurn, trainingClosedUses: updated.trainingClosedUses };
  },

  async setHomeStimulated(clubId: number) {
    const [club, state] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { homeStimulatedUses: true, homeStimulatedUntilTurn: true },
      }),
      prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } }),
    ]);
    if (!club) throw new Error('Club not found');
    const turn = state?.turn ?? 0;
    if (!canActivateSpecialTraining(turn, club.homeStimulatedUntilTurn, club.homeStimulatedUses)) {
      throw new Error(
        club.homeStimulatedUses >= MAX_SPECIAL_TRAINING_USES_PER_SEASON
          ? 'Has agotado los discursos de estimulación de esta temporada.'
          : 'El equipo ya está estimulado durante estos turnos.',
      );
    }
    const targetTurn = turn + 2;
    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.club.updateMany({
        where: {
          id: clubId,
          homeStimulatedUses: { lt: MAX_SPECIAL_TRAINING_USES_PER_SEASON },
          OR: [{ homeStimulatedUntilTurn: null }, { homeStimulatedUntilTurn: { lt: turn } }],
        },
        data: { homeStimulatedUntilTurn: targetTurn, homeStimulatedUses: { increment: 1 } },
      });
      if (claim.count === 0) throw new Error('El discurso de estimulación ya fue activado.');
      if (club.homeStimulatedUses >= 2) {
        await tx.$executeRaw`
          UPDATE "BoardConfidence"
          SET level = GREATEST(0, level - 1)
          WHERE "clubId" = ${clubId}
        `;
      }
      await tx.player.updateMany({
        where: { clubId },
        data: { motivatedUntilTurn: targetTurn },
      });
      return tx.club.findUniqueOrThrow({ where: { id: clubId } });
    });
    return { ok: true, homeStimulatedUntilTurn: updated.homeStimulatedUntilTurn, homeStimulatedUses: updated.homeStimulatedUses };
  },
  async getCoaches(clubId: number) {
    const coaches = await prisma.coach.findMany({ where: { clubId } });
    const allPlayers = await prisma.player.findMany({ where: { clubId } });

    return coaches.map(coach => {
      const playerIds = parseAssignedPlayers(coach.assignedPlayers);

      const players = allPlayers
        .filter(p => playerIds.includes(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          position: p.position,
          fitness: p.fitness,
          overall: canonicalPlayerOverall(p),
        }));

      return { ...coach, players };
    });
  },

  async hireCoach(clubId: number, category: string, level: number, role: CoachRole = 'FIRST_TEAM') {
    if (!COACH_CATEGORIES.includes(category as CoachCategory)) {
      throw new Error(`Categoría inválida. Permitidas: ${COACH_CATEGORIES.join(', ')}`);
    }
    if (!COACH_ROLES.includes(role)) {
      throw new Error(`Rol inválido. Permitidos: ${COACH_ROLES.join(', ')}`);
    }
    if (level < 1 || level > 10) throw new Error('Nivel del entrenador debe estar entre 1 y 10');
    // F3 (QA Jaime): tope de plantilla técnica — máximo 6 entrenadores por club.
    const current = await prisma.coach.count({ where: { clubId } });
    if (current >= 6) {
      throw new Error('Plantilla técnica completa: máximo 6 entrenadores. Despide a uno para contratar otro.');
    }
    // Coste proporcional al nivel
    const salary = level * 2000;
    const signingFee = salary * 2;

    return prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const currentInTx = await tx.coach.count({ where: { clubId } });
      if (currentInTx >= 6) {
        throw new Error('Plantilla técnica completa: máximo 6 entrenadores. Despide a uno para contratar otro.');
      }
      const assignedRole: CoachRole = currentInTx === 0 ? 'YOUTH' : role;
      if (assignedRole === 'YOUTH') {
        const existingYouthCoach = await tx.coach.count({ where: { clubId, role: 'YOUTH' } });
        if (existingYouthCoach > 0) throw new Error('El club ya tiene entrenador juvenil.');
      }
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: signingFee } },
        data: { budget: { decrement: signingFee }, cash: { decrement: signingFee } },
      });
      if (charged.count === 0) throw new Error(`Presupuesto insuficiente para pagar el fee (${signingFee} €).`);
      return tx.coach.create({
        data: {
          clubId,
          category,
          level,
          salary,
          role: assignedRole,
          assignedPlayers: '[]',
        },
      });
    });
  },

  async fireCoach(clubId: number, coachId: number) {
    const coach = await prisma.coach.findFirst({ where: { id: coachId, clubId } });
    if (!coach) throw new Error('Coach not found');
    return prisma.coach.delete({ where: { id: coachId } });
  },

  async assignPlayers(clubId: number, coachId: number, playerIds: number[]) {
    if (playerIds.length > 6) {
      throw new Error('Un entrenador solo puede tener 6 jugadores asignados como máximo');
    }

    const coach = await prisma.coach.findFirst({ where: { id: coachId, clubId } });
    if (!coach) throw new Error('Coach not found');

    if (playerIds.length > 0) {
      const players = await prisma.player.findMany({ where: { id: { in: playerIds }, clubId } });
      if (players.length !== playerIds.length) {
        throw new Error('Algunos jugadores no pertenecen a tu club');
      }
    }

    return prisma.coach.update({
      where: { id: coachId },
      data: { assignedPlayers: JSON.stringify(playerIds) },
    });
  },

  /**
   * Ejecuta una sesión de entrenamiento manual para un entrenador.
   * Aplica la mejora de habilidad y la forma según el tipo elegido.
   */
  async runTrainingSession(
    clubId: number,
    input: TrainingSessionInput,
  ): Promise<TrainingSessionResult> {
    const coach = await prisma.coach.findFirst({
      where: { id: input.coachId, clubId },
    });
    if (!coach) throw new Error('Entrenador no encontrado');
    if (input.playerIds.length > 6) {
      throw new Error('Máximo 6 jugadores por sesión de entrenamiento');
    }

    const players = await prisma.player.findMany({
      where: { id: { in: input.playerIds }, clubId },
      include: { injuries: { where: { weeksLeft: { gt: 0 } } } },
    });
    if (players.length !== input.playerIds.length) {
      throw new Error('Algunos jugadores no pertenecen a tu club');
    }
    if (players.some(player => player.squadNumber == null)) {
      throw new Error('Un jugador sin dorsal/ficha no puede entrenar.');
    }

    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } });
    const turn = state?.turn ?? 0;
    await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const markerType = `manual:${coach.id}`;
      const existing = await tx.trainingSession.findFirst({
        where: { turnId: turn, clubId, type: markerType },
        select: { id: true },
      });
      if (existing) throw new Error('Este entrenador ya hizo una sesión manual en este turno.');
      await tx.trainingSession.create({
        data: {
          turnId: turn,
          clubId,
          type: markerType,
          playerIds: JSON.stringify(input.playerIds),
        },
      });
    });

    const rng = makeRng(turn * 4177 + clubId * 31 + coach.id);
    const results: TrainingSessionResult['results'] = [];

    for (const player of players) {
      const isInjured = player.injuries.length > 0;
      const trainingResult = applyTrainingTurn(
        {
          id: player.id,
          age: player.age,
          talent: player.talent,
          fitness: player.fitness,
          isInjured,
          passing: player.passing,
          tackling: player.tackling,
          shooting: player.shooting,
          organization: player.organization,
          unmarking: player.unmarking,
          finishing: player.finishing,
          dribbling: player.dribbling,
          goalkeeping: player.goalkeeping,
        },
        input.trainingType,
        coach.level,
        rng(),
        rng(),
        rng(),
        coach.category,
      );

      // Persistir cambios
      const updates: Record<string, unknown> = { fitness: trainingResult.newFitness };

      if (trainingResult.improved && trainingResult.statImproved) {
        const stat = trainingResult.statImproved as keyof typeof player;
        const currentVal = player[stat] as number;
        const newVal = cappedTrainingValue(currentVal, player, String(stat) as ProgressionField);
        updates[stat] = newVal;
        trainingResult.improved = newVal > currentVal;
      }

      await prisma.player.update({ where: { id: player.id }, data: updates });

      results.push({
        playerId: player.id,
        playerName: player.name,
        improved: trainingResult.improved,
        statImproved: trainingResult.statImproved,
        delta: trainingResult.improved ? 1 : 0,
        newFitness: trainingResult.newFitness,
        isRehab: trainingResult.isRehab,
      });
    }

    return {
      coachId: coach.id,
      trainingType: input.trainingType,
      results,
    };
  },

  /**
   * Procesa el entrenamiento automático del tick para todos los entrenadores del club.
   * Usa sus jugadores asignados y el tipo de entrenamiento por defecto de su categoría.
   * Es llamado por stepTrainings() en game.service.ts.
   */
  async processTickTrainings(clubId: number, rng: () => number): Promise<number> {
    const coaches = await prisma.coach.findMany({ where: { clubId, role: { not: 'YOUTH' } } });
    let improvedCount = 0;

    for (const coach of coaches) {
      const playerIds = parseAssignedPlayers(coach.assignedPlayers);

      if (playerIds.length === 0) continue;

      const defaultType = categoryToTrainingType(coach.category);

      const players = await prisma.player.findMany({
        where: { id: { in: playerIds.slice(0, 6) }, clubId, squadNumber: { not: null } },
        include: { injuries: { where: { weeksLeft: { gt: 0 } } } },
      });

      for (const player of players) {
        const isInjured = player.injuries.length > 0;
        const trainingResult = applyTrainingTurn(
          { id: player.id, age: player.age, talent: player.talent, fitness: player.fitness, isInjured },
          defaultType, coach.level, rng(), rng(), rng(), coach.category
        );

        const updates: Record<string, unknown> = { fitness: trainingResult.newFitness };

        if (trainingResult.improved && trainingResult.statImproved) {
          const stat = trainingResult.statImproved as keyof typeof player;
          const currentVal = (player as Record<string, unknown>)[stat];
          if (typeof currentVal === 'number') {
            const newVal = cappedTrainingValue(currentVal, player, String(stat) as ProgressionField);
            if (newVal > currentVal) {
              updates[stat] = newVal;
              improvedCount++;
            }
          }
        }
        await prisma.player.update({ where: { id: player.id }, data: updates });
      }
    }

    return improvedCount;
  },

  async processYouthTrainings(clubId: number, rng: () => number): Promise<number> {
    const coach = await prisma.coach.findFirst({
      where: { clubId, role: 'YOUTH' },
      orderBy: [{ level: 'desc' }, { id: 'asc' }],
    });
    if (!coach) return 0;

    const academy = await prisma.youthAcademy.findUnique({
      where: { clubId },
      include: { youthPlayers: { orderBy: { id: 'asc' }, take: 6 } },
    });
    if (!academy) return 0;

    const plans: Record<CoachCategory, { group: YouthTrainingGroup; attributes: string[] }> = {
      GK: { group: 'goalkeeping', attributes: ['goalkeeping', 'reflexes'] },
      DEF: { group: 'defense', attributes: ['tackling', 'organization'] },
      MID: { group: 'midfield', attributes: ['passing', 'organization', 'unmarking'] },
      ATT: { group: 'attack', attributes: ['shooting', 'finishing', 'dribbling'] },
      TAC: { group: 'experience', attributes: ['experience'] },
    };
    const plan = plans[(COACH_CATEGORIES.includes(coach.category as CoachCategory)
      ? coach.category
      : 'TAC') as CoachCategory];
    const threshold = youthCoachSuccessThreshold(coach.level, plan.group);
    let improved = 0;

    for (const youth of academy.youthPlayers) {
      let attributes: Record<string, unknown>;
      try {
        const parsed = JSON.parse(youth.attributes);
        attributes = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        attributes = {};
      }
      const attribute = plan.attributes[Math.floor(rng() * plan.attributes.length)]!;
      const current = Number(attributes[attribute]) || 1;
      const roll = Math.floor(rng() * 100);
      const next = nextYouthTrainingValue(current, youth.potential, roll, threshold);
      if (next <= current) continue;
      attributes[attribute] = next;
      await prisma.youthPlayer.update({
        where: { id: youth.id },
        data: { attributes: JSON.stringify(attributes) },
      });
      improved++;
    }
    return improved;
  },

  // ─── Jugadas Entrenadas ────────────────────────────────────────────────────

  async getTrainedPlays(clubId: number) {
    return prisma.trainedPlay.findMany({ where: { clubId }, orderBy: { id: 'asc' } });
  },

  async createTrainedPlay(clubId: number, type: string) {
    const playType = normalizeTrainedPlayType(type);
    const developing = await prisma.trainedPlay.findFirst({ where: { clubId, status: 'developing' } });
    if (developing) throw new Error('Ya tienes una jugada en desarrollo');

    // Verificar que no superamos el máximo
    const existing = await prisma.trainedPlay.count({ where: { clubId } });
    if (existing >= PLAYS_PER_COACH_MAX) {
      throw new Error(`Máximo ${PLAYS_PER_COACH_MAX} jugadas por club`);
    }
    return prisma.trainedPlay.create({
      data: {
        clubId,
        type: playType,
        level: 1,
        progress: 0,
        status: 'developing',
        isActive: false,
      },
    });
  },

  async activateTrainedPlay(clubId: number, playId: number) {
    const play = await prisma.trainedPlay.findFirst({ where: { id: playId, clubId } });
    if (!play) throw new Error('Jugada no encontrada');
    if (play.status === 'developing') throw new Error('La jugada aún está en desarrollo');
    if (!play.isActive) {
      const effects = await effectsForClub(clubId);
      const activeLimit = ACTIVE_MATCH_PLAY_MAX + effects.trainedPlayLimitBonus;
      const activeCount = await prisma.trainedPlay.count({ where: { clubId, isActive: true } });
      if (activeCount >= activeLimit) {
        throw new Error(`Solo puedes activar ${activeLimit} jugadas entrenadas para partido`);
      }
    }
    return prisma.trainedPlay.update({
      where: { id: playId },
      data: { isActive: true, status: 'trainable' },
    });
  },

  async setTrainedPlayExecutors(clubId: number, playId: number, playerIds: number[]) {
    const uniqueIds = [...new Set(playerIds)];
    if (uniqueIds.length !== 3) throw new Error('Una jugada entrenada requiere exactamente 3 ejecutores distintos');
    const [play, players] = await Promise.all([
      prisma.trainedPlay.findFirst({ where: { id: playId, clubId } }),
      prisma.player.findMany({ where: { clubId, id: { in: uniqueIds } }, select: { id: true } }),
    ]);
    if (!play) throw new Error('Jugada no encontrada');
    if (players.length !== 3) throw new Error('Todos los ejecutores deben pertenecer al club');
    return prisma.trainedPlay.update({
      where: { id: playId },
      data: { executorPlayerIds: JSON.stringify(uniqueIds) },
    });
  },

  /**
   * Avanza el progreso de todas las jugadas en desarrollo del club.
   * Llamado por el tick.
   */
  async advanceTrainedPlays(clubId: number, rng: () => number): Promise<number> {
    const plays = await prisma.trainedPlay.findMany({
      where: { clubId, status: { not: 'maxed' } },
    });
    // Buscar entrenador táctico o el de mayor nivel
    const coaches = await prisma.coach.findMany({ where: { clubId } });
    const bestCoach = coaches.sort((a, b) => b.level - a.level)[0];
    const coachLevel = bestCoach?.level ?? 1;

    let advanced = 0;
    await Promise.all(plays.map(async (play) => {
      const next = advanceTrainedPlay(
        { level: play.level, progress: play.progress, status: play.status as 'developing' | 'trainable' | 'maxed' },
        coachLevel,
        rng(),
      );
      if (next.level !== play.level || next.progress !== play.progress || next.status !== play.status) {
        await prisma.trainedPlay.update({
          where: { id: play.id },
          data: { level: next.level, progress: next.progress, status: next.status },
        });
        advanced++;
      }
    }));
    return advanced;
  },
};

/** Mapea categoría de entrenador al tipo de entrenamiento por defecto. */
function categoryToTrainingType(category: string): TrainingType {
  const map: Record<string, TrainingType> = {
    GK: 'portero',
    DEF: 'defensa',
    MID: 'medio',
    ATT: 'delantero',
    TAC: 'táctica',
  };
  return map[category] ?? 'táctica';
}

// ─── Constantes re-exportadas para las rutas ──────────────────────────────────
export {
  PLAY_DEVELOP_TURNS,
  PLAY_TRAIN_TURNS,
  PLAY_MAX_LEVEL,
  PLAYS_PER_COACH_MAX,
  makeRng,
  nextPlayerForm,
  trainingChance,
  trainingPenalty,
  selectStatToImprove,
  advanceTrainedPlay,
  applyTrainingTurn,
};
