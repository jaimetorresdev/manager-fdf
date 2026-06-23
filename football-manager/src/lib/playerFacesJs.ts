// ─── playerFacesJs — caricaturas deterministas estilo cromo 90s ─────────────────

import { generate } from 'facesjs';
import type { FaceConfig, Race } from 'facesjs';

const RACES: Race[] = ['white', 'black', 'asian', 'brown'];

const SYMMETRIC_HEADS = [
  'head1', 'head2', 'head3', 'head4', 'head5', 'head6', 'head7', 'head8', 'head9',
  'head10', 'head11',
] as const;

const CARICATURE_HEADS = ['head4', 'head5', 'head7', 'head8', 'head9', 'head10', 'head11'] as const;
const YOUTH_HEADS = ['head12', 'head13', 'head14', 'head15', 'head16'] as const;

const EXPRESSIVE_EYES = [
  'eye5', 'eye6', 'eye7', 'eye8', 'eye9', 'eye10', 'eye11', 'eye12', 'eye13', 'eye14', 'eye15', 'eye16',
] as const;

const PORTRAIT_NOSES = ['nose1', 'nose3', 'nose5', 'nose6', 'nose7', 'nose14'] as const;
const PORTRAIT_MOUTHS = ['mouth2', 'mouth3', 'mouth4', 'mouth5', 'mouth6', 'mouth7', 'mouth8'] as const;

const SPORTY_HAIR = [
  'short', 'short2', 'short3', 'short-fade', 'crop', 'crop-fade', 'spike', 'spike2', 'spike3',
  'messy-short', 'blowoutFade', 'curlyFade1', 'fauxhawk-fade', 'parted', 'curly', 'curly2', 'afro', 'afro2',
] as const;

const YOUTH_HAIR = ['short', 'short2', 'crop', 'messy-short', 'spike', 'spike2', 'curly', 'parted'] as const;
const PRIME_HAIR = ['short', 'short2', 'short-fade', 'crop-fade', 'messy-short', 'parted', 'curlyFade1'] as const;
const VETERAN_HAIR = ['short', 'short2', 'short-bald', 'short-fade', 'parted', 'shaggy1'] as const;

const GRAY_HAIR = ['#9CA3AA', '#B0B0B0', '#A89F8E', '#8A8A8A'] as const;
const STUBBLE = ['goatee-thin', 'mustache-thin', 'soul', 'sideburns1'] as const;
const HEAVY_FACIAL = ['beard1', 'beard2', 'goatee1', 'mutton'] as const;

const BOLD_EYEBROWS = [
  'eyebrow3', 'eyebrow4', 'eyebrow5', 'eyebrow6', 'eyebrow7', 'eyebrow8', 'eyebrow9', 'eyebrow10',
] as const;

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

function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)]!;
}

function accentColor(primary: string, secondary: string): string {
  if (primary.startsWith('#')) {
    const n = parseInt(primary.slice(1), 16);
    const ch = (sh: number) => Math.min(255, Math.round(((n >> sh) & 0xff) * 0.75 + 40));
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }
  return secondary;
}

function caricatureBoost(face: FaceConfig, r: () => number) {
  // OJO: no tocar `head.id` aquí — `applyAge` es el dueño de la forma de cabeza
  // (juveniles más redondos, veteranos más enjutos). Aquí solo exageramos rasgos.
  face.fatness = Math.min(0.42, face.fatness + 0.08 + r() * 0.06);
  face.nose.size = Math.min(1.3, (face.nose.size ?? 1) * (1.04 + r() * 0.1));
  face.eye.id = pick(r, EXPRESSIVE_EYES);
  face.eyebrow.id = pick(r, BOLD_EYEBROWS);
}

