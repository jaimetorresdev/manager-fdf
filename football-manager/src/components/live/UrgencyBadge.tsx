import { cn } from '../../lib/cn';

interface UrgencyBadgeProps {
  count: number;
  className?: string;
  pulse?: boolean;
}

export function UrgencyBadge({ count, className, pulse = true }: UrgencyBadgeProps) {
  if (count <= 0) return null;

  return (
    <div className={cn("relative flex items-center justify-center", className)}>
      {pulse && (
        <span className="absolute inline-flex w-full h-full rounded-full bg-[var(--red-danger)] opacity-75 animate-ping" />
      )}
      <span className="relative inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black text-white bg-[var(--red-danger)] rounded-full shadow-sm border border-[var(--bg-surface)]">
        {count > 99 ? '99+' : count}
      </span>
    </div>
  );
}
