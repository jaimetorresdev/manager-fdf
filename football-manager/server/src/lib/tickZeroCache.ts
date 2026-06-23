import crypto from 'crypto';
import Redis from 'ioredis';
import prisma from '../db/prisma';

const CACHE_ENABLED = (process.env.TICK_ZERO_CACHE ?? 'on').toLowerCase() !== 'off';
const REDIS_URL = process.env.REDIS_URL ?? '';
const TTL_SECONDS = Math.max(60, Number(process.env.TICK_ZERO_CACHE_TTL_S ?? 6 * 60 * 60));
const PREFIX = process.env.TICK_ZERO_CACHE_PREFIX ?? 'tickzero:v1';

let redis: Redis | null = null;
let redisFailed = false;

function getRedis(): Redis | null {
  if (!CACHE_ENABLED || !REDIS_URL || redisFailed) return null;
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    });
    redis.on('error', () => {
      redisFailed = true;
    });
  }
  return redis;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

async function currentTickVersion(): Promise<string | null> {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true, turn: true },
  });
  if (!state) return null;
  return `s${state.seasonId}:t${state.turn}`;
}

async function cacheKey(namespace: string, params: unknown): Promise<string | null> {
  const version = await currentTickVersion();
  if (!version) return null;
  const digest = crypto.createHash('sha1').update(stableJson(params ?? {})).digest('hex').slice(0, 16);
  return `${PREFIX}:${version}:${namespace}:${digest}`;
}

export async function tickZeroCached<T>(
  namespace: string,
  params: unknown,
  producer: () => Promise<T>,
): Promise<T> {
  const r = getRedis();
  if (!r) return producer();

  const key = await cacheKey(namespace, params);
  if (!key) return producer();

  try {
    const cached = await r.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch {
    return producer();
  }

  const data = await producer();
  try {
    await r.set(key, JSON.stringify(data), 'EX', TTL_SECONDS);
  } catch {
    // Cache failures must never affect gameplay/API reads.
  }
  return data;
}

export async function warmTickZeroCache(items: Array<{
  namespace: string;
  params: unknown;
  producer: () => Promise<unknown>;
}>): Promise<{ warmed: number; errors: number; enabled: boolean }> {
  if (!getRedis()) return { warmed: 0, errors: 0, enabled: false };
  const results = await Promise.allSettled(
    items.map((item) => tickZeroCached(item.namespace, item.params, item.producer)),
  );
  return {
    warmed: results.filter((result) => result.status === 'fulfilled').length,
    errors: results.filter((result) => result.status === 'rejected').length,
    enabled: true,
  };
}

export async function closeTickZeroCache(): Promise<void> {
  if (!redis) return;
  await redis.quit().catch(() => undefined);
  redis = null;
  redisFailed = false;
}
