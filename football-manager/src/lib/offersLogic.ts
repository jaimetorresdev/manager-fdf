// Contrato publico (Y-offers):
// - normalizeOffer(raw, viewerClubId?) -> estado/direccion/acciones de UI.
// - transitionOfferStatus(status, action) -> maquina determinista de ofertas.
// - validateOfferTerms(terms, context) -> errores de importe/contrato/clausula.
// - groupOfferInbox(offers) -> tabs recibidas/enviadas/historial.
// - assignScoutToTrackedPlayer(scouts, assignments, target) -> ojeador recomendado
//   y plan de informe para el siguiente turno.
//
// Modulo puro: no llama endpoints ni muta datos. El backend sigue siendo la
// fuente de verdad de aceptacion real y limites de plantilla.

export type OfferDirection = 'received' | 'sent' | 'history';
export type OfferStatus =
  | 'pending'
  | 'agent_proposed'
  | 'accepted'
  | 'accepted_pending_window'
  | 'rejected'
  | 'withdrawn'
  | 'expired'
  | 'countered';

export type OfferAction = 'accept' | 'reject' | 'counter' | 'withdraw' | 'edit' | 'expire' | 'mark_pending_window';

export interface OfferTerms {
  amount?: number | null;
  salary?: number | null;
  years?: number | null;
  clause?: number | null;
}

export interface OfferValidationContext {
  minAmount?: number | null;
  marketValue?: number | null;
  releaseClause?: number | null;
  buyerBudget?: number | null;
  maxWage?: number | null;
  currentContractYears?: number | null;
  playerAge?: number | null;
}

export interface OfferValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  normalized: Required<OfferTerms>;
}

export interface RawOfferLike {
  id?: number | string;
  status?: string | null;
  amount?: number | null;
  salary?: number | null;
  contractYears?: number | null;
  years?: number | null;
  releaseClause?: number | null;
  clause?: number | null;
  fromClubId?: number | null;
  toClubId?: number | null;
  player?: { id?: number | string; name?: string; position?: string; marketValue?: number | null } | null;
  fromClub?: { id?: number | null; name?: string; shortName?: string; badge?: string | null } | null;
  toClub?: { id?: number | null; name?: string; shortName?: string; badge?: string | null } | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  canCancel?: boolean | null;
  canEdit?: boolean | null;
}

export interface NormalizedOffer {
  id: string;
  direction: OfferDirection;
  status: OfferStatus;
  label: string;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'muted';
  amount: number;
  salary: number;
  years: number;
  clause: number;
  player: { id: string | null; name: string; position: string; marketValue: number };
  fromClub: { id: number | null; name: string; shortName: string; badge: string | null };
  toClub: { id: number | null; name: string; shortName: string; badge: string | null };
  actions: {
    canAccept: boolean;
    canReject: boolean;
    canCounter: boolean;
    canWithdraw: boolean;
    canEdit: boolean;
  };
  createdAt: string | null;
  updatedAt: string | null;
}

export interface OfferInbox {
  received: NormalizedOffer[];
  sent: NormalizedOffer[];
  history: NormalizedOffer[];
  pendingCount: number;
  actionRequiredCount: number;
}

export interface ScoutLike {
  id: number | string;
  name?: string | null;
  level?: number | null;
  rating?: number | null;
  effectiveness?: number | null;
  zone?: string | null;
}

export interface ScoutAssignmentLike {
  id?: number | string;
  scoutStaffId?: number | string | null;
  playerId?: number | string | null;
  clubTargetId?: number | string | null;
  analysisPoints?: number | null;
  status?: string | null;
}

export interface ScoutTargetLike {
  playerId: number | string;
  playerName?: string | null;
  clubId?: number | string | null;
  country?: string | null;
}

export interface ScoutPlan {
  ok: boolean;
  scoutId: string | null;
  playerId: string;
  assignmentId: string | null;
  alreadyAssigned: boolean;
  reportTurn: 'next_turn' | 'already_in_progress' | 'blocked';
  initialProgress: number;
  reason: string;
}

const STATUS_META: Record<OfferStatus, { label: string; tone: NormalizedOffer['tone']; terminal: boolean }> = {
  pending: { label: 'Pendiente', tone: 'warning', terminal: false },
  agent_proposed: { label: 'Propuesta del agente', tone: 'warning', terminal: false },
  accepted: { label: 'Aceptada', tone: 'success', terminal: true },
  accepted_pending_window: { label: 'Aceptada, espera ventana', tone: 'success', terminal: true },
  rejected: { label: 'Rechazada', tone: 'danger', terminal: true },
  withdrawn: { label: 'Retirada', tone: 'muted', terminal: true },
  expired: { label: 'Caducada', tone: 'muted', terminal: true },
  countered: { label: 'Contraoferta enviada', tone: 'info', terminal: true },
};

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function strId(value: unknown): string {
  return value == null ? '' : String(value);
}

