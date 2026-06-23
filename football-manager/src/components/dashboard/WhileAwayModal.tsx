import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button } from '../ui';
import { gameApi } from '../../api/client';
import { useSession } from '../../stores/sessionStore';
import { Clock, TrendingUp, TrendingDown, ShoppingBag, HeartPulse, Trophy, Newspaper, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { eur } from '../../lib/format';

interface WhileAwayModalProps {
  onClose: () => void;
}

export function WhileAwayModal({ onClose }: WhileAwayModalProps) {
  const { t } = useTranslation();
  const { previousLoginAt } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    gameApi.getWhileAway(previousLoginAt)
      .then((res: any) => {
        if (!cancelled) {
          setData(res);
          const s = res?.sections;
          if (s) {
            const hasMatches = s.myMatches?.length > 0;
            const hasRival = s.rivalWatch?.length > 0;
            const hasOffers = s.offers?.received?.length > 0 || s.offers?.resolved?.length > 0;
            const hasStandings = s.standings && s.standings.delta !== 0;
            const hasAcademy = s.academy?.length > 0;
            const hasHealth = s.health?.injuries?.length > 0 || s.health?.suspensions?.length > 0;
            const hasNews = s.news?.length > 0;
            
            const tot = [hasMatches, hasRival, hasOffers, hasStandings, hasAcademy, hasHealth, hasNews].filter(Boolean).length;
            if (tot === 0) onClose();
          } else {
            onClose();
          }
        }
      })
      .catch(() => {
        if (!cancelled) onClose();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [previousLoginAt, onClose]);

  if (loading) {
    return (
      <Modal open={true} onClose={onClose} title={`${t('gameplay:whileAway.title')}...`}>
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <Clock className="animate-spin text-[var(--gold-accent)]" size={32} />
          <p className="text-[var(--text-muted)] uppercase tracking-widest text-sm">{t('gameplay:whileAway.loading')}</p>
        </div>
      </Modal>
    );
  }

  if (!data || !data.sections) {
    return null;
  }

  const s = data.sections;
  
  const hasMatches = s.myMatches?.length > 0;
  const hasRival = s.rivalWatch?.length > 0;
  const hasOffers = s.offers?.received?.length > 0 || s.offers?.resolved?.length > 0;
  const hasStandings = s.standings && s.standings.delta !== 0;
  const hasAcademy = s.academy?.length > 0;
  const hasHealth = s.health?.injuries?.length > 0 || s.health?.suspensions?.length > 0;
  const deltaAbs = Math.abs(s.standings?.delta ?? 0);

  return (
    <Modal open={true} onClose={onClose} title={t('gameplay:whileAway.title')}>
      <div className="p-4 space-y-6">
        <div className="text-sm text-[var(--text-muted)] text-center mb-4 pb-4 border-b border-[var(--border-color)]">
          {t('gameplay:whileAway.summary', { since: new Date(data.since).toLocaleString() })}
        </div>

        {hasMatches && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-[var(--text-primary)] font-display font-bold uppercase text-sm">
              <Trophy size={16} className="text-[var(--gold-accent)]" /> 
              {t('gameplay:whileAway.yourMatches')}
            </h4>
            <div className="grid gap-2">
              {s.myMatches.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between bg-[var(--bg-elevated)] p-3 rounded-md border border-[var(--border-color)]">
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wide w-20">{m.competitionKind}</div>
                  <div className="flex items-center gap-4 flex-1 justify-center">
                    <span className={`font-bold ${m.home ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                      {m.home ? t('gameplay:whileAway.you') : m.rival?.shortName}
                    </span>
                    <span className="font-mono bg-[var(--bg-surface)] px-3 py-1 rounded text-sm text-[var(--gold-accent)]">
                      {m.resultHidden ? '? - ?' : `${m.homeGoals} - ${m.awayGoals}`}
                    </span>
                    <span className={`font-bold ${!m.home ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                      {!m.home ? t('gameplay:whileAway.you') : m.rival?.shortName}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/matches/${m.id}`)}>
                    {t('gameplay:whileAway.go')} <ChevronRight size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasStandings && (
          <div className="bg-[var(--bg-elevated)] p-4 rounded-md border border-[var(--border-color)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              {s.standings.delta > 0 ? (
                <TrendingUp size={24} className="text-[var(--green-primary)]" />
              ) : (
                <TrendingDown size={24} className="text-[var(--red-danger)]" />
              )}
              <div>
                <div className="text-sm font-bold uppercase tracking-wide">{t('gameplay:whileAway.standings', { league: s.standings.league })}</div>
                <div className="text-xs text-[var(--text-muted)]">
                  {s.standings.delta > 0
                    ? t('gameplay:whileAway.movedUp', { count: deltaAbs })
                    : t('gameplay:whileAway.movedDown', { count: deltaAbs })}
                </div>
              </div>
            </div>
            <div className="font-mono text-xl">
              <span className="text-[var(--text-muted)] line-through mr-2">#{s.standings.previousPosition}</span>
              <span className="text-[var(--text-primary)] font-bold">#{s.standings.position}</span>
            </div>
          </div>
        )}

        {hasOffers && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-[var(--text-primary)] font-display font-bold uppercase text-sm">
              <ShoppingBag size={16} className="text-[var(--blue-info)]" /> 
              {t('gameplay:whileAway.market')}
            </h4>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
              {s.offers.received?.map((o: any) => (
                <div key={`rec-${o.id}`} className="bg-[var(--bg-elevated)] p-3 rounded-md border-l-2 border-l-[var(--gold-accent)] border-[var(--border-color)]">
                  <div className="text-xs text-[var(--gold-accent)] font-bold mb-1">{t('gameplay:whileAway.newOffer')}</div>
                  <div className="text-sm">{t('gameplay:whileAway.offerFor', { player: o.player })}</div>
                  <div className="text-xs text-[var(--text-muted)] mt-1">{t('gameplay:whileAway.offerFrom', { club: o.fromClub, amount: eur(o.amount) })}</div>
                </div>
              ))}
              {s.offers.resolved?.map((o: any) => (
                <div key={`res-${o.id}`} className={`bg-[var(--bg-elevated)] p-3 rounded-md border-l-2 border-[var(--border-color)] ${o.status === 'accepted' ? 'border-l-[var(--green-primary)]' : 'border-l-[var(--red-danger)]'}`}>
                  <div className={`text-xs font-bold mb-1 ${o.status === 'accepted' ? 'text-[var(--green-primary)]' : 'text-[var(--red-danger)]'}`}>
                    {o.status === 'accepted' ? t('gameplay:whileAway.offerAccepted') : t('gameplay:whileAway.offerRejected')}
                  </div>
                  <div className="text-sm"><b>{o.player}</b></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {(hasHealth || hasAcademy) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasHealth && (
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-[var(--text-primary)] font-display font-bold uppercase text-sm">
                  <HeartPulse size={16} className="text-[var(--red-danger)]" /> 
                  {t('gameplay:whileAway.health')}
                </h4>
                <div className="space-y-2">
                  {s.health.injuries?.map((inj: any, i: number) => (
                    <div key={`inj-${i}`} className="text-sm bg-[var(--bg-elevated)] p-2 rounded">
                      🤕 <b>{inj.player}</b> <span className="text-[var(--text-muted)] text-xs">{t('gameplay:whileAway.until', { date: new Date(inj.until).toLocaleDateString() })}</span>
                    </div>
                  ))}
                  {s.health.suspensions?.map((sus: any, i: number) => (
                    <div key={`sus-${i}`} className="text-sm bg-[var(--bg-elevated)] p-2 rounded">
                      🟥 <b>{sus.player}</b> <span className="text-[var(--text-muted)] text-xs">{t('gameplay:whileAway.suspensionMatches', { count: sus.matches })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {hasAcademy && (
              <div className="space-y-3">
                <h4 className="flex items-center gap-2 text-[var(--text-primary)] font-display font-bold uppercase text-sm">
                  <TrendingUp size={16} className="text-[var(--green-primary)]" /> 
                  {t('gameplay:whileAway.academy')}
                </h4>
                <div className="space-y-2">
                  {s.academy.map((ac: any, i: number) => (
                    <div key={`ac-${i}`} className="text-sm bg-[var(--bg-elevated)] p-2 rounded">
                      ⭐ <b>{ac.name}</b> ({ac.age}) <span className="text-[var(--text-muted)] text-xs">{ac.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {hasRival && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-[var(--text-primary)] font-display font-bold uppercase text-sm">
              <Newspaper size={16} className="text-[var(--text-muted)]" /> 
              {t('gameplay:whileAway.rival')}
            </h4>
            <div className="bg-[var(--bg-elevated)] p-3 rounded-md border border-[var(--border-color)]">
              {s.rivalWatch.map((r: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <span>{t('gameplay:whileAway.rivalPlayed', { name: r.rival.shortName })}</span>
                  <span className={`font-mono font-bold ${r.result === 'won' ? 'text-[var(--green-primary)]' : r.result === 'lost' ? 'text-[var(--red-danger)]' : 'text-[var(--gold-accent)]'}`}>
                    {r.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <Button variant="primary" onClick={onClose}>{t('gameplay:whileAway.continue')}</Button>
        </div>
      </div>
    </Modal>
  );
}
