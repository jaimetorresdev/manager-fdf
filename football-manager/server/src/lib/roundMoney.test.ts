import { describe, expect, it } from 'vitest';
import { toCents, fromCents, roundMoney } from './roundMoney';

describe('roundMoney / toCents / fromCents (AUDIT 1.1 — sin deriva)', () => {
  it('roundMoney = fromCents∘toCents por construcción', () => {
    for (const x of [0, 0.1, 1.005, 1234.56, -42.42, 999999.99, 500_000_000]) {
      expect(roundMoney(x)).toBe(fromCents(toCents(x)));
    }
  });

  it('round-trip exacto para importes representables en céntimos', () => {
    const samples = [0, 0.01, 0.1, 1, 2.5, 1999.99, 2000, 1234567.89, 500_000, 5_000_000];
    for (const x of samples) {
      expect(fromCents(toCents(x))).toBe(x);
    }
  });

  it('idempotencia: cuantizar dos veces no cambia el valor', () => {
    for (const x of [0.1, 0.2, 0.3, 33.33, 66.67, 1234.56, -9.99]) {
      const once = toCents(x);
      expect(toCents(fromCents(once))).toBe(once);
      expect(roundMoney(roundMoney(x))).toBe(roundMoney(x));
    }
  });

  it('toCents devuelve siempre un entero', () => {
    for (const x of [0.1, 0.29, 1.005, 99.995, 1234.561, -7.7]) {
      expect(Number.isInteger(toCents(x))).toBe(true);
    }
  });

  it('NO deriva al ACUMULAR muchos importes fraccionarios (el bug 1.1)', () => {
    // Sumar 0.1 mil veces en float deriva; en céntimos enteros es exacto.
    const naive = Array.from({ length: 1000 }, () => 0.1).reduce((a, b) => a + b, 0);
    expect(naive).not.toBe(100); // demuestra la deriva de la suma float

    let cents = 0;
    for (let i = 0; i < 1000; i++) cents += toCents(0.1);
    expect(cents).toBe(10_000); // 1000 * 10 céntimos, exacto
    expect(fromCents(cents)).toBe(100); // 100.00 exacto, sin deriva
  });

  it('una cadena de operaciones económicas cuadra exactamente en céntimos', () => {
    // income/expenses/transfers con porcentajes fraccionarios típicos de economía.
    const income = [1_250_000.5, 333_333.33, 12.01, 87_654.32];
    const expenses = [420_000.99, 99_999.01, 7.77];
    const tvShare = 1_000_000 * 0.135; // 135000 exacto pero forzamos el camino céntimos

    let balance = 0;
    for (const v of income) balance += toCents(v);
    for (const v of expenses) balance -= toCents(v);
    balance += toCents(tvShare);

    const expectedCents =
      [...income].reduce((a, v) => a + Math.round(v * 100), 0)
      - [...expenses].reduce((a, v) => a + Math.round(v * 100), 0)
      + Math.round(tvShare * 100);

    expect(balance).toBe(expectedCents);
    // El resultado convertido es estable bajo re-cuantización (no deriva acumulada).
    const out = fromCents(balance);
    expect(roundMoney(out)).toBe(out);
    expect(toCents(out)).toBe(balance);
  });

  it('preserva precisión en presupuestos grandes (dentro de 2^53)', () => {
    const big = 500_000_000; // 5·10^8 unidades → 5·10^10 céntimos, << 2^53
    expect(toCents(big)).toBe(50_000_000_000);
    expect(fromCents(toCents(big))).toBe(big);
    // suma de 10.000 transferencias de 12.345,67 sin deriva
    let cents = 0;
    for (let i = 0; i < 10_000; i++) cents += toCents(12_345.67);
    expect(cents).toBe(10_000 * 1_234_567);
    expect(fromCents(cents)).toBe(123_456_700);
  });

  it('normaliza valores no finitos a 0 (no propaga NaN/Infinity a la BD)', () => {
    expect(toCents(Number.NaN)).toBe(0);
    expect(toCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(fromCents(Number.NaN)).toBe(0);
    expect(roundMoney(Number.NaN)).toBe(0);
  });

  it('maneja importes negativos (deudas/decrementos) simétricamente', () => {
    expect(toCents(-1.1)).toBe(-110);
    expect(fromCents(-110)).toBe(-1.1);
    expect(roundMoney(-0.005)).toBe(fromCents(toCents(-0.005)));
  });

  it('serialización JSON: el importe cuantizado sobrevive a un round-trip', () => {
    const amounts = [0, 0.1, 1.05, 1234.56, 80_000_000, -42.42];
    for (const a of amounts) {
      const q = roundMoney(a);
      const restored = JSON.parse(JSON.stringify({ v: q })).v;
      expect(restored).toBe(q);
      // y re-cuantizar tras deserializar es idempotente (sin deriva por el viaje).
      expect(roundMoney(restored)).toBe(q);
    }
  });

  it('increment/decrement contable: aplicar y revertir vuelve al origen exacto', () => {
    let cents = toCents(1_000_000); // saldo inicial en céntimos
    cents += toCents(2_100_000.55); // premio
    cents -= toCents(2_100_000.55); // reverso
    expect(fromCents(cents)).toBe(1_000_000);
  });
});
