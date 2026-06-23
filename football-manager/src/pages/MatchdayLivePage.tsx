// ─── V1+E15 · Jornada en Vivo ──────────────────────────────────────────────────
// Todos los partidos de la jornada en paralelo: multi-marcador con goles entrando
// en directo por WS `league:{id}` (frames {type:'match:event', payload}) con
// fallback a recarga periódica. Selector de competición, ticker de goles,
// marcadores con flash y clic → Centro de partido.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Radio, Goal } from 'lucide-react';
import { worldApi, matchesApi } from '../api/client';
import { subscribe, type LiveChannel } from '../lib/ws';
import { Skeleton, EmptyState, ClubBadge } from '../components/ui';
import { LeagueDropdown } from '../components/ui/LeagueDropdown';
import { cn } from '../lib/cn';

interface LiveMatch {
  id: number; status?: string; playedAt?: string;
  homeClub?: { id: number; name?: string; shortName?: string; badge?: string };
  awayClub?: { id: number; name?: string; shortName?: string; badge?: string };
  homeGoals?: number | null; awayGoals?: number | null; resultHidden?: boolean;
  flash?: boolean;
}
interface TickerItem { matchId: number; minute?: number; text: string; ts: number }

function cardKeyActivate(e: React.KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); }
}

function mapLiveMatch(m: any): LiveMatch {
  return {
    id: m.id,
    status: m.status,
    playedAt: m.playedAt,
    homeClub: m.homeClub,
    awayClub: m.awayClub,
    homeGoals: m.homeGoals,
    awayGoals: m.awayGoals,
    resultHidden: m.resultHidden,
  };
}

/** Liga (matchdays), copa (rounds) o lista plana de fixtures. */
function extractLiveRound(r: any): { label: number | string | null; matches: LiveMatch[] } {
  const mds: any[] = r?.matchdays ?? [];
  if (mds.length > 0) {
    const current = mds.find((m: any) => (m.matches ?? []).some((x: any) => x.status !== 'played')) ?? mds[mds.length - 1];
    return { label: current?.number ?? null, matches: (current?.matches ?? []).map(mapLiveMatch) };
  }
  const rounds: any[] = r?.rounds ?? [];
  if (rounds.length > 0) {
    const current = rounds.find((rd: any) => (rd.matches ?? []).some((x: any) => x.status !== 'played')) ?? rounds[rounds.length - 1];
    return { label: current?.name ?? current?.number ?? null, matches: (current?.matches ?? []).map(mapLiveMatch) };
  }
  const flat = Array.isArray(r?.matches) ? r.matches : [];
  if (flat.length > 0) {
    return { label: r?.roundName ?? r?.stage ?? null, matches: flat.map(mapLiveMatch) };
  }
  return { label: null, matches: [] };
}

