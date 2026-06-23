import { FastifyReply, FastifyRequest } from 'fastify';
import { masterService } from './master.service';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function featureGate(feature: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (reply.sent) return;
    if (request.user?.role === 'master') return;
    const enabled = await masterService.isFeatureEnabled(feature);
    if (!enabled) {
      reply.code(503).send({ error: `Módulo desactivado por feature flag: ${feature}` });
    }
  };
}

export async function maintenanceWriteGuard(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (reply.sent || !WRITE_METHODS.has(request.method)) return;
  if (!request.user) return;
  try {
    await masterService.assertWriteAllowed(request.user?.role);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Modo mantenimiento activo';
    reply.code(503).send({ error: msg });
  }
}