function statusOf(value: unknown): OfferStatus {
  const raw = typeof value === 'string' ? value : '';
  return raw in STATUS_META ? raw as OfferStatus : 'pending';
}

function clubOf(value: RawOfferLike['fromClub'], fallbackId?: number | null) {
  return {
    id: value?.id ?? fallbackId ?? null,
    name: value?.name ?? value?.shortName ?? 'Club',
    shortName: value?.shortName ?? value?.name ?? 'Club',
    badge: value?.badge ?? null,
  };
}

function inferDirection(raw: RawOfferLike, viewerClubId?: number | null): OfferDirection {
  const status = statusOf(raw.status);
  if (STATUS_META[status].terminal) return 'history';
  if (viewerClubId != null && raw.toClubId === viewerClubId) return 'received';
  if (viewerClubId != null && raw.fromClubId === viewerClubId) return 'sent';
  return raw.canCancel || raw.canEdit ? 'sent' : 'received';
}

export function normalizeOffer(raw: RawOfferLike, viewerClubId?: number | null): NormalizedOffer {
  const status = statusOf(raw.status);
  const direction = inferDirection(raw, viewerClubId);
  const active = !STATUS_META[status].terminal;
  const isReceived = direction === 'received';
  const isSent = direction === 'sent';
  return {
    id: strId(raw.id),
    direction,
    status,
    label: STATUS_META[status].label,
    tone: STATUS_META[status].tone,
    amount: Math.max(0, Math.round(num(raw.amount))),
    salary: Math.max(0, Math.round(num(raw.salary))),
    years: Math.max(0, Math.round(num(raw.contractYears ?? raw.years))),
    clause: Math.max(0, Math.round(num(raw.releaseClause ?? raw.clause))),
    player: {
      id: raw.player?.id == null ? null : strId(raw.player.id),
      name: raw.player?.name ?? 'Jugador',
      position: raw.player?.position ?? 'MED',
      marketValue: Math.max(0, Math.round(num(raw.player?.marketValue))),
    },
    fromClub: clubOf(raw.fromClub, raw.fromClubId),
    toClub: clubOf(raw.toClub, raw.toClubId),
    actions: {
      canAccept: active && isReceived && (status === 'pending' || status === 'agent_proposed'),
      canReject: active && isReceived && (status === 'pending' || status === 'agent_proposed'),
      canCounter: active && isReceived && (status === 'pending' || status === 'agent_proposed'),
      canWithdraw: active && isSent && (raw.canCancel ?? status === 'pending'),
      canEdit: active && isSent && (raw.canEdit ?? status === 'pending'),
    },
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
  };
}

export function transitionOfferStatus(status: OfferStatus, action: OfferAction): { ok: true; status: OfferStatus } | { ok: false; error: string } {
  if (STATUS_META[status].terminal) {
    return { ok: false, error: 'La oferta ya esta cerrada.' };
  }
  if (action === 'accept') return { ok: true, status: 'accepted' };
  if (action === 'reject') return { ok: true, status: 'rejected' };
  if (action === 'counter') return { ok: true, status: 'countered' };
  if (action === 'expire') return { ok: true, status: 'expired' };
  if (action === 'mark_pending_window') return { ok: true, status: 'accepted_pending_window' };
  if (action === 'withdraw') {
    return status === 'pending'
      ? { ok: true, status: 'withdrawn' }
      : { ok: false, error: 'Solo se puede retirar una oferta pendiente.' };
  }
  if (action === 'edit') {
    return status === 'pending'
      ? { ok: true, status }
      : { ok: false, error: 'Solo se puede modificar una oferta pendiente.' };
  }
  return { ok: false, error: 'Accion no soportada.' };
}

function legalClauseLimit(salary: number, years: number): number {
  if (years >= 5) return salary * 200;
  if (years >= 4) return salary * 300;
  if (years >= 3) return salary * 400;
  if (years >= 2) return salary * 500;
  return salary * 600;
}

