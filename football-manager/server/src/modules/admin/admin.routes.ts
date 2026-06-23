// ─── Admin Routes ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../middleware/auth';
import { maintenanceWriteGuard } from '../master/governance.guard';
import { gameService } from '../game/game.service';
import prisma from '../../db/prisma';
import { adminTurnService } from './admin-turn.service';

// S11 · Schemas zod de los bodies admin (antes: casts `as ...` sin validar).
// Importes/contadores acotados; strings con tope para que un body raro no
// acabe en BD ni en logs sin control. Body ausente ⇒ {} (todas opcionales).
const reasonField = z.string().trim().max(300).optional();
const advanceBodySchema = z.object({
  reason: reasonField,
  count: z.coerce.number().int().min(1).max(10).optional(), // máx 10 turnos por llamada (timeouts)
}).optional();
const pauseBodySchema = z.object({ paused: z.boolean().optional() }).optional();
const rewindBodySchema = z.object({
  snapshotId: z.coerce.number().int().positive().optional(),
  forceClockOnly: z.boolean().optional(),
}).optional();
const reasonBodySchema = z.object({ reason: reasonField }).optional();

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);
  // AUDIT 5.9-1: el modo mantenimiento debe bloquear también las rutas admin
  // destructivas (/turn/advance, /turn/rewind), como en game/fifa/market.
  // El guard delega en assertWriteAllowed(role), así que respeta los bypass por rol.
  app.addHook('preHandler', maintenanceWriteGuard);

  app.get('/stats', async (_request, reply) => {
    const [clubs, players, totalMatches, playedMatches, transfers, users, freeClubs, state] = await Promise.all([
      prisma.club.count(),
      prisma.player.count(),
      prisma.match.count(),
      prisma.match.count({ where: { status: 'played' } }),
      prisma.transferOffer.count(),
      prisma.user.count(),
      prisma.club.count({ where: { manager: null } }),
      gameService.getState(),
    ]);

    return reply.send({
      clubs,
      players,
      users,
      freeClubs,
      totalMatches,
      playedMatches,
      transfers,
      season: state.season,
      week: state.week,
      phase: state.phase,
    });
  });

  app.get('/clubs', async (_request, reply) => {
    const clubs = await prisma.club.findMany({
      orderBy: [{ reputation: 'desc' }, { budget: 'desc' }],
      select: {
        id: true,
        name: true,
        shortName: true,
        badge: true,
        city: true,
        budget: true,
        reputation: true,
        fans: true,
        isUserClub: true,
        manager: {
          select: {
            name: true,
            user: { select: { username: true, role: true } },
          },
        },
        players: { select: { id: true } },
      },
    });

    return reply.send(clubs.map((club) => ({
      id: club.id,
      name: club.name,
      shortName: club.shortName,
      badge: club.badge,
      city: club.city,
      budget: club.budget,
      reputation: club.reputation,
      fans: club.fans,
      isUserClub: club.isUserClub,
      managerName: club.manager?.name ?? null,
      managerUsername: club.manager?.user.username ?? null,
      managerRole: club.manager?.user.role ?? null,
      playerCount: club.players.length,
    })));
  });

  app.get('/users', async (_request, reply) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        createdAt: true,
        manager: {
          select: {
            name: true,
            club: { select: { name: true, shortName: true, badge: true } },
          },
        },
      },
    });

    return reply.send(users);
  });

  app.get('/turn-control', async (_request, reply) => {
    try {
      return reply.send(await adminTurnService.getControlState());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de control de turnos';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/turn/advance', async (request, reply) => {
    const parsed = advanceBodySchema.safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      const count = parsed.data?.count ?? 1;
      return reply.send(await adminTurnService.advance(request.user.managerId ?? null, parsed.data?.reason, count));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al avanzar turno';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/turn/pause', async (request, reply) => {
    const parsed = pauseBodySchema.safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await adminTurnService.setPaused(parsed.data?.paused ?? true));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al pausar turnos';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/turn/resume', async (_request, reply) => {
    try {
      return reply.send(await adminTurnService.setPaused(false));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al reanudar turnos';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/turn/rewind', async (request, reply) => {
    const parsed = rewindBodySchema.safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await adminTurnService.rewind(parsed.data?.snapshotId, parsed.data?.forceClockOnly === true));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al rebobinar turno';
      return reply.code(400).send({ error: msg });
    }
  });

  app.post('/turn/unlock', async (request, reply) => {
    const parsed = reasonBodySchema.safeParse(request.body ?? undefined);
    if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
    try {
      return reply.send(await adminTurnService.unlock(request.user.managerId ?? null, parsed.data?.reason));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al desbloquear turno';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post<{ Params: { id: string } }>(
    '/matches/:id/resimulate',
    async (request, reply) => {
      const parsed = reasonBodySchema.safeParse(request.body ?? undefined);
      if (!parsed.success) return reply.code(400).send({ error: 'Datos no válidos' });
      try {
        const id = parseInt(request.params.id, 10);
        if (Number.isNaN(id)) return reply.code(400).send({ error: 'ID de partido no válido' });
        return reply.send(await adminTurnService.resimulateMatch(
          request.user.managerId ?? null,
          id,
          parsed.data?.reason
        ));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al resimular partido';
        return reply.code(400).send({ error: msg });
      }
    }
  );

  // AUDIT C-4 — RESET DESTRUCTIVO POR HTTP ELIMINADO.
  // La ruta `POST /turn/reseed` lanzaba un reset total de la BD (borrado + reseed) a
  // través de un proceso hijo del sistema disparado por una petición HTTP. Cualquier
  // master (o admin con JWT escalado) destruía el mundo entero con una sola request, y
  // el proceso lanzado heredaba el entorno del servidor (vector RCE/DoS). El blindaje
  // anterior (flag de entorno + confirm + lanzador sin shell) reducía el riesgo pero NO
  // eliminaba la superficie: un reset total de BD no debe ser invocable por la API.
  //
  // El reseed sigue disponible como COMANDO CLI LOCAL, sin ningún parámetro controlable
  // por HTTP, ejecutado por un operador con acceso al host:
  //
  //     cd football-manager/server && npm run db:reset
  //
  // (definido en package.json → `prisma db push --force-reset && npm run db:seed:dev`).
  // No existe ninguna ruta equivalente en la API; ver test `admin.reseed-route.test.ts`.
}
