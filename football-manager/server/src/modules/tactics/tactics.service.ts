import prisma from '../../db/prisma';
import { ACTIVE_MATCH_PLAY_MAX, normalizeTrainedPlayType } from '../training/playbook.rules';
import { effectsForClub } from '../manager/skillEffects';
// WT2: catálogo de 15 formaciones + auto-lineup por SLOTS de posición detallada.
import { findFormation, slotMacro, type FormationDef, type FormationSlot } from './formations.catalog';
import { detailedOverall, isDetailedPosition, labelOf, normalizeMacro } from '../players/detailedPositions';
import { buildPositionalAlerts } from '../simulation/formationEffects';
import { nextStyleContinuity } from './styleContinuity';

async function persistStyleChange(
  managerId: number,
  previous: { offensiveStyle: string | null; defensiveStyle: string | null },
  current: { offensiveStyle: string | null; defensiveStyle: string | null },
): Promise<void> {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: {
      club: {
        select: {
          id: true,
          offensiveStyleContinuity: true,
          defensiveStyleContinuity: true,
        },
      },
    },
  });
  if (!manager?.club) return;

  const offensive = nextStyleContinuity(
    previous.offensiveStyle,
    current.offensiveStyle,
    manager.club.offensiveStyleContinuity,
  );
  const defensive = nextStyleContinuity(
    previous.defensiveStyle,
    current.defensiveStyle,
    manager.club.defensiveStyleContinuity,
  );
  if (!offensive.changed && !defensive.changed) return;

  const confidencePenalty = offensive.confidencePenalty + defensive.confidencePenalty;
  await prisma.$transaction(async (tx) => {
    await tx.club.update({
      where: { id: manager.club!.id },
      data: {
        ...(offensive.changed ? { offensiveStyleContinuity: offensive.continuity } : {}),
        ...(defensive.changed ? { defensiveStyleContinuity: defensive.continuity } : {}),
      },
    });
    if (confidencePenalty > 0) {
      await tx.$executeRaw`
        UPDATE "BoardConfidence"
        SET level = GREATEST(0, level - ${confidencePenalty})
        WHERE "clubId" = ${manager.club!.id}
      `;
    }
  });
}

/**
 * R3 · Propaga la táctica POR DEFECTO del mánager a las columnas-snapshot de
 * todos sus partidos aún no jugados (Match.home* / Match.away*), que es lo que
 * lee el tick al simular. Así las palancas de la UI de Tácticas llegan al motor
 * sin pasar por la previa. La previa por partido (POST /matches/:id/tactics)
 * sigue pudiendo ajustar un partido concreto DESPUÉS de guardar la general.
 */
async function syncDefaultTacticToScheduledMatches(managerId: number): Promise<void> {
  const manager = await prisma.manager.findUnique({ where: { id: managerId } });
  const clubId = manager?.clubId;
  if (!clubId) return;

  const tactic = await prisma.tactic.findFirst({ where: { managerId, isDefault: true } });
  if (!tactic) return;

  await prisma.match.updateMany({
    where: { homeClubId: clubId, status: 'scheduled' },
    data: {
      homeFormation: tactic.formation,
      homeConstruction: tactic.construction,
      homeDestruction: tactic.destruction,
      homePressing: tactic.pressing,
      homeTempo: tactic.tempo,
      homeWidth: tactic.width,
      homeMentality: tactic.mentality,
      homeMarking: tactic.marking,
      homeOffensiveStyle: tactic.offensiveStyle,
      homeDefensiveStyle: tactic.defensiveStyle,
      homeAttackZones: tactic.attackZones,
      homeDefenseReinforcement: tactic.defenseReinforcement,
      homeSubsLogic: tactic.subsLogic,
    },
  });
  await prisma.match.updateMany({
    where: { awayClubId: clubId, status: 'scheduled' },
    data: {
      awayFormation: tactic.formation,
      awayConstruction: tactic.construction,
      awayDestruction: tactic.destruction,
      awayPressing: tactic.pressing,
      awayTempo: tactic.tempo,
      awayWidth: tactic.width,
      awayMentality: tactic.mentality,
      awayMarking: tactic.marking,
      awayOffensiveStyle: tactic.offensiveStyle,
      awayDefensiveStyle: tactic.defensiveStyle,
      awayAttackZones: tactic.attackZones,
      awayDefenseReinforcement: tactic.defenseReinforcement,
      awaySubsLogic: tactic.subsLogic,
    },
  });
}

