import { cn } from '../../lib/cn';
import { Newspaper } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';

interface PressBadgeProps {
  className?: string;
  /** En topbar: icono + texto corto; sin compact: pill completa */
  compact?: boolean;
}

export function PressBadge({ className, compact = false }: PressBadgeProps) {
  const { t } = useTranslation();
  const shellContext = useGameStore(s => s.shellContext);
  const unreadCount = shellContext?.press?.unread || 0;
  const pendingQuestions = shellContext?.press?.pendingQuestions || 0;
  const isMatchday = shellContext?.visual?.matchdayMode;

  if (unreadCount === 0 && pendingQuestions === 0) return null;

  const urgent = pendingQuestions > 0;

  if (compact) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-[9px] text-[10px] font-bold uppercase tracking-wide transition-colors',
          urgent
            ? 'border border-[var(--gold-accent)] bg-[color-mix(in_srgb,var(--gold-accent)_14%,transparent)] text-[var(--gold-accent)] shadow-[0_0_12px_color-mix(in_srgb,var(--gold-accent)_25%,transparent)]'
            : 'border border-[var(--border-color)] bg-transparent text-[var(--text-muted)]',
          className,
        )}
      >
        <Newspaper size={14} className={cn('shrink-0', urgent && 'animate-pulse')} />
        <span className="hidden xl:inline max-w-[7rem] truncate">
          {urgent ? t('gameplay:live.pressConference') : t('gameplay:live.news', { count: unreadCount })}
        </span>
        {urgent && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--gold-accent)] px-1 text-[9px] font-black text-[var(--bg-base)] xl:hidden">
            {pendingQuestions}
          </span>
        )}
      </span>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors',
      isMatchday ? 'bg-[var(--gold-accent)] text-[var(--bg-base)]' : 'bg-[var(--bg-elevated)] border border-[var(--gold-accent)] text-[var(--gold-accent)]',
      className)}>
      <Newspaper size={12} className={cn(urgent && 'animate-pulse')} />
      {urgent ? (
        <span>{t('gameplay:live.pressConference')}</span>
      ) : (
        <span>{t('gameplay:live.news', { count: unreadCount })}</span>
      )}
    </div>
  );
}
