import prisma from '../../../db/prisma';
import { sortStandings, withHeadToHeadPoints } from '../../game/standings';

export function continentalMatchPoints(
  competitionCode: string,
  result: 'win' | 'draw' | 'loss',
): number {
  if (result === 'loss') return 0;
  const normalized = competitionCode.toLocaleUpperCase('es-ES');
  const major = normalized.includes('UCL')
    || normalized.includes('CHAMPIONS')
    || normalized.includes('LIBERT');
  if (major) return result === 'win' ? 4 : 2;
  return result === 'win' ? 2 : 1;
}

class CoefficientService {
  /**
   * Adds match points for a club in a European competition.
   * Win = 2 points, Draw = 1 point.
   */
  async awardMatchPoints(clubId: number, seasonId: number, competitionCode: string, isWin: boolean, isDraw: boolean) {
    const points = continentalMatchPoints(
      competitionCode,
      isWin ? 'win' : isDraw ? 'draw' : 'loss',
    );

    if (points === 0) return;

    await prisma.clubCoefficient.upsert({
      where: {
        clubId_seasonId: {
          clubId,
          seasonId
        }
      },
      update: {
        points: { increment: points }
      },
      create: {
        clubId,
        seasonId,
        points
      }
    });
  }

  /**
   * Adds bonus points for reaching specific stages.
   * Currently simplified.
   */
  async awardBonusPoints(clubId: number, seasonId: number, competitionType: string, points: number) {
    if (!competitionType) return;
    if (points <= 0) return;

    await prisma.clubCoefficient.upsert({
      where: {
        clubId_seasonId: {
          clubId,
          seasonId
        }
      },
      update: {
        points: { increment: points }
      },
      create: {
        clubId,
        seasonId,
        points
      }
    });
  }

  /**
   * Calculates the league coefficient for the current season by averaging
   * the points of all participating clubs from that country.
   */
  async calculateLeagueCoefficients(seasonId: number) {
    // Get all points earned in this season grouped by club country
    const clubCoefs = await prisma.clubCoefficient.findMany({
      where: { seasonId },
      include: { club: true }
    });

    const countryStats: Record<string, { totalPoints: number, clubCount: number }> = {};

    for (const coef of clubCoefs) {
      const country = coef.club.country;
      if (!countryStats[country]) {
        countryStats[country] = { totalPoints: 0, clubCount: 0 };
      }
      countryStats[country].totalPoints += coef.points;
      countryStats[country].clubCount += 1;
    }

    // Upsert the league coefficient for this season
    for (const [country, stats] of Object.entries(countryStats)) {
      const averagePoints = stats.totalPoints / stats.clubCount;
      
      await prisma.leagueCoefficient.upsert({
        where: {
          country_seasonId: {
            country,
            seasonId
          }
        },
        update: {
          points: averagePoints,
          numClubs: stats.clubCount
        },
        create: {
          country,
          seasonId,
          points: averagePoints,
          numClubs: stats.clubCount
        }
      });
    }
  }

