import prisma from '../../db/prisma';
import { careerLevelFromXp } from '../manager/careerCurve';
import { coefficientService } from '../world/competitions/coefficient.service';
import { npcCoachService } from '../manager/npcCoach.service';
import { sortStandings, withHeadToHeadPoints } from './standings';
import { shouldCleanCardMarker } from './suspensions.logic';

export async function finalizeSeasonIfComplete(seasonId: number) {
  // Check if ALL matchdays are simulated
  const [pending, scheduledMatches] = await Promise.all([
    prisma.matchday.count({
      where: { competition: { seasonId }, status: 'pending' },
    }),
    prisma.match.count({
      where: { matchday: { competition: { seasonId } }, status: 'scheduled' },
    }),
  ]);
  if (pending > 0 || scheduledMatches > 0) return;

  const seasonState = await prisma.season.findUnique({ where: { id: seasonId } });
  // P1 #94: claim atómico RE-ENTRANTE. Antes se marcaba phase 'end' ANTES del
  // trabajo: un crash a mitad perdía premios/historiales/plazas para siempre.
  // Ahora: claim a 'closing' (acepta re-entrar si un cierre anterior crasheó),
  // trabajo idempotente (uniques Award/SeasonHistory + checks de existencia),
  // y SOLO al terminar todo se marca 'end'.
  const claim = await prisma.gameState.updateMany({
    where: { seasonId, isActive: true, phase: { not: 'end' } },
    data: { phase: 'closing' },
  });
  if (claim.count === 0) return; // ya cerrada ('end') o sin estado activo

  const completedCardMarkers = await prisma.suspension.findMany({
    where: { matches: { lte: 0 }, reason: { startsWith: 'cards:' } },
    select: { id: true, reason: true },
  });
  const completedCardMarkerIds = completedCardMarkers
    .filter(marker => shouldCleanCardMarker(marker.reason, seasonId))
    .map(marker => marker.id);
  if (completedCardMarkerIds.length > 0) {
    await prisma.suspension.deleteMany({ where: { id: { in: completedCardMarkerIds } } });
  }

  // We are going to close the season
  console.log('[tick] Cerrando temporada', seasonState?.name);

  const competitions = await prisma.competition.findMany({
    where: { seasonId },
    include: {
      standings: { include: { club: true } },
      matchdays: {
        select: {
          matches: {
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

  let awardsCreated = 0;
  let historiesCreated = 0;

  for (const comp of competitions) {
    // Premios individuales SOLO por liga (antes se creaba un Pichichi/MVP por CADA
    // competición, copas incluidas → el palmarés salía "duplicado"). El nombre
    // lleva la competición para distinguir ligas, y la creación es idempotente.
    if (comp.type !== 'league') continue;
    const compLabel = comp.shortName || comp.name;
    const seasonName = seasonState?.name || '2025/2026';

    // Pichichi — desempate determinista por playerId ante empate de goles
    const topScorers = await prisma.playerMatchStat.groupBy({
      by: ['playerId'],
      _sum: { goals: true },
      where: { match: { matchday: { competitionId: comp.id } } },
      orderBy: { _sum: { goals: 'desc' } },
      take: 20,
    });
    const pichichiGoals = topScorers[0]?._sum.goals ?? 0;
    const pichichiWinner = topScorers
      .filter((row) => (row._sum.goals ?? 0) === pichichiGoals && pichichiGoals > 0)
      .sort((a, b) => a.playerId - b.playerId)[0];

    if (pichichiWinner) {
      const p = await prisma.player.findUnique({ where: { id: pichichiWinner.playerId } });
      const awardName = `Pichichi · ${compLabel}`;
      const exists = await prisma.award.findFirst({ where: { name: awardName, season: seasonName } });
      if (p && !exists) {
        await prisma.award.create({
          data: {
            name: awardName,
            type: 'player',
            season: seasonName,
            winnerPlayerId: p.id,
          },
        });
        awardsCreated++;
      }
    }

    // MVP — desempate determinista por playerId ante empate de nota media
    const topRatings = await prisma.playerMatchStat.groupBy({
      by: ['playerId'],
      _avg: { rating: true },
      _count: { matchId: true },
      where: { match: { matchday: { competitionId: comp.id } } },
      having: { matchId: { _count: { gte: 10 } } },
      orderBy: { _avg: { rating: 'desc' } },
      take: 20,
    });
    const mvpRating = topRatings[0]?._avg.rating ?? 0;
    const mvpWinner = topRatings
      .filter((row) => (row._avg.rating ?? 0) === mvpRating && mvpRating > 0)
      .sort((a, b) => a.playerId - b.playerId)[0];

    if (mvpWinner) {
      const p = await prisma.player.findUnique({ where: { id: mvpWinner.playerId } });
      const awardName = `MVP · ${compLabel}`;
      const exists = await prisma.award.findFirst({ where: { name: awardName, season: seasonName } });
      if (p && !exists) {
        await prisma.award.create({
          data: {
            name: awardName,
            type: 'player',
            season: seasonName,
            winnerPlayerId: p.id,
          },
        });
        awardsCreated++;
      }
    }

    // Season History for Clubs
    if (comp.type === 'league') {
      const standings = sortStandings(withHeadToHeadPoints(
        comp.standings,
        comp.matchdays.flatMap((matchday) => matchday.matches),
      ));

      for (let i = 0; i < standings.length; i++) {
        // Idempotente vía @@unique([clubId, competitionId, season]): re-entrada
        // tras crash no duplica historial.
        try {
          await prisma.seasonHistory.create({
            data: {
              clubId: standings[i].clubId,
              competitionId: comp.id,
              season: seasonState?.name || '2025/2026',
              position: i + 1,
              points: standings[i].points,
            },
          });
          historiesCreated++;
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err;
        }

        // Honour for the winner
        if (i === 0) {
          // Guarda de re-entrada (Honour no tiene unique): si ya existe el título
          // de esta temporada, no duplicar honour + logro + XP del mánager.
          const honourName = `Campeón ${comp.name}`;
          const honourSeason = seasonState?.name || '2025/2026';
          const honourExists = await prisma.honour.findFirst({
            where: { name: honourName, season: honourSeason, clubId: standings[i].clubId },
            select: { id: true },
          });
          if (honourExists) continue;

          await prisma.honour.create({
            data: {
              name: honourName,
              season: honourSeason,
              clubId: standings[i].clubId,
            },
          });

          // Grant Manager Achievement and XP
          const club = await prisma.club.findUnique({
            where: { id: standings[i].clubId },
            include: { manager: true },
          });
          if (club?.manager) {
            let achievementCreated = true;
            try {
              await prisma.managerAchievement.create({
                data: {
                  managerId: club.manager.id,
                  type: 'LEAGUE_WIN',
                  title: `Campeón de ${comp.name} (${seasonState?.name || '2025/2026'})`,
                },
              });
            } catch (err) {
              if ((err as { code?: string }).code !== 'P2002') throw err;
              achievementCreated = false;
            }
            if (!achievementCreated) continue;
            // Giant XP and prestige bonus for winning the league
            const prestigeBonus = comp.isContinental ? 1000 : 500;
            const nextXp = club.manager.xp + 5000;
            const nextLevel = Math.max(club.manager.level, careerLevelFromXp(nextXp));
            const nextPrestige = club.manager.prestige + prestigeBonus;
            await prisma.manager.update({
              where: { id: club.manager.id },
              data: {
                xp: nextXp,
                level: nextLevel,
                reputation: { increment: 5 },
                prestige: nextPrestige,
              },
            });
            await prisma.prestige.create({
              data: {
                managerId: club.manager.id,
                value: nextPrestige,
                history: JSON.stringify({
                  event: 'league_win',
                  competitionId: comp.id,
                  season: seasonState?.name || '2025/2026',
                  from: club.manager.prestige,
                  to: nextPrestige,
                }),
              },
            });

            await prisma.managerPrestigeLog.create({
              data: {
                managerId: club.manager.id,
                points: prestigeBonus,
                description: `Ganador de ${comp.name} (${seasonState?.name || '2025/2026'})`,
              },
            });
          }
        }
      }
    }
  }

  const closingHeadline = `¡La temporada ${seasonState?.name} ha concluido!`;
  const pressExists = await prisma.pressItem.findFirst({ where: { headline: closingHeadline }, select: { id: true } });
  if (!pressExists) {
    await prisma.pressItem.create({
      data: {
        headline: closingHeadline,
        content: 'Revisa el palmarés y prepárate para el siguiente año.',
      },
    });
  }

  // --- E2: League Coefficients & European Slots Allocation ---
  // Delegate to coefficient service
  await coefficientService.calculateLeagueCoefficients(seasonId);
  await coefficientService.allocateEuropeanSlots(seasonId);

  await npcCoachService.runSeasonCareerReview(seasonId, seasonState?.name || '2025/2026');

  // P1 #94: 'end' SOLO cuando todo el trabajo de cierre ha terminado.
  await prisma.gameState.updateMany({ where: { seasonId, isActive: true }, data: { phase: 'end' } });

  console.log(`[tick] Temporada cerrada. ${awardsCreated} premios, ${historiesCreated} historiales. Coeficientes calculados.`);
}
