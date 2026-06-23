import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity, ArrowRight, ArrowRightLeft, Banknote, CalendarClock, CheckCircle2,
  CircleDollarSign, Clock3, Compass, Gauge, HeartHandshake, Inbox, MessageSquare,
  Newspaper, Shield, Sparkles, Target, Trophy, Users, WalletCards,
} from 'lucide-react';
import {
  clubApi, dmApi, economyApi, fansApi, forumApi, marketApi, matchesApi,
  newsApi, staffApi, worldApi,
} from '../api/client';
import { NAV_PHASES } from '../components/layout/navConfig';
import { ClubBadge, Skeleton } from '../components/ui';
import { useGameStore } from '../stores/gameStore';
import { useSession } from '../stores/sessionStore';
import { asArray } from '../lib/normalize';
import { cn } from '../lib/cn';
import { eur } from '../lib/format';

export type AreaHubKind = 'transfers' | 'competition' | 'club' | 'community';

type HubState = Record<string, any>;
type Metric = { label: string; value: string | number; tone?: 'good' | 'watch' | 'risk' | 'neutral'; icon: ComponentType<{ size?: number }> };
type PulseItem = { title: string; detail: string; tone?: 'good' | 'watch' | 'risk' | 'neutral'; route?: string };

const AREA_PHASE: Record<AreaHubKind, string> = {
  transfers: 'fichajes',
  competition: 'competicion',
  club: 'club',
  community: 'comunidad',
};

const AREA_ICON: Record<AreaHubKind, ComponentType<{ size?: number }>> = {
  transfers: ArrowRightLeft,
  competition: Trophy,
  club: Shield,
  community: Users,
};

function valueOf<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function pct(value: unknown, total: unknown): number | null {
  const current = Number(value);
  const maximum = Number(total);
  if (!Number.isFinite(current) || !Number.isFinite(maximum) || maximum <= 0) return null;
  return Math.round((current / maximum) * 100);
}

function matchLabel(match: any, clubId?: number) {
  if (!match) return '—';
  const isHome = match.homeClubId === clubId;
  return isHome
    ? match.awayClub?.shortName ?? match.awayClub?.name ?? '—'
    : match.homeClub?.shortName ?? match.homeClub?.name ?? '—';
}

function displayText(value: unknown, fallback: string): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const candidate = record.label ?? record.name ?? record.phase ?? record.status;
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  }
  return fallback;
}