  /**
   * Calculates the European slots allocation for the next season
   * based on the 5-season rolling coefficient ranking.
   */
  async allocateEuropeanSlots(currentSeasonId: number) {
    // Fetch all league coefficients from the current and previous 4 seasons (5 seasons total)
    // We assume season IDs are somewhat sequential, but it's safer to fetch based on date or just top 5 by seasonId descending.
    const allLeagueCoefs = await prisma.leagueCoefficient.findMany({
      where: {
        seasonId: {
          lte: currentSeasonId,
          gte: Math.max(1, currentSeasonId - 4) // Simplification for rolling 5-year
        }
      }
    });

    const rollingPoints: Record<string, number> = {};

    for (const coef of allLeagueCoefs) {
      if (!rollingPoints[coef.country]) rollingPoints[coef.country] = 0;
      rollingPoints[coef.country] += coef.points;
    }

    // Sort countries by total points (descending)
    const ranking = Object.entries(rollingPoints)
      .map(([country, points]) => ({ country, points }))
      .sort((a, b) => b.points - a.points);

    // Apply UEFA distribution rules
    // Using current modern convention:
    // 1-4: 4 UCL, 2 UEL, 1 UECL
    // 5: 3 UCL, 2 UEL, 1 UECL
    // 6: 3 UCL, 1 UEL, 1 UECL
    // 7-10: 2 UCL, 1 UEL, 1 UECL
    // 11+: 1 UCL, 1 UEL, 1 UECL
    
    // We also need to get a list of all active countries even if they have 0 points
    const allClubs = await prisma.club.findMany({
      select: { country: true },
      distinct: ['country']
    });
    const allCountries = allClubs.map((c: any) => c.country);
    
    for (const c of allCountries) {
      if (!ranking.find(r => r.country === c)) {
        ranking.push({ country: c, points: 0 });
      }
    }

    // Re-sort just in case
    ranking.sort((a, b) => b.points - a.points);

    // Guardamos la asignación vinculada a la temporada actual que la generó
    // para evitar violaciones de clave foránea con la temporada futura.
    for (let i = 0; i < ranking.length; i++) {
      const country = ranking[i].country;
      const rank = i + 1;
      
      let ucl = 1, uel = 1, uecl = 1;
      
      if (rank <= 4) {
        ucl = 4; uel = 2; uecl = 1;
      } else if (rank === 5) {
        ucl = 3; uel = 2; uecl = 1;
      } else if (rank === 6) {
        ucl = 3; uel = 1; uecl = 1;
      } else if (rank >= 7 && rank <= 10) {
        ucl = 2; uel = 1; uecl = 1;
      }

      await prisma.europeanSlotAllocation.upsert({
        where: {
          country_seasonId: {
            country,
            seasonId: currentSeasonId
          }
        },
        update: { ucl, uel, uecl },
        create: {
          country,
          seasonId: currentSeasonId,
          ucl,
          uel,
          uecl
        }
      });
    }
  }

  /**
   * F36 · Devuelve los CLUBES clasificados a Europa para la temporada siguiente,
   * cruzando las plazas por país (allocateEuropeanSlots) con la clasificación
   * FINAL de las ligas tier-1 de la temporada que se cierra.
   * Las listas se recortan a cardinal PAR (el generador suizo lo exige).
   */
  async getEuropeanSlots(prevSeasonId: number): Promise<{ ucl: number[]; uel: number[]; uecl: number[] }> {
    // Asegurar coeficientes + asignación de plazas (idempotentes; misma
    // convención de clave que allocateEuropeanSlots: seasonId = prevSeasonId+1).
    try {
      await this.calculateLeagueCoefficients(prevSeasonId);
      await this.allocateEuropeanSlots(prevSeasonId);
    } catch (e) {
      console.error('[coefficients] no se pudieron asegurar las plazas europeas:', e);
    }
    const allocations = await prisma.europeanSlotAllocation.findMany({
      where: { seasonId: prevSeasonId },
    });

    const leagues = await prisma.competition.findMany({
      where: { seasonId: prevSeasonId, type: 'league', tier: 1 },
      include: {
        standings: {
          select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true, won: true },
        },
        matchdays: {
          select: {
            matches: {
              where: { status: 'played' },
              select: {
                homeClubId: true,
                awayClubId: true,
                homeGoals: true,
                awayGoals: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const ucl: number[] = [];
    const uel: number[] = [];
    const uecl: number[] = [];
    for (const league of leagues) {
      const alloc = allocations.find(a => a.country === league.country) ?? { ucl: 1, uel: 1, uecl: 1 };
      const sorted = sortStandings(withHeadToHeadPoints(
        league.standings,
        league.matchdays.flatMap((matchday) => matchday.matches),
      ));
      const ids = sorted.map(s => s.clubId);
      ucl.push(...ids.slice(0, alloc.ucl));
      uel.push(...ids.slice(alloc.ucl, alloc.ucl + alloc.uel));
      uecl.push(...ids.slice(alloc.ucl + alloc.uel, alloc.ucl + alloc.uel + alloc.uecl));
    }

    // El round-robin suizo necesita un nº PAR de equipos: recorta el último.
    const even = (arr: number[]) => (arr.length % 2 === 0 ? arr : arr.slice(0, -1));
    return { ucl: even(ucl), uel: even(uel), uecl: even(uecl) };
  }
}

export const coefficientService = new CoefficientService();
