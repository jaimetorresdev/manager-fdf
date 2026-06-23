import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { staffService } from './staff.service';

const hireSchema = z.object({
  role: z.enum([
    'manager',
    'sportingDirector',
    'fitnessCoach',
    'doctor',
    'tacticalAnalyst',
    'scout',
    'nutritionist',
    'goalkeepingCoach',
  ]),
  level: z.number().int().min(1).max(5),
  name: z.string().min(2).max(80).optional(),
  salary: z.number().positive().optional(),
  specialty: z.string().min(2).max(80).optional(),
});

export async function staffRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await staffService.getStaff(clubId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(500).send({ error: msg });
    }
  });

  app.post('/members', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = hireSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Datos no válidos' });

    try {
      return reply.send(await staffService.hireStaff(clubId, body.data));
    } catch (err) {
      console.error('HIRE ERROR:', err);
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.delete<{ Params: { id: string } }>('/members/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    try {
      return reply.send(await staffService.fireStaff(clubId, parseInt(request.params.id)));
    } catch (err) {
      console.error('FIRE ERROR:', err);
      const msg = err instanceof Error ? err.message : 'Error';
      return reply.code(400).send({ error: msg });
    }
  });

  app.get('/debug-fire', async (request, reply) => {
    try {
      const prisma = require('../../db/prisma').default;
      const member = await prisma.staffMember.findFirst();
      if (!member) return reply.send({ error: 'no members' });
      const staff = await prisma.staff.findUnique({ where: { id: member.staffId } });
      try {
        await staffService.fireStaff(staff.clubId, member.id);
        return reply.send({ success: true, firedId: member.id });
      } catch (err) {
        return reply.send({ error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
      }
    } catch (err) {
      return reply.send({ error: String(err) });
    }
  });
}
