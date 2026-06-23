// ─── comicFace — motor de retratos ESTILO CÓMIC, vectorial y determinista ───────
// Reemplazo del rostro facesjs (estilo "cromo") por un busto cómic: contornos de
// tinta de grosor variable, cel-shading de 2-3 tonos planos, proporciones de
// cartoon expresivo. 100% SVG string (sin React, sin deps, sin canvas/filtros),
// determinista por (id, edad) → reproducible bit a bit (Túnel del Tiempo).
//
// Núcleo PURO: `comicFaceInner(id, age, skin?)` devuelve el markup interior de un
// <svg viewBox="52 84 296 532"> (mismas anclas que facesjs, así el recorte y la
// camiseta `<FootballShirt>` siguen encajando). El componente React lo envuelve.

export const FACE_CANVAS = { w: 400, h: 600, cx: 200 } as const;
export const INK = '#0d1017';

// ── RNG determinista (mismo esquema que playerFacesJs: seedOf + mulberry32) ──────
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
type RNG = () => number;
const pick = <T,>(r: RNG, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
const rng = (r: RNG, min: number, max: number) => min + (max - min) * r();
const chance = (r: RNG, p: number) => r() < p;

// ── Color: hex helpers (no-op para strings no-hex, p. ej. var(--club-primary)) ───
function clamp255(n: number) { return Math.max(0, Math.min(255, Math.round(n))); }
function isHex(c: string) { return typeof c === 'string' && c[0] === '#' && c.length >= 7; }
function rgbOf(hex: string) {
  const n = parseInt(hex.slice(1, 7), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}
export function darken(c: string, amt: number) {
  if (!isHex(c)) return c;
  const { r, g, b } = rgbOf(c);
  return toHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}
export function lighten(c: string, amt: number) {
  if (!isHex(c)) return c;
  const { r, g, b } = rgbOf(c);
  return toHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}
function mix(a: string, b: string, t: number) {
  if (!isHex(a) || !isHex(b)) return a;
  const x = rgbOf(a), y = rgbOf(b);
  return toHex(x.r + (y.r - x.r) * t, x.g + (y.g - x.g) * t, x.b + (y.b - x.b) * t);
}

// ── Tokens (paleta determinista) ────────────────────────────────────────────────
const SKIN_TONES = ['#f6d5bf', '#eec3a4', '#dca884', '#c2926c', '#9d6f50', '#6f4836'] as const;
const HAIR_TONES = ['#241d1a', '#3a281d', '#54381f', '#7a4a26', '#9c6a37', '#15110f'] as const;
const GRAY_TONES = ['#b8bcc2', '#a7a59c', '#cfd2d6', '#9aa0a6'] as const;
const IRIS_TONES = ['#4a2f1e', '#5b3a26', '#6b4a2e', '#3a2a1e', '#46603f'] as const;

export function skinForPlayer(id: number): string {
  return pick(mulberry32(seedOf(id) ^ 0x9e3779b9), SKIN_TONES);
}

// ── Helpers de path: curva cerrada suave (Catmull-Rom → Bézier) ──────────────────
type P = [number, number];
function smoothClosed(points: P[], tension = 1): string {
  const n = points.length;
  const f = tension / 6;
  let d = `M${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!, p1 = points[i]!, p2 = points[(i + 1) % n]!, p3 = points[(i + 2) % n]!;
    const c1: P = [p1[0] + (p2[0] - p0[0]) * f, p1[1] + (p2[1] - p0[1]) * f];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * f, p2[1] - (p3[1] - p1[1]) * f];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}
function smoothOpen(points: P[], tension = 1): string {
  const n = points.length;
  const f = tension / 6;
  let d = `M${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!, p1 = points[i]!, p2 = points[i + 1]!, p3 = points[Math.min(n - 1, i + 2)]!;
    const c1: P = [p1[0] + (p2[0] - p0[0]) * f, p1[1] + (p2[1] - p0[1]) * f];
    const c2: P = [p2[0] - (p3[0] - p1[0]) * f, p2[1] - (p3[1] - p1[1]) * f];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// ── Geometría de cabeza (paramétrica; envejecimiento + fatness la deforman) ──────
interface HeadGeom {
  crownY: number; chinY: number;
  foreheadW: number; templeW: number; cheekW: number; jawW: number; chinW: number;
}
function headPath(g: HeadGeom): { d: string; right: P[] } {
  const cx = FACE_CANVAS.cx;
  // lado derecho (de la corona a la barbilla); se refleja para el izquierdo
  const right: P[] = [
    [cx, g.crownY],
    [cx + g.foreheadW, g.crownY + 28],
    [cx + g.templeW, 250],
    [cx + g.cheekW, 332],
    [cx + g.jawW, 410],
    [cx + g.chinW, g.chinY - 26],
    [cx, g.chinY],
  ];
  const left: P[] = right.slice(1, -1).reverse().map(([x, y]) => [cx - (x - cx), y] as P);
  const all = [...right, ...left];
  return { d: smoothClosed(all, 1), right };
}

interface Band {
  band: 0 | 1 | 2 | 3 | 4;
  head: HeadGeom;
  fatness: number;
}
function ageBand(age: number, r: RNG): Band {
  const a = Number.isFinite(age) ? Math.max(16, Math.min(40, age)) : 25;
  const fat = (lo: number, hi: number) => rng(r, lo, hi);
  if (a <= 20) {
    const f = fat(0.06, 0.16);
    return { band: 0, fatness: f,
      head: { crownY: 116, chinY: 496, foreheadW: 92 + f * 24, templeW: 96 + f * 26, cheekW: 92 + f * 30, jawW: 76 + f * 26, chinW: 40 + f * 18 } };
  }
  if (a <= 26) {
    const f = fat(0.10, 0.22);
    return { band: 1, fatness: f,
      head: { crownY: 112, chinY: 502, foreheadW: 90 + f * 22, templeW: 94 + f * 24, cheekW: 90 + f * 30, jawW: 80 + f * 28, chinW: 38 + f * 18 } };
  }
  if (a <= 32) {
    const f = fat(0.12, 0.26);
    return { band: 2, fatness: f,
      head: { crownY: 110, chinY: 506, foreheadW: 88 + f * 20, templeW: 92 + f * 22, cheekW: 90 + f * 30, jawW: 84 + f * 28, chinW: 40 + f * 16 } };
  }
  if (a <= 36) {
    const f = fat(0.14, 0.30);
    return { band: 3, fatness: f,
      head: { crownY: 110, chinY: 508, foreheadW: 86 + f * 20, templeW: 90 + f * 22, cheekW: 88 + f * 28, jawW: 84 + f * 26, chinW: 40 + f * 16 } };
  }
  const f = fat(0.16, 0.34);
  return { band: 4, fatness: f,
    head: { crownY: 112, chinY: 510, foreheadW: 84 + f * 18, templeW: 88 + f * 20, cheekW: 84 + f * 26, jawW: 78 + f * 24, chinW: 38 + f * 14 } };
}

// ── Render principal ─────────────────────────────────────────────────────────────
export function comicFaceInner(id: number, age = 25, skinOverride?: string): string {
  const idR = mulberry32(seedOf(id) ^ 0x9e3779b9);   // identidad (color piel/pelo/ojos)
  const shR = mulberry32(seedOf(id) ^ 0x85ebca6b);   // forma (picks de rasgos)
  const cx = FACE_CANVAS.cx;

  const skin = skinOverride && isHex(skinOverride) ? skinOverride : pick(idR, SKIN_TONES);
  const hairBase = pick(idR, HAIR_TONES);
  const iris = pick(idR, IRIS_TONES);

  const b = ageBand(age, shR);
  const g = b.head;

  // Rasgos (roll incondicional → gate por banda; evita saltos al cumplir años)
  const eyeAngle = rng(shR, 0, 4);
  const browTilt = rng(shR, 0, 5);
  const browHeavy = chance(shR, 0.5);
  const noseKind = Math.floor(shR() * 5);
  const mouthKind = Math.floor(shR() * 6);
  const hairKind = Math.floor(shR() * 12);
  const facialKind = Math.floor(shR() * 6);
  const grayRoll = shR();
  const stubbleRoll = shR();
  const smileRoll = shR();
  const flipHair = chance(shR, 0.5);

  // Color de pelo (canas por edad)
  let hairColor: string = hairBase;
  if (b.band === 3 && grayRoll < 0.15) hairColor = pick(idR, GRAY_TONES);
  if (b.band === 4 && grayRoll < 0.3 + (Math.min(40, age) - 36) * 0.1) hairColor = pick(idR, GRAY_TONES);

  // Cel ramp piel
  const sBase = skin;
  const sShadow = darken(skin, 0.14);
  const sCore = darken(skin, 0.28);
  const sHi = lighten(skin, 0.13);
  const lip = mix(skin, '#a23b2f', 0.4);

  // Geometría base
  const head = headPath(g);
  const cidHead = `chd${id}`;

  // ── 1. INK underlay (silueta cabeza+cuello, ligeramente mayor) ──
  const neckTop = g.chinY - 24;
  const neckW = g.jawW * 0.62;
  const neck: P[] = [
    [cx - neckW, neckTop], [cx - neckW - 4, 560], [cx + neckW + 4, 560], [cx + neckW, neckTop],
  ];
  const neckD = smoothClosed(neck, 0.6);
  // underlay = cabeza escalada desde el centro
  const inkScale = 1.045;
  const inkUnderlay = `<g transform="translate(${cx} ${(g.crownY + g.chinY) / 2}) scale(${inkScale}) translate(${-cx} ${-(g.crownY + g.chinY) / 2})">`
    + `<path d="${head.d}" fill="${INK}"/></g>`;

  // ── 2. Cuello ──
  const neckSvg =
    `<path d="${neckD}" fill="${sBase}"/>`
    + `<path d="${smoothClosed([[cx + 6, neckTop], [cx + neckW, neckTop], [cx + neckW + 4, 560], [cx + 14, 560]], 0.5)}" fill="${sShadow}"/>`
    + `<path d="${smoothOpen([[cx - 34, neckTop + 8], [cx, neckTop + 16], [cx + 34, neckTop + 8]], 1)}" fill="none" stroke="${sCore}" stroke-width="7" stroke-linecap="round" opacity="0.45"/>`;

  // ── 3. Cabeza base + cel (clip a silueta) ──
  const clip = `<clipPath id="${cidHead}"><path d="${head.d}"/></clipPath>`;
  const headBase = `<path d="${head.d}" fill="${sBase}"/>`;
  // sombra: lado derecho (luz arriba-izquierda) con terminador ondulado
  const shadowPoly: P[] = [
    [cx + 14, g.crownY], [cx + g.foreheadW + 30, g.crownY], [cx + g.cheekW + 30, 360],
    [cx + g.jawW + 20, 470], [cx + 30, g.chinY + 10], [cx + 24, 360], [cx + 30, 240],
  ];
  const corePoly: P[] = [
    [cx - 36, g.chinY - 36], [cx + 40, g.chinY - 36], [cx + 30, g.chinY + 6], [cx - 30, g.chinY + 6],
  ];
  // brillos pequeños: frente (centro-izq) + pómulo izquierdo
  const hiForehead: P[] = [[cx - 34, 250], [cx - 6, 244], [cx - 10, 300], [cx - 38, 296]];
  const hiCheek: P[] = [[cx - g.cheekW + 18, 330], [cx - 30, 338], [cx - 36, 372], [cx - g.cheekW + 12, 360]];
  const hiNose: P[] = [[cx - 5, 320], [cx + 3, 322], [cx + 1, 370], [cx - 6, 366]];
  const headCel =
    `<g clip-path="url(#${cidHead})">`
    + `<path d="${smoothClosed(shadowPoly, 0.8)}" fill="${sShadow}"/>`
    + `<path d="${smoothClosed(corePoly, 0.8)}" fill="${sCore}" opacity="0.7"/>`
    + `<path d="${smoothClosed(hiForehead, 0.9)}" fill="${sHi}" opacity="0.7"/>`
    + `<path d="${smoothClosed(hiCheek, 0.9)}" fill="${sHi}" opacity="0.55"/>`
    + `<path d="${smoothClosed(hiNose, 0.9)}" fill="${sHi}" opacity="0.6"/>`
    + `</g>`;

  // ── 4. Orejas (pequeñas, tras el pelo) ──
  const ear = (sx: number) =>
    `<path d="${smoothClosed([[cx + sx * (g.cheekW + 2), 318], [cx + sx * (g.cheekW + 26), 322], [cx + sx * (g.cheekW + 22), 360], [cx + sx * (g.cheekW + 2), 356]], 0.7)}" fill="${sBase}" stroke="${INK}" stroke-width="3" paint-order="stroke"/>`;
  const ears = ear(1) + ear(-1);

  // ── 5. Ojos ──
  function eye(sx: number): string {
    const ex = cx + sx * 56, ey = 316;
    const rx = 25, ry = b.band === 0 ? 14 : 12; // almendrado (no anime)
    const side = sx > 0 ? 'R' : 'L';
    // contorno de ojo almendrado (punto interior bajo, exterior algo alzado)
    const lidPts: P[] = [
      [ex - sx * rx, ey + 1],
      [ex - sx * 6, ey - ry],
      [ex + sx * rx, ey - 2 - sx * eyeAngle * 0.25],
      [ex + sx * (rx - 4), ey + ry - 3],
      [ex - sx * (rx - 6), ey + ry - 2],
    ];
    const lidD = smoothClosed(lidPts, 0.85);
    const ix = ex + sx * 3, iy = ey + 1;
    const irisR = 10.5;
    const ball = `<path d="${lidD}" fill="#f4f1e8"/>`;
    const irisC = `<circle cx="${ix}" cy="${iy}" r="${irisR}" fill="${iris}"/>`
      + `<circle cx="${ix}" cy="${iy}" r="5" fill="${INK}"/>`
      + `<circle cx="${ix - sx * 3.5}" cy="${iy - 4}" r="2.6" fill="#ffffff"/>`;
    // párpado superior: línea de tinta gruesa siguiendo el borde alto del ojo
    const lid = `<path d="${smoothOpen([[ex - sx * (rx + 1), ey], [ex - sx * 6, ey - ry - 1], [ex + sx * (rx + 1), ey - 3 - sx * eyeAngle * 0.25]], 1)}" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>`;
    // lagrimal/sombra cuenca superior
    const socket = `<path d="${smoothOpen([[ex - rx, ey - ry + 2], [ex, ey - ry - 4], [ex + rx, ey - ry + 2]], 1)}" fill="none" stroke="${sShadow}" stroke-width="4" stroke-linecap="round" opacity="0.45"/>`;
    return socket
      + `<g clip-path="url(#eyeclip${id}${side})">${ball}${irisC}</g>`
      + `<clipPath id="eyeclip${id}${side}"><path d="${lidD}"/></clipPath>`
      + `<path d="${lidD}" fill="none" stroke="${INK}" stroke-width="2" opacity="0.55"/>`
      + lid;
  }
  const eyes = eye(1) + eye(-1);

  // ── 6. Cejas (forma rellena de tinta) ──
  function brow(sx: number): string {
    const bx = cx + sx * 58, by = 274;
    const tilt = sx * browTilt;
    const h = browHeavy ? 13 : 9;
    const pts: P[] = [
      [bx - 30, by + 6 - tilt * 0.2], [bx - 6, by - 4 - tilt], [bx + 26, by - tilt * 0.4],
      [bx + 26, by + h - tilt * 0.4], [bx - 6, by + h - 2 - tilt], [bx - 30, by + h + 4 - tilt * 0.2],
    ];
    return `<path d="${smoothClosed(pts, 0.8)}" fill="${darken(hairBase, 0.1)}"/>`;
  }
  const brows = brow(1) + brow(-1);

  // ── 7. Nariz (plano de sombra + brillo + fosas) ──
  const nx = cx, ny = 372;
  const noseW = 17 + noseKind * 1.5;
  const nose =
    `<path d="${smoothClosed([[nx + 2, 318], [nx + noseW, ny + 6], [nx + noseW - 2, ny + 18], [nx + 4, ny + 14]], 0.7)}" fill="${sShadow}"/>`
    + `<path d="${smoothOpen([[nx - 3, 320], [nx - 4, ny - 6]], 1)}" stroke="${sHi}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.8"/>`
    + `<path d="${smoothClosed([[nx - noseW + 2, ny + 12], [nx + noseW - 2, ny + 12], [nx + noseW + 2, ny + 20], [nx + noseW - 6, ny + 26], [nx - noseW + 6, ny + 26], [nx - noseW - 2, ny + 20]], 0.7)}" fill="none" stroke="${INK}" stroke-width="2.5" opacity="0.5"/>`
    + `<ellipse cx="${nx - noseW + 3}" cy="${ny + 20}" rx="2.6" ry="3.4" fill="${INK}"/>`
    + `<ellipse cx="${nx + noseW - 3}" cy="${ny + 20}" rx="2.6" ry="3.4" fill="${INK}"/>`;

  // ── 8. Boca ──
  const my = 442;
  const smile = mouthKind === 1 || mouthKind === 3 ? 10 : mouthKind === 5 ? -6 : 0;
  const mw = 34;
  const mouth =
    `<path d="${smoothOpen([[cx - mw, my], [cx, my + smile], [cx + mw, my]], 1)}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`
    + `<path d="${smoothClosed([[cx - mw + 4, my + 3], [cx, my + smile + 4], [cx + mw - 4, my + 3], [cx, my + smile + 13]], 0.8)}" fill="${lip}"/>`
    + `<path d="${smoothOpen([[cx - mw + 8, my + 14], [cx, my + smile + 17], [cx + mw - 8, my + 14]], 1)}" fill="none" stroke="${sHi}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;

  // ── 9. Vello facial (silueta tinta, gate por edad) ──
  let facialHair = '';
  const wantFacial = (b.band === 2 && stubbleRoll < 0.22) || (b.band === 3 && stubbleRoll < 0.3) || (b.band === 4 && stubbleRoll < 0.38);
  if (wantFacial) {
    const beardColor = hairColor === hairBase ? darken(hairBase, 0.05) : hairColor;
    const heavy = b.band === 4 && facialKind > 3;
    const top = heavy ? 360 : 400;
    const beard: P[] = [
      [cx - g.jawW - 2, 392], [cx - g.cheekW + 6, top], [cx, top - 6], [cx + g.cheekW - 6, top], [cx + g.jawW + 2, 392],
      [cx + g.chinW + 10, g.chinY - 18], [cx, g.chinY + 4], [cx - g.chinW - 10, g.chinY - 18],
    ];
    // recorte boca (evenodd)
    const mouthHole = `M${cx - mw - 2} ${my} q${mw + 2} ${smile + 24} ${2 * (mw + 2)} 0 q${-(mw + 2)} ${-smile - 8} ${-2 * (mw + 2)} 0Z`;
    facialHair = `<path d="${smoothClosed(beard, 0.7)} ${mouthHole}" fill="${beardColor}" fill-rule="evenodd"/>`;
  }

  // ── 10. Pelo (silueta tinta + base + sombra + brillos) ──
  // veteranos: más probabilidad de entradas/calvicie
  const hk = b.band === 4 && grayRoll > 0.7 ? 11 : hairKind;
  const hair = buildHair(hk, g, hairColor, flipHair);

  // ── 11. Líneas de edad ──
  let lines = '';
  if (b.band >= 2 && smileRoll < (b.band === 2 ? 0.3 : b.band === 3 ? 0.4 : 0.55)) {
    lines += `<path d="${smoothOpen([[cx - 44, 420], [cx - 40, 436], [cx - 30, 452]], 1)}" fill="none" stroke="${sShadow}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`
      + `<path d="${smoothOpen([[cx + 44, 420], [cx + 40, 436], [cx + 30, 452]], 1)}" fill="none" stroke="${sShadow}" stroke-width="3" stroke-linecap="round" opacity="0.7"/>`;
  }
  if (b.band >= 3 && smileRoll > 0.5) {
    lines += `<path d="${smoothOpen([[cx - 46, g.crownY + 60], [cx, g.crownY + 54], [cx + 46, g.crownY + 60]], 1)}" fill="none" stroke="${sShadow}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>`;
  }

  return `<defs>${clip}</defs>`
    + inkUnderlay
    + neckSvg
    + ears
    + headBase
    + headCel
    + lines
    + facialHair
    + eyes
    + brows
    + nose
    + mouth
    + hair;
}

// ── Pelo: siluetas que ENMARCAN la cara (no gorro) ───────────────────────────────
interface HairSpec {
  crownLift: number;   // cuánto sube la masa sobre la corona
  hairlineY: number;   // qué tan abajo llega el flequillo en la frente (mayor = más frente cubierta)
  peak: number;        // pico/entradas en el centro (>0 = pico de viuda)
  sideY: number;       // hasta dónde bajan las patillas/lados
  spiky: boolean;
  receded: boolean;    // entradas marcadas
}
const HAIR_SPECS: HairSpec[] = [
  { crownLift: 10, hairlineY: 236, peak: 6, sideY: 296, spiky: false, receded: false },  // 0 short
  { crownLift: 8,  hairlineY: 240, peak: 2, sideY: 292, spiky: false, receded: false },  // 1 short2
  { crownLift: 6,  hairlineY: 232, peak: 0, sideY: 286, spiky: false, receded: false },  // 2 crop
  { crownLift: 6,  hairlineY: 228, peak: 0, sideY: 272, spiky: false, receded: true },   // 3 crop-fade
  { crownLift: 16, hairlineY: 238, peak: 10, sideY: 296, spiky: true,  receded: false }, // 4 messy
  { crownLift: 30, hairlineY: 230, peak: 14, sideY: 286, spiky: true,  receded: false }, // 5 spike
  { crownLift: 24, hairlineY: 232, peak: 12, sideY: 288, spiky: true,  receded: false }, // 6 spike2
  { crownLift: 12, hairlineY: 234, peak: 18, sideY: 296, spiky: false, receded: true },  // 7 parted
  { crownLift: 22, hairlineY: 244, peak: 6, sideY: 312, spiky: false, receded: false },  // 8 curly
  { crownLift: 38, hairlineY: 248, peak: 4, sideY: 320, spiky: false, receded: false },  // 9 afro
  { crownLift: 18, hairlineY: 250, peak: 4, sideY: 326, spiky: false, receded: false },  // 10 shaggy
  { crownLift: 4,  hairlineY: 214, peak: 0, sideY: 250, spiky: false, receded: true },   // 11 short-bald
];

function buildHair(kind: number, g: HeadGeom, color: string, flip: boolean): string {
  const cx = FACE_CANVAS.cx;
  const sh = darken(color, 0.2);
  const hi = lighten(color, 0.2);
  const top = g.crownY;
  const fw = g.foreheadW, tw = g.templeW;
  const s = HAIR_SPECS[kind] ?? HAIR_SPECS[0]!;
  const v = s.crownLift; // volumen sobre el cráneo
  const crownTop = top - v;

  // Silueta exterior que SIGUE la cúpula del cráneo (corona+frente+sienes de la
  // cabeza, desplazadas hacia fuera por el volumen) y baja por los lados; luego
  // vuelve por la línea de pelo de la frente (forma de "U" que abraza la cara).
  const jut = s.spiky ? 16 : 0;
  const outer: P[] = [
    [cx - tw - 4, s.sideY],                       // patilla izq
    [cx - tw - 2, 248],                           // sien izq
    [cx - fw - 2, top + 16],                      // frente-lateral izq
    [cx - 60, crownTop + 16],
    [cx - 26, crownTop - 2 - (s.spiky ? jut * 0.5 : 0)],
    [cx, crownTop - 8 - (s.spiky ? jut : 0)],     // corona centro (cúpula redonda)
    [cx + 26, crownTop - 2 - (s.spiky ? jut * 0.5 : 0)],
    [cx + 60, crownTop + 16],
    [cx + fw + 2, top + 16],                      // frente-lateral der
    [cx + tw + 2, 248],                           // sien der
    [cx + tw + 4, s.sideY],                       // patilla der
  ];
  // línea de pelo CON MECHONES (no arco liso): pequeños picos hacia la frente
  const hl = s.hairlineY;
  const recess = s.receded ? 26 : 8;
  const cD = hl - s.peak * 0.5 + (s.peak > 8 ? -6 : 8); // centro (pico de viuda)
  const inner: P[] = [
    [cx + fw - 4, hl + 16],
    [cx + recess + 34, hl + 2],
    [cx + recess + 22, hl + 13],   // mechón
    [cx + recess + 8, hl - 1],
    [cx + 10, cD + 9],             // mechón centro-der
    [cx, cD],
    [cx - 10, cD + 9],            // mechón centro-izq
    [cx - recess - 8, hl - 1],
    [cx - recess - 22, hl + 13],  // mechón
    [cx - recess - 34, hl + 2],
    [cx - fw + 4, hl + 16],
  ];
  let pts = [...outer, ...inner];
  if (flip) pts = pts.map(([x, y]) => [cx - (x - cx), y] as P);
  const d = smoothClosed(pts, 0.68);

  const inkU = `<g transform="translate(${cx} ${crownTop}) scale(1.05) translate(${-cx} ${-crownTop})"><path d="${d}" fill="${INK}"/></g>`;
  const base = `<path d="${d}" fill="${color}"/>`;
  // sombra lado derecho + 2 mechones de brillo (no pelos finos), recortado al pelo
  const cidHair = `chr${Math.round(top)}_${kind}_${flip ? 1 : 0}`;
  const shadow =
    `<clipPath id="${cidHair}"><path d="${d}"/></clipPath>`
    + `<g clip-path="url(#${cidHair})">`
    + `<path d="${smoothClosed([[cx + 8, crownTop], [cx + fw + 16, 236], [cx + tw + 10, s.sideY], [cx + 28, s.sideY - 12], [cx + 20, crownTop + 30]], 0.8)}" fill="${sh}" opacity="0.9"/>`
    + `<path d="${smoothClosed([[cx - 36, crownTop + 8], [cx - 8, crownTop + 2], [cx - 14, 226], [cx - 40, 232]], 0.9)}" fill="${hi}" opacity="0.9"/>`
    + `<path d="${smoothClosed([[cx + 8, crownTop + 6], [cx + 30, crownTop + 12], [cx + 24, 218], [cx + 4, 214]], 0.9)}" fill="${hi}" opacity="0.5"/>`
    + `</g>`;
  return inkU + base + shadow;
}