export function MatchdayLivePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: matchIdParam } = useParams();
  const focusMatchId = matchIdParam && Number.isFinite(Number(matchIdParam)) ? Number(matchIdParam) : null;
  const [competitions, setCompetitions] = useState<any[]>([]);
  const [compId, setCompId] = useState<number | null>(null);
  const [roundLabel, setRoundLabel] = useState<number | string | null>(null);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [ticker, setTicker] = useState<TickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveMode, setLiveMode] = useState<'ws' | 'polling'>('polling');
  const chanRef = useRef<LiveChannel | null>(null);

  useEffect(() => {
    worldApi.competitions()
      .then((r: any) => {
        const list = Array.isArray(r) ? r : r?.competitions ?? [];
        setCompetitions(list);
        if (list.length > 0) setCompId((prev) => prev ?? list[0].id);
      })
      .catch(() => setCompetitions([]));
  }, []);

  const loadFixtures = useMemo(() => async (id: number) => {
    setLoading(true);
    try {
      const r: any = await worldApi.competitionFixtures(id);
      const { label, matches: next } = extractLiveRound(r);
      setRoundLabel(label);
      setMatches(next);
    } catch { setMatches([]); setRoundLabel(null); }
    setLoading(false);
  }, []);

  useEffect(() => { if (compId != null) loadFixtures(compId); }, [compId, loadFixtures]);

  // Ruta /matches/:id/live — seleccionar competición del partido y mostrarlo en la rejilla
  useEffect(() => {
    if (focusMatchId == null) return;
    let cancelled = false;
    matchesApi.getMatch(focusMatchId)
      .then((m) => {
        if (cancelled || !m?.id) return;
        const comp = m.competitionId ?? m.competition?.id;
        if (comp != null) setCompId(comp);
        setMatches(prev => prev.some(x => x.id === m.id) ? prev : [mapLiveMatch(m), ...prev]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [focusMatchId]);

  useEffect(() => {
    if (compId == null) return;
    chanRef.current?.close();
    const chan = subscribe(
      `league:${compId}`,
      (frame: any) => {
        if (frame?.type === 'poll') { loadFixtures(compId); return; }
        if (frame?.type !== 'match:event') return;
        const ev = frame.payload ?? {};
        setLiveMode('ws');
        if (ev.type === 'goal' && ev.score) {
          setMatches(ms => ms.map(m => m.id === ev.matchId
            ? { ...m, homeGoals: ev.score.home, awayGoals: ev.score.away, status: 'live', flash: true }
            : m));
          setTicker(tk => [{ matchId: ev.matchId, minute: ev.minute, text: ev.description ?? t('gameplay:matchdayLive.goal'), ts: Date.now() }, ...tk].slice(0, 14));
          setTimeout(() => setMatches(ms => ms.map(m => m.id === ev.matchId ? { ...m, flash: false } : m)), 2500);
        }
      },
      () => loadFixtures(compId),
      10000,
    );
    chanRef.current = chan;
    const poll = setInterval(() => setLiveMode(chan.mode), 3000);
    return () => { clearInterval(poll); chan.close(); };
  }, [compId, loadFixtures, t]);

  const roundSuffix = roundLabel != null
    ? (typeof roundLabel === 'number' ? ` · J${roundLabel}` : ` · ${roundLabel}`)
    : '';

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .lv-hero {
          position: relative; overflow: hidden; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 40px;
          border-radius: 20px; background: linear-gradient(145deg, var(--brutal-bg-1), var(--brutal-bg-2)); border: 2px solid rgba(239, 68, 68, 0.3);
          box-shadow: 0 20px 50px var(--brutal-shadow), inset 0 0 40px rgba(239, 68, 68, 0.05);
        }
        .lv-hero::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(239, 68, 68, 0.05) 10px, rgba(239, 68, 68, 0.05) 20px); pointer-events: none; opacity: 0.5; }
        .lv-live-indicator {
          display: inline-flex; align-items: center; gap: 12px; font-family: var(--font-display); font-weight: 900; font-size: 1rem; letter-spacing: 3px;
          padding: 12px 24px; border-radius: 12px; background: rgba(239, 68, 68, 0.15); color: var(--red-danger); border: 1px solid var(--red-danger);
          box-shadow: 0 0 30px rgba(239, 68, 68, 0.3), inset 0 0 15px rgba(239, 68, 68, 0.2); text-transform: uppercase; z-index: 1; text-shadow: 0 0 10px rgba(239, 68, 68, 0.5);
        }
        .lv-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--red-danger); box-shadow: 0 0 15px var(--red-danger); animation: lvpulse 1s infinite alternate; }
        @keyframes lvpulse { from { opacity: 0.5; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); box-shadow: 0 0 25px var(--red-danger); } }
        
        .lv-tabs { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 8px; }
        .lv-tab {
          padding: 14px 28px; font-family: var(--font-display); font-weight: 900; font-size: 0.95rem; letter-spacing: 2px; text-transform: uppercase;
          background: var(--brutal-glass); color: var(--brutal-text-muted); border: 1px solid var(--brutal-border); border-radius: 16px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 10px 30px var(--brutal-shadow); backdrop-filter: blur(10px);
        }
        .lv-tab:hover { border-color: rgba(239, 68, 68, 0.4); color: var(--brutal-text); transform: translateY(-3px); box-shadow: 0 15px 40px var(--brutal-shadow), 0 0 20px rgba(239, 68, 68, 0.2); }
        .lv-tab.active { background: rgba(239, 68, 68, 0.1); color: var(--red-danger); border-color: var(--red-danger); box-shadow: 0 0 20px rgba(239, 68, 68, 0.4), inset 0 0 15px rgba(239, 68, 68, 0.2); text-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }

        .lv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 24px; margin-top: 16px; }
        .lv-card {
          position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; padding: 24px 20px;
          background: linear-gradient(180deg, var(--brutal-card-bg-1), var(--brutal-card-bg-2)); border: 1px solid var(--brutal-border); border-radius: 20px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 15px 40px var(--brutal-shadow);
        }
        .lv-card:hover { transform: translateY(-5px); border-color: rgba(239, 68, 68, 0.4); box-shadow: 0 25px 50px rgba(0,0,0,0.6), 0 0 30px rgba(239, 68, 68, 0.1); }
        .lv-card.focused { border-color: var(--gold-accent); box-shadow: 0 0 0 2px var(--gold-accent), 0 20px 40px var(--brutal-shadow), 0 0 30px rgba(255,215,0,0.2); }
        
        .lv-team { display: flex; align-items: center; gap: 16px; font-size: 1.1rem; font-weight: 900; color: var(--brutal-text); min-width: 0; font-family: var(--font-display); letter-spacing: 1px; text-transform: uppercase; }
        .lv-team span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lv-team.away { justify-content: flex-end; }
        
        .lv-score {
          font-family: var(--font-mono-retro); font-weight: 900; font-size: 2rem; padding: 12px 20px; border-radius: 12px;
          background: var(--brutal-bg-elevated); border: 1px solid var(--brutal-border); color: var(--brutal-text); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: inset 0 4px 15px rgba(0,0,0,0.8); text-shadow: 0 0 20px rgba(255,255,255,0.3); display: flex; align-items: center; justify-content: center; min-width: 100px; letter-spacing: 2px;
        }
        .lv-score.flash { background: var(--gold-accent); color: #000; border-color: var(--gold-accent); animation: goalflash 2s ease-out; text-shadow: none; }
        @keyframes goalflash { 0%, 20%, 40% { transform: scale(1.2); box-shadow: 0 0 50px var(--gold-accent), inset 0 0 20px #fff; } 100% { transform: scale(1); box-shadow: inset 0 4px 15px rgba(0,0,0,0.8); } }
        
        .lv-status { grid-column: 1 / -1; text-align: center; font-family: var(--font-sans); font-size: 0.8rem; font-weight: 800; text-transform: uppercase; letter-spacing: 3px; color: var(--brutal-text-muted); margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--brutal-border); }
        .lv-status-live { color: var(--red-danger); font-weight: 900; animation: pulsetext 2s infinite; text-shadow: 0 0 10px rgba(239, 68, 68, 0.5); }
        @keyframes pulsetext { 50% { opacity: 0.4; } }
        
        .lv-ticker {
          background: linear-gradient(135deg, var(--brutal-card-bg-1), var(--brutal-card-bg-2)); border: 1px solid var(--brutal-border); border-radius: 20px; padding: 24px; box-shadow: 0 25px 50px var(--brutal-shadow);
          position: relative; overflow: hidden; margin-top: 24px;
        }
        .lv-ticker::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--gold-accent); box-shadow: 0 0 20px var(--gold-accent); }
        .lv-tk-header { display: flex; align-items: center; gap: 12px; font-family: var(--font-display); font-weight: 900; font-size: 1.2rem; color: var(--brutal-text); text-transform: uppercase; letter-spacing: 3px; margin-bottom: 20px; text-shadow: 0 0 15px rgba(255,255,255,0.2); }
        .lv-tk-list { display: flex; flex-direction: column; gap: 12px; }
        .lv-tk { display: flex; align-items: center; gap: 20px; font-size: 1rem; padding: 16px 20px; background: var(--brutal-glass); border-radius: 12px; border: 1px solid var(--brutal-border); animation: lvin 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 15px var(--brutal-shadow); }
        @keyframes lvin { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        .lv-min { font-family: var(--font-mono-retro); font-weight: 900; color: var(--gold-accent); width: 50px; font-size: 1.2rem; text-shadow: 0 0 10px rgba(255,215,0,0.3); }
      `}</style>

      <div className="lv-hero">
        <div style={{ zIndex: 1 }}>
          <p className="font-display text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-1 flex items-center gap-2">
            <Radio size={14} className="animate-pulse" /> {t('gameplay:matchdayLive.kicker')}
          </p>
          <h1 className="font-display font-black text-4xl tracking-widest uppercase leading-none" style={{ color: 'var(--brutal-text)' }}>
            {t('gameplay:matchdayLive.title')}{roundSuffix && <span style={{ color: 'var(--gold-accent)' }}>{roundSuffix}</span>}
          </h1>
        </div>
        <div className="lv-live-indicator">
          <span className="lv-dot" /> {liveMode === 'ws' ? t('gameplay:matchdayLive.live') : t('gameplay:matchdayLive.polling')}
        </div>
      </div>

      <div className="my-6">
        <LeagueDropdown
          competitions={competitions}
          selectedId={compId}
          onChange={setCompId}
          label={t('gameplay:matchdayLive.kicker', 'EN DIRECTO')}
        />
      </div>

      {loading && <div className="lv-grid">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={104} />)}</div>}

      {!loading && matches.length === 0 && (
        <EmptyState icon={<Radio size={32} />} title={t('gameplay:matchdayLive.emptyTitle')} hint={t('gameplay:matchdayLive.emptyHint')} />
      )}

      {!loading && matches.length > 0 && (
        <div className="lv-grid">
          {matches.map(m => {
            const played = m.status === 'played' || m.status === 'live';
            const statusLabel = m.status === 'live'
              ? <span className="lv-status-live">{t('gameplay:matchdayLive.statusLive')}</span>
              : m.status === 'played'
                ? t('gameplay:matchdayLive.statusPlayed')
                : t('gameplay:matchdayLive.statusPending');
            return (
              <div
                key={m.id}
                className={cn('lv-card', focusMatchId === m.id && 'focused')}
                onClick={() => navigate(`/matches/${m.id}`)}
                onKeyDown={(e) => cardKeyActivate(e, () => navigate(`/matches/${m.id}`))}
                role="button"
                tabIndex={0}
                aria-label={`${m.homeClub?.shortName ?? m.homeClub?.name ?? 'Local'} contra ${m.awayClub?.shortName ?? m.awayClub?.name ?? 'Visitante'}`}
              >
                <div className="lv-team">
                  <ClubBadge id={m.homeClub?.id} name={m.homeClub?.name} size={28} />
                  <span>{m.homeClub?.shortName ?? m.homeClub?.name ?? '—'}</span>
                </div>
                <div className={cn('lv-score', m.flash && 'flash')}>
                  {played && m.homeGoals != null ? (m.resultHidden ? '? - ?' : `${m.homeGoals}-${m.awayGoals}`) : 'VS'}
                </div>
                <div className="lv-team away">
                  <span>{m.awayClub?.shortName ?? m.awayClub?.name ?? '—'}</span>
                  <ClubBadge id={m.awayClub?.id} name={m.awayClub?.name} size={28} />
                </div>
                <div className="lv-status" aria-live="polite">{statusLabel}</div>
              </div>
            );
          })}
        </div>
      )}

      {ticker.length > 0 && (
        <div className="lv-ticker">
          <div className="lv-tk-header">
            <Goal size={20} color="var(--gold-accent)" /> {t('gameplay:matchdayLive.tickerTitle')}
          </div>
          <div className="lv-tk-list">
            {ticker.map(item => (
              <div key={`${item.matchId}-${item.ts}`} className="lv-tk">
                <span className="lv-min">{item.minute != null ? `${item.minute}'` : '—'}</span>
                <span style={{ color: 'var(--brutal-text)', fontWeight: 600 }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
