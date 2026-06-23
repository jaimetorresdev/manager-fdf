// ─── QW-9 «El DD recomienda» + QW-7 «Rival de la semana» ─────────────────────
// Recomendaciones y detección de rival POR REGLAS deterministas sobre datos
// existentes (cero schema nuevo). Contratos en server/API_UI.md §BloqueQ (11 jun).
import prisma from '../../db/prisma';
import { memoryService } from '../memory/memory.service';
import { playerWage } from '../../lib/playerWage';
import { sortStandings } from '../game/standings';

const CLUB_SELECT = { id: true, name: true, shortName: true, badge: true } as const;

// Plantilla ideal por demarcación (QW-9 · profundidad)
const IDEAL_DEPTH: Record<string, number> = { POR: 2, DEF: 6, MED: 6, DEL: 4 };
const POSITION_LABEL: Record<string, string> = {
  POR: 'portería', DEF: 'defensa', MED: 'mediocampo', DEL: 'delantera',
};

type Severity = 'high' | 'medium' | 'low';
export type Recommendation = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  cta: { label: string; route: string };
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

/** El nombre del juvenil vive en el JSON `attributes` (modelo YouthPlayer sin campo name). */
export function youthName(attributes: string): string {
  try {
    const parsed = JSON.parse(attributes) as Record<string, unknown>;
    if (typeof parsed.name === 'string' && parsed.name) return parsed.name;
  } catch { /* fallback */ }
  return 'Canterano';
}

/**
 * Juveniles listos para el primer equipo (edad ≥17 y potencial ≥75).
 * Criterio ÚNICO compartido por advisor (QW-9), while-away (QW-29) y
 * zone-badges (QW-10) — si se ajusta el umbral, se ajusta para todos.
 */
export async function getPromotableYouth(clubId: number): Promise<Array<{ age: number; potential: number; attributes: string }>> {
  const academy = await prisma.youthAcademy.findUnique({
    where: { clubId },
    include: { youthPlayers: { select: { age: true, potential: true, attributes: true } } },
  });
  return (academy?.youthPlayers ?? []).filter((y) => y.age >= 17 && y.potential >= 75);
}

async function activeSeasonId(): Promise<number | null> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true },
  });
  return state?.seasonId ?? null;
}

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function rivalryName(a: { shortName: string; city?: string | null }, b: { shortName: string }, reasons: string[]): string {
  if (reasons.includes('city') && a.city) return `Derbi de ${a.city}`;
  if (reasons.includes('finals')) return `${a.shortName} vs ${b.shortName}: duelo de finales`;
  if (reasons.includes('human_duel')) return `${a.shortName} vs ${b.shortName}: pulso de mánagers`;
  return `${a.shortName} vs ${b.shortName}`;
}

