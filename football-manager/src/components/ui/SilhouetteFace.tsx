import { memo } from 'react';
import { FACE_VIEWBOX } from '../../lib/portraitNormalize';

/** Respaldo NEUTRO cuando un jugador no tiene retrato en la librería raster.
 *  Silueta anónima tipo "foto pendiente" (sin rasgos) — limpia y profesional,
 *  en vez de intentar (y fallar) dibujar una cara. Mismo viewBox que el resto. */
export const SilhouetteFace = memo(function SilhouetteFace({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox={FACE_VIEWBOX}
      preserveAspectRatio="xMidYMax meet"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id="silbust" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8b97a4" />
          <stop offset="1" stopColor="#4a5560" />
        </linearGradient>
      </defs>
      {/* cuello (acaba bajo el cuello de la camiseta → el kit + dorsal asoman) */}
      <path d="M176 408 C174 478 180 520 200 534 C220 520 226 478 224 408 Z" fill="url(#silbust)" />
      {/* cabeza */}
      <ellipse cx="200" cy="296" rx="110" ry="140" fill="url(#silbust)" />
      {/* rim-light sutil arriba-izquierda */}
      <path d="M118 246 C138 172 262 172 282 246 C252 202 148 202 118 246 Z" fill="#ffffff" opacity="0.07" />
    </svg>
  );
});
