// ─── API Client for FDF Manager Backend ───────────────────────
import { parseJson } from '../lib/normalize';
import { emitDecisionImpact } from '../lib/decisionImpact';

const BASE_URL = import.meta.env.VITE_API_URL ?? (
  import.meta.env.PROD ? '/api' : 'http://localhost:3001/api'
);

export function getToken(): string | null {
  return localStorage.getItem('fdf_token');
}

export function setToken(token: string) {
  localStorage.setItem('fdf_token', token);
}

export function clearToken() {
  localStorage.removeItem('fdf_token');
  localStorage.removeItem('fdf_user');
  localStorage.removeItem('fdf_role');
  void clearApiPwaCache();
}

/** Evita servir respuestas /api/* cacheadas tras logout (Workbox api-cache). */
export async function clearApiPwaCache(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await caches.delete('api-cache');
  } catch {
    /* PWA opcional */
  }
}

/** Origen HTTP del backend sin sufijo /api (para rutas fuera de /api, p.ej. /ws/ticket). */
export function apiOrigin(): string {
  return BASE_URL.replace(/\/api\/?$/, '');
}

/** QB8 · ticket WS efímero de un solo uso (sustituye JWT en query en producción). */
export async function issueWsTicket(): Promise<string | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${apiOrigin()}/ws/ticket`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = parseJson<{ ticket?: string }>(await res.text());
    return typeof data?.ticket === 'string' ? data.ticket : null;
  } catch {
    return null;
  }
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Error de red') {
    super(message);
    this.name = 'NetworkError';
  }
}

export class TimeoutError extends Error {
  constructor(message = 'La petición ha excedido el tiempo de espera') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export class RequestAbortedError extends Error {
  constructor(message = 'Petición cancelada') {
    super(message);
    this.name = 'RequestAbortedError';
  }
}

let handlingUnauthorized = false;

function composeAbortSignal(
  timeoutMs: number,
  callerSignal?: AbortSignal | null,
): { signal: AbortSignal; cleanup: () => void; timedOut: () => boolean; callerAborted: () => boolean } {
  const controller = new AbortController();
  let didTimeout = false;
  let didCallerAbort = false;

  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const onCallerAbort = () => {
    didCallerAbort = true;
    controller.abort();
  };
  if (callerSignal) {
    if (callerSignal.aborted) onCallerAbort();
    else callerSignal.addEventListener('abort', onCallerAbort);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    },
    timedOut: () => didTimeout,
    callerAborted: () => didCallerAbort,
  };
}

export async function request<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const token = getToken();
  const { timeoutMs, signal: callerSignal, headers: externalHeaders, ...fetchOptions } = options;
  const { signal, cleanup, timedOut, callerAborted } = composeAbortSignal(
    timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    callerSignal,
  );

  // Content-Type SOLO si hay body: Fastify devuelve 400 ("Body cannot be empty
  // when content-type is set to application/json") en POST/DELETE sin body si
  // se manda el header igualmente (causa raíz del 400 en /matches/:id/seen).
  const headers: Record<string, string> = {
    ...(fetchOptions.body != null ? { 'Content-Type': 'application/json' } : {}),
    ...(externalHeaders as Record<string, string> ?? {}),
  };
  const locale = localStorage.getItem('fdf_locale');
  if (locale) headers['Accept-Language'] = locale;
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers, signal });
  } catch (err) {
    if (timedOut()) throw new TimeoutError();
    if (callerAborted()) throw new RequestAbortedError();
    throw new NetworkError(err instanceof Error ? err.message : 'Error de red');
  } finally {
    cleanup();
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (err as { error?: string }).error ?? `HTTP ${res.status}`;
    // Token caducado o inválido → limpia para que la UI redirija a /login.
    if (res.status === 401 && token && !handlingUnauthorized) {
      handlingUnauthorized = true;
      try {
        clearToken();
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('fdf_unauthorized'));
      } finally {
        handlingUnauthorized = false;
      }
    }
    throw new ApiError(res.status, msg);
  }
  // 204 / sin contenido — parseJson defensivo (auditoría: evitar crash por JSON corrupto).
  const text = await res.text();
  if (!text) {
    emitDecisionImpact(path, fetchOptions.method ?? 'GET');
    return undefined as T;
  }
  const parsed = parseJson<T>(text);
  if (parsed === undefined) throw new ApiError(500, 'Respuesta del servidor no válida');
  emitDecisionImpact(path, fetchOptions.method ?? 'GET');
  return parsed;
}

// ─── Auth ────────────────────────────────────────────────────
export interface AuthMeResponse {
  id: number;
  username: string;
  email: string;
  role: string;
  manager: { id: number; clubId: number | null; name: string; avatarSeed?: string } | null;
}

export interface UpdateMeResponse extends Partial<AuthMeResponse> {
  token?: string;
}

export const authApi = {
  register: (username: string, email: string, password: string) =>
    request<{ token: string; managerId: number; username: string; clubId: number | null; role: string }>(
      '/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }
    ),

  login: (username: string, password: string) =>
    request<{ token: string; managerId: number; username: string; clubId: number | null; role: string; previousLoginAt?: string }>(
      '/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }
    ),

  me: () => request<AuthMeResponse>('/auth/me'),
  updateMe: async (data: { email?: string; avatarSeed?: string }) => {
    const res = await request<UpdateMeResponse>('/auth/me', { method: 'PATCH', body: JSON.stringify(data) });
    if (res?.token) setToken(res.token);
    return res;
  },
  changePassword: (data: { currentPassword?: string; newPassword?: string }) =>
    request<{ ok?: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── QB9 / N2-4 · tipos incrementales de contrato (aditivos, sin romper firmas) ─
export type DecisionAction = 'sign' | 'sell' | 'renew' | 'stadium';

export interface DecisionSignalQuery {
  action: DecisionAction;
  playerId?: number;
  amount?: number;
  salary?: number;
  years?: number;
  clause?: number;
  workKey?: string;
}

export interface DecisionSignalDimension {
  key: string;
  label: string;
  status: 'green' | 'yellow' | 'red';
  score: number;
  detail: string;
}

export interface DecisionSignalResponse {
  status: 'green' | 'yellow' | 'red';
  score: number;
  label: string;
  summary: string;
  dimensions: DecisionSignalDimension[];
}

export interface AuctionBid {
  id?: number;
  auctionId?: number;
  managerId?: number;
  managerName?: string;
  manager?: { name?: string };
  amount?: number;
  createdAt?: string;
  sealed?: boolean;
  encrypted?: { alg?: string; kid?: string; iv?: string; ciphertext?: string; tag?: string };
}

export interface AuctionSummary {
  id: number;
  player?: { id?: number; name?: string; position?: string; overall?: number };
  playerName?: string;
  startPrice?: number;
  currentBid?: number;
  winningClubId?: number | null;
  bids?: AuctionBid[];
  endsAt?: string;
  status?: string;
}

export type AuctionDetail = AuctionSummary;

export interface AuctionBidResponse {
  auction?: AuctionDetail;
  bid?: AuctionBid;
}

export interface PublicStatsResponse {
  activeManagers?: number;
  humanClubs?: number;
  totalClubs?: number;
  managers?: number;
  clubs?: number;
  matches?: number;
  season?: { name?: string } | null;
  budgetByLeagueQuartile?: { label?: string; quartile?: string; avgBudget?: number; budget?: number; value?: number }[];
  economicDistribution?: { leagueQuartiles?: PublicStatsResponse['budgetByLeagueQuartile'] };
  leagueBudgetQuartiles?: PublicStatsResponse['budgetByLeagueQuartile'];
  budgetQuartiles?: PublicStatsResponse['budgetByLeagueQuartile'];
  quartileBudgets?: number[];
}

// ─── Club ────────────────────────────────────────────────────
export const clubApi = {
  get: () => request<any>('/club'),
  standings: () => request<any[]>('/club/standings'),
  // Read-layer del rediseño (API_UI.md).
  getPublic: (id: number) => request<any>(`/club/public/${id}`),
  getPublicSquad: (id: number) => request<any[]>(`/club/public/${id}/squad`),
  advisor: () => request<any>('/club/advisor'),
  rivalWeek: () => request<any>('/club/rival-week'),
  healthMap: () => request<any>('/club/health-map'),
  // W6 / N3-4 · semáforo de decisión (fuente única server-side).
  decisionSignal: (params: DecisionSignalQuery) => {
    const p = new URLSearchParams({ action: params.action });
    if (params.playerId != null) p.set('playerId', String(params.playerId));
    if (params.amount != null) p.set('amount', String(params.amount));
    if (params.salary != null) p.set('salary', String(params.salary));
    if (params.years != null) p.set('years', String(params.years));
    if (params.clause != null) p.set('clause', String(params.clause));
    if (params.workKey) p.set('workKey', params.workKey);
    return request<DecisionSignalResponse>(`/club/decision-signal?${p.toString()}`);
  },
};

// ─── Economy ─────────────────────────────────────────────────
export const economyApi = {
  get: () => request<any>('/economy'),
  updateTicketPrices: (level: string) => request<any>('/economy/ticket-prices', { method: 'PUT', body: JSON.stringify({ level }) }),
  signSponsor: (type: string, years: number, tier?: string) => request<any>('/economy/sponsors', { method: 'POST', body: JSON.stringify(tier ? { type, years, tier } : { type, years }) }),
  breakSponsor: (id: number) => request<{ penalty: number }>(`/economy/sponsors/${id}`, { method: 'DELETE' }),
  listSponsors: () => request<any[]>('/economy/sponsors'),
  updateSubcontracts: (data: any) => request<any>('/economy/subcontracts', { method: 'PUT', body: JSON.stringify(data) }),
  forecast: (months = 12) => request<any>(`/economy/forecast?months=${months}`),
  // B17 · análisis ampliado (API_UI §EconomiaAnalisis): ratio salarial, comparativa de liga y variaciones
  analysis: () => request<any>('/economy/analysis'),
  competitionIncome: () => request<any[]>('/economy/competition-income'),
};

// ─── Friendlies / Pretemporada ───────────────────────────────
export const friendliesApi = {
  list: () => request<any[]>('/friendlies'),
  create: (opponentClubId: number, dateTurn: string) =>
    request<any>('/friendlies', { method: 'POST', body: JSON.stringify({ opponentClubId, dateTurn }) }),
  cancel: (id: number) => request<any>(`/friendlies/${id}`, { method: 'DELETE' }),
  preseason: () => request<any>('/friendlies/preseason'),
};

// ─── Players ─────────────────────────────────────────────────
export const playersApi = {
  getSquad: () => request<any[]>('/players'),
  getLoanedOut: () => request<any[]>('/players/loaned-out'),
  getPlayer: (id: number) => request<any>(`/players/${id}`),
  // E6/E7: ficha pública de cualquier jugador (seasonStats/honours/development/matchStats)
  getPublicPlayer: (id: number) => request<any>(`/players/public/${id}`),
  setStarter: (id: number, isStarter: boolean) =>
    request<any>(`/players/${id}/starter`, { method: 'PATCH', body: JSON.stringify({ isStarter }) }),
  // El zod del server exige forSale:boolean (auditoría A2).
  putForSale: (id: number, price?: number, forSale = true) =>
    request<any>(`/players/${id}/sell`, { method: 'PATCH', body: JSON.stringify({ forSale, price }) }),
};

// ─── Market ──────────────────────────────────────────────────
export interface MarketFilters {
  position?: string;
  maxAge?: number;
  minOverall?: number;
  maxPrice?: number;
  league?: string;
}

export const marketApi = {
  getAvailable: (filters: MarketFilters = {}) => {
    const params = new URLSearchParams();
    if (filters.position)   params.set('position',   filters.position);
    if (filters.maxAge)     params.set('maxAge',      String(filters.maxAge));
    if (filters.minOverall) params.set('minOverall',  String(filters.minOverall));
    if (filters.maxPrice)   params.set('maxPrice',    String(filters.maxPrice));
    if (filters.league)     params.set('league',      filters.league);
    return request<any[]>(`/market?${params.toString()}`);
  },
  // Búsqueda con filtros server-side. OJO: el zod del server usa minAge/maxAge/
  // maxPrice/minPotential — antes se enviaban ageMin/valueMax… y se ignoraban (A5).
  search: (f: {
    page?: number; limit?: number; position?: string;
    ageMin?: number; ageMax?: number; valueMax?: number;
    potentialMin?: number; potentialMax?: number;
    country?: string; clubId?: number;
    minPassing?: number; minTackling?: number; minShooting?: number;
    minOrganization?: number; minUnmarking?: number; minFinishing?: number;
    minDribbling?: number; minGoalkeeping?: number; minOverall?: number;
    sortBy?: string; sortDir?: 'asc' | 'desc';
  } = {}) => {
    const p = new URLSearchParams();
    if (f.page != null) p.set('page', String(f.page));
    if (f.limit != null) p.set('limit', String(f.limit));
    if (f.position) p.set('position', f.position);
    if (f.ageMin != null) p.set('minAge', String(f.ageMin));
    if (f.ageMax != null) p.set('maxAge', String(f.ageMax));
    if (f.valueMax != null) p.set('maxPrice', String(f.valueMax));
    if (f.potentialMin != null) p.set('minPotential', String(f.potentialMin));
    if (f.potentialMax != null) p.set('maxPotential', String(f.potentialMax));
    if (f.country) p.set('country', f.country);
    if (f.clubId != null) p.set('clubId', String(f.clubId));
    if (f.minPassing != null) p.set('minPassing', String(f.minPassing));
    if (f.minTackling != null) p.set('minTackling', String(f.minTackling));
    if (f.minShooting != null) p.set('minShooting', String(f.minShooting));
    if (f.minOrganization != null) p.set('minOrganization', String(f.minOrganization));
    if (f.minUnmarking != null) p.set('minUnmarking', String(f.minUnmarking));
    if (f.minFinishing != null) p.set('minFinishing', String(f.minFinishing));
    if (f.minDribbling != null) p.set('minDribbling', String(f.minDribbling));
    if (f.minGoalkeeping != null) p.set('minGoalkeeping', String(f.minGoalkeeping));
    if (f.minOverall != null) p.set('minOverall', String(f.minOverall));
    if (f.sortBy) p.set('sortBy', f.sortBy);
    if (f.sortDir) p.set('sortDir', f.sortDir);
    return request<{ data: any[], total: number, page: number, totalPages: number }>(`/market/search?${p.toString()}`);
  },
  getOffers: () => request<any[]>('/market/offers'),
  getMyOffers: () => request<any[]>('/market/my-offers'),
  // Shortlist del rediseño (API_UI.md).
  getShortlist: () => request<any[]>('/market/shortlist'),
  addShortlist: (playerId: number) => request<any>(`/market/shortlist/${playerId}`, { method: 'POST' }),
  removeShortlist: (playerId: number) => request<any>(`/market/shortlist/${playerId}`, { method: 'DELETE' }),
  makeOffer: (playerId: number, amount: number, terms?: { salary?: number; years?: number; clause?: number }) =>
    request<any>('/market/offer', { method: 'POST', body: JSON.stringify({ playerId, amount, ...terms }) }),
  respondToOffer: (offerId: number, accept: boolean) =>
    request<any>(`/market/offer/${offerId}/respond`, { method: 'POST', body: JSON.stringify({ accept }) }),
  withdrawOffer: (offerId: number) =>
    request<any>(`/market/offer/${offerId}`, { method: 'DELETE' }),
  // Valoración multi-apartado FDF en servidor (issue 3.1, manual §4.3).
  evaluate: (playerId: number, salary: number, years: number, clause?: number) =>
    request<any>('/market/evaluate', { method: 'POST', body: JSON.stringify({ playerId, salary, years, clause }) }),
  // Renovación de contrato evaluada por el jugador (los años SUMAN, máx. 5).
  renew: (playerId: number, salary: number, years: number, clause?: number) =>
    request<any>(`/market/players/${playerId}/renew`, { method: 'POST', body: JSON.stringify({ salary, years, clause }) }),
  // ─── #9 mercado completo (endpoints existentes sin UI hasta hoy) ───
  // Listings en venta (paginado {data,total}).
  getListings: () => request<{ data: any[]; total: number }>('/market/listings'),
  removeListing: (id: number) => request<any>(`/market/listings/${id}`, { method: 'DELETE' }),
  // Agentes libres (Player.clubId=null) y fichaje directo con términos.
  getFreeAgents: (f: { position?: string; maxAge?: number } = {}) => {
    const p = new URLSearchParams();
    if (f.position) p.set('position', f.position);
    if (f.maxAge != null) p.set('maxAge', String(f.maxAge));
    return request<any[]>(`/market/free-agents?${p.toString()}`);
  },
  signFreeAgent: (playerId: number, terms?: { wage?: number; contractYears?: number; releaseClause?: number }) =>
    request<any>(`/market/free-agents/${playerId}/sign`, { method: 'POST', body: JSON.stringify(terms ?? {}) }),
  // Ventana de fichajes/cesiones + tope salarial 15%.
  getWindow: () => request<any>('/market/window'),
  getSalaryCap: () => request<any>('/market/salary-cap'),
  // Cláusula de rescisión: consultar y pagar.
  getClause: (playerId: number) => request<any>(`/market/clause/${playerId}`),
  payClause: (playerId: number, amount: number) =>
    request<any>('/market/clause', { method: 'POST', body: JSON.stringify({ playerId, amount }) }),
  // Cesión de un jugador mío a otro club.
  loanPlayer: (playerId: number, receivingClubId: number) =>
    request<any>('/market/loan', { method: 'POST', body: JSON.stringify({ playerId, receivingClubId }) }),
  squadLimits: () => request<{
    firstTeam: number; loanedOut: number; youth: number; pendingIncoming: number;
    limits: { minFirstTeamAfterExit: number; minFirstTeamPlusYouthForExit: number; maxFirstTeamPlusIncoming: number; maxFirstTeamPlusLoanedOut: number; maxYouth: number; };
    canSign: boolean; canLoanOut: boolean; canListTransfer: boolean; canPromote: boolean;
  }>('/market/squad-limits'),
  // X7 · Deadline Day: agregador de las últimas 24 h de ventana (status/ticker/
  // subastas expirando). Polling fallback = repetir esta llamada (API_UI §X7).
  deadlineDay: () => request<any>('/market/deadline-day'),
  // QW-8 · Rumorómetro (señales de mercado deterministas por semana in-game).
  rumors: () => request<{ weekKey: string; rumors: {
    id: string; icon: string; headline: string; kind: string;
    player: { id: number; name: string; position: string } | null;
    club: { id: number; shortName: string } | null;
  }[] }>('/market/rumors'),
  plantRumorSabotage: (targetClubId: number) =>
    request<any>('/market/rumor-sabotage', { method: 'POST', body: JSON.stringify({ targetClubId }) }),
  debunkRumorSabotage: (id: number) =>
    request<any>(`/market/rumor-sabotage/${id}/debunk`, { method: 'POST' }),
  activeRumorSabotage: () => request<{ sabotages: { id: number; headline: string; debunked: boolean }[] }>('/market/rumor-sabotage/active'),
};

// ─── Social (X8 · Gol de la semana, contrato API_UI §X8) ──────────────────────
export const socialApi = {
  // Top-5 goles candidatos de la semana activa (o `weekKey` concreto).
  goalOfWeek: (weekKey?: string) =>
    request<any>(`/social/goal-of-week${weekKey ? `?weekKey=${encodeURIComponent(weekKey)}` : ''}`),
  // Vota un gol (upsert por weekKey+manager); devuelve el payload actualizado.
  voteGoalOfWeek: (goalKey: string, weekKey?: string) =>
    request<any>('/social/goal-of-week/vote', { method: 'POST', body: JSON.stringify({ goalKey, weekKey }) }),
};

// ─── Prestigio 2.0 (E12, contrato API_UI §PrestigioManager) ──
export const prestigeApi = {
  get: () => request<any>('/manager/prestige'),
  ranking: (limit = 50) => request<any[]>(`/manager/prestige/ranking?limit=${limit}`),
};

// ─── Search global (E10, contrato API_UI §Search) ────────────
export interface SearchResults {
  players: { id: number; name: string; position?: string; age?: number; overall?: number; clubId?: number; clubName?: string }[];
  clubs: { id: number; name: string; shortName?: string; badge?: string; country?: string }[];
  managers: { id: number; username: string; name?: string; clubId?: number; clubName?: string }[];
}
export const searchApi = {
  query: (q: string, limit = 8) => request<SearchResults>(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),
};

// ─── DMs entre mánagers (E11, contrato API_UI §DMs) ──────────
export const dmApi = {
  conversations: () => request<any[]>('/messages/conversations'),
  thread: (managerId: number, limit = 50) => request<any[]>(`/messages/thread/${managerId}?limit=${limit}`),
  send: (toManagerId: number, body: string) =>
    request<any>('/messages', { method: 'POST', body: JSON.stringify({ toManagerId, body }) }),
};

// ─── Rueda de Prensa (W2, contrato API_UI §Press) ────────────
export const pressApi = {
  pending: () => request<any[]>('/press/pending'),
  answer: (questionId: number, choice: string) =>
    request<any>('/press/answer', { method: 'POST', body: JSON.stringify({ questionId, choice }) }),
};

// ─── Matches ─────────────────────────────────────────────────
export const matchesApi = {
  getAll: () => request<any[]>('/matches'),
  getCalendar: () => request<any[]>('/matches/calendar'),
  getMine: () => request<{ played: any[], upcoming: any[] }>('/matches/mine'),
  getMatch: (id: number) => request<any>(`/matches/${id}`),
  // E15: marca el resultado como visto/saltado (desbloquea marcador y stats).
  markSeen: (id: number) => request<any>(`/matches/${id}/seen`, { method: 'POST' }),
  getTimelineFromSeed: (id: number) => request<any>(`/matches/${id}/timeline-from-seed`),
  // N2-3 · auditoría pública por hash de semilla.
  getAudit: (id: number) => request<any>(`/matches/${id}/audit`),
  // N4-1 · tarjeta OpenGraph (disparo; si falla, la UI copia la URL del partido).
  tryOgImage: async (id: number): Promise<boolean> => {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${BASE_URL}/matches/${id}/og-image`, { headers });
    if (!res.ok) return false;
    await res.blob().catch(() => null);
    return true;
  },
  // Q3+Q27: Previa cinematográfica
  getPreview: (id: number) => request<any>(`/matches/${id}/preview`),
  // Read-layer del rediseño (API_UI.md): vuelca timelineJson/ratingsJson/... del motor.
  getPublic: (id: number) => request<any>(`/matches/public/${id}`),
  saveTactics: (id: number, formation: string, construction: number, destruction: number) =>
    request<any>(`/matches/${id}/tactics`, { method: 'POST', body: JSON.stringify({ formation, construction, destruction }) }),
  getComments: (id: number) => request<any[]>(`/matches/${id}/comments`),
  postComment: (id: number, text: string, minute?: number | null) => 
    request<any>(`/matches/${id}/comments`, { method: 'POST', body: JSON.stringify({ text, minute }) }),
};

