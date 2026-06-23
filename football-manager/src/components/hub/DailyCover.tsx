import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Share2, Clock, Newspaper, ArrowRight, Landmark } from 'lucide-react';
import { gameApi } from '../../api/client';
import { useGameStore } from '../../stores/gameStore';

function boardMandate(data: any, shellContext: any, objectives: any[]): string | null {
  if (data?.boardObjective) return String(data.boardObjective);
  const pending = objectives.find((o) => String(o.status ?? '').toLowerCase().includes('pend'));
  if (pending) {
    if (pending.type === 'liga' && pending.targetPosition) {
      return `La junta exige acabar entre los ${pending.targetPosition} primeros de liga.`;
    }
    if (pending.type === 'copa') return 'La junta exige una marcha seria en copa esta temporada.';
    if (pending.type === 'economia' && pending.targetAmount) {
      return `La junta vigila las cuentas: objetivo económico de ${pending.targetAmount}.`;
    }
  }
  const label = shellContext?.pressure?.components?.objectiveLabel
    ?? shellContext?.pressure?.sources?.find?.((s: any) => s?.objectiveLabel)?.objectiveLabel;
  if (label) return String(label);
  if (shellContext?.matchday?.importance?.label) {
    return `Mandato de junta: ${shellContext.matchday.importance.label}`;
  }
  return 'La junta observa cada decisión con lupa esta temporada.';
}

function navButtonProps(route: string | undefined, navigate: (path: string) => void) {
  if (!route) return {};
  const go = () => navigate(route);
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: go,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        go();
      }
    },
  };
}

export function DailyCover({ data, fullWidth }: { data: any; fullWidth?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const shellContext = useGameStore((s) => s.shellContext);
  const [objectives, setObjectives] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    gameApi.dashboard()
      .then((d: any) => { if (!cancelled) setObjectives(d?.board?.objectives ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const mandate = boardMandate(data, shellContext, objectives);

  const handleShare = async () => {
    const dashboardUrl = `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(dashboardUrl);
      toast.success(t('gameplay:common.copyCover'));
    } catch {
      toast.error(t('gameplay:match.toasts.shareError'));
    }
  };

  return (
    <div className={fullWidth ? 'relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl' : 'relative mt-6 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-surface)] shadow-2xl'} ref={cardRef}>
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(34,197,94,0.1)_0%,rgba(0,0,0,0)_60%)] pointer-events-none" />

      {/* Header Portada */}
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-black/40">
        <div className="flex items-center gap-3">
          <Newspaper className="text-[var(--gold-accent)]" size={24} />
          <h2 className="font-display font-black text-xl italic uppercase tracking-wider text-white">
            FDF Today
            <span className="text-[10px] ml-3 text-[var(--text-muted)] tracking-widest bg-white/5 px-2 py-0.5 rounded">TURNO {data.turn}</span>
          </h2>
        </div>
        <button 
          onClick={handleShare}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-[var(--text-muted)] hover:text-white"
          title={t('gameplay:common.shareCover')}
          aria-label={t('gameplay:common.shareCover')}
        >
          <Share2 size={18} />
        </button>
      </div>

      {mandate && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-lg border border-[var(--gold-accent)]/30 bg-[color-mix(in_srgb,var(--gold-accent)_8%,var(--bg-base))] px-4 py-3">
          <Landmark size={18} className="text-[var(--gold-accent)] shrink-0 mt-0.5" />
          <div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--gold-accent)] mb-1">Objetivo de junta</div>
            <p className="text-sm text-[var(--text-primary)] leading-snug">{mandate}</p>
          </div>
        </div>
      )}

      <div className="p-6 grid md:grid-cols-2 gap-6">
        {/* Main Headline & Hero */}
        <div className="space-y-6">
          <div>
            <h3 className="text-3xl font-display font-black leading-tight text-white mb-3">
              {data.headline || "El balón vuelve a rodar en FDF"}
            </h3>
            {data.hero && (
              <div className="flex items-center gap-4 bg-[var(--bg-elevated)] p-4 rounded-lg border border-[var(--border-color)]">
                <div className="w-12 h-12 bg-gradient-to-br from-[var(--gold-accent)] to-yellow-700 rounded-full flex items-center justify-center font-black text-white shadow-[0_0_15px_rgba(250,204,21,0.3)]">
                  {data.hero.rating?.toFixed(1) || '-'}
                </div>
                <div>
                  <div className="font-bold text-white flex items-center gap-2">
                    {data.hero.name} <span className="text-xs text-[var(--text-muted)]">{data.hero.club?.shortName}</span>
                  </div>
                  <div className="text-sm text-[var(--green-primary)] font-medium">★ {data.hero.summary}</div>
                </div>
              </div>
            )}
          </div>

          {data.featuredResult && (
            <div 
              className="group bg-gradient-to-r from-black/60 to-black/30 p-4 rounded-lg border-l-4 border-[var(--green-primary)] cursor-pointer hover:bg-black/80 transition-colors"
              {...navButtonProps(data.featuredResult?.route, navigate)}
            >
              <div className="text-[10px] text-[var(--text-muted)] font-mono uppercase mb-2">PARTIDO DESTACADO</div>
              <div className="flex items-center justify-between">
                <div className="font-bold text-lg">{data.featuredResult.homeClub?.shortName}</div>
                <div className="bg-[var(--bg-base)] px-3 py-1 rounded border border-[var(--border-color)] font-mono font-black text-white">
                  {data.featuredResult.resultHidden ? '? - ?' : `${data.featuredResult.homeGoals} - ${data.featuredResult.awayGoals}`}
                </div>
                <div className="font-bold text-lg">{data.featuredResult.awayClub?.shortName}</div>
              </div>
            </div>
          )}
        </div>

        {/* Stories, Rumors, Moment */}
        <div className="space-y-4 flex flex-col justify-between">
          {data.moment && (
            <div 
              className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-color)] hover:border-[var(--blue-info)] transition-colors cursor-pointer group"
              {...navButtonProps(data.moment?.route, navigate)}
            >
              <div className="flex items-center gap-2 text-[var(--blue-info)] text-xs font-bold uppercase mb-2">
                <Clock size={14} /> El Momento
              </div>
              <div className="font-bold text-[var(--text-primary)] mb-1">{data.moment.title}</div>
              <div className="text-sm text-[var(--text-muted)]">{data.moment.text}</div>
            </div>
          )}

          {data.rumor && (
            <div 
              className="bg-[var(--bg-base)] p-4 rounded-lg border border-[var(--border-color)] hover:border-[var(--red-danger)] transition-colors cursor-pointer"
              {...navButtonProps(data.rumor?.route, navigate)}
            >
              <div className="flex items-center gap-2 text-[var(--red-danger)] text-xs font-bold uppercase mb-2">
                {data.rumor.icon} Rumor de mercado
              </div>
              <div className="text-sm font-medium text-[var(--text-primary)]">{data.rumor.headline}</div>
            </div>
          )}

          {data.stories && data.stories.length > 0 && (
            <div className="bg-black/40 rounded-lg p-3">
              {data.stories.map((story: any) => (
                <div 
                  key={story.id} 
                  className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0 cursor-pointer hover:text-white text-[var(--text-muted)] transition-colors text-sm"
                  {...navButtonProps(story.route, navigate)}
                >
                  <span className="text-lg">{story.icon}</span>
                  <span className="flex-1 truncate">{story.text}</span>
                  <ArrowRight size={14} className="opacity-50" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
