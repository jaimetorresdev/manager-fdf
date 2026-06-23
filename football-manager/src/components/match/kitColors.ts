// ─── Colores de equipación para el visor 2D ────────────────────────────────────
// Deriva los colores de un club a partir de su badge (emojis 🔴⚪…) con fallback
// determinista por hash de id+nombre (misma filosofía que ui/ClubBadge).

const EMOJI_HEX: Record<string, string> = {
  '🔴': '#D32F2F', '🔵': '#1769C2', '⚪': '#E8ECF1', '⚫': '#23292F',
  '🟡': '#E0A816', '🟢': '#2E8B47', '🟣': '#7B3FBF', '🟠': '#E07012',
  '🟤': '#7A4A2B', '🩶': '#8A94A0', '🩷': '#D86CA0',
};

const FALLBACK: [string, string][] = [
  ['#D32F2F', '#E8ECF1'], ['#1769C2', '#E8ECF1'], ['#2E8B47', '#E8ECF1'],
  ['#E0A816', '#23292F'], ['#7B3FBF', '#E8ECF1'], ['#23292F', '#E0A816'],
  ['#B23A48', '#1769C2'], ['#0F7E74', '#E8ECF1'], ['#E07012', '#23292F'],
  ['#5C6BC0', '#E8ECF1'], ['#8D2663', '#E8ECF1'], ['#3B6E8F', '#E0A816'],
];

function hashOf(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface KitPair { primary: string; secondary: string }

/** Colores del club: primero emojis del badge, luego hash determinista. */
export function kitOf(badge?: string | null, id?: number | null, name?: string | null): KitPair {
  const found: string[] = [];
  for (const ch of Array.from(badge ?? '')) {
    if (EMOJI_HEX[ch] && !found.includes(EMOJI_HEX[ch])) found.push(EMOJI_HEX[ch]);
    if (found.length === 2) break;
  }
  if (found.length >= 1) return { primary: found[0], secondary: found[1] ?? '#E8ECF1' };
  const [primary, secondary] = FALLBACK[hashOf(`${id ?? ''}·${name ?? ''}`) % FALLBACK.length];
  return { primary, secondary };
}

/** Equipación a partir del objeto jugador/club del API. */
export function kitFromPlayer(player?: {
  club?: { badge?: string | null; id?: number | null; name?: string | null } | null;
  clubId?: number | null;
} | null): KitPair {
  if (!player) return kitOf(null, null, null);
  return kitOf(player.club?.badge, player.club?.id ?? player.clubId, player.club?.name);
}

/** Resuelve el choque de equipaciones: si el visitante "se parece" al local,
 *  usa su secundario (y si también chocan, un kit neutro). */
export function resolveClash(home: KitPair, away: KitPair): { home: string; away: string } {
  const close = (a: string, b: string) => {
    const v = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    try {
      const [r1, g1, b1] = v(a); const [r2, g2, b2] = v(b);
      return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) < 150;
    } catch { return a === b; }
  };
  if (!close(home.primary, away.primary)) return { home: home.primary, away: away.primary };
  if (!close(home.primary, away.secondary)) return { home: home.primary, away: away.secondary };
  return { home: home.primary, away: '#E8ECF1' };
}
