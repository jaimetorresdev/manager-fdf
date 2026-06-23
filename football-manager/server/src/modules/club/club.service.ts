// ─── Club Service ─────────────────────────────────────────────────────────────
import prisma from '../../db/prisma';
import { playerOverall } from '../../lib/playerOverall';
import { advisorService } from './advisor.service';
import { fansService } from '../fans/fans.service';
import { managerService } from '../manager/manager.service';
import { evaluateOffer } from '../market/market-evaluation.logic';
// W6 (auditoría 11 jun, Claude): la legalidad de plantilla (squad-limits S7)
// entra en la dimensión de viabilidad del semáforo de decisión.
import { marketService } from '../market/market.service';
import { playerWage } from '../../lib/playerWage';

function moneyBand(value: number): string {
  const amount = Math.max(0, Number(value) || 0);
  if (amount >= 100_000_000) return '+100M';
  if (amount >= 50_000_000) return '50M-100M';
  if (amount >= 25_000_000) return '25M-50M';
  if (amount >= 10_000_000) return '10M-25M';
  if (amount >= 5_000_000) return '5M-10M';
  if (amount >= 1_000_000) return '1M-5M';
  return '<1M';
}

// AUDIT 1.2: helper movido a lib/playerWage.ts (fuente única); se importa arriba.

function healthStatus(score: number): 'good' | 'ok' | 'watch' | 'risk' {
  if (score >= 80) return 'good';
  if (score >= 60) return 'ok';
  if (score >= 40) return 'watch';
  return 'risk';
}

function clampHealth(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function severityPenalty(severity?: 'high' | 'medium' | 'low') {
  if (severity === 'high') return 28;
  if (severity === 'medium') return 16;
  if (severity === 'low') return 8;
  return 0;
}

type DecisionAction = 'sign' | 'sell' | 'renew' | 'stadium';
type DecisionStatus = 'green' | 'yellow' | 'red';
type DecisionSignalInput = {
  action: DecisionAction;
  playerId?: number;
  amount?: number;
  salary?: number;
  years?: number;
  clause?: number;
  workKey?: string;
};
type DecisionDimension = {
  key: 'viability' | 'financial' | 'sporting' | 'fans' | 'positional';
  label: string;
  status: DecisionStatus;
  score: number;
  detail: string;
  source: string;
};

function signalStatus(score: number): DecisionStatus {
  if (score >= 70) return 'green';
  if (score >= 45) return 'yellow';
  return 'red';
}

function signalLabel(status: DecisionStatus): string {
  if (status === 'green') return 'Adelante';
  if (status === 'yellow') return 'Conviene revisar';
  return 'No recomendable';
}

// N3-4 · Formación → slots por posición. Soporta 3-4 líneas ("4-3-3", "4-2-3-1", etc.)
function parseFormationSlots(formation: string | null): Record<string, number> {
  const result: Record<string, number> = { POR: 1, DEF: 0, MED: 0, DEL: 0 };
  if (!formation) return result;
  const parts = formation.split('-').map(Number).filter((n) => !isNaN(n) && n >= 0);
  if (parts.length === 3) {
    [result.DEF, result.MED, result.DEL] = parts;
  } else if (parts.length === 4) {
    result.DEF = parts[0];
    result.MED = parts[1] + parts[2];
    result.DEL = parts[3];
  } else if (parts.length >= 2) {
    result.DEF = parts[0];
    result.DEL = parts[parts.length - 1];
    result.MED = parts.slice(1, -1).reduce((s, n) => s + n, 0);
  }
  return result;
}

function dimension(
  key: DecisionDimension['key'],
  label: string,
  score: number,
  detail: string,
  source: string,
): DecisionDimension {
  const finalScore = clampHealth(score);
  return { key, label, status: signalStatus(finalScore), score: finalScore, detail, source };
}

function avg(scores: number[]) {
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length));
}

