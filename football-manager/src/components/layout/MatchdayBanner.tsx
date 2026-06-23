import { Link } from 'react-router-dom';
import { Radio, Clock } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';
import { useCountdown } from '../../hooks/useGameState';
import { useTranslation } from 'react-i18next';

/** I-3 · Takeover visual en día de partido */
export function MatchdayBanner() {
  const shellContext = useGameStore(s => s.shellContext);
  const gameState = useGameStore(s => s.gameState);
  const countdown = useCountdown(gameState?.nextTickAt);
  const mode = shellContext?.visual?.mode;
  const isMatchday = mode === 'matchday' || shellContext?.visual?.matchdayMode;
  const { t } = useTranslation('common');

  if (!isMatchday) return null;

  const rival = shellContext?.matchday?.rivalName;
  const previewRoute = shellContext?.matchday?.previewRoute ?? '/calendar';

  return (
    <div className="mx-3 mt-1.5 mb-0 px-3 py-2 rounded-lg border border-[var(--green-primary)]/35 bg-[color-mix(in_srgb,var(--green-primary)_10%,var(--bg-elevated))] flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[var(--red-danger)]">
          <Radio size={12} className="animate-pulse" /> {t('matchday.day', 'Día de partido')}
        </span>
        <p className="text-xs font-medium text-[var(--text-primary)] truncate">
          {rival ? <>{t('matchday.todayVersus', 'Hoy juegas contra')} <strong>{rival}</strong></> : t('matchday.hasMatch', 'Tu club tiene partido este turno')}
        </p>
        <span className="hidden xl:inline text-[10px] text-[var(--text-muted)]">
          {t('ux.matchdayImpact')}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {countdown && countdown.total > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] font-mono">
            <Clock size={12} /> {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
          </span>
        )}
        <Link
          to="/tactics"
          className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md bg-[var(--green-primary)] text-[var(--avatar-text)]"
          data-tutorial-route="/tactics"
        >
          {t('matchday.submitLineup', 'Presentar once')}
        </Link>
        <Link to={previewRoute} className="text-xs font-bold uppercase tracking-wider text-[var(--green-primary)] hover:underline">
          {t('matchday.preview', 'Previa')} →
        </Link>
      </div>
    </div>
  );
}
