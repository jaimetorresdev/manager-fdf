import { randomInt } from 'node:crypto';

export function officialMatchSeed(matchId: number): number {
  return Math.trunc(matchId) * 1337;
}

/** Semilla efímera de previa, separada deliberadamente de la oficial. */
export function previewMatchSeed(
  matchId: number,
  entropy = randomInt(1, 0x7fffffff),
): number {
  const official = officialMatchSeed(matchId);
  const candidate = (official ^ Math.trunc(entropy) ^ 0x5f3759df) >>> 0;
  return candidate === official ? (candidate + 1) >>> 0 : candidate;
}

function parseObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function persistedMatchPreview(match: {
  homeGoals: number | null;
  awayGoals: number | null;
  motm: string | null;
  homeStatsJson: string | null;
  awayStatsJson: string | null;
}) {
  const homeStats = parseObject(match.homeStatsJson);
  const awayStats = parseObject(match.awayStatsJson);
  return {
    homeGoals: match.homeGoals ?? 0,
    awayGoals: match.awayGoals ?? 0,
    motm: match.motm ?? '',
    homeStats,
    awayStats,
    events: Array.isArray(homeStats.events) ? homeStats.events : [],
    timeline: Array.isArray(homeStats.timeline)
      ? homeStats.timeline
      : Array.isArray(homeStats.replay) ? homeStats.replay : [],
    homeRatings: Array.isArray(homeStats.ratings) ? homeStats.ratings : [],
    awayRatings: Array.isArray(awayStats.ratings) ? awayStats.ratings : [],
  };
}
