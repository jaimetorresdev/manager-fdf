// ─── Auth Routes ─────────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from './auth.service';
import { authenticate } from '../../middleware/auth';

const registerSchema = z.object({
  username:    z.string().min(3).max(30),
  email:       z.string().email(),
  password:    z.string().min(8),
  managerName: z.string().min(2).max(50).optional(),
});

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

const updateMeSchema = z.object({
  email: z.string().email().optional(),
  currentPassword: z.string().min(1).optional(),
  avatarSeed: z.string().min(1).max(80).nullable().optional(),
  managerAvatarSeed: z.string().min(1).max(80).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/register
  app.post('/register', {
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = registerSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validación fallida', details: body.error.flatten() });
    }

    try {
      const result = await authService.register({ ...body.data, ip: request.ip });
      const token  = app.jwt.sign(result, { expiresIn: '30d' });
      return reply.code(201).send({ token, ...result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo registrar la cuenta';
      return reply.code(409).send({ error: msg });
    }
  });

  // POST /api/auth/login
  app.post('/login', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const body = loginSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validación fallida' });
    }

    try {
      const { previousLoginAt, ...result } = await authService.login({ ...body.data, ip: request.ip });
      const token  = app.jwt.sign(result, { expiresIn: '30d' });
      // previousLoginAt (QW-29): "desde cuándo" real para /api/dashboard/while-away.
      return reply.send({ token, ...result, previousLoginAt });
    } catch {
      return reply.code(401).send({ error: 'Credenciales inválidas' });
    }
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: [authenticate] }, async (request, reply) => {
    try {
      const user = await authService.me(request.user.userId);
      return reply.send(user);
    } catch {
      return reply.code(404).send({ error: 'Usuario no encontrado' });
    }
  });

  // PATCH /api/auth/me — update email/avatar settings
  app.patch('/me', { preHandler: [authenticate] }, async (request, reply) => {
    const body = updateMeSchema.safeParse(request.body ?? {});
    if (!body.success) {
      return reply.code(400).send({ error: 'Validación fallida', details: body.error.flatten() });
    }

    try {
      const user = await authService.updateMe(request.user.userId, body.data);
      const token = app.jwt.sign({
        userId: request.user.userId,
        managerId: request.user.managerId,
        clubId: request.user.clubId,
        username: request.user.username,
        role: request.user.role,
        // AUDIT 3.3: el token reemitido debe portar la tokenVersion vigente, o el
        // siguiente request fallaría el chequeo de versión (re-login auto-infligido),
        // muy probable ahora que ban/cambio-de-rol incrementan tokenVersion.
        tokenVersion: request.user.tokenVersion ?? 0,
      }, { expiresIn: '30d' });
      return reply.send({
        ok: true,
        user,
        token,
        uiNeed: '// NECESITO: Antigravity debe crear SettingsPage con cuenta, avatar procedural y accesibilidad enlazada.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo actualizar la cuenta';
      return reply.code(400).send({ error: msg });
    }
  });

  // POST /api/auth/change-password — update password after current password check
  app.post('/change-password', { preHandler: [authenticate] }, async (request, reply) => {
    const body = changePasswordSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validación fallida', details: body.error.flatten() });
    }

    try {
      return reply.send(await authService.changePassword(
        request.user.userId,
        body.data.currentPassword,
        body.data.newPassword
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar la contraseña';
      return reply.code(400).send({ error: msg });
    }
  });
}
