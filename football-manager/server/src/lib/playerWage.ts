// ─── Salario de jugador: helper canónico (AUDIT 1.2) ─────────────────────────
//
// PROPIETARIO: Agente A. Antes la fórmula del salario mensual estaba copiada
// (idéntica o con variantes divergentes) en club / market / negotiations /
// auctions / transfer.core / advisor / academy, y algunos call-sites leían
// `player.salary` y otros `player.wage`, dando masas salariales distintas según
// el submódulo. Este helper fija la fórmula UNA sola vez.
//
// Invariante de datos (confirmado en auditoría): al firmar/renovar se escriben
// SIEMPRE ambos campos al mismo valor (`wage === salary`). `wage` es la fuente de
// verdad; `salary` es el espejo/legado y actúa de fallback para filas antiguas en
// las que `wage` pudiera ser null.
//
// IMPORTANTE para los consumidores: el `select` de Prisma debe incluir AMBOS
// campos — `select: { salary: true, wage: true }` — o `wage` llegará undefined y
// el fallback se activará por error.

export type PlayerWageInput = { wage?: number | null; salary: number };

/** Salario mensual canónico de un jugador (entero). */
export function playerWage(player: PlayerWageInput): number {
  return Math.round(Number(player.wage ?? player.salary) || player.salary);
}