// Q12 (BLOQUE Q): límite duro de tácticas guardadas por mánager.
export const MAX_SAVED_TACTICS = 5;

// ─── Q12 · Auto-alineación por formación ─────────────────────────────────────
// Dada una formación ("4-4-2", "4-2-3-1"…), asigna el XI óptimo de la plantilla
// del club: puntuación por línea con los atributos FDF, penalización por jugar
// fuera de posición y exclusión de lesionados/sancionados. Determinista.

type LineKey = 'POR' | 'DEF' | 'MED' | 'DEL';

function parseFormationLines(formation: string): { def: number; mid: number; fwd: number } {
  const parts = String(formation).trim().split('-').map((n) => Number.parseInt(n, 10));
  if (parts.length < 2 || parts.length > 4 || parts.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(`Formación no válida: "${formation}". Usa el formato 4-4-2 o 4-2-3-1.`);
  }
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== 10) {
    throw new Error(`Formación no válida: "${formation}" suma ${total} jugadores de campo (deben ser 10).`);
  }
  const def = parts[0];
  const fwd = parts[parts.length - 1];
  return { def, mid: total - def - fwd, fwd };
}

function lineScore(p: any, line: LineKey): number {
  let base: number;
  if (line === 'POR') base = p.goalkeeping;
  else if (line === 'DEF') base = p.tackling * 0.5 + p.organization * 0.3 + p.passing * 0.2;
  else if (line === 'MED') base = p.passing * 0.4 + p.organization * 0.3 + p.dribbling * 0.15 + p.unmarking * 0.15;
  else base = p.finishing * 0.4 + p.shooting * 0.3 + p.unmarking * 0.2 + p.dribbling * 0.1;
  // Fuera de posición: −20%. Forma física baja también penaliza.
  if (p.position !== line) base *= 0.8;
  return base * (0.7 + 0.3 * ((p.fitness ?? 100) / 100));
}

function pickLine(pool: any[], line: LineKey, count: number, used: Set<number>): any[] {
  const candidates = pool
    .filter((p) => !used.has(p.id))
    .map((p) => ({ p, score: lineScore(p, line) }))
    // Desempate determinista por id para que sea auditable.
    .sort((a, b) => b.score - a.score || a.p.id - b.p.id);
  const picked = candidates.slice(0, count).map((c) => c.p);
  picked.forEach((p) => used.add(p.id));
  return picked;
}

// ─── WT2 · Auto-alineación por SLOTS de posición detallada ───────────────────
// Para formaciones del CATÁLOGO: cada hueco pide posiciones detalladas concretas
// (un 4-2-3-1 pide PIV+PIV/BOX, MP, EXTI/EXTD, DC…). Respeta la posición
// detallada de WT1: CT en CT, no un PIV de central salvo emergencia.

/** Puntuación de un jugador para un hueco concreto. Determinista. */
function slotScore(p: any, slot: FormationSlot): number {
  const playerDetailed = isDetailedPosition(p.detailedPosition) ? p.detailedPosition : null;
  const macro = normalizeMacro(p.position);
  const targetMacro = slotMacro(slot);

  // Posición de referencia para medir la Media: la suya si encaja en el hueco,
  // la principal del hueco si no.
  const fitIndex = playerDetailed ? slot.positions.indexOf(playerDetailed) : -1;
  const refPos = fitIndex >= 0 ? playerDetailed! : slot.positions[0];
  let base = detailedOverall(refPos, p) || 1;

  if (fitIndex >= 0) {
    base *= fitIndex === 0 ? 1.04 : 1.0;          // preferencia del hueco
  } else if (macro === targetMacro) {
    base *= 0.82;                                  // misma línea, otra demarcación
  } else {
    base *= 0.6;                                   // emergencia (cambia de línea)
  }
  return base * (0.7 + 0.3 * ((p.fitness ?? 100) / 100));
}

