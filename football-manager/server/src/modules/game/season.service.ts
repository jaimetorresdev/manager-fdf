import type { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import { coefficientService } from '../world/competitions/coefficient.service';
import { makeRng } from './tick.logic';
import { sortStandings, withHeadToHeadPoints } from './standings';

type Rng = () => number;

export function assertPreviousSeasonComplete(pendingMatchdays: number, scheduledMatches = 0): void {
  if (pendingMatchdays > 0) {
    throw new Error(`No se puede sembrar una temporada nueva: quedan ${pendingMatchdays} jornadas pendientes.`);
  }
  if (scheduledMatches > 0) {
    throw new Error(`No se puede sembrar una temporada nueva: quedan ${scheduledMatches} partido(s) programado(s).`);
  }
}

type CompetitionRolloverSource = {
  country: string;
  tier: number;
  processingShard: string | null;
  humanStatus: string;
  defaultSimulationTier: string;
  activityScore: number;
  humanManagersCount: number;
  lastHumanLoginAt: Date | null;
};

export function rolloverCompetitionMetadata(source: CompetitionRolloverSource) {
  return {
    processingShard: source.processingShard
      ?? `${source.country || 'world'}:${Math.max(1, source.tier)}`.toLowerCase().slice(0, 80),
    humanStatus: source.humanStatus,
    defaultSimulationTier: source.defaultSimulationTier,
    activityScore: source.activityScore,
    humanManagersCount: source.humanManagersCount,
    lastHumanLoginAt: source.lastHumanLoginAt,
  };
}

// Determinista por temporada (P3 #123: nada de Math.random en el pipeline del tick).
function getRandomWeather(rng: Rng) {
  const rand = rng();
  const weatherCondition = rand < 0.6 ? 'normal' : rand < 0.8 ? 'rain' : rand < 0.85 ? 'snow' : 'hot';
  let temperature = 20;
  if (weatherCondition === 'snow') temperature = Math.floor(rng() * 10) - 5;
  else if (weatherCondition === 'hot') temperature = Math.floor(rng() * 10) + 30;
  else if (weatherCondition === 'rain') temperature = Math.floor(rng() * 15) + 5;
  else temperature = Math.floor(rng() * 15) + 15;
  return { weatherCondition, temperature };
}

// Con nº impar de equipos, el sobrante recibe BYE (pasa de ronda) en vez de
// desaparecer del torneo (P1 #98).
function generateKnockoutBracket(teamIds: number[], rng: Rng): { matchups: { home: number; away: number }[]; bye: number | null } {
  const shuffled = [...teamIds]
    .map(id => ({ id, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map(x => x.id);
  const matchups: { home: number; away: number }[] = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    matchups.push({ home: shuffled[i], away: shuffled[i + 1] });
  }
  const bye = shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : null;
  return { matchups, bye };
}

// Fase liga "suiza": round-robin de Berger truncado a matchesPerTeam rondas →
// NINGUNA pareja se repite entre rondas (P1 #99). Con n impar se añade un BYE
// virtual (-1) y esa pareja se omite (cada equipo descansa a lo sumo una ronda;
// antes los índices fraccionarios producían clubId undefined).
function generateSwissFixtures(teamIds: number[], matchesPerTeam: number, rng: Rng): { matchday: number; home: number; away: number }[] {
  const fixtures: { matchday: number; home: number; away: number }[] = [];
  const arr = [...teamIds];
  if (arr.length % 2 === 1) arr.push(-1);
  const n = arr.length;
  if (n < 2) return fixtures;
  const rounds = Math.min(matchesPerTeam, n - 1);
  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === -1 || b === -1) continue;
      if (rng() > 0.5) fixtures.push({ matchday: round, home: a, away: b });
      else fixtures.push({ matchday: round, home: b, away: a });
    }
    // Rotación de Berger: arr[0] fijo, el resto rota una posición.
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }
  return fixtures;
}

/** Partido "walkover" persistido como jugado: representa un BYE en el cuadro.
 *  winnerFromStoredStats lee winnerClubId del JSON, así el club avanza de ronda. */
