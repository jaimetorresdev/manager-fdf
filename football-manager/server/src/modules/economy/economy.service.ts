// ─── Economy Service — Fase 3 ─────────────────────────────────────────────────
import prisma from '../../db/prisma';
import { roundMoney } from '../../lib/roundMoney';
import { playerWage } from '../../lib/playerWage';
import {
  clubValuation,
  gateIncome,
  commercialBreakdown,
  outsourcingMonthlyCost,
  sponsorMonthlyIncome,
  sponsorBreakPenalty,
  calcSponsorYearlyIncome,
  monthlySalaries,
  buildForecast,
  ClubFinanceInput,
  salaryCap,
} from '../game/tick.logic';
import { COMPETITION_PRIZES, competitionPrizeTier, gatePerMatch, type CompetitionPrizeTier } from './competitionIncome.constants';
import { lockClubRow } from '../market/transfer.core';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface EconomySnapshot {
  clubId: number;
  budget: number;
  valuation: number;
  salaryCapMonthly: number;
  currentMonthlySalaries: number;
  salaryCapRemaining: number;
  monthlyIncome: {
    gate: number;
    tv: number;
    sponsorship: number;
    merch: number;
    total: number;
  };
  monthlyExpenses: {
    salaries: number;
    outsourcing: number;
    total: number;
  };
  netMonthly: number;
  sponsors: SponsorSummary[];
  outsourcings: OutsourcingSummary[];
  managerWealth: number;
}

export interface SponsorSummary {
  id: number;
  type: string;
  years: number;
  percentage: number;
  yearlyIncome: number;
  monthlyIncome: number;
  monthsRemaining: number;  // derivado de createdAt + years
  isActive: boolean;
}

export interface OutsourcingSummary {
  id: number;
  type: string;
  active: boolean;
  monthlyCost: number;
}

export interface CompetitionIncomeSummary {
  id: number;
  clubId: number;
  week: number;
  competition: string;
  concept: string;
  amount: number;
  createdAt: Date;
}

// ─── Helpers privados ─────────────────────────────────────────────────────────

async function activeInGameDate(): Promise<Date> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true },
  });
  return state?.inGameDate ?? new Date();
}

/** Meses restantes de un SponsorContract, calculado contra la fecha in-game. */
export function deriveSponsorMonthsRemaining(createdAt: Date, years: number, at: Date): number {
  const totalMonths  = years * 12;
  const monthsElapsed = (at.getUTCFullYear() - createdAt.getUTCFullYear()) * 12
                      + (at.getUTCMonth() - createdAt.getUTCMonth());
  return Math.max(0, totalMonths - monthsElapsed);
}

function buildFinanceInput(club: {
  stadiumCapacity: number;
  fans: number;
  socialMass: number;
  highClass: number;
  reputation: number;
  countryLevel: number;
  ticketPriceLevel: string;
}): ClubFinanceInput {
  const valuation = clubValuation(club.socialMass, club.highClass, club.countryLevel, club.reputation);
  return {
    stadiumCapacity:  club.stadiumCapacity,
    fans:             club.fans,
    socialMass:       club.socialMass,
    highClass:        club.highClass,
    reputation:       club.reputation,
    countryLevel:     club.countryLevel,
    ticketPriceLevel: club.ticketPriceLevel,
    valuation,
  };
}



const SPONSOR_TYPE_PCT_MAP: Record<string, number> = { tv: 0.04, ads: 0.03, merch: 0.03 };
const SPONSOR_TIER_MULT_MAP: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4 };
const COMPETITION_INCOME_PREFIX = 'competition_income';

type PrizeMatchday = { number?: number; type?: string; isKnockout?: boolean; dateLabel?: string | null };

function roundKey(match: { round: string | null; matchday?: PrizeMatchday | null }): string {
  if (match.round) return match.round;
  if (match.matchday?.type && match.matchday.type !== 'league') return match.matchday.type;
  return `round_${match.matchday?.number ?? 1}`;
}

function displayRound(match: { round: string | null; matchday?: PrizeMatchday | null }): string {
  if (match.matchday?.dateLabel) return match.matchday.dateLabel;
  if (match.round) return match.round.replace(/_/g, ' ');
  return `J${match.matchday?.number ?? '?'}`;
}

