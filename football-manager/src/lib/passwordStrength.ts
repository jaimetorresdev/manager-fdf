export type PasswordStrength = 'empty' | 'weak' | 'fair' | 'good' | 'strong';

export interface PasswordCheck {
  key:   string;
  label: string;
  met:   boolean;
}


export function getPasswordChecks(password: string, labels?: Record<string, string>): PasswordCheck[] {
  const defaults: Record<string, string> = {
    length:  'Mínimo 8 caracteres',
    lower:   'Una letra minúscula',
    upper:   'Una letra mayúscula',
    digit:   'Un número',
    special: 'Un símbolo (!@#$…)',
  };
  const L = { ...defaults, ...labels };
  return [
    { key: 'length',  label: L.length,  met: password.length >= 8 },
    { key: 'lower',   label: L.lower,   met: /[a-z]/.test(password) },
    { key: 'upper',   label: L.upper,   met: /[A-Z]/.test(password) },
    { key: 'digit',   label: L.digit,   met: /\d/.test(password) },
    { key: 'special', label: L.special, met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return 'empty';
  const met = getPasswordChecks(password).filter((c) => c.met).length;
  if (met <= 2) return 'weak';
  if (met === 3) return 'fair';
  if (met === 4) return 'good';
  return 'strong';
}

/** Mínimo: 8 caracteres + al menos 2 criterios extra (mayúscula, número, etc.) */
export function isPasswordAcceptable(password: string): boolean {
  const checks = getPasswordChecks(password);
  const met    = checks.filter((c) => c.met).length;
  return checks[0].met && met >= 3;
}

export const STRENGTH_COLORS: Record<Exclude<PasswordStrength, 'empty'>, string> = {
  weak:   'var(--red-danger)',
  fair:   'var(--gold-accent)',
  good:   'var(--blue-info)',
  strong: 'var(--green-primary)',
};

export const STRENGTH_SEGMENTS: Record<Exclude<PasswordStrength, 'empty'>, number> = {
  weak:   1,
  fair:   2,
  good:   3,
  strong: 4,
};
