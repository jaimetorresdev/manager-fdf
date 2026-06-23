import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from '../locales/es.json';
import en from '../locales/en.json';
import fr from '../locales/fr.json';
import de from '../locales/de.json';
import it from '../locales/it.json';

import gameplayEs from '../locales/gameplay.es.json';
import gameplayEn from '../locales/gameplay.en.json';
import gameplayFr from '../locales/gameplay.fr.json';
import gameplayDe from '../locales/gameplay.de.json';
import gameplayIt from '../locales/gameplay.it.json';

export const SUPPORTED_LOCALES = ['es', 'en', 'fr', 'de', 'it'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

const LOCALE_KEY = 'fdf_locale';

function browserLocale(): AppLocale | null {
  if (typeof navigator === 'undefined') return null;
  const raw = navigator.language?.split('-')[0]?.toLowerCase();
  if (raw && SUPPORTED_LOCALES.includes(raw as AppLocale)) return raw as AppLocale;
  return null;
}

export function getStoredLocale(): AppLocale {
  const raw = localStorage.getItem(LOCALE_KEY);
  if (raw && SUPPORTED_LOCALES.includes(raw as AppLocale)) return raw as AppLocale;
  return browserLocale() ?? 'es';
}

export function setStoredLocale(locale: AppLocale) {
  localStorage.setItem(LOCALE_KEY, locale);
}

const resources = {
  es: { common: es, gameplay: gameplayEs },
  en: { common: en, gameplay: gameplayEn },
  fr: { common: fr, gameplay: gameplayFr },
  de: { common: de, gameplay: gameplayDe },
  it: { common: it, gameplay: gameplayIt },
};

void i18n.use(initReactI18next).init({
  resources,
  lng: getStoredLocale(),
  fallbackLng: false, // Strict parity requirement
  ns: ['common', 'gameplay'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18n;
