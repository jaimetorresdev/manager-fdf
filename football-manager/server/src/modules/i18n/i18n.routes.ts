import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { normalizeLocale, SERVER_STRINGS, SUPPORTED_SERVER_LOCALES } from './serverStrings';

export async function i18nRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get('/server', async (request, reply) => {
    const query = z.object({ locale: z.string().optional() }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid query' });
    const locale = normalizeLocale(query.data.locale);
    // AUDIT i18n: los 5 locales soportados tienen traducción propia. El fallback solo
    // cubre claves puntuales que faltaran (serverT cae a `es`), no idiomas completos.
    return reply.send({
      locale,
      supported: SUPPORTED_SERVER_LOCALES,
      strings: SERVER_STRINGS[locale],
      fallbackLocale: locale === 'es' ? null : 'es',
    });
  });
}
