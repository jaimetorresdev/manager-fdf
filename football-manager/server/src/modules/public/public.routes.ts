// ─── Public Routes (SIN auth) ─────────────────────────────────────────────────
// Q25 · modo espectador: next-tick, stats, standings y partidos destacados.
// Q22 · avatar público (imagen subida o SVG procedural).
// Rate-limit suave por ruta; cero datos sensibles (ni emails ni economía).
import { FastifyInstance } from 'fastify';
import { tickZeroCached } from '../../lib/tickZeroCache';
import { publicService } from './public.service';

const SOFT_RATE_LIMIT = { rateLimit: { max: 30, timeWindow: '1 minute' } };

export async function publicRoutes(app: FastifyInstance) {
  app.get('/ranking', async (request, reply) => {
    try {
      const data = await publicService.getRanking();
      return reply.send(data);
    } catch (e: any) {
      return reply.code(500).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>('/club/:id', async (request, reply) => {
    try {
      const clubId = parseInt(request.params.id);
      if (isNaN(clubId)) return reply.code(400).send({ error: 'ID de club inválido' });

      const data = await publicService.getClubExport(clubId);
      return reply.send(data);
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // ─── Q22 · GET /api/public/avatar/:managerId ────────────────────────────────
  // SIEMPRE devuelve una imagen (la subida o un SVG procedural del avatarSeed),
  // apta para <img src>. Cache-bust con ?v= tras subir/borrar.
  app.get<{ Params: { managerId: string } }>('/avatar/:managerId', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const managerId = parseInt(request.params.managerId);
    if (isNaN(managerId) || managerId <= 0) {
      return reply.code(400).send({ error: 'ID de mánager inválido' });
    }
    try {
      const avatar = await publicService.getAvatar(managerId);
      if (!avatar) return reply.code(404).send({ error: 'Mánager no encontrado' });
      return reply
        .header('Content-Type', avatar.mime)
        .header('Cache-Control', 'public, max-age=300')
        .send(avatar.body);
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar el avatar' });
    }
  });

  // ─── Q25 · GET /api/public/next-tick ────────────────────────────────────────
  app.get('/next-tick', { config: SOFT_RATE_LIMIT }, async (_request, reply) => {
    try {
      return reply.send(await publicService.getNextTick());
    } catch {
      return reply.code(500).send({ error: 'No se pudo calcular el próximo turno' });
    }
  });

  // ─── Q25 · GET /api/public/stats ────────────────────────────────────────────
  app.get('/stats', { config: SOFT_RATE_LIMIT }, async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('public:stats', {}, () => publicService.getPublicStats()));
    } catch {
      return reply.code(500).send({ error: 'No se pudieron cargar las estadísticas públicas' });
    }
  });

  // ─── Q25 · GET /api/public/standings?league= ────────────────────────────────
  app.get<{ Querystring: { league?: string } }>('/standings', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    try {
      const raw = request.query.league;
      let leagueId: number | undefined;
      if (raw !== undefined && raw !== '') {
        leagueId = parseInt(raw);
        if (isNaN(leagueId) || leagueId <= 0) {
          return reply.code(400).send({ error: 'Parámetro league inválido: usa el id de la competición' });
        }
      }
      const data = await publicService.getPublicStandings(leagueId);
      if (data === null) return reply.code(404).send({ error: 'Liga no encontrada en la temporada activa' });
      return reply.send(data);
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar la clasificación' });
    }
  });

  // ─── Y2 · World map public API ─────────────────────────────────────────────
  app.get<{ Querystring: { continent?: string } }>('/world/map', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    try {
      const params = { continent: request.query.continent ?? null };
      return reply.send(await tickZeroCached('public:world:map', params, () => publicService.getWorldMap({
        continent: params.continent ?? undefined,
      })));
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar el mapa mundial vivo' });
    }
  });

  app.get('/world/continents', { config: SOFT_RATE_LIMIT }, async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('public:world:continents', {}, () => publicService.getWorldContinents()));
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar el mapa mundial' });
    }
  });

  app.get<{ Querystring: { continent?: string } }>('/world/countries', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    try {
      const params = { continent: request.query.continent ?? null };
      return reply.send(await tickZeroCached('public:world:countries', params, () => publicService.getWorldCountries({
        continent: params.continent ?? undefined,
      })));
    } catch {
      return reply.code(500).send({ error: 'No se pudieron cargar los países' });
    }
  });

  app.get<{
    Querystring: { continent?: string; country?: string; status?: string; take?: string; cursor?: string };
  }>('/world/leagues', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const take = request.query.take ? parseInt(request.query.take) : undefined;
    const cursor = request.query.cursor ? parseInt(request.query.cursor) : undefined;
    if ((request.query.take && (isNaN(take!) || take! <= 0)) || (request.query.cursor && (isNaN(cursor!) || cursor! <= 0))) {
      return reply.code(400).send({ error: 'Parámetros take/cursor inválidos' });
    }
    try {
      const params = {
        continent: request.query.continent,
        country: request.query.country,
        status: request.query.status,
        take,
        cursor,
      };
      return reply.send(await tickZeroCached('public:world:leagues', params, () => publicService.getWorldLeagues(params)));
    } catch {
      return reply.code(500).send({ error: 'No se pudieron cargar las ligas' });
    }
  });

  app.get<{ Params: { id: string } }>('/world/leagues/:id', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const leagueId = parseInt(request.params.id);
    if (isNaN(leagueId) || leagueId <= 0) return reply.code(400).send({ error: 'ID de liga inválido' });
    try {
      const data = await publicService.getWorldLeague(leagueId);
      if (!data) return reply.code(404).send({ error: 'Liga no encontrada' });
      return reply.send(data);
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar la liga' });
    }
  });

  app.get<{
    Querystring: { league?: string; country?: string; take?: string };
  }>('/world/clubs/available', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const league = request.query.league ? parseInt(request.query.league) : undefined;
    const take = request.query.take ? parseInt(request.query.take) : undefined;
    if ((request.query.league && (isNaN(league!) || league! <= 0)) || (request.query.take && (isNaN(take!) || take! <= 0))) {
      return reply.code(400).send({ error: 'Parámetros league/take inválidos' });
    }
    try {
      return reply.send(await publicService.getAvailableWorldClubs({
        league,
        country: request.query.country,
        take,
      }));
    } catch {
      return reply.code(500).send({ error: 'No se pudieron cargar clubes libres' });
    }
  });

  app.get<{ Params: { id: string } }>('/world/clubs/:id', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const clubId = parseInt(request.params.id);
    if (isNaN(clubId) || clubId <= 0) return reply.code(400).send({ error: 'ID de club inválido' });
    try {
      return reply.send(await publicService.getWorldClub(clubId));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>('/player/:id', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const playerId = parseInt(request.params.id);
    if (isNaN(playerId) || playerId <= 0) return reply.code(400).send({ error: 'ID de jugador inválido' });
    try {
      return reply.send(await publicService.getPublicPlayerFicha(playerId));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>('/manager/:id', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const managerId = parseInt(request.params.id);
    if (isNaN(managerId) || managerId <= 0) return reply.code(400).send({ error: 'ID de mánager inválido' });
    try {
      return reply.send(await publicService.getPublicManagerFicha(managerId));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  app.get<{ Params: { id: string } }>('/npc-coach/:id', { config: SOFT_RATE_LIMIT }, async (request, reply) => {
    const npcCoachId = request.params.id.trim();
    if (!npcCoachId) return reply.code(400).send({ error: 'ID de entrenador NPC inválido' });
    try {
      return reply.send(await publicService.getPublicNpcCoach(npcCoachId));
    } catch (e: any) {
      return reply.code(404).send({ error: e.message });
    }
  });

  // ─── Q25 · GET /api/public/matches/featured ─────────────────────────────────
  app.get('/matches/featured', { config: SOFT_RATE_LIMIT }, async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('public:matches:featured', {}, () => publicService.getFeaturedMatches()));
    } catch {
      return reply.code(500).send({ error: 'No se pudieron cargar los partidos destacados' });
    }
  });

  // ─── QW-1 · GET /api/public/ticker ──────────────────────────────────────────
  app.get('/ticker', { config: SOFT_RATE_LIMIT }, async (_request, reply) => {
    try {
      return reply.send(await tickZeroCached('public:ticker', {}, () => publicService.getTicker()));
    } catch {
      return reply.code(500).send({ error: 'No se pudo cargar la última hora' });
    }
  });
}