export const clubService = {

async getPublicClub(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        stadium: true,
        fanBase: true,
        players: { select: { salary: true, wage: true, marketValue: true } },
        coaches: { select: { salary: true } },
      }
    });
    if (!club) throw new Error('Club not found');

    const [recentMatches, seasons, honours, latestSnapshot] = await Promise.all([
      prisma.match.findMany({
        where: {
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
          status: 'played'
        },
        include: {
          homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
          awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
        },
        orderBy: { playedAt: 'desc' },
        take: 8
      }),
      prisma.seasonHistory.findMany({
        where: { clubId },
        include: { competition: { select: { id: true, name: true, shortName: true, country: true, tier: true } } },
        orderBy: [{ season: 'desc' }, { competitionId: 'asc' }],
        take: 12,
      }),
      prisma.honour.findMany({
        where: { clubId },
        orderBy: [{ season: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      }),
      prisma.financeSnapshot.findFirst({
        // AUDIT H-9: usar el último snapshot MENSUAL (excluye filas de premio
        // `competition_income:*`); si no, incomeBase y salaryRatioPct se distorsionan
        // cuando el último snapshot es un ingreso de competición puntual.
        where: { clubId, NOT: { season: { startsWith: 'competition_income' } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const { players, coaches, ...publicClub } = club;
    const form = recentMatches.map(m => {
      const isHome = m.homeClubId === clubId;
      const goalsFor = isHome ? m.homeGoals! : m.awayGoals!;
      const goalsAgainst = isHome ? m.awayGoals! : m.homeGoals!;
      if (goalsFor > goalsAgainst) return 'W';
      if (goalsFor === goalsAgainst) return 'D';
      return 'L';
    }).reverse();

    const salaryMassMonthly = players.reduce((sum, player) => sum + playerWage(player), 0)
      + coaches.reduce((sum, coach) => sum + coach.salary, 0);
    const incomeBase = Math.max(1, latestSnapshot?.income ?? club.budget / 12);
    const recentMatchRows = recentMatches.map((match) => {
      const isHome = match.homeClubId === clubId;
      const goalsFor = isHome ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
      const goalsAgainst = isHome ? match.awayGoals ?? 0 : match.homeGoals ?? 0;
      const opponent = isHome ? match.awayClub : match.homeClub;
      return {
        id: match.id,
        opponent,
        result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
        goalsFor,
        goalsAgainst,
        playedAt: match.playedAt,
      };
    });

    return {
      ...publicClub,
      form,
      history: {
        seasons: seasons.map((row) => ({
          id: row.id,
          season: row.season,
          competition: row.competition,
          position: row.position,
          points: row.points,
          createdAt: row.createdAt,
        })),
        honours,
        recentMatches: recentMatchRows,
        headToHeadHint: `/api/memory/head-to-head?clubA=${clubId}&clubB=<rivalId>`,
      },
      publicFinances: {
        valuation: club.fdfValuation,
        budgetBand: moneyBand(club.budget),
        cashBand: moneyBand(club.cash),
        fixedAssetsBand: moneyBand(club.fixedAssets),
        squadValueBand: moneyBand(players.reduce((sum, player) => sum + player.marketValue, 0)),
        salaryMassMonthly,
        salaryRatioPct: Math.round((salaryMassMonthly / incomeBase) * 100),
        // AUDIT 3.2: esta es la vista PÚBLICA del club; el snapshot crudo incluía
        // budget/income/expenses/tv/sponsor… (economía privada). Se proyecta a campos
        // no sensibles (semana/temporada/fecha); las magnitudes públicas van en *Band.
        latestSnapshot: latestSnapshot
          ? { week: latestSnapshot.week, season: latestSnapshot.season, createdAt: latestSnapshot.createdAt }
          : null,
      },
      uiNeed: '// NECESITO: Antigravity debe montar ClubPage con tabs Historial y Finanzas usando history/publicFinances.',
    };
  },

async getClubSquad(clubId: number) {
    const players = await prisma.player.findMany({
      where: { clubId },
      select: {
        id: true,
        name: true,
        position: true,
        age: true,
        marketValue: true,
        muscularFitness: true,
        mentalSharpness: true,
        matchRhythm: true,
        passing: true,
        tackling: true,
        shooting: true,
        organization: true,
        unmarking: true,
        finishing: true,
        dribbling: true,
        goalkeeping: true,
        detailedPosition: true,
        injuries: { where: { weeksLeft: { gt: 0 } } },
        suspensions: { where: { matches: { gt: 0 } } },
        matchStats: {
          orderBy: { match: { playedAt: 'desc' } },
          take: 5,
          select: { rating: true },
        },
      },
      orderBy: [{ position: 'asc' }, { squadNumber: 'asc' }],
    });

    return players.map((p) => {
      const overall = playerOverall(p);
      const ratings = p.matchStats.map((s) => s.rating);
      const averageRating = ratings.length > 0
        ? parseFloat((ratings.reduce((sum, r) => sum + r, 0) / ratings.length).toFixed(2))
        : null;

      return {
        id: p.id,
        name: p.name,
        position: p.position,
        age: p.age,
        marketValue: p.marketValue,
        overall,
        averageRating,
        formArray: [...ratings].reverse(),
        muscularFitness: p.muscularFitness,
        mentalSharpness: p.mentalSharpness,
        matchRhythm: p.matchRhythm,
        injuries: p.injuries,
        suspensions: p.suspensions,
      };
    });
  },

  async getClubStaff(clubId: number) {
    const coaches = await prisma.coach.findMany({ where: { clubId } });
    const staff = await prisma.staff.findMany({ where: { clubId } });
    return { coaches, staff };
  },

  /** Get the club managed by this user */
  async getMyClub(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        players: {
          orderBy: [{ position: 'asc' }, { squadNumber: 'asc' }],
        },
        standings: {
          include: { competition: true },
          orderBy: { competition: { name: 'asc' } },
        },
      },
    });
    if (!club) throw new Error('Club not found');
    return club;
  },

  /** Economy overview: budget + salary mass + upcoming costs */
  async getEconomy(clubId: number) {
    const club = await prisma.club.findUnique({
      where:   { id: clubId },
      include: { players: { select: { salary: true, wage: true } } },
    });
    if (!club) throw new Error('Club not found');

    // AUDIT 1.2: helper canónico (wage fuente de verdad, salary fallback) en lugar
    // de sumar p.salary directo — antes divergía de la masa salarial de otras vistas.
    const monthlyWages  = club.players.reduce((sum, p) => sum + playerWage(p), 0);
    const sponsorIncome = Math.round(club.reputation * 5000);
    const tvRevenue     = Math.round(club.reputation * 3000);
    const monthlyIncome = sponsorIncome + tvRevenue;
    const balance       = monthlyIncome - monthlyWages;

    // Last 6 weeks of finance history
    const history = await prisma.financeSnapshot.findMany({
      where:   { clubId },
      orderBy: { createdAt: 'desc' },
      take:    6,
    });

    return {
      budget:        club.budget,
      monthlyWages,
      monthlyIncome,
      balance,
      salaryMass:    monthlyWages,
      history:       history.reverse(),
    };
  },

  async getHealthMap(clubId: number, managerId: number) {
    const [advisor, mood, pressure, economy] = await Promise.all([
      advisorService.getRecommendations(clubId),
      fansService.getMood(clubId),
      managerService.getPressure(managerId),
      this.getEconomy(clubId),
    ]);

    const recommendations = advisor.recommendations;
    const rec = (key: string) => recommendations.find((item) => item.key === key);
    const recPrefix = (prefix: string) => recommendations.filter((item) => item.key.startsWith(prefix));
    const worstPenalty = (items: typeof recommendations) =>
      items.reduce((max, item) => Math.max(max, severityPenalty(item.severity)), 0);

    const depthRecs = recPrefix('depth_');
    const tiredRec = rec('starters_tired');
    const contractsRec = rec('contracts_expiring');
    const salaryRec = rec('salary_mass');
    const youthRec = rec('youth_ready');

    const sportingScore = clampHealth(78 - pressure.score * 0.35 - severityPenalty(tiredRec?.severity) * 0.35);
    const economyScore = clampHealth(
      (economy.balance >= 0 ? 68 : 42)
      + Math.max(-12, Math.min(12, economy.balance / Math.max(1, economy.monthlyIncome) * 20))
      - severityPenalty(salaryRec?.severity) * 0.45,
    );
    const squadScore = clampHealth(82 - worstPenalty([...depthRecs, contractsRec, tiredRec].filter(Boolean) as typeof recommendations));
    const academyScore = clampHealth(youthRec ? 76 : 56);
    const fansScore = clampHealth(mood.score);
    const boardScore = clampHealth(100 - pressure.score);

    const area = (
      key: string,
      label: string,
      score: number,
      note: string,
      sources: string[],
    ) => ({
      key,
      label,
      score,
      status: healthStatus(score),
      note,
      sources,
    });

    return {
      generatedAt: new Date(),
      areas: [
        area(
          'sporting',
          'Deportivo',
          sportingScore,
          tiredRec?.detail ?? pressure.reasons.find((reason: string) => reason.startsWith('-') && reason.includes('partido')) ?? 'Forma deportiva sin alertas graves.',
          ['advisor', 'manager/pressure'],
        ),
        area(
          'economy',
          'Económico',
          economyScore,
          salaryRec?.detail ?? (economy.balance >= 0 ? 'Balance mensual positivo.' : 'Balance mensual en negativo.'),
          ['economy', 'advisor'],
        ),
        area(
          'squad',
          'Plantilla',
          squadScore,
          depthRecs[0]?.detail ?? contractsRec?.detail ?? tiredRec?.detail ?? 'Plantilla sin carencias urgentes detectadas.',
          ['advisor'],
        ),
        area(
          'academy',
          'Cantera',
          academyScore,
          youthRec?.detail ?? 'Sin juveniles listos para subir ahora mismo.',
          ['advisor'],
        ),
        area(
          'fans',
          'Afición',
          fansScore,
          mood.reasons[0] ?? (mood.mood === 'green' ? 'La grada confía.' : mood.mood === 'red' ? 'La grada está inquieta.' : 'La afición espera señales.'),
          ['fans/mood'],
        ),
        area(
          'board',
          'Directiva',
          boardScore,
          pressure.label,
          ['manager/pressure'],
        ),
      ],
      sourceContracts: ['/api/club/advisor', '/api/fans/mood', '/api/manager/pressure', '/api/club/economy'],
    };
  },

  async getDecisionSignal(clubId: number, managerId: number, input: DecisionSignalInput) {
    const [club, economy, mood, pressure, advisor, player, managerTactic] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        include: {
          players: { select: { id: true, position: true, salary: true, wage: true, isStarter: true } },
          coaches: { select: { salary: true } },
        },
      }),
      this.getEconomy(clubId),
      fansService.getMood(clubId),
      managerService.getPressure(managerId),
      advisorService.getRecommendations(clubId),
      input.playerId
        ? prisma.player.findUnique({
            where: { id: input.playerId },
            select: {
              id: true,
              name: true,
              clubId: true,
              position: true,
              marketValue: true,
              salary: true,
              wage: true,
              isStarter: true,
              age: true,
            },
          })
        : Promise.resolve(null),
      // N3-4 · Formación preferida del mánager para encaje posicional
      prisma.tactic.findFirst({
        where: { managerId, isDefault: true },
        select: { formation: true },
      }),
    ]);
    if (!club) throw new Error('Club not found');

    const dimensions: DecisionDimension[] = [];
    const reasons: string[] = [];
    const sources = new Set<string>([
      '/api/club/economy',
      '/api/fans/mood',
      '/api/manager/pressure',
      '/api/club/advisor',
    ]);
    const evaluation: Record<string, unknown> = {};
    const amount = Math.max(0, Math.round(Number(input.amount) || 0));
    const salary = input.salary != null ? Math.max(0, Math.round(input.salary)) : null;
    const years = input.years != null ? Math.max(1, Math.min(5, Math.round(input.years))) : null;
    const clause = input.clause != null ? Math.max(1, Math.round(input.clause)) : null;
    const ownsPlayer = player?.clubId === clubId;

    if (input.action === 'sell' && (!player || !ownsPlayer)) {
      dimensions.push(dimension(
        'viability',
        'Viabilidad',
        15,
        player ? 'Solo puedes valorar la venta de jugadores de tu club.' : 'Falta jugador para valorar la venta.',
        '/api/club/advisor',
      ));
      reasons.push(player ? 'El jugador no pertenece a tu club' : 'Falta jugador para valorar la venta');
    } else if (input.action === 'renew' && (!player || !ownsPlayer)) {
      dimensions.push(dimension(
        'viability',
        'Viabilidad',
        15,
        player ? 'Solo puedes renovar jugadores de tu club.' : 'Falta jugador para valorar la renovación.',
        '/api/market/evaluate',
      ));
      sources.add('/api/market/evaluate');
      reasons.push(player ? 'El jugador no pertenece a tu club' : 'Faltan datos del jugador');
    } else if (input.action === 'sign' && player && ownsPlayer) {
      dimensions.push(dimension(
        'viability',
        'Viabilidad',
        35,
        'El jugador ya pertenece a tu club: usa renovación si quieres revisar contrato.',
        '/api/club/advisor',
      ));
      reasons.push('El jugador ya pertenece a tu club');
    } else if ((input.action === 'sign' || input.action === 'renew') && input.playerId && salary && years) {
      try {
        const marketEvaluation = await evaluateOffer(clubId, input.playerId, salary, years, clause ?? salary * 400);
        const accepted = marketEvaluation.total >= 50;
        sources.add('/api/market/evaluate');
        evaluation.market = { ...marketEvaluation, accepted };
        dimensions.push(dimension(
          'viability',
          'Viabilidad',
          accepted ? Math.max(50, marketEvaluation.total) : marketEvaluation.total,
          accepted ? 'El jugador aceptaría los términos.' : 'El jugador rechazaría los términos actuales.',
          '/api/market/evaluate',
        ));
        reasons.push(accepted ? 'La oferta gusta al jugador' : 'El jugador no acepta estos términos');
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'No se pudo evaluar al jugador';
        dimensions.push(dimension('viability', 'Viabilidad', 35, detail, '/api/market/evaluate'));
        reasons.push(detail);
      }
    } else if (input.action === 'sign' || input.action === 'renew') {
      dimensions.push(dimension(
        'viability',
        'Viabilidad',
        55,
        'Faltan términos de contrato para cruzar la valoración del jugador.',
        '/api/market/evaluate',
      ));
      sources.add('/api/market/evaluate');
    } else {
      dimensions.push(dimension(
        'viability',
        'Viabilidad',
        input.action === 'stadium' ? 70 : 65,
        input.action === 'stadium' ? 'La decisión no ejecuta ninguna obra: solo mide encaje.' : 'La operación es consultiva: no ejecuta venta.',
        input.action === 'stadium' ? '/api/stadium' : '/api/club/advisor',
      ));
    }

    // W6 (auditoría 11 jun, Claude) · LEGALIDAD de plantilla en la viabilidad:
    // un fichaje/venta que viola los límites FDF (squad-limits S7) jamás puede
    // salir verde, acepte lo que acepte el jugador. ADITIVO: solo endurece.
    if (input.action === 'sign' || input.action === 'sell') {
      const limits = await marketService.getSquadLimits(clubId);
      sources.add('/api/market/squad-limits');
      const legal = input.action === 'sign' ? limits.canSign : limits.canListTransfer;
      if (!legal) {
        const detail = input.action === 'sign'
          ? `Límite FDF de plantilla: ${limits.firstTeam} fichas + ${limits.pendingIncoming} entrantes (máx. 30, y 26 contando cedidos).`
          : `Mínimo FDF: necesitas 19 entre primer equipo y juveniles (tienes ${limits.firstTeam + limits.youth}).`;
        const viability = dimensions.find((item) => item.key === 'viability');
        if (viability) {
          viability.score = Math.min(viability.score, 15);
          viability.status = signalStatus(viability.score);
          viability.detail = detail;
          viability.source = '/api/market/squad-limits';
        }
        reasons.push(detail);
      }
    }

    const monthlyWages = club.players.reduce((sum, p) => sum + playerWage(p), 0)
      + club.coaches.reduce((sum, c) => sum + c.salary, 0);
    const nextMonthlyWages = input.action === 'sell' && player && ownsPlayer
      ? monthlyWages - playerWage(player)
      : input.action === 'renew' && player && ownsPlayer && salary
        ? monthlyWages - playerWage(player) + salary
        : input.action === 'sign' && salary
          ? monthlyWages + salary
          : monthlyWages;
    const budgetAfter = input.action === 'sell' && ownsPlayer
      ? club.budget + amount
      : club.budget - amount;
    const wageRatio = nextMonthlyWages / Math.max(1, economy.monthlyIncome);
    let financialScore = budgetAfter < 0 ? 20 : wageRatio > 1.1 ? 30 : wageRatio > 0.85 ? 52 : wageRatio > 0.7 ? 64 : 78;
    if (input.action === 'sell' && ownsPlayer && amount > 0) financialScore += 8;
    if (input.action === 'stadium' && amount === 0) financialScore = Math.min(financialScore, 58);
    const financialDetail = budgetAfter < 0
      ? 'No hay margen económico suficiente para esta decisión.'
      : wageRatio > 0.85
        ? 'El coste encaja, pero deja la masa salarial en vigilancia.'
        : input.action === 'sell' && ownsPlayer
          ? 'La operación mejora el margen económico.'
          : 'La decisión encaja en el margen económico actual.';
    dimensions.push(dimension('financial', 'Riesgo financiero', financialScore, financialDetail, '/api/club/economy'));
    reasons.push(financialDetail);

    const depthRec = player ? advisor.recommendations.find((rec) => rec.key === `depth_${player.position}`) : null;
    const contractsRec = advisor.recommendations.find((rec) => rec.key === 'contracts_expiring');
    const positionCount = player ? club.players.filter((p) => p.position === player.position).length : 0;
    let sportingScore = 62;
    let sportingDetail = 'Impacto deportivo moderado.';
    if (input.action === 'sign' && player) {
      sportingScore = depthRec ? 78 : 62;
      sportingDetail = depthRec
        ? `Refuerza una zona corta de la plantilla (${player.position}).`
        : `Aumenta competencia en ${player.position}, sin urgencia detectada.`;
    } else if (input.action === 'sell' && player && ownsPlayer) {
      const remaining = Math.max(0, positionCount - 1);
      sportingScore = player.isStarter ? 38 : 62;
      if (remaining <= 1) sportingScore -= 14;
      sportingDetail = player.isStarter
        ? `${player.name} es titular: venderlo puede resentir el once.`
        : `${player.name} no es titular fijo; el impacto deportivo parece asumible.`;
    } else if (input.action === 'renew' && player && ownsPlayer) {
      sportingScore = player.isStarter ? 76 : contractsRec ? 68 : 58;
      sportingDetail = player.isStarter
        ? `Renovar a ${player.name} protege una pieza importante.`
        : contractsRec?.detail ?? `Renovación útil para sostener profundidad en ${player.position}.`;
    } else if (input.action === 'stadium') {
      sportingScore = pressure.score >= 60 ? 48 : 66;
      sportingDetail = pressure.score >= 60
        ? 'Con presión deportiva alta, una obra grande puede parecer desconectada del momento.'
        : 'La obra no compromete directamente el rendimiento deportivo.';
    }
    dimensions.push(dimension('sporting', 'Impacto deportivo', sportingScore, sportingDetail, '/api/club/advisor'));
    reasons.push(sportingDetail);

    let fanScore = mood.score;
    let fanDetail = mood.reasons[0] ?? 'La grada está estable.';
    if (input.action === 'sign' && player && amount >= Math.max(1_000_000, player.marketValue * 0.8)) {
      fanScore += 8;
      fanDetail = `Un fichaje de ${player.name} puede ilusionar a la grada.`;
    } else if (input.action === 'sell' && player?.isStarter && ownsPlayer) {
      fanScore -= 14;
      fanDetail = `Vender a un titular como ${player.name} puede enfriar a la afición.`;
    } else if (input.action === 'renew' && player?.isStarter && ownsPlayer) {
      fanScore += 6;
      fanDetail = `Renovar a ${player.name} daría continuidad al proyecto.`;
    } else if (input.action === 'stadium' && amount > club.budget * 0.25) {
      fanScore -= mood.mood === 'red' ? 10 : 4;
      fanDetail = 'La afición puede cuestionar una obra cara si el momento deportivo no acompaña.';
    }
    dimensions.push(dimension('fans', 'Reacción de afición', fanScore, fanDetail, '/api/fans/mood'));
    reasons.push(fanDetail);

    // N3-4 · Encaje posicional en la formación preferida del mánager
    if (input.action === 'sign' && player) {
      const slots = parseFormationSlots(managerTactic?.formation ?? null);
      const pos = player.position;
      const slotCount = slots[pos] ?? 0;
      const currentCount = club.players.filter((p) => p.position === pos).length;

      let positionalScore: number;
      let positionalDetail: string;

      if (slotCount === 0) {
        positionalScore = 20;
        positionalDetail = `La formación preferida (${managerTactic?.formation ?? 'desconocida'}) no contempla ningún puesto de ${pos}. Encaje posicional nulo.`;
      } else {
        const saturation = currentCount / slotCount;
        if (saturation >= 2.5) {
          positionalScore = 30;
          positionalDetail = `Ya tienes ${currentCount} de ${pos} para ${slotCount} puesto${slotCount > 1 ? 's' : ''} en la formación: la plantilla está saturada ahí.`;
        } else if (saturation >= 1.5) {
          positionalScore = 58;
          positionalDetail = `Tienes ${currentCount} de ${pos} para ${slotCount} puesto${slotCount > 1 ? 's' : ''} en la formación: encaje justo, competencia alta.`;
        } else {
          positionalScore = 80;
          positionalDetail = `${player.name} encaja en la formación ${managerTactic?.formation ?? 'predeterminada'} como ${pos}.`;
        }
      }
      dimensions.push(dimension('positional', 'Encaje posicional', positionalScore, positionalDetail, '/api/club/tactic'));
      sources.add('/api/club/tactic');
      reasons.push(positionalDetail);
    }

    const score = clampHealth(avg(dimensions.map((item) => item.score)) - (pressure.score >= 75 ? 8 : pressure.score >= 55 ? 4 : 0));
    const status = signalStatus(score);
    const weakest = [...dimensions].sort((a, b) => a.score - b.score)[0];
    const summary = status === 'green'
      ? 'La decisión encaja con los indicadores actuales.'
      : status === 'yellow'
        ? `${weakest?.label ?? 'Un indicador'} pide revisión antes de avanzar.`
        : `${weakest?.label ?? 'Un indicador'} desaconseja avanzar ahora.`;

    return {
      action: input.action,
      status,
      score,
      label: signalLabel(status),
      summary,
      reasons: [...new Set(reasons)].slice(0, 5),
      sources: [...sources],
      dimensions,
      evaluation,
      context: {
        player: player ? { id: player.id, name: player.name, position: player.position, isStarter: player.isStarter } : null,
        amount,
        salary,
        years,
        clause,
        workKey: input.workKey ?? null,
      },
    };
  },

  /** Standings for all competitions this season */
  async getStandings() {
    const activeGame = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!activeGame) return [];

    const standings = await prisma.standing.findMany({
      where: { competition: { seasonId: activeGame.seasonId } },
      include: { club: { select: { id: true, name: true, shortName: true, badge: true } } },
      orderBy: [
        { competitionId: 'asc' },
        { points: 'desc' },
        { goalsFor: 'desc' },
      ],
    });

    return standings;
  },
};
