import prisma from '../../db/prisma';
import { gameService } from '../game/game.service';
import { nextTickClaim } from '../game/tick.logic';
import { sortStandings, withHeadToHeadPoints } from '../game/standings';

type CountRow = { count: bigint | number };
const emit = console.log.bind(console);

if (process.env.QA_QUIET === 'true') {
  console.log = () => undefined;
}

function countOf(rows: CountRow[]): number {
  return Number(rows[0]?.count ?? 0);
}

async function simulateCrashBetweenTickSteps() {
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) throw new Error('No active game state');
  const claim = nextTickClaim(state);
  const existing = await prisma.tickRun.findUnique({ where: { turn: claim.turn } });
  if (existing) return { skipped: true, turn: claim.turn };

  const run = await prisma.tickRun.create({
    data: {
      turn: claim.turn,
      seasonId: state.seasonId,
      inGameDate: claim.inGameDate,
      status: 'running',
    },
  });
  await prisma.gameState.update({
    where: { id: state.id },
    data: {
      turn: claim.turn,
      inGameDate: claim.inGameDate,
      prevInGameDate: claim.prevInGameDate,
      isLocked: false,
      lockUpdatedAt: null,
    },
  });

  await gameService.processTick();
  const [resumedState, resumedRun] = await Promise.all([
    prisma.gameState.findUniqueOrThrow({ where: { id: state.id } }),
    prisma.tickRun.findUniqueOrThrow({ where: { id: run.id } }),
  ]);
  if (resumedState.turn !== claim.turn || resumedRun.status !== 'completed') {
    throw new Error(`Crash-resume inválido: turn=${resumedState.turn}, run=${resumedRun.status}`);
  }
  return { skipped: false, turn: claim.turn, runId: run.id };
}

async function unstableActiveTables(): Promise<number> {
  const competitions = await prisma.competition.findMany({
    where: { season: { isActive: true }, type: { in: ['league', 'league_phase'] } },
    include: {
      standings: true,
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
  let unstable = 0;
  for (const competition of competitions) {
    const matches = competition.matchdays.flatMap((matchday) => matchday.matches);
    const once = sortStandings(withHeadToHeadPoints(competition.standings, matches)).map((row) => row.clubId);
    const twice = sortStandings(withHeadToHeadPoints(competition.standings, matches)).map((row) => row.clubId);
    if (once.join(',') !== twice.join(',')) unstable++;
  }
  return unstable;
}

async function auditInvariants() {
  const [duplicateStats, outOfRange, nonQuantized, premature] = await Promise.all([
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count FROM (
        SELECT "matchId", "playerId"
        FROM "PlayerMatchStat"
        GROUP BY "matchId", "playerId"
        HAVING COUNT(*) > 1
      ) duplicated
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count
      FROM "Player"
      WHERE passing NOT BETWEEN 0 AND 100
         OR tackling NOT BETWEEN 0 AND 100
         OR shooting NOT BETWEEN 0 AND 100
         OR organization NOT BETWEEN 0 AND 100
         OR unmarking NOT BETWEEN 0 AND 100
         OR finishing NOT BETWEEN 0 AND 100
         OR dribbling NOT BETWEEN 0 AND 100
         OR fouls NOT BETWEEN 0 AND 100
         OR goalkeeping NOT BETWEEN 0 AND 100
         OR reflexes NOT BETWEEN 0 AND 100
         OR fitness NOT BETWEEN 0 AND 100
         OR morale NOT BETWEEN 0 AND 100
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count FROM (
        SELECT budget AS amount FROM "Club"
        UNION ALL SELECT cash FROM "Club"
        UNION ALL SELECT "fixedAssets" FROM "Club"
        UNION ALL SELECT wealth FROM "Manager"
        UNION ALL SELECT budget FROM "FinanceSnapshot"
        UNION ALL SELECT income FROM "FinanceSnapshot"
        UNION ALL SELECT expenses FROM "FinanceSnapshot"
        UNION ALL SELECT "incomeA" FROM "Friendly"
        UNION ALL SELECT "incomeB" FROM "Friendly"
      ) money
      WHERE amount::numeric <> ROUND(amount::numeric, 2)
    `,
    prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS count
      FROM "Season" future
      WHERE future.year > (SELECT year FROM "Season" WHERE "isActive" = true LIMIT 1)
        AND EXISTS (SELECT 1 FROM "Competition" c WHERE c."seasonId" = future.id)
    `,
  ]);
  return {
    duplicateStatGroups: countOf(duplicateStats),
    attributesOutOfRange: countOf(outOfRange),
    nonQuantizedBalances: countOf(nonQuantized),
    prematureSeasons: countOf(premature),
    unstableTables: await unstableActiveTables(),
  };
}

async function main() {
  const targetSeasons = Math.max(1, Number(process.env.QA_TARGET_SEASONS ?? 10));
  const maxTicks = Math.max(100, Number(process.env.QA_MAX_TICKS ?? 2_000));
  let state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) throw new Error('No active game state');

  const crashResume = await simulateCrashBetweenTickSteps();
  state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) throw new Error('No active game state after crash-resume');

  let seasonId = state.seasonId;
  let seasons = 0;
  let ticks = 0;
  let stalls = 0;
  while (seasons < targetSeasons) {
    const before = `${state.turn}:${state.inGameDate.toISOString()}:${state.seasonId}`;
    await gameService.processTick();
    const next = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!next) throw new Error('Game state disappeared');
    ticks++;
    const after = `${next.turn}:${next.inGameDate.toISOString()}:${next.seasonId}`;
    stalls = before === after ? stalls + 1 : 0;
    if (stalls >= 5) throw new Error(`Runner estancado en ${after}`);
    if (next.seasonId !== seasonId) {
      seasonId = next.seasonId;
      seasons++;
      const audit = await auditInvariants();
      emit(JSON.stringify({ checkpoint: seasons, ticks, date: next.inGameDate, audit }));
      if (Object.values(audit).some((value) => value !== 0)) {
        throw new Error(`Invariante roto en temporada ${seasons}: ${JSON.stringify(audit)}`);
      }
    }
    if (ticks >= maxTicks) throw new Error(`Máximo de ${maxTicks} ticks sin completar ${targetSeasons} temporadas`);
    state = next;
  }

  const audit = await auditInvariants();
  emit(JSON.stringify({
    ok: Object.values(audit).every((value) => value === 0),
    targetSeasons,
    seasons,
    ticks,
    crashResume,
    finalTurn: state.turn,
    finalDate: state.inGameDate,
    finalSeasonId: state.seasonId,
    audit,
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
