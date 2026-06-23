import { cn } from '../../lib/cn';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';

interface LiveEmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function LiveEmptyState({ title, message, icon, className }: LiveEmptyStateProps) {
  const { t } = useTranslation();
  const shellContext = useGameStore(s => s.shellContext);
  const mode = shellContext?.visual?.mode || 'normal';

  const STYLE_MAP: Record<string, string> = {
    normal: 'text-[var(--text-muted)] border-[var(--border-color)] bg-[var(--bg-elevated)]',
    matchday: 'text-[var(--green-primary)] border-[var(--green-primary)] bg-green-500/10 shadow-[inset_0_0_20px_rgba(34,197,94,0.1)]',
    crisis: 'text-[var(--red-danger)] border-[var(--red-danger)] bg-red-500/10 shadow-[inset_0_0_20px_rgba(239,68,68,0.1)]',
    euphoria: 'text-[var(--gold-accent)] border-[var(--gold-accent)] bg-yellow-500/10 shadow-[inset_0_0_20px_rgba(255,215,0,0.1)]',
  };

  const modeStyles = STYLE_MAP[mode] || STYLE_MAP.normal;

  return (
    <div className={cn('flex flex-col items-center justify-center p-8 rounded-xl border-dashed border-2 text-center transition-all duration-700', modeStyles, className)}>
      {icon && <div className="mb-4 opacity-75 transform scale-110">{icon}</div>}
      <h3 className="font-display uppercase tracking-widest text-sm font-bold mb-2">{title ?? t('empty.title')}</h3>
      <p className="text-xs opacity-80 max-w-sm mx-auto">{message ?? t('empty.message')}</p>
    </div>
  );
}