function applyAge(face: FaceConfig, age: number, r: () => number) {
  const a = Number.isFinite(age) ? Math.max(16, Math.min(40, age)) : 25;

  if (a <= 20) {
    face.head.id = pick(r, YOUTH_HEADS);
    face.hair.id = pick(r, YOUTH_HAIR);
    face.smileLine.id = 'none';
    face.miscLine.id = r() < 0.05 ? 'freckles1' : 'none';
    face.facialHair.id = 'none';
    face.eyeLine.id = 'none';
    face.fatness = 0.06 + r() * 0.08;
  } else if (a <= 26) {
    face.head.id = pick(r, SYMMETRIC_HEADS);
    face.hair.id = pick(r, SPORTY_HAIR);
    face.smileLine.id = r() < 0.18 ? pick(r, ['line1', 'line2']) : 'none';
    face.miscLine.id = 'none';
    face.facialHair.id = r() < 0.06 ? 'mustache-thin' : 'none';
    face.eyeLine.id = 'none';
    face.fatness = 0.1 + r() * 0.12;
  } else if (a <= 32) {
    face.head.id = pick(r, CARICATURE_HEADS);
    face.hair.id = pick(r, PRIME_HAIR);
    face.smileLine.id = r() < 0.3 ? pick(r, ['line1', 'line2']) : 'none';
    face.miscLine.id = r() < 0.15 ? pick(r, ['forehead1', 'chin1']) : 'none';
    face.facialHair.id = r() < 0.22 ? pick(r, STUBBLE) : 'none';
    face.eyeLine.id = r() < 0.2 ? 'line1' : 'none';
    face.fatness = 0.12 + r() * 0.14;
  } else if (a <= 36) {
    face.head.id = pick(r, CARICATURE_HEADS);
    face.hair.id = pick(r, PRIME_HAIR);
    face.smileLine.id = r() < 0.4 ? pick(r, ['line1', 'line2']) : 'none';
    face.miscLine.id = r() < 0.2 ? pick(r, ['forehead1', 'forehead2']) : 'none';
    face.facialHair.id = r() < 0.3 ? pick(r, STUBBLE) : 'none';
    face.eyeLine.id = r() < 0.28 ? pick(r, ['line1', 'line2']) : 'none';
    face.fatness = 0.14 + r() * 0.16;
    if (r() < 0.15) face.hair.color = pick(r, GRAY_HAIR);
  } else {
    face.head.id = pick(r, CARICATURE_HEADS);
    face.hair.id = pick(r, VETERAN_HAIR);
    face.smileLine.id = r() < 0.55 ? pick(r, ['line2', 'line3']) : 'none';
    face.miscLine.id = r() < 0.35 ? pick(r, ['forehead1', 'forehead2', 'chin1']) : 'none';
    face.facialHair.id = r() < 0.38 ? pick(r, [...STUBBLE, ...HEAVY_FACIAL]) : 'none';
    face.eyeLine.id = r() < 0.38 ? pick(r, ['line2', 'line3']) : 'none';
    face.fatness = 0.16 + r() * 0.18;
    if (r() < 0.3 + (a - 36) * 0.1) face.hair.color = pick(r, GRAY_HAIR);
  }
}

// Cuellos de camiseta de fútbol (la camiseta propia se dibuja en `playerFootballShirt.tsx`).
const COLLAR_STYLES = ['crew', 'vneck', 'polo'] as const;
export type CollarStyle = (typeof COLLAR_STYLES)[number];

function footballify(face: FaceConfig, r: () => number, age: number) {
  // Borramos cuerpo + camiseta NATIVOS de facesjs: sus "jerseys" son de baloncesto
  // (sin mangas, escote profundo). La cara queda solo cabeza+rasgos; la camiseta de
  // fútbol propia (`<FootballShirt>`) se pinta DETRÁS en el mismo lienzo 400×600, así
  // que el cuello y la barbilla la solapan sin costura.
  face.jersey.id = '__no_jersey__';
  face.body.id = '__no_body__';
  face.ear.id = 'none';
  face.hairBg.id = 'none';
  face.glasses.id = 'none';
  face.nose.id = pick(r, PORTRAIT_NOSES);
  face.mouth.id = pick(r, PORTRAIT_MOUTHS);
  face.accessories.id = r() < 0.04 ? 'headband' : 'none';

  face.mouth.flip = false;
  face.nose.flip = false;
  face.hair.flip = false;
  face.eye.angle = 0;
  face.eyebrow.angle = 0;

  applyAge(face, age, r);
  caricatureBoost(face, r);
}

export interface PortraitKit {
  primary: string;
  secondary: string;
}

/** Cuello de camiseta determinista por jugador (mismo id → mismo cuello). */
export function collarForPlayer(id: number): CollarStyle {
  return COLLAR_STYLES[seedOf(id) % COLLAR_STYLES.length]!;
}

export function deriveFacesJsFace(id: number, kit?: PortraitKit, age?: number): FaceConfig {
  const baseSeed = seedOf(id);
  const rGen = mulberry32(baseSeed ^ 0x9e3779b9);
  const race = pick(rGen, RACES);
  const prevRandom = Math.random;

  Math.random = rGen;
  try {
    const face = generate(undefined, { gender: 'male', race });
    footballify(face, mulberry32(baseSeed ^ 0x85ebca6b), age ?? 25);
    if (kit) {
      face.teamColors = [kit.primary, kit.secondary, accentColor(kit.primary, kit.secondary)];
    }
    return face;
  } finally {
    Math.random = prevRandom;
  }
}
