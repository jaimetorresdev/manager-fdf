import prisma from './db/prisma';
import { gameService } from './modules/game/game.service';

type WorldSnapshot = {
  competitions: number;
  leagueCompetitions: number;
  clubs: number;
  players: number;
  managersWithClub: number;
  matchdays: number;
  matches: number;
  scheduledActiveSeason: number;
  playedActiveSeason: number;
  state: {
    seasonId: number;
    turn: number;
    week: number;
    inGameDate: string;
  } | null;
};

type TickMeasurement = {
  index: number;
  turnBefore: number;
  turnAfter: number;
  dateBefore: string;
  dateAfter: string;
  durationMs: number;
  matchesPlayed: number;
  steps: string[];
};

const TARGETS = [
  { users: 300, budgetMs: 2 * 60_000 },
  { users: 1_000, budgetMs: 5 * 60_000 },
  { users: 10_000, budgetMs: 15 * 60_000 },
];

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : fallback;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

function fmtMs(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(2)}s`;
}

async function snapshot(): Promise<WorldSnapshot> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true, turn: true, week: true, inGameDate: true },
  });
  const activeSeasonFilter = state ? { matchday: { competition: { seasonId: state.seasonId } } } : {};
  const [
    competitions,
    leagueCompetitions,
    clubs,
    players,
    managersWithClub,
    matchdays,
    matches,
    scheduledActiveSeason,
    playedActiveSeason,
  ] = await Promise.all([
    prisma.competition.count(),
    prisma.competition.count({ where: { type: 'league' } }),
    prisma.club.count(),
    prisma.player.count(),
    prisma.manager.count({ where: { clubId: { not: null } } }),
    prisma.matchday.count(),
    prisma.match.count(),
    prisma.match.count({ where: { status: 'scheduled', ...activeSeasonFilter } }),
    prisma.match.count({ where: { status: 'played', ...activeSeasonFilter } }),
  ]);

  return {
    competitions,
    leagueCompetitions,
    clubs,
    players,
    managersWithClub,
    matchdays,
    matches,
    scheduledActiveSeason,
    playedActiveSeason,
    state: state
      ? {
        seasonId: state.seasonId,
        turn: state.turn,
        week: state.week,
        inGameDate: state.inGameDate.toISOString(),
      }
      : null,
  };
}

async function ensureSyntheticManagers(targetManagers: number): Promise<number> {
  if (targetManagers <= 0) return prisma.manager.count({ where: { clubId: { not: null } } });

  const [clubs, assigned] = await Promise.all([
    prisma.club.count(),
    prisma.manager.count({ where: { clubId: { not: null } } }),
  ]);
  const target = Math.min(targetManagers, clubs);
  if (assigned >= target) return assigned;

  const needed = target - assigned;
  const freeClubs = await prisma.club.findMany({
    where: { manager: null },
    select: { id: true, shortName: true },
    orderBy: [{ reputation: 'desc' }, { id: 'asc' }],
    take: needed,
  });

  const stamp = Date.now().toString(36);
  let created = 0;
  for (const club of freeClubs) {
    const user = await prisma.user.create({
      data: {
        username: `x1_${stamp}_${club.id}`,
        email: `x1_${stamp}_${club.id}@benchmark.local`,
        passwordHash: 'benchmark-only',
        role: 'manager',
        lastLoginAt: new Date(),
      },
    });
    await prisma.manager.create({
      data: {
        userId: user.id,
        clubId: club.id,
        name: `Bench ${club.shortName || club.id}`,
        mentality: 'Normal',
        affinityGroup: 'Benchmark',
        tutorialCompleted: true,
      },
    });
    created += 1;
  }

  return assigned + created;
}

async function measureTick(index: number): Promise<TickMeasurement> {
  const beforeState = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true, turn: true, inGameDate: true, isLocked: true },
  });
  if (!beforeState) throw new Error('No active GameState');
  if (beforeState.isLocked) throw new Error('GameState is locked; aborting benchmark');

  const playedBefore = await prisma.match.count({
    where: { status: 'played', matchday: { competition: { seasonId: beforeState.seasonId } } },
  });

  const started = process.hrtime.bigint();
  const result = await gameService.processTick();
  const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
  if ((result as { skipped?: boolean } | undefined)?.skipped) {
    throw new Error('processTick skipped because the world was locked');
  }

  const afterState = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true, turn: true, inGameDate: true },
  });
  if (!afterState) throw new Error('No active GameState after tick');
  const playedAfter = await prisma.match.count({
    where: { status: 'played', matchday: { competition: { seasonId: afterState.seasonId } } },
  });

  return {
    index,
    turnBefore: beforeState.turn,
    turnAfter: afterState.turn,
    dateBefore: beforeState.inGameDate.toISOString(),
    dateAfter: afterState.inGameDate.toISOString(),
    durationMs,
    matchesPlayed: Math.max(0, playedAfter - playedBefore),
    steps: Array.isArray((result as { steps?: unknown } | undefined)?.steps)
      ? ((result as { steps: string[] }).steps)
      : [],
  };
}

async function main() {
  const ticks = Math.max(1, envInt('X1_BENCH_TICKS', 6));
  const syntheticManagers = envInt('X1_BENCH_SYNTHETIC_MANAGERS', 708);

  const before = await snapshot();
  if (!before.state) throw new Error('No active GameState');
  if (before.leagueCompetitions < 50 || before.clubs < 708) {
    throw new Error(
      `X1 benchmark requires the 50-league seed. Found ${before.leagueCompetitions} leagues / ${before.clubs} clubs.`,
    );
  }

  const managersWithClub = await ensureSyntheticManagers(syntheticManagers);
  const prepared = await snapshot();

  const measurements: TickMeasurement[] = [];
  for (let i = 1; i <= ticks; i += 1) {
    const measurement = await measureTick(i);
    measurements.push(measurement);
    console.log(
      `[X1] tick ${i}/${ticks} ${fmtMs(measurement.durationMs)} matches=${measurement.matchesPlayed} `
      + `${measurement.dateBefore.slice(0, 10)} -> ${measurement.dateAfter.slice(0, 10)}`,
    );
  }

  const durations = measurements.map((m) => m.durationMs);
  const matches = measurements.reduce((sum, m) => sum + m.matchesPlayed, 0);
  const totalMs = durations.reduce((sum, ms) => sum + ms, 0);
  const maxMs = Math.max(...durations);
  const summary = {
    benchmark: 'X1 end-to-end tick',
    generatedAt: new Date().toISOString(),
    config: {
      ticks,
      requestedSyntheticManagers: syntheticManagers,
      managersWithClub,
    },
    before,
    prepared,
    after: await snapshot(),
    metrics: {
      totalMs: Math.round(totalMs),
      avgMs: Math.round(totalMs / durations.length),
      p50Ms: Math.round(percentile(durations, 50)),
      p95Ms: Math.round(percentile(durations, 95)),
      maxMs: Math.round(maxMs),
      matchesPlayed: matches,
      msPerPlayedMatch: matches > 0 ? Number((totalMs / matches).toFixed(2)) : null,
    },
    targets: TARGETS.map((target) => {
      const heavierThanTarget = managersWithClub > target.users;
      const cappedByClubs = target.users > prepared.clubs;
      const pass = maxMs <= target.budgetMs
        ? true
        : heavierThanTarget
          ? null
          : false;
      const notes = [
        heavierThanTarget && pass === null
          ? `Measured load has ${managersWithClub} club managers; rerun with ${target.users} before failing this lower target.`
          : null,
        cappedByClubs
          ? `One club per person caps active club managers at ${prepared.clubs}; extra users do not add scheduled matches.`
          : null,
      ].filter((note): note is string => Boolean(note));
      return {
        users: target.users,
        budgetMs: target.budgetMs,
        pass,
        note: notes.length > 0 ? notes.join(' ') : undefined,
      };
    }),
    ticks: measurements.map((m) => ({
      ...m,
      durationMs: Math.round(m.durationMs),
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
