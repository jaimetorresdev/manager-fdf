import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';

type MaybeAuthenticatedRequest = FastifyRequest & {
  user?: {
    userId?: number;
    managerId?: number;
    clubId?: number | null;
  };
};

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('base64url').slice(0, 24);
}

export function authenticatedRateLimitKey(request: FastifyRequest): string {
  const user = (request as MaybeAuthenticatedRequest).user;
  if (Number.isSafeInteger(user?.userId)) return `user:${user.userId}`;
  if (Number.isSafeInteger(user?.managerId)) return `manager:${user.managerId}`;
  if (Number.isSafeInteger(user?.clubId)) return `club:${user.clubId}`;

  const authorization = request.headers.authorization;
  if (authorization) return `auth:${shortHash(authorization)}`;

  return `ip:${request.ip}`;
}
