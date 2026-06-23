// ─── Parseo defensivo del detalle de partido (read-layer → contrato del motor) ─
// El backend (API_UI.md, GET /api/matches/public/:id) vuelca los JSON pesados del
// motor como STRINGS (timelineJson, ratingsJson, playerStatsJson, injuriesJson).
// Aquí los normalizamos al contrato de types/engine.ts con tolerancia a huecos.
import type {
  Injury, MatchStats, PlayerRating, SimulationResult, Substitution, TimelineEntry,
} from '../types/engine';

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return (raw as T) ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function num(v: unknown, d = 0): number { const n = Number(v); return Number.isFinite(n) ? n : d; }

function normRating(r: Record<string, unknown>): PlayerRating {
  const rawName = String(r.name ?? r.playerName ?? '').trim();
  const pid = r.playerId != null ? String(r.playerId) : null;
  const name = rawName && rawName !== 'Jugador'
    ? rawName
    : pid ? `Jugador #${pid}` : 'Jugador';
  const sn = r.squadNumber ?? r.number;
  return {
    name,
    playerId: pid,
    position: typeof r.position === 'string' ? r.position : undefined,
    squadNumber: sn != null && Number.isFinite(Number(sn)) ? Number(sn) : null,
    detailedPosition: typeof r.detailedPosition === 'string' ? r.detailedPosition : null,
    rating: num(r.rating, 6), goals: num(r.goals), assists: num(r.assists),
    shots: num(r.shots), shotsOnTarget: num(r.shotsOnTarget),
    passes: num(r.passes), passesCompleted: num(r.passesCompleted),
    passAccuracy: num(r.passAccuracy), tackles: num(r.tackles),
    interceptions: num(r.interceptions), keyPasses: num(r.keyPasses), xg: num(r.xg ?? r.xG),
  };
}

/** Rellena nombres faltantes en ratings usando el timeline (duelos, chain, texto). */
function enrichRatingsWithTimeline(ratings: PlayerRating[], timeline: TimelineEntry[]): PlayerRating[] {
  if (!timeline.length) return ratings;
  const byId = new Map<string, string>();

  const put = (id: unknown, name: unknown) => {
    if (id == null || name == null) return;
    const n = String(name).trim();
    if (!n || n === 'Jugador') return;
    byId.set(String(id), n);
  };

  const fromText = (text: string): string | null => {
    const m = text.match(/(?:de|por|a)\s+([\p{L}'-]+(?:\s+[\p{L}'-]+)?)/iu)
      ?? text.match(/^([\p{L}'-]+(?:\s+[\p{L}'-]+)?)\s+(?:remata|chuta|marca|asiste)/iu);
    return m?.[1]?.trim() ?? null;
  };

  for (const e of timeline) {
    put(e.playerId, fromText(e.text));
    if (e.duel?.att) put(e.duel.att.playerId, e.duel.att.name);
    if (e.duel?.def) put(e.duel.def.playerId, e.duel.def.name);
    e.chain?.forEach(link => {
      put(link.att?.playerId, link.att?.name);
      put(link.def?.playerId, link.def?.name);
    });
  }

  return ratings.map(r => {
    const generic = !r.name || r.name === 'Jugador' || r.name.startsWith('Jugador #');
    const id = r.playerId != null ? String(r.playerId) : '';
    const resolved = generic && id ? byId.get(id) : null;
    return resolved ? { ...r, name: resolved } : r;
  });
}

function statsFromRatings(rs: PlayerRating[], possession: number): MatchStats {
  const sum = (f: (r: PlayerRating) => number) => rs.reduce((s, r) => s + f(r), 0);
  return {
    possession, shots: sum(r => r.shots), shotsOnTarget: sum(r => r.shotsOnTarget),
    corners: 0, fouls: 0, yellowCards: 0, redCards: 0,
  };
}

export interface ParsedClub { id: number | null; badge?: string | null }
export interface ParsedMatch {
  result: SimulationResult;
  homeName: string;
  awayName: string;
  homeClub?: ParsedClub;
  awayClub?: ParsedClub;
  weather?: string;
  played: boolean;
  analysis?: any;
  /** Formaciones reales (p. ej. "4-3-3") para alinear el once en el visor. */
  homeFormation?: string;
  awayFormation?: string;
}

function asArray<T = any>(v: unknown): T[] | null {
  return Array.isArray(v) ? (v as T[]) : null;
}

/** Acepta CUALQUIERA de los tres payloads que existen hoy:
 *  · GET /matches/:id (legacy, ya parseado: timeline/homeRatings/homeStats + resultHidden)
 *  · GET /matches/public/:id (fila cruda de Prisma: homeStatsJson/awayStatsJson como STRINGS)
 *  · el contrato "read-layer" de API_UI.md (timelineJson/ratingsJson como strings)
 *  y devuelve un SimulationResult listo para MatchCenter. Nunca lanza. */
