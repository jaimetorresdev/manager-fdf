// ─── Radar — gráfico de atributos (SVG, sin dependencias) ─────────────────────
interface RadarAxis { label: string; value: number } // value 0-100
interface RadarProps {
  axes: RadarAxis[];
  size?: number;
  max?: number;
  color?: string;
  className?: string;
}

export function Radar({ axes, size = 220, max = 100, color = 'var(--green-primary)', className }: RadarProps) {
  const cx = size / 2, cy = size / 2;
  // Margen interior: deja sitio a etiqueta + valor (que va 12px por debajo) para
  // que el eje inferior (p. ej. TIR) no se recorte contra el borde del viewBox.
  const r = size / 2 - 34;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i: number, frac: number): [number, number] => [
    cx + Math.cos(angle(i)) * r * frac,
    cy + Math.sin(angle(i)) * r * frac,
  ];

  const rings = [0.25, 0.5, 0.75, 1];
  const poly = axes.map((a, i) => point(i, Math.max(0, Math.min(1, a.value / max))).join(',')).join(' ');

  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--green-primary)] opacity-10 blur-[40px] rounded-full transform scale-75 pointer-events-none" />
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className={className}
           role="img" aria-label="Radar de atributos">
        {rings.map((rg) => (
          <polygon key={rg}
            points={axes.map((_, i) => point(i, rg).join(',')).join(' ')}
            fill="none" stroke="var(--border-color)" strokeWidth={0.8} opacity={0.5} strokeDasharray="3 3" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 1);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-color)" strokeWidth={0.6} opacity={0.5} />;
        })}
        <polygon points={poly} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={2}
                 style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 50%, transparent))` }} />
        {axes.map((a, i) => {
          const [vx, vy] = point(i, Math.max(0, Math.min(1, a.value / max)));
          return (
            <circle key={i} cx={vx} cy={vy} r={2.6} fill={color} className="group cursor-pointer">
              <title>{a.label}: {Math.round(a.value)}</title>
            </circle>
          );
        })}
        {axes.map((a, i) => {
          const [lx, ly] = point(i, 1.16);
          return (
            <text key={i} x={lx} y={ly} fontSize={9.5} fill="var(--text-muted)"
                  textAnchor="middle" dominantBaseline="middle"
                  style={{ fontFamily: 'var(--font-mono-retro)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <tspan>{a.label}</tspan>
              <tspan x={lx} dy="12" fill={color} fontWeight="bold" fontSize={11}>{Math.round(a.value)}</tspan>
            </text>
          );
        })}
      </svg>
    </div>
  );
}
