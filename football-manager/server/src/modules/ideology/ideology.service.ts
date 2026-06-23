import prisma from '../../db/prisma';
import { lockClubRow } from '../market/transfer.core';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_VALUES = ['Cantera', 'Ambicion', 'Juego ofensivo'];
const MAX_VALUES = 6;
const MAX_EMBLEMATIC = 5;

/** Academy talent bonus per emblematic (retired) player */
export const EMBLEMATIC_TALENT_BONUS_PER_PLAYER = 2;

/**
 * C2 · Criterio ESTRICTO de emblemático (manual §8.2): solo retirados con
 * ≥450 partidos EN EL CLUB que además se retiraron ALLÍ (último club = ese club).
 */
export const MIN_EMBLEMATIC_MATCHES = 450;

/**
 * Partidos jugados por un jugador CON un club: filas de PlayerMatchStat cuyas
 * Match incluyen al club. Nota: PlayerSeasonStat no guarda club, así que este
 * join es la mejor fuente disponible; puede sobrecontar los (raros) partidos
 * jugados CONTRA ese club militando en otro — irrelevante frente al umbral 450.
 */
export async function matchesForClub(playerId: number, clubId: number): Promise<number> {
  return prisma.playerMatchStat.count({
    where: {
      playerId,
      match: {
        status: 'played',
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
      },
    },
  });
}

/**
 * Elegibilidad C2: retirado (sin club) + se retiró en ESTE club (fila ClubLegend
 * del club, o la ausencia de club si es dato legacy) + ≥450 PJ en el club.
 */
export async function isEligibleEmblematic(playerId: number, clubId: number): Promise<boolean> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { clubId: true },
  });
  if (!player || player.clubId !== null) return false; // sigue en activo → no
  const retiredHere = await prisma.clubLegend.findFirst({
    where: { playerId, clubId },
    select: { id: true },
  });
  const retiredElsewhere = await prisma.clubLegend.findFirst({
    where: { playerId, clubId: { not: clubId } },
    select: { id: true },
  });
  // Si hay constancia de retirada en OTRO club y no aquí → no se retiró aquí.
  if (!retiredHere && retiredElsewhere) return false;
  const matches = await matchesForClub(playerId, clubId);
  return matches >= MIN_EMBLEMATIC_MATCHES;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseValues(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return DEFAULT_VALUES;
    return value.map(String).filter(Boolean).slice(0, MAX_VALUES);
  } catch {
    return DEFAULT_VALUES;
  }
}

function encodeValues(values: string[]): string {
  return JSON.stringify(values.map((v) => v.trim()).filter(Boolean).slice(0, MAX_VALUES));
}

/**
 * Compute ideology-unlocked upgrades from current values + emblematic count.
 * Certain keywords unlock specific capabilities across modules.
 */
function computeUnlockedUpgrades(values: string[], emblematicCount: number): string[] {
  const unlocked: string[] = [];
  const lc = values.map((v) => v.toLowerCase());

  if (lc.some((v) => v.includes('cantera'))) unlocked.push('academy:talentBonus');
  if (lc.some((v) => v.includes('ambicion') || v.includes('ambición'))) unlocked.push('market:premiumScouting');
  if (lc.some((v) => v.includes('ofensivo') || v.includes('ataque'))) unlocked.push('training:offensiveFocus');
  if (lc.some((v) => v.includes('defensivo') || v.includes('defensa'))) unlocked.push('training:defensiveFocus');
  if (lc.some((v) => v.includes('comunidad') || v.includes('afici'))) unlocked.push('fans:communityEvents');
  if (emblematicCount >= 3) unlocked.push('stadium:historicWing');
  if (emblematicCount >= 5) unlocked.push('academy:legendsProgram');

  return unlocked;
}

// ─── Q7 · Puntos de ideología por temporada (manual §8.2) ─────────────────────
// Cada emblemático aporta puntos POR TEMPORADA (≥450 PJ en el club → 2 puntos;
// si no, 1), con tope de 15/temporada. Gastarlos exige mánager con prestigio
// ≥100 y confianza de la directiva ≥65% (requisitos del manual). Los gastos se
// PERSISTEN en IdeologyUnlock — nada de mejoras hardcodeadas.

