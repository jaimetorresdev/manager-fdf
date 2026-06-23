// ─── Z3 · 7.3 Turno blindado: disparo externo → cola Redis → worker ──────────
// Pipeline de producción del turno (DESPLIEGUE.md §1): QStash (u otro cron
// externo) golpea POST /api/tick/enqueue con secreto compartido; el job entra
// en una cola Redis; un worker lo procesa con reintentos idempotentes y, si
// agota los intentos, lo aparca en una DLQ para inspección manual.
//
// DESACTIVADO POR DEFECTO: solo se activa con TICK_QUEUE=on. Con el flag off
// este módulo no abre conexiones ni toca nada — el cron interno (tick.cron.ts)
// sigue funcionando exactamente igual que hoy. Cambio 100% ADITIVO.
//
// La idempotencia REAL del turno la garantiza el propio tick (prevInGameDate +
// claims atómicos + uniques de la auditoría multi-capa): re-ejecutar un tick
// tras un crash NO duplica finanzas ni partidos. Esta capa añade:
//   1. dedupe por slot/día (un mismo disparo no encola dos veces),
//   2. lock de worker (dos réplicas no procesan a la vez),
//   3. reintentos con backoff y DLQ (nada se pierde en silencio).
//
// Claves Redis (prefijo tick:):
//   tick:<type>:queue       LIST  cola por tipo (world-tick/simulation/economy/maintenance)
//   tick:<type>:processing  LIST  job en curso por tipo (cola fiable; se limpia al acabar)
//   tick:dlq         LIST  jobs agotados, con historial de errores
//   tick:dedupe:*    STR   NX+EX por slot/día — evita doble encolado
//   tick:lock        STR   NX+EX — exclusión mutua entre workers
//   tick:last        HASH  última ejecución (ok/fallo, duración, fecha)

import Redis from 'ioredis';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { z } from 'zod';
import { childLogger } from '../../lib/logger';
import { gameService } from './game.service';
import { masterService } from '../master/master.service';

// ── Config por entorno (todas opcionales; ver .env.production.example) ───────
const QUEUE_ENABLED = (process.env.TICK_QUEUE ?? 'off').toLowerCase() === 'on';
const REDIS_URL = process.env.REDIS_URL ?? '';
const WEBHOOK_SECRET = process.env.TICK_WEBHOOK_SECRET ?? '';
const MAX_ATTEMPTS = Math.max(1, Number(process.env.TICK_QUEUE_MAX_ATTEMPTS ?? 3));
const RETRY_BASE_MS = Math.max(1000, Number(process.env.TICK_QUEUE_RETRY_MS ?? 30_000));
const LOCK_TTL_S = Math.max(60, Number(process.env.TICK_QUEUE_LOCK_TTL_S ?? 30 * 60));
const DEDUPE_TTL_S = 6 * 60 * 60; // 6h: cubre el slot sin bloquear el siguiente

const JOB_TYPES = ['world-tick', 'simulation', 'economy', 'maintenance'] as const;
type TickJobType = typeof JOB_TYPES[number];
const DEFAULT_JOB_TYPE: TickJobType = 'world-tick';

const KEY = {
  // Legacy keys kept for safe draining if a deployment had jobs queued pre-X1.
  legacyQueue: 'tick:queue',
  legacyProcessing: 'tick:processing',
  queue: (type: TickJobType) => `tick:${type}:queue`,
  processing: (type: TickJobType) => `tick:${type}:processing`,
  dlq: 'tick:dlq',
  lock: 'tick:lock',
  last: 'tick:last',
  dedupe: (slot: string, day: string) => `tick:dedupe:${day}:${slot}`,
} as const;

export interface TickJob {
  id: string;                 // `${day}:${slot}` — estable para auditoría
  type: TickJobType;          // X1: cola separada por tipo de trabajo
  slot: string;               // 'T1' | 'T2' | 'manual' | lo que mande el disparador
  source: 'webhook' | 'cron' | 'manual';
  requestedAt: string;        // ISO
  attempts: number;
  errors: string[];           // historial de fallos (para la DLQ)
}

