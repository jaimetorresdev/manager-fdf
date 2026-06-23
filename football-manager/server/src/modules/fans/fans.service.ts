import prisma from '../../db/prisma';
import { lockClubRow } from '../market/transfer.core';
import { crossedIntoNewMonth } from '../game/tick.logic';
import { sortStandings } from '../game/standings';

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignType = 'familyDay' | 'schoolProgram' | 'vipHospitality' | 'cityCampaign' | 'derbyHype';

interface FanBaseShape {
  youngLow: number;
  youngMid: number;
  youngHigh: number;
  adultLow: number;
  adultMid: number;
  adultHigh: number;
}

interface CampaignSpec {
  type: CampaignType;
  label: string;
  cost: number;
  months: number;
  effects: Partial<FanBaseShape & { reputation: number }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Social mass growth per month based on squad prestige level.
 * Level 2: +240/month, Level 1: +120, Level 0: 0, Level -1: -120.
 */
const SOCIAL_MASS_MONTHLY: Record<string, number> = {
  '2': 240,
  '1': 120,
  '0': 0,
  '-1': -120,
};

const DISTURB_YOUNG_LOW_THRESHOLD = 0.35;
const DISTURB_BOTH_LOW_THRESHOLD = 0.65;
const DISTURBANCE_FINE_MIN = 150_000;
const DISTURBANCE_FINE_MAX = 1_500_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalFans(base: FanBaseShape): number {
  return (
    base.youngLow + base.youngMid + base.youngHigh +
    base.adultLow + base.adultMid + base.adultHigh
  );
}

function highClassFans(base: FanBaseShape): number {
  return base.youngHigh + base.adultHigh;
}

function initialFanBase(fans: number): FanBaseShape {
  return {
    youngLow: Math.round(fans * 0.18),
    youngMid: Math.round(fans * 0.07),
    youngHigh: Math.round(fans * 0.02),
    adultLow: Math.round(fans * 0.48),
    adultMid: Math.round(fans * 0.22),
    adultHigh: Math.round(fans * 0.05),
  };
}

function applyEffects(base: FanBaseShape, effects: Partial<FanBaseShape>): FanBaseShape {
  return {
    youngLow: Math.max(0, base.youngLow + (effects.youngLow ?? 0)),
    youngMid: Math.max(0, base.youngMid + (effects.youngMid ?? 0)),
    youngHigh: Math.max(0, base.youngHigh + (effects.youngHigh ?? 0)),
    adultLow: Math.max(0, base.adultLow + (effects.adultLow ?? 0)),
    adultMid: Math.max(0, base.adultMid + (effects.adultMid ?? 0)),
    adultHigh: Math.max(0, base.adultHigh + (effects.adultHigh ?? 0)),
  };
}

/**
 * Compute squad prestige level from average player talent:
 *   avg >= 75 → 2, >= 55 → 1, >= 40 → 0, else -1
 */
async function squadPrestigeLevel(clubId: number): Promise<number> {
  const players = await prisma.player.findMany({
    where: { clubId },
    select: { talent: true },
  });
  if (players.length === 0) return 0;
  const avg = players.reduce((s, p) => s + p.talent, 0) / players.length;
  if (avg >= 75) return 2;
  if (avg >= 55) return 1;
  if (avg >= 40) return 0;
  return -1;
}

function computeDisturbanceFine(base: FanBaseShape): number {
  const total = totalFans(base);
  if (total === 0) return 0;
  const youngLowFraction = base.youngLow / total;
  const bothLowFraction = (base.youngLow + base.adultLow) / total;

  if (
    youngLowFraction > DISTURB_YOUNG_LOW_THRESHOLD &&
    bothLowFraction > DISTURB_BOTH_LOW_THRESHOLD
  ) {
    const severity = Math.min(1, (youngLowFraction - DISTURB_YOUNG_LOW_THRESHOLD) * 5);
    return Math.round(DISTURBANCE_FINE_MIN + (DISTURBANCE_FINE_MAX - DISTURBANCE_FINE_MIN) * severity);
  }
  return 0;
}

function campaignSpec(type: CampaignType, fanCount: number): CampaignSpec {
  const scaled = (base: number) => Math.round(base + fanCount * 0.9);
  const specs: Record<CampaignType, CampaignSpec> = {
    familyDay: {
      type,
      label: 'Family matchday',
      cost: scaled(60_000),
      months: 1,
      effects: { youngLow: 420, youngMid: 120, adultLow: 280 },
    },
    schoolProgram: {
      type,
      label: 'School program',
      cost: scaled(85_000),
      months: 3,
      effects: { youngLow: 900, youngMid: 260, reputation: 1 },
    },
    vipHospitality: {
      type,
      label: 'VIP hospitality',
      cost: scaled(130_000),
      months: 2,
      effects: { adultHigh: 180, youngHigh: 35, reputation: 1 },
    },
    cityCampaign: {
      type,
      label: 'City campaign',
      cost: scaled(160_000),
      months: 2,
      effects: { adultLow: 850, adultMid: 320, reputation: 2 },
    },
    derbyHype: {
      type,
      label: 'Derby hype',
      cost: scaled(95_000),
      months: 1,
      effects: { youngLow: 260, adultLow: 360, adultMid: 180 },
    },
  };
  return specs[type];
}

const SEGMENT_META: Record<keyof FanBaseShape, { label: string; ticketYield: 'low' | 'medium' | 'high' }> = {
  youngLow: { label: 'Joven baja', ticketYield: 'low' },
  youngMid: { label: 'Joven media', ticketYield: 'medium' },
  youngHigh: { label: 'Joven alta', ticketYield: 'high' },
  adultLow: { label: 'Adulta baja', ticketYield: 'low' },
  adultMid: { label: 'Adulta media', ticketYield: 'medium' },
  adultHigh: { label: 'Adulta alta', ticketYield: 'high' },
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

async function activeInGameDate(): Promise<Date> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true },
  });
  return state?.inGameDate ?? new Date();
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const fansService = {
  async getFans(clubId: number) {
    const [club, inGameDate] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        include: { fanBase: { include: { campaigns: true } } },
      }),
      activeInGameDate(),
    ]);
    if (!club) throw new Error('Club not found');

    const base = club.fanBase ?? (await prisma.fanBase.create({
      data: { clubId, ...initialFanBase(club.fans) },
      include: { campaigns: true },
    }));

    const shape: FanBaseShape = {
      youngLow: base.youngLow,
      youngMid: base.youngMid,
      youngHigh: base.youngHigh,
      adultLow: base.adultLow,
      adultMid: base.adultMid,
      adultHigh: base.adultHigh,
    };
    const fanCount = totalFans(shape);
    const activeCampaigns = base.campaigns.filter((c) => c.expiresAt > inGameDate);
    const disturbanceFine = computeDisturbanceFine(shape);

    return {
      id: base.id,
      segments: shape,
      summary: {
        totalFans: fanCount,
        highClassFans: highClassFans(shape),
        youngFans: shape.youngLow + shape.youngMid + shape.youngHigh,
        adultFans: shape.adultLow + shape.adultMid + shape.adultHigh,
        youngLowPct: fanCount > 0 ? Math.round((shape.youngLow / fanCount) * 100) : 0,
        bothLowPct: fanCount > 0
          ? Math.round(((shape.youngLow + shape.adultLow) / fanCount) * 100)
          : 0,
        socialMass: club.socialMass,
        reputation: club.reputation,
        disturbanceRisk: disturbanceFine > 0,
        disturbanceFineEstimate: disturbanceFine,
      },
      activeCampaigns,
      budget: club.budget,
      availableCampaigns: (
        ['familyDay', 'schoolProgram', 'vipHospitality', 'cityCampaign', 'derbyHype'] as CampaignType[]
      ).map((t) => campaignSpec(t, fanCount)),
    };
  },

  async getAnalysis(clubId: number) {
    const fanState = await this.getFans(clubId);
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, name: true, shortName: true, badge: true, country: true, fans: true, socialMass: true, highClass: true },
    });
    if (!club) throw new Error('Club not found');

    const [snapshotsDesc, activeState] = await Promise.all([
      prisma.financeSnapshot.findMany({
        where: { clubId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 12,
      }),
      prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true } }),
    ]);
    const competitionRows = activeState
      ? await prisma.standing.findMany({
        where: { clubId, competition: { seasonId: activeState.seasonId } },
        select: { competitionId: true },
      })
      : [];
    const competitionIds = competitionRows.map(row => row.competitionId);
    const peerRows = competitionIds.length > 0
      ? await prisma.standing.findMany({
        where: { competitionId: { in: competitionIds } },
        select: { clubId: true },
      })
      : [];
    const peerIds = Array.from(new Set([clubId, ...peerRows.map(row => row.clubId)]));
    const peerClubs = await prisma.club.findMany({
      where: peerIds.length > 1 ? { id: { in: peerIds } } : { country: club.country },
      select: { id: true, name: true, shortName: true, badge: true, fans: true, socialMass: true, highClass: true, reputation: true },
      orderBy: [{ fans: 'desc' }, { reputation: 'desc' }],
      take: 30,
    });

    const total = fanState.summary.totalFans;
    const ticketRevenueLast6 = snapshotsDesc.slice(0, 6).reduce((sum, row) => sum + row.ticketRevenue, 0);
    const peerComparison = peerClubs
      .sort((a, b) => b.fans - a.fans || b.socialMass - a.socialMass)
      .map((row, index) => ({
        club: { id: row.id, name: row.name, shortName: row.shortName, badge: row.badge },
        fans: row.fans,
        socialMass: row.socialMass,
        highClass: row.highClass,
        reputation: row.reputation,
        rank: index + 1,
      }));
    const ownPeer = peerComparison.find(row => row.club.id === clubId);

    return {
      club: { id: club.id, name: club.name, shortName: club.shortName, badge: club.badge },
      summary: {
        totalFans: total,
        socialMass: club.socialMass,
        highClassFans: club.highClass,
        ticketRevenueLast6,
        ticketRevenuePerFan: total > 0 ? Math.round((ticketRevenueLast6 / total) * 100) / 100 : 0,
        rankInPeerGroup: ownPeer?.rank ?? null,
        peerClubs: peerComparison.length,
      },
      segments: (Object.entries(fanState.segments) as Array<[keyof FanBaseShape, number]>).map(([id, fans]) => ({
        id,
        label: SEGMENT_META[id].label,
        fans,
        pct: pct(fans, total),
        ticketYield: SEGMENT_META[id].ticketYield,
        risk: id === 'youngLow' && pct(fans, total) > Math.round(DISTURB_YOUNG_LOW_THRESHOLD * 100)
          ? 'disturbance'
          : null,
      })),
      evolution: snapshotsDesc
        .slice()
        .reverse()
        .map(row => ({
          week: row.week,
          season: row.season,
          budget: row.budget,
          income: row.income,
          expenses: row.expenses,
          ticketRevenue: row.ticketRevenue,
          createdAt: row.createdAt,
        })),
      peerComparison,
      uiNeed: '// NECESITO: Antigravity debe ampliar FansPage con pirámide grande, evolución, conversión taquilla y comparativa.',
    };
  },

  async startCampaign(clubId: number, type: CampaignType) {
    const inGameDate = await activeInGameDate();

    await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const club = await tx.club.findUnique({
        where: { id: clubId },
        include: { fanBase: { include: { campaigns: true } } },
      });
      if (!club) throw new Error('Club not found');

      const base = club.fanBase ?? await tx.fanBase.create({
        data: { clubId, ...initialFanBase(club.fans) },
        include: { campaigns: true },
      });

      const current: FanBaseShape = {
        youngLow: base.youngLow,
        youngMid: base.youngMid,
        youngHigh: base.youngHigh,
        adultLow: base.adultLow,
        adultMid: base.adultMid,
        adultHigh: base.adultHigh,
      };

      const spec = campaignSpec(type, totalFans(current));
      const duplicateInTx = await tx.fanCampaign.findFirst({
        where: { fanBaseId: base.id, type, expiresAt: { gt: inGameDate } },
        select: { id: true },
      });
      if (duplicateInTx) throw new Error('La campaña ya está activa.');

      const { reputation: repDelta, ...fanEffects } = spec.effects;
      const next = applyEffects(current, fanEffects as Partial<FanBaseShape>);
      const nextTotal = totalFans(next);
      // AUDIT 5.7: `socialMass` NO es un alias de `totalFans`: prensa (press.service) e
      // ideología (ideology.service) la incrementan de forma independiente. Reescribirla a
      // `nextTotal` borraba esas variaciones acumuladas. Se aplica el DELTA de la campaña
      // (incremento de masa social = ganancia de aficionados) en vez de sobrescribir.
      const fanDelta = nextTotal - totalFans(current);

      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: spec.cost } },
        data: {
          budget: { decrement: spec.cost },
          cash: { decrement: spec.cost },
          fans: nextTotal,
          socialMass: { increment: fanDelta },
          highClass: highClassFans(next),
          reputation: { increment: repDelta ?? 0 },
        },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente.');
      await tx.fanBase.update({ where: { id: base.id }, data: next });
      await tx.fanCampaign.create({
        data: {
          fanBaseId: base.id,
          type: spec.type,
          cost: spec.cost,
          expiresAt: new Date(inGameDate.getTime() + spec.months * 30 * 24 * 60 * 60 * 1000),
        },
      });
    });

    return this.getFans(clubId);
  },

  /**
   * Monthly tick hook: social mass update + disturbance fine.
   * Only acts on month boundary (inGameDate.getDate() === 1).
   * Called from game.service.ts processTick() (wiring in INTEGRATION_fase2.md).
   */
  async advanceTurn(prevDate: Date, inGameDate: Date): Promise<{ events: string[] }> {
    const events: string[] = [];
    if (!crossedIntoNewMonth(prevDate, inGameDate)) return { events };

    const clubs = await prisma.club.findMany({
      where: { fanBase: { isNot: null } },
      include: { fanBase: true },
    });

    for (const club of clubs) {
      if (!club.fanBase) continue;

      const base: FanBaseShape = {
        youngLow: club.fanBase.youngLow,
        youngMid: club.fanBase.youngMid,
        youngHigh: club.fanBase.youngHigh,
        adultLow: club.fanBase.adultLow,
        adultMid: club.fanBase.adultMid,
        adultHigh: club.fanBase.adultHigh,
      };

      const prestigeLevel = await squadPrestigeLevel(club.id);
      const monthlyDelta = SOCIAL_MASS_MONTHLY[String(prestigeLevel)] ?? 0;

      let updatedBase = base;
      if (monthlyDelta !== 0) {
        const total = totalFans(base);
        const factor = monthlyDelta / Math.max(1, total);
        updatedBase = {
          youngLow: Math.max(0, Math.round(base.youngLow + base.youngLow * factor)),
          youngMid: Math.max(0, Math.round(base.youngMid + base.youngMid * factor)),
          youngHigh: Math.max(0, Math.round(base.youngHigh + base.youngHigh * factor)),
          adultLow: Math.max(0, Math.round(base.adultLow + base.adultLow * factor)),
          adultMid: Math.max(0, Math.round(base.adultMid + base.adultMid * factor)),
          adultHigh: Math.max(0, Math.round(base.adultHigh + base.adultHigh * factor)),
        };
        const nextTotal = totalFans(updatedBase);

        await prisma.fanBase.update({ where: { id: club.fanBase.id }, data: updatedBase });
        await prisma.club.update({
          where: { id: club.id },
          // AUDIT 5.7: aplicar el DELTA de crecimiento mensual a `socialMass` (no
          // sobrescribir con `nextTotal`), para no borrar los incrementos independientes
          // de prensa/ideología. `fans` sí refleja el total cacheado de la FanBase.
          data: { fans: nextTotal, socialMass: { increment: nextTotal - total }, highClass: highClassFans(updatedBase) },
        });
        events.push(`fans:${club.id}:delta:${monthlyDelta >= 0 ? '+' : ''}${monthlyDelta}`);
      }

      // Disturbance check
      const fine = computeDisturbanceFine(updatedBase);
      if (fine > 0) {
        // AUDIT 5.7-6: condicionar la multa al saldo POSITIVO disponible para que la
        // multa mensual recurrente no empuje budget/cash a negativo sin límite.
        const appliedFine = Math.min(fine, Math.max(0, club.budget));
        if (appliedFine > 0) {
          await prisma.club.update({
            where: { id: club.id },
            data: { budget: { decrement: appliedFine }, cash: { decrement: appliedFine } },
          });
          events.push(`fans:${club.id}:disturbance:fine:${appliedFine}`);
        }
      }
    }

    return { events };
  },

  // ─── QW-4 · GET /api/fans/mood ──────────────────────────────────────────────
  // Humor de la afición SERVER-SIDE: fuente ÚNICA de verdad para cualquier
  // reacción de afición que pinte el front. Reglas deterministas documentadas
  // en API_UI.md §BloqueQ: base 50 · forma últimos 5 (+6/+1/−6) · posición vs
  // expectativa por reputación (±3 por puesto, tope ±15) · eliminación de
  // copa/europea −10 · fichaje sonado reciente +8. green ≥65 · yellow 40-64 ·
  // red <40.
  async getMood(clubId: number): Promise<{ mood: 'green' | 'yellow' | 'red'; score: number; reasons: string[] }> {
    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { seasonId: true, inGameDate: true, turn: true },
    });
    if (!state) return { mood: 'yellow', score: 50, reasons: [] };

    const recentTurnFloor = Math.max(0, (state.turn ?? 0) - 14);
    const [recentMatches, myStanding, knockoutMatches, marqueeSigning] = await Promise.all([
      // Forma: últimos 5 jugados de la temporada activa
      prisma.match.findMany({
        where: {
          status: 'played',
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
          matchday: { competition: { seasonId: state.seasonId } },
        },
        orderBy: { id: 'desc' },
        take: 5,
        select: { homeClubId: true, homeGoals: true, awayGoals: true },
      }),
      // Posición real en mi liga
      prisma.standing.findFirst({
        where: { clubId, competition: { seasonId: state.seasonId, type: 'league' } },
        select: { competitionId: true },
      }),
      // Eliminatorias jugadas esta temporada (para detectar eliminación)
      prisma.match.findMany({
        where: {
          status: 'played',
          matchday: { isKnockout: true, competition: { seasonId: state.seasonId } },
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        },
        orderBy: { id: 'desc' },
        take: 5,
        select: { homeClubId: true, homeGoals: true, awayGoals: true },
      }),
      // Fichaje sonado: compra aceptada ≥1M en los últimos 7 días in-game
      prisma.transferOffer.findFirst({
        where: {
          fromClubId: clubId,
          status: { in: ['accepted', 'accepted_pending_window'] },
          amount: { gte: 1_000_000 },
          turn: { gte: recentTurnFloor },
        },
        orderBy: { updatedAt: 'desc' },
        select: { player: { select: { name: true } } },
      }),
    ]);

    let score = 50;
    const reasons: string[] = [];

    // 1 · Forma reciente (+6 V, +1 E, −6 D) + racha para el texto
    const results = recentMatches.map((m) => {
      const own = m.homeClubId === clubId ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
      const other = m.homeClubId === clubId ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
      return own > other ? 'W' : own === other ? 'D' : 'L';
    });
    for (const r of results) score += r === 'W' ? 6 : r === 'D' ? 1 : -6;
    if (results.length > 0) {
      let streak = 1;
      while (streak < results.length && results[streak] === results[0]) streak++;
      if (results[0] === 'W' && streak >= 2) reasons.push(`${streak} victorias seguidas`);
      else if (results[0] === 'L' && streak >= 2) reasons.push(`${streak} derrotas seguidas`);
      else if (results[0] === 'W') reasons.push('Victoria en el último partido');
      else if (results[0] === 'L') reasons.push('Derrota en el último partido');
    }

    // 2 · Posición vs expectativa (expectativa = ranking de reputación en mi liga)
    if (myStanding) {
      const [table, leagueClubs] = await Promise.all([
        prisma.standing.findMany({
          where: { competitionId: myStanding.competitionId },
          select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
        }),
        prisma.standing.findMany({
          where: { competitionId: myStanding.competitionId },
          select: { club: { select: { id: true, reputation: true } } },
        }),
      ]);
      const sorted = sortStandings(table);
      const actual = sorted.findIndex((row) => row.clubId === clubId) + 1;
      const byReputation = [...leagueClubs].sort((a, b) =>
        b.club.reputation - a.club.reputation || a.club.id - b.club.id);
      const expected = byReputation.findIndex((row) => row.club.id === clubId) + 1;
      if (actual > 0 && expected > 0) {
        const delta = expected - actual; // positivo = por encima de lo esperado
        score += Math.max(-15, Math.min(15, delta * 3));
        if (delta >= 2) reasons.push(`${delta} puestos por encima de lo esperado`);
        else if (delta <= -2) reasons.push(`${Math.abs(delta)} puestos por debajo de lo esperado`);
      }
    }

    // 3 · Eliminación de copa/europea esta temporada
    const eliminated = knockoutMatches.some((m) => {
      const own = m.homeClubId === clubId ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
      const other = m.homeClubId === clubId ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
      return other > own;
    });
    if (eliminated) {
      score -= 10;
      reasons.push('Eliminados de la copa');
    }

    // 4 · Fichaje sonado reciente
    if (marqueeSigning) {
      score += 8;
      reasons.push(`El fichaje de ${marqueeSigning.player.name} ilusiona a la grada`);
    }

    // 5 · N4-2 sabotaje informativo (crisis de vestuario plantada)
    const { rumorSabotageService } = await import('../market/rumorSabotage.service');
    const sabotagePenalty = await rumorSabotageService.moodPenaltyForClub(clubId);
    if (sabotagePenalty > 0) {
      score -= sabotagePenalty;
      reasons.push('La prensa habla de crisis en el vestuario');
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const mood: 'green' | 'yellow' | 'red' = score >= 65 ? 'green' : score >= 40 ? 'yellow' : 'red';
    return { mood, score, reasons: reasons.slice(0, 4) };
  },
};
