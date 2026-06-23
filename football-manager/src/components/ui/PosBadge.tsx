import { cn } from '../../lib/cn';
import { getPositionCategory } from '../../lib/gameUtils';

interface PosBadgeProps {
  position: string;
  preferredPosition?: string | null;
  className?: string;
  short?: boolean;
}

export function PosBadge({ position, preferredPosition, className, short = false }: PosBadgeProps) {
  const category = getPositionCategory(position);
  
  // Mismos tonos que Pitch2D/Training
  const bgClass = category === 'POR' ? 'bg-[var(--gold-accent)] text-slate-950 border-[color-mix(in_srgb,var(--gold-accent)_60%,transparent)]'
    : category === 'DEF' ? 'bg-[var(--blue-info)] text-white border-[color-mix(in_srgb,var(--blue-info)_60%,transparent)]'
    : category === 'MED' ? 'bg-[var(--green-primary)] text-slate-950 border-[color-mix(in_srgb,var(--green-primary)_60%,transparent)]'
    : 'bg-[var(--red-danger)] text-white border-[color-mix(in_srgb,var(--red-danger)_60%,transparent)]';

  // short=true → muestra el código específico (LI, DFC, MCO…), no la categoría
  const label = short
    ? (preferredPosition && preferredPosition !== position ? preferredPosition : position)
    : (preferredPosition && preferredPosition !== position ? `${preferredPosition} (${category})` : category);

  return (
    <span 
      className={cn(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[0.65rem] font-bold font-mono tracking-tighter border whitespace-nowrap',
        bgClass,
        className
      )}
      title={preferredPosition ? `${preferredPosition} (Categoría: ${category})` : `Categoría: ${category}`}
    >
      {label}
    </span>
  );
}
