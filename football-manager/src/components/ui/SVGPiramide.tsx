export interface PyramidLevel {
  id?: string;
  label: string;
  value: number;
  color: string;
  detail?: string;
}

interface Props {
  levels: PyramidLevel[];
  total: number;
  title?: string;
  onSliceClick?: (index: number) => void;
  selectedIndex?: number | null;
}

export function SVGPiramide({ levels, total, title, onSliceClick, selectedIndex }: Props) {
  const N = levels.length;
  const w = 600;
  const h = 400;
  const cx = w / 2;
  const spacing = 10;
  const sliceH = (h - (N - 1) * spacing) / Math.max(1, N);

  const topHalfW = 60;
  const botHalfW = 280;
  const slope = (botHalfW - topHalfW) / h;

  const slices = levels.map((lvl, i) => {
    const yTop = i * (sliceH + spacing);
    const yBot = yTop + sliceH;
    const wTop = topHalfW + slope * yTop;
    const wBot = topHalfW + slope * yBot;

    const points = [
      `${cx - wTop},${yTop}`,
      `${cx + wTop},${yTop}`,
      `${cx + wBot},${yBot}`,
      `${cx - wBot},${yBot}`,
    ].join(' ');

    return { ...lvl, yTop, yBot, wTop, wBot, points, cy: yTop + sliceH / 2 };
  });

  return (
    <div className="relative w-full flex flex-col items-center my-6 group">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-[500px] drop-shadow-2xl overflow-visible">
        <defs>
          <linearGradient id="pyr-shine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="20%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.4)" />
            <stop offset="80%" stopColor="rgba(255,255,255,0.1)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {slices.map((slice, i) => {
          const isSelected = selectedIndex === i;
          return (
          <g 
            key={i} 
            className={`transition-all duration-500 origin-center ${onSliceClick ? 'cursor-pointer hover:-translate-y-2 hover:scale-105' : ''} ${isSelected ? '-translate-y-2 scale-105' : ''}`}
            style={{ transformOrigin: `${cx}px ${slice.cy}px` }}
            onClick={() => onSliceClick && onSliceClick(i)}
          >
            {/* Sombra base */}
            <polygon points={slice.points} fill="rgba(0,0,0,0.4)" transform="translate(0, 8)" filter="blur(4px)" />
            
            {/* Relleno principal */}
            <polygon points={slice.points} fill={slice.color} opacity={isSelected ? 0.4 : 0.25} stroke={slice.color} strokeWidth="2" />
            
            {/* Efecto de cristal superior */}
            <polygon points={slice.points} fill="url(#pyr-shine)" opacity={isSelected ? 0.8 : 0.5} style={{ mixBlendMode: 'overlay' }} />
            
            {/* Borde brillante */}
            <polygon points={slice.points} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth={isSelected ? "3" : "1"} />

            {/* Texto y badge */}
            <text x={cx - slice.wTop + 20} y={slice.cy} alignmentBaseline="middle" fill="#ffffff" fontSize="16" fontWeight="800" fontFamily="var(--font-display)" letterSpacing="1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}>
              {slice.label.toUpperCase()}
            </text>
            
            {/* Pastilla de valor */}
            <rect x={cx + slice.wTop - 80} y={slice.cy - 14} width="60" height="28" rx="6" fill="rgba(0,0,0,0.6)" stroke={slice.color} strokeWidth="1" />
            <text x={cx + slice.wTop - 50} y={slice.cy + 1} alignmentBaseline="middle" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold" fontFamily="var(--font-mono-retro)">
              {slice.value.toLocaleString('es-ES')}
            </text>

            {slice.detail && (
              <text x={cx} y={slice.cy + Math.max(sliceH/3, 15)} alignmentBaseline="middle" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="12" fontFamily="var(--font-mono-retro)">
                {slice.detail}
              </text>
            )}
          </g>
        )})}
      </svg>
      
      {/* Resumen total */}
      <div className="mt-6 flex items-center gap-3 px-6 py-3 rounded-xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-elevated)_50%,transparent)] backdrop-blur-md shadow-lg">
        <span className="text-[var(--text-muted)] font-display text-sm tracking-widest uppercase">
          {title || 'TOTAL'} 
          <strong className="ml-3 text-2xl text-[var(--gold-accent)] font-mono">{total.toLocaleString('es-ES')}</strong>
        </span>
      </div>
    </div>
  );
}
