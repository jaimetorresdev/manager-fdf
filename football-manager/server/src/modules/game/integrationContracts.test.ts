import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

describe('contratos de integración de Fase 2', () => {
  it('season, rollover y world consumen el comparador canónico', () => {
    const season = source('src/modules/game/season.service.ts');
    const rollover = source('src/modules/game/seasonRollover.ts');
    const world = source('src/modules/world/world.service.ts');

    expect(season).toMatch(/import\s+\{[^}]*sortStandings[^}]*\}\s+from\s+'\.\/standings'/);
    expect(rollover).toMatch(/import\s+\{[^}]*sortStandings[^}]*\}\s+from\s+'\.\/standings'/);
    expect(world).toMatch(/import\s+\{[^}]*sortStandings[^}]*\}\s+from\s+'\.\.\/game\/standings'/);
    expect(season).toContain('withHeadToHeadPoints(');
    expect(rollover).toContain('withHeadToHeadPoints(');
    expect(world).toContain('withHeadToHeadPoints(');
    expect(season).not.toMatch(/standings\.sort\s*\(\s*\(a,\s*b\)/);
    expect(rollover).not.toMatch(/standings\.sort\s*\(\s*\(a,\s*b\)/);
  });

  it('el resultado oficial y la previa usan dominios de semilla distintos', () => {
    const game = source('src/modules/game/game.service.ts');
    const routes = source('src/modules/simulation/simulation.routes.ts');

    expect(game).toContain('officialMatchSeed(matchId)');
    expect(routes).toContain('previewMatchSeed(matchId)');
    expect(routes).not.toContain('matchId * 1337');
  });

  it('game.service suma sanciones mediante el agregador probado', () => {
    const game = source('src/modules/game/game.service.ts');
    expect(game).toContain('aggregateSuspensionMatches(suspensions)');
    expect(game).not.toMatch(/Math\.max\(nextByPlayer/);
  });

  it('la auto-promoción de cantera usa los límites FDF canónicos', () => {
    const game = source('src/modules/game/game.service.ts');
    const progression = game.slice(
      game.indexOf('async function applyYouthProgression'),
      game.indexOf('// ─── Retiradas', game.indexOf('async function applyYouthProgression')),
    );

    expect(game).toMatch(/import\s+\{\s*assertFDFBuyerCounts,/);
    expect(progression).toContain('assertFDFBuyerCounts(squadSize, loanedOut, pendingIncoming)');
    expect(progression).not.toMatch(/squadSize\s*[<>]=?\s*30/);
  });

  it('la penalización mensual de prestigio comparte transacción con el snapshot', () => {
    const game = source('src/modules/game/game.service.ts');
    const financeStep = game.slice(
      game.indexOf('async function stepFinances'),
      game.indexOf('async function step', game.indexOf('async function stepFinances') + 1),
    );
    const transaction = financeStep.slice(
      financeStep.indexOf('await prisma.$transaction(async (tx)'),
      financeStep.indexOf('});', financeStep.indexOf('await tx.financeSnapshot.create')),
    );

    expect(transaction).toContain('tx.financeSnapshot.findUnique');
    expect(transaction).toContain('tx.club.update');
    expect(transaction).toContain('tx.manager.update');
    expect(transaction).toContain('tx.prestige.create');
    expect(transaction).toContain('tx.financeSnapshot.create');
    expect(transaction.indexOf('tx.financeSnapshot.findUnique'))
      .toBeLessThan(transaction.indexOf('tx.manager.update'));
    expect(transaction.indexOf('tx.manager.update'))
      .toBeLessThan(transaction.indexOf('tx.financeSnapshot.create'));
  });

  it('fecha y turno se persisten en el mismo claim antes de pasos aditivos', () => {
    const game = source('src/modules/game/game.service.ts');
    const beginIndex = game.indexOf('const tickBegin = await beginOrResumeTick(state)');
    const updateIndex = game.indexOf('turn: nextTurn', beginIndex);
    const trainingIndex = game.indexOf("runTickStep(tickRunId, 'trainings'", beginIndex);

    expect(beginIndex).toBeGreaterThan(-1);
    expect(updateIndex).toBeGreaterThan(beginIndex);
    expect(trainingIndex).toBeGreaterThan(updateIndex);
  });

  it('integra los contratos persistentes publicados por A', () => {
    const game = source('src/modules/game/game.service.ts');
    const tactics = source('src/modules/tactics/tactics.service.ts');
    const training = source('src/modules/training/training.service.ts');
    const players = source('src/modules/players/players.service.ts');

    expect(game).toContain("'styleContinuity'");
    expect(game).toContain('"accumulatedFatigue"');
    expect(game).toContain('"isPermanentlyMotivated"');
    expect(game).toContain('returnWindowAllows(');
    expect(tactics).toContain('nextStyleContinuity(');
    expect(training).toContain("role: 'YOUTH'");
    expect(training).toContain('executorPlayerIds');
    expect(players).toContain('playerSpecialInspection.create');
  });

  it('Player.wage es la única fuente salarial de jugador en territorio C', () => {
    const files = [
      'src/modules/game/game.service.ts',
      'src/modules/game/marketValuation.ts',
      'src/modules/players/players.service.ts',
      'src/modules/world/world.service.ts',
    ];
    for (const file of files) {
      expect(source(file)).not.toMatch(/\b(?:player|p)\.salary\b/);
    }
  });

  it('los consumidores monetarios usan la conversión Decimal canónica de A', () => {
    const files = [
      'src/modules/game/game.service.ts',
      'src/modules/game/game.routes.ts',
      'src/modules/players/players.service.ts',
      'src/modules/world/world.service.ts',
      'src/modules/friendlies/friendlies.service.ts',
    ];
    for (const file of files) {
      const contents = source(file);
      expect(contents, file).toContain('moneyToNumber');
      expect(contents, file).toMatch(/from\s+['"][^'"]*lib\/roundMoney['"]/);
    }
  });

  it('dashboard respeta E15 y H2H canónico', () => {
    const routes = source('src/modules/game/game.routes.ts');
    const dashboard = source('src/modules/game/dashboard.routes.ts');
    expect(routes).toContain('shouldHideResult(');
    expect(routes).toContain('withHeadToHeadPoints(');
    expect(routes).not.toMatch(/orderBy:\s*\[\{\s*points:\s*'desc'/);
    expect(dashboard).toContain('seenRecentMatchIds');
    expect(dashboard).toContain('visibleRecentMatchIds');
    expect(dashboard).toContain('buildCoverMoment(visibleRecentMatchIds)');
    expect(dashboard).toContain('filterTickerForE15');
    expect(dashboard).toContain('stories: visibleTicker.slice(0, 5)');
  });

  it('todos los rankings de notas exigen el mínimo canónico de partidos', () => {
    const world = source('src/modules/world/world.service.ts');
    expect(world).toContain('MIN_RATING_MATCHES');
    expect(world).toContain('row.matches >= MIN_RATING_MATCHES');
  });

  it('world leaderboards falla cerrado sin temporada activa', () => {
    const world = source('src/modules/world/world.service.ts');
    const leaderboards = world.slice(
      world.indexOf('async getLeaderboards'),
      world.indexOf('async getCompetition', world.indexOf('async getLeaderboards')),
    );
    expect(leaderboards).toContain('if (!season)');
    expect(leaderboards).toContain('seasonId: season.id');
    expect(leaderboards).not.toContain('...(season ? { seasonId: season.id } : {})');
  });
});
