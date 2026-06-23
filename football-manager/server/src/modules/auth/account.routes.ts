// ─── Account Routes (Q22 · avatar subible) ───────────────────────────────────
// POST  /api/account/avatar   — sube la foto de perfil (base64/dataURL, ≤512KB)
// DELETE /api/account/avatar  — vuelve al avatar procedural (avatarSeed)
// La lectura pública vive en GET /api/public/avatar/:managerId (public.routes).
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/auth';

const MAX_AVATAR_BYTES = 512 * 1024; // 512KB

const uploadSchema = z.object({
  image: z.string().min(1, 'falta la imagen'),
  mime: z.string().optional(),
});

/** Detección REAL del formato por magic bytes (no nos fiamos del mime declarado). */
export function sniffImageMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'image/png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
}

/** Extrae el base64 (con o sin prefijo dataURL) y lo decodifica con validación. */
function decodeImage(image: string): { buf: Buffer; declaredMime: string | null } | { error: string } {
  let base64 = image.trim();
  let declaredMime: string | null = null;
  const dataUrlMatch = /^data:([a-z0-9.+/-]+);base64,(.+)$/is.exec(base64);
  if (dataUrlMatch) {
    declaredMime = dataUrlMatch[1].toLowerCase();
    base64 = dataUrlMatch[2];
  }
  base64 = base64.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    return { error: 'Avatar no válido (image): base64 corrupto' };
  }
  const buf = Buffer.from(base64, 'base64');
  if (buf.length === 0) return { error: 'Avatar no válido (image): base64 corrupto' };
  return { buf, declaredMime };
}

export async function accountRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // POST /api/account/avatar — body { image: dataURL|base64, mime? }
  app.post('/avatar', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    // base64 de 512KB ≈ 683KB; margen sobre el bodyLimit por si llega con prefijo dataURL.
    bodyLimit: 1024 * 1024,
  }, async (request, reply) => {
    const parsed = uploadSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Avatar no válido (image): falta la imagen' });
    }

    const decoded = decodeImage(parsed.data.image);
    if ('error' in decoded) return reply.code(400).send({ error: decoded.error });

    if (decoded.buf.length > MAX_AVATAR_BYTES) {
      const kb = Math.ceil(decoded.buf.length / 1024);
      return reply.code(400).send({
        error: `Avatar no válido (image): la imagen supera el máximo de 512KB (tiene ${kb} KB)`,
      });
    }

    const declared = (parsed.data.mime ?? decoded.declaredMime)?.toLowerCase() ?? null;
    if (declared && !['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(declared)) {
      return reply.code(400).send({
        error: 'Avatar no válido (mime): formato no soportado, usa JPEG, PNG o WebP',
      });
    }

    const realMime = sniffImageMime(decoded.buf);
    if (!realMime) {
      return reply.code(400).send({
        error: 'Avatar no válido (image): el contenido no coincide con un JPEG/PNG/WebP real',
      });
    }

    try {
      const manager = await prisma.manager.update({
        where: { id: request.user.managerId },
        data: { avatarImage: decoded.buf, avatarImageMime: realMime },
        select: { id: true },
      });
      return reply.send({
        ok: true,
        mime: realMime,
        size: decoded.buf.length,
        avatarUrl: `/api/public/avatar/${manager.id}?v=${Date.now()}`,
      });
    } catch {
      return reply.code(400).send({ error: 'No se pudo guardar el avatar' });
    }
  });

  // DELETE /api/account/avatar — vuelve al procedural
  app.delete('/avatar', async (request, reply) => {
    try {
      const manager = await prisma.manager.update({
        where: { id: request.user.managerId },
        data: { avatarImage: null, avatarImageMime: null },
        select: { avatarSeed: true },
      });
      return reply.send({ ok: true, avatar: 'procedural', avatarSeed: manager.avatarSeed });
    } catch {
      return reply.code(400).send({ error: 'No se pudo restablecer el avatar' });
    }
  });
}
