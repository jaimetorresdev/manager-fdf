import { memo, useId } from 'react';

/** Marco decorativo estilo cromo Panini / Mega Cracks 90s. */
export const StickerFrame = memo(function StickerFrame() {
  const uid = useId().replace(/:/g, '');

  return (
    <svg className="pp-sticker-frame" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={`gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5e6a8" />
          <stop offset="35%" stopColor="#d4af37" />
          <stop offset="65%" stopColor="#b8860b" />
          <stop offset="100%" stopColor="#f5e6a8" />
        </linearGradient>
        <linearGradient id={`shine-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
        <pattern id={`dots-${uid}`} width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="rgba(255,255,255,0.07)" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="100" height="140" fill={`url(#dots-${uid})`} />
      <rect x="1.5" y="1.5" width="97" height="137" rx="5" fill="none" stroke={`url(#gold-${uid})`} strokeWidth="2.8" />
      <rect x="4" y="4" width="92" height="132" rx="4" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="0.9" />
      <path d="M4 4 L12 4 L4 12 Z" fill={`url(#gold-${uid})`} opacity="0.85" />
      <path d="M96 4 L88 4 L96 12 Z" fill={`url(#gold-${uid})`} opacity="0.85" />
      <path d="M4 136 L12 136 L4 128 Z" fill={`url(#gold-${uid})`} opacity="0.85" />
      <path d="M96 136 L88 136 L96 128 Z" fill={`url(#gold-${uid})`} opacity="0.85" />
      <rect x="0" y="0" width="100" height="50" fill={`url(#shine-${uid})`} opacity="0.12" />
    </svg>
  );
});
