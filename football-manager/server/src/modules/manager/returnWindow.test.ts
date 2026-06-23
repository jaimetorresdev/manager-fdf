import { describe, it, expect } from 'vitest';
import { returnWindowAllows } from './returnWindow';

const d = (iso: string) => new Date(iso);

describe('returnWindowAllows (manual §3 — regreso a equipo)', () => {
  it('jul-dic: siempre permitido, haya jugado o no', () => {
    expect(returnWindowAllows(d('2026-08-15T00:00:00Z'), true).allowed).toBe(true);
    expect(returnWindowAllows(d('2026-12-01T00:00:00Z'), false).allowed).toBe(true);
    expect(returnWindowAllows(d('2026-08-15T00:00:00Z'), true).window).toBe('open');
  });

  it('ene-jun: bloqueado si ya dirigió esta temporada', () => {
    const r = returnWindowAllows(d('2026-03-10T00:00:00Z'), true);
    expect(r.allowed).toBe(false);
    expect(r.window).toBe('restricted');
    expect(r.reason).toMatch(/enero y junio/);
  });

  it('ene-jun: permitido si NO ha dirigido esta temporada', () => {
    expect(returnWindowAllows(d('2026-03-10T00:00:00Z'), false).allowed).toBe(true);
  });

  it('límites de mes (junio = restringido, julio = abierto)', () => {
    expect(returnWindowAllows(d('2026-06-30T00:00:00Z'), true).allowed).toBe(false);
    expect(returnWindowAllows(d('2026-07-01T00:00:00Z'), true).allowed).toBe(true);
  });
});
