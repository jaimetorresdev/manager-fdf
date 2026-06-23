import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { adminRoutes } from './admin.routes';

// AUDIT C-4 — el reset destructivo de BD por HTTP (`POST /turn/reseed`, que ejecutaba
// `npm run db:reset` vía child_process) fue ELIMINADO. Este test prueba que la ruta ya
// no se registra y que el resto de rutas admin siguen presentes (registro válido).

async function buildAdminApp() {
  const app = Fastify();
  // requireAdmin/maintenanceWriteGuard son preHandlers (no afectan al registro de rutas),
  // pero decoramos `user` por si algún hook lo lee en el arranque del plugin.
  app.decorateRequest('user', null);
  await app.register(adminRoutes);
  await app.ready();
  return app;
}

describe('admin routes — reseed destructivo eliminado (C-4)', () => {
  it('NO existe POST /turn/reseed', async () => {
    const app = await buildAdminApp();
    expect(app.hasRoute({ method: 'POST', url: '/turn/reseed' })).toBe(false);
    await app.close();
  });

  it('el registro de rutas admin sigue siendo válido (existe GET /stats)', async () => {
    const app = await buildAdminApp();
    expect(app.hasRoute({ method: 'GET', url: '/stats' })).toBe(true);
    await app.close();
  });

  it('el código fuente no contiene child_process ni la ruta reseed', async () => {
    // Guarda anti-regresión a nivel de fuente: ni el import de child_process ni la URL.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(__dirname, 'admin.routes.ts'), 'utf8');
    expect(src).not.toContain('child_process');
    expect(src).not.toContain("'/turn/reseed'");
    expect(src).not.toContain('execFile');
    // Nota: el comentario sí cita `npm run db:reset` como el comando CLI de sustitución,
    // por eso no se afirma su ausencia.
  });
});
