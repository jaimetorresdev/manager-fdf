import { cn } from '../../lib/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  /** Squared, monospace "block" look (retro chip) instead of a rounded pill. */
  block?: boolean;
  className?: string;
}

const variants: Record<NonNullable<BadgeProps['variant']>, { bg: string; fg: string; bd: string }> = {
  default: {
    bg: 'color-mix(in srgb, var(--green-primary) 14%, transparent)',
    fg: 'var(--green-primary)',
    bd: 'color-mix(in srgb, var(--green-primary) 32%, transparent)',
  },
  success: {
    bg: 'color-mix(in srgb, var(--green-primary) 16%, transparent)',
    fg: 'var(--green-primary)',
    bd: 'color-mix(in srgb, var(--green-primary) 34%, transparent)',
  },
  warning: {
    bg: 'color-mix(in srgb, var(--gold-accent) 16%, transparent)',
    fg: 'var(--gold-accent)',
    bd: 'color-mix(in srgb, var(--gold-accent) 34%, transparent)',
  },
  danger: {
    bg: 'color-mix(in srgb, var(--red-danger) 16%, transparent)',
    fg: 'var(--red-danger)',
    bd: 'color-mix(in srgb, var(--red-danger) 34%, transparent)',
  },
  info: {
    bg: 'color-mix(in srgb, var(--blue-info) 16%, transparent)',
    fg: 'var(--blue-info)',
    bd: 'color-mix(in srgb, var(--blue-info) 34%, transparent)',
  },
  neutral: {
    bg: 'var(--bg-elevated)',
    fg: 'var(--text-muted)',
    bd: 'var(--border-color)',
  },
};

export function Badge({ children, variant = 'default', size = 'sm', block, className }: BadgeProps) {
  const v = variants[variant];
  const sizes = { sm: 'px-2 py-0.5 text-[11px]', md: 'px-2.5 py-1 text-xs' };
  return (
    <span
      className={cn(
        'inline-flex items-center font-semibold uppercase leading-none',
        block ? 'retro-chip tracking-wide' : 'rounded-full',
        sizes[size],
        className
      )}
      style={{
        backgroundColor: v.bg,
        color: v.fg,
        border: `1px solid ${v.bd}`,
      }}
    >
      {children}
    </span>
  );
}
