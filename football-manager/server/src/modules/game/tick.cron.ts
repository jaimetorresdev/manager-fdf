import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../../config/env';
import { childLogger } from '../../lib/logger';
import { gameService } from './game.service';
import { masterService } from '../master/master.service';
import { isTickQueueEnabled, enqueueTick } from './tick.queue';

function cronFromHour(rawHour: number): string {
  const hour = Math.max(0, Math.min(23, Math.floor(rawHour)));
  const min = Math.max(0, Math.min(59, Math.round((rawHour - hour) * 60)));
  return `${min} ${hour} * * *`;
}

export function initCron(log?: FastifyBaseLogger) {
  const tickLog = log ? log.child({ module: 'tick-cron' }) : childLogger({ module: 'tick-cron' });
  let tasks: ScheduledTask[] = [];
  let activeCrons: string[] = [];

  if (!env.tickEnabled) {
    tickLog.info('Tick cron disabled (TICK_ENABLED=false)');
    return;
  }

  const runTick = async (slot: 'T1' | 'T2') => {
    const started = Date.now();
    try {
      // Z3 · 7.3: con TICK_QUEUE=on el cron interno ENCOLA en el pipeline
      // blindado (reintentos + DLQ) en vez de ejecutar directo; el dedupe por
      // slot/día evita doble turno si QStash también dispara. Con el flag off
      // (por defecto) este bloque no se ejecuta y todo sigue como siempre.
      if (isTickQueueEnabled()) {
        await enqueueTick(slot, 'cron');
        return;
      }
      const settings = await masterService.getSettings();
      if (settings.featureFlags.tick === false) {
        tickLog.info({ slot }, 'Automated tick skipped because admin paused turn processing');
        return;
      }
      tickLog.info({ slot }, 'Automated tick started');
      await gameService.processTick();
      tickLog.info({ slot, durationMs: Date.now() - started }, 'Automated tick completed');
    } catch (err) {
      tickLog.error({ slot, durationMs: Date.now() - started, err }, 'Automated tick failed');
    }
  };

  const refreshSchedule = async () => {
    let crons: string[];
    try {
      const settings = await masterService.getSettings();
      crons = settings.turnHours.map(cronFromHour);
    } catch (err) {
      tickLog.warn({ err }, 'Could not read GlobalSettings; falling back to env cron slots');
      crons = [
        process.env.TICK_CRON_T1 || '0 11 * * *',
        process.env.TICK_CRON_T2 || '0 23 * * *',
      ];
    }

    if (JSON.stringify(crons) === JSON.stringify(activeCrons)) return;

    for (const task of tasks) {
      await task.destroy();
    }
    activeCrons = crons;
    tasks = crons.map((expr, index) => {
      return cron.schedule(expr, () => runTick(index === 0 ? 'T1' : 'T2'), {
        timezone: process.env.TZ || 'Europe/Madrid',
        noOverlap: true,
      });
    });
    tickLog.info({ crons, tz: process.env.TZ || 'Europe/Madrid' }, 'Tick cron scheduler refreshed');

    gameService.updateNextTickTime().catch((err) => {
      tickLog.warn({ err }, 'Could not set initial nextTickAt');
    });
  };

  void (async () => {
    await refreshSchedule();
    setInterval(() => {
      refreshSchedule().catch((err) => {
        tickLog.warn({ err }, 'Could not refresh tick cron scheduler');
      });
    }, 60_000);
  })();
}
