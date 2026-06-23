// ─── Coordenadas de países (espejo de WORLD_COUNTRY_META · public.service.ts) ─
// Usado por WorldMap3D / WorldExplorer (I-37). Normaliza nombres ES/EN del API.

export type CountryCoord = { lat: number; lng: number };

const META: Record<string, CountryCoord> = {
  argentina: { lat: -34.6, lng: -58.4 },
  austria: { lat: 47.5, lng: 14.5 },
  belgica: { lat: 50.8, lng: 4.5 },
  belgium: { lat: 50.8, lng: 4.5 },
  brasil: { lat: -15.8, lng: -47.9 },
  brazil: { lat: -15.8, lng: -47.9 },
  chile: { lat: -33.4, lng: -70.7 },
  china: { lat: 35.9, lng: 104.2 },
  colombia: { lat: 4.7, lng: -74.1 },
  croacia: { lat: 45.1, lng: 15.2 },
  croatia: { lat: 45.1, lng: 15.2 },
  czech: { lat: 49.8, lng: 15.5 },
  chequia: { lat: 49.8, lng: 15.5 },
  denmark: { lat: 56.0, lng: 10.0 },
  dinamarca: { lat: 56.0, lng: 10.0 },
  england: { lat: 52.4, lng: -1.6 },
  escocia: { lat: 56.5, lng: -4.2 },
  espana: { lat: 40.4, lng: -3.7 },
  spain: { lat: 40.4, lng: -3.7 },
  france: { lat: 46.2, lng: 2.2 },
  francia: { lat: 46.2, lng: 2.2 },
  germany: { lat: 51.2, lng: 10.4 },
  alemania: { lat: 51.2, lng: 10.4 },
  grecia: { lat: 39.1, lng: 22.9 },
  greece: { lat: 39.1, lng: 22.9 },
  holanda: { lat: 52.1, lng: 5.3 },
  netherlands: { lat: 52.1, lng: 5.3 },
  paises_bajos: { lat: 52.1, lng: 5.3 },
  inglaterra: { lat: 52.4, lng: -1.6 },
  ireland: { lat: 53.4, lng: -8.2 },
  irlanda: { lat: 53.4, lng: -8.2 },
  italia: { lat: 42.8, lng: 12.5 },
  italy: { lat: 42.8, lng: 12.5 },
  japon: { lat: 36.2, lng: 138.2 },
  japan: { lat: 36.2, lng: 138.2 },
  mexico: { lat: 23.6, lng: -102.5 },
  noruega: { lat: 60.5, lng: 8.5 },
  norway: { lat: 60.5, lng: 8.5 },
  poland: { lat: 51.9, lng: 19.1 },
  polonia: { lat: 51.9, lng: 19.1 },
  portugal: { lat: 39.4, lng: -8.2 },
  rusia: { lat: 55.8, lng: 37.6 },
  russia: { lat: 55.8, lng: 37.6 },
  scotland: { lat: 56.5, lng: -4.2 },
  serbia: { lat: 44.0, lng: 21.0 },
  suecia: { lat: 60.1, lng: 18.6 },
  sweden: { lat: 60.1, lng: 18.6 },
  suiza: { lat: 46.8, lng: 8.2 },
  switzerland: { lat: 46.8, lng: 8.2 },
  turquia: { lat: 39.0, lng: 35.2 },
  turkey: { lat: 39.0, lng: 35.2 },
  ucrania: { lat: 49.0, lng: 31.4 },
  ukraine: { lat: 49.0, lng: 31.4 },
  uruguay: { lat: -34.9, lng: -56.2 },
  usa: { lat: 39.8, lng: -98.6 },
  estados_unidos: { lat: 39.8, lng: -98.6 },
  united_states: { lat: 39.8, lng: -98.6 },
};

// ─── Banderas por país (nombres ES/EN del API) ───────────────────────────────
const FLAG: Record<string, string> = {
  argentina: '🇦🇷', austria: '🇦🇹', belgica: '🇧🇪', belgium: '🇧🇪',
  brasil: '🇧🇷', brazil: '🇧🇷', chile: '🇨🇱', china: '🇨🇳', colombia: '🇨🇴',
  croacia: '🇭🇷', croatia: '🇭🇷', chequia: '🇨🇿', czech: '🇨🇿',
  dinamarca: '🇩🇰', denmark: '🇩🇰', inglaterra: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', england: '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}',
  escocia: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}', scotland: '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
  espana: '🇪🇸', spain: '🇪🇸', francia: '🇫🇷', france: '🇫🇷',
  alemania: '🇩🇪', germany: '🇩🇪', grecia: '🇬🇷', greece: '🇬🇷',
  holanda: '🇳🇱', netherlands: '🇳🇱', paises_bajos: '🇳🇱',
  irlanda: '🇮🇪', ireland: '🇮🇪', italia: '🇮🇹', italy: '🇮🇹',
  japon: '🇯🇵', japan: '🇯🇵', mexico: '🇲🇽', noruega: '🇳🇴', norway: '🇳🇴',
  polonia: '🇵🇱', poland: '🇵🇱', portugal: '🇵🇹', rusia: '🇷🇺', russia: '🇷🇺',
  serbia: '🇷🇸', suecia: '🇸🇪', sweden: '🇸🇪', suiza: '🇨🇭', switzerland: '🇨🇭',
  turquia: '🇹🇷', turkey: '🇹🇷', ucrania: '🇺🇦', ukraine: '🇺🇦',
  uruguay: '🇺🇾', usa: '🇺🇸', estados_unidos: '🇺🇸', united_states: '🇺🇸',
};

/** Bandera emoji para un nombre de país (ES o EN). Devuelve 🌍 si no se reconoce. */
export function countryFlag(country: string): string {
  if (!country) return '🌍';
  const key = normalizeKey(country);
  if (FLAG[key]) return FLAG[key];
  for (const [k, v] of Object.entries(FLAG)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return '🌍';
}

function normalizeKey(country: string): string {
  return country
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

/** Resuelve lat/lng para un nombre de país del API (ES o EN). */
export function resolveCountryCoords(country: string): CountryCoord | null {
  const key = normalizeKey(country);
  if (META[key]) return META[key];
  // alias parcial: "reino unido" → inglaterra si contiene
  for (const [k, v] of Object.entries(META)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

/** Mapa país API → clave canónica para markers 3D */
export function countryCoordsForList(countries: string[]): Record<string, CountryCoord> {
  const out: Record<string, CountryCoord> = {};
  for (const c of countries) {
    const coords = resolveCountryCoords(c);
    if (coords) out[c] = coords;
  }
  return out;
}
