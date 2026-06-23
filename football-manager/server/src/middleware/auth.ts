// ─── JWT Auth Middleware ──────────────────────────────────────────────────────
import { FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../db/prisma';

export interface JwtPayload {
  userId: number;
  managerId: number;
  clubId: number | null;
  username: string;
  role: string;
  tokenVersion?: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

// ─── Jerarquía de roles ───────────────────────────────────────────────────────
// master > admin > agente_fifa > manager. Un rol superior hereda los permisos
// de todos los inferiores.
export type Role = 'manager' | 'agente_fifa' | 'admin' | 'master';
export const ROLE_RANK: Record<Role, number> = {
  manager: 0,
  agente_fifa: 1,
  admin: 2,
  master: 3,
};

export function rankOf(role: string | undefined): number {
  return ROLE_RANK[(role as Role)] ?? 0;
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
    const user = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { tokenVersion: true, isBanned: true },
    });
    if (!user || user.isBanned) {
      reply.code(401).send({ error: 'No autorizado' });
      return;
    }
    const claimVersion = request.user.tokenVersion ?? 0;
    if (claimVersion !== user.tokenVersion) {
      reply.code(401).send({ error: 'Sesión invalidada; vuelve a iniciar sesión' });
      return;
    }
  } catch {
    reply.code(401).send({ error: 'No autorizado' });
  }
}

/**
 * Exige un rol mínimo (jerárquico). Devuelve un preHandler de Fastify.
 * Uso: app.addHook('preHandler', requireRole('admin'))
 */
export function requireRole(min: Role) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (rankOf(request.user.role) < ROLE_RANK[min]) {
      reply.code(403).send({ error: `Acceso denegado: requiere rol '${min}' o superior` });
    }
  };
}

/** Compatibilidad: admin o superior (master). */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);
  if (reply.sent) return;
  if (rankOf(request.user.role) < ROLE_RANK.admin) {
    reply.code(403).send({ error: 'Acceso denegado: requiere rol admin o superior' });
  }
}
