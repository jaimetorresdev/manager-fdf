// ─── Dinero: representación canónica (AUDIT 1.1) ─────────────────────────────
//
// PROPIETARIO: Agente A. Los demás carriles IMPORTAN estos helpers; nadie
// reimplementa el redondeo de dinero (ver docs/INTEGRATION-CONTRACT.md §3).
//
// El dinero en este código se almacena y manipula como un `number` de UNIDADES
// de moneda (p. ej. euros). El bug de deriva (AUDIT 1.1) NO proviene del tipo de
// columna sino de **persistir importes fraccionarios** y **acumular** error de
// redondeo binario (IEEE-754). Un `double` representa de forma EXACTA todo valor
// entero de céntimos hasta 2^53 (~9·10^13 unidades de moneda), muy por encima de
// cualquier presupuesto del juego; por eso la solución es:
//   1) cuantizar todo importe a céntimos enteros en el BORDE (lectura/escritura), y
//   2) hacer la aritmética que ACUMULA en céntimos enteros (suma/resta exactas).
//
// Decisión de representación (justificada, ver INTEGRATION-CONTRACT.md §6
// "Peticiones cruzadas"): en esta sesión paralela las columnas Prisma siguen
// siendo `Float`. NO se hizo un cambio de tipo a `Decimal`/`BigInt` porque las
// columnas de dinero compartidas (budget/cash/wealth/wage/salary/FinanceSnapshot.*)
// se leen y MUTAN con aritmética `number`, `Math.min/floor` y operadores Prisma
// `{ increment } / { decrement }` dentro del territorio del Agente C (game/world),
// que A no puede editar. Cambiar el tipo rompería el `tsc --noEmit` compartido
// (que compila también los archivos de C) → criterio "0 errores" inalcanzable.
// El cutover coordinado a `Decimal`/`BigInt` queda registrado como petición
// cruzada a C, con los call-sites exactos a migrar a la vez.

/**
 * Convierte un importe en unidades de moneda a un número ENTERO de céntimos.
 * Úsalo al INICIO de cualquier cálculo de dinero que acumule, para que las
 * sumas/restas sean aritmética entera exacta (sin deriva de coma flotante).
 *
 * Entrada esperada: importes con ≤2 decimales (céntimos). Valores no finitos
 * (NaN/Infinity) se normalizan a 0 para no propagar basura a la BD.
 */
export function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/**
 * Convierte céntimos enteros de vuelta a unidades de moneda (number con 2
 * decimales). Úsalo en el BORDE de salida (antes de persistir/devolver).
 */
export function fromCents(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

/**
 * Cuantiza un importe a céntimos (2 decimales). Equivale a `fromCents(toCents(x))`
 * — se define así para garantizar por construcción que ambos caminos coinciden.
 * Firma estable (retrocompatible con el `roundMoney` previo).
 */
export function roundMoney(value: number): number {
  return fromCents(toCents(value));
}

// ─── Lectura/serialización canónica de dinero en el BORDE de salida ──────────────
//
// AUDIT H-5 (contrato money — ver docs/contracts/AUDITORIA-FINAL-MONEY.md): cuando el
// cutover coordinado a `@db.Decimal(18,2)` se ejecute, los lectores recibirán objetos
// `Prisma.Decimal` en vez de `number`. La API pública DEBE seguir entregando números
// normalizados (no objetos Decimal, que `JSON.stringify` serializa como STRING). Este
// helper es la conversión única en el borde: acepta tanto el `number` actual como un
// `Decimal` (cualquier objeto con `.toNumber()`), de modo que los call-sites pueden
// adoptarlo HOY (no-op sobre `number`) y seguir siendo correctos tras el cutover.

/** Tipo estructural mínimo de un Prisma.Decimal sin importar el runtime de Prisma. */
export type DecimalLike = { toNumber(): number };

function isDecimalLike(v: unknown): v is DecimalLike {
  return typeof v === 'object' && v !== null && typeof (v as DecimalLike).toNumber === 'function';
}

/**
 * Normaliza a `number` cualquier importe monetario en el borde de salida (API/serie).
 * - `number`           → se devuelve tal cual (cuantizado defensivamente a céntimos).
 * - `Prisma.Decimal`   → `.toNumber()` (cuantizado a céntimos).
 * - `null` / `undefined` → el `fallback` (por defecto 0).
 * Garantiza que NUNCA se filtra un objeto Decimal a la respuesta pública.
 */
export function moneyToNumber(
  value: number | DecimalLike | null | undefined,
  fallback = 0,
): number {
  if (value == null) return fallback;
  const n = isDecimalLike(value) ? value.toNumber() : value;
  return roundMoney(n);
}