export const MAX_IDEOLOGY_POINTS_PER_SEASON = 15;
// AUDIT 5.7: el manual pedía prestigio ≥100, pero la fuente de prestigio recalculada se
// clampa a un máximo de 100 (`PRESTIGE_LIMITS.max`), de modo que ≥100 solo se cumplía
// exactamente en el tope absoluto → requisito prácticamente inalcanzable. Se baja a 90
// (sigue siendo un umbral de élite, justo por debajo del clamp, pero alcanzable).
export const IDEOLOGY_MIN_PRESTIGE = 90;
export const IDEOLOGY_MIN_CONFIDENCE = 65;

// Compat con cliente Prisma aún no regenerado (mismo patrón que
// transferAgreement en negotiations.service): el modelo IdeologyUnlock existe
// en schema.prisma; el tipo aparece tras `--build backend` / prisma generate.
type PrismaRuntime = typeof prisma & { ideologyUnlock?: any };
const db = prisma as PrismaRuntime;

function unlockStore() {
  if (!db.ideologyUnlock) {
    throw new Error('IdeologyUnlock no disponible: reconstruye el backend (prisma generate).');
  }
  return db.ideologyUnlock;
}

interface IdeologyUnlockRow {
  id: number;
  clubId: number;
  seasonId: number;
  upgradeKey: string;
  cost: number;
  createdAt: Date;
}

export interface IdeologyUpgradeDef {
  key: string;
  name: string;
  cost: number;
  repeatable: boolean;
  description: string;
}

export const IDEOLOGY_UPGRADE_CATALOG: IdeologyUpgradeDef[] = [
  {
    key: 'training:finishPlay',
    name: 'Finalizar entrenamiento de jugada',
    cost: 2,
    repeatable: true,
    description: 'La jugada en desarrollo de tu club queda lista para entrenar de inmediato (manual §8.2).',
  },
  {
    key: 'scout:completeReports',
    name: 'Completar informes de ojeadores',
    cost: 4,
    repeatable: true,
    description: 'Todos los informes en curso de tus ojeadores se completan al 100% (manual §8.2).',
  },
  {
    key: 'fans:communityBoost',
    name: 'Campaña de arraigo',
    cost: 3,
    repeatable: true,
    description: 'La leyenda del club moviliza a la ciudad: +300 de masa social inmediata.',
  },
];

async function activeSeasonId(): Promise<number | null> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true },
  });
  return state?.seasonId ?? null;
}

/** Puntos de ideología del club para la temporada activa (total/gastado/disponible). */
async function ideologyPoints(clubId: number, emblematic: Array<{ playerId: number }>) {
  const seasonId = await activeSeasonId();
  let total = 0;
  for (const entry of emblematic) {
    const matches = await matchesForClub(entry.playerId, clubId);
    total += matches >= MIN_EMBLEMATIC_MATCHES ? 2 : 1;
  }
  total = Math.min(MAX_IDEOLOGY_POINTS_PER_SEASON, total);

  const spendRows: IdeologyUnlockRow[] = seasonId != null
    ? await unlockStore().findMany({ where: { clubId, seasonId } })
    : [];
  const spent = spendRows.reduce((sum: number, row: any) => sum + row.cost, 0);

  return {
    seasonId,
    total,
    spent,
    available: Math.max(0, total - spent),
    howToEarn: 'Cada jugador emblemático aporta puntos por temporada (2 si jugó ≥450 partidos en el club, 1 si no). Máximo 15 puntos por temporada.',
  };
}

