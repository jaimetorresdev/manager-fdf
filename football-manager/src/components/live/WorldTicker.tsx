import { useTranslation } from 'react-i18next';
import { useGameStore } from '../../stores/gameStore';
import { cn } from '../../lib/cn';

interface WorldTickerProps {
  className?: string;
}

export function WorldTicker({ className }: WorldTickerProps) {
  const { t } = useTranslation();
  const shellContext = useGameStore(s => s.shellContext);
  const tickerItems = shellContext?.live?.ticker || [];
  const mode = shellContext?.visual?.mode || 'normal';

  if (!tickerItems.length) return null;

  const STYLE_MAP: Record<string, string> = {
    normal: 'bg-[var(--bg-elevated)] border-[var(--border-color)] text-[var(--text-muted)]',
    matchday: 'bg-[var(--green-primary)] border-[var(--green-primary)] text-[var(--bg-base)] font-bold',
    crisis: 'bg-[var(--red-danger)] border-[var(--red-danger)] text-white font-bold',
    euphoria: 'bg-[var(--gold-accent)] border-[var(--gold-accent)] text-[var(--bg-base)] font-bold',
  };
  
  const modeStyles = STYLE_MAP[mode] || STYLE_MAP.normal;

  return (
    <div className={cn("flex w-full overflow-hidden border-y text-xs uppercase tracking-wider items-center", modeStyles, className)}>
      <div className="px-3 py-1.5 shrink-0 z-10 border-r bg-inherit font-black shadow-[4px_0_10px_-2px_rgba(0,0,0,0.5)]">
        {t('gameplay:live.tickerLabel')}
      </div>
      <div className="flex-1 overflow-hidden relative flex items-center">
        <div className="whitespace-nowrap inline-block animate-ticker">
          {tickerItems.map((item: any, i: number) => (
            <span key={i} className="mx-6">
              <span className="opacity-50 mr-2">/</span>
              {typeof item === 'string' ? item : item.text || item.title}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-ticker {
          display: inline-block;
          white-space: nowrap;
          padding-left: 100%;
          animation: ticker 40s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