export function byeWalkoverMatchData(matchdayId: number, clubId: number, round?: string) {
  return {
    matchdayId,
    homeClubId: clubId,
    awayClubId: clubId,
    status: 'played',
    homeGoals: 0,
    awayGoals: 0,
    winner: 'home',
    decidedBy: 'bye',
    isKnockout: true,
    leg: 1,
    round: round ?? null,
    playedAt: new Date(),
    homeStatsJson: JSON.stringify({ bye: true, winnerClubId: clubId }),
    awayStatsJson: JSON.stringify({ bye: true, winnerClubId: clubId }),
  };
}

function generateFixtures(clubIds: number[]): Array<{ home: number; away: number; matchday: number }> {
  const n       = clubIds.length;
  const fixtures: Array<{ home: number; away: number; matchday: number }> = [];
  const ids     = [...clubIds];

  for (let round = 0; round < (n - 1) * 2; round++) {
    const matchday = round + 1;
    const half     = n / 2;
    for (let i = 0; i < half; i++) {
      const homeIdx = i;
      const awayIdx = n - 1 - i;
      const isSecondHalf = round >= n - 1;
      fixtures.push({
        home:     isSecondHalf ? ids[awayIdx] : ids[homeIdx],
        away:     isSecondHalf ? ids[homeIdx] : ids[awayIdx],
        matchday,
      });
    }
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }
  return fixtures;
}

function scheduledMatchData(
  matchdayId: number,
  homeClubId: number,
  awayClubId: number,
  rng: Rng,
  extra: Partial<Prisma.MatchCreateManyInput> = {},
): Prisma.MatchCreateManyInput {
  const weather = getRandomWeather(rng);
  return {
    matchdayId,
    homeClubId,
    awayClubId,
    status: 'scheduled',
    weatherCondition: weather.weatherCondition,
    temperature: weather.temperature,
    ...extra,
  };
}

async function createStandingsBulk(competitionId: number, clubIds: number[]) {
  if (clubIds.length === 0) return;
  await prisma.standing.createMany({
    data: clubIds.map((clubId) => ({ competitionId, clubId })),
    skipDuplicates: true,
  });
}

async function createMatchdaysBulk(
  competitionId: number,
  numbers: number[],
  extra: Partial<Prisma.MatchdayCreateManyInput> = {},
) {
  const uniqueNumbers = Array.from(new Set(numbers)).sort((a, b) => a - b);
  if (uniqueNumbers.length === 0) return new Map<number, number>();

  await prisma.matchday.createMany({
    data: uniqueNumbers.map((number) => ({
      competitionId,
      number,
      status: 'pending',
      ...extra,
    })),
  });

  const rows = await prisma.matchday.findMany({
    where: { competitionId, number: { in: uniqueNumbers } },
    select: { id: true, number: true },
  });
  return new Map(rows.map((row) => [row.number, row.id]));
}

