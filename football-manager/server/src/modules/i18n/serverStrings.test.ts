import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_SERVER_LOCALES,
  SERVER_STRINGS,
  normalizeLocale,
  serverT,
} from './serverStrings';

// AUDIT i18n / H-46 — el backend se alinea con los 5 idiomas reales del frontend,
// todos con traducción propia. No se anuncian ca/va/gl/eu (eran ES 1:1), y fr/de/it
// no son alias de inglés.

describe('alineación de locales del servidor', () => {
  it('anuncia exactamente es, en, fr, de, it (5 idiomas)', () => {
    expect([...SUPPORTED_SERVER_LOCALES]).toEqual(['es', 'en', 'fr', 'de', 'it']);
  });

  it('NO anuncia ca/va/gl/eu (se retiraron por no traducir)', () => {
    for (const ghost of ['ca', 'va', 'gl', 'eu']) {
      expect((SUPPORTED_SERVER_LOCALES as readonly string[]).includes(ghost)).toBe(false);
    }
  });

  it('fr/de/it tienen traducción PROPIA (no son iguales a inglés ni a español)', () => {
    const probe = 'notification.turn_processed.title' as const;
    expect(SERVER_STRINGS.fr[probe]).not.toBe(SERVER_STRINGS.en[probe]);
    expect(SERVER_STRINGS.de[probe]).not.toBe(SERVER_STRINGS.en[probe]);
    expect(SERVER_STRINGS.it[probe]).not.toBe(SERVER_STRINGS.en[probe]);
    expect(SERVER_STRINGS.fr[probe]).not.toBe(SERVER_STRINGS.es[probe]);
  });

  it('cada locale traduce TODAS las claves de es (sin huecos)', () => {
    const keys = Object.keys(SERVER_STRINGS.es);
    for (const loc of SUPPORTED_SERVER_LOCALES) {
      for (const k of keys) {
        expect(SERVER_STRINGS[loc][k as keyof typeof SERVER_STRINGS.es]).toBeTruthy();
      }
    }
  });

  it('normalizeLocale: idiomas no soportados (incl. ca) caen a es', () => {
    expect(normalizeLocale('ca')).toBe('es');
    expect(normalizeLocale('pt-BR')).toBe('es');
    expect(normalizeLocale('fr-FR')).toBe('fr');
    expect(normalizeLocale(undefined)).toBe('es');
  });

  it('serverT devuelve la traducción del idioma pedido', () => {
    expect(serverT('market.offer_sent', 'it')).toBe('Offerta inviata.');
    expect(serverT('market.offer_sent', 'de')).toBe('Angebot gesendet.');
    expect(serverT('market.offer_sent', 'fr')).toBe('Offre envoyée.');
  });
});
