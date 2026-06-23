import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, Eye, Video } from 'lucide-react';
import { matchesApi } from '../api/client';
import { ClubBadge, Skeleton, Button, EmptyState } from '../components/ui';
import { useSession } from '../stores/sessionStore';

export function ClubMatchesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { club } = useSession();
  const [data, setData] = useState<{ played: any[], upcoming: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllPlayed, setShowAllPlayed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await matchesApi.getMine();
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('gameplay:clubMatches.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page-surface match-diary">
      <style>{MATCH_DIARY_CSS}</style>
      <header className="match-diary__hero">
        <span><CalendarClock size={26} /></span>
        <div>
          <small>{t('gameplay:clubMatches.kicker')}</small>
          <h1>{t('gameplay:clubMatches.title')}</h1>
          <p>{t('gameplay:competition.command.description', 'Calendario competitivo, próximos retos y archivo de resultados de tu club.')}</p>
        </div>
        {data && (
          <div className="match-diary__summary">
            <span><small>{t('gameplay:clubMatches.upcoming')}</small><strong>{data.upcoming.length}</strong></span>
            <span><small>{t('gameplay:clubMatches.played')}</small><strong>{data.played.length}</strong></span>
          </div>
        )}
      </header>

      {loading && (
        <div className="match-diary__loading">
          <Skeleton height={120} />
          <Skeleton height={120} />
        </div>
      )}

      {!loading && error && (
        <EmptyState
          title={t('gameplay:clubMatches.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => void load()}>{t('gameplay:clubMatches.retry')}</Button>}
        />
      )}

      {!loading && !error && data && (
        <>
          {data.upcoming.length > 0 && (
            <section className="match-diary__section">
              <header><Clock3 size={18} /><h2>{t('gameplay:clubMatches.upcoming')}</h2><span>{data.upcoming.length}</span></header>
              <div className="match-diary__grid">
                {data.upcoming.map((m: any, index: number) => (
                  <MatchCard key={m.id} match={m} myClubId={club?.id} featured={index === 0} onOpen={() => navigate(`/matches/${m.id}`)} />
                ))}
              </div>
            </section>
          )}

          {data.played.length > 0 && (
            <section className="match-diary__section">
              <header>
                <CheckCircle2 size={18} />
                <h2>{t('gameplay:clubMatches.played')}</h2>
                <span>{data.played.length}</span>
                {data.played.length > 9 && (
                  <button type="button" onClick={() => setShowAllPlayed((current) => !current)}>
                    {showAllPlayed ? t('gameplay:clubMatches.showRecent') : t('gameplay:clubMatches.showAll')}
                  </button>
                )}
              </header>
              <div className="match-diary__grid">
                {[...data.played].reverse().slice(0, showAllPlayed ? undefined : 9).map((m: any) => (
                  <MatchCard key={m.id} match={m} myClubId={club?.id} onOpen={() => navigate(`/matches/${m.id}`)} />
                ))}
              </div>
            </section>
          )}

          {data.played.length === 0 && data.upcoming.length === 0 && (
            <EmptyState title={t('gameplay:clubMatches.empty')} />
          )}
        </>
      )}
    </div>
  );
}

function MatchCard({ match: m, myClubId, featured = false, onOpen }: { match: any, myClubId?: number, featured?: boolean, onOpen: () => void }) {
  const { t } = useTranslation();
  const isHome = m.homeClubId === myClubId;
  const isHidden = m.resultHidden;
  const isPlayed = m.status === 'played' && !isHidden;
  
  let resultTone = 'var(--brutal-border)'; // Default border
  
  if (!isHidden && m.status === 'played') {
    const myGoals = isHome ? m.homeGoals : m.awayGoals;
    const oppGoals = isHome ? m.awayGoals : m.homeGoals;
    if (myGoals > oppGoals) { resultTone = 'var(--green-primary)'; }
    else if (myGoals < oppGoals) { resultTone = 'var(--red-danger)'; }
    else { resultTone = 'var(--gold-accent)'; }
  }

  return (
    <button
      type="button"
      className={`match-card${featured ? ' is-featured' : ''}`}
      onClick={onOpen}
      style={{ ['--result-tone' as string]: resultTone }}
    >
      <div className="match-card__meta">
        <span>{m.playedAt ? new Date(m.playedAt).toLocaleDateString() : '—'}</span>
        <strong>{m.competition?.shortName ?? t('gameplay:clubMatches.friendly')}</strong>
        <em>#{m.matchdayNum ?? m.week ?? '—'}</em>
      </div>
      <div className="match-card__teams">
        <div className={m.homeClubId === myClubId ? 'is-me' : ''}>
          <ClubBadge id={m.homeClubId} name={m.homeClub?.name} badge={m.homeClub?.badge} size={48} />
          <strong>{m.homeClub?.shortName ?? m.homeClub?.name ?? '—'}</strong>
          {isPlayed && <b>{m.homeGoals ?? 0}</b>}
        </div>
        <span className="match-card__versus">
          {isHidden ? <><Video size={16} />{t('gameplay:clubMatches.watchMatch')}</> : isPlayed ? t('gameplay:clubMatches.final') : t('gameplay:clubMatches.vs')}
        </span>
        <div className={m.awayClubId === myClubId ? 'is-me' : ''}>
          <ClubBadge id={m.awayClubId} name={m.awayClub?.name} badge={m.awayClub?.badge} size={48} />
          <strong>{m.awayClub?.shortName ?? m.awayClub?.name ?? '—'}</strong>
          {isPlayed && <b>{m.awayGoals ?? 0}</b>}
        </div>
      </div>
      <div className="match-card__action">
        <span><Eye size={14} />{isPlayed ? t('gameplay:clubMatches.replay') : t('gameplay:clubMatches.watchMatch')}</span>
        <ArrowRight size={15} />
      </div>
    </button>
  );
}

const MATCH_DIARY_CSS = `
.match-diary{display:flex;flex-direction:column;gap:24px}
.match-diary__hero{position:relative;overflow:hidden;padding:24px;display:flex;align-items:center;gap:18px;border:1px solid color-mix(in srgb,var(--gold-accent) 25%,var(--border-color));border-radius:20px;background:var(--bg-elevated);box-shadow:0 10px 30px rgba(0,0,0,0.3)}
.match-diary__hero::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 100% 0,color-mix(in srgb,var(--gold-accent) 15%,transparent),transparent 55%);pointer-events:none}
.match-diary__hero::after{content:'';position:absolute;inset:0;background:linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px);background-size:100% 4px;pointer-events:none;opacity:0.3}
.match-diary__hero>span{width:64px;height:64px;display:grid;place-items:center;flex:0 0 auto;border-radius:18px;color:var(--bg-base);background:linear-gradient(135deg,var(--gold-accent),#fff);box-shadow:0 0 20px color-mix(in srgb,var(--gold-accent) 40%,transparent)}
.match-diary__hero>div:nth-child(2){min-width:0;z-index:1}
.match-diary__hero small{color:var(--gold-accent);font-size:.65rem;font-weight:900;letter-spacing:.15em;text-transform:uppercase;text-shadow:0 0 10px rgba(255,215,0,0.5)}
.match-diary__hero h1{margin:4px 0;color:var(--text-primary);font-family:var(--font-display);font-size:clamp(1.8rem,3.5vw,2.5rem);font-weight:950;letter-spacing:-.02em;text-transform:uppercase;text-shadow:0 4px 10px color-mix(in srgb, var(--bg-base) 50%, transparent)}
.match-diary__hero p{margin:0;color:var(--text-muted);font-size:.75rem;max-width:400px}
.match-diary__summary{margin-left:auto;display:flex;gap:10px;z-index:1}
.match-diary__summary>span{min-width:100px;padding:12px;display:flex;flex-direction:column;border:1px solid color-mix(in srgb,var(--gold-accent) 20%,transparent);border-radius:12px;background:color-mix(in srgb, var(--bg-base) 50%, transparent);backdrop-filter:blur(10px)}
.match-diary__summary strong{font-family:var(--font-mono-retro);font-size:1.3rem;color:var(--text-primary)}
.match-diary__loading{display:grid;gap:16px}
.match-diary__section{display:flex;flex-direction:column;gap:16px}
.match-diary__section>header{padding-bottom:12px;display:flex;align-items:center;gap:10px;border-bottom:2px solid color-mix(in srgb,var(--border-color) 40%,transparent);color:var(--text-primary)}
.match-diary__section>header svg{color:var(--gold-accent);filter:drop-shadow(0 0 8px var(--gold-accent))}
.match-diary__section h2{font-family:var(--font-display);font-size:1.1rem;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--text-primary)}
.match-diary__section>header span{margin-left:auto;padding:3px 10px;border-radius:12px;color:var(--text-primary);background:color-mix(in srgb,var(--gold-accent) 20%,transparent);border:1px solid color-mix(in srgb,var(--gold-accent) 40%,transparent);font-family:var(--font-mono-retro);font-size:.7rem;box-shadow:0 0 10px color-mix(in srgb, var(--gold-accent) 20%, transparent)}
.match-diary__section>header button{padding:6px 12px;border:1px solid color-mix(in srgb,var(--gold-accent) 40%,transparent);border-radius:8px;color:var(--gold-accent);background:transparent;cursor:pointer;font-size:.65rem;font-weight:900;text-transform:uppercase;transition:all 0.2s}
.match-diary__section>header button:hover{background:var(--gold-accent);color:var(--bg-base);box-shadow:0 0 15px rgba(255,215,0,0.4)}
.match-diary__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.match-card{--result-tone:var(--border-color);position:relative;overflow:hidden;min-width:0;padding:0;display:flex;flex-direction:column;border:1px solid color-mix(in srgb,var(--result-tone) 40%,transparent);border-radius:16px;color:var(--text-primary);background:var(--bg-surface);cursor:pointer;text-align:left;box-shadow:0 4px 15px rgba(0,0,0,0.2);transition:all .3s cubic-bezier(0.175,0.885,0.32,1.275);backdrop-filter:blur(20px)}
.match-card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:var(--result-tone);box-shadow:0 0 10px var(--result-tone)}
.match-card:hover{transform:translateY(-4px) scale(1.01);border-color:var(--result-tone);box-shadow:0 12px 25px rgba(0,0,0,0.4),0 0 20px color-mix(in srgb,var(--result-tone) 20%,transparent)}
.match-card.is-featured{grid-column:1 / -1;display:grid;grid-template-columns:1fr 2fr;align-items:stretch}
.match-card__meta{padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid color-mix(in srgb,var(--border-color) 30%,transparent);background:color-mix(in srgb,var(--bg-elevated) 50%,transparent)}
.match-card__meta span,.match-card__meta em{color:var(--text-muted);font-size:.65rem;font-style:normal;font-family:var(--font-mono-retro)}
.match-card__meta strong{overflow:hidden;color:var(--gold-accent);font-size:.65rem;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;letter-spacing:1px}
.match-card__meta em{margin-left:auto}
.match-card__teams{padding:20px 16px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:radial-gradient(circle at center,color-mix(in srgb,var(--result-tone) 5%,transparent),transparent)}
.match-card__teams>div{min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center}
.match-card__teams strong{overflow:hidden;font-family:var(--font-display);font-size:.85rem;text-overflow:ellipsis;white-space:nowrap;text-transform:uppercase;color:var(--text-primary)}
.match-card__teams .is-me strong{color:var(--gold-accent);text-shadow:0 0 10px color-mix(in srgb, var(--gold-accent) 30%, transparent)}
.match-card__teams b{font-family:var(--font-mono-retro);font-size:2rem;color:var(--result-tone);text-shadow:0 0 15px color-mix(in srgb,var(--result-tone) 50%,transparent);line-height:1}
.match-card__versus{padding:6px 12px;display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid color-mix(in srgb,var(--result-tone) 30%,transparent);border-radius:12px;color:var(--result-tone);background:color-mix(in srgb,var(--result-tone) 10%,color-mix(in srgb, var(--bg-base) 50%, transparent));font-family:var(--font-mono-retro);font-size:.65rem;white-space:nowrap;box-shadow:inset 0 0 10px color-mix(in srgb,var(--result-tone) 20%,transparent)}
.match-card__action{padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid color-mix(in srgb,var(--border-color) 30%,transparent);color:var(--text-muted);background:color-mix(in srgb,var(--bg-elevated) 50%,transparent);font-size:.65rem;font-weight:900;text-transform:uppercase;letter-spacing:1px;transition:color 0.2s}
.match-card:hover .match-card__action{color:var(--text-primary)}
.match-card__action span{display:flex;align-items:center;gap:8px}
.match-card__action>svg{color:var(--result-tone);transition:transform 0.3s cubic-bezier(0.175,0.885,0.32,1.275)}
.match-card:hover .match-card__action>svg{transform:translateX(5px)}
@media(max-width:1050px){.match-diary__grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}.match-card.is-featured{grid-template-columns:1fr;grid-column:auto}}
@media(max-width:700px){.match-diary__hero{flex-direction:column;align-items:flex-start}.match-diary__summary{width:100%;margin-left:0}.match-diary__summary>span{flex:1}}
`;
