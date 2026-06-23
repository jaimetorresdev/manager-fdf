import { SERVER_STRINGS_ES } from './strings.es';
import { SERVER_STRINGS_FR } from './strings.fr';
import { SERVER_STRINGS_DE } from './strings.de';
import { SERVER_STRINGS_IT } from './strings.it';

// AUDIT i18n / H-46 — el backend SOLO anuncia los 5 idiomas realmente soportados por el
// frontend, todos con traducción PROPIA:
//   • es: nativo · en: nativo · fr/de/it: traducción humana real (no alias de inglés).
// Se RETIRARON `ca`, `va`, `gl`, `eu`: antes se anunciaban pero devolvían castellano 1:1
// (no es honesto ofrecer un idioma que no traduce). Reincorporar solo con traducción real.
export const SUPPORTED_SERVER_LOCALES = ['es', 'en', 'fr', 'de', 'it'] as const;
export type ServerLocale = typeof SUPPORTED_SERVER_LOCALES[number];

const es = SERVER_STRINGS_ES;
type ServerStringKey = keyof typeof SERVER_STRINGS_ES;
type ServerStringMap = Record<ServerStringKey, string>;

const en: ServerStringMap = {
  'notification.turn_processed.title': 'Turn processed',
  'notification.turn_processed.body': 'The turn has been processed. Check your squad and finances.',
  'notification.push_test.title': 'Manager FDF',
  'notification.push_test.body': 'Test notification',
  'news.press_conference.subject': 'Press conference published',
  'news.press_conference.body': 'Your statement has been picked up by the press.',
  'press.answer.published.subject': 'Press answer published',
  'press.answer.humble': 'We keep working, this is down to the group.',
  'press.answer.neutral': 'We will analyse the match calmly and fix details.',
  'press.answer.aggressive': 'We must demand much more and cannot settle.',
  'market.offer_sent': 'Offer sent.',
  'market.offer_rejected': 'Offer rejected.',
  'manager.vacancy_applied': 'Application sent.',
  'push.live_goal.title': 'Live goal',
  'push.auction_outbid.title': 'You have been outbid',
};

export const SERVER_STRINGS: Record<ServerLocale, ServerStringMap> = {
  es,
  en,
  fr: SERVER_STRINGS_FR,
  de: SERVER_STRINGS_DE,
  it: SERVER_STRINGS_IT,
};

export function normalizeLocale(raw: string | undefined | null): ServerLocale {
  const base = String(raw ?? 'es').toLowerCase().split('-')[0];
  return (SUPPORTED_SERVER_LOCALES as readonly string[]).includes(base) ? base as ServerLocale : 'es';
}

export function serverT(key: keyof typeof es, locale: string | undefined | null = 'es') {
  const normalized = normalizeLocale(locale);
  return SERVER_STRINGS[normalized][key] ?? SERVER_STRINGS.es[key] ?? key;
}
