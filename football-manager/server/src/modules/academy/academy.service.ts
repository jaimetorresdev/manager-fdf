import prisma from '../../db/prisma';
import { sportsCityTalentBonus } from '../stadium/stadium.service';
import { EMBLEMATIC_TALENT_BONUS_PER_PLAYER } from '../ideology/ideology.service';
import { salaryCap, makeRng } from '../game/tick.logic';
import { assertFDFBuyerCounts, spendableBase } from '../market/transfer.core';
import { getInGameDate } from '../../lib/inGameDate';
import { youthPotential } from '../../lib/youthProgression';
import { targetYouthProspects } from '../game/playerLifecycle';
// WT1: los juveniles nacen con posición detallada y puntos repartidos por pesos.
import {
  deriveDetailedPosition, generateSkillsFor, macroOf, pickYouthDetailedPosition,
  type DetailedPosition,
} from '../players/detailedPositions';

// ─── Constants ────────────────────────────────────────────────────────────────

/** In-game months between automatic youth player generations */
const GENERATION_MONTHS = 3;

const POSITIONS = ['POR', 'DEF', 'MED', 'DEL'] as const;

const FIRST_NAMES = [
  'Carlos', 'Hugo', 'Mateo', 'Leo', 'Lucas', 'Daniel',
  'Alejandro', 'Pablo', 'Manuel', 'Álvaro', 'Adrián', 'Sergio',
  'Iván', 'Rubén', 'Marcos', 'Óscar', 'Raúl', 'Víctor',
];
const LAST_NAMES = [
  'García', 'Martínez', 'López', 'Sánchez', 'Pérez',
  'Gómez', 'Martín', 'Ruiz', 'Hernández', 'Díaz',
  'Torres', 'Fernández', 'Blanco', 'Romero', 'Molina',
];

