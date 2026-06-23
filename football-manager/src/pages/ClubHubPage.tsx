import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Flag,
  GraduationCap,
  HeartPulse,
  Landmark,
  Newspaper,
  ShieldCheck,
  Shirt,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { PostTurnPackage, usePostTurnPackage } from '../components/dashboard/PostTurnPackage';
import { WhileAwayModal } from '../components/dashboard/WhileAwayModal';
import { ClubBadge, Skeleton } from '../components/ui';
import { clubApi, dashboardApi, gameApi } from '../api/client';
import { eur, fmtGameDate, fmtTime } from '../lib/format';
import { cn } from '../lib/cn';
import { useSession } from '../stores/sessionStore';
import { useGameStore } from '../stores/gameStore';

type ChecklistItem = {
  key: string;
  urgent?: boolean;
  title: string;
  detail?: string;
  cta?: { label?: string; route?: string };
};

type HealthArea = {
  key: string;
  label: string;
  score: number;
  status: 'good' | 'ok' | 'watch' | 'risk';
  note?: string;
};

type SquadPlayer = {
  id: number;
  name: string;
  position?: string;
  fitness?: number;
  morale?: number;
  isStarter?: boolean;
  injuredUntil?: string | null;
  suspendedMatches?: number;
};

type QuickLink = {
  label: string;
  route: string;
  icon: LucideIcon;
};

const HEALTH_ROUTES: Record<string, string> = {
  sporting: '/matches',
  economy: '/economy',
  squad: '/squad',
  academy: '/residences',
  fans: '/fans',
  board: '/career',
};

const HEALTH_ICONS: Record<string, LucideIcon> = {
  sporting: Trophy,
  economy: Banknote,
  squad: Shirt,
  academy: GraduationCap,
  fans: Flag,
  board: Landmark,
};

const POSITION_ORDER: Record<string, number> = { POR: 0, DEF: 1, MED: 2, DEL: 3 };

function average(values: number[]) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function objectiveLabel(objective: any, t: (key: string, options?: any) => string) {
  if (!objective) return t('gameplay:clubCommand.board.noObjective');
  if (objective.type === 'liga' && objective.targetPosition) {
    return t('gameplay:clubCommand.board.leagueObjective', { position: objective.targetPosition });
  }
  if (objective.type === 'copa') return t('gameplay:clubCommand.board.cupObjective');
  if (objective.type === 'economia' && objective.targetAmount) {
    return t('gameplay:clubCommand.board.economyObjective', { amount: eur(objective.targetAmount) });
  }
  return t('gameplay:clubCommand.board.defaultObjective');
}

function statusTone(status: HealthArea['status']) {
  if (status === 'good' || status === 'ok') return 'good';
  if (status === 'watch') return 'watch';
  return 'risk';
}

function FormStrip({ form }: { form: any[] }) {
  if (!form.length) return null;
  return (
    <div className="club-command-form" aria-label="Últimos resultados">
      {form.slice(-5).map((item, index) => {
        const result = item?.result ?? '?';
        const tone = result === 'V' || result === 'W' ? 'win' : result === 'E' || result === 'D' ? 'draw' : result === '?' ? 'hidden' : 'loss';
        return (
          <span
            key={`${item?.rival ?? 'match'}-${index}`}
            className={`club-command-form__item club-command-form__item--${tone}`}
            title={item?.resultHidden ? 'Resultado pendiente de ver' : `${item?.rival ?? ''} ${item?.score ?? ''}`.trim()}
          >
            {result}
          </span>
        );
      })}
    </div>
  );
}

