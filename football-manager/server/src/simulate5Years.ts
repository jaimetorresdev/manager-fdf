import { PrismaClient } from '@prisma/client';
import { gameService } from './modules/game/game.service';

const prisma = new PrismaClient();

// AUDIT cross-request [C → A]: blindaje de la simulación larga.
// Antes: `while (currentYear < targetYear) { await processTick(); ... ticks++ }`.
// Problemas:
//   1. Si processTick() devolvía `{ skipped: true }` (estado bloqueado por otro
//      proceso), se contaba igualmente como tick y la fecha NO avanzaba → bucle
//      infinito con la fecha congelada y `ticks` creciendo sin sentido.
//   2. Cualquier estancamiento (la fecha deja de avanzar) no se detectaba y el
//      script colgaba indefinidamente.
// Ahora: no se cuentan ticks omitidos, se detecta la fecha congelada y se aborta
// con error tras un nº de estancamientos consecutivos; además hay un tope duro de
// iteraciones como red de seguridad.

/** Estancamientos consecutivos (fecha sin avanzar) tolerados antes de abortar. */
const MAX_CONSECUTIVE_STALLS = 12;

async function runSimulation() {
  console.log('--- Starting 5-year simulation ---');
  let state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) {
    console.error('No active game state found');
    process.exit(1);
  }

  const startYear = state.inGameDate.getUTCFullYear();
  const targetYear = startYear + 5;

  console.log(`Current Date: ${state.inGameDate.toISOString()}`);
  console.log(`Target Year: ${targetYear}`);

  let currentYear = startYear;
  let productiveTicks = 0;
  let skippedTicks = 0;
  let consecutiveStalls = 0;
  let lastDateMs = state.inGameDate.getTime();

  // Tope duro: ~150 turnos/año (2/sem) con holgura amplia + margen para reintentos.
  const maxIterations = (targetYear - startYear) * 400 + 500;
  let iterations = 0;

  while (currentYear < targetYear) {
    if (iterations++ >= maxIterations) {
      throw new Error(
        `Simulación abortada: superado el tope de ${maxIterations} iteraciones ` +
        `(${productiveTicks} ticks productivos, ${skippedTicks} omitidos). ` +
        `Posible estancamiento no detectado.`,
      );
    }

    const result = await gameService.processTick();

    // 1) Tick omitido (estado bloqueado por otro proceso): NO se cuenta como tick.
    if (result && typeof result === 'object' && 'skipped' in result && result.skipped) {
      skippedTicks++;
      consecutiveStalls++;
      if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) {
        throw new Error(
          `Simulación abortada: el tick se omitió ${consecutiveStalls} veces seguidas ` +
          `(estado bloqueado). Libera el lock (gameState.isLocked) o detén el proceso rival.`,
        );
      }
      continue;
    }

    state = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!state) {
      throw new Error('No active game state found after tick.');
    }

    // 2) Detección de fecha congelada: si la fecha in-game no avanzó tras un tick
    //    NO omitido, es un estancamiento real.
    const newDateMs = state.inGameDate.getTime();
    if (newDateMs <= lastDateMs) {
      consecutiveStalls++;
      if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) {
        throw new Error(
          `Simulación abortada: la fecha in-game lleva ${consecutiveStalls} ticks sin ` +
          `avanzar (congelada en ${state.inGameDate.toISOString()}).`,
        );
      }
    } else {
      consecutiveStalls = 0;
      lastDateMs = newDateMs;
    }

    currentYear = state.inGameDate.getUTCFullYear();
    productiveTicks++;
    if (productiveTicks % 30 === 0) {
      console.log(`Simulated ${productiveTicks} ticks (${skippedTicks} skipped). Current date: ${state.inGameDate.toISOString()}`);
    }
  }

  console.log(
    `Simulation complete! Productive ticks: ${productiveTicks}, skipped: ${skippedTicks}. ` +
    `Final date: ${state?.inGameDate.toISOString()}`,
  );
  process.exit(0);
}

runSimulation()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
