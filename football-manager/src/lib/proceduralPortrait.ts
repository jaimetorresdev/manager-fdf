import { bandForAge } from './portraitLibrary';

const baseModules = import.meta.glob('../assets/pixel-parts/base/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const hairModules = import.meta.glob('../assets/pixel-parts/hair/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const beardModules = import.meta.glob('../assets/pixel-parts/facial_hair/*.{png,webp,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const bases = Object.values(baseModules).sort();
const hairs = Object.values(hairModules).sort();
const beards = Object.values(beardModules).sort();

export const hasProceduralParts = bases.length > 0;

// Deterministic RNG (same as comicFace)
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(id: number): number {
  const safe = Number.isFinite(id) ? id : 0;
  return ((safe * 2654435761) % 2 ** 31) >>> 0;
}

export interface ProceduralLayers {
  base: string;
  hair: string | null;
  beard: string | null;
}

export function proceduralPortrait(id: number, age?: number): ProceduralLayers | null {
  if (!hasProceduralParts) return null;
  
  const r = mulberry32(seedOf(id));
  const band = bandForAge(age);
  
  // Pick base (skin tone / head shape)
  const base = bases[Math.floor(r() * bases.length)]!;
  
  // Pick hair (young and prime always have hair, vets might go bald)
  let hair: string | null = null;
  if (hairs.length > 0) {
    const isBald = band === 'vet' && r() < 0.3; // 30% chance for veterans to be bald
    if (!isBald) {
      hair = hairs[Math.floor(r() * hairs.length)]!;
    }
  }

  // Pick beard (young almost never have, prime sometimes, vets often)
  let beard: string | null = null;
  if (beards.length > 0) {
    let beardChance = 0.1; // young
    if (band === 'prime') beardChance = 0.5;
    if (band === 'vet') beardChance = 0.8;
    
    if (r() < beardChance) {
      beard = beards[Math.floor(r() * beards.length)]!;
    }
  }

  return { base, hair, beard };
}