// ─── Game ────────────────────────────────────────────────────
export const gameApi = {
  getState: () => request<{
    id: number;
    season: string;   // nombre, p. ej. "2024-25" (el server envía state.season.name)
    week: number;
    seasonWeek: number; // Q2: jornada RELATIVA a la temporada (la que muestra la UI)
    phase: string;
    turn: number;
    inGameDate: string;
    nextTickAt: string | null;
    isLocked: boolean;
  }>('/game/state'),
  dashboard: () => request<any>('/game/dashboard'),
  advance: () => request<any>('/game/advance', { method: 'POST' }),
  getNotifications: () => request<any[]>('/game/notifications'),
  markRead: (id: number) => request<any>(`/game/notifications/${id}/read`, { method: 'POST' }),
  simulateMatch: (matchId: number) => request<any>(`/game/simulate-match/${matchId}`, { method: 'POST' }),
  testTactic: (tactic: { formation: string; construction: number; destruction: number }) => 
    request<any>('/game/test-tactic', { method: 'POST', body: JSON.stringify(tactic) }),
  getWhileAway: (since?: string) => request<any>(since ? `/dashboard/while-away?since=${encodeURIComponent(since)}` : '/dashboard/while-away'),
};

// ─── Onboarding ─────────────────────────────────────────────
export interface FreeClub {
  id: number;
  name: string;
  shortName: string;
  badge: string;
  city: string;
  country: string;
  budget: number;
  stadiumName: string;
  stadiumCapacity: number;
  reputation: number;
  fans: number;
}

