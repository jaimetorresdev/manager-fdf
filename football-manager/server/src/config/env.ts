// ─── Environment Config ───────────────────────────────────────────────────────
// Single source of truth for all env vars. Fail fast in production.

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDev = nodeEnv === 'development';
const isVitest = nodeEnv === 'test' && (process.env.VITEST === 'true' || Boolean(process.env.VITEST_WORKER_ID));
const DEV_JWT_SECRET = 'dev-only-fdf-manager-secret';

function requiredEnv(key: string): string {
  const val = process.env[key];
  if (val) return val;
  throw new Error(`Falta la variable de entorno obligatoria: ${key}`);
}

function devOnlyEnv(key: string, fallback: string): string {
  const val = process.env[key];
  if (val) return val;
  if (isDev || isVitest) return fallback;
  return requiredEnv(key);
}

function jwtSecretEnv(): string {
  const secret = devOnlyEnv('JWT_SECRET', DEV_JWT_SECRET);
  if (!isDev && !isVitest && secret === DEV_JWT_SECRET) {
    throw new Error('JWT_SECRET no puede usar el fallback de desarrollo fuera de NODE_ENV=development');
  }
  if (!isDev && !isVitest && secret.length < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres fuera de NODE_ENV=development');
  }
  return secret;
}

function isPrivateEngineUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === 'engine'
      || host === 'localhost'
      || host === '127.0.0.1'
      || host === '::1'
      || host.endsWith('.internal');
  } catch {
    return false;
  }
}

function engineApiKeyEnv(): string {
  const engineUrl = process.env.ENGINE_URL?.trim();
  const key = process.env.ENGINE_API_KEY?.trim() ?? '';
  if (!isDev && !isVitest && engineUrl && !isPrivateEngineUrl(engineUrl) && !key) {
    throw new Error('ENGINE_API_KEY es obligatoria cuando ENGINE_URL apunta a un motor externo');
  }
  if (!isDev && !isVitest && key && key.length < 32) {
    throw new Error('ENGINE_API_KEY debe tener al menos 32 caracteres fuera de NODE_ENV=development');
  }
  return key;
}

// AUDIT 5.9-7: en desarrollo el CORS era `origin: true`, que REFLEJA cualquier origen
// y con `credentials: true` permite que cualquier web envíe peticiones autenticadas si
// la instancia dev queda accesible. Ahora, incluso en dev, se restringe a localhost /
// 127.0.0.1 / [::1] (cualquier puerto) además de los orígenes configurados. En
// producción solo se permiten los orígenes de `CORS_ORIGINS`.
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function corsOriginResolver(
  allowlist: string[],
  dev: boolean,
): (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => void {
  return (origin, cb) => {
    // Peticiones sin Origin (curl, apps nativas, same-origin) se permiten.
    if (!origin) return cb(null, true);
    if (allowlist.includes(origin)) return cb(null, true);
    if (dev && DEV_ORIGIN_RE.test(origin)) return cb(null, true);
    return cb(null, false);
  };
}

export const env = {
  port:       parseInt(process.env.API_PORT ?? process.env.PORT ?? '3001', 10),
  nodeEnv,
  jwtSecret:  jwtSecretEnv(),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174,http://localhost:3000,http://localhost:8080')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
  isDev,
  tickEnabled: process.env.TICK_ENABLED !== 'false',
  engineUrl: process.env.ENGINE_URL?.trim() || '',
  engineApiKey: engineApiKeyEnv(),
  allowLegacyWsTokenQuery: isDev && process.env.WS_ALLOW_LEGACY_QUERY_TOKEN !== 'false',
} as const;
