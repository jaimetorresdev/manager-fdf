import { cn } from '../../lib/cn';
import { Sparkline } from './Sparkline';
import { useCountUp } from '../../hooks/useCountUp';
import { parseNumericValue } from '../../lib/kpiSports';
import type { KpiSportStatus } from './StatCard';

interface StatBoxProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  accent?: string;
  status?: KpiSportStatus;
  /** @deprecated Usar `status` */
  hint?: string;
  /** @deprecated Usar `status` */
  trend?: { value: number; isPositive: boolean };
  className?: string;
  countUp?: boolean;
  monumental?: boolean;
}

function MiniFooter({ status, hint }: { status?: KpiSportStatus; hint?: string }) {
  if (!status && !hint) return null;
  const color = status?.sparklineColor ?? 'var(--green-primary)';
  return (
    <div className="kpi-sport-foot mt-1">
      {status?.caption && <span className="kpi-sport-caption">{status.caption}</span>}
      {!status?.caption && hint && <span className="kpi-sport-caption">{hint}</span>}
      {status?.sparkline && status.sparkline.length >= 2 && (
        <Sparkline data={status.sparkline} width={56} height={18} color={color} />
      )}
    </div>
  );
}

/** KPI compacto con tipografía scoreboard y pie deportivo. */
export function StatBox({
  label,
  value,
  icon,
  accent,
  status,
  hint,
  trend,
  className,
  countUp = true,
  monumental,
}: StatBoxProps) {
  const numeric = parseNumericValue(value);
  const isMonumental = monumental ?? numeric != null;
  const animated = useCountUp(numeric ?? 0, { enabled: countUp && numeric != null });

  const resolvedStatus =
    status ??
    (trend
      ? {
          kind: 'form' as const,
          caption: `${trend.isPositive ? '▲' : '▼'} ${Math.abs(trend.value)}%`,
          sparklineColor: trend.isPositive ? 'var(--green-primary)' : 'var(--red-danger)',
        }
      : hint
        ? { kind: 'custom' as const, caption: hint }
        : undefined);

  const display =
    countUp && numeric != null
      ? typeof value === 'string' && value.includes('%')
        ? `${animated}%`
        : animated
      : value;

  return (
    <div className={cn('kpi-box p-3 sm:p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="muted-label truncate">{label}</p>
        {icon && (
          <span className="shrink-0" style={{ color: accent || 'var(--green-primary)' }}>
            {icon}
          </span>
        )}
      </div>
      <p
        className={cn('kpi-value mt-1.5 text-2xl font-bold sm:text-[1.6rem]', isMonumental && 'font-scoreboard')}
        style={{ color: accent || 'var(--text-primary)' }}
      >
        {display}
      </p>
      <MiniFooter status={resolvedStatus} hint={hint} />
    </div>
  );
}
