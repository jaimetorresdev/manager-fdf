/** Emoji de moral según valor 0–100. */
export function moraleEmoji(value: number): string {
  if (value >= 85) return '😤';
  if (value >= 70) return '🙂';
  if (value >= 50) return '😐';
  if (value >= 30) return '😟';
  return '😡';
}

export function moraleLabel(value: number): string {
  if (value >= 85) return 'Euforia';
  if (value >= 70) return 'Motivados';
  if (value >= 50) return 'Estables';
  if (value >= 30) return 'Frustrados';
  return 'Revuelta';
}

export type MatchResult = 'W' | 'D' | 'L';

export interface StreakInfo {
  type: MatchResult;
  count: number;
}

/** Racha actual desde partidos recientes (más reciente al final del array). */
export function computeStreak(
  matches: { homeClubId?: number; awayClubId?: number; homeGoals?: number | null; awayGoals?: number | null }[],
  clubId: number,
): StreakInfo | null {
  if (!matches.length) return null;
  let type: MatchResult | null = null;
  let count = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    if (m.homeGoals == null || m.awayGoals == null) continue;
    const home = m.homeClubId === clubId;
    const gf = home ? m.homeGoals : m.awayGoals;
    const ga = home ? m.awayGoals : m.homeGoals;
    const r: MatchResult = gf > ga ? 'W' : gf < ga ? 'L' : 'D';
    if (type == null) {
      type = r;
      count = 1;
    } else if (r === type) count++;
    else break;
  }
  return type ? { type, count } : null;
}

/** Puntos por jornada reciente → sparkline de forma. */
export function formSparkline(
  matches: { homeClubId?: number; awayClubId?: number; homeGoals?: number | null; awayGoals?: number | null }[],
  clubId: number,
): number[] {
  return matches
    .filter(m => m.homeGoals != null && m.awayGoals != null)
    .map(m => {
      const home = m.homeClubId === clubId;
      const gf = home ? m.homeGoals! : m.awayGoals!;
      const ga = home ? m.awayGoals! : m.homeGoals!;
      if (gf > ga) return 3;
      if (gf < ga) return 0;
      return 1;
    });
}

export function streakCaption(streak: StreakInfo): string {
  const sym = streak.type === 'W' ? 'V' : streak.type === 'D' ? 'E' : 'D';
  const word = streak.type === 'W' ? 'victorias' : streak.type === 'D' ? 'empates' : 'derrotas';
  return `${streak.count}${sym} · ${word}`;
}

export function parseNumericValue(value: string | number): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