export async function generateNewSeason(prevSeasonId: number) {
  const prevSeason = await prisma.season.findUnique({ where: { id: prevSeasonId } });
  if (!prevSeason) throw new Error('Previous season not found');
  const [pendingMatchdays, scheduledMatches] = await Promise.all([
    prisma.matchday.count({
      where: { competition: { seasonId: prevSeasonId }, status: 'pending' },
    }),
    prisma.match.count({
      where: { matchday: { competition: { seasonId: prevSeasonId } }, status: 'scheduled' },
    }),
  ]);
  assertPreviousSeasonComplete(pendingMatchdays, scheduledMatches);

  const newYear = prevSeason.year + 1;
  const newSeasonName = `${newYear}-${(newYear + 1).toString().slice(2)}`;
  // RNG determinista por temporada: sembrado, clima y sorteos auditables (P3 #123).
  const rng = makeRng(newYear * 104729 + 7);

  console.log(`\n================================`);
  console.log(`🌱 SEMBRANDO NUEVA TEMPORADA: ${newSeasonName}`);
  console.log(`================================`);

  let nextSeason = await prisma.season.findFirst({ where: { name: newSeasonName } });
  if (!nextSeason) {
    nextSeason = await prisma.season.create({
      data: {
        name: newSeasonName,
        year: newYear,
        isActive: false
      }
    });
  }

  // 1. Ligas Domésticas (Ascensos y Descensos)
  const leagues = await prisma.competition.findMany({
    where: { seasonId: prevSeason.id, type: 'league' },
    include: {
      standings: {
        orderBy: [ { points: 'desc' }, { goalsFor: 'desc' } ],
        include: { club: true }
      },
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
    }
  });

  // Comparador canónico compartido con cierre, rollover y vistas.
  for (const l of leagues) {
    l.standings = sortStandings(withHeadToHeadPoints(
      l.standings,
      l.matchdays.flatMap((matchday) => matchday.matches),
    ));
  }

  const leaguesByCountry: Record<string, typeof leagues> = {};
  for (const l of leagues) {
    if (!l.country) continue;
    if (!leaguesByCountry[l.country]) leaguesByCountry[l.country] = [];
    leaguesByCountry[l.country].push(l);
  }

  const allPromotedClubIds = new Set<number>();
  const allRelegatedClubIds = new Set<number>();

  for (const country in leaguesByCountry) {
    const countryLeagues = leaguesByCountry[country].sort((a, b) => (a.tier || 1) - (b.tier || 1));
    
    // Preparar el array de nuevos participantes en memoria
    const newParticipantsByTier: Record<number, number[]> = {};
    for (const l of countryLeagues) {
      newParticipantsByTier[l.tier || 1] = l.standings.map(s => s.clubId);
    }

    // Efectuar descensos y ascensos (los últimos 3 y primeros 3)
    for (let i = 0; i < countryLeagues.length - 1; i++) {
      const currentTier = countryLeagues[i].tier || 1;
      const nextTier = countryLeagues[i + 1].tier || 2;
      
      const currentStandings = countryLeagues[i].standings;
      const nextStandings = countryLeagues[i + 1].standings;
      
      const relegatedCount = Math.min(3, currentStandings.length);
      const promotedCount = Math.min(3, nextStandings.length);

      const relegatedClubIds = currentStandings.slice(-relegatedCount).map(s => s.clubId);
      const promotedClubIds = nextStandings.slice(0, promotedCount).map(s => s.clubId);

      // Quitar descendidos del tier actual, añadir ascendidos
      newParticipantsByTier[currentTier] = newParticipantsByTier[currentTier].filter(id => !relegatedClubIds.includes(id));
      newParticipantsByTier[currentTier].push(...promotedClubIds);

      // Quitar ascendidos del tier inferior, añadir descendidos
      newParticipantsByTier[nextTier] = newParticipantsByTier[nextTier].filter(id => !promotedClubIds.includes(id));
      newParticipantsByTier[nextTier].push(...relegatedClubIds);
      
      relegatedClubIds.forEach(id => allRelegatedClubIds.add(id));
      promotedClubIds.forEach(id => allPromotedClubIds.add(id));
    }

    // Crear/Actualizar Competiciones y Fixtures
    for (const league of countryLeagues) {
      const existingComp = await prisma.competition.findFirst({
        where: { seasonId: nextSeason.id, name: league.name }
      });
      
      let compId = existingComp?.id;
      const rolloverMetadata = rolloverCompetitionMetadata(league);
      if (!compId) {
        const newComp = await prisma.competition.create({
          data: {
            seasonId: nextSeason.id,
            name: league.name,
            shortName: league.shortName,
            type: 'league',
            country: league.country,
            tier: league.tier,
            ...rolloverMetadata,
          }
        });
        compId = newComp.id;
        
        const participants = newParticipantsByTier[league.tier || 1];
        await createStandingsBulk(compId, participants);
      } else {
        await prisma.competition.update({
          where: { id: compId },
          data: rolloverMetadata,
        });
      }

      const existingMds = await prisma.matchday.findMany({
        where: { competitionId: compId }, select: { id: true },
      });
      
      if (existingMds.length === 0) {
        const participants = newParticipantsByTier[league.tier || 1];
        const fixtures = generateFixtures(participants);
        if (fixtures.length > 0) {
          const matchdayCache = await createMatchdaysBulk(
            compId,
            fixtures.map((fix) => fix.matchday),
          );
          await prisma.match.createMany({
            data: fixtures.map((fix) => scheduledMatchData(
              matchdayCache.get(fix.matchday)!,
              fix.home,
              fix.away,
              rng,
            )),
          });
        }
        console.log(`    ✅ Calendario de ${league.name} creado.`);
      }
    }
  }

  // 2. Copas Domésticas (Copa del Rey, FA Cup, Coppa Italia)
  const prevCups = await prisma.competition.findMany({
    where: { seasonId: prevSeason.id, type: 'cup' }
  });

  for (const prevCup of prevCups) {
    let cupComp = await prisma.competition.findFirst({
      where: { seasonId: nextSeason.id, name: prevCup.name }
    });
    
    if (!cupComp) {
      cupComp = await prisma.competition.create({
        data: {
          seasonId: nextSeason.id,
          name: prevCup.name,
          shortName: prevCup.shortName,
          type: 'cup',
          country: prevCup.country,
          format: 'knockout',
          ...rolloverCompetitionMetadata(prevCup),
        }
      });
      
      // Select all league teams from that country
      const countryLeagues = await prisma.competition.findMany({
        where: { seasonId: nextSeason.id, country: prevCup.country, type: 'league' }
      });
      const compIds = countryLeagues.map(c => c.id);
      
      if (compIds.length > 0) {
        const standings = await prisma.standing.findMany({ where: { competitionId: { in: compIds } }, select: { clubId: true } });
        const clubIds = standings.map(s => s.clubId);

        const md = await prisma.matchday.create({
          data: { competitionId: cupComp.id, number: 1, type: 'round_of_16', isKnockout: true, status: 'pending' },
        });

        const { matchups, bye } = generateKnockoutBracket(clubIds, rng);
        const matchRows: Prisma.MatchCreateManyInput[] = matchups.map((match) => scheduledMatchData(
          md.id,
          match.home,
          match.away,
          rng,
          {
            isKnockout: true,
            round: 'round_of_16',
            leg: 1,
          },
        ));
        if (bye != null) {
          matchRows.push(byeWalkoverMatchData(md.id, bye, 'round_of_16'));
        }
        if (matchRows.length > 0) {
          await prisma.match.createMany({ data: matchRows });
        }
        console.log(`    ✅ ${cupComp.name} generada con ${matchups.length} partidos${bye != null ? ' + 1 bye' : ''}.`);
      }
    }
  }

  // 3. Competiciones Europeas (E2 - Plazas por coeficientes)
  const slots = await coefficientService.getEuropeanSlots(prevSeason.id);
  
  // P0 #4: type 'league_phase' (NO 'european') — es el único type que advanceWeek
  // simula los miércoles; con 'european' las europeas morían desde la T2.
  // (La migración 20260610090000 convierte los 'european' legacy existentes.)
  const euroDefs = [
    { name: 'Champions League', shortName: 'UCL', type: 'league_phase', clubIds: slots.ucl },
    { name: 'Europa League', shortName: 'UEL', type: 'league_phase', clubIds: slots.uel },
    { name: 'Conference League', shortName: 'UECL', type: 'league_phase', clubIds: slots.uecl }
  ];

  for (const def of euroDefs) {
    if (def.clubIds.length === 0) continue; // Si no se han calculado plazas, omitir
    
    let euroComp = await prisma.competition.findFirst({
      where: { seasonId: nextSeason.id, name: def.name }
    });

    if (!euroComp) {
      euroComp = await prisma.competition.create({
        data: {
          seasonId: nextSeason.id,
          name: def.name,
          shortName: def.shortName,
          type: def.type,
          country: '',
          isContinental: true,
          format: 'swiss',
          processingShard: 'world:1',
        }
      });

      await createStandingsBulk(euroComp.id, def.clubIds);

      const matchesPerTeam = def.shortName === 'UECL' ? 6 : 8;
      const fixtures = generateSwissFixtures(def.clubIds, matchesPerTeam, rng);

      if (fixtures.length > 0) {
        const matchdayCache = await createMatchdaysBulk(
          euroComp.id,
          fixtures.map((fix) => fix.matchday),
          { type: 'league_phase' },
        );
        await prisma.match.createMany({
          data: fixtures.map((fix) => scheduledMatchData(
            matchdayCache.get(fix.matchday)!,
            fix.home,
            fix.away,
            rng,
          )),
        });
      }
      console.log(`    ✅ ${def.name} generada con ${fixtures.length} partidos en liga.`);
    }
  }

  // 4. Supercopas Domésticas (Liga + Copa del año pasado)
  const prevLeaguesForSupercups = leagues.filter(l => l.tier === 1);
  for (const league of prevLeaguesForSupercups) {
    const winnerLeagueId = league.standings[0]?.clubId;
    if (!winnerLeagueId) continue;
    
    const prevCup = prevCups.find(c => c.country === league.country);
    let winnerCupId = null;
    if (prevCup) {
      // Find final match
      const finalMd = await prisma.matchday.findFirst({ where: { competitionId: prevCup.id, type: 'final' }});
      if (finalMd) {
        const finalMatch = await prisma.match.findFirst({ where: { matchdayId: finalMd.id, status: 'played' }});
        if (finalMatch) {
          winnerCupId = finalMatch.winner === 'home' ? finalMatch.homeClubId : finalMatch.awayClubId;
        }
      }
    }
    
    const runnerUpLeagueId = league.standings[1]?.clubId;
    let awaySupercup = winnerCupId;
    if (!awaySupercup || awaySupercup === winnerLeagueId) {
      awaySupercup = runnerUpLeagueId;
    }

    if (winnerLeagueId && awaySupercup) {
      const scName = `Supercopa de ${league.country}`;
      let scComp = await prisma.competition.findFirst({ where: { seasonId: nextSeason.id, name: scName }});
      if (!scComp) {
        scComp = await prisma.competition.create({
          data: {
            seasonId: nextSeason.id,
            name: scName,
            shortName: `SC_${league.country?.slice(0,3).toUpperCase()}`,
            type: 'supercup',
            country: league.country,
            format: 'single_match',
            processingShard: league.processingShard
              ?? `${league.country || 'world'}:${Math.max(1, league.tier)}`.toLowerCase().slice(0, 80),
          }
        });

        const md = await prisma.matchday.create({
          data: { competitionId: scComp.id, number: 1, type: 'final', isKnockout: true, status: 'pending' }
        });

        await prisma.match.create({
          data: {
            matchdayId: md.id,
            homeClubId: winnerLeagueId,
            awayClubId: awaySupercup,
            status: 'scheduled',
            weatherCondition: 'normal',
            temperature: 20
          }
        });
        console.log(`    ✅ ${scName} generada.`);
      }
    }
  }

  // Finalizar cambio de temporada en GameState + flags de Season coherentes
  await prisma.season.updateMany({ where: { id: prevSeason.id }, data: { isActive: false } });
  await prisma.season.update({ where: { id: nextSeason.id }, data: { isActive: true } });
  await prisma.club.updateMany({
    data: {
      trainingClosedUntilTurn: null,
      trainingClosedUses: 0,
      homeStimulatedUntilTurn: null,
      homeStimulatedUses: 0,
    },
  });
  const gameState = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (gameState) {
    await prisma.gameState.update({
      where: { id: gameState.id },
      // Q2 (BLOQUE Q): seasonWeek se RESETEA con cada temporada. `week` se deja
      // acumulada a propósito (FinanceSnapshot y otros uniques dependen de ella);
      // era la causa de la "jornada 145" en la UI tras 13 temporadas.
      data: { seasonId: nextSeason.id, phase: 'preseason', seasonWeek: 1 } as Record<string, unknown>
    });
    
    // Inform the managers via news!
    await prisma.pressItem.create({
      data: {
        headline: `Arranca la nueva temporada ${newSeasonName}`,
        content: `La pretemporada de ${newSeasonName} acaba de comenzar. ¡Preparen las carteras para el mercado de fichajes!`
      }
    });
  }

  return nextSeason;
}