export async function detectFormalRivalry(clubId: number) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } },
  });
  if (!club) return null;

  type Candidate = {
    rival: { id: number; name: string; shortName: string; badge: string | null; city: string; country: string; reputation: number; manager: { id: number } | null };
    reasons: Set<string>;
    score: number;
    metrics: { sameCity: boolean; played: number; finals: number; bothHuman: boolean; historicIntensity: number | null };
  };
  const candidates = new Map<number, Candidate>();
  const add = (rival: Candidate['rival'], reason: string, score: number, metric?: Partial<Candidate['metrics']>) => {
    if (!rival || rival.id === clubId) return;
    const current = candidates.get(rival.id) ?? {
      rival,
      reasons: new Set<string>(),
      score: 0,
      metrics: { sameCity: false, played: 0, finals: 0, bothHuman: false, historicIntensity: null },
    };
    current.reasons.add(reason);
    current.score += score;
    current.metrics = { ...current.metrics, ...metric };
    candidates.set(rival.id, current);
  };

  const [seedRivalries, cityClubs, playedMatches, scheduledHumanMatches] = await Promise.all([
    prisma.rivalry.findMany({
      where: { OR: [{ clubAId: clubId }, { clubBId: clubId }] },
      include: {
        clubA: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
        clubB: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
      },
    }),
    prisma.club.findMany({
      where: { id: { not: clubId }, city: club.city, country: club.country },
      select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } },
      take: 12,
    }),
    prisma.match.findMany({
      where: { status: 'played', OR: [{ homeClubId: clubId }, { awayClubId: clubId }] },
      select: {
        homeClubId: true,
        awayClubId: true,
        round: true,
        isKnockout: true,
        homeClub: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
        awayClub: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
        matchday: { select: { isKnockout: true, type: true } },
      },
      orderBy: { id: 'desc' },
      take: 160,
    }),
    club.manager
      ? prisma.match.findMany({
          where: {
            status: 'scheduled',
            OR: [
              { homeClubId: clubId, awayClub: { manager: { isNot: null } } },
              { awayClubId: clubId, homeClub: { manager: { isNot: null } } },
            ],
          },
          select: {
            homeClubId: true,
            awayClubId: true,
            homeClub: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
            awayClub: { select: { ...CLUB_SELECT, city: true, country: true, reputation: true, manager: { select: { id: true } } } },
          },
          take: 8,
        })
      : Promise.resolve([]),
  ]);

  for (const row of seedRivalries) {
    const rival = row.clubAId === clubId ? row.clubB : row.clubA;
    add(rival, 'head_to_head', 45 + row.intensity * 0.45, { historicIntensity: row.intensity });
  }
  for (const rival of cityClubs) {
    add(rival, 'city', 55 + Math.min(20, (club.reputation + rival.reputation) / 12), { sameCity: true });
  }

  const byOpponent = new Map<number, { rival: Candidate['rival']; played: number; finals: number }>();
  for (const match of playedMatches) {
    const rival = match.homeClubId === clubId ? match.awayClub : match.homeClub;
    const current = byOpponent.get(rival.id) ?? { rival, played: 0, finals: 0 };
    current.played += 1;
    const finalLike = match.round === 'final'
      || match.matchday?.type === 'final'
      || (match.isKnockout && match.round === 'final')
      || (match.matchday?.isKnockout && match.round === 'final');
    if (finalLike) current.finals += 1;
    byOpponent.set(rival.id, current);
  }
  for (const item of byOpponent.values()) {
    if (item.played >= 4) {
      add(item.rival, 'frequency', Math.min(35, item.played * 4), { played: item.played });
    }
    if (item.finals > 0) {
      add(item.rival, 'finals', 35 + item.finals * 15, { finals: item.finals });
    }
  }

  for (const match of scheduledHumanMatches) {
    const rival = match.homeClubId === clubId ? match.awayClub : match.homeClub;
    add(rival, 'human_duel', 55, { bothHuman: true });
  }
  for (const candidate of candidates.values()) {
    if (club.manager && candidate.rival.manager) {
      candidate.reasons.add('human_duel');
      candidate.score += 12;
      candidate.metrics.bothHuman = true;
    }
  }

  const best = [...candidates.values()].sort((a, b) =>
    b.score - a.score || b.reasons.size - a.reasons.size || b.rival.reputation - a.rival.reputation)[0];
  if (!best || best.score < 45) return null;

  const reasons = [...best.reasons];
  const intensity = clampIntensity(best.score);
  const [h2h, nextMeeting] = await Promise.all([
    memoryService.headToHead(clubId, best.rival.id).catch(() => null),
    prisma.match.findFirst({
      where: {
        status: 'scheduled',
        OR: [
          { homeClubId: clubId, awayClubId: best.rival.id },
          { homeClubId: best.rival.id, awayClubId: clubId },
        ],
      },
      orderBy: { id: 'asc' },
      select: { id: true, playedAt: true, homeClubId: true },
    }),
  ]);

  return {
    name: rivalryName(club, best.rival, reasons),
    intensity,
    prestigeMultiplier: Number((1 + intensity / 500).toFixed(2)),
    rival: {
      id: best.rival.id,
      name: best.rival.name,
      shortName: best.rival.shortName,
      badge: best.rival.badge,
    },
    reasons,
    metrics: best.metrics,
    headToHead: h2h
      ? {
          played: h2h.summary.played,
          wins: h2h.summary.clubAWins,
          draws: h2h.summary.draws,
          losses: h2h.summary.clubBWins,
        }
      : null,
    nextMeeting: nextMeeting
      ? { matchId: nextMeeting.id, playedAt: nextMeeting.playedAt, home: nextMeeting.homeClubId === clubId }
      : null,
  };
}

