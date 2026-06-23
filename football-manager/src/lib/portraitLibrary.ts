// ─── portraitLibrary — retratos RASTER (pixel-art) deterministas ─────────────────
// Mapea cada jugador a un retrato de una librería de imágenes, de forma determinista
// (mismo id → misma "familia" de cara) y por EDAD (joven/prime/veterano), igual que
// los regen-faces de Football Manager. El arte son imágenes (PNG/WebP/pixel-art) que
// se colocan en `src/assets/portraits/`; este módulo las auto-descubre con Vite glob.
//
// Convención de nombre de archivo:  <familia>__<banda>.<ext>
//   banda ∈ { young | prime | vet }     ext ∈ png | jpg | webp | svg
//   ejemplos:  atleti9__prime.png   leyenda3__vet.png   cantera1__young.png
// Una "familia" = una identidad de cara con 1-3 variantes de edad. Si falta una banda,
// se cae a la más cercana disponible.

// Solo ficheros con la convención `nombre__variante` (p. ej. golazo1__prime.png).
// El patrón `*__*` excluye scratch sueltos (p. ej. _src.png, _work.html) que, al ser
// `eager`, se empaquetarían como assets aunque el bucle de abajo los descarte —
// rompiendo el precache del PWA si son grandes.
const modules = import.meta.glob('../assets/portraits/*__*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

export type AgeBand = 'young' | 'prime' | 'vet';
interface Family { young?: string; prime?: string; vet?: string }

const families: Record<string, Family> = {};

for (const [path, url] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace(/\.[^.]+$/, '');
  const m = name.match(/^(.*?)__(young|prime|vet)$/i);
  if (m) {
    const fam = m[1]!;
    const band = m[2]!.toLowerCase() as AgeBand;
    if (!families[fam]) families[fam] = {};
    families[fam]![band] = (url as any).default || url;
  }
}

const FAMILY_KEYS = Object.keys(families).sort();

/** ¿Hay al menos un retrato en la librería? (si no, el componente cae al fallback). */
export const hasLibrary = FAMILY_KEYS.length > 0;
export const libraryCount = FAMILY_KEYS.length;

function hashId(id: number): number {
  const n = Number.isFinite(id) ? id : 0;
  return ((n * 2654435761) % 2 ** 31) >>> 0;
}

export function bandForAge(age?: number): AgeBand {
  if (age == null) return 'prime';
  if (age <= 22) return 'young';
  if (age <= 31) return 'prime';
  return 'vet';
}

/** URL del retrato para (id, edad), o null si la librería está vacía. Determinista. */
export function libraryPortrait(id: number, age?: number): string | null {
  if (!FAMILY_KEYS.length) return null;
  const fam = families[FAMILY_KEYS[hashId(id) % FAMILY_KEYS.length]!]!;
  const band = bandForAge(age);
  return fam[band] ?? fam.prime ?? fam.young ?? fam.vet ?? null;
}
