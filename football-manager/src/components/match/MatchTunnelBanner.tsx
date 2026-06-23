// Feel visual del Túnel del Tiempo (X4) — tarjetas de aviso en MatchPage / MatchCenter.
import type { ReactNode } from 'react';
import { History as HistoryIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'success' | 'warning' | 'loading';

interface Props {
  variant: Variant;
  title: string;
  body: ReactNode;
  className?: string;
}

const META: Record<Variant, { accent: string; label: string }> = {
  success: { accent: 'var(--green-primary)', label: 'REVIVIR — recreación histórica' },
  warning: { accent: 'var(--gold-accent)', label: 'REVIVIR — recreación aproximada' },
  loading: { accent: 'var(--blue-info)', label: 'TÚNEL DEL TIEMPO' },
};

export function MatchTunnelBanner({ variant, title, body, className }: Props) {
  const { accent } = META[variant];
  return (
    <div
      className={cn('mt-banner', className)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '20px 22px',
        borderRadius: 16,
        border: `1px solid color-mix(in srgb, ${accent} 32%, var(--border-color))`,
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 12%, var(--bg-surface)), var(--bg-elevated))`,
        boxShadow: 'var(--shadow-soft)',
        display: 'flex',
        flexDirection: 'row',
        gap: 18,
        alignItems: 'center',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 56,
          height: 56,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          background: accent,
          boxShadow: `0 0 22px color-mix(in srgb, ${accent} 45%, transparent)`,
        }}
      >
        <HistoryIcon size={28} style={{ color: 'var(--bg-base)' }} className={variant === 'loading' ? 'animate-spin' : undefined} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3
          className="font-display font-black text-lg tracking-wide mb-1"
          style={{ color: accent }}
        >
          🕰 {title || META[variant].label}
        </h3>
        <p className="text-sm font-sans font-medium" style={{ color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {body}
        </p>
      </div>
    </div>
  );
}

export function MatchTunnelButton({
  loading,
  onClick,
  size = 'md',
}: {
  loading?: boolean;
  onClick?: () => void;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="mc-tunnel-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        fontWeight: 800,
        borderRadius: size === 'sm' ? 10 : 12,
        padding: size === 'sm' ? '8px 14px' : '12px 22px',
        fontSize: size === 'sm' ? '.82rem' : '.9rem',
        background: 'var(--gold-accent)',
        color: 'var(--bg-base)',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.75 : 1,
        boxShadow: '0 6px 18px color-mix(in srgb, var(--gold-accent) 35%, transparent)',
        transition: 'transform .15s, box-shadow .15s',
      }}
    >
      <HistoryIcon size={size === 'sm' ? 14 : 16} className={loading ? 'animate-spin' : undefined} />
      {loading ? 'Viajando en el tiempo…' : 'Túnel del Tiempo'}
    </button>
  );
}