export function AreaHubPage({ kind }: { kind: AreaHubKind }) {
  const { t } = useTranslation('common');
  const club = useSession((state) => state.club);
  const gameState = useGameStore((state) => state.gameState);
  const [data, setData] = useState<HubState>({});
  const [loading, setLoading] = useState(true);
  const [partialFailures, setPartialFailures] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    let results: PromiseSettledResult<any>[] = [];

    if (kind === 'transfers') {
      results = await Promise.allSettled([
        marketApi.getWindow(), marketApi.getSalaryCap(), marketApi.getMyOffers(),
        marketApi.getShortlist(), marketApi.squadLimits(), marketApi.deadlineDay(),
      ]);
      setData({
        window: valueOf(results[0]), cap: valueOf(results[1]),
        offers: valueOf(results[2]) ?? [], shortlist: valueOf(results[3]) ?? [],
        limits: valueOf(results[4]), deadline: valueOf(results[5]),
      });
    } else if (kind === 'competition') {
      results = await Promise.allSettled([
        matchesApi.getMine(), clubApi.standings(), worldApi.competitions(),
      ]);
      setData({
        matches: valueOf(results[0]) ?? { played: [], upcoming: [] },
        standings: valueOf(results[1]) ?? [],
        competitions: valueOf(results[2]) ?? { competitions: [] },
      });
    } else if (kind === 'club') {
      results = await Promise.allSettled([
        clubApi.get(), clubApi.healthMap(), economyApi.get(), staffApi.get(), fansApi.mood(),
      ]);
      setData({
        club: valueOf(results[0]), health: valueOf(results[1]),
        economy: valueOf(results[2]), staff: valueOf(results[3]), mood: valueOf(results[4]),
      });
    } else {
      results = await Promise.allSettled([
        newsApi.get(1), dmApi.conversations(), forumApi.listThreads('general'),
      ]);
      setData({
        news: valueOf(results[0]), conversations: valueOf(results[1]) ?? [],
        threads: valueOf(results[2]) ?? [],
      });
    }

    setPartialFailures(results.filter((result) => result.status === 'rejected').length);
    setLoading(false);
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const view = useMemo(() => buildView(kind, data, club?.id, t), [kind, data, club?.id, t]);
  const phase = NAV_PHASES.find((item) => item.id === AREA_PHASE[kind]);
  const tools = phase?.links.filter((link) => link.path !== phase.homePath) ?? [];
  const AreaIcon = AREA_ICON[kind];
  const PrimaryIcon = view.primary.icon;

  if (loading) {
    return (
      <div className="area-hub area-hub--loading">
        <style>{AREA_HUB_CSS}</style>
        <Skeleton height={235} />
        <div className="area-hub__metricgrid">{[0, 1, 2, 3].map((item) => <Skeleton key={item} height={92} />)}</div>
        <Skeleton height={330} />
      </div>
    );
  }

  return (
    <div className={`area-hub area-hub--${kind}`} style={{ ['--area-accent' as string]: phase?.accent ?? 'var(--green-primary)' }}>
      <style>{AREA_HUB_CSS}</style>

      <section className="area-hub__hero">
        <div className="area-hub__hero-main">
          <span className="area-hub__badge">
            {kind === 'club'
              ? <ClubBadge id={club?.id} name={club?.name} size={68} />
              : <AreaIcon size={31} />}
          </span>
          <div>
            <span className="area-hub__eyebrow"><Compass size={12} />{t(`areaHub.${kind}.eyebrow`)}</span>
            <h1>{t(`areaHub.${kind}.title`)}</h1>
            <p>{t(`areaHub.${kind}.description`)}</p>
          </div>
        </div>
        <div className="area-hub__hero-context">
          {gameState?.seasonWeek != null && <span>{t('areaHub.matchday', { week: gameState.seasonWeek })}</span>}
          {gameState?.season && <span>{gameState.season}</span>}
          {partialFailures > 0 && <button type="button" onClick={() => void load()}>{t('areaHub.partial', { count: partialFailures })}</button>}
        </div>
        <div className={cn('area-hub__status', `is-${view.statusTone}`)}>
          {view.statusTone === 'good' ? <CheckCircle2 size={18} /> : <Activity size={18} />}
          <div><strong>{view.statusTitle}</strong><span>{view.statusDetail}</span></div>
        </div>
      </section>

      <section className="area-hub__metricgrid">
        {view.metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className={cn(`is-${metric.tone ?? 'neutral'}`)}>
              <span><Icon size={17} /></span>
              <div><small>{metric.label}</small><strong>{metric.value}</strong></div>
            </article>
          );
        })}
      </section>

      <div className="area-hub__command">
        <section className="area-hub__priority">
          <span className="area-hub__section-label"><Sparkles size={13} />{t('areaHub.priority')}</span>
          <div className="area-hub__priority-body">
            <span><PrimaryIcon size={26} /></span>
            <div>
              <small>{view.primary.kicker}</small>
              <h2>{view.primary.title}</h2>
              <p>{view.primary.detail}</p>
              <Link to={view.primary.route}>{view.primary.action}<ArrowRight size={15} /></Link>
            </div>
          </div>
        </section>

        <section className="area-hub__pulse">
          <div className="area-hub__section-head">
            <span className="area-hub__section-label"><Gauge size={13} />{t('areaHub.pulse')}</span>
            <small>{t('areaHub.liveData')}</small>
          </div>
          <div>
            {view.pulse.map((item, index) => {
              const content = (
                <>
                  <i className={`is-${item.tone ?? 'neutral'}`} />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  {item.route && <ArrowRight size={13} />}
                </>
              );
              return item.route
                ? <Link key={`${item.title}-${index}`} to={item.route}>{content}</Link>
                : <div key={`${item.title}-${index}`}>{content}</div>;
            })}
          </div>
        </section>
      </div>

      {kind === 'club' && view.health.length > 0 && (
        <section className="area-hub__health">
          <div className="area-hub__section-head">
            <span className="area-hub__section-label"><HeartHandshake size={13} />{t('areaHub.club.health')}</span>
            <small>{t('areaHub.club.healthHint')}</small>
          </div>
          <div>
            {view.health.map((area: any, index: number) => (
              <article key={area.name ?? area.id ?? index} className={`is-${area.status ?? 'neutral'}`}>
                <span>{area.name ?? area.label}</span>
                <strong>{Math.round(Number(area.score ?? 0))}</strong>
                <i><b style={{ width: `${Math.max(0, Math.min(100, Number(area.score ?? 0)))}%` }} /></i>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="area-hub__tools">
        <div className="area-hub__section-head">
          <span className="area-hub__section-label"><Target size={13} />{t('areaHub.tools')}</span>
          <small>{t(`areaHub.${kind}.toolsHint`)}</small>
        </div>
        <div className="area-hub__toolgrid">
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <Link key={tool.path} to={tool.path} className={cn(index === 0 && 'is-primary')}>
                <span><Icon size={19} /></span>
                <div><strong>{t(tool.labelKey)}</strong><small>{tool.descKey ? t(tool.descKey) : ''}</small></div>
                <ArrowRight size={14} />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function buildView(kind: AreaHubKind, data: HubState, clubId: number | undefined, t: ReturnType<typeof useTranslation>['t']) {
  if (kind === 'transfers') {
    const offers = asArray<any>(data.offers);
    const targets = asArray<any>(data.shortlist);
    const pendingOffers = offers.filter((offer) => ['pending', 'sent', 'countered', 'open'].includes(String(offer.status ?? '').toLowerCase())).length;
    const isOpen = Boolean(data.window?.transferWindow ?? data.window?.isOpen ?? data.window?.open ?? data.window?.transferOpen);
    const capUse = pct(data.cap?.usedMonthly ?? data.cap?.currentSalary ?? data.cap?.current ?? data.cap?.used, data.cap?.capMonthly ?? data.cap?.salaryCap ?? data.cap?.cap ?? data.cap?.limit);
    const room = Number(data.limits?.limits?.maxFirstTeamPlusIncoming ?? 30) - Number(data.limits?.firstTeam ?? 0) - Number(data.limits?.pendingIncoming ?? 0);
    return {
      statusTone: isOpen ? 'good' : 'watch',
      statusTitle: t(isOpen ? 'areaHub.transfers.open' : 'areaHub.transfers.closed'),
      statusDetail: t(isOpen ? 'areaHub.transfers.openHint' : 'areaHub.transfers.closedHint'),
      metrics: [
        { label: t('areaHub.transfers.metrics.window'), value: isOpen ? t('areaHub.open') : t('areaHub.closed'), tone: isOpen ? 'good' : 'watch', icon: Clock3 },
        { label: t('areaHub.transfers.metrics.offers'), value: pendingOffers, tone: pendingOffers > 0 ? 'watch' : 'neutral', icon: WalletCards },
        { label: t('areaHub.transfers.metrics.targets'), value: targets.length, tone: targets.length > 0 ? 'good' : 'neutral', icon: Target },
        { label: t('areaHub.transfers.metrics.cap'), value: capUse == null ? '—' : `${capUse}%`, tone: capUse != null && capUse >= 90 ? 'risk' : 'good', icon: CircleDollarSign },
      ] as Metric[],
      primary: { icon: Target, kicker: t('areaHub.nextMove'), title: t('areaHub.transfers.primaryTitle'), detail: t('areaHub.transfers.primaryDetail', { count: targets.length }), action: t('areaHub.transfers.primaryAction'), route: '/market' },
      pulse: [
        { title: t('areaHub.transfers.pulseOffers'), detail: t('areaHub.transfers.pulseOffersDetail', { count: pendingOffers }), tone: pendingOffers > 0 ? 'watch' : 'neutral', route: '/negotiations' },
        { title: t('areaHub.transfers.pulseRoom'), detail: t('areaHub.transfers.pulseRoomDetail', { count: Math.max(0, room) }), tone: room <= 1 ? 'risk' : 'good', route: '/squad' },
        { title: t('areaHub.transfers.pulseDeadline'), detail: displayText(data.deadline?.status, t('areaHub.transfers.pulseDeadlineDetail')), tone: data.deadline ? 'watch' : 'neutral', route: '/auctions' },
      ] as PulseItem[],
      health: [],
    };
  }

  if (kind === 'competition') {
    const matches = data.matches ?? { played: [], upcoming: [] };
    const upcoming = asArray<any>(matches.upcoming);
    const played = asArray<any>(matches.played);
    const next = upcoming[0];
    const standings = asArray<any>(data.standings);
    const myRow = standings.find((row) => row.club?.id === clubId || row.clubId === clubId);
    const competitions = asArray<any>(data.competitions?.competitions ?? data.competitions);
    return {
      statusTone: next ? 'good' : 'watch',
      statusTitle: next ? t('areaHub.competition.nextReady') : t('areaHub.competition.noNext'),
      statusDetail: next ? t('areaHub.competition.nextHint', { rival: matchLabel(next, clubId) }) : t('areaHub.competition.noNextHint'),
      metrics: [
        { label: t('areaHub.competition.metrics.position'), value: myRow?.position ? `#${myRow.position}` : '—', tone: myRow?.position <= 4 ? 'good' : 'neutral', icon: Trophy },
        { label: t('areaHub.competition.metrics.points'), value: myRow?.points ?? '—', tone: 'neutral', icon: Sparkles },
        { label: t('areaHub.competition.metrics.upcoming'), value: upcoming.length, tone: upcoming.length > 0 ? 'good' : 'watch', icon: CalendarClock },
        { label: t('areaHub.competition.metrics.world'), value: competitions.length, tone: 'neutral', icon: Compass },
      ] as Metric[],
      primary: { icon: CalendarClock, kicker: t('areaHub.nextMatch'), title: next ? matchLabel(next, clubId) : t('areaHub.competition.primaryFallback'), detail: next ? `${next.competition?.name ?? next.competition?.shortName ?? t('areaHub.competition.friendly')} · ${next.matchdayNum ?? next.week ?? '—'}` : t('areaHub.competition.primaryFallbackDetail'), action: t('areaHub.competition.primaryAction'), route: next?.id ? `/matches/${next.id}` : '/calendar' },
      pulse: [
        { title: t('areaHub.competition.pulseForm'), detail: t('areaHub.competition.pulseFormDetail', { count: played.length }), tone: played.length > 0 ? 'good' : 'neutral', route: '/matches' },
        { title: t('areaHub.competition.pulseTable'), detail: myRow ? t('areaHub.competition.pulseTableDetail', { position: myRow.position, points: myRow.points }) : t('areaHub.competition.pulseTableUnknown'), tone: myRow?.position <= 4 ? 'good' : 'neutral', route: '/league' },
        { title: t('areaHub.competition.pulseWorld'), detail: t('areaHub.competition.pulseWorldDetail', { count: competitions.length }), tone: 'neutral', route: '/world' },
      ] as PulseItem[],
      health: [],
    };
  }

  if (kind === 'club') {
    const clubData = data.club?.club ?? data.club ?? {};
    const health = asArray<any>(data.health?.areas ?? data.health);
    const healthAverage = health.length ? Math.round(health.reduce((sum, area) => sum + Number(area.score ?? 0), 0) / health.length) : null;
    const staff = asArray<any>(data.staff?.members ?? data.staff);
    const moodScore = Number(data.mood?.score ?? data.mood?.value);
    const balance = clubData.budget ?? data.economy?.budget ?? data.economy?.cash;
    return {
      statusTone: healthAverage != null && healthAverage >= 70 ? 'good' : healthAverage != null && healthAverage < 45 ? 'risk' : 'watch',
      statusTitle: healthAverage == null ? t('areaHub.club.noDiagnosis') : t('areaHub.club.diagnosis', { score: healthAverage }),
      statusDetail: t('areaHub.club.diagnosisHint'),
      metrics: [
        { label: t('areaHub.club.metrics.balance'), value: eur(balance), tone: Number(balance) < 0 ? 'risk' : 'good', icon: Banknote },
        { label: t('areaHub.club.metrics.health'), value: healthAverage == null ? '—' : `${healthAverage}/100`, tone: healthAverage != null && healthAverage >= 70 ? 'good' : 'watch', icon: Activity },
        { label: t('areaHub.club.metrics.staff'), value: staff.length, tone: staff.length > 0 ? 'good' : 'watch', icon: Users },
        { label: t('areaHub.club.metrics.mood'), value: Number.isFinite(moodScore) ? `${moodScore}/100` : data.mood?.mood ?? '—', tone: moodScore >= 65 ? 'good' : moodScore < 40 ? 'risk' : 'watch', icon: HeartHandshake },
      ] as Metric[],
      primary: { icon: Banknote, kicker: t('areaHub.nextDecision'), title: t('areaHub.club.primaryTitle'), detail: t('areaHub.club.primaryDetail'), action: t('areaHub.club.primaryAction'), route: '/economy' },
      pulse: [
        { title: t('areaHub.club.pulseStadium'), detail: t('areaHub.club.pulseStadiumDetail'), tone: 'neutral', route: '/stadium' },
        { title: t('areaHub.club.pulseStaff'), detail: t('areaHub.club.pulseStaffDetail', { count: staff.length }), tone: staff.length > 0 ? 'good' : 'watch', route: '/staff' },
        { title: t('areaHub.club.pulseFans'), detail: Number.isFinite(moodScore) ? `${moodScore}/100` : displayText(data.mood?.mood, t('areaHub.club.pulseFansDetail')), tone: moodScore >= 65 ? 'good' : 'watch', route: '/fans' },
      ] as PulseItem[],
      health,
    };
  }

  const conversations = asArray<any>(data.conversations);
  const unread = conversations.reduce((sum, conversation) => sum + Number(conversation.unread ?? 0), 0);
  const threads = asArray<any>(data.threads);
  const press = asArray<any>(data.news?.press?.data ?? data.news?.press);
  const inbox = asArray<any>(data.news?.inbox?.data ?? data.news?.inbox);
  const unreadNews = inbox.filter((item) => item.isRead === false).length;
  return {
    statusTone: unread + unreadNews > 0 ? 'watch' : 'good',
    statusTitle: unread + unreadNews > 0 ? t('areaHub.community.pending', { count: unread + unreadNews }) : t('areaHub.community.clear'),
    statusDetail: t('areaHub.community.statusHint'),
    metrics: [
      { label: t('areaHub.community.metrics.messages'), value: unread, tone: unread > 0 ? 'watch' : 'good', icon: Inbox },
      { label: t('areaHub.community.metrics.news'), value: unreadNews, tone: unreadNews > 0 ? 'watch' : 'good', icon: Newspaper },
      { label: t('areaHub.community.metrics.press'), value: press.length, tone: 'neutral', icon: Activity },
      { label: t('areaHub.community.metrics.threads'), value: threads.length, tone: threads.length > 0 ? 'good' : 'neutral', icon: MessageSquare },
    ] as Metric[],
    primary: { icon: Newspaper, kicker: t('areaHub.community.today'), title: press[0]?.title ?? press[0]?.headline ?? t('areaHub.community.primaryFallback'), detail: press[0]?.summary ?? press[0]?.body ?? t('areaHub.community.primaryDetail'), action: t('areaHub.community.primaryAction'), route: '/news' },
    pulse: [
      { title: t('areaHub.community.pulseMessages'), detail: t('areaHub.community.pulseMessagesDetail', { count: unread }), tone: unread > 0 ? 'watch' : 'good', route: '/messages' },
      { title: t('areaHub.community.pulseForum'), detail: threads[0]?.title ?? t('areaHub.community.pulseForumDetail'), tone: threads.length > 0 ? 'good' : 'neutral', route: '/forum' },
      { title: t('areaHub.community.pulsePress'), detail: t('areaHub.community.pulsePressDetail', { count: press.length }), tone: 'neutral', route: '/news' },
    ] as PulseItem[],
    health: [],
  };
}

const AREA_HUB_CSS = `
.area-hub{display:flex;flex-direction:column;gap:14px}.area-hub__hero{position:relative;overflow:hidden;padding:20px;border:1px solid color-mix(in srgb,var(--area-accent) 35%,var(--border-color));border-radius:18px;background:radial-gradient(circle at 12% -30%,color-mix(in srgb,var(--area-accent) 24%,transparent),transparent 42%),linear-gradient(120deg,var(--bg-surface),color-mix(in srgb,var(--area-accent) 4%,var(--bg-elevated)));box-shadow:0 20px 55px -32px color-mix(in srgb,var(--area-accent) 40%,black)}
.area-hub__hero::after{content:"";position:absolute;inset:auto 0 0;height:2px;background:linear-gradient(90deg,var(--area-accent),transparent 82%)}.area-hub__hero-main{display:flex;align-items:center;gap:15px}.area-hub__badge{width:82px;height:82px;display:grid;place-items:center;flex:0 0 auto;border:1px solid color-mix(in srgb,var(--area-accent) 42%,var(--border-color));border-radius:22px;color:var(--area-accent);background:color-mix(in srgb,var(--area-accent) 8%,var(--bg-base))}
.area-hub__eyebrow,.area-hub__section-label{display:flex;align-items:center;gap:6px;color:var(--area-accent);font-size:.58rem;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.area-hub h1{margin:4px 0 0;color:var(--text-primary);font-family:var(--font-display);font-size:clamp(1.8rem,4vw,3rem);font-weight:950;letter-spacing:-.045em;line-height:1;text-transform:uppercase}.area-hub__hero-main p{max-width:720px;margin:8px 0 0;color:var(--text-muted);font-size:.76rem;line-height:1.45}
.area-hub__hero-context{position:absolute;top:18px;right:18px;display:flex;align-items:center;gap:6px}.area-hub__hero-context span,.area-hub__hero-context button{padding:5px 8px;border:1px solid var(--border-color);border-radius:7px;color:var(--text-muted);background:var(--bg-elevated);font-size:.56rem;font-weight:750}.area-hub__hero-context button{color:var(--gold-accent);cursor:pointer}
.area-hub__status{--status-tone:var(--gold-accent);margin-top:17px;padding:9px 11px;display:flex;align-items:center;gap:9px;border:1px solid color-mix(in srgb,var(--status-tone) 30%,var(--border-color));border-radius:10px;background:color-mix(in srgb,var(--status-tone) 6%,var(--bg-elevated))}.area-hub__status.is-good{--status-tone:var(--green-primary)}.area-hub__status.is-risk{--status-tone:var(--red-danger)}.area-hub__status>svg{color:var(--status-tone)}.area-hub__status div{display:flex;flex-direction:column}.area-hub__status strong{font-size:.7rem}.area-hub__status span{color:var(--text-muted);font-size:.59rem}
.area-hub__metricgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.area-hub__metricgrid article{--metric-tone:var(--area-accent);padding:12px;display:flex;align-items:center;gap:10px;border:1px solid color-mix(in srgb,var(--metric-tone) 23%,var(--border-color));border-radius:12px;background:var(--bg-surface);box-shadow:var(--shadow-soft)}.area-hub__metricgrid article.is-good{--metric-tone:var(--green-primary)}.area-hub__metricgrid article.is-watch{--metric-tone:var(--gold-accent)}.area-hub__metricgrid article.is-risk{--metric-tone:var(--red-danger)}.area-hub__metricgrid article>span{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;color:var(--metric-tone);background:color-mix(in srgb,var(--metric-tone) 9%,var(--bg-elevated))}.area-hub__metricgrid article div{min-width:0;display:flex;flex-direction:column}.area-hub__metricgrid small{color:var(--text-muted);font-size:.54rem;font-weight:750;letter-spacing:.07em;text-transform:uppercase}.area-hub__metricgrid strong{overflow:hidden;color:var(--text-primary);font-family:var(--font-scoreboard);font-size:1rem;text-overflow:ellipsis;white-space:nowrap}
.area-hub__command{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:12px}.area-hub__priority,.area-hub__pulse,.area-hub__tools,.area-hub__health{padding:14px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-surface);box-shadow:var(--shadow-soft)}.area-hub__priority-body{min-height:190px;margin-top:11px;padding:18px;display:flex;align-items:center;gap:16px;border:1px solid color-mix(in srgb,var(--area-accent) 28%,var(--border-color));border-radius:13px;background:radial-gradient(circle at 100% 0,color-mix(in srgb,var(--area-accent) 14%,transparent),transparent 50%),var(--bg-elevated)}.area-hub__priority-body>span{width:58px;height:58px;display:grid;place-items:center;flex:0 0 auto;border-radius:16px;color:var(--area-accent);background:color-mix(in srgb,var(--area-accent) 10%,var(--bg-base))}.area-hub__priority-body>div{min-width:0}.area-hub__priority-body small{color:var(--area-accent);font-size:.56rem;font-weight:850;text-transform:uppercase}.area-hub__priority h2{margin:4px 0;color:var(--text-primary);font-family:var(--font-display);font-size:1.4rem;line-height:1.05}.area-hub__priority p{margin:0 0 13px;color:var(--text-muted);font-size:.69rem;line-height:1.45}.area-hub__priority a{width:max-content;padding:8px 11px;display:flex;align-items:center;gap:7px;border-radius:8px;color:var(--bg-base);background:var(--area-accent);font-size:.63rem;font-weight:850;text-decoration:none;text-transform:uppercase}
.area-hub__section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.area-hub__section-head>small{color:var(--text-muted);font-size:.56rem}.area-hub__pulse>div:last-child{margin-top:9px;display:flex;flex-direction:column;gap:5px}.area-hub__pulse a,.area-hub__pulse>div:last-child>div{padding:10px;display:grid;grid-template-columns:6px minmax(0,1fr) auto;align-items:center;gap:9px;border:1px solid var(--border-color);border-radius:9px;color:var(--text-primary);background:var(--bg-elevated);text-decoration:none}.area-hub__pulse i{width:6px;height:32px;border-radius:99px;background:var(--text-muted)}.area-hub__pulse i.is-good{background:var(--green-primary)}.area-hub__pulse i.is-watch{background:var(--gold-accent)}.area-hub__pulse i.is-risk{background:var(--red-danger)}.area-hub__pulse span{min-width:0;display:flex;flex-direction:column}.area-hub__pulse strong,.area-hub__pulse small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.area-hub__pulse strong{font-size:.65rem}.area-hub__pulse small{color:var(--text-muted);font-size:.56rem}.area-hub__pulse a>svg{color:var(--area-accent)}
.area-hub__health>div:last-child{margin-top:10px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}.area-hub__health article{padding:9px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-elevated)}.area-hub__health article span{display:block;overflow:hidden;color:var(--text-muted);font-size:.54rem;text-overflow:ellipsis;white-space:nowrap}.area-hub__health article strong{font-family:var(--font-scoreboard);font-size:.78rem}.area-hub__health article i{height:3px;margin-top:6px;display:block;overflow:hidden;border-radius:99px;background:var(--bg-base)}.area-hub__health article i b{height:100%;display:block;background:var(--area-accent)}
.area-hub__toolgrid{margin-top:10px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.area-hub__toolgrid a{min-width:0;padding:12px;display:grid;grid-template-columns:36px minmax(0,1fr) auto;align-items:center;gap:9px;border:1px solid var(--border-color);border-radius:10px;color:var(--text-primary);background:var(--bg-elevated);text-decoration:none;transition:transform .16s,border-color .16s}.area-hub__toolgrid a:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--area-accent) 38%,var(--border-color))}.area-hub__toolgrid a>span{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;color:var(--area-accent);background:color-mix(in srgb,var(--area-accent) 8%,var(--bg-base))}.area-hub__toolgrid a>div{min-width:0;display:flex;flex-direction:column}.area-hub__toolgrid strong,.area-hub__toolgrid small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.area-hub__toolgrid strong{font-size:.67rem}.area-hub__toolgrid small{color:var(--text-muted);font-size:.56rem}.area-hub__toolgrid a>svg{color:var(--text-muted)}.area-hub__toolgrid a.is-primary{border-color:color-mix(in srgb,var(--area-accent) 30%,var(--border-color));background:color-mix(in srgb,var(--area-accent) 5%,var(--bg-elevated))}
@media(max-width:1000px){.area-hub__metricgrid{grid-template-columns:repeat(2,minmax(0,1fr))}.area-hub__command{grid-template-columns:1fr}.area-hub__health>div:last-child{grid-template-columns:repeat(3,minmax(0,1fr))}.area-hub__toolgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:620px){.area-hub__hero{padding:15px}.area-hub__hero-main{align-items:flex-start}.area-hub__badge{width:54px;height:54px;border-radius:15px}.area-hub__badge>svg{width:23px}.area-hub__hero-context{position:static;margin-top:12px}.area-hub__status{margin-top:10px}.area-hub__metricgrid{gap:6px}.area-hub__metricgrid article{padding:9px}.area-hub__priority-body{min-height:0;padding:13px;align-items:flex-start}.area-hub__priority-body>span{width:42px;height:42px;border-radius:12px}.area-hub__priority h2{font-size:1.08rem}.area-hub__health>div:last-child{grid-template-columns:repeat(2,minmax(0,1fr))}.area-hub__toolgrid{grid-template-columns:1fr}}
`;
