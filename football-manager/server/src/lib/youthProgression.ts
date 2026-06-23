// ─── Derivación determinista del potencial del canterano ─────────────────────
//
// AUDIT 5.5 / cross-request [C → A]: la promoción MANUAL (academy.service) usaba
// `talent + rand(5,20)` (no determinista) mientras la AUTO-promoción del tick
// (game.service.ts:2427, territorio C) usa `Math.min(99, talent + 15)`. Eso hacía
// que el mismo canterano tuviera potenciales distintos según la vía de promoción y
// que el resultado no fuera reproducible.
//
// Fuente de verdad única y determinista para ambas vías. C debe importar
// `youthPotential` en la auto-promoción para eliminar el `talent + 15` inline.

/** Potencial al promocionar un canterano. Determinista (sin RNG), tope 99. */
export function youthPotential(talent: number): number {
  return Math.min(99, Math.max(1, Math.round(talent) + 15));
}