let redis: Redis | null = null;
let workerRunning = false;
// OJO: el logger NO se crea en el import (tick.cron importa este módulo antes
// de bindRootLogger y childLogger lanzaría). Se resuelve PEREZOSO en el primer
// uso, que siempre ocurre tras el bootstrap.
let log: FastifyBaseLogger | null = null;

function getLog(): FastifyBaseLogger {
  if (!log) {
    try {
      log = childLogger({ module: 'tick-queue' });
    } catch {
      // Fallback in case it's called before bindRootLogger (should not happen)
      return console as any;
    }
  }
  return log;
}

export function isTickQueueEnabled(): boolean {
  return QUEUE_ENABLED;
}

function getRedis(): Redis {
  if (!redis) {
    if (!REDIS_URL) throw new Error('TICK_QUEUE=on requiere REDIS_URL configurada');
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,     // el worker bloquea con BLMOVE; sin límite de cola
      enableReadyCheck: true,
      lazyConnect: false,
    });
    redis.on('error', (err) => getLog().error({ err }, 'Redis (tick-queue) error'));
  }
  return redis;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeJobType(raw: unknown): TickJobType {
  return JOB_TYPES.includes(raw as TickJobType) ? raw as TickJobType : DEFAULT_JOB_TYPE;
}

/** Encola un turno (productor). Devuelve el job o null si era duplicado del slot. */
export async function enqueueTick(slot: string, source: TickJob['source'], type: TickJobType = DEFAULT_JOB_TYPE): Promise<TickJob | null> {
  const r = getRedis();
  const day = todayUtc();
  // Dedupe: el mismo slot del mismo día solo entra una vez (SET NX).
  const fresh = await r.set(KEY.dedupe(slot, day), '1', 'EX', DEDUPE_TTL_S, 'NX');
  if (fresh === null) {
    getLog().warn({ slot, day }, 'Tick duplicado ignorado (dedupe por slot/día)');
    return null;
  }
  const job: TickJob = {
    id: `${day}:${slot}`,
    type,
    slot,
    source,
    requestedAt: new Date().toISOString(),
    attempts: 0,
    errors: [],
  };
  await r.lpush(KEY.queue(type), JSON.stringify(job));
  getLog().info({ jobId: job.id, source, type }, 'Turno encolado');
  return job;
}

/** Ejecuta el tick respetando la pausa del admin (mismo guard que el cron). */
async function executeTick(job: TickJob): Promise<void> {
  const settings = await masterService.getSettings();
  if (settings.featureFlags.tick === false) {
    getLog().info({ jobId: job.id }, 'Tick saltado: procesado de turnos en pausa por el admin');
    return; // se considera éxito: el admin pausó conscientemente
  }
  await gameService.processTick();
}

