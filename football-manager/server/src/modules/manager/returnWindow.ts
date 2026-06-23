// ─── Regla de "regreso a equipo" (manual §3) ─────────────────────────────────
// "Regreso a equipo (jul-dic sí / ene-jun no si jugó)". Un mánager puede volver a un
// club en la primera mitad de temporada (jul-dic) sin restricción; en la segunda
// (ene-jun) solo si NO ha dirigido (jugado) ya esa temporada.

export interface ReturnDecision {
  allowed: boolean;
  reason: string | null;
  window: 'open' | 'restricted';
}

/** Lógica pura: dado el mes in-game y si ya jugó esta temporada, decide el regreso. */
export function returnWindowAllows(inGameDate: Date, hasPlayedThisSeason: boolean): ReturnDecision {
  const month = inGameDate.getUTCMonth(); // 0 = enero … 11 = diciembre
  const inFirstHalf = month >= 6; // jul(6)-dic(11)
  if (inFirstHalf) {
    return { allowed: true, reason: null, window: 'open' };
  }
  // ene-jun: bloqueado si ya dirigió esta temporada.
  if (hasPlayedThisSeason) {
    return {
      allowed: false,
      window: 'restricted',
      reason: 'No puedes regresar a un club entre enero y junio si ya has dirigido esta temporada.',
    };
  }
  return { allowed: true, reason: null, window: 'restricted' };
}
