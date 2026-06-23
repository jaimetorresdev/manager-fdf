// ─── Clasificación: comparador CANÓNICO (AUDIT 2.1) ──────────────────────────
// Única fuente de verdad para ORDENAR tablas de liga. Debe usarse en cierre de
// temporada, rollover y TODAS las vistas (world / public / season). Antes había
// 4 criterios de desempate distintos → campeón inconsistente entre UI y cierre.
//
// Propiedad: Agente C (Codex / motor-competición). Los demás agentes lo IMPORTAN,
// no lo redefinen. Si hace falta head-to-head u otros criterios FDF, se añaden
// AQUÍ y se aplican en todas partes a la vez.
//
// Stub funcional (refleja el comparador más completo que ya existía en
// public.service.ts); el Agente C lo refina si el reglamento FDF lo requiere.

export interface StandingRow {
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  club?: { name?: string; [key: string]: unknown };
  clubId?: number;
  headToHeadPoints?: number;
}

export interface StandingMatch {
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  status?: string;
}

/**
 * Calcula una mini-liga entre los clubes empatados a puntos. Los partidos
 * frente a clubes fuera del grupo empatado no alteran el desempate.
 */
export function withHeadToHeadPoints<T extends StandingRow>(
  rows: T[],
  matches: StandingMatch[],
): Array<T & { headToHeadPoints: number }> {
  const tiedByPoints = new Map<number, T[]>();
  for (const row of rows) {
    const group = tiedByPoints.get(row.points) ?? [];
    group.push(row);
    tiedByPoints.set(row.points, group);
  }

  const pointsByClub = new Map<number, number>();
  for (const row of rows) {
    if (row.clubId != null) pointsByClub.set(row.clubId, 0);
  }

  for (const tiedRows of tiedByPoints.values()) {
    if (tiedRows.length < 2) continue;
    const tiedClubIds = new Set(
      tiedRows.flatMap((row) => row.clubId == null ? [] : [row.clubId]),
    );
    if (tiedClubIds.size < 2) continue;

    for (const match of matches) {
      if (match.status && match.status !== 'played') continue;
      if (match.homeGoals == null || match.awayGoals == null) continue;
      if (!tiedClubIds.has(match.homeClubId) || !tiedClubIds.has(match.awayClubId)) continue;

      if (match.homeGoals > match.awayGoals) {
        pointsByClub.set(match.homeClubId, (pointsByClub.get(match.homeClubId) ?? 0) + 3);
      } else if (match.awayGoals > match.homeGoals) {
        pointsByClub.set(match.awayClubId, (pointsByClub.get(match.awayClubId) ?? 0) + 3);
      } else {
        pointsByClub.set(match.homeClubId, (pointsByClub.get(match.homeClubId) ?? 0) + 1);
        pointsByClub.set(match.awayClubId, (pointsByClub.get(match.awayClubId) ?? 0) + 1);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    headToHeadPoints: row.clubId == null ? 0 : pointsByClub.get(row.clubId) ?? 0,
  }));
}

/**
 * Orden FDF único:
 * puntos → enfrentamientos directos → diferencia de goles → goles a favor →
 * menos goles en contra → sorteo determinista.
 *
 * `headToHeadPoints` se rellena por el consumidor cuando dispone de los
 * partidos del grupo empatado. Si no existe, el criterio queda neutro.
 */
export function compareStandings(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points
    || (b.headToHeadPoints ?? 0) - (a.headToHeadPoints ?? 0)
    || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst)
    || b.goalsFor - a.goalsFor
    || a.goalsAgainst - b.goalsAgainst
    || deterministicStandingDraw(a.clubId ?? 0) - deterministicStandingDraw(b.clubId ?? 0)
  );
}

function deterministicStandingDraw(clubId: number): number {
  let value = Math.imul(clubId | 0, 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Devuelve una copia ordenada (no muta el array de entrada). */
export function sortStandings<T extends StandingRow>(rows: T[]): T[] {
  return [...rows].sort(compareStandings);
}
