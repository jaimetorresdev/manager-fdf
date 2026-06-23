import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Newspaper, Trophy, Star, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { Modal, Button } from '../ui';
import { dashboardApi } from '../../api/client';
import { useSession } from '../../stores/sessionStore';

const STORAGE_PREFIX = 'fdf_postTurn_turn_';

interface PostTurnPackageProps {
  onClose: () => void;
  /** Si se define, el CTA final vuelve a la portada en hub en vez de navegar */
  onGoToCover?: () => void;
}

function hasTurnContent(whileAway: any, cover: any): boolean {
  const matches = whileAway?.sections?.myMatches ?? [];
  if (matches.length > 0) return true;
  if (cover?.featuredResult) return true;
  if (cover?.headline && cover?.turn != null) return true;
  return false;
}

export function PostTurnPackage({ onClose, onGoToCover }: PostTurnPackageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { previousLoginAt } = useSession();
  const [step, setStep] = useState(0);
  const [cover, setCover] = useState<any>(null);
  const [whileAway, setWhileAway] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dashboardApi.dailyCover(),
      dashboardApi.whileAway(previousLoginAt),
    ])
      .then(([c, w]) => {
        if (cancelled) return;
        setCover(c);
        setWhileAway(w);
        if (!hasTurnContent(w, c)) onClose();
      })
      .catch(() => { if (!cancelled) onClose(); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [previousLoginAt, onClose]);

  if (loading) {
    return (
      <Modal open onClose={onClose} title={t('gameplay:postTurn.title')} variant="fullscreen">
        <div className="flex flex-col items-center justify-center p-12 gap-4">
          <Sparkles className="animate-pulse text-[var(--gold-accent)]" size={36} />
          <p className="text-sm uppercase tracking-widest text-[var(--text-muted)]">{t('gameplay:postTurn.loading')}</p>
        </div>
      </Modal>
    );
  }

  if (!cover || !hasTurnContent(whileAway, cover)) return null;

  const myMatch = whileAway?.sections?.myMatches?.[0];
  const featured = cover.featuredResult;
  const matchStep = featured ?? (myMatch ? {
    homeClub: myMatch.home ? { shortName: t('gameplay:postTurn.you') } : myMatch.rival,
    awayClub: myMatch.home ? myMatch.rival : { shortName: t('gameplay:postTurn.you') },
    homeGoals: myMatch.homeGoals,
    awayGoals: myMatch.awayGoals,
    resultHidden: myMatch.resultHidden,
    route: `/matches/${myMatch.id}`,
    competition: { name: myMatch.competitionKind },
  } : null);

  const steps = [
    {
      key: 'headline',
      title: t('gameplay:postTurn.title'),
      body: cover.headline ?? t('gameplay:postTurn.headlineDefault'),
      kicker: t('gameplay:postTurn.turn', { turn: cover.turn ?? '—' }),
    },
    {
      key: 'match',
      title: t('gameplay:postTurn.matchTitle'),
      body: matchStep
        ? matchStep.resultHidden
          ? t('gameplay:postTurn.matchSealed')
          : t('gameplay:postTurn.matchScore', {
            home: matchStep.homeClub?.shortName ?? t('gameplay:postTurn.home'),
            away: matchStep.awayClub?.shortName ?? t('gameplay:postTurn.away'),
            homeGoals: matchStep.homeGoals,
            awayGoals: matchStep.awayGoals,
          })
        : t('gameplay:postTurn.noFeatured'),
      kicker: matchStep?.competition?.name ?? 'Liga FDF',
      route: matchStep?.route,
    },
    {
      key: 'goal',
      title: t('gameplay:postTurn.goalTitle'),
      body: t('gameplay:postTurn.goalBody'),
      kicker: t('gameplay:postTurn.goalKicker'),
      route: '/news',
    },
    {
      key: 'cover',
      title: t('gameplay:postTurn.coverTitle'),
      body: cover.hero
        ? t('gameplay:postTurn.coverHero', { name: cover.hero.name, rating: cover.hero.rating?.toFixed?.(1) ?? cover.hero.rating })
        : t('gameplay:postTurn.coverDefault'),
      kicker: t('gameplay:postTurn.coverKicker'),
    },
  ];

  const current = steps[step];
  const isLast = step >= steps.length - 1;

  const finish = () => {
    if (cover.turn != null) {
      try { sessionStorage.setItem(`${STORAGE_PREFIX}${cover.turn}`, '1'); } catch { /* noop */ }
    }
    onClose();
    if (onGoToCover) onGoToCover();
    else navigate('/');
  };

  return (
    <Modal open onClose={finish} title={t('gameplay:postTurn.title')} variant="fullscreen">
      <div className="relative min-h-[50vh] flex flex-col items-center justify-center text-center p-6 gap-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.12)_0%,transparent_55%)]" />
        <div className="absolute inset-0 pointer-events-none opacity-20"
          style={{ background: 'repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px)' }} />

        <div className="relative z-10 flex flex-col items-center gap-4 max-w-lg">
          <span className="text-[10px] uppercase tracking-[0.25em] font-bold text-[var(--gold-accent)]">{current.kicker}</span>
          {step === 0 && <Newspaper size={48} className="text-[var(--gold-accent)]" />}
          {step === 1 && <Trophy size={48} className="text-[var(--green-primary)]" />}
          {step === 2 && <Star size={48} className="text-[var(--blue-info)]" />}
          {step === 3 && <Sparkles size={48} className="text-[var(--gold-accent)]" />}
          <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white">{current.title}</h2>
          <p className="text-lg text-[var(--text-muted)] leading-relaxed">{current.body}</p>
          {current.route && step === 1 && (
            <Button variant="ghost" size="sm" onClick={() => navigate(current.route!)}>
              {t('gameplay:postTurn.viewMatch')} <ChevronRight size={14} />
            </Button>
          )}
        </div>

        <div className="relative z-10 flex items-center gap-2 mt-4">
          {steps.map((s, i) => (
            <span key={s.key} className="w-2 h-2 rounded-full transition-all"
              style={{ background: i === step ? 'var(--gold-accent)' : 'var(--border-color)', opacity: i <= step ? 1 : 0.4 }} />
          ))}
        </div>

        <div className="relative z-10 flex gap-3 mt-6">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft size={14} /> {t('gameplay:postTurn.prev')}
            </Button>
          )}
          {!isLast ? (
            <Button variant="primary" onClick={() => setStep(s => s + 1)}>
              {t('gameplay:postTurn.next')} <ChevronRight size={14} />
            </Button>
          ) : (
            <Button variant="primary" onClick={finish}>
              {t('gameplay:postTurn.openCover')} <ChevronRight size={14} />
            </Button>
          )}
          {step === 2 && (
            <Button variant="ghost" onClick={() => navigate('/news')}>
              {t('gameplay:postTurn.goToGoal')}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Muestra el paquete post-turno una vez por turno si hay novedades. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePostTurnPackage(): { show: boolean; dismiss: () => void; turn: number | null } {
  const [show, setShow] = useState(false);
  const [turn, setTurn] = useState<number | null>(null);
  const { previousLoginAt } = useSession();

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dashboardApi.dailyCover(),
      dashboardApi.whileAway(previousLoginAt),
    ])
      .then(([cover, away]) => {
        if (cancelled) return;
        const t = cover?.turn ?? null;
        setTurn(t);
        if (t == null || !hasTurnContent(away, cover)) return;
        const seen = sessionStorage.getItem(`${STORAGE_PREFIX}${t}`) === '1';
        if (!seen) setShow(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [previousLoginAt]);

  return { show, dismiss: () => setShow(false), turn };
}