/** Default location bonus (simplified; can be extended per country/city) */
const LOCATION_BONUS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rand(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function randomName(rng: () => number): string {
  return `${pick(FIRST_NAMES, rng)} ${pick(LAST_NAMES, rng)}`;
}

/**
 * FDF talent formula:
 *   talent = (academyLevel * 3) + rand(-5, 25) − rand(0, residences) + 13 + location
 *            + sportsCityBonus + emblematicBonus
 *   clamped to [20, 75]
 *
 * emblematicBonus: ideologyService.EMBLEMATIC_TALENT_BONUS_PER_PLAYER * count of emblematic players
 */
function computeYouthTalent(
  academyLevel: number,
  residences: number,
  sportsCity: number,
  emblematicCount: number,
  rng: () => number,
): number {
  const cityBonus = sportsCityTalentBonus(sportsCity);
  const emblematicBonus = emblematicCount * EMBLEMATIC_TALENT_BONUS_PER_PLAYER;
  const raw =
    academyLevel * 3
    + rand(-5, 25, rng)
    - rand(0, residences, rng)
    + 13
    + LOCATION_BONUS
    + cityBonus
    + emblematicBonus;
  return Math.max(20, Math.min(75, raw));
}

/** Build initial attributes JSON for a newly generated youth player.
 *  WT1: `position` puede ser una macro legacy (POR/DEF/MED/DEL) o una de las
 *  15 detalladas; siempre se persisten AMBAS (macro + detailedPosition) y los
 *  puntos se reparten según los pesos de la tabla §1.1 del doc de diseño.
 *  N4-3: `legacyBonus` — array de nombres de atributos heredados de la última
 *  leyenda del club (≥450 PJ); cada atributo recibe +5 puntos (clamp a 99). */
function buildAttributes(
  name: string,
  position: string,
  nationality: string,
  talent: number,
  rng: () => number,
  legacyBonus: string[] | null = null,
): string {
  const base = Math.round(20 + talent * 0.4);
  // Macro legacy → se sortea una detallada coherente con esa macro; string
  // detallado → mapeo directo (deriveDetailedPosition resuelve ambos casos).
  const isMacro = ['POR', 'DEF', 'MED', 'DEL'].includes(position.toUpperCase());
  const detailed: DetailedPosition = isMacro
    ? pickYouthForMacro(position.toUpperCase(), rng)
    : deriveDetailedPosition({ position, squadNumber: rand(1, 99, rng) });
  const sk = generateSkillsFor(detailed, base, rng);

  // N4-3 · Legado de leyenda: +5 en cada atributo heredado (clamp 99)
  type SkillKey = 'passing' | 'tackling' | 'shooting' | 'organization' | 'unmarking' | 'finishing' | 'dribbling' | 'goalkeeping';
  const legacySet = new Set<string>(legacyBonus ?? []);
  const applyLegacy = (key: SkillKey, value: number) =>
    legacySet.has(key) ? Math.min(99, value + 5) : value;

  return JSON.stringify({
    name,
    position: macroOf(detailed),
    detailedPosition: detailed,   // WT1: nace ya con posición detallada
    nationality,
    flag: '🇪🇸',
    passing: applyLegacy('passing', sk.passing),
    tackling: applyLegacy('tackling', sk.tackling),
    shooting: applyLegacy('shooting', sk.shooting),
    organization: applyLegacy('organization', sk.organization),
    unmarking: applyLegacy('unmarking', sk.unmarking),
    finishing: applyLegacy('finishing', sk.finishing),
    dribbling: applyLegacy('dribbling', sk.dribbling),
    fouls: sk.fouls,
    goalkeeping: applyLegacy('goalkeeping', sk.goalkeeping),
    // AUDIT 5.5: el juvenil DEBE nacer con `reflexes` (la media de portero es
    // (goalkeeping+reflexes)/2). generateSkillsFor no lo produce, así que se espeja a
    // goalkeeping; antes caía al default 50 y diluía la media del POR canterano.
    // [Cross-request a C: generar `reflexes` propio en generateSkillsFor.]
    reflexes: applyLegacy('goalkeeping', sk.goalkeeping),
  });
}

function talentToOverall(talent: number): number {
  return Math.round(25 + talent * 0.5);
}

/** WT1: sortea una posición detallada DENTRO de una macro (juveniles legacy). */
function pickYouthForMacro(macro: string, rand: () => number): DetailedPosition {
  for (let i = 0; i < 24; i++) {
    const candidate = pickYouthDetailedPosition(rand);
    if (macroOf(candidate) === macro) return candidate;
  }
  return macro === 'POR' ? 'POR' : macro === 'DEF' ? 'CT' : macro === 'DEL' ? 'DC' : 'ORG';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const academyService = {
  async getAcademy(clubId: number) {
    // AUDIT 3.6 (TOCTOU): upsert atómico — el find+create podía lanzar P2002 si dos
    // primeras visitas concurrentes creaban la academia a la vez (clubId es @unique).
    const academy = await prisma.youthAcademy.upsert({
      where: { clubId },
      update: {},
      create: { clubId, level: 1, residences: 1, nextPlayerAt: null },
      include: { youthPlayers: true },
    });

    const capacity = academy.residences * 10;

    const parsedPlayers = academy.youthPlayers.map((p) => {
      let attrs: Record<string, unknown> = {};
      try { attrs = JSON.parse(p.attributes); } catch { /* ignore */ }
      return { ...p, attrs };
    });

    // Emblematic player bonus from ideology
    const ideology = await prisma.ideology.findUnique({
      where: { clubId },
      include: { emblematic: true },
    });
    const emblematicBonus = ideology
      ? ideology.emblematic.length * EMBLEMATIC_TALENT_BONUS_PER_PLAYER
      : 0;

    // Sports city talent bonus
    const stadium = await prisma.stadium.findUnique({ where: { clubId } });
    const sportsCity = stadium?.sportsCity ?? 0;

    return {
      id: academy.id,
      level: academy.level,
      residences: academy.residences,
      capacity,
      occupied: academy.youthPlayers.length,
      nextPlayerAt: academy.nextPlayerAt,
      sportsCityBonus: sportsCityTalentBonus(sportsCity),
      emblematicBonus,
      youthPlayers: parsedPlayers,
      upgradeOptions: {
        level: {
          label: `Upgrade academy to level ${academy.level + 1}`,
          cost: 250000 + academy.level * 150000,
        },
        residences: {
          label: 'Add residence (capacity +10)',
          cost: 150000 + academy.residences * 50000,
        },
      },
    };
  },

  /** Expand academy level or add a residence building */
  async expand(clubId: number, type: 'level' | 'residences') {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: { youthAcademy: true },
    });
    if (!club) throw new Error('Club not found');

    // AUDIT 3.6 (TOCTOU): bootstrap atómico (clubId @unique) para no chocar con P2002
    // en primeras expansiones concurrentes.
    const academy = club.youthAcademy ?? (await prisma.youthAcademy.upsert({
      where: { clubId },
      update: {},
      create: { clubId, level: 1, residences: 1 },
    }));

    const cost =
      type === 'level'
        ? 250000 + academy.level * 150000
        : 150000 + academy.residences * 50000;

    if (club.budget < cost) throw new Error('Presupuesto insuficiente');

    await prisma.$transaction(async (tx) => {
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: cost } },
        data: { budget: { decrement: cost }, cash: { decrement: cost } },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente');
      await tx.youthAcademy.update({ where: { id: academy.id }, data: { [type]: { increment: 1 } } });
    });

    return this.getAcademy(clubId);
  },

  /** Salario que pide un canterano para subir al primer equipo (F4). */
  youthSalaryDemand(talent: number): number {
    return 1000 + talent * 50;
  },

  /** Promote a youth player to the first team.
   *  F4: acepta términos negociados { salary, years }. El juvenil rechaza
   *  salarios por debajo de su demanda (1000 + talento×50). */
  async promotePlayer(clubId: number, youthPlayerId: number, terms?: { salary?: number; years?: number }) {
    return prisma.$transaction(async (tx) => {
      const academy = await tx.youthAcademy.findUnique({
        where: { clubId },
        include: { youthPlayers: true },
      });
      if (!academy) throw new Error('Cantera no encontrada');

      const yp = academy.youthPlayers.find((p) => p.id === youthPlayerId);
      if (!yp) throw new Error('El juvenil no pertenece a esta cantera');

      const [squadSize, loanedOut, pendingIncoming, club, state] = await Promise.all([
        tx.player.count({ where: { clubId } }),
        tx.player.count({ where: { loanOwnerClubId: clubId } }),
        tx.transferOffer.count({ where: { fromClubId: clubId, status: 'accepted_pending_window' } }),
        tx.club.findUnique({
          where: { id: clubId },
          include: {
            players: { select: { salary: true, wage: true } },
            coaches: { select: { salary: true } },
          },
        }),
        tx.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } }),
      ]);
      if (!club) throw new Error('Club no encontrado');
      assertFDFBuyerCounts(squadSize, loanedOut, pendingIncoming);

      let attrs: Record<string, unknown> = {};
      try { attrs = JSON.parse(yp.attributes); } catch { /* ignore */ }
      const overall = talentToOverall(yp.talent);
      const demand = this.youthSalaryDemand(yp.talent);
      const salary = terms?.salary != null ? Math.round(terms.salary) : demand;
      const years = terms?.years ?? 3;
      if (salary < demand) {
        throw new Error(`El juvenil rechaza la oferta: pide al menos ${demand} €/mes.`);
      }
      const usedSalary = club.players.reduce((sum, player) => sum + Math.round(Number(player.wage ?? player.salary) || player.salary), 0)
        + club.coaches.reduce((sum, coach) => sum + coach.salary, 0);
      const cap = salaryCap(spendableBase(club));
      if (usedSalary + salary > cap) {
        throw new Error(`La promoción supera el tope salarial (${cap} €/mes).`);
      }

      const claimed = await tx.youthPlayer.deleteMany({ where: { id: yp.id, youthAcademyId: academy.id } });
      if (claimed.count === 0) throw new Error('El juvenil ya fue promocionado o descartado.');

      const inGameDate = state?.inGameDate ?? new Date();
      return tx.player.create({
        data: {
          clubId,
          name: (attrs.name as string) || 'Canterano',
          age: yp.age,
          nationality: (attrs.nationality as string) || 'España',
          flag: (attrs.flag as string) || '🇪🇸',
          position: (attrs.position as string) || 'MED',
          // WT1: hereda la detallada del juvenil; si es antiguo, se deriva.
          detailedPosition: (attrs.detailedPosition as string)
            || deriveDetailedPosition({ ...(attrs as Record<string, number>), position: (attrs.position as string) || 'MED' }),
          passing: Number(attrs.passing) || overall,
          tackling: Number(attrs.tackling) || overall,
          shooting: Number(attrs.shooting) || overall,
          organization: Number(attrs.organization) || overall,
          unmarking: Number(attrs.unmarking) || overall,
          finishing: Number(attrs.finishing) || overall,
          dribbling: Number(attrs.dribbling) || overall,
          goalkeeping: Number(attrs.goalkeeping) || Math.round(overall * 0.6),
          // AUDIT 5.5: persistir reflexes al promocionar (antes se omitía → default 50).
          // Para juveniles antiguos sin el atributo, se espeja a goalkeeping.
          reflexes: Number(attrs.reflexes) || Number(attrs.goalkeeping) || Math.round(overall * 0.6),
          talent: yp.talent,
          // AUDIT 5.5: potencial DETERMINISTA y consistente con la auto-promoción del
          // tick (misma derivación `youthPotential`). Antes: `talent + rand(5,20)`.
          potential: youthPotential(yp.talent),
          salary,
          wage: salary,
          marketValue: yp.talent * 5000,
          contractYears: years,
          contractStartAt: inGameDate,
          contractEndAt: new Date(Date.UTC(inGameDate.getUTCFullYear() + years, 5, 30)),
          homegrown: true,
        },
      });
    });
  },

  /** Dismiss a youth player at no financial cost */
  async dismissPlayer(clubId: number, youthPlayerId: number) {
    const academy = await prisma.youthAcademy.findUnique({
      where: { clubId },
      include: { youthPlayers: true },
    });
    if (!academy) throw new Error('Academy not found');

    const yp = academy.youthPlayers.find((p) => p.id === youthPlayerId);
    if (!yp) throw new Error('Youth player not found in this academy');

    await prisma.youthPlayer.delete({ where: { id: yp.id } });
    return { success: true, dismissed: youthPlayerId };
  },

  /**
   * Manually trigger next-player generation (if capacity allows).
   * Normally called automatically via tick. Useful for testing / manual advance.
   */
  async requestNextPlayer(clubId: number) {
    const academy = await prisma.youthAcademy.findUnique({
      where: { clubId },
      include: { youthPlayers: true },
    });
    if (!academy) throw new Error('Academy not found');

    const capacity = academy.residences * 10;
    if (academy.youthPlayers.length >= capacity) {
      throw new Error('Academy at full capacity');
    }

    const stadium = await prisma.stadium.findUnique({ where: { clubId } });
    const sportsCity = stadium?.sportsCity ?? 0;
    const ideology = await prisma.ideology.findUnique({
      where: { clubId },
      include: { emblematic: true },
    });
    const emblematicCount = ideology?.emblematic.length ?? 0;
    const inGameDate = await getInGameDate();
    const rng = makeRng(clubId * 6113 + Math.floor(inGameDate.getTime() / 86_400_000));
    const talent = computeYouthTalent(academy.level, academy.residences, sportsCity, emblematicCount, rng);
    const position = pick(POSITIONS, rng);
    const name = randomName(rng);

    const yp = await prisma.youthPlayer.create({
      data: {
        youthAcademyId: academy.id,
        age: rand(15, 18, rng),
        talent,
        attributes: buildAttributes(name, position, 'España', talent, rng),
      },
    });

    const nextAt = new Date(inGameDate);
    nextAt.setMonth(nextAt.getMonth() + GENERATION_MONTHS);
    await prisma.youthAcademy.update({
      where: { id: academy.id },
      data: { nextPlayerAt: nextAt },
    });

    return yp;
  },

  /**
   * Tick hook: called each turn by game.service.ts processTick().
   * - Every 28 turns ≈ 1 in-game year → age youth players; expel those over MAX_YOUTH_AGE.
   * - When nextPlayerAt ≤ inGameDate and capacity allows → spawn new youth player.
   * (Wiring documented in INTEGRATION_fase2.md)
   */
  async advanceTurn(inGameDate: Date, turn: number): Promise<{ spawned: number; expelled: number }> {
    let spawned = 0;
    const expelled = 0;

    const academies = await prisma.youthAcademy.findMany({
      include: {
        youthPlayers: true,
        club: { include: { stadium: true } },
      },
      // N4-3: incluimos legacyAttributes para aplicar el bono de leyenda
    });

    for (const academy of academies) {
      const club = academy.club;
      const sportsCity = club.stadium?.sportsCity ?? 0;

      // RNG determinista por academia: turn*primo + academyId garantiza
      // reproducibilidad por semilla sin estado compartido entre academias.
      const rng = makeRng(turn * 6113 + academy.id);

      // Fetch emblematic count for this club
      const ideologyRecord = await prisma.ideology.findUnique({
        where: { clubId: club.id },
        include: { emblematic: true },
      });
      const emblematicCount = ideologyRecord?.emblematic.length ?? 0;

      // La edad de cantera se gestiona una vez al año en game.service
      // (1 de enero). El antiguo turn % 28 envejecía varias veces por temporada.

      // Generate new player if due
      const currentCount = await prisma.youthPlayer.count({
        where: { youthAcademyId: academy.id },
      });
      const capacity = academy.residences * 10;
      const isDue = !academy.nextPlayerAt || academy.nextPlayerAt <= inGameDate;

      const targetCount = targetYouthProspects(academy.level, academy.residences);
      const neededForDepth = Math.max(0, targetCount - currentCount);
      const scheduledSpawn = isDue ? 1 : 0;
      const toSpawn = Math.min(capacity - currentCount, Math.max(scheduledSpawn, neededForDepth));

      // N4-3 · Leer legado de leyenda para el bono de atributos
      let legacyBonus: string[] | null = null;
      if (academy.legacyAttributes) {
        try { legacyBonus = JSON.parse(academy.legacyAttributes); } catch { /* ignore */ }
      }

      for (let i = 0; i < toSpawn; i++) {
        const talent = computeYouthTalent(academy.level, academy.residences, sportsCity, emblematicCount, rng);
        const position = pick(POSITIONS, rng);
        const name = randomName(rng);

        await prisma.youthPlayer.create({
          data: {
            youthAcademyId: academy.id,
            age: rand(15, 18, rng),
            talent,
            attributes: buildAttributes(name, position, 'España', talent, rng, legacyBonus),
          },
        });
        spawned++;
      }

      if (toSpawn > 0) {
        const nextAt = new Date(inGameDate);
        nextAt.setMonth(nextAt.getMonth() + GENERATION_MONTHS);
        await prisma.youthAcademy.update({
          where: { id: academy.id },
          data: { nextPlayerAt: nextAt },
        });
      }
    }

    return { spawned, expelled };
  },
};
