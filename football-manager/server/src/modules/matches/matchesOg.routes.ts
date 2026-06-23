// ─── N4-1 · Ruta pública de la tarjeta OG ─────────────────────────────────────
// Se registra como plugin SEPARADO bajo el prefijo `/api/matches` (sin el hook
// `authenticate` de `matchesRoutes`) para que sea accesible por crawlers sociales
// sin token. El path `/:id/og-image` no colisiona con ninguna ruta de
// `matchesRoutes`. Solo expone datos no sensibles y respeta E15 (ver og.service).
import { FastifyInstance, FastifyRequest } from 'fastify';
import { buildMatchOgCard, buildOgHtml } from './og.service';

const OG_RATE_LIMIT = { rateLimit: { max: 60, timeWindow: '1 minute' } };

function positiveInt(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function requestOrigin(request: FastifyRequest): string {
  const fwdProto = (request.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim();
  const fwdHost = (request.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim();
  const proto = fwdProto || request.protocol || 'https';
  const host = fwdHost || request.headers.host;
  return host ? `${proto}://${host}` : '';
}

export async function matchesOgRoutes(app: FastifyInstance) {
  // PÚBLICO (sin auth). `?format=html` → página con metadatos OpenGraph; por
  // defecto → imagen SVG (1200×630) consumida por `matchesApi.tryOgImage`.
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    '/:id/og-image',
    { config: OG_RATE_LIMIT },
    async (request, reply) => {
      const matchId = positiveInt(request.params.id);
      if (!matchId) return reply.code(400).send({ error: 'ID de partido no válido' });
      try {
        const card = await buildMatchOgCard(matchId);
        if (!card) return reply.code(404).send({ error: 'Partido no encontrado' });

        if ((request.query.format ?? '').toLowerCase() === 'html') {
          return reply
            .header('Content-Type', 'text/html; charset=utf-8')
            .header('Cache-Control', 'public, max-age=300')
            .send(buildOgHtml(card, requestOrigin(request)));
        }
        return reply
          .header('Content-Type', 'image/svg+xml; charset=utf-8')
          .header('Cache-Control', 'public, max-age=300')
          .header('X-Og-Match', String(matchId))
          .send(card.svg);
      } catch {
        return reply.code(500).send({ error: 'No se pudo generar la tarjeta del partido' });
      }
    },
  );
}
