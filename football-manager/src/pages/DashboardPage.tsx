import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarClock, Trophy, Wallet, 
  ChevronRight, Crown, ShoppingBag, Newspaper, 
  FileText, Activity, AlertCircle, MessageSquare, Flame, Swords
} from 'lucide-react';
import { clubApi, gameApi, matchesApi, marketApi, playersApi, prestigeApi, newsApi, academyApi, request } from '../api/client';
import { eur } from '../lib/format';
import { computeStreak, formSparkline } from '../lib/kpiSports';
import { useSession } from '../stores/sessionStore';
import { KPICard, Skeleton, ClubBadge } from '../components/ui';
import { ClubLink, ManagerLink } from '../components/common/EntityLink';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';
import { cn } from '../lib/cn';

interface NextMatch { id: number; homeClubId?: number; homeClub?: any; awayClubId?: number; awayClub?: any; matchday?: any; status?: string }
interface StandRow { rank: number; played: number; won: number; drawn: number; lost: number; points: number; club: any }

function activateOnKey(e: React.KeyboardEvent, action: () => void) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); action(); }
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { club } = useSession();
  
  const [loading, setLoading] = useState(true);
  
  const [dash, setDash] = useState<any>(null);
  const [clubInfo, setClubInfo] = useState<any>(null);
  const [standings, setStandings] = useState<StandRow[]>([]);
  const [nextMatch, setNextMatch] = useState<NextMatch | null>(null);
  const [recentMatches, setRecentMatches] = useState<any[]>([]);
  const [squad, setSquad] = useState<any[]>([]);
  const [prestige, setPrestige] = useState<number | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [pendingOffers, setPendingOffers] = useState<any[]>([]);
  const [promotableYouth, setPromotableYouth] = useState<any[]>([]);
  const [pendingPress, setPendingPress] = useState<any[]>([]);
  const [windowInfo, setWindowInfo] = useState<any>(null);
  const [cap, setCap] = useState<any>(null);
  const [advisor, setAdvisor] = useState<any>(null);
  const [rivalWeek, setRivalWeek] = useState<any>(null);
  const [missions, setMissions] = useState<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const [
        dashRes, clubRes, stdRes, mtsRes, windowRes, capRes, myOffersRes,
        offersRes, squadRes, presRes, newsRes, acadRes, pressRes, advisorRes, rivalRes, missionsRes
      ] = await Promise.allSettled([
        gameApi.dashboard().catch(() => ({})),
        clubApi.get(),
        clubApi.standings(),
        matchesApi.getAll(),
        marketApi.getWindow(),
        marketApi.getSalaryCap(),
        marketApi.getMyOffers(),
        marketApi.getOffers(),
        playersApi.getSquad(),
        prestigeApi.get(),
        newsApi.get(1),
        academyApi.get().catch(() => null),
        request<any[]>('/press/pending').catch(() => []),
        clubApi.advisor().catch(() => null),
        clubApi.rivalWeek().catch(() => null),
        request<any>('/missions').catch(() => null)
      ]);

      if (cancelled) return;

      if (clubRes.status === 'fulfilled') setClubInfo(clubRes.value);
      if (dashRes.status === 'fulfilled') setDash(dashRes.value);
      
      if (stdRes.status === 'fulfilled' && Array.isArray(stdRes.value)) {
        setStandings(stdRes.value.map((s: any, i: number) => ({
          rank: s.rank ?? i + 1, played: s.played ?? 0, won: s.won ?? 0,
          drawn: s.drawn ?? 0, lost: s.lost ?? 0, points: s.points ?? 0,
          club: { id: s.club?.id ?? s.clubId, name: s.name ?? s.club_name ?? s.club?.name ?? `Club ${s.clubId ?? i + 1}`, shortName: s.club?.shortName, badge: s.club?.badge },
        })));
      }

      if (mtsRes.status === 'fulfilled' && Array.isArray(mtsRes.value)) {
        const myId = club?.id;
        const mine = mtsRes.value.filter(m => m.homeClubId === myId || m.awayClubId === myId);
        const next = mine.find(m => m.status !== 'played');
        setNextMatch(next || null);
        setRecentMatches(mine.filter(m => m.status === 'played' && m.homeGoals != null).slice(-5));
      }

      if (windowRes.status === 'fulfilled') setWindowInfo(windowRes.value);
      if (capRes.status === 'fulfilled') setCap(capRes.value);
      
      let pOffers: any[] = [];
      if (myOffersRes.status === 'fulfilled' && Array.isArray(myOffersRes.value)) {
        pOffers = [...pOffers, ...myOffersRes.value.filter(o => o.status === 'pending' || o.status === 'countered')];
      }
      if (offersRes.status === 'fulfilled' && Array.isArray(offersRes.value)) {
        pOffers = [...pOffers, ...offersRes.value.filter(o => o.status === 'pending')];
      }
      setPendingOffers(pOffers);

      if (squadRes.status === 'fulfilled' && Array.isArray(squadRes.value)) setSquad(squadRes.value);
      if (presRes.status === 'fulfilled') setPrestige(presRes.value?.value ?? presRes.value);
      if (newsRes.status === 'fulfilled') {
        // El server devuelve { press: {data}, inbox: {data} } (news.routes.ts);
        // se aceptan también los formatos antiguos (array plano o {items}).
        const nv: any = newsRes.value;
        const rawNews = Array.isArray(nv) ? nv
          : Array.isArray(nv?.items) ? nv.items
          : [...(Array.isArray(nv?.press?.data) ? nv.press.data : []), ...(Array.isArray(nv?.inbox?.data) ? nv.inbox.data : [])]
              .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
        setNews(rawNews.slice(0, 4));
      }
      
      if (acadRes.status === 'fulfilled' && acadRes.value?.academyPlayers) {
        setPromotableYouth(acadRes.value.academyPlayers.filter((p: any) => p.status === 'ready' || (p.age >= 16 && p.overall >= 50)));
      }

      if (pressRes.status === 'fulfilled' && Array.isArray(pressRes.value)) {
        setPendingPress(pressRes.value);
      }
      if (advisorRes.status === 'fulfilled') setAdvisor(advisorRes.value);
      if (rivalRes.status === 'fulfilled') setRivalWeek(rivalRes.value);
      if (missionsRes.status === 'fulfilled') setMissions(missionsRes.value);

      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [club?.id]);

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={140} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={92} />)}
        </div>
        <Skeleton height={220} />
      </div>
    );
  }

  const myRow = club?.id != null ? standings.find(s => s.club?.id === club.id) : undefined;
  const rank = myRow?.rank ?? '—';
  const cash = clubInfo?.budget ?? clubInfo?.cash ?? clubInfo?.finances?.cash;
  const unreadInbox = (dash?.inbox ?? []).filter((i: any) => !i.isRead);

  const meanMorale = squad.length > 0 ? Math.round(squad.reduce((sum, p) => sum + (p.morale ?? 100), 0) / squad.length) : null;
  const inFormPlayers = [...squad].sort((a, b) => (b.fitness ?? 0) - (a.fitness ?? 0)).slice(0, 3);

  const isHome = nextMatch?.homeClubId === club?.id;
  const formLine = club?.id != null ? formSparkline(recentMatches, club.id) : [];
  const streak = club?.id != null ? computeStreak(recentMatches, club.id) : null;
  const rankNum = typeof rank === 'number' ? rank : undefined;

  const pendingTasksCount = pendingOffers.length + promotableYouth.length + pendingPress.length + unreadInbox.length;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{DASH_CSS}</style>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
        {dash?.seasonWeek != null && (
          <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', fontSize: '.75rem', color: 'var(--gold-accent)', background: 'color-mix(in srgb, var(--gold-accent) 15%, transparent)', padding: '6px 12px', borderRadius: '6px', border: '1px solid color-mix(in srgb, var(--gold-accent) 30%, transparent)' }}>
            {t('gameplay:dashboard.week', { week: dash.seasonWeek })}
          </div>
        )}
      </div>

      {pendingTasksCount > 0 && (
        <div className="dash-alerts">
          <div className="dash-alerts-title"><AlertCircle size={14}/> {t('gameplay:dashboard.alertsTitle')}</div>
          <div className="dash-alerts-list">
            {pendingOffers.length > 0 && (
              <button className="dash-alert-btn" onClick={() => navigate('/market')}>
                <ShoppingBag size={14}/> {t(pendingOffers.length === 1 ? 'gameplay:dashboard.offers' : 'gameplay:dashboard.offers_plural', { count: pendingOffers.length })}
              </button>
            )}
            {promotableYouth.length > 0 && (
              <button className="dash-alert-btn" onClick={() => navigate('/residences')}>
                <Crown size={14}/> {t(promotableYouth.length === 1 ? 'gameplay:dashboard.youth' : 'gameplay:dashboard.youth_plural', { count: promotableYouth.length })}
              </button>
            )}
            {pendingPress.length > 0 && (
              <button className="dash-alert-btn" onClick={() => navigate('/news')}>
                <MessageSquare size={14}/> {t('gameplay:dashboard.pressPending')}
              </button>
            )}
            {unreadInbox.length > 0 && (
              <button className="dash-alert-btn" onClick={() => navigate('/messages')}>
                <FileText size={14}/> {t(unreadInbox.length === 1 ? 'gameplay:dashboard.unread' : 'gameplay:dashboard.unread_plural', { count: unreadInbox.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {advisor?.recommendations?.length > 0 && (
        <div className="dash-alerts" style={{ marginTop: 8 }}>
          <div className="dash-alerts-title" style={{ color: 'var(--blue-info)' }}><Flame size={14}/> {t('gameplay:dashboard.advisorTitle')}</div>
          <div className="dash-alerts-list">
            {advisor.recommendations.map((rec: any, i: number) => (
              <button key={i} className="dash-alert-btn" style={{ color: rec.severity === 'high' ? 'var(--red-danger)' : 'var(--blue-info)', borderColor: 'currentColor', background: 'color-mix(in srgb, currentColor 10%, transparent)' }} onClick={() => rec.cta?.route && navigate(rec.cta.route)}>
                <b>{rec.title}</b>: {rec.detail}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hero: Próximo partido */}
      <div className="dash-hero">
        {nextMatch ? (
          <div className="dash-hero-content">
            <div className="dash-hero-header">
              <CalendarClock size={14} /> {t('gameplay:dashboard.nextMatch')} · {nextMatch.matchday?.competition?.name ?? t('gameplay:dashboard.defaultLeague')}
            </div>
            
            <div className="dash-matchup">
              <div className={cn("dash-team", isHome && "me")}>
                <ClubBadge id={nextMatch.homeClub?.id} name={nextMatch.homeClub?.name} size={48} />
                <b>{nextMatch.homeClub?.shortName ?? nextMatch.homeClub?.name}</b>
              </div>
              <div className="dash-vs">{t('gameplay:dashboard.vs')}</div>
              <div className={cn("dash-team", !isHome && "me")}>
                <ClubBadge id={nextMatch.awayClub?.id} name={nextMatch.awayClub?.name} size={48} />
                <b>{nextMatch.awayClub?.shortName ?? nextMatch.awayClub?.name}</b>
              </div>
            </div>

            {recentMatches.length > 0 && (
               <div className="dash-form">
                 <span className="dash-muted">{t('gameplay:dashboard.formLabel')}</span>
                 {recentMatches.map((m) => {
                    const h = m.homeClubId === club?.id;
                    const gf = h ? m.homeGoals : m.awayGoals, gc = h ? m.awayGoals : m.homeGoals;
                    const r = m.resultHidden ? '?' : (gf > gc ? 'V' : gf < gc ? 'D' : 'E');
                    const bg = m.resultHidden ? 'var(--text-muted)' : (r === 'V' ? 'var(--green-primary)' : r === 'D' ? 'var(--red-danger)' : 'var(--gold-accent)');
                    const title = m.resultHidden ? '? - ?' : `${gf}-${gc}`;
                    return <span key={m.id} title={title} className="dash-form-badge" style={{ background: bg }}>{r}</span>;
                 })}
               </div>
            )}
            
            <button className="dash-cta" onClick={() => navigate(`/matches/${nextMatch.id}`)}>
              {t('gameplay:dashboard.goMatchCenter')} <ChevronRight size={16} />
            </button>
          </div>
        ) : (
          <div className="dash-hero-content" style={{ justifyContent: 'center' }}>
            <div className="dash-muted">{t('gameplay:dashboard.noMatches')}</div>
          </div>
        )}
      </div>

      {/* QW-7: Rival de la Semana */}
      {rivalWeek?.rival && (
        <div className="dash-hero dash-rival" style={{ minHeight: 120, marginTop: 0 }}>
          <div className="dash-hero-content" style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 20, alignItems: 'center' }}>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div className="dash-hero-header" style={{ color: 'var(--red-danger)' }}>
                <Swords size={14} /> {t('gameplay:dashboard.rivalWeek')}
                {rivalWeek.prestigeMultiplier != null && rivalWeek.prestigeMultiplier > 1 && (
                  <span className="dash-rival-mult">×{rivalWeek.prestigeMultiplier}</span>
                )}
              </div>
              <h3 className="dash-rival-name">{rivalWeek.rival.name}</h3>
              <p className="dash-muted">{rivalWeek.tagline}</p>
            </div>
            <div className="dash-team">
              <ClubBadge id={rivalWeek.rival.id} name={rivalWeek.rival.name} size={64} />
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="dash-kpis">
        <KPICard
          label={t('gameplay:dashboard.kpis.position')}
          value={`#${rank}`}
          numericValue={rankNum}
          tone="green"
          icon={<Trophy size={16} />}
          juice="medium"
          status={{
            kind: 'position',
            caption: myRow ? `${myRow.points} pts · ${myRow.won}V ${myRow.drawn}E ${myRow.lost}D` : undefined,
            sparkline: formLine.length >= 2 ? formLine : undefined,
          }}
        />
        <KPICard
          label={t('gameplay:dashboard.kpis.cash')}
          value={eur(cash)}
          numericValue={typeof cash === 'number' ? cash : undefined}
          tone={cash != null && cash < 0 ? 'red' : 'blue'}
          icon={<Wallet size={16} />}
          status={streak ? { kind: 'streak', streak, sparkline: formLine.length >= 2 ? formLine : undefined } : undefined}
        />
        <KPICard
          label={t('gameplay:dashboard.kpis.morale')}
          value={meanMorale ? `${meanMorale}%` : '—'}
          numericValue={meanMorale ?? undefined}
          tone={meanMorale && meanMorale < 70 ? 'red' : 'gold'}
          icon={<Activity size={16} />}
          status={meanMorale != null ? { kind: 'morale', morale: meanMorale } : undefined}
        />
        <KPICard
          label={t('gameplay:dashboard.kpis.prestige')}
          value={prestige != null ? `${Math.round(prestige)}%` : '—'}
          numericValue={prestige != null ? Math.round(prestige) : undefined}
          tone="neutral"
          icon={<Crown size={16} />}
          status={{
            kind: 'form',
            caption: streak ? undefined : t('gameplay:dashboard.kpis.prestigeHint', 'Reputación del club'),
            sparkline: formLine.length >= 2 ? formLine : undefined,
            sparklineColor: 'var(--gold-accent)',
          }}
        />
      </div>

      <div className="dash-grid">
        {/* Plantilla y Forma */}
        <div className="dash-panel">
          <div className="dash-pt"><Activity size={14} /> {t('gameplay:dashboard.squadTitle')}</div>
          
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div className="dash-statbox">
              <span className="dash-statbox-l">{t('gameplay:dashboard.meanHealth')}</span>
              <span className="dash-statbox-v">{squad.length > 0 ? Math.round(squad.reduce((s, p) => s + (p.fitness ?? 100), 0) / squad.length) : 0}%</span>
            </div>
            <div className="dash-statbox">
              <span className="dash-statbox-l">{t('gameplay:dashboard.squadLabel')}</span>
              <span className="dash-statbox-v">{t('gameplay:dashboard.squadCount', { count: squad.length })}</span>
            </div>
          </div>

          <div className="dash-muted" style={{ marginBottom: 6, fontSize: '.75rem', textTransform: 'uppercase' }}>{t('gameplay:dashboard.inForm')}</div>
          <div className="dash-players">
            {inFormPlayers.map(p => (
              <div key={p.id} className="dash-player" role="button" tabIndex={0}
                aria-label={p.name}
                onClick={() => navigate('/squad')}
                onKeyDown={(e) => activateOnKey(e, () => navigate('/squad'))}
              >
                <div className="dash-player-n">{p.name}</div>
                <div className="dash-player-f">{p.fitness}%</div>
              </div>
            ))}
          </div>
          {squad.length === 0 && <span className="dash-muted">{t('gameplay:dashboard.noSquad')}</span>}
        </div>

        {/* Noticias recientes */}
        <div className="dash-panel">
          <div className="dash-pt"><Newspaper size={14} /> {t('gameplay:dashboard.newsTitle')}</div>
          <div className="dash-news">
            {news.map((n: any) => (
              <div key={n.id} className="dash-news-item" role="button" tabIndex={0}
                aria-label={n.title}
                onClick={() => navigate('/news')}
                onKeyDown={(e) => activateOnKey(e, () => navigate('/news'))}
              >
                <span className="dash-news-tag">{n.category ?? t('gameplay:dashboard.newsCategory')}</span>
                <span className="dash-news-t">{n.title}</span>
              </div>
            ))}
            {news.length === 0 && <span className="dash-muted">{t('gameplay:dashboard.noNews')}</span>}
          </div>
        </div>
      </div>

      <div className="dash-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
        {/* Mercado Info */}
        <div className="dash-panel">
          <div className="dash-pt"><ShoppingBag size={14} /> {t('gameplay:dashboard.marketTitle')}</div>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.7rem', padding: '3px 10px', borderRadius: 10, background: windowInfo?.transferWindow ? 'color-mix(in srgb,var(--green-primary) 16%,transparent)' : 'color-mix(in srgb,var(--red-danger) 16%,transparent)', color: windowInfo?.transferWindow ? 'var(--green-primary)' : 'var(--red-danger)' }}>
              {t('gameplay:dashboard.transferWindow')} {windowInfo?.transferWindow ? t('gameplay:dashboard.windowOpen') : t('gameplay:dashboard.windowClosed')}
            </span>
          </div>
          {cap && (
            <div style={{ fontSize: '.76rem' }}>
              <div className="dash-muted" style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                {t('gameplay:dashboard.salaryCap')}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${Math.min(100, cap.capMonthly ? (cap.usedMonthly / cap.capMonthly) * 100 : 0)}%`, background: cap.isOverCap ? 'var(--red-danger)' : 'var(--green-primary)' }} />
              </div>
              <div>{t('gameplay:dashboard.spent')} {eur(cap.usedMonthly)}</div>
              <div>{t('gameplay:dashboard.limit')} {eur(cap.capMonthly)}</div>
            </div>
          )}
        </div>

        
        {/* QW-20: Misiones Semanales */}
        {missions?.weekly && (
          <div className="dash-panel">
            <div className="dash-pt"><Trophy size={14} /> {t('gameplay:dashboard.missionsTitle')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {missions.weekly.missions.map((m: any) => (
                <div key={m.id} style={{ padding: 10, background: 'var(--bg-elevated)', borderRadius: 6, border: m.status === 'claimed' ? '1px solid var(--green-primary)' : '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{m.title}</span>
                    {m.status === 'claimed' && <span style={{ fontSize: '.7rem', color: 'var(--green-primary)', fontWeight: 'bold' }}>{t('gameplay:dashboard.missionComplete')}</span>}
                  </div>
                  <div className="dash-muted" style={{ fontSize: '.75rem', marginTop: 4 }}>{m.description}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    {m.reward?.xp > 0 && <span style={{ fontSize: '.7rem', padding: '2px 6px', background: 'color-mix(in srgb, var(--blue-info) 15%, transparent)', color: 'var(--blue-info)', borderRadius: 4 }}>{t('gameplay:dashboard.rewardXp', { count: m.reward.xp })}</span>}
                    {m.reward?.prestige > 0 && <span style={{ fontSize: '.7rem', padding: '2px 6px', background: 'color-mix(in srgb, var(--gold-accent) 15%, transparent)', color: 'var(--gold-accent)', borderRadius: 4 }}>{t('gameplay:dashboard.rewardPrestige', { count: m.reward.prestige })}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Clasificación */}
        <div className="dash-panel" style={{ padding: '14px 0' }}>
          <div className="dash-pt" style={{ padding: '0 14px' }}>{t('gameplay:dashboard.standingsTitle')}</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="dash-table">
              <thead><tr><th style={{ paddingLeft: 14 }}>#</th><th>{t('gameplay:dashboard.standingsTable.club')}</th><th>{t('gameplay:dashboard.standingsTable.played')}</th><th>{t('gameplay:dashboard.standingsTable.won')}</th><th>{t('gameplay:dashboard.standingsTable.drawn')}</th><th>{t('gameplay:dashboard.standingsTable.lost')}</th><th style={{ paddingRight: 14 }}>{t('gameplay:dashboard.standingsTable.points')}</th></tr></thead>
              <tbody>
                {standings.slice(0, 5).map(s => (
                  <tr key={s.rank} className={cn(s.club?.id === club?.id && 'me')} role="button" tabIndex={0}
                    aria-label={t('gameplay:dashboard.standingsRow', { pos: s.rank, club: s.club?.shortName ?? s.club?.name ?? '—' })}
                    onClick={() => navigate('/league')}
                    onKeyDown={(e) => activateOnKey(e, () => navigate('/league'))}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="dash-rank" style={{ paddingLeft: 14 }}>{s.rank}{s.club?.name === club?.name && <Crown size={11} />}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <ClubLink id={s.club?.id} name={s.club?.shortName ?? s.club?.name} />
                        {s.club?.manager ? (
                          <span style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
                            <ManagerLink id={s.club.manager.id} name={s.club.manager.name} />
                          </span>
                        ) : s.club?.npcCoach ? (
                          <NpcCoachIdentity npcCoach={s.club.npcCoach} size={14} compact showFormation={false} />
                        ) : null}
                      </div>
                    </td>
                    <td>{s.played}</td><td>{s.won}</td><td>{s.drawn}</td><td>{s.lost}</td>
                    <td className="dash-pts" style={{ paddingRight: 14 }}>{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

const DASH_CSS = `
.dash-alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 4px; }
.dash-alerts-title { display: flex; align-items: center; gap: 6px; font-size: .75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--gold-accent); font-weight: 700; font-family: var(--font-display); }
.dash-alerts-list { display: flex; gap: 8px; flex-wrap: wrap; }
.dash-alert-btn { display: inline-flex; align-items: center; gap: 6px; background: color-mix(in srgb, var(--gold-accent) 15%, transparent); color: var(--gold-accent); border: 1px solid color-mix(in srgb, var(--gold-accent) 30%, transparent); padding: 8px 14px; border-radius: 8px; font-size: .85rem; font-weight: 600; cursor: pointer; transition: all .2s ease; }
.dash-alert-btn:hover { background: color-mix(in srgb, var(--gold-accent) 25%, transparent); transform: translateY(-1px); }

.dash-hero { position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 28px 22px; border-radius: 16px; background: linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--green-primary) 10%, var(--bg-surface)) 100%); border: 1px solid var(--border-color); box-shadow: var(--shadow-soft); min-height: 200px; text-align: center; }
.dash-rival { background: linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--red-danger) 14%, var(--bg-surface)) 100%); min-height: 120px; padding: 22px; }
.dash-rival-name { font-size: 1.2rem; font-family: var(--font-display); font-weight: 800; margin: 8px 0; color: var(--text-primary); }
.dash-rival-mult { margin-left: 8px; font-size: .7rem; padding: 2px 8px; border-radius: 99px; border: 1px solid color-mix(in srgb, var(--gold-accent) 45%, var(--border-color)); color: var(--gold-accent); }
.dash-hero-content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }
.dash-hero-header { font-size: .75rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold-accent); display: flex; align-items: center; gap: 6px; font-weight: 700; font-family: var(--font-display); }
.dash-matchup { display: flex; align-items: center; justify-content: center; gap: 32px; width: 100%; margin: 8px 0; }
.dash-team { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 120px; }
.dash-team b { font-family: var(--font-display); font-size: 1.3rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; color: var(--text-primary); }
.dash-team.me b { color: var(--green-primary); }
.dash-vs { font-family: var(--font-display); font-size: 1.5rem; color: var(--text-muted); font-weight: 700; opacity: 0.6; }
.dash-form { display: flex; align-items: center; gap: 6px; }
.dash-form-badge { width: 24px; height: 24px; border-radius: 4px; display: grid; place-items: center; font-family: var(--font-sans); font-weight: 700; font-size: .75rem; color: var(--text-primary); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.dash-cta { display: inline-flex; align-items: center; gap: 6px; padding: 12px 24px; border-radius: 8px; cursor: pointer; background: var(--green-primary); color: var(--text-primary); border: none; font-weight: 600; font-size: .9rem; margin-top: 8px; transition: all .2s; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.3); }
.dash-cta:hover { background: color-mix(in srgb, var(--green-primary) 85%, black); transform: translateY(-2px); box-shadow: 0 6px 15px rgba(16, 185, 129, 0.4); }

.dash-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.dash-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.dash-panel { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; display: flex; flex-direction: column; box-shadow: var(--shadow-soft); }
.dash-pt { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 800; font-size: 1rem; color: var(--text-primary); text-transform: uppercase; letter-spacing: -0.01em; margin-bottom: 16px; }

.dash-statbox { background: var(--bg-elevated); border: 1px solid var(--border-color); padding: 12px; border-radius: 8px; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.dash-statbox-l { font-size: .75rem; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
.dash-statbox-v { font-size: 1.4rem; font-family: var(--font-sans); font-weight: 700; color: var(--green-primary); }

.dash-players { display: flex; flex-direction: column; gap: 8px; }
.dash-player { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-elevated); border-radius: 8px; cursor: pointer; transition: background .15s; border: 1px solid transparent; }
.dash-player:hover { background: var(--bg-surface); border-color: var(--green-primary); }
.dash-player-n { font-size: .9rem; font-weight: 600; }
.dash-player-f { font-family: var(--font-sans); font-size: .85rem; color: var(--green-primary); font-weight: 700; }

.dash-news { display: flex; flex-direction: column; gap: 8px; }
.dash-news-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-elevated); border-radius: 8px; cursor: pointer; transition: all .2s; border: 1px solid var(--border-color); }
.dash-news-item:hover { background: var(--bg-surface); border-color: var(--green-primary); transform: translateX(4px); }
.dash-news-tag { font-size: .65rem; text-transform: uppercase; padding: 3px 8px; background: var(--border-color); border-radius: 4px; color: var(--text-primary); flex: none; font-weight: 600; }
.dash-news-t { font-size: .9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; font-weight: 500; }

.dash-muted { color: var(--text-muted); font-size: .85rem; }

.dash-table { width: 100%; border-collapse: collapse; font-size: .875rem; }
.dash-table th { text-align: left; font-size: .7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); padding: 12px 8px; font-weight: 600; border-bottom: 1px solid var(--border-color); }
.dash-table td { padding: 12px 8px; border-bottom: 1px solid var(--border-color); font-weight: 500; }
.dash-table th:not(:nth-child(2)), .dash-table td:not(:nth-child(2)) { text-align: center; }
.dash-table tr { transition: background .15s; }
.dash-table tr:hover { background: var(--row-hover); }
.dash-table tr.me { background: var(--accent-soft); }
.dash-rank { font-family: var(--font-sans); display: flex; align-items: center; gap: 6px; justify-content: center; color: var(--gold-accent); font-weight: 700; }
.dash-pts { font-family: var(--font-sans); font-weight: 800; color: var(--green-primary); }

@media(max-width: 900px) {
  .dash-kpis { grid-template-columns: repeat(2, 1fr); }
  .dash-grid { grid-template-columns: 1fr; }
  .dash-matchup { gap: 16px; }
  .dash-team { width: 90px; }
}
`;