function autoLineupBySlots(def: FormationDef, pool: any[]) {
  const used = new Set<number>();
  const xi: any[] = [];
  const hasGk = pool.some((p) => normalizeMacro(p.position) === 'POR');

  // Dos pasadas: primero huecos de portero y los que tienen especialistas
  // exactos disponibles, después relleno por mejor puntuación. Determinista.
  const assign = (slot: FormationSlot, onlyExact: boolean): boolean => {
    const candidates = pool
      .filter((p) => !used.has(p.id))
      .filter((p) => {
        // Portería: solo POR (fallback al mejor disponible si NO hay porteros).
        if (slotMacro(slot) === 'POR') return hasGk ? normalizeMacro(p.position) === 'POR' : true;
        if (normalizeMacro(p.position) === 'POR') return false;   // un portero jamás de campo
        if (!onlyExact) return true;
        return isDetailedPosition(p.detailedPosition) && slot.positions.includes(p.detailedPosition);
      })
      .map((p) => ({ p, score: slotScore(p, slot) }))
      .sort((a, b) => b.score - a.score || a.p.id - b.p.id);
    const best = candidates[0]?.p;
    if (!best) return false;
    used.add(best.id);
    const fits = isDetailedPosition(best.detailedPosition) && slot.positions.includes(best.detailedPosition);
    xi.push({
      playerId: best.id,
      name: best.name,
      squadNumber: best.squadNumber,
      naturalPosition: best.position,
      detailedPosition: best.detailedPosition ?? null,
      detailedPositionLabel: labelOf(best.detailedPosition),
      assignedLine: slotMacro(slot),
      slotIndex: slot.index,
      slotLabel: slot.label,
      requiredPositions: slot.positions,
      roles: slot.roles ?? [],
      outOfPosition: !fits,
      emergency: normalizeMacro(best.position) !== slotMacro(slot),
    });
    return true;
  };

  const pending: FormationSlot[] = [];
  for (const slot of def.slots) {
    if (!assign(slot, true)) pending.push(slot);
  }
  for (const slot of pending) {
    assign(slot, false);
  }
  xi.sort((a, b) => a.slotIndex - b.slotIndex);
  return xi;
}

