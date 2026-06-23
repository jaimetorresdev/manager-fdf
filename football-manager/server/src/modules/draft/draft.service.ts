import prisma from '../../db/prisma';
import { nextDraftPosition } from './draftOrder';

// Draft(id, seasonId, status, currentRound, currentPick, startsAt?)
// DraftPick(id, draftId, round, pickNumber, clubId, playerId?, createdAt)

type PrismaRuntime = typeof prisma & {
  draft?: any;
  draftPick?: any;
};

const db = prisma as PrismaRuntime;

async function fallbackDraftState() {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    include: { season: true },
  });

  const standings = await prisma.standing.findMany({
    where: {
      competition: {
        type: 'league',
        ...(state?.seasonId ? { seasonId: state.seasonId } : {}),
      },
    },
    include: {
      club: { select: { id: true, name: true, shortName: true, badge: true } },
      competition: { select: { id: true, name: true, tier: true } },
    },
    orderBy: [{ competitionId: 'asc' }, { points: 'asc' }, { goalsFor: 'asc' }],
    take: 80,
  });

  return {
    status: 'inactive',
    season: state?.season ? { id: state.season.id, name: state.season.name } : null,
    currentRound: 0,
    currentPick: 0,
    order: standings.map((standing, index) => ({
      pickNumber: index + 1,
      club: standing.club,
      competition: standing.competition,
      basis: 'inverse_standings_fallback',
    })),
    picks: [],
  };
}

export const draftService = {
  async getDraftState() {
    if (!db.draft || !db.draftPick) return fallbackDraftState();

    const draft = await db.draft.findFirst({
      orderBy: { id: 'desc' },
    });
    if (!draft) return fallbackDraftState();

    const picks = await db.draftPick.findMany({
      where: { draftId: draft.id },
      include: {
        club: { select: { id: true, name: true, shortName: true, badge: true } },
        player: { select: { id: true, name: true, position: true, age: true, potential: true } },
      },
      orderBy: [{ round: 'asc' }, { pickNumber: 'asc' }],
    });

    return {
      status: draft.status,
      seasonId: draft.seasonId,
      currentRound: draft.currentRound,
      currentPick: draft.currentPick,
      startsAt: draft.startsAt ?? null,
      order: picks.map((pick: any) => ({
        round: pick.round,
        pickNumber: pick.pickNumber,
        club: pick.club,
      })),
      picks,
    };
  },

  /**
   * AUDIT H-26: crea el orden del draft a partir de la clasificación inversa (peor
   * clasificado elige primero), con `rounds` rondas. Idempotente por temporada:
   * si ya hay un draft `active`/`pending` para la temporada activa no recrea.
   * Pensado para disparo administrativo / inicio de temporada.
   */
  async startDraft(rounds = 1) {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { seasonId: true },
    });
    if (!state?.seasonId) throw new Error('No hay temporada activa');

    const existing = await prisma.draft.findFirst({
      where: { seasonId: state.seasonId, status: { in: ['pending', 'active'] } },
    });
    if (existing) throw new Error('Ya hay un draft en curso para esta temporada');

    const standings = await prisma.standing.findMany({
      where: { competition: { type: 'league', seasonId: state.seasonId } },
      include: { club: { select: { id: true } } },
      orderBy: [{ competitionId: 'asc' }, { points: 'asc' }, { goalsFor: 'asc' }],
    });
    const order = standings.map((s) => s.club.id);
    if (order.length === 0) throw new Error('No hay clasificación para ordenar el draft');

    return prisma.$transaction(async (tx) => {
      const draft = await tx.draft.create({
        data: { seasonId: state.seasonId!, status: 'active', currentRound: 1, currentPick: 1 },
      });
      const picks = [];
      for (let round = 1; round <= rounds; round++) {
        for (let i = 0; i < order.length; i++) {
          picks.push({ draftId: draft.id, round, pickNumber: i + 1, clubId: order[i] });
        }
      }
      await tx.draftPick.createMany({ data: picks });
      return { draftId: draft.id, rounds, picksPerRound: order.length };
    });
  },

  /**
   * AUDIT H-26: realiza una selección. Valida el TURNO (el pick actual debe
   * pertenecer al club), que el jugador sea elegible (agente libre no seleccionado)
   * y AVANZA el turno de forma atómica. Todas las escrituras usan claims condicionales
   * (`updateMany ... where: { ...estado_esperado }`) para que dos peticiones
   * concurrentes no puedan elegir el mismo pick ni avanzar dos veces.
   */
  async makePick(clubId: number, playerId: number) {
    return prisma.$transaction(async (tx) => {
      const draft = await tx.draft.findFirst({
        where: { status: 'active' },
        orderBy: { id: 'desc' },
      });
      if (!draft) throw new Error('No hay un draft activo');

      const allPicks = await tx.draftPick.findMany({ where: { draftId: draft.id } });
      const picksPerRound = Math.max(...allPicks.map((p) => p.pickNumber));
      const totalRounds = Math.max(...allPicks.map((p) => p.round));

      const current = allPicks.find(
        (p) => p.round === draft.currentRound && p.pickNumber === draft.currentPick,
      );
      if (!current) throw new Error('El draft no tiene un pick válido en la posición actual');

      // Validación de TURNO: el pick actual debe ser del club que llama.
      if (current.clubId !== clubId) {
        throw new Error('No es tu turno de selección en el draft');
      }
      if (current.playerId != null) {
        throw new Error('Este pick ya fue usado');
      }

      // Elegibilidad: agente libre (sin club) y no seleccionado ya en este draft.
      const player = await tx.player.findFirst({
        where: { id: playerId, clubId: null },
        select: { id: true },
      });
      if (!player) throw new Error('El jugador no es elegible (debe ser agente libre)');
      const already = await tx.draftPick.findFirst({
        where: { draftId: draft.id, playerId },
        select: { id: true },
      });
      if (already) throw new Error('Ese jugador ya fue seleccionado en este draft');

      // 1) Reclamar el pick (atómico: solo si sigue sin jugador).
      const claimedPick = await tx.draftPick.updateMany({
        where: { id: current.id, playerId: null },
        data: { playerId },
      });
      if (claimedPick.count !== 1) throw new Error('El pick acaba de ser usado');

      // 2) Asignar el jugador al club (atómico: solo si sigue libre).
      const claimedPlayer = await tx.player.updateMany({
        where: { id: playerId, clubId: null },
        data: { clubId },
      });
      if (claimedPlayer.count !== 1) throw new Error('El jugador acaba de ser fichado');

      // 3) Avanzar el turno (atómico: solo si seguimos en la posición esperada).
      const next = nextDraftPosition(draft.currentRound, draft.currentPick, picksPerRound, totalRounds);
      const advanced = await tx.draft.updateMany({
        where: { id: draft.id, currentRound: draft.currentRound, currentPick: draft.currentPick },
        data: { currentRound: next.round, currentPick: next.pick, status: next.status },
      });
      if (advanced.count !== 1) throw new Error('El turno del draft ya avanzó');

      return { pickId: current.id, playerId, clubId, next };
    });
  },
};
