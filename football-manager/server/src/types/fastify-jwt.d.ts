// Type augmentation for @fastify/jwt — describes the real shape of our JWT payload.
// The payload is signed in auth.service.ts (login/register) with these fields.
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: number;
      managerId: number;
      clubId: number | null;
      username: string;
      role: string;
    };
    user: {
      userId: number;
      managerId: number;
      clubId: number | null;
      username: string;
      role: string;
    };
  }
}