export const onboardingApi = {
  freeClubs: () => request<{ clubs: FreeClub[] }>('/onboarding/free-clubs'),
  chooseClub: (clubId: number, nationality: string, personality: string) =>
    request<{
      token:   string;
      manager: { id: number; clubId: number };
      club:    { id: number; name: string; shortName: string; badge: string };
    }>(
      '/onboarding/choose-club',
      { method: 'POST', body: JSON.stringify({ clubId, nationality, personality }) }
    ),
  // Y12: guía para cuentas nuevas (estado, ruta recomendada, checklist de primer turno).
  guide: () => request<any>('/onboarding/guide'),
};

export const adminApi = {
  stats: () => request<{
    clubs: number;
    players: number;
    users: number;
    freeClubs: number;
    totalMatches: number;
    playedMatches: number;
    transfers: number;
    season: number;
    week: number;
    phase: string;
  }>('/admin/stats'),
  // E14 · Control total de turnos (admin)
  turnControl: () => request<any>('/admin/turn-control'),
  turnAdvance: (reason?: string) => request<any>('/admin/turn/advance', { method: 'POST', body: JSON.stringify({ reason }) }),
  turnPause: () => request<any>('/admin/turn/pause', { method: 'POST', body: JSON.stringify({ paused: true }) }),
  turnResume: () => request<any>('/admin/turn/resume', { method: 'POST' }),
  turnRewind: (snapshotId?: number, forceClockOnly = false) =>
    request<any>('/admin/turn/rewind', { method: 'POST', body: JSON.stringify({ snapshotId, forceClockOnly }) }),
  // B13 · contrato API_UI §13 (Codex): re-sim AUDIT-ONLY por semilla determinista
  // (matchId×1337) — no sobreescribe nada; devuelve persisted vs resimulated.
  resimulateMatch: (matchId: number, reason?: string) =>
    request<{
      ok: boolean; mode: string; matchId: number; seed: number;
      persisted: { homeGoals: number | null; awayGoals: number | null; seed: number | null };
      resimulated: { homeGoals: number; awayGoals: number; winnerClubId: number | null; penalties: string | null };
      reproducesPersistedScore: boolean; adminActionId: number;
    }>(`/admin/matches/${matchId}/resimulate`, { method: 'POST', body: JSON.stringify({ reason }) }),
  unlockTick: (reason?: string) =>
    request<{ ok: boolean; action: string; alreadyUnlocked?: boolean; adminActionId?: number }>(
      '/admin/turn/unlock', { method: 'POST', body: JSON.stringify({ reason }) }),
};

