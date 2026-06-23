import { type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Sparkline } from './Sparkline';
import { useCountUp } from '../../hooks/useCountUp';
import { useJuice, type JuiceIntensity } from '../../hooks/useJuice';
import {
  moraleEmoji,
  moraleLabel,
  parseNumericValue,
  streakCaption,
  type StreakInfo,
} from '../../lib/kpiSports';

export type KpiSportStatus = {
  kind: 'streak' | 'position' | 'morale' | 'form' | 'custom';
  streak?: StreakInfo;
  /** Posiciones ganadas (+) o perdidas (−) */
  positionDelta?: number;
  morale?: number;
  sparkline?: number[];
  sparklineColor?: string;
  caption?: string;
};

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  color?: string;
  className?: string;
  /** Fuente scoreboard para cifras monumentales (auto si el valor es numérico). */
  monumental?: boolean;
  countUp?: boolean;
  juice?: JuiceIntensity;
  status?: KpiSportStatus;
  /** @deprecated Usar `status` */
  trend?: { value: number; isPositive: boolean };
}

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

function SportFooter({ status }: { status: KpiSportStatus }) {
  const color = status.sparklineColor ?? 'var(--green-primary)';

  if (status.kind === 'streak' && status.streak) {
    const hot = status.streak.type === 'W';
    const cold = status.streak.type === 'L';
    return (
      <div className="kpi-sport-foot">
        <span
          className="kpi-sport-badge"
          style={{
            color: hot ? 'var(--green-primary)' : cold ? 'var(--red-danger)' : 'var(--gold-accent)',
          }}
        >
          {hot ? '🔥' : cold ? '❄️' : '➖'} {streakCaption(status.streak)}
        </span>
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={64} height={22} color={color} />
        )}
      </div>
    );
  }

  if (status.kind === 'position') {
    const d = status.positionDelta ?? 0;
    return (
      <div className="kpi-sport-foot">
        <span className="kpi-sport-badge" style={{ color: d > 0 ? 'var(--green-primary)' : d < 0 ? 'var(--red-danger)' : 'var(--text-muted)' }}>
          {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—'} {status.caption ?? 'en liga'}
        </span>
        {status.sparkline && status.sparkline.length >= 2 && (
          <Sparkline data={status.sparkline} width={64} height={22} color={color} />
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
          <Sparkline data={status.sparkline} width={64} height={22} color={color} />
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

  if (status.caption) {
    return (
      <div className="kpi-sport-foot">
        <span className="kpi-sport-caption">{status.caption}</span>
      </div>
    );
  }

  return null;
}

export function StatCard({
  label,
  value,
  icon,
  color,
  className,
  monumental,
  countUp = true,
  juice = 'subtle',
  status,
  trend,
}: StatCardProps) {
  const numeric = parseNumericValue(value);
  const isMonumental = monumental ?? numeric != null;
  const animated = useCountUp(numeric ?? 0, { enabled: countUp && numeric != null });
  const fx = useJuice<HTMLDivElement>(juice);

  const display =
    countUp && numeric != null
      ? typeof value === 'string' && /[€%Mkm]/.test(value)
        ? String(value).replace(/[\d.,]+/, String(animated))
        : animated
      : value;

  // Compat legacy trend → form status
  const resolvedStatus: KpiSportStatus | undefined =
    status ??
    (trend
      ? {
          kind: 'form',
          caption: `${trend.isPositive ? '▲' : '▼'} ${Math.abs(trend.value)}% vs mes anterior`,
          sparklineColor: trend.isPositive ? 'var(--green-primary)' : 'var(--red-danger)',
        }
      : undefined);

  return (
    <div
      ref={fx.ref}
      className={cn('kpi-box kpi-card p-4 transition-all duration-200', fx.bind.className, className)}
      onAnimationEnd={fx.bind.onAnimationEnd}
    >
      <JuiceLayer pops={fx.pops} particles={fx.particles} />
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="muted-label">{label}</p>
          <p className={cn('kpi-value mt-1', isMonumental && 'font-scoreboard')}>{display}</p>
        </div>
        {icon && (
          <div
            className={cn('rounded-md p-2 shrink-0', color)}
            style={!color ? { background: 'var(--bg-elevated)', color: 'var(--green-primary)' } : undefined}
          >
            {icon}
          </div>
        )}
      </div>
      {resolvedStatus && <SportFooter status={resolvedStatus} />}
    </div>
  );
}