export function validateOfferTerms(terms: OfferTerms, context: OfferValidationContext = {}): OfferValidation {
  const normalized = {
    amount: Math.round(num(terms.amount)),
    salary: Math.round(num(terms.salary)),
    years: Math.round(num(terms.years)),
    clause: Math.round(num(terms.clause)),
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  if (normalized.amount <= 0) errors.push('El importe debe ser mayor que cero.');
  if (context.minAmount != null && normalized.amount < context.minAmount) errors.push('El importe esta por debajo del minimo exigido.');
  if (context.releaseClause != null && normalized.amount >= context.releaseClause) warnings.push('La oferta alcanza la clausula: el pago directo puede ser mejor.');
  if (context.buyerBudget != null && normalized.amount + normalized.salary > context.buyerBudget) {
    errors.push('El club comprador no tiene efectivo suficiente (traspaso + salario mensual).');
  }
  if (normalized.salary < 0) errors.push('El salario no puede ser negativo.');
  if (context.maxWage != null && normalized.salary > context.maxWage) errors.push('El salario supera el tope salarial estimado.');
  if (normalized.years !== 0 && (normalized.years < 1 || normalized.years > 5)) errors.push('Los anos de contrato deben estar entre 1 y 5.');
  if (context.currentContractYears != null && normalized.years + context.currentContractYears > 5) {
    errors.push('La renovacion no puede superar 5 temporadas acumuladas.');
  }
  if (context.playerAge != null && context.playerAge >= 33 && normalized.years > 0) {
    errors.push('Un jugador de 33 anos o mas no acepta renovar.');
  }
  if (normalized.salary > 0 && normalized.years > 0 && normalized.clause > legalClauseLimit(normalized.salary, normalized.years)) {
    errors.push('La clausula supera el limite legal para esos anos de contrato.');
  }
  if (context.marketValue != null && normalized.amount < context.marketValue * 0.6) {
    warnings.push('Oferta agresiva: muy por debajo del valor de mercado.');
  }
  return { ok: errors.length === 0, errors, warnings, normalized };
}

export function groupOfferInbox(rawOffers: readonly RawOfferLike[], viewerClubId?: number | null): OfferInbox {
  const normalized = rawOffers
    .map((offer) => normalizeOffer(offer, viewerClubId))
    .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  return {
    received: normalized.filter((offer) => offer.direction === 'received'),
    sent: normalized.filter((offer) => offer.direction === 'sent'),
    history: normalized.filter((offer) => offer.direction === 'history'),
    pendingCount: normalized.filter((offer) => !STATUS_META[offer.status].terminal).length,
    actionRequiredCount: normalized.filter((offer) => offer.actions.canAccept || offer.actions.canReject || offer.actions.canCounter).length,
  };
}

function scoutScore(scout: ScoutLike): number {
  return num(scout.effectiveness, num(scout.rating, num(scout.level, 1) * 20));
}

export function assignScoutToTrackedPlayer(
  scouts: readonly ScoutLike[],
  assignments: readonly ScoutAssignmentLike[],
  target: ScoutTargetLike,
): ScoutPlan {
  const playerId = strId(target.playerId);
  const existing = assignments.find((assignment) => strId(assignment.playerId) === playerId);
  if (existing) {
    return {
      ok: true,
      scoutId: existing.scoutStaffId == null ? null : strId(existing.scoutStaffId),
      playerId,
      assignmentId: existing.id == null ? null : strId(existing.id),
      alreadyAssigned: true,
      reportTurn: 'already_in_progress',
      initialProgress: Math.max(0, num(existing.analysisPoints)),
      reason: 'El jugador ya tiene informe en curso.',
    };
  }
  if (scouts.length === 0) {
    return {
      ok: false,
      scoutId: null,
      playerId,
      assignmentId: null,
      alreadyAssigned: false,
      reportTurn: 'blocked',
      initialProgress: 0,
      reason: 'Necesitas contratar al menos un ojeador.',
    };
  }
  const load = new Map<string, number>();
  for (const assignment of assignments) {
    const scoutId = assignment.scoutStaffId == null ? null : strId(assignment.scoutStaffId);
    if (scoutId) load.set(scoutId, (load.get(scoutId) ?? 0) + 1);
  }
  const selected = [...scouts].sort((a, b) =>
    (load.get(strId(a.id)) ?? 0) - (load.get(strId(b.id)) ?? 0)
    || scoutScore(b) - scoutScore(a)
    || strId(a.id).localeCompare(strId(b.id)))[0];
  return {
    ok: true,
    scoutId: strId(selected?.id),
    playerId,
    assignmentId: null,
    alreadyAssigned: false,
    reportTurn: 'next_turn',
    initialProgress: Math.min(35, 10 + Math.round(scoutScore(selected ?? { id: '0' }) / 20) * 5),
    reason: `Asignar a ${selected?.name ?? 'ojeador'} para informe en el siguiente turno.`,
  };
}