export function parseMatchDetail(raw: Record<string, any>): ParsedMatch {
  const homeName = raw.homeClub?.shortName ?? raw.homeClub?.name ?? raw.homeName ?? 'Local';
  const awayName = raw.awayClub?.shortName ?? raw.awayClub?.name ?? raw.awayName ?? 'Visitante';
  const played = (raw.status ?? '').toString() === 'played' || raw.played === true;

  // El JSON pesado del motor vive (también) dentro de homeStatsJson/awayStatsJson.
  const homeSJ = parseJson<Record<string, any> | null>(raw.homeStatsJson, null);
  const awaySJ = parseJson<Record<string, any> | null>(raw.awayStatsJson, null);

  const timelineRaw =
    asArray<TimelineEntry>(parseJson<TimelineEntry[] | null>(raw.timelineJson ?? raw.timeline, null))
    ?? asArray<TimelineEntry>(homeSJ?.timeline) ?? asArray<TimelineEntry>(homeSJ?.replay) ?? [];
  const timeline = timelineRaw;

  const ratingsObj = parseJson<{ home?: any[]; away?: any[] }>(raw.ratingsJson ?? raw.ratings, {});
  const statsObj = parseJson<{ home?: any; away?: any }>(raw.playerStatsJson ?? raw.statsJson, {});
  const injuries =
    asArray<Injury>(parseJson<Injury[] | null>(raw.injuriesJson ?? raw.injuries, null))
    ?? asArray<Injury>(homeSJ?.allInjuries) ?? [];
  const subs = parseJson<Substitution[]>(raw.substitutionsJson ?? raw.substitutions, []) || [];

  const homeRatingsRaw =
    asArray(ratingsObj?.home) ?? asArray(raw.homeRatings) ?? asArray(homeSJ?.ratings) ?? [];
  const awayRatingsRaw =
    asArray(ratingsObj?.away) ?? asArray(raw.awayRatings) ?? asArray(awaySJ?.ratings) ?? [];
  const homeRatings = enrichRatingsWithTimeline(homeRatingsRaw.map(normRating), timeline);
  const awayRatings = enrichRatingsWithTimeline(awayRatingsRaw.map(normRating), timeline);

  // Stats de equipo: contrato {home,away} → legacy homeStats/awayStats → statsJson crudo.
  const homeStatsSrc = statsObj.home ?? raw.homeStats ?? homeSJ ?? null;
  const awayStatsSrc = statsObj.away ?? raw.awayStats ?? awaySJ ?? null;
  const homePoss = num(homeStatsSrc?.possession, 50);
  const homeStats: MatchStats = homeStatsSrc
    ? { ...statsFromRatings(homeRatings, homePoss), ...homeStatsSrc }
    : statsFromRatings(homeRatings, 50);
  const awayStats: MatchStats = awayStatsSrc
    ? { ...statsFromRatings(awayRatings, 100 - homePoss), ...awayStatsSrc }
    : statsFromRatings(awayRatings, 50);

  const penalties = homeSJ?.penalties as { home?: number; away?: number } | null | undefined;
  const result: SimulationResult = {
    homeGoals: num(raw.homeScore ?? raw.homeGoals),
    awayGoals: num(raw.awayScore ?? raw.awayGoals),
    resultHidden: Boolean(raw.resultHidden),
    homeStats, awayStats, events: [],
    motm: String(raw.motm ?? ''),
    homeRatings, awayRatings, timeline,
    knockout: Boolean(raw.knockout ?? homeSJ?.knockout),
    decidedBy: (raw.decidedBy as SimulationResult['decidedBy']) ?? (penalties ? 'penalties' : 'regular'),
    winner: (raw.winner as SimulationResult['winner']) ?? (homeSJ?.winnerTeam as SimulationResult['winner']) ?? null,
    homePenalties: num(raw.homePenalties ?? raw.penaltiesHome ?? penalties?.home),
    awayPenalties: num(raw.awayPenalties ?? raw.penaltiesAway ?? penalties?.away),
    injuries, substitutions: subs,
  };

  const weatherCond = raw.weatherCondition ?? homeSJ?.weatherCondition;
  const temp = raw.temperature ?? homeSJ?.temperature;
  const weather = weatherCond
    ? `${weatherCond}${temp != null ? ` · ${Math.round(num(temp))}º` : ''}`
    : undefined;

  const clubOf = (c: any, idKey: string): ParsedClub | undefined =>
    c || raw[idKey] != null
      ? { id: num(c?.id ?? raw[idKey], 0) || null, badge: c?.badge ?? null }
      : undefined;

  const formationOf = (v: unknown): string | undefined =>
    typeof v === 'string' && /^\d(?:-\d){1,3}$/.test(v.trim()) ? v.trim() : undefined;

  return {
    result, homeName, awayName, weather, played,
    homeClub: clubOf(raw.homeClub, 'homeClubId'),
    awayClub: clubOf(raw.awayClub, 'awayClubId'),
    analysis: raw.analysis,
    homeFormation: formationOf(raw.homeFormation) ?? formationOf(homeSJ?.formation),
    awayFormation: formationOf(raw.awayFormation) ?? formationOf(awaySJ?.formation),
  };
}
