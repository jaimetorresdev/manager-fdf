// ─── Football Manager API — Fastify Server ────────────────────────────────────
import 'dotenv/config'; // must be first
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'path';
import pkg from '../package.json';

import { env, corsOriginResolver } from './config/env';
import prisma from './db/prisma';
import { authRoutes }       from './modules/auth/auth.routes';
import { accountRoutes }    from './modules/auth/account.routes';
import { clubRoutes }       from './modules/club/club.routes';
import { playersRoutes }    from './modules/players/players.routes';
import { gameRoutes }       from './modules/game/game.routes';
import { marketRoutes }     from './modules/market/market.routes';
import { matchesRoutes }    from './modules/matches/matches.routes';
import { matchesOgRoutes }  from './modules/matches/matchesOg.routes';
import { adminRoutes }      from './modules/admin/admin.routes';
import { leaderboardsRoutes } from './modules/leaderboards/leaderboards.routes';
import { newsRoutes }       from './modules/game/news.routes';
import { awardsRoutes }     from './modules/game/awards.routes';
import { onboardingRoutes } from './modules/onboarding/onboarding.routes';
import { tacticsRoutes }    from './modules/tactics/tactics.routes';
import { economyRoutes }    from './modules/economy/economy.routes';
import { trainingRoutes }   from './modules/training/training.routes';
import { stadiumRoutes }    from './modules/stadium/stadium.routes';
import { staffRoutes }      from './modules/staff/staff.routes';
import { managerRoutes }    from './modules/manager/manager.routes';
import { nationalRoutes }   from './modules/national/national.routes';
import { publicRoutes }     from './modules/public/public.routes';
import { fansRoutes }       from './modules/fans/fans.routes';
import { scoutRoutes }      from './modules/scout/scout.routes';
import { ideologyRoutes }   from './modules/ideology/ideology.routes';
import { chatRoutes }       from './modules/chat/chat.routes';
import { messagesRoutes }   from './modules/messages/messages.routes';
import { searchRoutes }     from './modules/search/search.routes';
import { friendliesRoutes } from './modules/friendlies/friendlies.routes';
import { worldRoutes }      from './modules/world/world.routes';
import { academyRoutes }    from './modules/academy/academy.routes';
import { simulationRoutes } from './modules/simulation/simulation.routes';
import { sharesRoutes }     from './modules/shares/shares.routes';
import { electionsRoutes }  from './modules/elections/elections.routes';
import { forumRoutes }      from './modules/forum/forum.routes';
import { masterRoutes }     from './modules/master/master.routes';
import { fifaRoutes }       from './modules/fifa/fifa.routes';
import { initCron }         from './modules/game/tick.cron';
import { tickQueueRoutes, initTickQueue } from './modules/game/tick.queue';
import { whileAwayRoutes } from './modules/game/whileaway.routes';
import { dashboardRoutes } from './modules/game/dashboard.routes';
import { bindRootLogger }   from './lib/logger';
import { realtimeRoutes }   from './modules/realtime/realtime.routes';
import { auctionsRoutes }   from './modules/auctions/auctions.routes';
import { initAuctionTimers } from './modules/auctions/auctions.service';
import { negotiationsRoutes } from './modules/negotiations/negotiations.routes';
import { missionsRoutes } from './modules/missions/missions.routes';
import { draftRoutes } from './modules/draft/draft.routes';
import { memoryRoutes } from './modules/memory/memory.routes';
import { pushRoutes } from './modules/push/push.routes';
import { i18nRoutes } from './modules/i18n/i18n.routes';
import { pressRoutes } from './modules/press/press.routes';
import { socialRoutes } from './modules/social/social.routes';
import { clearMatchdayRealtimeTimers } from './modules/matches/matchdayRealtime.service';
import { closeTickZeroCache } from './lib/tickZeroCache';

