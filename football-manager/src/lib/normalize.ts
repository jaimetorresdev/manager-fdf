// ─── Normalización defensiva de respuestas del backend ────────────────────────
// Centraliza el endurecimiento de listas: nunca asumir que algo es un array, y
// deduplicar por clave (los endpoints a veces devuelven repetidos).

/** Garantiza un array: acepta array directo o {data:[...]} / {items:[...]}; si no, []. */
export function asArray<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(o[k])) return o[k] as T[];
    }
  }
  return [];
}

/** JSON.parse con try/catch — devuelve undefined si el texto no es JSON válido. */
export function parseJson<T = unknown>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/** Quita duplicados conservando el primero, por la clave que devuelva keyFn. */
export function dedupeBy<T>(arr: T[], keyFn: (item: T) => string | number): T[] {
  const seen = new Set<string | number>();
  const out: T[] = [];
  for (const item of asArray<T>(arr)) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k); out.push(item);
  }
  return out;
}
