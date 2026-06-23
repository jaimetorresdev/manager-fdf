// ─── Sparkline — mini-gráfico de tendencia (SVG) ──────────────────────────────
import { useTranslation } from 'react-i18next';

interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
  responsive?: boolean;
}

export function Sparkline({ data, width = 90, height = 26, color = 'var(--green-primary)', fill = true, className, responsive }: Props) {
  const { t } = useTranslation('common');
  if (!data || data.length < 2) {
    return <svg width={responsive ? '100%' : width} height={height} className={className} aria-hidden="true" />;
  }
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;
  const last = pts[pts.length - 1];

  return (
    <svg width={responsive ? '100%' : width} height={height} viewBox={`0 0 ${width} ${height}`} 
         preserveAspectRatio={responsive ? 'none' : undefined} className={className}
         role="img" aria-label={t('Tendencia')}>
      {fill && <polygon points={area} fill={color} fillOpacity={0.12} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke"
                strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.1} fill={color} className="cursor-pointer">
        <title>{t('Último')}: {Math.round(data[data.length - 1] * 10) / 10}</title>
      </circle>
      <title>{t('Tendencia')}: {data.map(n => Math.round(n * 10) / 10).join(' → ')}</title>
    </svg>
  );
}
