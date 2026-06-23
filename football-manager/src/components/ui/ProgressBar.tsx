import { cn } from '../../lib/cn';
import { ratingColor } from '../../lib/theme';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  color?: 'blue' | 'green' | 'red' | 'amber' | 'gradient';
  showValue?: boolean;
  className?: string;
}

const heights = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' };

const fixed: Record<Exclude<NonNullable<ProgressBarProps['color']>, 'gradient'>, string> = {
  blue: 'var(--blue-info)',
  green: 'var(--green-primary)',
  red: 'var(--red-danger)',
  amber: 'var(--gold-accent)',
};

export function ProgressBar({ value, max = 99, size = 'sm', color = 'gradient', showValue, className }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  const fill = color === 'gradient' ? ratingColor(pct) : fixed[color];

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('statbar-track flex-1', heights[size])}>
        <div
          className="statbar-fill skill-bar-fill"
          style={{
            width: `${pct}%`,
            background: fill,
            boxShadow: `0 0 6px color-mix(in srgb, ${fill} 50%, transparent)`,
          }}
        />
      </div>
      {showValue && (
        <span className="font-mono-retro w-7 text-right text-xs font-semibold" style={{ color: fill }}>
          {value}
        </span>
      )}
    </div>
  );
}
