import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Gauge, Timer, BarChart2, Tv, Play, History as HistoryIcon, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { matchesApi, playersApi } from '../api/client';
import { MatchCenter } from '../components/match/MatchCenter';
import { PostMatchLocker } from '../components/match/PostMatchLocker';
import { useSession } from '../stores/sessionStore';
import { MatchChatPanel } from '../components/common/MatchChatPanel';
import { MatchPreview } from '../components/match/MatchPreview';
import { MatchAnalysis } from '../components/match/MatchAnalysis';
import { MatchSeedAuditPanel } from '../components/match/MatchSeedAuditPanel';
import { MatchTunnelBanner } from '../components/match/MatchTunnelBanner';
import { PreMatchTunnel } from '../components/match/PreMatchTunnel';
import { MATCH_PAGE_TOOLBAR_CSS } from '../components/match/matchPageToolbar';
import { Button, EmptyState } from '../components/ui';
import { SkeletonMatch } from '../components/ui/Skeleton';
import { parseMatchDetail, type ParsedMatch } from '../lib/matchParse';
import { kitOf, resolveClash } from '../components/match/kitColors';
import { cn } from '../lib/cn';

type ViewMode = 'loading' | 'hidden_prompt' | 'preview' | 'match' | 'analysis';

export function MatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { club } = useSession();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const matchId = Number(id);
  const [data, setData] = useState<ParsedMatch | null>(null);
  const [raw, setRaw] = useState<{ number?: number; competition?: string } | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('loading');
  const [revealing, setRevealing] = useState(false);
  const [cinematic, setCinematic] = useState(false);
  const [jumpToMinute, setJumpToMinute] = useState<number | undefined>(undefined);
  const [timeMachineLoading, setTimeMachineLoading] = useState(false);
  const [resimulationWarning, setResimulationWarning] = useState(false);
  const [isReplay, setIsReplay] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [tunnelDone, setTunnelDone] = useState(false);
  const [meanMorale, setMeanMorale] = useState<number | null>(null);
  const replayTriggered = useRef(false);

  const handleShare = async () => {
    const matchUrl = `${window.location.origin}/matches/${matchId}`;
    setSharing(true);
    try {
      const ok = await matchesApi.tryOgImage(matchId);
      if (ok) {
        toast.success(t('gameplay:match.toasts.cardGenerated'));
      } else {
        await navigator.clipboard.writeText(matchUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2200);
        toast.success(t('gameplay:match.toasts.linkCopied'));
      }
    } catch {
      try {
        await navigator.clipboard.writeText(matchUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2200);
        toast.success(t('gameplay:match.toasts.linkCopied'));
      } catch {
        toast.error(t('gameplay:match.toasts.shareError'));
      }
    } finally {
      setSharing(false);
    }
  };

  const handleTimeMachine = useCallback(async () => {
    setTimeMachineLoading(true);
    try {
      const res = await matchesApi.getTimelineFromSeed(matchId);
      if (res && res.ok && res.timeline) {
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            result: {
              ...prev.result,
              timeline: res.timeline,
              homeRatings: res.homeRatings ?? prev.result.homeRatings,
              awayRatings: res.awayRatings ?? prev.result.awayRatings,
            }
          };
        });
        if (res.reproducesPersistedScore === false) {
          setResimulationWarning(true);
        } else {
          setResimulationWarning(false);
        }
        setCinematic(true);
        setViewMode('match');
        setIsReplay(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('gameplay:match.toasts.replayError'));
    } finally {
      setTimeMachineLoading(false);
    }
  }, [matchId, t]);

  const load = useCallback(async () => {
    if (!Number.isFinite(matchId)) { setError('Partido no válido'); return; }
    setViewMode('loading'); setError(null);
    try {
      let payload: Record<string, any>;
      try { payload = await matchesApi.getMatch(matchId); }
      catch { payload = await matchesApi.getPublic(matchId); }
      
      const parsed = parseMatchDetail(payload);
      setData(parsed);
      setRaw({
        number: payload.matchday?.number ?? payload.matchdayNum,
        competition: payload.matchday?.competition?.shortName ?? payload.matchday?.competition?.name
          ?? payload.competition?.shortName ?? payload.competition?.name,
      });

      // Intentamos cargar la previa para el Acto A
      try {
        const prev = await matchesApi.getPreview(matchId);
        setPreview(prev);
      } catch {
        // Fallback silencioso si no hay previa
      }

      // Lógica de modo de vista (Fase 1: 3 actos)
      if (payload.resultHidden === true) {
        setViewMode('hidden_prompt');
      } else if (!parsed.played) {
        setViewMode('preview');
      } else {
        // Ya jugado y descubierto: abrir primero el visor si hay replay/timeline.
        setViewMode(parsed.result.timeline?.length ? 'match' : parsed.analysis ? 'analysis' : 'match');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el partido');
      setViewMode('match'); // Fallback mode so it stops showing loading state and shows error message
    }
  }, [matchId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [matchId, viewMode]);

  useEffect(() => {
    if (!club?.id) return;
    let cancelled = false;
    playersApi.getSquad()
      .then((squad: any[]) => {
        if (cancelled || !Array.isArray(squad) || squad.length === 0) return;
        const avg = Math.round(squad.reduce((sum, p) => sum + (p.morale ?? 100), 0) / squad.length);
        setMeanMorale(avg);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [club?.id, data?.played]);

  useEffect(() => {
    setTunnelDone(false);
  }, [matchId, cinematic]);

  useEffect(() => {
    if (replayTriggered.current) return;
    if (searchParams.get('replay') !== '1') return;
    if (viewMode === 'loading' || viewMode === 'hidden_prompt' || !data?.played) return;
    replayTriggered.current = true;
    void handleTimeMachine();
  }, [searchParams, viewMode, data?.played, handleTimeMachine]);

  const kit = data ? resolveClash(
    kitOf(data.homeClub?.badge, data.homeClub?.id, data.homeName),
    kitOf(data.awayClub?.badge, data.awayClub?.id, data.awayName)
  ) : { home: '#fff', away: '#fff' };

  const isMyMatch = Boolean(club?.id && data && (data.homeClub?.id === club.id || data.awayClub?.id === club.id));

  return (
    <div className={cn('page-surface', viewMode === 'match' && 'mp-cinema', 'space-y-6')}>
      <style>{MATCH_PAGE_TOOLBAR_CSS}</style>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/calendar')} className="mb-3">
            <ArrowLeft size={14} /> {t('gameplay:match.backToCalendar')}
          </Button>
          <p className="muted-label">{t('gameplay:match.headerMeta', { competition: raw?.competition ?? t('gameplay:match.defaultCompetition'), number: raw?.number ?? '—' })}</p>
          <h1 className="section-title mt-1 text-3xl sm:text-4xl">{t('gameplay:match.title')}</h1>
        </div>
        <div className="mp-toolbar">
          {viewMode !== 'loading' && viewMode !== 'hidden_prompt' && (
            <>
              {viewMode !== 'preview' && (
                <Button variant="ghost" size="sm" className="mp-btn-ghost" onClick={() => setViewMode('preview')}>
                  <Tv size={15} /> {t('gameplay:match.toolbar.preview')}
                </Button>
              )}
              {viewMode !== 'match' && data?.played && (
                <Button variant="ghost" size="sm" className="mp-btn-ghost" onClick={() => { setCinematic(false); setViewMode('match'); }}>
                  <Play size={15} /> {t('gameplay:match.toolbar.match')}
                </Button>
              )}
              {viewMode !== 'analysis' && data?.played && (
                <Button variant="ghost" size="sm" className="mp-btn-ghost" onClick={() => setViewMode('analysis')}>
                  <BarChart2 size={15} /> {t('gameplay:match.toolbar.analysis')}
                </Button>
              )}
            </>
          )}
          {data?.played && viewMode !== 'loading' && viewMode !== 'hidden_prompt' && (
            <Button variant="ghost" size="sm" className="mp-btn-tunnel" onClick={handleTimeMachine} disabled={timeMachineLoading} title={t('gameplay:match.toolbar.timeMachineTitle')}>
              <HistoryIcon size={15} className={timeMachineLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{timeMachineLoading ? t('gameplay:match.toolbar.reviving') : t('gameplay:match.toolbar.revive')}</span>
            </Button>
          )}
          {data?.played && viewMode !== 'loading' && viewMode !== 'hidden_prompt' && (
            <Button
              variant="ghost"
              size="sm"
              className="mp-btn-share"
              data-copied={shareCopied || undefined}
              onClick={() => void handleShare()}
              disabled={sharing}
              title={t('gameplay:match.toolbar.shareTitle')}
            >
              <Share2 size={15} className={sharing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{shareCopied ? t('gameplay:match.toolbar.copied') : t('gameplay:match.toolbar.share')}</span>
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={load}><Gauge size={15} /> {t('gameplay:match.toolbar.refresh')}</Button>
        </div>
      </div>

      {viewMode === 'loading' && <SkeletonMatch />}

      {viewMode !== 'loading' && (error || !data) && (
        <EmptyState
          icon={<CircleAlert size={34} />}
          title={t('gameplay:match.loadError')}
          hint={error ?? t('gameplay:match.loadError')}
          action={<Button variant="secondary" onClick={() => void load()}>{t('gameplay:match.retry')}</Button>}
        />
      )}

      {viewMode === 'hidden_prompt' && data && (
        <div className="section-panel p-12 text-center" style={{ position: 'relative', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(30px)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 20px 50px rgba(0,0,0,0.6)', borderRadius: '32px', zIndex: 1 }}>
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px)', opacity: 0.5 }} />
          <div style={{ position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)', width: 200, height: 200, background: 'radial-gradient(circle, rgba(250,204,21,0.2), transparent 70%)', filter: 'blur(30px)', zIndex: -1 }} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold-accent)', display: 'inline-block', boxShadow: '0 0 10px var(--gold-accent)' }} className="animate-pulse" />
            <p className="text-[10px] uppercase tracking-widest font-black" style={{ color: 'var(--gold-accent)' }}>{t('gameplay:match.hidden.badge')}</p>
          </div>
          <h2 className="section-title text-4xl sm:text-5xl" style={{ margin: '16px 0 8px', textShadow: '0 5px 15px rgba(0,0,0,0.8)' }}>
            <span style={{ color: 'white', fontWeight: 900 }}>{data.homeName}</span>{' '}
            <span style={{ color: 'var(--gold-accent)', fontFamily: 'var(--font-mono-retro)', padding: '0 12px', fontSize: '1.2em', filter: 'drop-shadow(0 0 10px rgba(250,204,21,0.4))' }}>? - ?</span>{' '}
            <span style={{ color: 'white', fontWeight: 900 }}>{data.awayName}</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1rem', marginBottom: 32, fontFamily: 'var(--font-sans)', fontWeight: 600, letterSpacing: '0.5px' }}>{t('gameplay:match.hidden.sealedHint')}</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button size="lg" disabled={revealing} onClick={async () => {
              setRevealing(true);
              try { try { await matchesApi.markSeen(matchId); } catch (e) { console.warn(e); } await load(); setCinematic(true); setViewMode('preview'); }
              finally { setRevealing(false); }
            }} style={{ fontSize: '1.1rem', padding: '0 32px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg, var(--gold-accent), #d97706)', color: 'black', fontWeight: 900, boxShadow: '0 10px 25px rgba(250,204,21,0.4)' }}>
              <Play size={18} style={{ marginRight: 8 }} /> {t('gameplay:match.hidden.watch')}
            </Button>
            <Button variant="secondary" size="lg" disabled={revealing} onClick={async () => {
              setRevealing(true);
              try { try { await matchesApi.markSeen(matchId); } catch (e) { console.warn(e); } await load(); setCinematic(false); setViewMode('analysis'); }
              finally { setRevealing(false); }
            }} style={{ fontSize: '1rem', padding: '0 24px', height: '56px', borderRadius: '16px', background: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: 800, border: '1px solid rgba(255,255,255,0.1)' }}>
              {t('gameplay:match.hidden.skipToResult')}
            </Button>
          </div>
        </div>
      )}

      {viewMode === 'preview' && data && (
        <div className="space-y-6">
          <MatchPreview
            preview={preview}
            matchId={matchId}
            canStart={data.played}
            onStart={() => { setCinematic(true); setJumpToMinute(undefined); setViewMode('match'); }}
          />

          {!data.played ? (
            <div className="section-panel-subtle p-6 text-center">
              <Timer size={30} className="mx-auto mb-3 text-[var(--blue-info)]" />
              <h2 className="section-title text-xl">{t('gameplay:match.pending.title')}</h2>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                {t('gameplay:match.pending.hint')}
              </p>
            </div>
          ) : (
            <div
              className="section-panel flex flex-col items-center gap-4 p-8 text-center"
              style={{
                background: 'linear-gradient(180deg, color-mix(in srgb, var(--green-primary) 12%, var(--bg-surface)) 0%, var(--bg-surface) 100%)',
                borderColor: 'color-mix(in srgb, var(--green-primary) 32%, var(--border-color))',
              }}
            >
              <p className="muted-label">{t('gameplay:match.headerMeta', { competition: raw?.competition ?? t('gameplay:match.defaultCompetition'), number: raw?.number ?? '—' })}</p>
              <Button
                size="lg"
                onClick={() => { setCinematic(true); setJumpToMinute(undefined); setViewMode('match'); }}
                style={{
                  height: '56px',
                  padding: '0 44px',
                  fontSize: '1.05rem',
                  fontWeight: 900,
                  color: '#08130c',
                  background: 'linear-gradient(135deg, var(--green-primary), color-mix(in srgb, var(--green-primary) 55%, var(--gold-accent)))',
                  boxShadow: '0 16px 44px -10px color-mix(in srgb, var(--green-primary) 80%, transparent)',
                }}
              >
                <Play size={18} fill="currentColor" /> {t('gameplay:match.hidden.watch')}
              </Button>
            </div>
          )}

          {import.meta.env.DEV && (
            <details className="mp-audit-fold">
              <summary>{t('gameplay:match.auditSummary')}</summary>
              <div className="pt-3">
                <MatchSeedAuditPanel matchId={matchId} played={data.played} onRevive={handleTimeMachine} reviveLoading={timeMachineLoading} />
              </div>
            </details>
          )}
        </div>
      )}

      {viewMode === 'match' && data && data.played && (
        <div className="mp-match-view">
          <details className="mp-audit-fold">
            <summary>{t('gameplay:match.auditSummary')}</summary>
            <div className="pt-3">
              <MatchSeedAuditPanel matchId={matchId} played onRevive={handleTimeMachine} reviveLoading={timeMachineLoading} />
            </div>
          </details>
          {timeMachineLoading && (
            <MatchTunnelBanner
              variant="loading"
              title={t('gameplay:match.tunnel.loadingTitle')}
              body={t('gameplay:match.tunnel.loadingBody')}
            />
          )}
          {isReplay && !resimulationWarning && !timeMachineLoading && (
            <MatchTunnelBanner
              variant="success"
              title={t('gameplay:match.tunnel.successTitle')}
              body={<>{t('gameplay:match.tunnel.successBefore')}<b>{t('gameplay:match.tunnel.successBold')}</b>{t('gameplay:match.tunnel.successAfter')}</>}
            />
          )}
          {resimulationWarning && !timeMachineLoading && (
            <MatchTunnelBanner
              variant="warning"
              title={t('gameplay:match.tunnel.warningTitle')}
              body={t('gameplay:match.tunnel.warningBody')}
            />
          )}
          <div className="mp-match-layout">
            <div className="mp-match-main">
              {cinematic && !tunnelDone ? (
                <PreMatchTunnel
                  homeName={data.homeName}
                  awayName={data.awayName}
                  homeClub={data.homeClub}
                  awayClub={data.awayClub}
                  homeRatings={data.result.homeRatings}
                  awayRatings={data.result.awayRatings}
                  onComplete={() => setTunnelDone(true)}
                />
              ) : (
                <MatchCenter key={cinematic ? 'cinematic' : 'match'}
                             result={data.result} homeName={data.homeName} awayName={data.awayName}
                             homeClub={data.homeClub} awayClub={data.awayClub}
                             weather={data.weather} homeFormation={data.homeFormation} awayFormation={data.awayFormation}
                             cinematic={cinematic} jumpToMinute={jumpToMinute}
                             onResimulate={handleTimeMachine} timeMachineLoading={timeMachineLoading}
                             onOpenPreview={() => setViewMode('preview')}
                             onOpenAnalysis={() => setViewMode('analysis')} />
              )}
            </div>
            <aside className="mp-match-chat">
              <MatchChatPanel matchId={matchId} homeClubId={data.homeClub?.id || 0} awayClubId={data.awayClub?.id || 0} />
            </aside>
          </div>
        </div>
      )}

      {viewMode === 'analysis' && data && data.played && (
        data.analysis ? (
          <div className="space-y-4">
            {isMyMatch && (
              <PostMatchLocker
                homeClubId={data.homeClub?.id}
                awayClubId={data.awayClub?.id}
                homeGoals={data.result.homeGoals}
                awayGoals={data.result.awayGoals}
                homeName={data.homeName}
                awayName={data.awayName}
                rivalryName={preview?.rivalry?.name ?? preview?.formalRivalry?.name}
                meanMorale={meanMorale}
              />
            )}
            {import.meta.env.DEV && (
              <details className="mp-audit-fold">
                <summary>{t('gameplay:match.auditSummary')}</summary>
                <div className="pt-3">
                  <MatchSeedAuditPanel matchId={matchId} played onRevive={handleTimeMachine} reviveLoading={timeMachineLoading} />
                </div>
              </details>
            )}
            <MatchAnalysis 
            analysis={data.analysis} 
            homeColor={kit.home} 
            awayColor={kit.away} 
            homeName={data.homeName}
            awayName={data.awayName}
            homeGoals={data.result.homeGoals}
            awayGoals={data.result.awayGoals}
            onPlayAtMinute={(minute) => {
              setCinematic(false);
              setJumpToMinute(minute);
              setViewMode('match');
            }} 
          />
          </div>
        ) : (
          <div className="section-panel p-8 text-center">
            <BarChart2 size={30} className="mx-auto mb-3 text-[var(--gold-accent)]" />
            <h2 className="section-title text-xl">{t('gameplay:match.analysisUnavailable.title')}</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              {t('gameplay:match.analysisUnavailable.hint')}
            </p>
            <Button className="mt-4" onClick={() => setViewMode('match')}>
              <Play size={15} /> {t('gameplay:match.analysisUnavailable.openViewer')}
            </Button>
          </div>
        )
      )}
    </div>
  );
}
