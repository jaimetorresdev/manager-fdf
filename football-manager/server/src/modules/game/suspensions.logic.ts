export interface PendingSuspension {
  playerId: number;
  matches: number;
}

export interface CardSuspensionCandidate {
  playerId: number;
  matches: number;
  reason: string;
}

interface YellowCardTotal {
  playerId: number;
  total: number;
  competitionId?: number;
  competitionType?: string;
}

interface RedCardEvent {
  id: number;
  playerId: number | null;
  cardCount: number;
  description: string;
}

/** Suma bans concurrentes y limita datos corruptos a 99 partidos pendientes. */
export function aggregateSuspensionMatches(
  suspensions: PendingSuspension[],
  maxMatches = 99,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const suspension of suspensions) {
    if (!Number.isFinite(suspension.matches) || suspension.matches <= 0) continue;
    const total = (totals.get(suspension.playerId) ?? 0) + Math.trunc(suspension.matches);
    totals.set(suspension.playerId, Math.min(maxMatches, total));
  }
  return totals;
}

export function shouldCleanCardMarker(reason: string, seasonId: number): boolean {
  return reason.startsWith(`cards:yellow:s${seasonId}:`)
    || reason.startsWith(`cards:red:s${seasonId}:`);
}

export function buildYellowSuspensionCandidates(
  totals: YellowCardTotal[],
  seasonId: number | null,
): CardSuspensionCandidate[] {
  return totals.flatMap(({ playerId, total, competitionId, competitionType }) => {
    const threshold = competitionType === 'cup' || competitionType === 'supercup'
      ? 2
      : !competitionType || competitionType === 'league'
        ? 5
        : 3;
    const buckets = Math.floor(Math.max(0, total) / threshold);
    return Array.from({ length: buckets }, (_, index) => {
      const bucket = index + 1;
      return {
        playerId,
        matches: 1,
        reason: competitionId
          ? seasonId
            ? `cards:yellow:s${seasonId}:c${competitionId}:${threshold}:${bucket}`
            : `cards:yellow:c${competitionId}:${threshold}:${bucket}`
          : seasonId
            ? `cards:yellow:s${seasonId}:${bucket}`
            : `cards:yellow:${bucket}`,
      };
    });
  });
}

export function buildRedSuspensionCandidates(
  events: RedCardEvent[],
  seasonId: number | null,
): CardSuspensionCandidate[] {
  return events.flatMap((event) => {
    if (!event.playerId) return [];
    const text = event.description.toLocaleLowerCase('es-ES');
    const matches = text.includes('agres') || text.includes('viol') || text.includes('insult')
      ? 3
      : text.includes('doble') || event.cardCount >= 2
        ? 1
        : 2;
    return [{
      playerId: event.playerId,
      matches,
      reason: seasonId
        ? `cards:red:s${seasonId}:event:${event.id}`
        : `cards:red:event:${event.id}`,
    }];
  });
}
