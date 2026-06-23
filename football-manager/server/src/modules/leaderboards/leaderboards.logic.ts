export const MIN_RATING_MATCHES = 10;

export function seasonStatsWhere(seasonId: number) {
  return {
    match: { matchday: { competition: { seasonId } } },
  };
}
