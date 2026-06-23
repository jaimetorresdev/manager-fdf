// src/lib/format.ts — Helpers de formato centralizados (issue A8).
// Único origen de verdad para eur()/fmtMoney()/num()/fmtTime().
// Reemplaza las copias dispersas en páginas/componentes de gestión.
// Firma estable: cambios SOLO aditivos (otros carriles consumen estas firmas).

/**
 * Importe en euros compacto y defensivo: 1.5M€ · 250K€ · 800€ · — (si null/NaN).
 * @example eur(1500000) // "1.5M€"
 */
export function eur(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M€`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K€`;
  return `${Math.round(n)}€`;
}

/** Alias semántico de eur() para callsites que hablaban de "money". */
export const fmtMoney = eur;

/**
 * Normaliza la entrada de un campo numérico a un entero/decimal >= 0.
 * Útil para inputs controlados (Number('') -> NaN -> 0).
 * @example num('1500') // 1500 ; num('') // 0
 */
export function num(v: string | number | null | undefined): number {
  return Math.max(0, Number(v) || 0);
}

/**
 * Fecha in-game legible: "03 ene 2029". Devuelve '—' si no hay fecha válida.
 */
export function fmtGameDate(s?: string | number | Date | null, locale = 'es-ES'): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Fecha/hora local es-ES corta: "14 jun, 23:00". Devuelve '' si no hay fecha válida.
 * @example fmtTime('2026-06-14T23:00:00Z')
 */
export function fmtTime(s?: string | number | Date | null): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
