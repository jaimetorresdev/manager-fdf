import { describe, expect, it } from 'vitest';
import { toCents, fromCents, roundMoney, moneyToNumber } from './roundMoney';

// AUDIT H-5 — pruebas de CONSERVACIÓN DE RIQUEZA y AUSENCIA DE DERIVA.
// La defensa real contra el descuadre monetario es la cuantización a céntimos en el
// borde (cents-at-edge): la aritmética que acumula se hace en céntimos enteros, de
// modo que no hay error binario IEEE-754. Estos tests prueban el invariante con
// transferencias muchas-a-muchas y operaciones repetidas.

describe('conservación de riqueza (cents-at-edge)', () => {
  it('una transferencia A→B conserva la suma exactamente (sin deriva)', () => {
    // Simula 10.000 transferencias de importes fraccionarios entre dos cuentas.
    let a = toCents(1_000_000.0);
    let b = toCents(1_000_000.0);
    const total0 = a + b;
    const amounts = [0.01, 0.1, 1.005, 33.33, 66.67, 999.99, 0.07, 250.25];
    for (let i = 0; i < 10_000; i++) {
      const amt = toCents(amounts[i % amounts.length]);
      // mueve de a→b y luego de b→a alternando
      if (i % 2 === 0) { a -= amt; b += amt; } else { b -= amt; a += amt; }
    }
    // En céntimos enteros la suma es EXACTA en todo momento.
    expect(a + b).toBe(total0);
    // Y al volver a unidades de moneda no aparece deriva.
    expect(fromCents(a) + fromCents(b)).toBe(2_000_000);
  });

  it('reparto de un importe entre N socios conserva el total (sin crear/destruir riqueza)', () => {
    const totalUnits = 100_000.0;
    const totalCents = toCents(totalUnits);
    const shares = [0.3333, 0.3333, 0.3334]; // % que no suman exacto en float
    // Reparto por céntimos: asigna floor a cada uno y el residuo al último (sin fuga).
    const parts: number[] = shares.map((s) => Math.floor(totalCents * s));
    const assigned = parts.reduce((x, y) => x + y, 0);
    parts[parts.length - 1] += totalCents - assigned; // residuo al último
    expect(parts.reduce((x, y) => x + y, 0)).toBe(totalCents);
    expect(parts.reduce((x, y) => x + fromCents(y), 0)).toBe(totalUnits);
  });

  it('1000 ingresos+gastos mensuales no acumulan deriva en el saldo', () => {
    let cashCents = toCents(500_000.0);
    let ledger = 0;
    for (let month = 0; month < 1000; month++) {
      const income = toCents(12_345.67);
      const expense = toCents(8_901.23);
      cashCents += income - expense;
      ledger += income - expense;
    }
    expect(cashCents).toBe(toCents(500_000.0) + ledger);
    // El saldo final es exactamente representable (entero de céntimos).
    expect(fromCents(cashCents)).toBe(roundMoney(fromCents(cashCents)));
  });
});

describe('moneyToNumber (borde de salida — anti fuga de Decimal)', () => {
  it('number → mismo número cuantizado', () => {
    expect(moneyToNumber(1234.56)).toBe(1234.56);
    expect(moneyToNumber(0)).toBe(0);
  });

  it('Decimal-like (objeto con toNumber) → number cuantizado', () => {
    const decimal = { toNumber: () => 987.65 }; // simula Prisma.Decimal
    expect(moneyToNumber(decimal)).toBe(987.65);
    expect(typeof moneyToNumber(decimal)).toBe('number');
  });

  it('null/undefined → fallback (0 por defecto)', () => {
    expect(moneyToNumber(null)).toBe(0);
    expect(moneyToNumber(undefined)).toBe(0);
    expect(moneyToNumber(null, 42)).toBe(42);
  });

  it('nunca devuelve un objeto (garantía anti-fuga a la API)', () => {
    for (const v of [1, 1.5, { toNumber: () => 2.5 }, null, undefined]) {
      expect(typeof moneyToNumber(v as never)).toBe('number');
    }
  });
});
