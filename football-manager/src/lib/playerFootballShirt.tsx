import { memo, useId } from 'react';
import { FACE_VIEWBOX } from './portraitNormalize';

export type CollarStyle = 'crew' | 'vneck' | 'polo';

interface Props {
  /** Color de piel del cuello (= face.body.color de facesjs). */
  skin: string;
  primary: string;
  secondary: string;
  dorsal?: number;
  collar?: CollarStyle;
}

const INK = '#0d1017';

function isHex(c: string) { return c.startsWith('#') && c.length >= 7; }

function darken(color: string, amt: number): string {
  if (!isHex(color)) return color;
  const n = parseInt(color.slice(1, 7), 16);
  const ch = (sh: number) => Math.max(0, Math.round(((n >> sh) & 0xff) * (1 - amt)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h ^ s.charCodeAt(i), 16777619)) >>> 0;
  return h;
}

/**
 * Camiseta de fútbol (manga corta, cuello + dorsal) dibujada en el MISMO espacio
 * 400×600 que la cara facesjs. Se renderiza DETRÁS de la cara: la barbilla y el cuello
 * de piel solapan el cuello de la camiseta → unión natural sin costura.
 * Las camisetas nativas de facesjs son de baloncesto (sin mangas), por eso la propia.
 */
export const FootballShirt = memo(function FootballShirt({
  skin, primary, secondary, dorsal, collar = 'crew',
}: Props) {
  const uid = useId().replace(/:/g, '');
  const clipBody = `clipbody-${uid}`;
  const hex = isHex(primary);
  const mid = darken(primary, 0.1);
  const shadowFill = darken(primary, 0.16);   // panel cel inferior/derecho
  // Rayas verticales deterministas por club (mismo kit → mismo patrón). Solo con kit hex.
  const striped = hex && isHex(secondary) && secondary.toLowerCase() !== primary.toLowerCase()
    && (hashStr(primary + secondary) & 1) === 1;
  const BODY_D = 'M28 616 L36 552 Q54 510 118 502 Q152 499 174 520 Q200 540 226 520 Q248 499 282 502 Q346 510 364 552 L372 616 Z';
  const stripes = striped
    ? Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? i : -1)).filter((i) => i >= 0)
        .map((i) => <rect key={i} x={28 + i * 49} y={486} width={49} height={132} fill={secondary} />)
    : null;

  const collarTrim =
    collar === 'vneck' ? (
      <>
        <path d="M168 512 L200 552 L232 512" fill="none" stroke={secondary} strokeWidth="10" strokeLinejoin="round" />
        <path d="M168 512 L200 552 L232 512" fill="none" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      </>
    ) : collar === 'polo' ? (
      <path
        d="M170 514 L156 540 L188 548 L200 532 L212 548 L244 540 L230 514"
        fill={secondary}
        stroke={INK}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    ) : (
      <>
        <path d="M170 520 Q200 542 230 520" fill="none" stroke={secondary} strokeWidth="10" strokeLinecap="round" />
        <path d="M170 520 Q200 542 230 520" fill="none" stroke={INK} strokeWidth="2.5" />
      </>
    );

  return (
    <svg className="pp-shirt" viewBox={FACE_VIEWBOX} preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <clipPath id={clipBody}><path d={BODY_D} /></clipPath>
      </defs>
      {/* cuello (piel) tras la barbilla */}
      <path d="M172 452 C170 498 173 524 200 536 C227 524 230 498 228 452 Z" fill={skin} stroke={INK} strokeWidth="5" />
      {/* cuerpo base (cel plano) */}
      <path d={BODY_D} fill={primary} stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      {/* rayas + sombreado de manga + sombra cel, TODO recortado a la silueta */}
      <g clipPath={`url(#${clipBody})`}>
        {stripes}
        {/* sombreado de manga translúcido (deja ver las rayas) */}
        <path d="M36 552 Q54 510 118 502 Q108 540 104 616 L28 616 Z" fill={hex ? darken(primary, 0.22) : mid} opacity={hex ? 0.5 : 1} />
        <path d="M364 552 Q346 510 282 502 Q292 540 296 616 L372 616 Z" fill={hex ? darken(primary, 0.3) : mid} opacity={hex ? 0.55 : 1} />
        {/* panel de sombra cel (lado derecho + bajo) */}
        <path d="M214 498 L372 542 L372 616 L168 616 Z" fill={shadowFill} opacity="0.4" />
      </g>
      {/* contorno + costuras de manga por encima */}
      <path d={BODY_D} fill="none" stroke={INK} strokeWidth="7" strokeLinejoin="round" />
      <path d="M36 552 Q54 510 118 502 Q108 540 104 616" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M364 552 Q346 510 282 502 Q292 540 296 616" fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      {/* puños de manga (ribete) */}
      <path d="M104 616 Q106 600 104 590 L28 600 L28 616 Z" fill={secondary} stroke={INK} strokeWidth="2" opacity="0.9" />
      <path d="M296 616 Q294 600 296 590 L372 600 L372 616 Z" fill={secondary} stroke={INK} strokeWidth="2" opacity="0.9" />
      {collarTrim}
      {dorsal != null && dorsal > 0 && (
        <text
          x="200"
          y={collar === 'polo' ? 596 : 592}
          textAnchor="middle"
          fontFamily="Impact, 'Arial Narrow', sans-serif"
          fontSize="44"
          fontWeight="900"
          fill="#fff"
          stroke={INK}
          strokeWidth="5"
          paintOrder="stroke"
          style={{ letterSpacing: '-3px' }}
        >
          {dorsal}
        </text>
      )}
    </svg>
  );
});
