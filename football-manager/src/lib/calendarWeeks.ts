/** Deriva el máximo de jornadas navegables desde partidos, semana actual y metadatos de competición. */
export function deriveMaxMatchweek(
  matches: Array<{ matchdayNum?: number; week?: number }>,
  currentWeek: number,
  competitionMaxMatchdays = 0,
): number {
  const matchMax = matches.reduce(
    (max, m) => Math.max(max, m.matchdayNum ?? m.week ?? 0),
    0,
  );
  return Math.max(1, currentWeek, matchMax, competitionMaxMatchdays);
}
