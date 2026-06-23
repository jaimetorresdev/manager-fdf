import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { tacticsService } from './tactics.service';
import { FDF_PLAY_TYPES, TRAINED_PLAY_TYPES } from '../training/playbook.rules';
// WT1/WT2: catálogos de posiciones detalladas y formaciones (fuente única UI).
import { FORMATIONS, MODERN_ROLE_LABELS, findFormation } from './formations.catalog';
import { DETAILED_POSITIONS, DETAILED_POSITION_CODES } from '../players/detailedPositions';

function parseJsonText(raw: string): unknown {
  return JSON.parse(raw);
}

const jsonTextSchema = z.string().max(5000).refine((raw) => {
  try {
    parseJsonText(raw);
    return true;
  } catch {
    return false;
  }
}, 'JSON no válido');

const subsLogicSchema = jsonTextSchema.refine((raw) => {
  const parsed = parseJsonText(raw);
  if (!parsed || typeof parsed !== 'object') return false;
  if (Array.isArray(parsed)) return parsed.length <= 12;
  const keys = Object.keys(parsed as Record<string, unknown>);
  return keys.length <= 20;
}, 'Lógica de cambios no válida');

const tacticSchema = z.object({
  name: z.string().max(50).optional(),
  formation: z.string().optional(),
  construction: z.number().min(0).max(100).optional(),
  destruction: z.number().min(0).max(100).optional(),
  pressing: z.number().min(0).max(100).optional(),
  tempo: z.number().min(0).max(100).optional(),
  width: z.number().min(0).max(100).optional(),
  // R3: mentality unificada a 0-100 numérico SIN degradar (se guarda como string
  // numérico en Tactic.mentality; los valores legacy 'defensive/balanced/attacking'
  // siguen aceptados y el simulador los interpreta como 25/50/75).
  mentality: z.union([
    z.number().min(0).max(100),
    z.enum(['defensive', 'balanced', 'attacking']),
  ]).optional(),
  marking: z.enum(['zonal', 'man', 'individual', 'mixed']).optional(),
  zones: jsonTextSchema.optional(), // JSON
  passingStyle: jsonTextSchema.optional(), // JSON
  subsLogic: subsLogicSchema.optional(), // JSON
  offensiveStyle: z.string().optional(),
  defensiveStyle: z.string().optional(),
  attackZones: jsonTextSchema.optional(), // JSON
  defenseReinforcement: jsonTextSchema.optional(), // JSON
  // WT2: roles modernos por hueco (JSON { "<slotIndex>": "<rol>" }) — ADITIVO.
  roleInstructions: jsonTextSchema.optional(), // JSON
});

function positiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function tacticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });
    try {
      const tactics = await tacticsService.getAllMyTactics(managerId);
      return reply.send(tactics);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post('/', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });

    const body = tacticSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Táctica no válida' });

    try {
      const tactic = await tacticsService.createTactic(managerId, body.data);
      return reply.send(tactic);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });

    const body = tacticSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Táctica no válida' });
    const tacticId = positiveInt(request.params.id);
    if (!tacticId) return reply.code(400).send({ error: 'ID de táctica no válido' });

    try {
      const tactic = await tacticsService.updateTactic(managerId, tacticId, body.data);
      return reply.send(tactic);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });
    const tacticId = positiveInt(request.params.id);
    if (!tacticId) return reply.code(400).send({ error: 'ID de táctica no válido' });

    try {
      await tacticsService.deleteTactic(managerId, tacticId);
      return reply.send({ success: true });
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post<{ Params: { id: string } }>('/:id/default', async (request, reply) => {
    const { managerId } = request.user;
    if (!managerId) return reply.code(400).send({ error: 'No tienes mánager asignado' });
    const tacticId = positiveInt(request.params.id);
    if (!tacticId) return reply.code(400).send({ error: 'ID de táctica no válido' });

    try {
      const tactic = await tacticsService.setDefaultTactic(managerId, tacticId);
      return reply.send(tactic);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── WT2 · GET /api/tactics/formations — catálogo de las 15 ───────────────
  // {key, name, shape, slots, strengths, weaknesses, counters, physicalDemand,
  //  style, description, history} en español. Fuente única para la pizarra (WT4).
  app.get('/formations', async (_request, reply) => {
    return reply.send({
      formations: FORMATIONS,
      roleLabels: MODERN_ROLE_LABELS,
    });
  });

  // ─── WT1 · GET /api/tactics/positions — catálogo de las 15 posiciones ─────
  app.get('/positions', async (_request, reply) => {
    return reply.send({
      positions: DETAILED_POSITION_CODES.map((code) => {
        const def = DETAILED_POSITIONS[code];
        const entries = Object.entries(def.weights);
        return {
          code: def.code,
          label: def.label,
          dorsal: def.dorsal,
          macro: def.macro,
          side: def.side ?? null,
          keySkills: entries.filter(([, w]) => w === 3).map(([k]) => k),
          importantSkills: entries.filter(([, w]) => w === 2).map(([k]) => k),
        };
      }),
    });
  });

  // ─── Q12/WT2 · GET /api/tactics/auto-lineup?formation=4-2-3-1 ─────────────
  // XI óptimo de MI plantilla. Si la formación está en el catálogo WT2, rellena
  // por SLOTS de posición detallada (acepta key o shape, p. ej. "wm-3-2-5" o
  // "3-2-5"); los strings libres legacy \d+(-\d+){1,3} siguen valiendo.
  app.get('/auto-lineup', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    const query = z.object({
      formation: z.string().min(3).max(16).refine(
        (value) => Boolean(findFormation(value)) || /^\d+(-\d+){1,3}$/.test(value),
        'Formación no válida: usa una del catálogo (p. ej. 4-2-3-1) o el formato 4-4-2.',
      ),
    }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.issues[0]?.message ?? 'Formación no válida' });
    }

    try {
      return reply.send(await tacticsService.autoLineup(clubId, query.data.formation));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.post('/positional-insights', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    const body = z.object({
      formation: z.string().min(3).max(16),
      starterIds: z.array(z.number().int().positive()).min(11).max(11),
    }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'formation y 11 starterIds requeridos' });
    try {
      return reply.send(await tacticsService.positionalInsights(clubId, body.data.formation, body.data.starterIds));
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  // ─── Jugadas Entrenadas ────────────────────────────────────────────────
  app.get('/plays', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    try {
      const plays = await tacticsService.getTrainedPlays(clubId);
      return reply.send(plays);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.post('/plays', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    
    const body = z.object({ type: z.enum(TRAINED_PLAY_TYPES) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: `Tipo de jugada inválido. Opciones: ${FDF_PLAY_TYPES.join(', ')}` });

    try {
      const play = await tacticsService.startTrainedPlay(clubId, body.data.type);
      return reply.send(play);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });

  app.patch<{ Params: { id: string } }>('/plays/:id/toggle', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });
    const playId = positiveInt(request.params.id);
    if (!playId) return reply.code(400).send({ error: 'ID de jugada no válido' });

    try {
      const play = await tacticsService.toggleTrainedPlay(clubId, playId);
      return reply.send(play);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  });
}
