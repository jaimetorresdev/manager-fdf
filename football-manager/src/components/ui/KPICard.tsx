// ─── KPICard — métrica deportiva con sparkline y count-up ─────────────────────
import { type ReactNode, useEffect } from 'react';
import { cn } from '../../lib/cn';
import { eur } from '../../lib/format';
import { Sparkline } from './Sparkline';
import { useCountUp } from '../../hooks/useCountUp';
import { useJuice, type JuiceIntensity } from '../../hooks/useJuice';
import {
  moraleEmoji,
  moraleLabel,
  parseNumericValue,
  streakCaption,
} from '../../lib/kpiSports';
import type { KpiSportStatus } from './StatCard';

interface Props {
  label: string;
  value: ReactNode;
  /** Valor numérico para count-up cuando `value` es formateado (€, %, #). */
  numericValue?: number;
  hint?: string;
  status?: KpiSportStatus;
  icon?: ReactNode;
  tone?: 'green' | 'gold' | 'blue' | 'red' | 'neutral';
  className?: string;
  monumental?: boolean;
  countUp?: boolean;
  juice?: JuiceIntensity;
  /** @deprecated Usar `status` */
  delta?: number;
}

const TONE: Record<NonNullable<Props['tone']>, string> = {
  green: 'var(--green-primary)',
  gold: 'var(--gold-accent)',
  blue: 'var(--blue-info)',
  red: 'var(--red-danger)',
  neutral: 'var(--text-primary)',
};

function JuiceLayer({
  pops,
  particles,
}: {
  pops: { id: string; style: React.CSSProperties }[];
  particles: { id: string; style: React.CSSProperties }[];
}) {
  return (
    <>
      {pops.map(p => (
        <span key={p.id} className="score-pop juice-score-pop" style={p.style} aria-hidden />
      ))}
      {particles.map(p => (
        <span key={p.id} className="juice-particle" style={p.style} aria-hidden />
      ))}
    </>
  );
}

function SportFooter({ status, hint }: { status?: KpiSportStatus; hint?: string }) {
  if (!status && hint) {
    return (
      <div className="kpi-sport-foot">
        <span className="kpi-sport-caption">{hint}</span>
      </div>
    );
  }
  if (!status) return null;

  const color = status.sparklineColor ?? 'var(--green-primary)';

  if (status.kind === 'streak' && status.streak) {
    const hot = status.streak.type === 'W';
    const cold = status.streak.type === 'L';
    return (
      <div className="kpi-sport-foot">
        <span
          className="kpi-sport-badge"
          style={{ color: hot ? 'var(--green-primary)' : cold ? 'var(--red-danger)' : 'var(--gold-accent)' }}
        >
          {hot ? '🔥' : cold ? '❄️' : '➖'} {streakCaption(status.streak)}
        </span>
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={68} height={22} color={color} />
        )}
      </div>
    );
  }

  if (status.kind === 'position') {
    const d = status.positionDelta ?? 0;
    return (
      <div className="kpi-sport-foot">
        <span
          className="kpi-sport-badge"
          style={{ color: d > 0 ? 'var(--green-primary)' : d < 0 ? 'var(--red-danger)' : 'var(--text-muted)' }}
        >
          {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—'}{' '}
          {status.caption ?? hint ?? 'en liga'}
        </span>
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={68} height={22} color={color} />
        )}
      </div>
    );
  }

  if (status.kind === 'morale' && status.morale != null) {
    return (
      <div className="kpi-sport-foot">
        <span className="kpi-sport-badge">
          {moraleEmoji(status.morale)} {status.caption ?? moraleLabel(status.morale)}
        </span>
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={68} height={22} color={color} />
        )}
      </div>
    );
  }

  if (status.kind === 'form') {
    return (
      <div className="kpi-sport-foot">
        {status.caption && <span className="kpi-sport-badge">{status.caption}</span>}
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={72} height={22} color={color} />
        )}
      </div>
    );
  }

  return (
    <div className="kpi-sport-foot">
      {(status.caption ?? hint) && <span className="kpi-sport-caption">{status.caption ?? hint}</span>}
    </div>
  );
}

export function KPICard({
  label,
  value,
  numericValue,
  hint,
  status,
  icon,
  tone = 'neutral',
  className,
  monumental,
  countUp = true,
  juice = 'subtle',
  delta,
}: Props) {
  const c = TONE[tone];
  const parsed = numericValue ?? (typeof value === 'number' ? value : parseNumericValue(String(value)));
  const isMonumental = monumental ?? parsed != null;
  const animated = useCountUp(parsed ?? 0, { enabled: countUp && parsed != null });
  const fx = useJuice<HTMLDivElement>(juice);

  useEffect(() => {
    if (countUp && parsed != null) {
      const t = window.setTimeout(() => fx.trigger(), 80);
      return () => window.clearTimeout(t);
    }
  }, [countUp, parsed, fx.trigger]);

  const resolvedStatus: KpiSportStatus | undefined =
    status ??
    (delta != null
      ? {
          kind: 'form',
          caption: `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta)}`,
          sparklineColor: delta >= 0 ? 'var(--green-primary)' : 'var(--red-danger)',
        }
      : hint && !status
        ? { kind: 'custom', caption: hint }
        : undefined);

  let rendered: ReactNode = value;
  if (countUp && parsed != null) {
    if (typeof value === 'number') rendered = animated;
    else if (typeof value === 'string') {
      if (value.startsWith('#')) rendered = `#${animated}`;
      else if (value.includes('%')) rendered = `${animated}%`;
      else if (value.includes('€')) rendered = eur(animated);
      else rendered = animated;
    }
  }

  return (
    <div
      ref={fx.ref}
      className={cn('kpi kpi-card', fx.bind.className, className)}
      style={{ ['--kpi-c' as string]: c }}
      onAnimationEnd={fx.bind.onAnimationEnd}
    >
      <JuiceLayer pops={fx.pops} particles={fx.particles} />
      <div className="kpi-top">
        <span className="kpi-label">{label}</span>
        {icon && <span style={{ color: c, display: 'inline-flex' }}>{icon}</span>}
      </div>
      <div className={cn('kpi-val', isMonumental && 'font-scoreboard')}>{rendered}</div>
      <SportFooter status={resolvedStatus?.kind === 'custom' ? undefined : resolvedStatus} hint={hint} />
    </div>
  );
}
