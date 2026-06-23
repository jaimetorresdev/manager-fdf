import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// Singleton Prisma client — prevents connection pool exhaustion in dev hot-reload
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

export default prisma;
