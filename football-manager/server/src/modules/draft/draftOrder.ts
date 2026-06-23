// ─── Lógica pura del avance de turno del draft ───────────────────────────────
// AUDIT H-26: el draft era de solo-lectura. Aquí va la mecánica determinista del
// avance (round/pick) para poder testearla sin BD.

export interface DraftPosition {
  round: number;
  pick: number;
  status: 'active' | 'completed';
}

/**
 * Dado el pick actual, calcula el siguiente. Recorre los picks de una ronda en
 * orden; al agotarla pasa a la siguiente ronda; al agotar todas, marca completado.
 */
export function nextDraftPosition(
  round: number,
  pick: number,
  picksPerRound: number,
  totalRounds: number,
): DraftPosition {
  if (picksPerRound <= 0 || totalRounds <= 0) {
    return { round, pick, status: 'completed' };
  }
  if (pick < picksPerRound) {
    return { round, pick: pick + 1, status: 'active' };
  }
  if (round < totalRounds) {
    return { round: round + 1, pick: 1, status: 'active' };
  }
  return { round, pick, status: 'completed' };
}
