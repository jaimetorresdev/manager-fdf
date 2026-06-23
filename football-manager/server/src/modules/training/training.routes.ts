// ─── Training Routes FDF ──────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { trainingService, TRAINING_TYPES, COACH_CATEGORIES, COACH_ROLES, TrainingType } from './training.service';
import { FDF_PLAY_TYPES, TRAINED_PLAY_TYPES } from './playbook.rules';

function positiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function trainingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // ─── Entrenadores ──────────────────────────────────────────────────────────

  /** GET /api/training/coaches — lista de entrenadores del club con sus jugadores */
  app.get('/coaches', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await trainingService.getCoaches(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  /** POST /api/training/coaches — contratar un entrenador */
  app.post('/coaches', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      category: z.enum(COACH_CATEGORIES),
      level: z.number().int().min(1).max(10),
      role: z.enum(COACH_ROLES).optional(),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: body.error.issues });
    }

    try {
      return reply.code(201).send(
        await trainingService.hireCoach(clubId, body.data.category, body.data.level, body.data.role),
      );
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /** DELETE /api/training/coaches/:id — despedir entrenador */
  app.delete<{ Params: { id: string } }>('/coaches/:id', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const coachId = positiveInt(request.params.id);
    if (!coachId) return reply.code(400).send({ error: 'Invalid coach id' });
    try {
      await trainingService.fireCoach(clubId, coachId);
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /** PUT /api/training/coaches/:id/assign — asignar jugadores (máx 6) */
  app.put<{ Params: { id: string } }>('/coaches/:id/assign', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      playerIds: z.array(z.number().int().positive()).max(6),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'playerIds debe ser array de hasta 6 enteros positivos' });
    }
    const coachId = positiveInt(request.params.id);
    if (!coachId) return reply.code(400).send({ error: 'Invalid coach id' });

    try {
      return reply.send(
        await trainingService.assignPlayers(clubId, coachId, body.data.playerIds),
      );
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── Sesiones de Entrenamiento ─────────────────────────────────────────────

  app.get('/control', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await trainingService.getTrainingControl(clubId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/close', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await trainingService.setTrainingClosed(clubId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/stimulate', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await trainingService.setHomeStimulated(clubId));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /**
   * POST /api/training/session — ejecutar una sesión de entrenamiento manual.
   * Body: { coachId, trainingType, playerIds[] }
   * Devuelve: resultados por jugador (mejora, stat, fitness).
   */
  app.post('/session', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      coachId: z.number().int().positive(),
      trainingType: z.enum(TRAINING_TYPES as [string, ...string[]]),
      playerIds: z.array(z.number().int().positive()).min(1).max(6),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: 'Datos inválidos', issues: body.error.issues });
    }

    try {
      const result = await trainingService.runTrainingSession(clubId, {
        coachId: body.data.coachId,
        trainingType: body.data.trainingType as TrainingType,
        playerIds: body.data.playerIds,
      });
      return reply.send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /**
   * GET /api/training/types — lista de tipos de entrenamiento disponibles
   * con los atributos que mejoran.
   */
  app.get('/types', async (_request, reply) => {
    const { TRAINING_TYPE_STATS } = await import('./training.service');
    return reply.send(
      TRAINING_TYPES.map(type => ({
        type,
        stats: TRAINING_TYPE_STATS[type] ?? [],
        description: TRAINING_TYPE_DESCRIPTIONS[type] ?? type,
      })),
    );
  });

  // ─── Jugadas Entrenadas ────────────────────────────────────────────────────

  /** GET /api/training/plays — jugadas entrenadas del club */
  app.get('/plays', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    try {
      return reply.send(await trainingService.getTrainedPlays(clubId));
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  /**
   * POST /api/training/plays — iniciar desarrollo de una nueva jugada.
   * Body: { type: 'field_attack' | 'field_defense' | 'setpiece_attack' | 'setpiece_defense' }
   */
  app.post('/plays', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });

    const body = z.object({
      type: z.enum(TRAINED_PLAY_TYPES),
    }).safeParse(request.body);

    if (!body.success) {
      return reply.code(400).send({ error: `Tipo de jugada inválido. Opciones: ${FDF_PLAY_TYPES.join(', ')}` });
    }

    try {
      return reply.code(201).send(
        await trainingService.createTrainedPlay(clubId, body.data.type),
      );
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  /**
   * PUT /api/training/plays/:id/activate — activar una jugada ya desarrollada.
   */
  app.put<{ Params: { id: string } }>('/plays/:id/activate', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const playId = positiveInt(request.params.id);
    if (!playId) return reply.code(400).send({ error: 'Invalid play id' });
    try {
      return reply.send(
        await trainingService.activateTrainedPlay(clubId, playId),
      );
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.put<{ Params: { id: string } }>('/plays/:id/executors', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No club' });
    const playId = positiveInt(request.params.id);
    if (!playId) return reply.code(400).send({ error: 'Invalid play id' });
    const body = z.object({
      playerIds: z.array(z.number().int().positive()).length(3),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Se requieren exactamente 3 ejecutores' });
    try {
      return reply.send(await trainingService.setTrainedPlayExecutors(clubId, playId, body.data.playerIds));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}

// ─── Descripciones de tipos de entrenamiento ──────────────────────────────────
const TRAINING_TYPE_DESCRIPTIONS: Record<TrainingType, string> = {
  'táctica':        'Mejora organización y pase. Sube la comprensión táctica del equipo.',
  'portero':        'Mejora portería. Solo recomendado para porteros.',
  'defensa':        'Mejora entradas y organización defensiva.',
  'medio':          'Mejora organización, pase y regate en la zona de mediocampistas.',
  'delantero':      'Mejora definición, disparo y desmarque.',
  'rehabilitación': 'Recuperación de forma. No mejora atributos, pero sube el fitness más rápido.',
};