/** Requisitos del manual §8.2 para gastar puntos: prestigio ≥100 y confianza ≥65%. */
async function assertCanSpendIdeologyPoints(clubId: number) {
  const manager = await prisma.manager.findFirst({
    where: { clubId },
    select: { prestige: true },
  });
  if (!manager) throw new Error('El club no tiene mánager humano: nadie puede gastar puntos de ideología.');
  if (manager.prestige < IDEOLOGY_MIN_PRESTIGE) {
    throw new Error(`Necesitas ≥${IDEOLOGY_MIN_PRESTIGE} de prestigio para usar puntos de ideología (tienes ${manager.prestige}).`);
  }
  const confidence = await prisma.boardConfidence.findFirst({
    where: { clubId },
    orderBy: { updatedAt: 'desc' },
    select: { level: true },
  });
  if (confidence && confidence.level < IDEOLOGY_MIN_CONFIDENCE) {
    throw new Error(`La directiva exige una valoración de al menos ${IDEOLOGY_MIN_CONFIDENCE}% para gastar puntos de ideología (actual: ${confidence.level}%).`);
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const ideologyService = {
  async getIdeology(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        ideology: {
          include: {
            emblematic: {
              include: {
                player: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    age: true,
                    nationality: true,
                    flag: true,
                    talent: true,
                    marketValue: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!club) throw new Error('Club not found');

    // C2 · limpieza perezosa de entradas no válidas (criterio estricto §8.2)
    if (club.ideology && club.ideology.emblematic.length > 0) {
      const removed = await this.pruneIneligibleEmblematics(clubId);
      if (removed > 0) {
        const fresh = await prisma.ideology.findUnique({
          where: { clubId },
          include: {
            emblematic: {
              include: {
                player: {
                  select: {
                    id: true, name: true, position: true, age: true,
                    nationality: true, flag: true, talent: true, marketValue: true,
                  },
                },
              },
            },
          },
        });
        if (fresh) club.ideology = fresh as typeof club.ideology;
      }
    }

    const ideology = club.ideology ?? (await prisma.ideology.create({
      data: { clubId, values: encodeValues(DEFAULT_VALUES) },
      include: {
        emblematic: {
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                age: true,
                nationality: true,
                flag: true,
                talent: true,
                marketValue: true,
              },
            },
          },
        },
      },
    }));

    const values = parseValues(ideology.values);
    const emblematicCount = ideology.emblematic.length;

    // Q7: puntos por temporada + desbloqueos REALES persistidos en IdeologyUnlock.
    const points = await ideologyPoints(clubId, ideology.emblematic);
    const purchased: IdeologyUnlockRow[] = points.seasonId != null
      ? await unlockStore().findMany({
          where: { clubId, seasonId: points.seasonId },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const purchasedKeys = [...new Set(purchased.map((row) => row.upgradeKey))];

    return {
      id: ideology.id,
      values,
      emblematic: ideology.emblematic.map((e) => ({
        id: e.id,
        retireYear: e.retireYear,
        talentBonus: EMBLEMATIC_TALENT_BONUS_PER_PLAYER,
        player: e.player,
      })),
      bonuses: {
        academyTalentBonus: emblematicCount * EMBLEMATIC_TALENT_BONUS_PER_PLAYER,
        // Pasivas (derivadas de valores/emblemáticos) + compradas con puntos.
        unlockedUpgrades: [...new Set([...computeUnlockedUpgrades(values, emblematicCount), ...purchasedKeys])],
      },
      // Q7 (aditivo): sistema de puntos del manual §8.2.
      points,
      unlocks: purchased,
      catalog: IDEOLOGY_UPGRADE_CATALOG.map((def) => ({
        ...def,
        affordable: def.cost <= points.available,
        alreadyUnlocked: !def.repeatable && purchasedKeys.includes(def.key),
      })),
      requirements: {
        minPrestige: IDEOLOGY_MIN_PRESTIGE,
        minConfidence: IDEOLOGY_MIN_CONFIDENCE,
      },
      limits: { maxValues: MAX_VALUES, maxEmblematic: MAX_EMBLEMATIC, maxPointsPerSeason: MAX_IDEOLOGY_POINTS_PER_SEASON },
    };
  },

  /**
   * Q7 · POST de desbloqueo REAL: valida requisitos del manual, gasta puntos de
   * la temporada activa, persiste el gasto en IdeologyUnlock y aplica el efecto
   * de la mejora dentro de una transacción.
   */
  async unlockUpgrade(clubId: number, upgradeKey: string) {
    const def = IDEOLOGY_UPGRADE_CATALOG.find((entry) => entry.key === upgradeKey);
    if (!def) throw new Error('Mejora de ideología desconocida.');

    await assertCanSpendIdeologyPoints(clubId);

    const ideology = await prisma.ideology.findUnique({
      where: { clubId },
      include: { emblematic: true },
    });
    const points = await ideologyPoints(clubId, ideology?.emblematic ?? []);
    if (points.seasonId == null) throw new Error('No hay temporada activa.');
    if (!def.repeatable) {
      const existing = await unlockStore().findFirst({
        where: { clubId, upgradeKey: def.key },
        select: { id: true },
      });
      if (existing) throw new Error('Esta mejora ya está desbloqueada.');
    }
    if (def.cost > points.available) {
      throw new Error(`Puntos de ideología insuficientes: necesitas ${def.cost} y tienes ${points.available}. ${points.howToEarn}`);
    }

    await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);

      // Re-verificar fondos dentro de la transacción con bloqueo para evitar TOCTOU
      const spentRows = await (tx as PrismaRuntime).ideologyUnlock.findMany({ where: { clubId, seasonId: points.seasonId! } });
      const currentSpent = spentRows.reduce((sum: number, row: any) => sum + row.cost, 0);
      const currentAvailable = points.total - currentSpent;
      if (def.cost > currentAvailable) {
        throw new Error(`Puntos de ideología insuficientes: necesitas ${def.cost} y tienes ${currentAvailable}.`);
      }

      // Efecto REAL de cada mejora (manual §8.2).
      if (def.key === 'training:finishPlay') {
        const developing = await tx.trainedPlay.findFirst({
          where: { clubId, status: 'developing' },
          orderBy: { progress: 'desc' },
        });
        if (!developing) throw new Error('No tienes ninguna jugada en desarrollo que finalizar.');
        await tx.trainedPlay.update({
          where: { id: developing.id },
          data: { status: 'trainable' },
        });
      } else if (def.key === 'scout:completeReports') {
        const staff = await tx.staff.findUnique({
          where: { clubId },
          include: { members: { where: { role: 'scout' }, select: { id: true } } },
        });
        const scoutIds = (staff?.members ?? []).map((m) => m.id);
        if (scoutIds.length === 0) throw new Error('No tienes ojeadores en plantilla.');
        const updated = await tx.scoutAssignment.updateMany({
          where: { scoutStaffId: { in: scoutIds }, analysisPoints: { lt: 100 } },
          data: { analysisPoints: 100 },
        });
        if (updated.count === 0) throw new Error('Tus ojeadores no tienen informes en curso que completar.');
      } else if (def.key === 'fans:communityBoost') {
        // AUDIT H-24: el boost DEBE aplicarse sobre FanBase (fuente de verdad). Antes
        // solo incrementaba club.fans/socialMass, que se RECALCULAN desde FanBase en
        // cada campaña/tick → el +300 desaparecía y el usuario gastaba 3 puntos en vano.
        // Se suma a un segmento de comunidad (adultLow) y se refleja en el espejo
        // club.fans/socialMass para efecto inmediato; el total ya queda persistido.
        await tx.fanBase.upsert({
          where: { clubId },
          update: { adultLow: { increment: 300 } },
          create: { clubId, adultLow: 5000 + 300 },
        });
        await tx.club.update({
          where: { id: clubId },
          data: { fans: { increment: 300 }, socialMass: { increment: 300 } },
        });
      }

      await (tx as PrismaRuntime).ideologyUnlock.create({
        data: { clubId, seasonId: points.seasonId!, upgradeKey: def.key, cost: def.cost },
      });
    });

    return this.getIdeology(clubId);
  },

  async updateValues(clubId: number, values: string[]) {
    const ideology = await prisma.ideology.upsert({
      where: { clubId },
      update: { values: encodeValues(values) },
      create: { clubId, values: encodeValues(values.length ? values : DEFAULT_VALUES) },
    });
    return { id: ideology.id, values: parseValues(ideology.values) };
  },

  async addEmblematicPlayer(clubId: number, playerId: number, retireYear: number) {
    const ideology = await prisma.ideology.upsert({
      where: { clubId },
      update: {},
      create: { clubId, values: encodeValues(DEFAULT_VALUES) },
      include: { emblematic: true },
    });

    if (ideology.emblematic.length >= MAX_EMBLEMATIC) {
      throw new Error(`Emblematic player limit reached (max ${MAX_EMBLEMATIC})`);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Player not found');

    if (ideology.emblematic.some((e) => e.playerId === playerId)) {
      throw new Error('Player is already marked as emblematic');
    }

    // C2 · criterio estricto del manual §8.2: retirado EN este club con ≥450 PJ.
    if (!(await isEligibleEmblematic(playerId, clubId))) {
      throw new Error(
        `Solo puede ser emblemático un jugador RETIRADO en este club con ≥${MIN_EMBLEMATIC_MATCHES} partidos jugados en él`,
      );
    }

    await prisma.emblematicPlayer.create({
      data: { ideologyId: ideology.id, playerId, retireYear },
    });

    return this.getIdeology(clubId);
  },

  /**
   * C2 · Limpieza de emblemáticos NO válidos bajo el criterio estricto (p. ej.
   * jugadores aún en activo marcados con la regla laxa anterior). Idempotente;
   * se invoca de forma perezosa desde getIdeology.
   */
  async pruneIneligibleEmblematics(clubId: number): Promise<number> {
    const ideology = await prisma.ideology.findUnique({
      where: { clubId },
      include: { emblematic: true },
    });
    if (!ideology || ideology.emblematic.length === 0) return 0;

    let removed = 0;
    for (const entry of ideology.emblematic) {
      if (!(await isEligibleEmblematic(entry.playerId, clubId))) {
        await prisma.emblematicPlayer.delete({ where: { id: entry.id } });
        removed++;
      }
    }
    return removed;
  },

  /**
   * C2 · Alta automática al retirarse: si el jugador es elegible para el club
   * donde se retira y hay hueco en el pool (máx. 5), se añade solo.
   * Llamado desde el paso de retiradas del tick. Devuelve true si se añadió.
   */
  async autoEnrollEmblematicOnRetirement(clubId: number, playerId: number, retireYear: number): Promise<boolean> {
    if (!(await isEligibleEmblematic(playerId, clubId))) return false;
    const ideology = await prisma.ideology.upsert({
      where: { clubId },
      update: {},
      create: { clubId, values: encodeValues(DEFAULT_VALUES) },
      include: { emblematic: true },
    });
    if (ideology.emblematic.length >= MAX_EMBLEMATIC) return false;
    if (ideology.emblematic.some((e) => e.playerId === playerId)) return false;
    await prisma.emblematicPlayer.create({
      data: { ideologyId: ideology.id, playerId, retireYear },
    });
    return true;
  },

  async removeEmblematicPlayer(clubId: number, emblematicId: number) {
    const entry = await prisma.emblematicPlayer.findUnique({
      where: { id: emblematicId },
      include: { ideology: true },
    });
    if (!entry || entry.ideology.clubId !== clubId) throw new Error('Emblematic player not found');

    await prisma.emblematicPlayer.delete({ where: { id: emblematicId } });
    return this.getIdeology(clubId);
  },

  /**
   * C2 · Candidatos elegibles para emblemático: retirados EN el club (ClubLegend)
   * con ≥450 PJ en él y aún fuera del pool. Para el selector de IdeologyPage.
   */
  async getEligibleEmblematicCandidates(clubId: number) {
    const [legends, ideology] = await Promise.all([
      prisma.clubLegend.findMany({
        where: { clubId, playerId: { not: null } },
        orderBy: { legendScore: 'desc' },
      }),
      prisma.ideology.findUnique({ where: { clubId }, include: { emblematic: true } }),
    ]);
    const already = new Set((ideology?.emblematic ?? []).map((e) => e.playerId));
    const out: Array<{ playerId: number; name: string; position: string; matchesForClub: number; retireYear: number | null }> = [];
    for (const legend of legends) {
      if (!legend.playerId || already.has(legend.playerId)) continue;
      const matches = await matchesForClub(legend.playerId, clubId);
      if (matches >= MIN_EMBLEMATIC_MATCHES) {
        out.push({
          playerId: legend.playerId,
          name: legend.name,
          position: legend.position,
          matchesForClub: matches,
          retireYear: legend.retiredAt ? legend.retiredAt.getFullYear() : null,
        });
      }
    }
    return out;
  },

  /** Academy bonus for a club (called by academy service) */
  async getAcademyTalentBonus(clubId: number): Promise<number> {
    const ideology = await prisma.ideology.findUnique({
      where: { clubId },
      include: { emblematic: true },
    });
    return ideology ? ideology.emblematic.length * EMBLEMATIC_TALENT_BONUS_PER_PLAYER : 0;
  },
};
