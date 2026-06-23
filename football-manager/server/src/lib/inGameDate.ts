import prisma from '../db/prisma';

/**
 * Lee la fecha in-game del GameState activo.
 * Usar SIEMPRE en lugar de Date.now()/new Date() para comparaciones de
 * contratos, lesiones, ventanas de transferencias, etc.
 */
export async function getInGameDate(): Promise<Date> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true },
  });
  return state?.inGameDate ?? new Date();
}
