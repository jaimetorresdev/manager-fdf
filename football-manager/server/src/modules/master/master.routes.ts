// ─── Master Routes — control total (rol master) ───────────────────────────────
// Ajustes transversales de la app, gestión de admins/agentes FIFA, suplantación.
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRole } from '../../middleware/auth';
import { masterService } from './master.service';

const settingsSchema = z.object({
  turnHours: z.array(z.number().int().min(0).max(23)).min(1).max(4).optional(),
  economyModifier: z.number().min(0.1).max(5).optional(),
  maintenanceMode: z.boolean().optional(),
  featureFlags: z.record(z.boolean()).optional(),
  TICK_CRON_T1: z.string().max(64).optional(),
  TICK_CRON_T2: z.string().max(64).optional(),
  ECONOMY_INCOME_MULT: z.number().min(0.1).max(5).optional(),
  ECONOMY_SALARY_MULT: z.number().min(0.1).max(5).optional(),
  ECONOMY_TRANSFER_MULT: z.number().min(0.1).max(5).optional(),
  MAINTENANCE_MODE: z.boolean().optional(),
  FEATURE_CHAT: z.boolean().optional(),
  FEATURE_MARKET: z.boolean().optional(),
  FEATURE_FRIENDLIES: z.boolean().optional(),
}).strict();

export async function masterRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireRole('master'));

  // GET /api/master/ping — comprobación de acceso master
  app.get('/ping', async () => ({ ok: true, role: 'master' }));

  // ── Settings ──────────────────────────────────────────────────────────────

  // GET /api/master/settings
  app.get('/settings', async (_req, reply) => {
    const settings = await masterService.getSettings();
    return reply.send(settings);
  });

  // PUT /api/master/settings
  app.put('/settings', async (req, reply) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ajustes no válidos' });
    const before = await masterService.getSettings();
    const settings = await masterService.setSettings(parsed.data as Parameters<typeof masterService.setSettings>[0]);
    const managerId = req.user.managerId ?? 0;
    await masterService.logAction(
      managerId,
      'global_settings',
      JSON.stringify({
        action: 'settings_updated',
        before: {
          turnHours: before.turnHours,
          economyModifier: before.economyModifier,
          maintenanceMode: before.maintenanceMode,
          featureFlags: before.featureFlags,
        },
        after: {
          turnHours: settings.turnHours,
          economyModifier: settings.economyModifier,
          maintenanceMode: settings.maintenanceMode,
          featureFlags: settings.featureFlags,
        },
      }),
    );
    return reply.send(settings);
  });

  // ── Users ─────────────────────────────────────────────────────────────────

  // GET /api/master/users
  app.get('/users', async (_req, reply) => {
    const users = await masterService.listUsers();
    return reply.send(users);
  });

  // POST /api/master/users/:id/role
  app.post<{ Params: { id: string }; Body: { role: string } }>(
    '/users/:id/role',
    async (req, reply) => {
      const targetId = Number(req.params.id);
      const { role } = req.body;

      if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        return reply.code(400).send({ error: 'Id de usuario no válido' });
      }
      if (!['manager', 'agente_fifa', 'admin', 'master'].includes(role)) {
        return reply.code(400).send({ error: 'Rol no válido' });
      }
      // AUDIT 5.9-2: anti-lockout — un master no puede auto-degradarse (perdería el
      // acceso). El servicio además impide eliminar al último master del sistema.
      if (targetId === req.user.userId && role !== 'master') {
        return reply.code(400).send({ error: 'No puedes degradar tu propia cuenta master.' });
      }

      const managerId = req.user.managerId ?? 0;
      const updated = await masterService.setRole(targetId, role, managerId);
      return reply.send({ ok: true, userId: updated.id, newRole: updated.role });
    }
  );

  // ── Impersonation ─────────────────────────────────────────────────────────

  // POST /api/master/impersonate/:userId
  app.post<{ Params: { userId: string } }>(
    '/impersonate/:userId',
    async (req, reply) => {
      const targetId = Number(req.params.userId);
      const payload = await masterService.getImpersonatePayload(targetId);

      // Token de suplantación de vida corta (30m): una credencial permanente
      // sería un acceso indefinido a la cuenta ajena. Incluye la tokenVersion
      // del objetivo, así caduca al cambiar rol/contraseña del usuario.
      const token = app.jwt.sign(payload, { expiresIn: '30m' });

      // Log the impersonation
      const actorManagerId = req.user.managerId ?? 0;
      await masterService.logAction(
        actorManagerId,
        `user:${targetId}`,
        `Impersonation by master (${req.user.username})`
      );

      return reply.send({ token, impersonating: payload });
    }
  );
}