export const advisorService = {
  // ─── QW-9 · GET /api/club/advisor ───────────────────────────────────────────
  async getRecommendations(clubId: number) {
    const [club, players, youthAcademy, pendingOffers] = await Promise.all([
      prisma.club.findUnique({
        where: { id: clubId },
        select: { id: true, budget: true },
      }),
      prisma.player.findMany({
        where: { clubId },
        select: {
          id: true, name: true, position: true, age: true, potential: true,
          wage: true, salary: true, fitness: true, isStarter: true,
          contractYears: true, contractEndAt: true,
        },
      }),
      prisma.youthAcademy.findUnique({
        where: { clubId },
        include: { youthPlayers: { select: { age: true, potential: true, attributes: true } } },
      }),
      prisma.transferOffer.count({ where: { toClubId: clubId, status: 'pending' } }),
    ]);
    if (!club) throw new Error('Club no encontrado');

    const recommendations: Recommendation[] = [];

    // 1 · Profundidad por demarcación vs ideal
    const byPosition = new Map<string, number>();
    for (const p of players) byPosition.set(p.position, (byPosition.get(p.position) ?? 0) + 1);
    for (const [position, ideal] of Object.entries(IDEAL_DEPTH)) {
      const count = byPosition.get(position) ?? 0;
      if (count < ideal) {
        recommendations.push({
          key: `depth_${position}`,
          severity: count <= ideal - 2 ? 'high' : 'medium',
          title: `Falta profundidad en ${POSITION_LABEL[position]}`,
          detail: `Tienes ${count} jugadores de ${position} y lo recomendable son ${ideal}. Una lesión te dejaría vendido.`,
          cta: { label: 'Buscar en el mercado', route: '/market' },
        });
      }
    }

    // 2 · Contratos que vencen ≤ 1 temporada
    const now = new Date();
    const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const expiring = players.filter((p) =>
      p.contractEndAt ? p.contractEndAt <= oneYear : p.contractYears <= 1);
    if (expiring.length > 0) {
      const starters = expiring.filter((p) => p.isStarter);
      const names = expiring.slice(0, 3).map((p) => p.name).join(', ');
      recommendations.push({
        key: 'contracts_expiring',
        severity: starters.length > 0 ? 'high' : 'medium',
        title: `${expiring.length} contrato${expiring.length > 1 ? 's' : ''} a punto de vencer`,
        detail: `${names}${expiring.length > 3 ? '…' : ''} termina${expiring.length > 1 ? 'n' : ''} contrato en menos de una temporada${starters.length > 0 ? ' (hay titulares entre ellos)' : ''}. Renueva o vende antes de perderlos gratis.`,
        cta: { label: 'Revisar plantilla', route: '/squad' },
      });
    }

    // 3 · Masa salarial anual vs presupuesto
    // AUDIT 1.2: helper canónico (antes `p.wage ?? 0` ignoraba el fallback a salary
    // → infravaloraba la masa salarial en filas con wage null).
    const annualWages = players.reduce((sum, p) => sum + playerWage(p), 0) * 12;
    if (club.budget > 0 && annualWages / club.budget > 0.7) {
      const pct = Math.round((annualWages / club.budget) * 100);
      recommendations.push({
        key: 'salary_mass',
        severity: pct > 90 ? 'high' : 'medium',
        title: 'Masa salarial alta',
        detail: `Los sueldos anuales suponen el ${pct}% de tu presupuesto. Margen de maniobra muy justo para fichar o renovar.`,
        cta: { label: 'Ver economía', route: '/economy' },
      });
    }

    // 4 · Titulares con fitness bajo
    const tired = players.filter((p) => p.isStarter && p.fitness < 70);
    if (tired.length > 0) {
      recommendations.push({
        key: 'starters_tired',
        severity: tired.length >= 3 ? 'high' : 'medium',
        title: `${tired.length} titular${tired.length > 1 ? 'es' : ''} con la forma baja`,
        detail: `${tired.slice(0, 3).map((p) => p.name).join(', ')}${tired.length > 3 ? '…' : ''} está${tired.length > 1 ? 'n' : ''} por debajo de 70 de fitness. Considera rotar o ajustar el entrenamiento.`,
        cta: { label: 'Ir a entrenamiento', route: '/training' },
      });
    }

    // 5 · Juveniles promocionables
    const promotable = (youthAcademy?.youthPlayers ?? []).filter((y) => y.age >= 17 && y.potential >= 75);
    if (promotable.length > 0) {
      recommendations.push({
        key: 'youth_ready',
        severity: 'low',
        title: `${promotable.length} juvenil${promotable.length > 1 ? 'es' : ''} listo${promotable.length > 1 ? 's' : ''} para subir`,
        detail: `${promotable.slice(0, 3).map((y) => youthName(y.attributes)).join(', ')} tiene${promotable.length > 1 ? 'n' : ''} edad y potencial para el primer equipo.`,
        cta: { label: 'Ver cantera', route: '/academy' },
      });
    }

    // 6 · Ofertas recibidas sin responder
    if (pendingOffers > 0) {
      recommendations.push({
        key: 'offers_pending',
        severity: pendingOffers >= 3 ? 'medium' : 'low',
        title: `${pendingOffers} oferta${pendingOffers > 1 ? 's' : ''} sin responder`,
        detail: 'Hay clubes esperando respuesta por jugadores tuyos. Si no contestas, caducarán.',
        cta: { label: 'Ver ofertas', route: '/market' },
      });
    }

    recommendations.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return { recommendations };
  },

  // ─── QW-7 · GET /api/club/rival-week ────────────────────────────────────────
  // Prioridad de detección: rival directo en puntos → quien me eliminó de copa
  // → quien me quitó un fichaje → derbi histórico (Rivalry).
  async getFormalRivalry(clubId: number) {
    return detectFormalRivalry(clubId);
  },

  async getRivalOfTheWeek(clubId: number) {
    const seasonId = await activeSeasonId();
    const reasonsByClub = new Map<number, Set<string>>();
    const addReason = (rivalClubId: number, reason: string) => {
      if (rivalClubId === clubId) return;
      const set = reasonsByClub.get(rivalClubId) ?? new Set<string>();
      set.add(reason);
      reasonsByClub.set(rivalClubId, set);
    };

    // 1 · Rival directo en la tabla (≤3 puntos en mi liga)
    let myPosition: number | null = null;
    const rivalPositions = new Map<number, number>();
    const pointsByClub = new Map<number, number>();
    if (seasonId) {
      const myStanding = await prisma.standing.findFirst({
        where: { clubId, competition: { seasonId, type: 'league' } },
        select: { competitionId: true, points: true },
      });
      if (myStanding) {
        const table = await prisma.standing.findMany({
          where: { competitionId: myStanding.competitionId },
          select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
        });
        const sorted = sortStandings(table);
        sorted.forEach((row, index) => {
          rivalPositions.set(row.clubId, index + 1);
          pointsByClub.set(row.clubId, row.points);
          if (row.clubId === clubId) myPosition = index + 1;
        });
        for (const row of sorted) {
          if (row.clubId !== clubId && Math.abs(row.points - myStanding.points) <= 3) {
            addReason(row.clubId, 'points');
          }
        }
      }
    }

    // 2 · Quien me eliminó de copa esta temporada (derrota en eliminatoria)
    if (seasonId) {
      const knockoutLosses = await prisma.match.findMany({
        where: {
          status: 'played',
          matchday: { isKnockout: true, competition: { seasonId } },
          OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        },
        select: { homeClubId: true, awayClubId: true, homeGoals: true, awayGoals: true },
        orderBy: { id: 'desc' },
        take: 10,
      });
      for (const m of knockoutLosses) {
        const myGoals = m.homeClubId === clubId ? m.homeGoals ?? 0 : m.awayGoals ?? 0;
        const theirGoals = m.homeClubId === clubId ? m.awayGoals ?? 0 : m.homeGoals ?? 0;
        if (theirGoals > myGoals) {
          addReason(m.homeClubId === clubId ? m.awayClubId : m.homeClubId, 'cup_elimination');
        }
      }
    }

    // 3 · Quien me quitó un fichaje (oferta mía rechazada y el jugador acabó en otro club)
    const lostOffers = await prisma.transferOffer.findMany({
      where: { fromClubId: clubId, status: { in: ['rejected', 'expired'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: {
        toClubId: true,
        player: { select: { clubId: true, lastTransferAt: true } },
      },
    });
    for (const offer of lostOffers) {
      const currentClub = offer.player.clubId;
      // El jugador se movió a un tercero (ni el dueño original ni yo): me lo quitaron.
      if (currentClub && currentClub !== clubId && currentClub !== offer.toClubId && offer.player.lastTransferAt) {
        addReason(currentClub, 'transfer_sniper');
      }
    }

    // 4 · Derbi histórico
    const rivalries = await prisma.rivalry.findMany({
      where: { OR: [{ clubAId: clubId }, { clubBId: clubId }] },
    });
    for (const r of rivalries) {
      addReason(r.clubAId === clubId ? r.clubBId : r.clubAId, 'head_to_head');
    }

    const formalRivalry = await detectFormalRivalry(clubId).catch(() => null);
    if (formalRivalry?.rival?.id) {
      for (const reason of formalRivalry.reasons) addReason(formalRivalry.rival.id, reason);
    }

    if (reasonsByClub.size === 0) return { rival: null };

    // Elegir: más motivos gana; desempata la prioridad de la primera regla.
    const PRIORITY = ['points', 'cup_elimination', 'transfer_sniper', 'city', 'finals', 'frequency', 'human_duel', 'head_to_head'];
    const best = [...reasonsByClub.entries()].sort((a, b) => {
      if (b[1].size !== a[1].size) return b[1].size - a[1].size;
      const pa = Math.min(...[...a[1]].map((r) => PRIORITY.indexOf(r)));
      const pb = Math.min(...[...b[1]].map((r) => PRIORITY.indexOf(r)));
      return pa - pb;
    })[0];
    const [rivalId, reasonSet] = best;
    const reasons = PRIORITY.filter((r) => reasonSet.has(r));

    const [rival, h2h, nextMeeting] = await Promise.all([
      prisma.club.findUnique({ where: { id: rivalId }, select: CLUB_SELECT }),
      memoryService.headToHead(clubId, rivalId).catch(() => null),
      prisma.match.findFirst({
        where: {
          status: 'scheduled',
          OR: [
            { homeClubId: clubId, awayClubId: rivalId },
            { homeClubId: rivalId, awayClubId: clubId },
          ],
        },
        orderBy: { id: 'asc' },
        select: { id: true, playedAt: true, homeClubId: true },
      }),
    ]);
    if (!rival) return { rival: null };

    const myPoints = pointsByClub.get(clubId);
    const rivalPoints = pointsByClub.get(rivalId);
    const pointsGap = myPoints !== undefined && rivalPoints !== undefined
      ? Math.abs(myPoints - rivalPoints)
      : null;

    const lastMatch = h2h?.recent?.[0] ?? null;
    const taglines: Record<string, string> = {
      points: pointsGap === 0
        ? `Empatados a puntos con el ${rival.shortName}. Cada jornada es una final.`
        : `Os separan ${pointsGap} punto${pointsGap === 1 ? '' : 's'} del ${rival.shortName}. La afición pide revancha.`,
      cup_elimination: `El ${rival.shortName} te apeó de la copa esta temporada. La afición no lo olvida.`,
      transfer_sniper: `El ${rival.shortName} te levantó un fichaje en el mercado. Toca devolvérsela en el campo.`,
      city: `Derbi de ciudad contra el ${rival.shortName}. La calle ya lo está jugando.`,
      finals: `El ${rival.shortName} aparece demasiado en los días grandes. Hay cuentas pendientes.`,
      frequency: `Os cruzáis una y otra vez: esto ya tiene memoria propia.`,
      human_duel: `Al otro lado también manda una persona. Cada decisión pesa el doble.`,
      head_to_head: `Derbi histórico contra el ${rival.shortName}. Esto es más que tres puntos.`,
    };

    return {
      rival,
      reasons,
      pointsGap,
      myPosition,
      rivalPosition: rivalPositions.get(rivalId) ?? null,
      headToHead: h2h
        ? {
            played: h2h.summary.played,
            wins: h2h.summary.clubAWins,
            draws: h2h.summary.draws,
            losses: h2h.summary.clubBWins,
            lastMatch: lastMatch
              ? {
                  id: lastMatch.id,
                  score: `${lastMatch.homeGoals ?? 0}-${lastMatch.awayGoals ?? 0}`,
                  result: lastMatch.homeClub.id === clubId
                    ? ((lastMatch.homeGoals ?? 0) > (lastMatch.awayGoals ?? 0) ? 'win' : (lastMatch.homeGoals ?? 0) === (lastMatch.awayGoals ?? 0) ? 'draw' : 'loss')
                    : ((lastMatch.awayGoals ?? 0) > (lastMatch.homeGoals ?? 0) ? 'win' : (lastMatch.awayGoals ?? 0) === (lastMatch.homeGoals ?? 0) ? 'draw' : 'loss'),
                  playedAt: lastMatch.playedAt,
                }
              : null,
          }
        : null,
      nextMeeting: nextMeeting
        ? { matchId: nextMeeting.id, playedAt: nextMeeting.playedAt, home: nextMeeting.homeClubId === clubId }
        : null,
      formalRivalry,
      prestigeMultiplier: formalRivalry?.rival.id === rivalId ? formalRivalry.prestigeMultiplier : null,
      tagline: taglines[reasons[0]] ?? `Semana de pique con el ${rival.shortName}.`,
    };
  },
};