// ─── Tactics ───────────────────────────────────────────────────
export const tacticsApi = {
  getAll: () => request<any[]>('/tactics'),
  create: (data: any) => request<any>('/tactics', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: any) => request<any>(`/tactics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: number) => request<any>(`/tactics/${id}`, { method: 'DELETE' }),
  setDefault: (id: number) => request<any>(`/tactics/${id}/default`, { method: 'POST' }),
  getPlays: () => request<any[]>('/tactics/plays'),
  startPlay: (type: string) => request<any>('/tactics/plays', { method: 'POST', body: JSON.stringify({ type }) }),
  togglePlay: (id: number) => request<any>(`/tactics/plays/${id}/toggle`, { method: 'PATCH' }),
  formations: () => request<any[]>('/tactics/formations'),
  positions: () => request<any[]>('/tactics/positions'),
  autoLineup: (formation: string) => request<any>(`/tactics/auto-lineup?formation=${encodeURIComponent(formation)}`),
  positionalInsights: (formation: string, starterIds: number[]) =>
    request<{ positionalAlerts: { message: string; severity: string; playerName?: string; slotLabel?: string }[] }>(
      '/tactics/positional-insights',
      { method: 'POST', body: JSON.stringify({ formation, starterIds }) },
    ),
};


// ─── Training ──────────────────────────────────────────────────
export const trainingApi = {
  getCoaches: () => request<any[]>('/training/coaches'),
  getTypes: () => request<{ type: string; stats: string[]; description: string }[]>('/training/types'),
  hireCoach: (category: string, level: number) => request<any>('/training/coaches', { method: 'POST', body: JSON.stringify({ category, level }) }),
  fireCoach: (id: number) => request<any>(`/training/coaches/${id}`, { method: 'DELETE' }),
  assignPlayers: (id: number, playerIds: number[]) => request<any>(`/training/coaches/${id}/assign`, { method: 'PUT', body: JSON.stringify({ playerIds }) }),
  runSession: (coachId: number, trainingType: string, playerIds: number[]) =>
    request<any>('/training/session', { method: 'POST', body: JSON.stringify({ coachId, trainingType, playerIds }) }),
  control: () => request<{
    turn: number; trainingClosedUntilTurn: number; trainingClosedUses: number;
    homeStimulatedUntilTurn: number; homeStimulatedUses: number;
    trainingClosedActive: boolean; homeStimulatedActive: boolean;
  }>('/training/control'),
  close: () => request<any>('/training/close', { method: 'POST' }),
  stimulate: () => request<any>('/training/stimulate', { method: 'POST' }),
};

// ─── Academy ───────────────────────────────────────────────────
export const academyApi = {
  get: () => request<any>('/academy'),
  // /academy/accept devolvía 410 deprecated — la generación manual es /next-player (A8).
  accept: () => request<any>('/academy/next-player', { method: 'POST' }),
  // F4: promoción con términos negociados; el juvenil pide ≥ 1000 + talento×50 €/mes
  promote: (id: number, terms?: { salary?: number; years?: number }) =>
    request<any>(`/academy/promote/${id}`, { method: 'POST', body: JSON.stringify(terms ?? {}) }),
  upgrade: (type: 'capacity' | 'level') => request<any>('/academy/upgrade', { method: 'POST', body: JSON.stringify({ type }) }),
};

// ─── Stadium ───────────────────────────────────────────────────
export const stadiumApi = {
  get: () => request<any>('/stadium'),
  startWork: (data: { type: string; slot?: number }) => request<any>('/stadium/works', { method: 'POST', body: JSON.stringify(data) }),
};

// ─── Staff ─────────────────────────────────────────────────────
export const staffApi = {
  get: () => request<any>('/staff'),
  // OJO: el server expone /staff/members (no /staff/hire) — auditoría A1.
  hire: (data: { role: string; level: number; name?: string; salary?: number; specialty?: string }) => request<any>('/staff/members', { method: 'POST', body: JSON.stringify(data) }),
  fire: (id: number) => request<any>(`/staff/members/${id}`, { method: 'DELETE' }),
};

// ─── Manager ───────────────────────────────────────────────────
export const managerApi = {
  getProfile: () => request<any>('/manager/profile'),
  getCareer: () => request<any>('/manager/career'),
  getTutorial: () => request<any>('/manager/tutorial'),
  updateTutorial: (data: any) => request<any>('/manager/tutorial', { method: 'PATCH', body: JSON.stringify(data) }),
  unlockSkill: (nodeId: string) => request<any>('/manager/skills/unlock', { method: 'POST', body: JSON.stringify({ nodeId }) }),
  getOffers: () => request<any[]>('/manager/offers'),
  getVacancies: () => request<any[]>('/manager/vacancies'),
  getPublic: (id: number) => request<any>(`/manager/public/${id}`),
  acceptOffer: (id: number) => request<any>(`/manager/offers/${id}/accept`, { method: 'POST' }),
  rejectOffer: (id: number) => request<any>(`/manager/offers/${id}/reject`, { method: 'POST' }),
  applyVacancy: (id: number) => request<any>(`/manager/vacancies/${id}/apply`, { method: 'POST' }),
};

// ─── Ideología (manual §8) ─────────────────────────────────────
export const ideologyApi = {
  get: () => request<any>('/ideology'),
  updateValues: (values: string[]) => request<any>('/ideology/values', { method: 'PUT', body: JSON.stringify({ values }) }),
  eligibleEmblematics: () => request<any[]>('/ideology/eligible-emblematics'),
  addEmblematic: (playerId: number, retireYear: number) => request<any>('/ideology/emblematic', { method: 'POST', body: JSON.stringify({ playerId, retireYear }) }),
  removeEmblematic: (id: number) => request<any>(`/ideology/emblematic/${id}`, { method: 'DELETE' }),
};

// ─── Scout ─────────────────────────────────────────────────────
export const scoutApi = {
  // F6: overview = { scouts, targets (clubes ojeables), assignments (misiones con progreso) }
  overview: () => request<any>('/scout'),
  getPlayers: () => request<any[]>('/scout/players'),
  // OJO: el server devuelve { scouts, candidates }, no un array
  getStaff: () => request<{ scouts: any[]; candidates: any[] }>('/scout/staff'),
  track: (playerId: number) => request<any>(`/scout/players/${playerId}/track`, { method: 'POST' }),
  hire: (data?: any) => request<any>('/scout/staff/hire', { method: 'POST', body: JSON.stringify(data ?? {}) }),
  assign: (staffId: number, zone: string) => request<any>(`/scout/staff/${staffId}/assign`, { method: 'POST', body: JSON.stringify({ zone }) }),
  // F6: misiones de ojeo sobre un club objetivo
  assignClub: (scoutStaffId: number, clubTargetId: number) =>
    request<any>('/scout/assignments', { method: 'POST', body: JSON.stringify({ scoutStaffId, clubTargetId }) }),
  progressAssignment: (assignmentId: number) =>
    request<any>(`/scout/assignments/${assignmentId}/progress`, { method: 'POST' }),
  cancelAssignment: (assignmentId: number) =>
    request<any>(`/scout/assignments/${assignmentId}`, { method: 'DELETE' }),
};

// ─── National ──────────────────────────────────────────────────
export const nationalApi = {
  getTeams: () => request<any[]>('/national/teams'),
  getMyTeam: () => request<any>('/national/my-team'),
  applyForManager: (countryId: number) => request<any>('/national/apply', { method: 'POST', body: JSON.stringify({ countryId }) }),
  callPlayer: (playerId: number) => request<any>('/national/call-up', { method: 'POST', body: JSON.stringify({ playerId }) }),
  uncallPlayer: (callId: number) => request<any>(`/national/call-up/${callId}`, { method: 'DELETE' }),
};

// ─── Chat ──────────────────────────────────────────────────────
export const chatApi = {
  getChannels: () => request<any[]>('/chat/channels'),
  getMessages: (channel: string, take = 50, before?: number, signal?: AbortSignal) => {
    const params = new URLSearchParams({ take: String(take) });
    if (before != null) params.set('before', String(before));
    return request<any>(`/chat/${channel}?${params.toString()}`, { signal });
  },
  postMessage: (channel: string, text: string) =>
    request<any>(`/chat/${channel}`, { method: 'POST', body: JSON.stringify({ text }) }),
  // Y11: titulares vivos del universo FDF que alimentan la taberna.
  tavernEvents: (take = 12) => request<any>(`/chat/tavern/events?take=${take}`),
};

// ─── Subastas en vivo (Etapa 8) — contrato confirmado en API_UI.md §11 ────────
export const auctionsApi = {
  list: (status?: string) => request<AuctionSummary[]>(`/auctions${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get: (id: number) => request<AuctionDetail>(`/auctions/${id}`),
  events: (id: number, afterBidId?: number) =>
    request<{ auction: AuctionDetail; events: { type: string; payload?: unknown }[]; nextAfter?: number }>(
      `/auctions/${id}/events${afterBidId != null ? `?afterBidId=${afterBidId}` : ''}`,
    ),
  create: (listingId: number, durationSeconds: number, reservePrice?: number) =>
    request<AuctionDetail>('/auctions', { method: 'POST', body: JSON.stringify({ listingId, durationSeconds, reservePrice }) }),
  bid: (id: number, amount: number) =>
    request<AuctionBidResponse>(`/auctions/${id}/bids`, { method: 'POST', body: JSON.stringify({ amount }) }),
  close: (id: number) => request<AuctionDetail>(`/auctions/${id}/close`, { method: 'POST' }),
};

// ─── Negociación formal TransferAgreement (Etapa 8) — API_UI.md §11 ───────────
export interface NegotiationInput {
  type: 'sale' | 'loan' | 'exchange';
  targetClubId: number;
  playerId: number;
  amount?: number;
  message?: string;
}
export const negotiationsApi = {
  list: (status?: string) => request<any[]>(`/negotiations${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  get: (id: number) => request<any>(`/negotiations/${id}`),
  propose: (input: NegotiationInput) => request<any>('/negotiations', { method: 'POST', body: JSON.stringify(input) }),
  accept: (id: number) => request<any>(`/negotiations/${id}/accept`, { method: 'POST' }),
  reject: (id: number) => request<any>(`/negotiations/${id}/reject`, { method: 'POST' }),
  counter: (id: number, input: NegotiationInput) =>
    request<any>(`/negotiations/${id}/counter`, { method: 'POST', body: JSON.stringify(input) }),
};

// ─── Universo vivo (Etapa 7): news, premios, leaderboards ───────
export const newsApi = {
  get: (page = 1) => request<any>(`/news?page=${page}`),
  markRead: (id: number) => request<any>(`/news/${id}/read`, { method: 'PUT' }),
};
export const awardsApi = {
  bySeason: (season?: string) => request<any[]>(`/awards${season ? `?season=${encodeURIComponent(season)}` : ''}`),
  clubHonours: (clubId: number) => request<any>(`/club/${clubId}/honours`),
};
export const leaderboardsApi = {
  goals: () => request<any[]>('/leaderboards/goals'),
  assists: () => request<any[]>('/leaderboards/assists'),
  ratings: () => request<any[]>('/leaderboards/ratings'),
};

// ─── B14 · Memoria del Mundo (módulo memory; ver API_UI §MemoriaMundo) ────────
export const memoryApi = {
  overview: () => request<any>('/memory/overview'),
  palmares: (f: { season?: string; clubId?: number; competitionId?: number; skip?: number; take?: number } = {}) => {
    const p = new URLSearchParams();
    if (f.season) p.set('season', f.season);
    if (f.clubId != null) p.set('clubId', String(f.clubId));
    if (f.competitionId != null) p.set('competitionId', String(f.competitionId));
    if (f.skip != null) p.set('skip', String(f.skip));
    if (f.take != null) p.set('take', String(f.take));
    return request<any>(`/memory/palmares?${p.toString()}`);
  },
  archive: (f: { q?: string; type?: string; clubId?: number; skip?: number; take?: number } = {}) => {
    const p = new URLSearchParams();
    if (f.q) p.set('q', f.q);
    if (f.type) p.set('type', f.type);
    if (f.clubId != null) p.set('clubId', String(f.clubId));
    if (f.skip != null) p.set('skip', String(f.skip));
    if (f.take != null) p.set('take', String(f.take));
    return request<any>(`/memory/archive?${p.toString()}`);
  },
  records: (take = 10) => request<any>(`/memory/records?take=${take}`),
  legends: (clubId: number) => request<any>(`/memory/clubs/${clubId}/legends`),
  headToHead: (clubA: number, clubB: number) => request<any>(`/memory/head-to-head?clubA=${clubA}&clubB=${clubB}`),
};

// ─── Shares ────────────────────────────────────────────────────
export const sharesApi = {
  getClubShares: (clubId: number) => request<any>(`/shares/${clubId}`),
  getRanking: () => request<any[]>('/shares/ranking'),
  buy: (clubId: number, shares: number) =>
    request<any>('/shares/buy', { method: 'POST', body: JSON.stringify({ clubId, shares }) }),
  sell: (clubId: number, shares: number) =>
    request<any>('/shares/sell', { method: 'POST', body: JSON.stringify({ clubId, shares }) }),
};

// ─── Elections ─────────────────────────────────────────────────
export const electionsApi = {
  list: (filters: { countryId?: number; period?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.countryId) params.set('countryId', String(filters.countryId));
    if (filters.period) params.set('period', filters.period);
    const qs = params.toString();
    return request<any[]>(`/elections${qs ? `?${qs}` : ''}`);
  },
  get: (id: number) => request<any>(`/elections/${id}`),
  open: (countryId: number) =>
    request<any>('/elections/open', { method: 'POST', body: JSON.stringify({ countryId }) }),
  apply: (electionId: number) =>
    request<any>('/elections/apply', { method: 'POST', body: JSON.stringify({ electionId }) }),
  vote: (electionId: number, candidateManagerId: number) =>
    request<any>('/elections/vote', { method: 'POST', body: JSON.stringify({ electionId, candidateManagerId }) }),
};

// ─── Forum ─────────────────────────────────────────────────────
export const forumApi = {
  listThreads: (category?: string) => {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    return request<any[]>(`/forum/threads${params}`);
  },
  getThread: (id: number) => request<any>(`/forum/threads/${id}`),
  createThread: (category: string, title: string, text: string) =>
    request<any>('/forum/threads', { method: 'POST', body: JSON.stringify({ category, title, text }) }),
  reply: (threadId: number, text: string) =>
    request<any>(`/forum/threads/${threadId}/reply`, { method: 'POST', body: JSON.stringify({ text }) }),
};

// ─── Fans ──────────────────────────────────────────────────────
export const fansApi = {
  mood: () => request<any>('/fans/mood'),
  // B16 · análisis ampliado (API_UI §FansAnalysis): evolución, conversión y comparativa
  analysis: () => request<any>('/fans/analysis'),
  get: () => request<any>('/fans'),
  startCampaign: (type: string) =>
    request<any>('/fans/campaigns', { method: 'POST', body: JSON.stringify({ type }) }),
};

// ─── World ─────────────────────────────────────────────────────
export const worldApi = {
  summary: () => request<any>('/world/summary'),
  // QW-29: "Mientras no estabas" digest
  
  // El backend devuelve { competitions: [...] } (LeaguePage/WorldPage leen .competitions)
  competitions: () => request<any>('/world/competitions'),
  standings: (filters: { division?: string; country?: string; tier?: number } = {}) => {
    const p = new URLSearchParams();
    if (filters.division) p.set('division', filters.division);
    if (filters.country) p.set('country', filters.country);
    if (filters.tier != null) p.set('tier', String(filters.tier));
    const qs = p.toString();
    return request<{
      season?: { id: number; name: string; year: number } | null;
      competitions: {
        id: number; name: string; shortName?: string; country?: string; tier: number;
        promotionSlots: number; relegationSlots: number;
        table: {
          position: number; played: number; won: number; drawn: number; lost: number;
          goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
          movementZone?: 'promotion' | 'relegation' | 'safe';
          club: {
            id: number; name: string; shortName: string; badge?: string;
            primaryColor?: string; secondaryColor?: string;
            manager?: { id: number; name: string };
            npcCoach?: { name: string; avatarSeed?: string; tacticalStyle?: { favoriteFormation?: string } };
          };
        }[];
      }[];
    }>(`/world/standings${qs ? `?${qs}` : ''}`);
  },
  competition: (id: number) => request<any>(`/world/competitions/${id}`),
  competitionFixtures: (id: number) => request<any>(`/world/competitions/${id}/fixtures`),
  competitionSquadAudit: (id: number) => request<any>(`/world/competitions/${id}/squad-audit`),
  // E9: cuadro de copa y rankings por competición
  cup: (competitionId?: number) => request<any>(`/world/cup${competitionId ? `?competitionId=${competitionId}` : ''}`),
  leaderboards: (f: { competitionId?: number; take?: number } = {}) => {
    const p = new URLSearchParams();
    if (f.competitionId) p.set('competitionId', String(f.competitionId));
    if (f.take) p.set('take', String(f.take));
    return request<any>(`/world/leaderboards?${p.toString()}`);
  },
  clubs: (filters: { country?: string; q?: string; competitionId?: number; take?: number } = {}) => {
    const params = new URLSearchParams();
    if (filters.country) params.set('country', filters.country);
    if (filters.q) params.set('q', filters.q);
    if (filters.competitionId) params.set('competitionId', String(filters.competitionId));
    if (filters.take) params.set('take', String(filters.take));
    const qs = params.toString();
    return request<any[]>(`/world/clubs${qs ? `?${qs}` : ''}`);
  },
  club: (id: number) => request<any>(`/world/clubs/${id}`),
  clubSquadAudit: (id: number) => request<any>(`/world/clubs/${id}/squad-audit`),
};

// ─── Push Notifications ──────────────────────────────────────
export const pushApi = {
  getConfig: () => request<{ enabled: boolean; vapidPublicKey: string | null }>('/push/config'),
  subscribe: (subscription: PushSubscriptionJSON) => 
    request<{ success: boolean }>('/push/subscriptions', { method: 'POST', body: JSON.stringify(subscription) }),
  unsubscribe: (endpoint: string) => 
    request<{ success: boolean }>('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  test: () => request<{ success: boolean }>('/push/test', { method: 'POST' }),
};

// ─── Missions ────────────────────────────────────────────────
export const missionsApi = {
  get: () => request<any>('/missions'),
};

export const dashboardApi = {
  zoneBadges: (since?: string) => request<any>(`/dashboard/zone-badges${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  turnChecklist: () => request<any>('/dashboard/turn-checklist'),
  whileAway: (since?: string) => request<any>(`/dashboard/while-away${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  dailyCover: () => request<any>('/dashboard/daily-cover'),
  shellContext: () => request<any>('/dashboard/shell-context'),
};

export const publicApi = {
  ticker: () => request<any>('/public/ticker'),
  nextTick: () => request<any>('/public/next-tick'),
  stats: () => request<PublicStatsResponse>('/public/stats'),
  standings: (league?: number) => request<any>(`/public/standings${league ? `?league=${league}` : ''}`),
  featuredMatches: () => request<any>('/public/matches/featured'),
  // Y5 · mapa mundial vivo: totales, clubes libres, ligas destacadas y partidos calientes.
  worldMap: (continent?: string) => request<any>(`/public/world/map${continent ? `?continent=${encodeURIComponent(continent)}` : ''}`),
  // X3 · ficha pública de club con npcCoach si no hay mánager humano.
  worldClub: (id: number) => request<{
    id: number; name: string; shortName?: string; manager?: { id: number; name: string } | null;
    npcCoach?: { id: string; name: string; nationality?: string; avatarSeed?: string; pressLine?: string; tacticalStyle?: { favoriteFormation?: string } } | null;
  }>(`/public/world/clubs/${id}`),
  npcCoach: (id: string) => request<any>(`/public/npc-coach/${id}`),
};
