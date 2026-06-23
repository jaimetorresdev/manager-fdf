// ─── Validación canónica de contraseñas privilegiadas ───────────────────────────
// AUDIT H-50. Fuente ÚNICA de verdad para validar las contraseñas de las cuentas
// privilegiadas de staff (master / admin / agente_fifa). La consumen TANTO el seed
// principal (`db/seed.ts`) COMO `db/ensure-roles.ts`; ninguno reimplementa la regla.
//
// Política:
//   • Cuenta privilegiada (master/admin/agente_fifa):
//       – contraseña ausente            → no se crea (warn); en prod tampoco (sin default).
//       – contraseña débil (corta/trivial):
//             · producción  → ABORTA (throw WeakPrivilegedPasswordError).
//             · desarrollo   → OMITE la creación (warn) y devuelve null.
//   • Cuenta NO privilegiada (demo/manager): solo se exige presencia.
//
// Nunca registra ni devuelve la contraseña en los mensajes (no se filtran secretos).

export type StaffRole = 'master' | 'admin' | 'agente_fifa' | 'manager';

export class WeakPrivilegedPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WeakPrivilegedPasswordError';
  }
}

// Contraseñas triviales rechazadas de plano para cuentas privilegiadas, además del
// mínimo de longitud. Se comparan en minúsculas. Incluye las que aparecían en el
// `.env` de desarrollo (master123 / admin123) detectadas por la auditoría.
export const WEAK_PRIVILEGED_PASSWORDS: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'password', 'passwd', 'master', 'fifa', 'demo', 'changeme',
  'change-me', '123456', '12345678', '123456789', 'admin123', 'master123', 'fifa123',
  'demo123', 'qwerty', 'letmein', 'secret', 'root', 'football', 'manager', 'managerfdf',
]);

export function minPrivilegedPasswordLength(isProd: boolean): number {
  // En producción exigimos 16+; en desarrollo un mínimo razonable de 8.
  return isProd ? 16 : 8;
}

/**
 * ¿Es débil esta contraseña para una cuenta privilegiada?
 * Débil = más corta que el mínimo, O presente en la lista de triviales (case-insensitive).
 */
export function isWeakPrivilegedPassword(value: string, isProd: boolean): boolean {
  if (value.length < minPrivilegedPasswordLength(isProd)) return true;
  return WEAK_PRIVILEGED_PASSWORDS.has(value.toLowerCase());
}

export type ResolveOutcome =
  | { status: 'ok'; password: string }
  | { status: 'missing' }
  | { status: 'weak-skipped' };

/**
 * Núcleo PURO (sin process.env, sin I/O) para que sea trivial de testear.
 * Decide el destino de una contraseña de cuenta según su rol y el entorno.
 *
 * - privileged && weak && prod → lanza WeakPrivilegedPasswordError.
 * - privileged && weak && dev  → { status: 'weak-skipped' }.
 * - ausente/vacía              → { status: 'missing' }.
 * - válida                     → { status: 'ok', password }.
 */
export function resolvePrivilegedPassword(opts: {
  label: string;
  role: StaffRole;
  value: string | undefined | null;
  isProd: boolean;
}): ResolveOutcome {
  const { label, role, value, isProd } = opts;
  if (!value) return { status: 'missing' };

  const privileged = role !== 'manager';
  if (privileged && isWeakPrivilegedPassword(value, isProd)) {
    const msg =
      `${label}: la contraseña configurada es demasiado débil (mínimo ` +
      `${minPrivilegedPasswordLength(isProd)} caracteres y no trivial) para una cuenta ` +
      `privilegiada (${role}).`;
    if (isProd) {
      throw new WeakPrivilegedPasswordError(`${msg} Abortando creación.`);
    }
    return { status: 'weak-skipped' };
  }

  return { status: 'ok', password: value };
}

/**
 * Orquestador con efectos (lee env, registra avisos) usado por seed/ensure-roles.
 * Devuelve la contraseña válida o null si no debe crearse la cuenta. En producción,
 * una contraseña privilegiada débil propaga WeakPrivilegedPasswordError (aborta).
 *
 * Inyectable (`env`, `warn`, `isProd`) para tests deterministas.
 */
export function resolveStaffPassword(opts: {
  label: string;
  envKey: string;
  role: StaffRole;
  env?: NodeJS.ProcessEnv;
  isProd?: boolean;
  warn?: (msg: string) => void;
}): string | null {
  const env = opts.env ?? process.env;
  const isProd = opts.isProd ?? env.NODE_ENV === 'production';
  const warn = opts.warn ?? ((m: string) => console.warn(m));

  const outcome = resolvePrivilegedPassword({
    label: opts.label,
    role: opts.role,
    value: env[opts.envKey],
    isProd,
  });

  switch (outcome.status) {
    case 'ok':
      return outcome.password;
    case 'missing': {
      const scope = isProd ? 'producción' : 'este entorno';
      warn(`  ⚠️ ${opts.label}: falta ${opts.envKey}; no se crea la cuenta en ${scope}.`);
      return null;
    }
    case 'weak-skipped':
      warn(
        `  ⚠️ ${opts.label}: ${opts.envKey} es demasiado débil para una cuenta ` +
          `privilegiada; no se crea la cuenta en desarrollo.`,
      );
      return null;
  }
}