function CommandPanel({
  title,
  eyebrow,
  icon,
  action,
  className,
  children,
}: {
  title: string;
  eyebrow?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('club-command-panel', className)}>
      <header className="club-command-panel__header">
        <div>
          {eyebrow && <span className="club-command-panel__eyebrow">{eyebrow}</span>}
          <h2>{icon}{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/** Portada privada del club: una sola jerarquía de mando, sin vistas duplicadas. */
export function ClubHubPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { club, user } = useSession();
  const gameState = useGameStore((state) => state.gameState);
  const postTurn = usePostTurnPackage();

  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<any>(null);
  const [clubInfo, setClubInfo] = useState<any>(null);
  const [healthMap, setHealthMap] = useState<{ areas?: HealthArea[] } | null>(null);
  const [checklist, setChecklist] = useState<{ nextTickAt?: string; items?: ChecklistItem[] } | null>(null);
  const [dailyCover, setDailyCover] = useState<any>(null);
  const [showWhileAway, setShowWhileAway] = useState(() => !sessionStorage.getItem('fdf_whileAwayShown'));

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.allSettled([
      gameApi.dashboard(),
      clubApi.get(),
      clubApi.healthMap(),
      dashboardApi.turnChecklist(),
      dashboardApi.dailyCover(),
    ]).then(([dashResult, clubResult, healthResult, checklistResult, coverResult]) => {
      if (cancelled) return;
      if (dashResult.status === 'fulfilled') setDash(dashResult.value);
      if (clubResult.status === 'fulfilled') setClubInfo(clubResult.value);
      if (healthResult.status === 'fulfilled') setHealthMap(healthResult.value);
      if (checklistResult.status === 'fulfilled') setChecklist(checklistResult.value);
      if (coverResult.status === 'fulfilled') setDailyCover(coverResult.value);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [club?.id]);

  const identity = clubInfo ?? club;
  const squad = useMemo<SquadPlayer[]>(
    () => Array.isArray(clubInfo?.players) ? clubInfo.players : [],
    [clubInfo],
  );
  const currentInGameDate = gameState?.inGameDate ? new Date(gameState.inGameDate) : new Date();
  const unavailable = squad.filter((player) => {
    const injuryDate = player.injuredUntil ? new Date(player.injuredUntil) : null;
    return Boolean((injuryDate && injuryDate > currentInGameDate) || numberFrom(player.suspendedMatches) > 0);
  }).length;
  const starterCount = squad.filter((player) => player.isStarter).length;
  const averageFitness = average(squad.map((player) => numberFrom(player.fitness, 100)));
  const averageMorale = dash?.kpis?.avgMorale ?? average(squad.map((player) => numberFrom(player.morale, 75)));
  const topReadyPlayers = useMemo(
    () => [...squad]
      .filter((player) => numberFrom(player.fitness, 100) >= 70)
      .sort((a, b) => {
        const positionDelta = (POSITION_ORDER[a.position ?? ''] ?? 9) - (POSITION_ORDER[b.position ?? ''] ?? 9);
        if (positionDelta !== 0) return positionDelta;
        return numberFrom(b.fitness) - numberFrom(a.fitness);
      })
      .slice(0, 4),
    [squad],
  );

  const tasks = checklist?.items ?? [];
  const urgentCount = tasks.filter((item) => item.urgent).length;
  const nextMatch = dash?.nextMatch;
  const isHome = nextMatch?.homeClubId === identity?.id;
  const opponent = nextMatch ? (isHome ? nextMatch.awayClub : nextMatch.homeClub) : null;
  const nextMatchId = nextMatch?.id ?? nextMatch?.matchId;
  const nextMatchDate = nextMatch?.playedAt ?? nextMatch?.matchday?.dateTurn ?? nextMatch?.matchday?.date;
  const pendingObjective = dash?.board?.objectives?.find((objective: any) =>
    String(objective.status ?? '').toLowerCase().includes('pend'),
  ) ?? dash?.board?.objectives?.[0];
  const boardConfidence = numberFrom(dash?.board?.confidence?.level, 50);
  const standings = Array.isArray(dash?.standings) ? dash.standings : [];
  const form = Array.isArray(dash?.form) ? dash.form : [];
  const healthAreas = Array.isArray(healthMap?.areas) ? healthMap.areas : [];
  const seasonWeek = gameState?.seasonWeek ?? dash?.seasonWeek;
  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'fr' ? 'fr-FR' : i18n.language === 'de' ? 'de-DE' : i18n.language === 'it' ? 'it-IT' : 'es-ES';

  const commandDomains: { title: string; eyebrow: string; links: QuickLink[] }[] = [
    {
      title: t('gameplay:clubCommand.departments.team'),
      eyebrow: t('gameplay:clubCommand.departments.teamHint'),
      links: [
        { label: t('gameplay:clubCommand.links.squad'), route: '/squad', icon: Shirt },
        { label: t('gameplay:clubCommand.links.tactics'), route: '/tactics', icon: Swords },
        { label: t('gameplay:clubCommand.links.training'), route: '/training', icon: Activity },
      ],
    },
    {
      title: t('gameplay:clubCommand.departments.competition'),
      eyebrow: t('gameplay:clubCommand.departments.competitionHint'),
      links: [
        { label: t('gameplay:clubCommand.links.matches'), route: '/matches', icon: Trophy },
        { label: t('gameplay:clubCommand.links.calendar'), route: '/calendar', icon: CalendarDays },
        { label: t('gameplay:clubCommand.links.league'), route: '/league', icon: BarChart3 },
      ],
    },
    {
      title: t('gameplay:clubCommand.departments.institution'),
      eyebrow: t('gameplay:clubCommand.departments.institutionHint'),
      links: [
        { label: t('gameplay:clubCommand.links.economy'), route: '/economy', icon: WalletCards },
        { label: t('gameplay:clubCommand.links.stadium'), route: '/stadium', icon: Building2 },
        { label: t('gameplay:clubCommand.links.staff'), route: '/staff', icon: ShieldCheck },
      ],
    },
    {
      title: t('gameplay:clubCommand.departments.future'),
      eyebrow: t('gameplay:clubCommand.departments.futureHint'),
      links: [
        { label: t('gameplay:clubCommand.links.academy'), route: '/residences', icon: GraduationCap },
        { label: t('gameplay:clubCommand.links.fans'), route: '/fans', icon: Flag },
        { label: t('gameplay:clubCommand.links.kits'), route: '/club/kits', icon: Sparkles },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="page-surface flex flex-col gap-4">
        <Skeleton height={180} />
        <div className="grid grid-cols-1 lg:grid-cols-[1.65fr_1fr] gap-4">
          <Skeleton height={280} />
          <Skeleton height={280} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} height={105} />)}
        </div>
        <Skeleton height={230} />
      </div>
    );
  }

  return (
    <div
      className="club-command page-surface"
      style={{
        ['--command-primary' as string]: identity?.primaryColor ?? 'var(--club-primary)',
        ['--command-secondary' as string]: identity?.secondaryColor ?? 'var(--club-secondary)',
      }}
    >
      {postTurn.show && (
        <PostTurnPackage onClose={postTurn.dismiss} onGoToCover={postTurn.dismiss} />
      )}
      {showWhileAway && !postTurn.show && (
        <WhileAwayModal
          onClose={() => {
            sessionStorage.setItem('fdf_whileAwayShown', '1');
            setShowWhileAway(false);
          }}
        />
      )}

      <section className="club-command-hero">
        <div className="club-command-hero__glow" />
        <div className="club-command-hero__watermark" aria-hidden>
          <ClubBadge id={identity?.id} name={identity?.name} size={300} />
        </div>
        <div className="club-command-hero__identity">
          <div className="club-command-hero__badge">
            <ClubBadge id={identity?.id} name={identity?.name} size={88} />
          </div>
          <div className="club-command-hero__copy">
            <span className="club-command-kicker">
              <span className="club-command-kicker__pulse" />
              {t('gameplay:clubCommand.kicker')}
              {seasonWeek != null && <> · {t('gameplay:clubCommand.matchday', { week: seasonWeek })}</>}
            </span>
            <h1>{identity?.name ?? t('gameplay:clubCommand.fallbackClub')}</h1>
            <p>
              {user?.manager?.name ?? user?.username}
              {gameState?.inGameDate && <> · {fmtGameDate(gameState.inGameDate, locale)}</>}
              {gameState?.season && <> · {gameState.season}</>}
            </p>
          </div>
        </div>

        <div className="club-command-hero__status">
          <div className={cn('club-command-operational', urgentCount > 0 && 'club-command-operational--alert')}>
            {urgentCount > 0 ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
            <div>
              <strong>
                {urgentCount > 0
                  ? t('gameplay:clubCommand.status.pending', { count: urgentCount })
                  : t('gameplay:clubCommand.status.ready')}
              </strong>
              <span>
                {checklist?.nextTickAt
                  ? t('gameplay:clubCommand.status.nextTurn', { time: fmtTime(checklist.nextTickAt) })
                  : t('gameplay:clubCommand.status.synced')}
              </span>
            </div>
          </div>
          <div className="club-command-hero__actions">
            <button type="button" onClick={() => navigate('/squad')}><Shirt size={15} />{t('gameplay:clubCommand.links.squad')}</button>
            <button type="button" onClick={() => navigate('/tactics')}><Swords size={15} />{t('gameplay:clubCommand.links.tactics')}</button>
            <button type="button" onClick={() => identity?.id && navigate(`/club/${identity.id}`)}><Building2 size={15} />{t('gameplay:clubCommand.links.profile')}</button>
          </div>
        </div>
      </section>

      <div className="club-command-primary-grid">
        <CommandPanel
          className="club-command-match"
          eyebrow={t('gameplay:clubCommand.nextMatch.eyebrow')}
          title={nextMatch?.matchday?.competition?.name ?? t('gameplay:clubCommand.nextMatch.title')}
          icon={<CalendarDays size={17} />}
          action={form.length > 0 ? <FormStrip form={form} /> : undefined}
        >
          {nextMatch ? (
            <>
              <div className="club-command-match__meta">
                <span>{isHome ? t('gameplay:clubCommand.nextMatch.home') : t('gameplay:clubCommand.nextMatch.away')}</span>
                {nextMatchDate && <span><Clock3 size={13} />{fmtGameDate(nextMatchDate, locale)}</span>}
              </div>
              <div className="club-command-match__versus">
                <div className="club-command-match__team club-command-match__team--mine">
                  <ClubBadge id={identity?.id} name={identity?.name} size={64} />
                  <strong>{identity?.shortName ?? identity?.name}</strong>
                  <span>{t('gameplay:clubCommand.nextMatch.yourClub')}</span>
                </div>
                <div className="club-command-match__vs">
                  <span>{t('gameplay:clubCommand.nextMatch.vs')}</span>
                  <i />
                </div>
                <div className="club-command-match__team">
                  <ClubBadge id={opponent?.id} name={opponent?.name} size={64} />
                  <strong>{opponent?.shortName ?? opponent?.name ?? '—'}</strong>
                  <span>{t('gameplay:clubCommand.nextMatch.opponent')}</span>
                </div>
              </div>
              <div className="club-command-match__actions">
                <button
                  type="button"
                  className="club-command-primary-action"
                  onClick={() => navigate(`/matches/${nextMatchId}`)}
                >
                  {t('gameplay:clubCommand.nextMatch.open')} <ChevronRight size={17} />
                </button>
                <button type="button" className="club-command-secondary-action" onClick={() => navigate('/tactics')}>
                  <Target size={16} /> {t('gameplay:clubCommand.nextMatch.prepare')}
                </button>
              </div>
            </>
          ) : (
            <div className="club-command-empty">
              <CalendarDays size={34} />
              <strong>{t('gameplay:clubCommand.nextMatch.emptyTitle')}</strong>
              <span>{t('gameplay:clubCommand.nextMatch.emptyHint')}</span>
              <button type="button" onClick={() => navigate('/calendar')}>
                {t('gameplay:clubCommand.nextMatch.openCalendar')} <ArrowRight size={15} />
              </button>
            </div>
          )}
        </CommandPanel>

        <CommandPanel
          className="club-command-priorities"
          eyebrow={t('gameplay:clubCommand.priorities.eyebrow')}
          title={t('gameplay:clubCommand.priorities.title')}
          icon={<CircleAlert size={17} />}
          action={tasks.length > 0 ? <span className="club-command-count">{tasks.length}</span> : undefined}
        >
          {tasks.length > 0 ? (
            <div className="club-command-priority-list">
              {tasks.slice(0, 4).map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  className={cn('club-command-priority', item.urgent && 'club-command-priority--urgent')}
                  onClick={() => item.cta?.route && navigate(item.cta.route)}
                  disabled={!item.cta?.route}
                >
                  <span className="club-command-priority__index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="club-command-priority__copy">
                    <strong>{item.title}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </span>
                  {item.cta?.route && <ChevronRight size={16} />}
                </button>
              ))}
              {tasks.length > 4 && (
                <span className="club-command-priority-list__more">
                  {t('gameplay:clubCommand.priorities.more', { count: tasks.length - 4 })}
                </span>
              )}
            </div>
          ) : (
            <div className="club-command-ready">
              <span><CheckCircle2 size={24} /></span>
              <div>
                <strong>{t('gameplay:clubCommand.priorities.clearTitle')}</strong>
                <p>{t('gameplay:clubCommand.priorities.clearHint')}</p>
              </div>
            </div>
          )}
        </CommandPanel>
      </div>

      <section className="club-command-kpis" aria-label={t('gameplay:clubCommand.kpis.label')}>
        {[
          {
            label: t('gameplay:clubCommand.kpis.position'),
            value: dash?.kpis?.rank ? `#${dash.kpis.rank}` : '—',
            hint: standings.find((row: any) => row.clubId === identity?.id)?.points != null
              ? t('gameplay:clubCommand.kpis.points', { count: standings.find((row: any) => row.clubId === identity?.id)?.points })
              : t('gameplay:clubCommand.kpis.league'),
            icon: Trophy,
            tone: 'green',
            route: '/league',
          },
          {
            label: t('gameplay:clubCommand.kpis.cash'),
            value: eur(dash?.kpis?.cash ?? identity?.cash ?? identity?.budget),
            hint: t('gameplay:clubCommand.kpis.available'),
            icon: Banknote,
            tone: numberFrom(dash?.kpis?.cash ?? identity?.cash ?? identity?.budget) < 0 ? 'red' : 'blue',
            route: '/economy',
          },
          {
            label: t('gameplay:clubCommand.kpis.morale'),
            value: averageMorale != null ? `${averageMorale}%` : '—',
            hint: averageMorale != null && averageMorale >= 70
              ? t('gameplay:clubCommand.kpis.dressingRoomStrong')
              : t('gameplay:clubCommand.kpis.dressingRoomWatch'),
            icon: HeartPulse,
            tone: averageMorale != null && averageMorale < 60 ? 'red' : 'gold',
            route: '/squad',
          },
          {
            label: t('gameplay:clubCommand.kpis.prestige'),
            value: dash?.kpis?.prestige != null ? `${Math.round(dash.kpis.prestige)}%` : '—',
            hint: t('gameplay:clubCommand.kpis.clubProjection'),
            icon: Sparkles,
            tone: 'violet',
            route: '/career',
          },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <button
              key={kpi.label}
              type="button"
              className={`club-command-kpi club-command-kpi--${kpi.tone}`}
              onClick={() => navigate(kpi.route)}
            >
              <span className="club-command-kpi__icon"><Icon size={18} /></span>
              <span className="club-command-kpi__copy">
                <small>{kpi.label}</small>
                <strong>{kpi.value}</strong>
                <em>{kpi.hint}</em>
              </span>
              <ChevronRight size={15} className="club-command-kpi__arrow" />
            </button>
          );
        })}
      </section>

      <CommandPanel
        className="club-command-health"
        eyebrow={t('gameplay:clubCommand.health.eyebrow')}
        title={t('gameplay:clubCommand.health.title')}
        icon={<Activity size={17} />}
        action={<span className="club-command-updated">{t('gameplay:clubCommand.health.serverSource')}</span>}
      >
        <div className="club-command-health-grid">
          {healthAreas.length > 0 ? healthAreas.map((area) => {
            const Icon = HEALTH_ICONS[area.key] ?? Activity;
            const tone = statusTone(area.status);
            return (
              <button
                key={area.key}
                type="button"
                className={`club-command-health-card club-command-health-card--${tone}`}
                onClick={() => navigate(HEALTH_ROUTES[area.key] ?? '/')}
              >
                <span className="club-command-health-card__top">
                  <span className="club-command-health-card__icon"><Icon size={17} /></span>
                  <strong>{t(`gameplay:clubCommand.health.areas.${area.key}`, area.label)}</strong>
                  <b>{Math.round(area.score)}</b>
                </span>
                <span className="club-command-health-card__bar">
                  <i style={{ width: `${Math.max(0, Math.min(100, area.score))}%` }} />
                </span>
                <small>{area.note}</small>
              </button>
            );
          }) : (
            <div className="club-command-health-grid__empty">
              {t('gameplay:clubCommand.health.empty')}
            </div>
          )}
        </div>
      </CommandPanel>

      <div className="club-command-secondary-grid">
        <CommandPanel
          eyebrow={t('gameplay:clubCommand.squad.eyebrow')}
          title={t('gameplay:clubCommand.squad.title')}
          icon={<Users size={17} />}
          action={
            <button type="button" className="club-command-text-action" onClick={() => navigate('/squad')}>
              {t('gameplay:clubCommand.common.open')} <ArrowRight size={14} />
            </button>
          }
        >
          <div className="club-command-squad-metrics">
            <div><strong>{squad.length || '—'}</strong><span>{t('gameplay:clubCommand.squad.players')}</span></div>
            <div><strong>{starterCount}/11</strong><span>{t('gameplay:clubCommand.squad.starters')}</span></div>
            <div><strong>{averageFitness != null ? `${averageFitness}%` : '—'}</strong><span>{t('gameplay:clubCommand.squad.fitness')}</span></div>
            <div className={cn(unavailable > 0 && 'is-alert')}><strong>{unavailable}</strong><span>{t('gameplay:clubCommand.squad.unavailable')}</span></div>
          </div>
          <div className="club-command-player-list">
            {topReadyPlayers.map((player) => (
              <button key={player.id} type="button" onClick={() => navigate(`/player/${player.id}`)}>
                <span className="club-command-player-list__position">{player.position ?? '—'}</span>
                <span className="club-command-player-list__name">{player.name}</span>
                <span className="club-command-player-list__fitness">{numberFrom(player.fitness, 100)}%</span>
                <ChevronRight size={14} />
              </button>
            ))}
            {topReadyPlayers.length === 0 && (
              <span className="club-command-inline-empty">{t('gameplay:clubCommand.squad.empty')}</span>
            )}
          </div>
        </CommandPanel>

        <CommandPanel
          eyebrow={t('gameplay:clubCommand.league.eyebrow')}
          title={t('gameplay:clubCommand.league.title')}
          icon={<BarChart3 size={17} />}
          action={
            <button type="button" className="club-command-text-action" onClick={() => navigate('/league')}>
              {t('gameplay:clubCommand.common.fullTable')} <ArrowRight size={14} />
            </button>
          }
        >
          <div className="club-command-table">
            {standings.length > 0 ? (
              standings.map((row: any) => {
                const isMe = row.clubId === identity?.id || row.club?.id === identity?.id;
                return (
                  <button key={row.clubId ?? row.club?.id ?? row.rank} type="button" className={cn(isMe && 'is-me')} onClick={() => navigate('/league')}>
                    <span className="club-command-table__rank">{row.rank}</span>
                    <ClubBadge id={row.clubId ?? row.club?.id} name={row.club?.name} size={24} />
                    <span className="club-command-table__club">{row.club?.shortName ?? row.club?.name ?? '—'}{isMe && <em>{t('gameplay:clubCommand.league.you')}</em>}</span>
                    <span className="club-command-table__played">{row.played ?? 0} {t('gameplay:clubCommand.league.played')}</span>
                    <strong>{row.points ?? 0}</strong>
                  </button>
                );
              })
            ) : (
              <span className="club-command-inline-empty">{t('gameplay:clubCommand.league.empty')}</span>
            )}
          </div>
        </CommandPanel>

        <CommandPanel
          eyebrow={t('gameplay:clubCommand.briefing.eyebrow')}
          title={t('gameplay:clubCommand.briefing.title')}
          icon={<Landmark size={17} />}
          action={
            dailyCover?.stories?.length > 0
              ? <button type="button" className="club-command-text-action" onClick={() => navigate('/news')}>{t('gameplay:clubCommand.common.news')} <ArrowRight size={14} /></button>
              : undefined
          }
        >
          <div className="club-command-board">
            <div className="club-command-board__confidence">
              <span>
                <small>{t('gameplay:clubCommand.board.confidence')}</small>
                <strong>{boardConfidence}%</strong>
              </span>
              <div><i style={{ width: `${Math.max(0, Math.min(100, boardConfidence))}%` }} /></div>
            </div>
            <div className="club-command-board__objective">
              <Target size={16} />
              <span>
                <small>{t('gameplay:clubCommand.board.objective')}</small>
                <strong>{objectiveLabel(pendingObjective, t)}</strong>
              </span>
            </div>
          </div>
          {dailyCover?.headline && (
            <button type="button" className="club-command-headline" onClick={() => navigate('/news')}>
              <span><Newspaper size={16} />{t('gameplay:clubCommand.briefing.today')}</span>
              <strong>{dailyCover.headline}</strong>
              <ChevronRight size={16} />
            </button>
          )}
          {Array.isArray(dailyCover?.stories) && dailyCover.stories.length > 0 && (
            <div className="club-command-stories">
              {dailyCover.stories.slice(0, 2).map((story: any) => (
                <button key={story.id} type="button" onClick={() => navigate(story.route ?? '/news')}>
                  <span>{story.icon ?? '•'}</span>
                  <p>{story.text}</p>
                </button>
              ))}
            </div>
          )}
        </CommandPanel>
      </div>

      <section className="club-command-departments">
        <header>
          <div>
            <span>{t('gameplay:clubCommand.departments.eyebrow')}</span>
            <h2><Wrench size={17} />{t('gameplay:clubCommand.departments.title')}</h2>
          </div>
          <p>{t('gameplay:clubCommand.departments.hint')}</p>
        </header>
        <div className="club-command-department-grid">
          {commandDomains.map((domain) => (
            <article key={domain.title} className="club-command-department">
              <span>{domain.eyebrow}</span>
              <h3>{domain.title}</h3>
              <div>
                {domain.links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <button key={link.route} type="button" onClick={() => navigate(link.route)}>
                      <Icon size={15} />
                      <span>{link.label}</span>
                      <ChevronRight size={14} />
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <style>{CLUB_COMMAND_CSS}</style>
    </div>
  );
}

const CLUB_COMMAND_CSS = `
.club-command {
  --command-green: #22c55e;
  --command-amber: #f59e0b;
  --command-red: #ef4444;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.club-command button { font: inherit; }
.club-command-hero {
  position: relative;
  isolation: isolate;
  min-height: 166px;
  padding: 24px 26px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--command-primary) 48%, var(--border-color));
  border-radius: 22px;
  background:
    linear-gradient(112deg, color-mix(in srgb, var(--command-primary) 18%, var(--bg-surface)) 0%, var(--bg-surface) 55%, color-mix(in srgb, var(--command-secondary) 10%, var(--bg-surface)) 100%);
  box-shadow: 0 22px 60px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.05);
}
.club-command-hero::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 3px;
  z-index: -1;
  background: linear-gradient(90deg, var(--command-primary), var(--command-secondary), transparent 82%);
}
.club-command-hero__glow {
  position: absolute;
  inset: -80% auto auto -10%;
  width: 540px;
  height: 540px;
  border-radius: 50%;
  z-index: -2;
  opacity: .18;
  background: radial-gradient(circle, var(--command-primary), transparent 68%);
  pointer-events: none;
}
.club-command-hero__watermark {
  position: absolute;
  right: 21%;
  top: 50%;
  transform: translateY(-50%) scale(1.35);
  opacity: .035;
  z-index: -1;
  filter: grayscale(1);
  pointer-events: none;
}
.club-command-hero__identity { display: flex; align-items: center; gap: 18px; min-width: 0; }
.club-command-hero__badge {
  width: 110px;
  height: 110px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 30px;
  border: 1px solid color-mix(in srgb, var(--command-primary) 50%, var(--border-color));
  background: color-mix(in srgb, var(--bg-base) 72%, transparent);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--command-primary) 18%, transparent), inset 0 1px 0 rgba(255,255,255,.08);
}
.club-command-hero__copy { min-width: 0; }
.club-command-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: color-mix(in srgb, var(--command-primary) 70%, var(--text-primary));
  font-family: var(--font-sans);
  font-size: .69rem;
  font-weight: 850;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.club-command-kicker__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--command-primary);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--command-primary) 13%, transparent);
}
.club-command-hero h1 {
  margin: 0;
  max-width: 650px;
  overflow: hidden;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: clamp(2rem, 4vw, 3.6rem);
  font-weight: 950;
  letter-spacing: -.055em;
  line-height: .92;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}
.club-command-hero__copy p {
  margin: 10px 0 0;
  color: var(--text-muted);
  font-size: .84rem;
  font-weight: 600;
}
.club-command-hero__status { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex: 0 0 auto; }
.club-command-operational {
  min-width: 230px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid color-mix(in srgb, var(--command-green) 32%, var(--border-color));
  border-radius: 12px;
  color: var(--command-green);
  background: color-mix(in srgb, var(--command-green) 8%, var(--bg-base));
}
.club-command-operational--alert {
  color: var(--command-amber);
  border-color: color-mix(in srgb, var(--command-amber) 42%, var(--border-color));
  background: color-mix(in srgb, var(--command-amber) 9%, var(--bg-base));
}
.club-command-operational div { display: flex; flex-direction: column; gap: 2px; }
.club-command-operational strong { font-size: .8rem; letter-spacing: .02em; }
.club-command-operational span { color: var(--text-muted); font-size: .67rem; }
.club-command-hero__actions { display: flex; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
.club-command-hero__actions button,
.club-command-secondary-action,
.club-command-text-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  background: color-mix(in srgb, var(--bg-elevated) 85%, transparent);
  cursor: pointer;
  transition: border-color .18s ease, color .18s ease, background .18s ease, transform .18s ease;
}
.club-command-hero__actions button { padding: 8px 10px; border-radius: 9px; font-size: .72rem; font-weight: 750; }
.club-command-hero__actions button:hover,
.club-command-secondary-action:hover,
.club-command-text-action:hover {
  color: var(--text-primary);
  border-color: color-mix(in srgb, var(--command-primary) 60%, var(--border-color));
  background: color-mix(in srgb, var(--command-primary) 9%, var(--bg-elevated));
}
.club-command-primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.62fr) minmax(330px, .88fr);
  gap: 16px;
}
.club-command-panel,
.club-command-departments {
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--bg-surface) 96%, white 1%) 0%, var(--bg-surface) 100%);
  box-shadow: var(--shadow-soft);
}
.club-command-panel { padding: 18px; }
.club-command-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.club-command-panel__header > div { min-width: 0; }
.club-command-panel__eyebrow,
.club-command-departments header span {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: .14em;
  text-transform: uppercase;
}
.club-command-panel__header h2,
.club-command-departments header h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 850;
  letter-spacing: -.015em;
}
.club-command-panel__header h2 svg,
.club-command-departments header h2 svg { color: var(--command-primary); }
.club-command-count {
  min-width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--command-amber);
  background: color-mix(in srgb, var(--command-amber) 11%, var(--bg-base));
  font-size: .75rem;
  font-weight: 850;
}
.club-command-match {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 110%, color-mix(in srgb, var(--command-primary) 12%, transparent), transparent 44%),
    var(--bg-surface);
}
.club-command-match::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: -130px;
  width: 330px;
  height: 250px;
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--command-primary) 16%, transparent);
  border-radius: 50%;
  pointer-events: none;
}
.club-command-match > * { position: relative; z-index: 1; }
.club-command-form { display: flex; gap: 5px; }
.club-command-form__item {
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: white;
  font-size: .66rem;
  font-weight: 900;
}
.club-command-form__item--win { background: var(--command-green); }
.club-command-form__item--draw { background: var(--command-amber); }
.club-command-form__item--loss { background: var(--command-red); }
.club-command-form__item--hidden { background: var(--text-muted); }
.club-command-match__meta { display: flex; justify-content: center; gap: 14px; color: var(--text-muted); font-size: .68rem; font-weight: 700; text-transform: uppercase; }
.club-command-match__meta span { display: inline-flex; align-items: center; gap: 5px; }
.club-command-match__versus { min-height: 120px; display: grid; grid-template-columns: minmax(0,1fr) 64px minmax(0,1fr); align-items: center; gap: 10px; }
.club-command-match__team { min-width: 0; display: grid; justify-items: center; gap: 6px; text-align: center; }
.club-command-match__team strong { max-width: 100%; overflow: hidden; color: var(--text-primary); font-family: var(--font-display); font-size: 1rem; text-overflow: ellipsis; white-space: nowrap; }
.club-command-match__team span { color: var(--text-muted); font-size: .62rem; font-weight: 750; letter-spacing: .09em; text-transform: uppercase; }
.club-command-match__team--mine strong { color: color-mix(in srgb, var(--command-primary) 75%, var(--text-primary)); }
.club-command-match__vs { display: flex; flex-direction: column; align-items: center; gap: 9px; color: var(--text-muted); font-family: var(--font-display); font-size: .72rem; font-weight: 850; }
.club-command-match__vs i { width: 1px; height: 30px; background: linear-gradient(transparent, var(--border-color), transparent); }
.club-command-match__actions { display: flex; justify-content: center; gap: 9px; margin-top: 6px; }
.club-command-primary-action,
.club-command-empty button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px 15px;
  border: 1px solid color-mix(in srgb, var(--command-primary) 70%, transparent);
  border-radius: 9px;
  color: var(--avatar-text);
  background: linear-gradient(135deg, var(--command-primary), color-mix(in srgb, var(--command-primary) 65%, black));
  box-shadow: 0 7px 18px color-mix(in srgb, var(--command-primary) 20%, transparent);
  cursor: pointer;
  font-size: .75rem;
  font-weight: 850;
}
.club-command-primary-action:hover,
.club-command-empty button:hover { transform: translateY(-1px); filter: brightness(1.08); }
.club-command-secondary-action { padding: 10px 14px; border-radius: 9px; font-size: .75rem; font-weight: 750; }
.club-command-empty { min-height: 190px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; color: var(--text-muted); text-align: center; }
.club-command-empty strong { color: var(--text-primary); font-family: var(--font-display); font-size: 1.05rem; }
.club-command-empty span { max-width: 360px; font-size: .78rem; }
.club-command-empty button { margin-top: 7px; }
.club-command-priority-list { display: flex; flex-direction: column; gap: 8px; }
.club-command-priority {
  width: 100%;
  min-height: 52px;
  padding: 9px 9px 9px 8px;
  display: grid;
  grid-template-columns: 30px minmax(0,1fr) 18px;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  background: var(--bg-elevated);
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease, background .18s ease;
}
.club-command-priority:disabled { cursor: default; }
.club-command-priority:not(:disabled):hover { transform: translateX(2px); border-color: color-mix(in srgb, var(--command-primary) 55%, var(--border-color)); }
.club-command-priority--urgent { border-color: color-mix(in srgb, var(--command-red) 35%, var(--border-color)); background: color-mix(in srgb, var(--command-red) 5%, var(--bg-elevated)); }
.club-command-priority__index {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--text-muted);
  background: var(--bg-base);
  font-family: var(--font-mono-retro);
  font-size: .64rem;
  font-weight: 800;
}
.club-command-priority--urgent .club-command-priority__index { color: var(--command-red); }
.club-command-priority__copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.club-command-priority__copy strong { overflow: hidden; font-size: .75rem; text-overflow: ellipsis; white-space: nowrap; }
.club-command-priority__copy small { overflow: hidden; color: var(--text-muted); font-size: .64rem; line-height: 1.3; text-overflow: ellipsis; white-space: nowrap; }
.club-command-priority > svg { color: var(--text-muted); }
.club-command-priority-list__more { color: var(--text-muted); font-size: .66rem; text-align: center; }
.club-command-ready { min-height: 190px; display: flex; align-items: center; justify-content: center; gap: 12px; padding: 18px; text-align: left; }
.club-command-ready > span { width: 48px; height: 48px; display: grid; place-items: center; flex: 0 0 auto; border-radius: 15px; color: var(--command-green); background: color-mix(in srgb, var(--command-green) 10%, var(--bg-elevated)); }
.club-command-ready strong { color: var(--text-primary); font-family: var(--font-display); }
.club-command-ready p { margin: 3px 0 0; color: var(--text-muted); font-size: .75rem; line-height: 1.4; }
.club-command-kpis { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; }
.club-command-kpi {
  position: relative;
  min-width: 0;
  padding: 15px;
  display: grid;
  grid-template-columns: 38px minmax(0,1fr) 16px;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  box-shadow: var(--shadow-soft);
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease;
}
.club-command-kpi::after { content: ""; position: absolute; inset: auto 0 0; height: 2px; opacity: .7; background: var(--kpi-tone); }
.club-command-kpi:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--kpi-tone) 42%, var(--border-color)); }
.club-command-kpi--green { --kpi-tone: var(--command-green); }
.club-command-kpi--blue { --kpi-tone: var(--blue-info); }
.club-command-kpi--red { --kpi-tone: var(--command-red); }
.club-command-kpi--gold { --kpi-tone: var(--gold-accent); }
.club-command-kpi--violet { --kpi-tone: var(--violet-accent); }
.club-command-kpi__icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 11px; color: var(--kpi-tone); background: color-mix(in srgb, var(--kpi-tone) 10%, var(--bg-elevated)); }
.club-command-kpi__copy { min-width: 0; display: flex; flex-direction: column; }
.club-command-kpi__copy small { color: var(--text-muted); font-size: .62rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.club-command-kpi__copy strong { color: var(--text-primary); font-family: var(--font-scoreboard); font-size: 1.24rem; line-height: 1.25; }
.club-command-kpi__copy em { overflow: hidden; color: var(--text-muted); font-size: .61rem; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }
.club-command-kpi__arrow { color: var(--text-muted); }
.club-command-health { padding-bottom: 16px; }
.club-command-updated { color: var(--text-muted); font-size: .62rem; }
.club-command-health-grid { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 9px; }
.club-command-health-card {
  --health-tone: var(--command-green);
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  color: var(--text-primary);
  background: var(--bg-elevated);
  text-align: left;
  cursor: pointer;
  transition: transform .18s ease, border-color .18s ease;
}
.club-command-health-card--watch { --health-tone: var(--command-amber); }
.club-command-health-card--risk { --health-tone: var(--command-red); }
.club-command-health-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--health-tone) 45%, var(--border-color)); }
.club-command-health-card__top { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; align-items: center; gap: 7px; }
.club-command-health-card__icon { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; color: var(--health-tone); background: color-mix(in srgb, var(--health-tone) 9%, var(--bg-base)); }
.club-command-health-card__top strong { overflow: hidden; font-size: .69rem; text-overflow: ellipsis; white-space: nowrap; }
.club-command-health-card__top b { color: var(--health-tone); font-family: var(--font-scoreboard); font-size: .87rem; }
.club-command-health-card__bar { height: 4px; display: block; margin: 10px 0 8px; overflow: hidden; border-radius: 99px; background: var(--bg-base); }
.club-command-health-card__bar i { height: 100%; display: block; border-radius: inherit; background: var(--health-tone); }
.club-command-health-card small { display: -webkit-box; min-height: 30px; overflow: hidden; color: var(--text-muted); font-size: .61rem; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.club-command-health-grid__empty { grid-column: 1 / -1; padding: 24px; color: var(--text-muted); font-size: .75rem; text-align: center; }
.club-command-secondary-grid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, .9fr) minmax(0, 1.18fr); gap: 16px; }
.club-command-text-action { padding: 5px 8px; border-radius: 7px; font-size: .65rem; font-weight: 750; }
.club-command-squad-metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 7px; margin-bottom: 12px; }
.club-command-squad-metrics div { padding: 9px 7px; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--bg-elevated); text-align: center; }
.club-command-squad-metrics strong { color: var(--command-primary); font-family: var(--font-scoreboard); font-size: .94rem; }
.club-command-squad-metrics span { color: var(--text-muted); font-size: .55rem; font-weight: 750; text-transform: uppercase; }
.club-command-squad-metrics .is-alert strong { color: var(--command-red); }
.club-command-player-list { display: flex; flex-direction: column; gap: 5px; }
.club-command-player-list button {
  width: 100%;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 31px minmax(0,1fr) auto 14px;
  align-items: center;
  gap: 7px;
  border: none;
  border-radius: 8px;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.club-command-player-list button:hover { background: var(--row-hover); }
.club-command-player-list__position { padding: 3px 4px; border-radius: 5px; color: var(--command-primary); background: color-mix(in srgb, var(--command-primary) 9%, var(--bg-elevated)); font-size: .58rem; font-weight: 850; text-align: center; }
.club-command-player-list__name { overflow: hidden; font-size: .73rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.club-command-player-list__fitness { color: var(--command-green); font-family: var(--font-scoreboard); font-size: .7rem; }
.club-command-player-list button svg { color: var(--text-muted); }
.club-command-table { display: flex; flex-direction: column; gap: 5px; }
.club-command-table button {
  width: 100%;
  padding: 7px 8px;
  display: grid;
  grid-template-columns: 22px 26px minmax(0,1fr) auto 26px;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-primary);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.club-command-table button:hover { background: var(--row-hover); }
.club-command-table button.is-me { border-color: color-mix(in srgb, var(--command-primary) 24%, var(--border-color)); background: color-mix(in srgb, var(--command-primary) 6%, var(--bg-elevated)); }
.club-command-table__rank { color: var(--text-muted); font-family: var(--font-scoreboard); font-size: .7rem; text-align: center; }
.club-command-table__club { min-width: 0; display: flex; align-items: center; gap: 5px; overflow: hidden; font-size: .7rem; font-weight: 750; text-overflow: ellipsis; white-space: nowrap; }
.club-command-table__club em { padding: 2px 4px; border-radius: 4px; color: var(--command-primary); background: color-mix(in srgb, var(--command-primary) 10%, transparent); font-size: .5rem; font-style: normal; }
.club-command-table__played { color: var(--text-muted); font-size: .57rem; }
.club-command-table button > strong { color: var(--command-primary); font-family: var(--font-scoreboard); font-size: .72rem; text-align: right; }
.club-command-inline-empty { display: block; padding: 24px 8px; color: var(--text-muted); font-size: .72rem; text-align: center; }
.club-command-board { display: grid; grid-template-columns: .75fr 1.25fr; gap: 9px; margin-bottom: 9px; }
.club-command-board__confidence,
.club-command-board__objective { padding: 10px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--bg-elevated); }
.club-command-board__confidence > span { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
.club-command-board__confidence small,
.club-command-board__objective small { color: var(--text-muted); font-size: .56rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.club-command-board__confidence strong { color: var(--command-primary); font-family: var(--font-scoreboard); font-size: 1rem; }
.club-command-board__confidence > div { height: 4px; margin-top: 8px; overflow: hidden; border-radius: 99px; background: var(--bg-base); }
.club-command-board__confidence > div i { height: 100%; display: block; border-radius: inherit; background: var(--command-primary); }
.club-command-board__objective { display: flex; align-items: center; gap: 8px; }
.club-command-board__objective > svg { flex: 0 0 auto; color: var(--gold-accent); }
.club-command-board__objective span { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.club-command-board__objective strong { display: -webkit-box; overflow: hidden; font-size: .68rem; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.club-command-headline {
  width: 100%;
  padding: 10px;
  display: grid;
  grid-template-columns: minmax(0,1fr) 18px;
  gap: 5px 8px;
  border: 1px solid color-mix(in srgb, var(--gold-accent) 24%, var(--border-color));
  border-radius: 10px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--gold-accent) 5%, var(--bg-elevated));
  cursor: pointer;
  text-align: left;
}
.club-command-headline > span { grid-column: 1; display: flex; align-items: center; gap: 6px; color: var(--gold-accent); font-size: .56rem; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
.club-command-headline > strong { grid-column: 1; display: -webkit-box; overflow: hidden; font-size: .72rem; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.club-command-headline > svg { grid-column: 2; grid-row: 1 / 3; align-self: center; color: var(--text-muted); }
.club-command-stories { margin-top: 7px; display: flex; flex-direction: column; gap: 4px; }
.club-command-stories button { width: 100%; padding: 5px 4px; display: flex; align-items: center; gap: 7px; border: none; color: var(--text-muted); background: transparent; cursor: pointer; text-align: left; }
.club-command-stories button:hover { color: var(--text-primary); }
.club-command-stories p { margin: 0; overflow: hidden; font-size: .63rem; text-overflow: ellipsis; white-space: nowrap; }
.club-command-departments { padding: 18px; }
.club-command-departments > header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.club-command-departments > header p { max-width: 520px; margin: 0; color: var(--text-muted); font-size: .7rem; line-height: 1.4; text-align: right; }
.club-command-department-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; }
.club-command-department { padding: 12px; border: 1px solid var(--border-color); border-radius: 11px; background: var(--bg-elevated); }
.club-command-department > span { color: var(--text-muted); font-size: .55rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.club-command-department h3 { margin: 3px 0 9px; color: var(--text-primary); font-family: var(--font-display); font-size: .82rem; }
.club-command-department > div { display: flex; flex-direction: column; gap: 3px; }
.club-command-department button {
  width: 100%;
  padding: 7px 6px;
  display: grid;
  grid-template-columns: 20px minmax(0,1fr) 14px;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: 7px;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.club-command-department button:hover { color: var(--text-primary); background: var(--row-hover); }
.club-command-department button > svg:first-child { color: var(--command-primary); }
.club-command-department button span { font-size: .68rem; font-weight: 700; }
.club-command-department button > svg:last-child { justify-self: end; }
@media (max-width: 1120px) {
  .club-command-primary-grid { grid-template-columns: minmax(0, 1.35fr) minmax(310px, .9fr); }
  .club-command-health-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
  .club-command-secondary-grid { grid-template-columns: 1fr 1fr; }
  .club-command-secondary-grid > :last-child { grid-column: 1 / -1; }
}
@media (max-width: 900px) {
  .club-command-hero { align-items: flex-start; flex-direction: column; }
  .club-command-hero__status { width: 100%; align-items: stretch; }
  .club-command-operational { min-width: 0; }
  .club-command-hero__actions { justify-content: flex-start; }
  .club-command-primary-grid { grid-template-columns: 1fr; }
  .club-command-kpis { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .club-command-department-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}
@media (max-width: 640px) {
  .club-command { gap: 12px; }
  .club-command-hero { min-height: 0; padding: 18px; border-radius: 17px; }
  .club-command-hero__identity { align-items: flex-start; gap: 12px; }
  .club-command-hero__badge { width: 74px; height: 74px; border-radius: 21px; }
  .club-command-hero__badge > * { transform: scale(.73); }
  .club-command-hero h1 { font-size: 1.7rem; white-space: normal; }
  .club-command-hero__copy p { font-size: .7rem; }
  .club-command-hero__actions button { flex: 1 1 30%; }
  .club-command-panel { padding: 14px; border-radius: 13px; }
  .club-command-match__versus { grid-template-columns: minmax(0,1fr) 44px minmax(0,1fr); }
  .club-command-match__actions { flex-direction: column; }
  .club-command-primary-action, .club-command-secondary-action { width: 100%; }
  .club-command-kpis { gap: 8px; }
  .club-command-kpi { padding: 12px 10px; grid-template-columns: 32px minmax(0,1fr); }
  .club-command-kpi__icon { width: 32px; height: 32px; }
  .club-command-kpi__arrow { display: none; }
  .club-command-kpi__copy strong { font-size: 1rem; }
  .club-command-health-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
  .club-command-secondary-grid { grid-template-columns: 1fr; }
  .club-command-secondary-grid > :last-child { grid-column: auto; }
  .club-command-board { grid-template-columns: 1fr; }
  .club-command-departments { padding: 14px; }
  .club-command-departments > header { align-items: flex-start; flex-direction: column; }
  .club-command-departments > header p { text-align: left; }
  .club-command-department-grid { grid-template-columns: 1fr; }
}
`;
