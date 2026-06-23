export type DecisionImpactKind =
  | 'tactics'
  | 'training'
  | 'transfers'
  | 'staff'
  | 'stadium'
  | 'academy'
  | 'fans'
  | 'economy'
  | 'identity'
  | 'press'
  | 'career';

export interface DecisionImpactDetail {
  kind: DecisionImpactKind;
  route: string;
}

const RULES: Array<{ matcher: RegExp; kind: DecisionImpactKind; route: string }> = [
  { matcher: /^\/tactics(?:\/|$)/, kind: 'tactics', route: '/tactics' },
  { matcher: /^\/training(?:\/|$)/, kind: 'training', route: '/training' },
  { matcher: /^\/(?:market|offers|negotiations|auctions)(?:\/|$)/, kind: 'transfers', route: '/negotiations' },
  { matcher: /^\/staff(?:\/|$)/, kind: 'staff', route: '/staff' },
  { matcher: /^\/stadium(?:\/|$)/, kind: 'stadium', route: '/stadium' },
  { matcher: /^\/(?:academy|residences)(?:\/|$)/, kind: 'academy', route: '/residences' },
  { matcher: /^\/fans(?:\/|$)/, kind: 'fans', route: '/fans' },
  { matcher: /^\/(?:economy|shares)(?:\/|$)/, kind: 'economy', route: '/economy' },
  { matcher: /^\/ideology(?:\/|$)/, kind: 'identity', route: '/ideology' },
  { matcher: /^\/(?:press|news\/questions)(?:\/|$)/, kind: 'press', route: '/news' },
  { matcher: /^\/manager\/(?:skills|offers|vacancies)(?:\/|$)/, kind: 'career', route: '/career' },
];

const IGNORED = [
  /^\/manager\/tutorial$/,
  /^\/matches\/\d+\/seen$/,
  /^\/auth(?:\/|$)/,
  /^\/onboarding(?:\/|$)/,
  /^\/notifications(?:\/|$)/,
  /^\/market\/(?:shortlist|evaluate)(?:\/|$)/,
];

let lastUserDecisionAt = 0;

if (typeof window !== 'undefined') {
  const markDecisionIntent = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const control = target.closest('button,[role="button"],input,select,textarea');
    if (!control || control.closest('a')) return;
    lastUserDecisionAt = Date.now();
  };
  window.addEventListener('pointerdown', markDecisionIntent, true);
  window.addEventListener('change', markDecisionIntent, true);
  window.addEventListener('input', markDecisionIntent, true);
}

export function emitDecisionImpact(path: string, method = 'GET') {
  if (typeof window === 'undefined') return;
  const normalizedMethod = method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) return;
  // No mostramos consecuencias por autosaves de montaje, sincronizaciones o tareas
  // de fondo: solo cuando existe una interacción reciente con un control de decisión.
  if (Date.now() - lastUserDecisionAt > 6_000) return;
  if (IGNORED.some((rule) => rule.test(path))) return;
  const match = RULES.find((rule) => rule.matcher.test(path));
  if (!match) return;
  window.dispatchEvent(new CustomEvent<DecisionImpactDetail>('fdf:decision-impact', {
    detail: { kind: match.kind, route: match.route },
  }));
}