/** Procesa UN job con lock, reintentos y DLQ. El job ya está en tick:processing. */
async function processJob(raw: string, queueType: TickJobType): Promise<void> {
  const r = getRedis();
  let job: TickJob;
  try {
    job = JSON.parse(raw) as TickJob;
    job.type = normalizeJobType((job as { type?: unknown }).type ?? queueType);
  } catch {
    getLog().error({ raw }, 'Job ilegible; movido a la DLQ tal cual');
    await r.lpush(KEY.dlq, JSON.stringify({ raw, error: 'JSON inválido', at: new Date().toISOString() }));
    await r.lrem(KEY.processing(queueType), 1, raw);
    return;
  }

  // Lock entre workers: si otra réplica está procesando, re-encolamos y esperamos.
  const locked = await r.set(KEY.lock, job.id, 'EX', LOCK_TTL_S, 'NX');
  if (locked === null) {
    getLog().warn({ jobId: job.id }, 'Otro worker tiene el lock; el job vuelve a la cola');
    await r.lrem(KEY.processing(queueType), 1, raw);
    await r.rpush(KEY.queue(job.type), raw); // al final: no adelanta a nadie
    await new Promise(res => setTimeout(res, 5000));
    return;
  }

  const started = Date.now();
  try {
    getLog().info({ jobId: job.id, attempt: job.attempts + 1, max: MAX_ATTEMPTS }, 'Procesando turno (cola blindada)');
    await executeTick(job);
    await r.hset(KEY.last, {
      jobId: job.id, status: 'ok', durationMs: String(Date.now() - started),
      finishedAt: new Date().toISOString(),
    });
    getLog().info({ jobId: job.id, durationMs: Date.now() - started }, 'Turno completado (cola blindada)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    job.attempts += 1;
    job.errors.push(`[intento ${job.attempts}] ${msg}`);
    await r.hset(KEY.last, {
      jobId: job.id, status: 'error', durationMs: String(Date.now() - started),
      finishedAt: new Date().toISOString(), error: msg.slice(0, 500),
    });
    if (job.attempts < MAX_ATTEMPTS) {
      // Reintento con backoff lineal. Re-ejecutar es SEGURO: el tick es
      // idempotente (prevInGameDate + claims + uniques) y reanuda lo pendiente.
      const delay = RETRY_BASE_MS * job.attempts;
      getLog().warn({ jobId: job.id, attempt: job.attempts, delayMs: delay, err: msg }, 'Tick falló; reintento programado');
      setTimeout(() => {
        getRedis().lpush(KEY.queue(job.type), JSON.stringify(job)).catch((e) =>
          getLog().error({ err: e }, 'No se pudo re-encolar el job de tick'));
      }, delay);
    } else {
      getLog().error({ jobId: job.id, errors: job.errors }, 'Tick agotó los reintentos; movido a la DLQ');
      await r.lpush(KEY.dlq, JSON.stringify({ ...job, deadAt: new Date().toISOString() }));
    }
  } finally {
    await r.lrem(KEY.processing(queueType), 1, raw);
    // Libera el lock solo si sigue siendo nuestro (evita soltar el de otro worker).
    const owner = await r.get(KEY.lock);
    if (owner === job.id) await r.del(KEY.lock);
  }
}

/** Bucle del worker: cola fiable LIST→LIST (BLMOVE) + recuperación de huérfanos. */
async function workerLoop(): Promise<void> {
  const r = getRedis();
  // Recuperación al arrancar: jobs que quedaron en processing por un crash
  // vuelven a la cola (re-ejecutar es seguro por la idempotencia del tick).
  let orphanCount = 0;
  for (const type of JOB_TYPES) {
    const orphans = await r.lrange(KEY.processing(type), 0, -1);
    orphanCount += orphans.length;
    for (const orphan of orphans) {
      await r.lrem(KEY.processing(type), 1, orphan);
      await r.rpush(KEY.queue(type), orphan);
    }
  }
  const legacyOrphans = await r.lrange(KEY.legacyProcessing, 0, -1);
  orphanCount += legacyOrphans.length;
  for (const orphan of legacyOrphans) {
    await r.lrem(KEY.legacyProcessing, 1, orphan);
    await r.rpush(KEY.queue(DEFAULT_JOB_TYPE), orphan);
  }
  if (orphanCount > 0) getLog().warn({ count: orphanCount }, 'Jobs huérfanos re-encolados tras reinicio');

  while (workerRunning) {
    try {
      let raw: string | null = null;
      let type: TickJobType = DEFAULT_JOB_TYPE;
      for (const candidate of JOB_TYPES) {
        raw = await r.blmove(KEY.queue(candidate), KEY.processing(candidate), 'RIGHT', 'LEFT', 1);
        if (raw) {
          type = candidate;
          break;
        }
      }
      if (!raw) {
        raw = await r.blmove(KEY.legacyQueue, KEY.processing(DEFAULT_JOB_TYPE), 'RIGHT', 'LEFT', 1);
      }
      if (raw) await processJob(raw, type);
    } catch (err) {
      getLog().error({ err }, 'Worker de tick: error de bucle; reintento en 5s');
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

/** Rutas del pipeline (registradas SIEMPRE; responden 409 si el flag está off). */
export async function tickQueueRoutes(app: FastifyInstance) {
  const enqueueSchema = z.object({
    slot: z.string().trim().min(1).max(20).optional(),
    type: z.enum(JOB_TYPES).optional(),
  }).optional();

  // Disparo externo (QStash u otro cron). Autenticación: secreto compartido en
  // header x-tick-key (QStash lo reenvía con Upstash-Forward-x-tick-key).
  app.post('/enqueue', async (request, reply) => {
    if (!QUEUE_ENABLED) {
      return reply.code(409).send({ error: 'Cola de turnos desactivada (TICK_QUEUE=off); el turno lo lleva el cron interno.' });
    }
    if (!WEBHOOK_SECRET || request.headers['x-tick-key'] !== WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Secreto del webhook de turno no válido' });
    }
    const parsed = enqueueSchema.safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
    const hour = new Date().getUTCHours();
    const slot = parsed.data?.slot ?? (hour < 17 ? 'T1' : 'T2');
    const type = parsed.data?.type ?? DEFAULT_JOB_TYPE;
    try {
      const job = await enqueueTick(slot, 'webhook', type);
      return reply.send(job
        ? { ok: true, enqueued: true, jobId: job.id }
        : { ok: true, enqueued: false, reason: 'Slot ya encolado hoy (dedupe)' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al encolar el turno';
      return reply.code(500).send({ error: msg });
    }
  });

  // Estado de la cola (mismo secreto): profundidad, en curso, DLQ y última ejecución.
  app.get('/status', async (request, reply) => {
    if (!QUEUE_ENABLED) {
      return reply.code(409).send({ error: 'Cola de turnos desactivada (TICK_QUEUE=off)' });
    }
    if (!WEBHOOK_SECRET || request.headers['x-tick-key'] !== WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Secreto del webhook de turno no válido' });
    }
    try {
      const r = getRedis();
      const byTypeEntries = await Promise.all(JOB_TYPES.map(async (type) => {
        const [queued, processing] = await Promise.all([
          r.llen(KEY.queue(type)),
          r.llen(KEY.processing(type)),
        ]);
        return [type, { queued, processing }] as const;
      }));
      const byType = Object.fromEntries(byTypeEntries) as Record<TickJobType, { queued: number; processing: number }>;
      const [legacyQueued, legacyProcessing, dlq, last] = await Promise.all([
        r.llen(KEY.legacyQueue), r.llen(KEY.legacyProcessing), r.llen(KEY.dlq), r.hgetall(KEY.last),
      ]);
      const queued = Object.values(byType).reduce((sum, item) => sum + item.queued, legacyQueued);
      const processing = Object.values(byType).reduce((sum, item) => sum + item.processing, legacyProcessing);
      return reply.send({ queued, processing, dlq, last, byType, legacy: { queued: legacyQueued, processing: legacyProcessing } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al leer la cola';
      return reply.code(500).send({ error: msg });
    }
  });
}

/** Arranca el worker si TICK_QUEUE=on. Con el flag off no hace NADA. */
export function initTickQueue(logger?: FastifyBaseLogger): void {
  if (!QUEUE_ENABLED) return;
  log = logger ? logger.child({ module: 'tick-queue' }) : childLogger({ module: 'tick-queue' });
  if (!REDIS_URL) {
    getLog().error('TICK_QUEUE=on pero falta REDIS_URL: el worker NO arranca (el cron interno sigue activo).');
    return;
  }
  if (!WEBHOOK_SECRET) {
    getLog().warn('TICK_QUEUE=on sin TICK_WEBHOOK_SECRET: /api/tick/enqueue rechazará todo disparo externo.');
  }
  if (workerRunning) return;
  workerRunning = true;
  void workerLoop();
  getLog().info({ maxAttempts: MAX_ATTEMPTS, retryBaseMs: RETRY_BASE_MS }, 'Cola blindada de turnos ACTIVA (TICK_QUEUE=on)');
}

/** Parada limpia (tests / shutdown). */
export async function stopTickQueue(): Promise<void> {
  workerRunning = false;
  if (redis) {
    await redis.quit().catch(() => undefined);
    redis = null;
  }
}