// ─── Logger (pino vía Fastify) ───────────────────────────────────────────────
function hasPinoPretty(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

const wantPretty = env.isDev && process.env.LOG_PRETTY !== 'false';
const usePretty  = wantPretty && hasPinoPretty();

function redactSensitiveUrl(url: string): string {
  try {
    const parsed = new URL(url, 'http://manager-fdf.local');
    for (const key of ['token', 'ticket']) {
      if (parsed.searchParams.has(key)) parsed.searchParams.set(key, '<redacted>');
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.replace(/([?&](?:token|ticket)=)[^&]+/gi, '$1<redacted>');
  }
}

function publicErrorMessage(statusCode: number, message: string | undefined): string {
  if (statusCode >= 500 && !env.isDev) return 'Error interno';
  return message || 'Error interno';
}

const app = Fastify({
  // Hace que '/api/elections' y '/api/elections/' (y cualquier ruta raíz '/')
  // resuelvan igual. Sin esto, las rutas definidas como '/' devuelven 404 si la
  // petición no incluye la barra final.
  ignoreTrailingSlash: true,
  logger: {
    level: process.env.LOG_LEVEL ?? (env.isDev ? 'info' : 'warn'),
    ...(usePretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
      : {}),
    serializers: {
      req: (req) => ({ method: req.method, url: redactSensitiveUrl(req.url) }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  },
});

bindRootLogger(app.log);

app.addHook('onClose', async () => {
  clearMatchdayRealtimeTimers();
  await closeTickZeroCache();
});

async function bootstrap() {
  // ─── Plugins ────────────────────────────────────────────────────────────────
  // AUDIT 5.9-7: incluso en dev se restringe a localhost + allowlist (antes `true`
  // reflejaba cualquier origen con credenciales).
  await app.register(cors, {
    origin: corsOriginResolver(env.corsOrigins, env.isDev),
    credentials: true,
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: env.isDev ? false : {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'https:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        fontSrc: ["'self'", 'data:'],
      },
    },
    hsts: env.isDev ? false : { maxAge: 15552000, includeSubDomains: true },
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Demasiadas peticiones. Inténtalo de nuevo en unos minutos.',
      message: `Límite superado; reintenta en ${context.after}.`,
    }),
  });

  await app.register(jwt, {
    secret: env.jwtSecret,
  });

  await app.register(websocket, {
    options: { maxPayload: 1024 * 1024 },
  });

  // ─── Health check ────────────────────────────────────────────────────────────
  app.get('/health/live', async (_request, reply) => {
    return reply.send({ status: 'ok', ts: new Date().toISOString() });
  });

  let cachedHealth: any = null;
  let cachedHealthTime = 0;

  app.get('/health', async (_request, reply) => {
    try {
      const now = Date.now();
      if (!cachedHealth || now - cachedHealthTime > 60000) {
        const [users, clubs, state] = await Promise.all([
          prisma.user.count(),
          prisma.club.count(),
          prisma.gameState.findFirst({ where: { isActive: true }, select: { week: true, phase: true } }),
        ]);
        cachedHealth = { users, clubs, state };
        cachedHealthTime = now;
      }
      
      const { users, clubs, state } = cachedHealth;

      return reply.send({
        status: 'ok',
        version: pkg.version,
        ts: new Date().toISOString(),
        database: {
          ok: true,
          seeded: users > 0 && clubs > 0,
          users,
          clubs,
        },
        game: state ?? null,
      });
    } catch (err) {
      app.log.error(err);
      return reply.code(503).send({
        status: 'error',
        version: pkg.version,
        ts: new Date().toISOString(),
        database: { ok: false },
      });
    }
  });

  // ─── Routes (domain prefix) ──────────────────────────────────────────────────
  await app.register(authRoutes,       { prefix: '/api/auth' });
  await app.register(accountRoutes,    { prefix: '/api/account' });
  await app.register(realtimeRoutes,   { prefix: '/ws' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(clubRoutes,       { prefix: '/api/club' });
  await app.register(playersRoutes,    { prefix: '/api/players' });
  await app.register(tacticsRoutes,    { prefix: '/api/tactics' });
  await app.register(economyRoutes,    { prefix: '/api/economy' });
  await app.register(trainingRoutes,   { prefix: '/api/training' });
  await app.register(stadiumRoutes,    { prefix: '/api/stadium' });
  await app.register(simulationRoutes, { prefix: '/api/simulation' });
  await app.register(staffRoutes,      { prefix: '/api/staff' });
  await app.register(managerRoutes,    { prefix: '/api/manager' });
  await app.register(nationalRoutes,   { prefix: '/api/national' });
  await app.register(fansRoutes,       { prefix: '/api/fans' });
  await app.register(scoutRoutes,      { prefix: '/api/scout' });
  await app.register(ideologyRoutes,   { prefix: '/api/ideology' });
  await app.register(publicRoutes,     { prefix: '/api/public' });
  await app.register(chatRoutes,       { prefix: '/api/chat' });
  await app.register(messagesRoutes,   { prefix: '/api/messages' });
  await app.register(searchRoutes,     { prefix: '/api/search' });
  await app.register(friendliesRoutes, { prefix: '/api/friendlies' });
  await app.register(worldRoutes,      { prefix: '/api/world' });
  await app.register(academyRoutes,    { prefix: '/api/academy' });
  await app.register(gameRoutes,       { prefix: '/api/game' });
  await app.register(whileAwayRoutes,  { prefix: '/api/dashboard' });
  await app.register(dashboardRoutes,  { prefix: '/api/dashboard' });
  await app.register(marketRoutes,     { prefix: '/api/market' });
  await app.register(auctionsRoutes,   { prefix: '/api/auctions' });
  await app.register(negotiationsRoutes, { prefix: '/api/negotiations' });
  // N4-1: plugin PÚBLICO (sin auth) bajo el mismo prefijo; debe ir ANTES de
  // matchesRoutes para que su `/:id/og-image` no quede tras el hook auth global.
  await app.register(matchesOgRoutes,  { prefix: '/api/matches' });
  await app.register(matchesRoutes,    { prefix: '/api/matches' });
  await app.register(newsRoutes,       { prefix: '/api/news' });
  await app.register(awardsRoutes,     { prefix: '/api/awards' });
  await app.register(sharesRoutes,     { prefix: '/api/shares' });
  await app.register(electionsRoutes,  { prefix: '/api/elections' });
  await app.register(forumRoutes,      { prefix: '/api/forum' });
  await app.register(masterRoutes,     { prefix: '/api/master' });
  await app.register(fifaRoutes,       { prefix: '/api/fifa' });
  await app.register(adminRoutes,      { prefix: '/api/admin' });
  await app.register(leaderboardsRoutes, { prefix: '/api/leaderboards' });
  await app.register(missionsRoutes,   { prefix: '/api/missions' });
  await app.register(draftRoutes,      { prefix: '/api/draft' });
  await app.register(memoryRoutes,     { prefix: '/api/memory' });
  await app.register(pushRoutes,       { prefix: '/api/push' });
  await app.register(socialRoutes,     { prefix: '/api/social' });
  await app.register(i18nRoutes,       { prefix: '/api/i18n' });
  await app.register(pressRoutes,      { prefix: '/api/press' });
  // Z3 · 7.3: pipeline blindado del turno (responde 409 si TICK_QUEUE=off).
  await app.register(tickQueueRoutes,  { prefix: '/api/tick' });

  // ─── Serve frontend static files (production) ───────────────────────────────
  if (!env.isDev) {
    const distPath = path.join(__dirname, '../public');
    await app.register(fastifyStatic, {
      root: distPath,
      prefix: '/',
    });
    // SPA fallback — serve index.html for all non-API routes
    app.setNotFoundHandler((_req, reply) => {
      if (_req.url.startsWith('/api')) {
        reply.code(404).send({ error: 'Ruta no encontrada' });
      } else {
        reply.sendFile('index.html');
      }
    });
  } else {
    // ─── 404 handler (dev) ──────────────────────────────────────────────────
    app.setNotFoundHandler((_req, reply) => {
      reply.code(404).send({ error: 'Ruta no encontrada' });
    });
  }

  // ─── Error handler ───────────────────────────────────────────────────────────
  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err);
    const statusCode = err.statusCode ?? 500;
    reply.code(statusCode).send({ error: publicErrorMessage(statusCode, err.message) });
  });

  // ─── Start ───────────────────────────────────────────────────────────────────
  await app.listen({ port: env.port, host: '0.0.0.0' });
  app.log.info({ port: env.port, env: env.nodeEnv }, 'Football Manager API listening');

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Graceful shutdown');
    try {
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });

  initCron(app.log);
  initTickQueue(app.log); // Z3 · 7.3: no-op salvo TICK_QUEUE=on
  await initAuctionTimers(app.log);
}

bootstrap().catch(err => {
   
  console.error('Fatal startup error:', err);
  process.exit(1);
});