function resultForClub(match: { homeClubId: number; awayClubId: number; homeGoals: number | null; awayGoals: number | null }, clubId: number): 'win' | 'draw' | 'loss' {
  const own = clubId === match.homeClubId ? match.homeGoals : match.awayGoals;
  const other = clubId === match.homeClubId ? match.awayGoals : match.homeGoals;
  if ((own ?? 0) > (other ?? 0)) return 'win';
  if ((own ?? 0) === (other ?? 0)) return 'draw';
  return 'loss';
}

function prizeFor(tier: CompetitionPrizeTier, match: {
  matchday?: PrizeMatchday | null;
  round: string | null;
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
}, clubId: number): { amount: number; concept: string } | null {
  const result = resultForClub(match, clubId);
  const round = roundKey(match);
  if (tier === 'ucl' || tier === 'uel' || tier === 'uecl') {
    const table = COMPETITION_PRIZES[tier];
    if (!match.matchday?.isKnockout && !match.round) {
      const amount = result === 'win' ? table.leagueWin : result === 'draw' ? table.leagueDraw : 0;
      return amount > 0 ? { amount, concept: `Premio ${tier.toUpperCase()} ${displayRound(match)}` } : null;
    }
    const amount = table.rounds[round] ?? 0;
    return amount > 0 ? { amount, concept: `Premio ${tier.toUpperCase()} ${displayRound(match)}` } : null;
  }
  if (tier === 'domestic_cup') {
    // AUDIT 5.2: el premio de copa solo se abona en rondas ELIMINATORIAS. Antes
    // `defaultRound` pagaba premio a cualquier ronda no mapeada (incluidas fases de
    // grupos), inflando ingresos. Ahora: ronda no-eliminatoria explícita → null;
    // ronda mapeada → su importe; ronda eliminatoria sin mapear → defaultRound.
    if (match.matchday?.isKnockout === false) return null;
    const mapped = COMPETITION_PRIZES.domesticCup.rounds[round];
    const amount = mapped ?? (match.matchday?.isKnockout === true ? COMPETITION_PRIZES.domesticCup.defaultRound : 0);
    return amount > 0 ? { amount, concept: `Premio Copa ${displayRound(match)}` } : null;
  }
  if (tier === 'super_cup') {
    const amount = COMPETITION_PRIZES.superCup.participation + (result === 'win' ? COMPETITION_PRIZES.superCup.winnerBonus : 0);
    return { amount, concept: `Bolsa Supercopa ${displayRound(match)}` };
  }
  return null;
}

function snapshotKey(matchId: number, concept: string): string {
  return `${COMPETITION_INCOME_PREFIX}:${matchId}:${concept}`;
}