export const tacticsService = {
  syncDefaultTacticToScheduledMatches,

  /**
   * Q12 · XI óptimo de MI plantilla para una formación dada (autocolocar en la
   * UI de Tácticas). No persiste nada: es una sugerencia determinista.
   */
  async autoLineup(clubId: number, formation: string) {
    // WT2: las formaciones del CATÁLOGO se rellenan por SLOTS de posición
    // detallada; los strings libres legacy siguen funcionando por líneas macro.
    const catalogDef = findFormation(formation);
    const lines = catalogDef ? null : parseFormationLines(formation);
    const [state, players] = await Promise.all([
      prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } }),
      prisma.player.findMany({
        where: { clubId },
        select: {
          id: true, name: true, position: true, detailedPosition: true, squadNumber: true,
          passing: true, tackling: true, shooting: true, organization: true,
          unmarking: true, finishing: true, dribbling: true, fouls: true, goalkeeping: true,
          fitness: true, injuredUntil: true, suspendedMatches: true,
        },
      }),
    ]);
    const now = state?.inGameDate ?? new Date();
    if (players.length === 0) throw new Error('Tu club no tiene jugadores.');

    const available = players.filter((p) =>
      (p.suspendedMatches ?? 0) === 0 && (!p.injuredUntil || p.injuredUntil <= now));
    const pool = available.length >= 11 ? available : players;

    if (catalogDef) {
      const xi = autoLineupBySlots(catalogDef, pool);
      if (xi.length < 11) {
        throw new Error(`No hay suficientes jugadores disponibles para un XI completo (${xi.length}/11).`);
      }
      const starterIds = new Set(xi.map((s: any) => s.playerId));
      const bench = pool
        .filter((p) => !starterIds.has(p.id))
        .map((p) => ({
          playerId: p.id, name: p.name, squadNumber: p.squadNumber,
          naturalPosition: p.position,
          detailedPosition: p.detailedPosition ?? null,
          detailedPositionLabel: labelOf(p.detailedPosition),
        }));
      return {
        formation,
        formationKey: catalogDef.key,
        formationName: catalogDef.name,
        bySlots: true,
        xi,
        bench,
        positionalAlerts: buildPositionalAlerts(xi),
      };
    }

    const legacyLines = lines!;   // string libre legacy: lines siempre calculadas
    const used = new Set<number>();
    const gkPool = pool.filter((p) => p.position === 'POR');
    const gk = pickLine(gkPool.length ? gkPool : pool, 'POR', 1, used);
    const outfield = pool.filter((p) => p.position !== 'POR' && !used.has(p.id));
    const defense = pickLine(outfield, 'DEF', legacyLines.def, used);
    const midfield = pickLine(outfield, 'MED', legacyLines.mid, used);
    const attack = pickLine(outfield, 'DEL', legacyLines.fwd, used);

    const slot = (p: any, line: LineKey, index: number) => ({
      playerId: p.id,
      name: p.name,
      squadNumber: p.squadNumber,
      naturalPosition: p.position,
      assignedLine: line,
      slotIndex: index,
      outOfPosition: p.position !== line,
    });

    const xi = [
      ...gk.map((p, i) => slot(p, 'POR', i)),
      ...defense.map((p, i) => slot(p, 'DEF', i)),
      ...midfield.map((p, i) => slot(p, 'MED', i)),
      ...attack.map((p, i) => slot(p, 'DEL', i)),
    ];
    if (xi.length < 11) {
      throw new Error(`No hay suficientes jugadores disponibles para un XI completo (${xi.length}/11).`);
    }
    const starterIds = new Set(xi.map((s) => s.playerId));
    const bench = pool
      .filter((p) => !starterIds.has(p.id))
      .map((p) => ({ playerId: p.id, name: p.name, squadNumber: p.squadNumber, naturalPosition: p.position }));

    return { formation, lines: legacyLines, xi, bench, positionalAlerts: buildPositionalAlerts(xi) };
  },

  /** N3-1 · Avisos posicionales para un XI manual en pizarra. */
  async positionalInsights(clubId: number, formation: string, starterIds: number[]) {
    const catalogDef = findFormation(formation);
    if (!catalogDef) return { positionalAlerts: [] as ReturnType<typeof buildPositionalAlerts> };
    const players = await prisma.player.findMany({
      where: { clubId, id: { in: starterIds } },
      select: { id: true, name: true, position: true, detailedPosition: true, squadNumber: true },
    });
    const byId = new Map(players.map((p) => [p.id, p]));
    const xi = catalogDef.slots.map((slot, index) => {
      const playerId = starterIds[index];
      const p = playerId ? byId.get(playerId) : undefined;
      if (!p) return null;
      const fits = isDetailedPosition(p.detailedPosition) && slot.positions.includes(p.detailedPosition);
      return {
        playerId: p.id,
        name: p.name,
        slotLabel: slot.label,
        detailedPosition: p.detailedPosition,
        outOfPosition: !fits && isDetailedPosition(p.detailedPosition),
        emergency: normalizeMacro(p.position) !== slotMacro(slot),
      };
    }).filter(Boolean) as Parameters<typeof buildPositionalAlerts>[0];
    return { positionalAlerts: buildPositionalAlerts(xi) };
  },

  async getAllMyTactics(managerId: number) {
    return prisma.tactic.findMany({
      where: { managerId },
      orderBy: { id: 'asc' }
    });
  },

  async createTactic(managerId: number, data: any) {
    // Q12: máximo 5 tácticas guardadas por mánager (regla de servidor).
    const count = await prisma.tactic.count({ where: { managerId } });
    if (count >= MAX_SAVED_TACTICS) {
      throw new Error(`Máximo ${MAX_SAVED_TACTICS} tácticas guardadas: borra o sobrescribe una para crear otra.`);
    }
    const isDefault = count === 0;
    const created = await prisma.tactic.create({
      data: {
        managerId,
        name: data.name || `Táctica ${count + 1}`,
        formation: data.formation || '4-4-2',
        construction: data.construction ?? 50,
        destruction: data.destruction ?? 50,
        // R3: palancas que el zod ya acepta y el create tiraba
        pressing: data.pressing ?? 50,
        tempo: data.tempo ?? 50,
        width: data.width ?? 50,
        ...(data.mentality !== undefined ? { mentality: String(data.mentality) } : {}),
        ...(data.marking !== undefined ? { marking: data.marking } : {}),
        zones: data.zones,
        passingStyle: data.passingStyle,
        subsLogic: data.subsLogic,
        offensiveStyle: data.offensiveStyle,
        defensiveStyle: data.defensiveStyle,
        attackZones: data.attackZones,
        defenseReinforcement: data.defenseReinforcement,
        // WT2: roles modernos por hueco (JSON aditivo; null = sin roles).
        roleInstructions: data.roleInstructions,
        isDefault
      }
    });
    if (created.isDefault) await syncDefaultTacticToScheduledMatches(managerId);
    return created;
  },

  async updateTactic(managerId: number, tacticId: number, data: any) {
    const tactic = await prisma.tactic.findFirst({ where: { id: tacticId, managerId } });
    if (!tactic) throw new Error('Táctica no encontrada');

    const updated = await prisma.tactic.update({
      where: { id: tacticId },
      data: {
        ...data,
        ...(data.mentality !== undefined ? { mentality: String(data.mentality) } : {}),
      }
    });
    if (updated.isDefault) {
      await persistStyleChange(managerId, tactic, updated);
    }
    // R3: si es la táctica activa, propagar a los partidos pendientes del tick
    if (updated.isDefault) await syncDefaultTacticToScheduledMatches(managerId);
    return updated;
  },

  async deleteTactic(managerId: number, tacticId: number) {
    const tactic = await prisma.tactic.findFirst({ where: { id: tacticId, managerId } });
    if (!tactic) throw new Error('Táctica no encontrada');
    if (tactic.isDefault) throw new Error('No puedes borrar la táctica por defecto');

    return prisma.tactic.delete({
      where: { id: tacticId }
    });
  },

  async setDefaultTactic(managerId: number, tacticId: number) {
    const tactic = await prisma.tactic.findFirst({ where: { id: tacticId, managerId } });
    if (!tactic) throw new Error('Táctica no encontrada');
    const previousDefault = await prisma.tactic.findFirst({
      where: { managerId, isDefault: true },
      select: { offensiveStyle: true, defensiveStyle: true },
    });

    // Reset default for all tactics of this manager
    await prisma.tactic.updateMany({
      where: { managerId },
      data: { isDefault: false }
    });

    // Set the new default
    const updated = await prisma.tactic.update({
      where: { id: tacticId },
      data: { isDefault: true }
    });
    await persistStyleChange(
      managerId,
      previousDefault ?? { offensiveStyle: null, defensiveStyle: null },
      updated,
    );
    // R3: la nueva táctica activa pasa a regir los partidos pendientes
    await syncDefaultTacticToScheduledMatches(managerId);
    return updated;
  },

  // ─── Jugadas Entrenadas ────────────────────────────────────────────────
  async getTrainedPlays(clubId: number) {
    return prisma.trainedPlay.findMany({
      where: { clubId },
      orderBy: { id: 'asc' }
    });
  },

  async startTrainedPlay(clubId: number, type: string) {
    const playType = normalizeTrainedPlayType(type);
    // Only 1 developing play per club at a time
    const existing = await prisma.trainedPlay.findFirst({
      where: { clubId, status: 'developing' }
    });
    if (existing) throw new Error('Ya tienes una jugada en desarrollo');

    return prisma.trainedPlay.create({
      data: {
        clubId,
        type: playType,
        level: 1,
        progress: 0,
        status: 'developing',
        isActive: false
      }
    });
  },

  async toggleTrainedPlay(clubId: number, playId: number) {
    const play = await prisma.trainedPlay.findFirst({ where: { id: playId, clubId } });
    if (!play) throw new Error('Jugada no encontrada');
    if (play.status === 'developing') throw new Error('No puedes activar una jugada en desarrollo');
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
      data: { isActive: !play.isActive }
    });
  }
};
