import { describe, expect, it, vi } from 'vitest';
import {
  resolvePrivilegedPassword,
  resolveStaffPassword,
  isWeakPrivilegedPassword,
  minPrivilegedPasswordLength,
  WeakPrivilegedPasswordError,
  type StaffRole,
} from './privilegedPassword';

// AUDIT H-50 — validación canónica compartida por seed.ts y ensure-roles.ts.
// La regla: cuentas privilegiadas (master/admin/agente_fifa) rechazan contraseñas
// débiles; en producción aborta, en desarrollo omite la creación.

const PRIVILEGED: StaffRole[] = ['master', 'admin', 'agente_fifa'];
const STRONG = 'Zx9$kLmQp2!vWn7_aB'; // 18 chars, no trivial

describe('isWeakPrivilegedPassword', () => {
  it('exige 16+ en prod y 8+ en dev', () => {
    expect(minPrivilegedPasswordLength(true)).toBe(16);
    expect(minPrivilegedPasswordLength(false)).toBe(8);
    expect(isWeakPrivilegedPassword('abcdefgh', false)).toBe(false); // 8 ok en dev
    expect(isWeakPrivilegedPassword('abcdefgh', true)).toBe(true); // <16 en prod
    expect(isWeakPrivilegedPassword(STRONG, true)).toBe(false);
  });

  it('rechaza las triviales del .env de auditoría (master123/admin123/fifa123)', () => {
    for (const w of ['master123', 'admin123', 'fifa123', 'demo123', 'password', 'ADMIN123']) {
      expect(isWeakPrivilegedPassword(w, false)).toBe(true);
    }
  });
});

describe('resolvePrivilegedPassword (núcleo puro)', () => {
  it.each(PRIVILEGED)('PROD + débil para %s → lanza WeakPrivilegedPasswordError', (role) => {
    expect(() =>
      resolvePrivilegedPassword({ label: role, role, value: 'admin123', isProd: true }),
    ).toThrow(WeakPrivilegedPasswordError);
  });

  it.each(PRIVILEGED)('DEV + débil para %s → weak-skipped (no crea)', (role) => {
    const out = resolvePrivilegedPassword({ label: role, role, value: 'admin123', isProd: false });
    expect(out.status).toBe('weak-skipped');
  });

  it.each(PRIVILEGED)('contraseña fuerte para %s → ok', (role) => {
    const out = resolvePrivilegedPassword({ label: role, role, value: STRONG, isProd: true });
    expect(out).toEqual({ status: 'ok', password: STRONG });
  });

  it.each(PRIVILEGED)('ausente para %s → missing', (role) => {
    expect(resolvePrivilegedPassword({ label: role, role, value: undefined, isProd: true }).status).toBe('missing');
    expect(resolvePrivilegedPassword({ label: role, role, value: '', isProd: false }).status).toBe('missing');
  });

  it('cuenta NO privilegiada (manager) acepta contraseña corta (solo presencia)', () => {
    const out = resolvePrivilegedPassword({ label: 'demo', role: 'manager', value: 'demo123', isProd: true });
    expect(out).toEqual({ status: 'ok', password: 'demo123' });
  });

  it('no filtra la contraseña en el mensaje de error', () => {
    try {
      resolvePrivilegedPassword({ label: 'Master', role: 'master', value: 'master123', isProd: true });
      throw new Error('debió lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(WeakPrivilegedPasswordError);
      expect((e as Error).message).not.toContain('master123');
    }
  });
});

describe('resolveStaffPassword (orquestador con env inyectable)', () => {
  it('PROD + MASTER_PASSWORD débil → aborta (throw)', () => {
    expect(() =>
      resolveStaffPassword({
        label: 'Master',
        envKey: 'MASTER_PASSWORD',
        role: 'master',
        isProd: true,
        env: { MASTER_PASSWORD: 'master123' } as NodeJS.ProcessEnv,
        warn: () => {},
      }),
    ).toThrow(WeakPrivilegedPasswordError);
  });

  it('DEV + ADMIN_PASSWORD débil → null + warn (omite)', () => {
    const warn = vi.fn();
    const pw = resolveStaffPassword({
      label: 'Admin',
      envKey: 'ADMIN_PASSWORD',
      role: 'admin',
      isProd: false,
      env: { ADMIN_PASSWORD: 'admin123' } as NodeJS.ProcessEnv,
      warn,
    });
    expect(pw).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('FIFA_PASSWORD fuerte → devuelve la contraseña', () => {
    const pw = resolveStaffPassword({
      label: 'Agente FIFA',
      envKey: 'FIFA_PASSWORD',
      role: 'agente_fifa',
      isProd: true,
      env: { FIFA_PASSWORD: STRONG } as NodeJS.ProcessEnv,
      warn: () => {},
    });
    expect(pw).toBe(STRONG);
  });

  it('ausente → null + warn (no crea, no aborta)', () => {
    const warn = vi.fn();
    const pw = resolveStaffPassword({
      label: 'Master',
      envKey: 'MASTER_PASSWORD',
      role: 'master',
      isProd: true,
      env: {} as NodeJS.ProcessEnv,
      warn,
    });
    expect(pw).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
  });
});