// roundMoney imported from lib/roundMoney

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function salaryRisk(ratioPct: number): 'healthy' | 'watch' | 'risk' {
  if (ratioPct <= 55) return 'healthy';
  if (ratioPct <= 75) return 'watch';
  return 'risk';
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const economyService = {

  // ─── Snapshot de economía ─────────────────────────────────────────────────

  async getEconomy(clubId: number): Promise<EconomySnapshot> {
    const [club, inGameDate] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        include: {
          sponsors:     true,
          outsourcings: true,
          players:      { select: { salary: true, wage: true } },
          coaches:      { select: { salary: true } },
          manager:      { select: { wealth: true } },
        },
      }),
      activeInGameDate(),
    ]);
    if (!club) throw new Error('Club not found');

    const finInput = buildFinanceInput(club);

    // Derivar meses restantes de SponsorContract (sin campo monthsRemaining en BD)
    const sponsorWithMonths = club.sponsors.map(s => ({
      ...s,
      monthsRem: deriveSponsorMonthsRemaining(s.createdAt, s.years, inGameDate),
    }));

    const activeSponsorMonthly = sponsorWithMonths
      .filter(s => s.monthsRem > 0)
      .reduce((sum, s) => sum + sponsorMonthlyIncome(s.yearlyIncome), 0);

    // Subcontrataciones activas
    const activeOutsourcingTypes = club.outsourcings.filter(o => o.active).map(o => o.type);
    const outsourcingCosts = outsourcingMonthlyCost(activeOutsourcingTypes, club.countryLevel, club.stadiumCapacity);

    // Ingresos
    const gate       = gateIncome(finInput);
    const commercial = commercialBreakdown(finInput, activeSponsorMonthly);

    // Salarios — AUDIT 1.2/H-7: usar el helper canónico `playerWage` (wage ?? salary)
    // para que la masa salarial coincida con economy/advisor/decision-signal.
    const playerSalaries = club.players.map(p => playerWage(p));
    const coachSalaries  = club.coaches.map(c => c.salary);
    const totalSalaries  = monthlySalaries(playerSalaries, coachSalaries);
    const cap = salaryCap(club.budget);

    const sponsorSummaries: SponsorSummary[] = sponsorWithMonths.map(s => ({
      id:             s.id,
      type:           s.type,
      years:          s.years,
      percentage:     s.percentage,
      yearlyIncome:   s.yearlyIncome,
      monthlyIncome:  sponsorMonthlyIncome(s.yearlyIncome),
      monthsRemaining: s.monthsRem,
      isActive:       s.monthsRem > 0,
    }));

    const outsourcingSummaries: OutsourcingSummary[] = club.outsourcings.map(o => ({
      id: o.id, type: o.type, active: o.active,
      monthlyCost: o.active ? outsourcingMonthlyCost([o.type], club.countryLevel, club.stadiumCapacity).total : 0,
    }));

    return {
      clubId,
      budget:                 club.budget,
      valuation:              finInput.valuation ?? 0,
      salaryCapMonthly:       cap,
      currentMonthlySalaries: totalSalaries,
      salaryCapRemaining:     Math.max(0, cap - totalSalaries),
      monthlyIncome: {
        gate,
        tv:          commercial.tv,
        sponsorship: commercial.sponsorship,
        merch:       commercial.merch,
        total:       gate + commercial.total,
      },
      monthlyExpenses: {
        salaries:    totalSalaries,
        outsourcing: outsourcingCosts.total,
        total:       totalSalaries + outsourcingCosts.total,
      },
      netMonthly:    gate + commercial.total - totalSalaries - outsourcingCosts.total,
      sponsors:      sponsorSummaries,
      outsourcings:  outsourcingSummaries,
      managerWealth: club.manager?.wealth ?? 0,
    };
  },

  async getCompetitionIncome(clubId: number): Promise<CompetitionIncomeSummary[]> {
    const rows = await prisma.financeSnapshot.findMany({
      where: {
        clubId,
        season: { startsWith: COMPETITION_INCOME_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(row => {
      const [, , competition = 'Competición', concept = 'Premio'] = row.season.split(':');
      return {
        id: row.id,
        clubId: row.clubId,
        week: row.week,
        competition,
        concept,
        amount: row.income,
        createdAt: row.createdAt,
      };
    });
  },

  // NECESITO: Antigravity/tick debe llamar settleCompetitionIncome({ matchId })
  // al cerrar cada partido europeo/copero, o settleCompetitionIncome({ roundId })
  // al cerrar una jornada/ronda completa.
  async settleCompetitionIncome(input: { matchId?: number; roundId?: number }) {
    if (!input.matchId && !input.roundId) throw new Error('matchId or roundId required');

    const matches = await prisma.match.findMany({
      where: {
        status: 'played',
        ...(input.matchId ? { id: input.matchId } : { matchdayId: input.roundId }),
      },
      include: {
        homeClub: true,
        awayClub: true,
        matchday: { include: { competition: true } },
      },
    });

    const state = await prisma.gameState.findFirst({
      where: { isActive: true },
      select: { week: true },
    });
    const week = state?.week ?? 0;
    const created: CompetitionIncomeSummary[] = [];
    // AUDIT 5.2: el `budget` del snapshot debe reflejar el SALDO CORRIENTE tras el premio,
    // no `club.budget` leído al inicio de la pasada. Con varios premios al mismo club en
    // una sola llamada (participación + premio de ronda, o varias jornadas), cada snapshot
    // usaba la misma base estancada y el histórico divergía del saldo real. Este acumulador
    // mantiene el saldo corriente por club y solo avanza cuando el incremento se persiste.
    const runningBudget = new Map<number, number>();

    for (const match of matches) {
      const competition = match.matchday?.competition;
      if (!competition || match.homeGoals == null || match.awayGoals == null) continue;
      const tier = competitionPrizeTier(competition);
      if (tier === 'none') continue;

      for (const side of [
        { club: match.homeClub, clubId: match.homeClubId },
        { club: match.awayClub, clubId: match.awayClubId },
      ]) {
        // Saldo corriente del club en esta pasada (AUDIT 5.2). Se inicializa con el
        // budget leído en la query y avanza con cada premio efectivamente acreditado.
        let acc = runningBudget.get(side.clubId) ?? side.club.budget;
        // AUDIT 5.2-1: premio de PARTICIPACIÓN continental (UCL/UEL/UECL), pagado
        // UNA sola vez por club/temporada al disputarse su primer encuentro en esa
        // competición. El idempotency-guard es la `season` string estable
        // `participation:<competitionId>:<seasonId>` (independiente de la semana),
        // así que aunque el club juegue varias jornadas continentales solo cobra una vez.
        if (tier === 'ucl' || tier === 'uel' || tier === 'uecl') {
          const participation = COMPETITION_PRIZES[tier].participation;
          if (participation > 0) {
            // Estructura `prefix:<token>:<shortName>:<concept>` para que getCompetitionIncome
            // (split por ':') muestre competición y concepto correctos; el token
            // `participation-<compId>-<seasonId>` es estable por temporada (idempotente).
            const partKey = `${COMPETITION_INCOME_PREFIX}:participation-${competition.id}-${competition.seasonId}:${competition.shortName}:Participación`;
            const alreadyPaid = await prisma.financeSnapshot.findFirst({
              where: { clubId: side.clubId, season: partKey },
              select: { id: true },
            });
            if (!alreadyPaid) {
              try {
                await prisma.$transaction([
                  prisma.club.update({
                    where: { id: side.clubId },
                    data: { budget: { increment: participation }, cash: { increment: participation } },
                  }),
                  prisma.financeSnapshot.create({
                    data: {
                      clubId: side.clubId,
                      week,
                      season: partKey,
                      budget: acc + participation,
                      income: participation,
                      tvRevenue: participation,
                    },
                  }),
                ]);
                acc += participation;
                runningBudget.set(side.clubId, acc);
                created.push({
                  id: 0,
                  clubId: side.clubId,
                  week,
                  competition: competition.shortName,
                  concept: `Participación ${tier.toUpperCase()}`,
                  amount: participation,
                  createdAt: new Date(),
                });
              } catch (err: any) {
                if (err?.code !== 'P2002') throw err;
              }
            }
          }
        }

        const prize = prizeFor(tier, match, side.clubId);
        if (!prize || prize.amount <= 0) continue;

        // AUDIT 1.3: la "taquilla doble" de copa debe contarse UNA vez por
        // ELIMINATORIA, no una por partido. Una eliminatoria a doble partido son
        // dos Match (leg 1 y leg 2), ambos isKnockout, con snapshotKey distinta
        // (por match.id) → antes el extra se cobraba en AMBOS legs. Se ancla al leg
        // de ida / partido único; el de vuelta (leg 2) ya no lo cobra.
        const isReturnLeg = match.leg === 2 || match.matchday?.leg === 2;
        // AUDIT H-10/1.3: `gateIncome` es taquilla MENSUAL (2 partidos). La eliminatoria
        // es UN partido en casa → se acredita la taquilla de un único encuentro.
        const extraGate = (tier === 'domestic_cup' && match.matchday?.isKnockout && !isReturnLeg)
          ? gatePerMatch(gateIncome(buildFinanceInput(side.club)))
          : 0;
        const concept = extraGate > 0 ? `${prize.concept} + taquilla doble` : prize.concept;
        const key = snapshotKey(match.id, `${competition.shortName}:${concept}`);
        const existing = await prisma.financeSnapshot.findFirst({
          where: { clubId: side.clubId, season: key },
          select: { id: true },
        });
        if (existing) continue;

        const amount = prize.amount + extraGate;

        try {
          await prisma.$transaction([
            prisma.club.update({
              where: { id: side.clubId },
              data: { budget: { increment: amount }, cash: { increment: amount } },
            }),
            prisma.financeSnapshot.create({
              data: {
                clubId: side.clubId,
                week,
                season: key,
                budget: acc + amount,
                income: amount,
                ticketRevenue: extraGate,
                tvRevenue: prize.amount,
              },
            }),
          ]);
        } catch (err: any) {
          if (err?.code === 'P2002') continue;
          throw err;
        }

        acc += amount;
        runningBudget.set(side.clubId, acc);

        created.push({
          id: 0,
          clubId: side.clubId,
          week,
          competition: competition.shortName,
          concept,
          amount,
          createdAt: new Date(),
        });
      }
    }

    return { settled: created.length, incomes: created };
  },

  // ─── Precio de entradas ───────────────────────────────────────────────────

  async updateTicketPrices(clubId: number, level: string): Promise<void> {
    if (!['low', 'medium', 'high'].includes(level)) throw new Error('Invalid level: must be low | medium | high');
    await prisma.club.update({ where: { id: clubId }, data: { ticketPriceLevel: level } });
  },

  // ─── Contratos de patrocinio ──────────────────────────────────────────────

  async listSponsors(clubId: number): Promise<SponsorSummary[]> {
    const [sponsors, inGameDate] = await Promise.all([
      prisma.sponsorContract.findMany({ where: { clubId } }),
      activeInGameDate(),
    ]);
    return sponsors.map(s => {
      const monthsRem = deriveSponsorMonthsRemaining(s.createdAt, s.years, inGameDate);
      return {
        id:              s.id,
        type:            s.type,
        years:           s.years,
        percentage:      s.percentage,
        yearlyIncome:    s.yearlyIncome,
        monthlyIncome:   sponsorMonthlyIncome(s.yearlyIncome),
        monthsRemaining: monthsRem,
        isActive:        monthsRem > 0,
      };
    });
  },

  async signSponsor(clubId: number, type: string, years: number, tier: string = 'A'): Promise<SponsorSummary> {
    if (!['tv', 'ads', 'merch'].includes(type)) throw new Error('Invalid type: must be tv | ads | merch');
    if (![1, 2, 3].includes(years))             throw new Error('Invalid years: must be 1, 2 or 3');
    if (!['A', 'B', 'C'].includes(tier))        throw new Error('Invalid tier: must be A | B | C');

    const inGameDate = await activeInGameDate();
    const sponsor = await prisma.$transaction(async (tx) => {
      await lockClubRow(tx, clubId);
      const club = await tx.club.findUnique({
        where:  { id: clubId },
        select: { socialMass: true, highClass: true, countryLevel: true, reputation: true },
      });
      if (!club) throw new Error('Club not found');

      const existingContracts = await tx.sponsorContract.findMany({ where: { clubId, type } });
      const hasActive = existingContracts.some(s => deriveSponsorMonthsRemaining(s.createdAt, s.years, inGameDate) > 0);
      if (hasActive) throw new Error(`Ya tienes un contrato de tipo "${type}" activo.`);

      const valuation    = clubValuation(club.socialMass, club.highClass, club.countryLevel, club.reputation);
      const yearlyIncome = calcSponsorYearlyIncome(valuation, type, tier);
      const percentage   = (SPONSOR_TYPE_PCT_MAP[type] ?? 0.03) * (SPONSOR_TIER_MULT_MAP[tier] ?? 1.0);

      return tx.sponsorContract.create({
        data: { clubId, type, years, percentage, yearlyIncome },
      });
    });

    const monthsRem = deriveSponsorMonthsRemaining(sponsor.createdAt, sponsor.years, inGameDate);
    return {
      id:              sponsor.id,
      type:            sponsor.type,
      years:           sponsor.years,
      percentage:      sponsor.percentage,
      yearlyIncome:    sponsor.yearlyIncome,
      monthlyIncome:   sponsorMonthlyIncome(sponsor.yearlyIncome),
      monthsRemaining: monthsRem,
      isActive:        monthsRem > 0,
    };
  },

  /**
   * Romper un contrato anticipadamente.
   * Penalización: 8% × meses restantes × años originales del contrato.
   * Se elimina el contrato de la BD (o se podría anotar una fecha de cancelación).
   */
  async breakSponsor(clubId: number, sponsorId: number): Promise<{ penalty: number }> {
    const sponsor = await prisma.sponsorContract.findFirst({ where: { id: sponsorId, clubId } });
    if (!sponsor) throw new Error('Sponsor contract not found');

    const inGameDate = await activeInGameDate();
    const monthsRem = deriveSponsorMonthsRemaining(sponsor.createdAt, sponsor.years, inGameDate);
    if (monthsRem <= 0) throw new Error('Contract already expired');

    const penalty = sponsorBreakPenalty(sponsor.yearlyIncome, monthsRem, sponsor.years);

    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { budget: true } });
    if (!club || club.budget < penalty) throw new Error(`No tienes fondos para pagar la penalización (${penalty} €).`);

    await prisma.$transaction(async (tx) => {
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: penalty } },
        data: { budget: { decrement: penalty }, cash: { decrement: penalty } },
      });
      if (charged.count === 0) throw new Error(`No tienes fondos para pagar la penalización (${penalty} €).`);
      await tx.sponsorContract.delete({ where: { id: sponsorId } });
    });

    return { penalty };
  },

  // ─── Subcontrataciones ────────────────────────────────────────────────────

  async getOutsourcings(clubId: number): Promise<OutsourcingSummary[]> {
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { countryLevel: true, stadiumCapacity: true, outsourcings: true } });
    if (!club) throw new Error('Club not found');
    return club.outsourcings.map(o => ({
      id: o.id, type: o.type, active: o.active,
      monthlyCost: o.active ? outsourcingMonthlyCost([o.type], club.countryLevel, club.stadiumCapacity).total : 0,
    }));
  },

  async updateSubcontracts(clubId: number, data: Record<string, number>): Promise<OutsourcingSummary[]> {
    const validTypes = ['travelAgency', 'maintenance', 'cleaning', 'security', 'food', 'medical', 'media'];
    const results: OutsourcingSummary[] = [];

    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { countryLevel: true, stadiumCapacity: true } });
    const countryLevel = club?.countryLevel ?? 2;
    const stadiumCapacity = club?.stadiumCapacity ?? 0;

    for (const [type, value] of Object.entries(data)) {
      if (!validTypes.includes(type)) continue;
      const active = value === 1;

      const existing = await prisma.outsourcing.findFirst({ where: { clubId, type } });
      let record;
      if (existing) {
        record = await prisma.outsourcing.update({ where: { id: existing.id }, data: { active } });
      } else {
        record = await prisma.outsourcing.create({ data: { clubId, type, active } });
      }

      results.push({
        id: record.id, type: record.type, active: record.active,
        monthlyCost: record.active ? outsourcingMonthlyCost([type], countryLevel, stadiumCapacity).total : 0,
      });
    }

    return results;
  },

  // ─── Previsión financiera ─────────────────────────────────────────────────

  async getForecast(clubId: number, months: number = 12) {
    if (months < 1 || months > 60) throw new Error('months debe estar entre 1 y 60');

    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        sponsors:     true,
        outsourcings: true,
        players:      { select: { salary: true } },
        coaches:      { select: { salary: true } },
      },
    });
    if (!club) throw new Error('Club not found');

    const startDate = await activeInGameDate();

    const finInput = buildFinanceInput(club);

    const playerSalaries = club.players.map(p => p.salary);
    const coachSalaries  = club.coaches.map(c => c.salary);

    const sponsorContracts = club.sponsors
      .map(s => ({
        yearlyIncome:    s.yearlyIncome,
        monthsRemaining: deriveSponsorMonthsRemaining(s.createdAt, s.years, startDate),
      }))
      .filter(s => s.monthsRemaining > 0);

    const activeOutsourcingTypes = club.outsourcings.filter(o => o.active).map(o => o.type);

    const forecast = buildForecast(
      months, startDate, club.budget,
      finInput, playerSalaries, coachSalaries,
      sponsorContracts, activeOutsourcingTypes,
      club.stadiumCapacity,
    );

    return {
      clubId,
      currentBudget: club.budget,
      months:        forecast,
      annual:        summarizeAnnual(forecast),
    };
  },

  /**
   * Q15 (BLOQUE Q) · Serie histórica de caja para gráficos: FinanceSnapshot del
   * club en orden cronológico con ingresos/gastos desglosados por categoría.
   */
  async getCashHistory(clubId: number, take = 52) {
    const rowsDesc = await prisma.financeSnapshot.findMany({
      // AUDIT 1.5: excluye los snapshots de premios/ingreso de competición
      // (season = `competition_income:…`), que NO son snapshots mensuales de caja
      // y contaminaban la serie histórica (semanas/budget sintéticos).
      where: { clubId, NOT: { season: { startsWith: COMPETITION_INCOME_PREFIX } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take,
    });
    const rows = rowsDesc.slice().reverse();
    return {
      clubId,
      points: rows.map((row) => ({
        week: row.week,
        season: row.season,
        budget: row.budget,
        income: row.income,
        expenses: row.expenses,
        net: row.income - row.expenses,
        breakdown: {
          ticketRevenue: row.ticketRevenue,
          tvRevenue: row.tvRevenue,
          transferIncome: row.transferIncome,
          sponsorRevenue: row.sponsorRevenue,
          salaryExpenses: row.salaryExpenses,
          staffExpenses: row.staffExpenses,
          facilityExpenses: row.facilityExpenses,
        },
        createdAt: row.createdAt,
      })),
    };
  },

  async getAnalysis(clubId: number) {
    const [snapshot, competitionIncome, historyDesc, activeState] = await Promise.all([
      this.getEconomy(clubId),
      this.getCompetitionIncome(clubId),
      prisma.financeSnapshot.findMany({
        // AUDIT 1.5: solo snapshots MENSUALES de caja; excluye los de premios/ingreso
        // de competición (season = `competition_income:…`) que falseaban las
        // "variaciones mensuales" y el valuationHistory del análisis.
        where: { clubId, NOT: { season: { startsWith: COMPETITION_INCOME_PREFIX } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 18,
      }),
      prisma.gameState.findFirst({ where: { isActive: true }, select: { seasonId: true } }),
    ]);
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        budget: true,
        cash: true,
        fixedAssets: true,
        fdfValuation: true,
        stadiumCapacity: true,
        fans: true,
        socialMass: true,
        highClass: true,
        reputation: true,
        countryLevel: true,
        ticketPriceLevel: true,
      },
    });
    if (!club) throw new Error('Club not found');

    const latestSnapshot = historyDesc[0];
    const incomeBase = Math.max(1, latestSnapshot?.income ?? snapshot.monthlyIncome.total);
    const salaryRatioPct = Math.round((snapshot.currentMonthlySalaries / incomeBase) * 100);
    const currentValuation = club.fdfValuation || clubValuation(club.socialMass, club.highClass, club.countryLevel, club.reputation);
    const history = historyDesc.slice().reverse();

    const leagueStanding = activeState
      ? await prisma.standing.findFirst({
        where: { clubId, competition: { seasonId: activeState.seasonId, type: 'league' } },
        include: { competition: { select: { id: true, name: true, shortName: true, country: true, tier: true } } },
        orderBy: { competition: { tier: 'asc' } },
      })
      : null;
    const peers = leagueStanding
      ? await prisma.standing.findMany({
        where: { competitionId: leagueStanding.competitionId },
        include: {
          club: {
            include: {
              players: { select: { salary: true } },
              coaches: { select: { salary: true } },
            },
          },
        },
      })
      : [];
    const peerMetrics = peers.map(row => {
      const salaryMassMonthly = monthlySalaries(
        row.club.players.map(player => player.salary),
        row.club.coaches.map(coach => coach.salary)
      );
      const valuation = row.club.fdfValuation || clubValuation(
        row.club.socialMass,
        row.club.highClass,
        row.club.countryLevel,
        row.club.reputation
      );
      return {
        club: { id: row.club.id, name: row.club.name, shortName: row.club.shortName, badge: row.club.badge },
        budget: row.club.budget,
        cash: row.club.cash,
        valuation,
        salaryMassMonthly,
      };
    });
    const rankBy = (selector: (row: typeof peerMetrics[number]) => number) => {
      const sorted = peerMetrics.slice().sort((a, b) => selector(b) - selector(a));
      const index = sorted.findIndex(row => row.club.id === clubId);
      return index >= 0 ? index + 1 : null;
    };

    const topMonthlyVariations = history
      .map((row, index) => {
        const previous = index > 0 ? history[index - 1] : null;
        const budgetDelta = previous ? row.budget - previous.budget : 0;
        return {
          week: row.week,
          season: row.season,
          budget: row.budget,
          budgetDelta,
          income: row.income,
          expenses: row.expenses,
          label: budgetDelta >= 0 ? 'Subida' : 'Bajada',
          createdAt: row.createdAt,
        };
      })
      .sort((a, b) => Math.abs(b.budgetDelta) - Math.abs(a.budgetDelta))
      .slice(0, 6);

    return {
      club: { id: club.id, name: club.name, shortName: club.shortName, badge: club.badge },
      summary: {
        valuation: roundMoney(currentValuation),
        budget: club.budget,
        cash: club.cash,
        salaryMassMonthly: snapshot.currentMonthlySalaries,
        salaryRatioPct,
        salaryRisk: salaryRisk(salaryRatioPct),
        monthlyIncome: snapshot.monthlyIncome,
        monthlyExpenses: snapshot.monthlyExpenses,
        netMonthly: snapshot.netMonthly,
      },
      valuationHistory: history.map(row => ({
        week: row.week,
        season: row.season,
        budget: row.budget,
        valuationEstimate: roundMoney(row.budget + club.fixedAssets),
        valuationSource: 'budget_plus_fixed_assets_proxy',
        income: row.income,
        expenses: row.expenses,
        ticketRevenue: row.ticketRevenue,
        createdAt: row.createdAt,
      })),
      competitionIncome,
      leagueComparison: leagueStanding ? {
        competition: leagueStanding.competition,
        averages: {
          budget: roundMoney(average(peerMetrics.map(row => row.budget))),
          cash: roundMoney(average(peerMetrics.map(row => row.cash))),
          valuation: roundMoney(average(peerMetrics.map(row => row.valuation))),
          salaryMassMonthly: roundMoney(average(peerMetrics.map(row => row.salaryMassMonthly))),
        },
        rankings: {
          budget: rankBy(row => row.budget),
          cash: rankBy(row => row.cash),
          valuation: rankBy(row => row.valuation),
          salaryMassMonthly: rankBy(row => row.salaryMassMonthly),
        },
        peers: peerMetrics
          .sort((a, b) => b.valuation - a.valuation)
          .slice(0, 20),
      } : null,
      topMonthlyVariations,
      uiNeed: '// NECESITO: Antigravity debe añadir tab ANÁLISIS en EconomyPage con ratio salarial, comparación liga y variaciones.',
    };
  },

  // ─── Cuenta personal del manager ─────────────────────────────────────────

  async getManagerWealth(managerId: number): Promise<{ wealth: number; prestige: number }> {
    const manager = await prisma.manager.findUnique({
      where:  { id: managerId },
      select: { wealth: true, prestige: true },
    });
    if (!manager) throw new Error('Manager not found');
    return { wealth: manager.wealth, prestige: manager.prestige };
  },
};

// ─── Helpers locales ──────────────────────────────────────────────────────────

function summarizeAnnual(forecast: ReturnType<typeof buildForecast>) {
  const full = forecast.slice(0, 12);
  return {
    totalGate:        full.reduce((s, m) => s + m.gate, 0),
    totalCommercial:  full.reduce((s, m) => s + m.commercial, 0),
    totalSalaries:    full.reduce((s, m) => s + m.salaries, 0),
    totalOutsourcing: full.reduce((s, m) => s + m.outsourcing, 0),
    totalNet:         full.reduce((s, m) => s + m.net, 0),
  };
}
