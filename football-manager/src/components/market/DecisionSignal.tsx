import { useEffect, useMemo, useState } from 'react';
import { Loader2, TrafficCone } from 'lucide-react';
import { clubApi, type DecisionSignalQuery } from '../../api/client';
import { asArray } from '../../lib/normalize';

export type { DecisionSignalQuery as DecisionSignalParams } from '../../api/client';

interface Dimension {
  key: string;
  label: string;
  status: 'green' | 'yellow' | 'red';
  score: number;
  detail: string;
}

const STATUS_COLOR: Record<Dimension['status'], string> = {
  green: 'var(--green-primary)',
  yellow: 'var(--gold-accent)',
  red: 'var(--red-danger)',
};

const DIMENSION_ORDER = ['viability', 'positional', 'financial', 'sporting', 'fans'];

function sortDimensions(dims: Dimension[]): Dimension[] {
  const order = new Map(DIMENSION_ORDER.map((k, i) => [k, i]));
  return [...dims].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));
}

interface Props {
  params: DecisionSignalQuery | null;
  compact?: boolean;
}

export function DecisionSignal({ params, compact }: Props) {
  const [signal, setSignal] = useState<{
    status: Dimension['status'];
    score: number;
    label: string;
    summary: string;
    dimensions: Dimension[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsKey = useMemo(() => JSON.stringify(params ?? null), [params]);

  useEffect(() => {
    const parsed = paramsKey === 'null' ? null : JSON.parse(paramsKey) as DecisionSignalQuery;
    if (!parsed) {
      setSignal(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    clubApi.decisionSignal(parsed)
      .then((res) => {
        if (cancelled) return;
        setSignal({
          status: res.status ?? 'yellow',
          score: Number(res.score) || 0,
          label: res.label ?? 'Semáforo',
          summary: res.summary ?? '',
          dimensions: sortDimensions(asArray<Dimension>(res.dimensions)),
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Semáforo no disponible');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [paramsKey]);

  if (!params) return null;

  if (loading && !signal) {
    return (
      <p className="text-xs flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
        <Loader2 size={12} className="animate-spin" /> Consultando asesor táctico…
      </p>
    );
  }

  if (error) {
    return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{error}</p>;
  }

  if (!signal) return null;

  const headlineColor = STATUS_COLOR[signal.status];

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid color-mix(in srgb, ${headlineColor} 25%, var(--border-color))`,
        borderRadius: 8,
        padding: compact ? '8px 10px' : '10px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: compact ? 6 : 8 }}>
        <TrafficCone size={14} style={{ color: headlineColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '.72rem', fontWeight: 800, color: headlineColor, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            {signal.label} · {signal.score}/100
          </p>
          {!compact && (
            <p style={{ fontSize: '.74rem', color: 'var(--text-muted)', marginTop: 2 }}>{signal.summary}</p>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {signal.dimensions.map((dim) => (
          <div key={dim.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.7rem', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dim.label}</span>
              <span style={{ color: STATUS_COLOR[dim.status], fontWeight: 800 }}>{dim.score}</span>
            </div>
            <p style={{ fontSize: '.66rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{dim.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
