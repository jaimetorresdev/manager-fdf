// ─── EmptyState — vacío con gancho narrativo ──────────────────────────────────
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type EmptyMood = 'pitch' | 'locker' | 'trophy' | 'transfer' | 'neutral';

interface Props {
  icon?: ReactNode;
  title: string;
  hint?: string;
  /** Frase con tono de vestuario / prensa */
  kicker?: string;
  action?: ReactNode;
  mood?: EmptyMood;
  className?: string;
}

const MOOD_EMOJI: Record<EmptyMood, string> = {
  pitch: '⚽',
  locker: '🧤',
  trophy: '🏆',
  transfer: '📋',
  neutral: '📭',
};

export function EmptyState({
  icon,
  title,
  hint,
  kicker,
  action,
  mood = 'neutral',
  className,
}: Props) {
  return (
    <div className={cn('empty-state', `empty-state--${mood}`, className)} role="status">
      <div className="empty-state-glow" aria-hidden />
      <div className="empty-state-art" aria-hidden>
        {icon ?? <span className="empty-state-emoji">{MOOD_EMOJI[mood]}</span>}
      </div>
      {kicker && <p className="empty-state-kicker">{kicker}</p>}
      <h3 className="empty-state-title">{title}</h3>
      {hint && <p className="empty-state-hint">{hint}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
