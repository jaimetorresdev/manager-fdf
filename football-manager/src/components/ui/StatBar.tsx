import { cn } from '../../lib/cn';
import { ratingColor } from '../../lib/theme';

interface StatBarProps {
  value: number;
  max?: number;
  /** Show the numeric value to the right of the bar. */
  showValue?: boolean;
  /** Optional short label shown to the left (e.g. "PAS"). */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Fixed colour; when omitted the colour is derived from the value (rating scale). */
  color?: 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'teal';
  className?: string;
}

const sizes = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-3' };

const fixedColors: Record<NonNullable<StatBarProps['color']>, string> = {
  green: 'var(--green-primary)',
  blue: 'var(--blue-info)',
  amber: 'var(--gold-accent)',
  red: 'var(--red-danger)',
  violet: 'var(--violet-accent)',
  teal: 'var(--teal-accent)',
};


/**
 * Retro segmented attribute bar (teletext blocks). Used for player ratings 0-99,
 * fitness, morale, etc. The track is rendered as ten discrete pixel segments.
 */
export function StatBar({ value, max = 99, showValue, label, size = 'sm', color, className }: StatBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = color ? fixedColors[color] : ratingColor(pct);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <span className="font-mono-retro w-7 shrink-0 text-[10px] uppercase" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
      )}
      <div className={cn('statbar-track flex-1', sizes[size])}>
        <div
          className="statbar-fill skill-bar-fill"
          style={{
            width: `${pct}%`,
            background: fill,
            boxShadow: `0 0 6px color-mix(in srgb, ${fill} 55%, transparent)`,
          }}
        />
      </div>
      {showValue && (
        <span
          className="font-mono-retro w-6 shrink-0 text-right text-xs font-semibold"
          style={{ color: fill }}
        >
          {value}
        </span>
      )}
    </div>
  );
}
