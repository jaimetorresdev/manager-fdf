// ─── EconomyPage — economía FDF ampliada (manual §7) · rediseño E17 lote A ────
// Terminal financiero: fila KPI hero (caja grande, balance, masa salarial vs
// tope, valoración) + gráficas recharts (área apilada ingresos/gastos 12m,
// waterfall del mes, donut de masa salarial) + Tabs con derechos de imagen,
// subcontratas, entradas y pretemporada. MISMA lógica de negocio que antes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, Star, TrendingUp, TrendingDown, Tv, Megaphone, ShoppingBag,
  Building2, Plane, Sun, Loader2, AlertTriangle, Ticket, ShieldCheck,
  BarChart3, Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { economyApi, friendliesApi, clubApi, worldApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { Button, Skeleton, SectionHeader, Tabs, EmptyState, SortableTable, ClubBadge, NarrativePageHeader, ConfirmModal, type SortCol } from '../components/ui';
import { ClubLink } from '../components/common/EntityLink';
import {
  IncomeExpenseArea, CashProjection,
  type ForecastMonth,
} from '../components/economy/EconomyCharts';
import {
  SalaryRatioGauge, ValuationEvolution, CompetitionIncomePanel, TopVariations,
  type ValuationRow, type CompetitionIncomeRow, type VariationRow,
} from '../components/economy/EconomyAnalysisCharts';
import { GlobalEconomicDistribution } from '../components/economy/GlobalEconomicDistribution';
import { eurFmt as eur, RISK_META } from '../components/economy/chartUtils';
import { asArray } from '../lib/normalize';
import { cn } from '../lib/cn';

const MONTH_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Derechos de imagen — manual §7.3: % sobre la cantidad base según años firmados.
const SPONSOR_TYPES: {
  key: 'tv' | 'ads' | 'merch'; icon: typeof Tv;
  pct: Record<1 | 2 | 3, number>;
}[] = [
  { key: 'tv',    icon: Tv,          pct: { 3: 82, 2: 72, 1: 62 } },
  { key: 'ads',   icon: Megaphone,   pct: { 3: 66, 2: 56, 1: 46 } },
  { key: 'merch', icon: ShoppingBag, pct: { 3: 48, 2: 38, 1: 28 } },
];

// Subcontratas — manual §7.5 (efectos y topes de aforo).
const OUTSOURCING_META: Record<string, { gate?: number }> = {
  travelAgency: {},
  security:     { gate: 5000 },
  maintenance:  { gate: 10000 },
  cleaning:     {},
  food:         {},
  media:        {},
  medical:      {},
};
const OUTSOURCING_ORDER = ['security', 'maintenance', 'cleaning', 'food', 'media', 'travelAgency', 'medical'];

const TICKET_LEVELS: { key: 'low' | 'medium' | 'high'; mult: number }[] = [
  { key: 'low',    mult: 5 },
  { key: 'medium', mult: 10 },
  { key: 'high',   mult: 15 },
];



interface ClubLite { id: number; name: string; shortName?: string; country?: string }

type EcTab = 'resumen' | 'analisis' | 'sponsors' | 'outsourcing' | 'tickets' | 'preseason';

function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// ─── page ─────────────────────────────────────────────────────────────────────
export function EconomyPage() {
  const { t } = useTranslation();
  const { club: sessionClub } = useSession();
  const myClubId = sessionClub?.id;

  const [snap, setSnap] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null); // B17 · GET /api/economy/analysis
  const [forecast, setForecast] = useState<any>(null);
  const [preseason, setPreseason] = useState<any>(null);
  const [friendlies, setFriendlies] = useState<any[]>([]);
  const [club, setClub] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<EcTab>('resumen');

  // formulario de patrocinios: años elegidos por tipo
  const [sponsorYears, setSponsorYears] = useState<Record<string, 1 | 2 | 3>>({ tv: 3, ads: 3, merch: 3 });
  const [confirmBreak, setConfirmBreak] = useState<number | null>(null);
  const [confirmOutsourcing, setConfirmOutsourcing] = useState<{ key: string; hire: boolean } | null>(null);

  // formulario de amistoso de pretemporada
  const [oppQuery, setOppQuery] = useState('');
  const [oppResults, setOppResults] = useState<ClubLite[]>([]);
  const [oppSelected, setOppSelected] = useState<ClubLite | null>(null);
  const [friendlyDate, setFriendlyDate] = useState('');
  const [searching, setSearching] = useState(false);

  const [horizon, setHorizon] = useState<number>(12);

  const load = useCallback(async () => {
    setError(null);
    const [s, f, p, fr, c, an] = await Promise.allSettled([
      economyApi.get(),
      economyApi.forecast(horizon),
      friendliesApi.preseason(),
      friendliesApi.list(),
      clubApi.get(),
      economyApi.analysis(), // B17 · aditivo: si falla, el resto de la página sigue
    ]);
    if (s.status === 'fulfilled') setSnap(s.value);
    else setError(s.reason instanceof Error ? s.reason.message : t('gameplay:economy.errors.loadFailed'));
    if (f.status === 'fulfilled') setForecast(f.value);
    if (an.status === 'fulfilled') setAnalysis(an.value);
    if (p.status === 'fulfilled') setPreseason(p.value);
    if (fr.status === 'fulfilled') setFriendlies(asArray(fr.value));
    if (c.status === 'fulfilled') setClub(c.value);
    setLoading(false);
  }, [horizon, t]);

  useEffect(() => { void load(); }, [load]);

  const run = useCallback(async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:economy.errors.operationFailed'));
    } finally {
      setBusy(false);
    }
  }, [load, t]);

  const searchOpponents = useCallback(async () => {
    if (!oppQuery.trim()) return;
    setSearching(true);
    try {
      const res = await worldApi.clubs({ q: oppQuery.trim(), take: 8 });
      const list = asArray<any>((res as any)?.clubs ?? res)
        .filter((c) => c && c.id !== myClubId)
        .map((c) => ({ id: c.id ?? c.clubId, name: c.name, shortName: c.shortName, country: c.country }))
        .filter((c) => Number.isFinite(c.id));
      setOppResults(list);
      if (list.length === 0) toast(t('gameplay:economy.toasts.noSearchResults'), { icon: '🔍' });
    } catch (e) {
      setOppResults([]);
      toast.error(e instanceof Error ? e.message : t('gameplay:economy.errors.searchFailed'));
    } finally {
      setSearching(false);
    }
  }, [oppQuery, myClubId, t]);

  // ── derivados ────────────────────────────────────────────────
  const income = snap?.monthlyIncome ?? {};
  const expenses = snap?.monthlyExpenses ?? {};
  const sponsors: any[] = asArray<any>(snap?.sponsors).filter((s) => s?.isActive);
  const outsourcings: any[] = asArray<any>(snap?.outsourcings);

  const activeTypes = useMemo(() => new Set(outsourcings.filter((o) => o.active).map((o) => o.type)), [outsourcings]);
  const attendanceCap = !activeTypes.has('security') ? 5000 : !activeTypes.has('maintenance') ? 10000 : null;

  const forecastRows: ForecastMonth[] = useMemo(() => asArray<any>(forecast?.months).map((m) => ({
    label: `${MONTH_SHORT[((m.month ?? 1) - 1) % 12]} ${String(m.year ?? '').slice(2)}`,
    gate: money(m.gate),
    commercial: money(m.commercial),
    salaries: money(m.salaries),
    outsourcing: money(m.outsourcing),
    net: money(m.net),
    budgetAfter: money(m.budgetAfter),
  })), [forecast]);





  const ticketLevel: string = club?.ticketPriceLevel ?? 'medium';
  const countryLevel: number = club?.countryLevel ?? 1;

  const preseasonWindow = preseason
    ? `${new Date(preseason.preseasonStart).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${new Date(preseason.preseasonEnd).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
    : t('gameplay:economy.preseason.defaultWindow');

  // ── estados de carga / error ─────────────────────────────────
  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={40} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={104} />)}
        </div>
        <Skeleton height={34} />
        <Skeleton height={300} />
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="page-surface">
        <EmptyState
          icon={<AlertTriangle size={34} />}
          title={t('gameplay:economy.unavailable')}
          hint={error ?? t('gameplay:economy.unavailableHint')}
          action={<Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>{t('gameplay:economy.retry')}</Button>}
        />
      </div>
    );
  }

  // ── secciones reutilizadas por las pestañas ──────────────────
  const sponsorsPanel = (
    <SectionHeader title={t('gameplay:economy.tabs.sponsors')} icon={<Tv size={14} />}>
      <p className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 12 }}>
        {t('gameplay:economy.sponsors.intro')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SPONSOR_TYPES.map((st) => {
          const active = sponsors.find((s) => s.type === st.key);
          const Icon = st.icon;
          const yrs = sponsorYears[st.key] ?? 3;
          const sponsorLabel = t(`gameplay:economy.sponsors.types.${st.key}`);
          return (
            <div key={st.key} className="ec-sp">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon size={15} style={{ color: active ? 'var(--green-primary)' : 'var(--text-muted)' }} />
                <b style={{ fontSize: '.85rem', flex: 1, fontFamily: 'var(--font-display)' }}>{sponsorLabel}</b>
                {active
                  ? <span className="ec-chip" style={{ color: 'var(--green-primary)', borderColor: 'var(--green-primary)' }}>{t('gameplay:economy.sponsors.activeChip', { months: active.monthsRemaining })}</span>
                  : <span className="ec-chip">{t('gameplay:economy.sponsors.noContract')}</span>}
              </div>
              {active ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.78rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.common.yearsCount', { years: active.years, pct: st.pct[(Math.min(3, Math.max(1, active.years)) as 1 | 2 | 3)] })}</span>
                  <b style={{ fontFamily: 'var(--font-sans)', color: 'var(--green-primary)', marginLeft: 'auto' }}>{eur(active.monthlyIncome)}{t('gameplay:economy.common.perMonth')}</b>
                  <button disabled={busy} onClick={() => setConfirmBreak(active.id)} style={{ color: 'var(--red-danger)', fontSize: '.72rem' }}>{t('gameplay:economy.sponsorBreakBtn')}</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {([1, 2, 3] as const).map((y) => (
                    <button key={y} className="ec-yr" data-on={yrs === y ? '1' : '0'} onClick={() => setSponsorYears((p) => ({ ...p, [st.key]: y }))}>
                      {t('gameplay:economy.common.yearsShort', { years: y, pct: st.pct[y] })}
                    </button>
                  ))}
                  <Button
                    size="sm"
                    disabled={busy}
                    className="ml-auto"
                    onClick={() => run(
                      () => economyApi.signSponsor(st.key, yrs),
                      t('gameplay:economy.toasts.sponsorSigned', { name: sponsorLabel.toLowerCase(), years: yrs }),
                    )}
                  >
                    {t('gameplay:economy.common.sign')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionHeader>
  );

  const outsourcingPanel = (
    <SectionHeader
      title={t('gameplay:economy.tabs.outsourcing')}
      icon={<Building2 size={14} />}
      actions={attendanceCap != null
        ? <span className="ec-chip" style={{ color: 'var(--red-danger)', borderColor: 'var(--red-danger)' }}>{t('gameplay:economy.outsourcing.capacityCapped', { cap: attendanceCap.toLocaleString('es-ES') })}</span>
        : <span className="ec-chip" style={{ color: 'var(--green-primary)', borderColor: 'var(--green-primary)' }}>{t('gameplay:economy.outsourcing.capacityFull')}</span>}
    >
      <p className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
        {t('gameplay:economy.outsourcing.intro')}
      </p>
      {OUTSOURCING_ORDER.map((key) => {
        const meta = OUTSOURCING_META[key];
        const rec = outsourcings.find((o) => o.type === key);
        const isOn = rec?.active ?? false;
        return (
          <div key={key} className="ec-out interactive-row" style={{ opacity: isOn ? 1 : 0.65 }}>
            <span className="ec-dot" style={{ background: isOn ? 'var(--green-primary)' : 'var(--text-muted)', boxShadow: isOn ? '0 0 6px color-mix(in srgb,var(--green-primary) 60%,transparent)' : 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '.8rem', fontWeight: 600 }}>
                {t(`gameplay:economy.outsourcing.types.${key}.name`)}
                {meta.gate != null && <span className="ec-chip" style={{ marginLeft: 6 }}>{t('gameplay:economy.common.gateAbove', { count: meta.gate.toLocaleString('es-ES') })}</span>}
              </p>
              <p style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t(`gameplay:economy.outsourcing.types.${key}.effect`)}</p>
            </div>
            {isOn && <span style={{ fontFamily: 'var(--font-sans)', fontSize: '.74rem', color: 'var(--text-muted)' }}>{eur(rec?.monthlyCost)}{t('gameplay:economy.common.perMonth')}</span>}
            <button
              disabled={busy}
              onClick={() => setConfirmOutsourcing({ key, hire: !isOn })}
              className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium transition-all')}
              style={{
                background: isOn ? 'color-mix(in srgb,var(--red-danger) 18%,transparent)' : 'color-mix(in srgb,var(--green-primary) 18%,transparent)',
                color: isOn ? 'var(--red-danger)' : 'var(--green-primary)',
              }}
            >
              {isOn ? t('gameplay:economy.common.cancel') : t('gameplay:economy.outsourcing.hire')}
            </button>
          </div>
        );
      })}
    </SectionHeader>
  );

  const ticketsPanel = (
    <SectionHeader title={t('gameplay:economy.tickets.title')} icon={<Ticket size={14} />}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="ec-tk-grid">
        <div>
          <p className="muted-label" style={{ marginBottom: 8 }}>{t('gameplay:economy.tickets.monthlyBreakdown')}</p>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.gate')}</span><b>{eur(income.gate)}</b></div>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.tv')}</span><b>{eur(income.tv)}</b></div>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.sponsorship')}</span><b>{eur(income.sponsorship)}</b></div>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.merch')}</span><b>{eur(income.merch)}</b></div>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.salaries')}</span><b style={{ color: 'var(--red-danger)' }}>−{eur(expenses.salaries)}</b></div>
          <div className="ec-row"><span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.tickets.outsourcing')}</span><b style={{ color: 'var(--red-danger)' }}>−{eur(expenses.outsourcing)}</b></div>
        </div>
        <div>
          <p className="muted-label" style={{ marginBottom: 8 }}>
            {t('gameplay:economy.tickets.priceTitle')}{' '}
            <span style={{ fontWeight: 400, textTransform: 'none' }}>{t('gameplay:economy.tickets.countryLevel', { level: countryLevel })}</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TICKET_LEVELS.map((lv) => {
              const active = ticketLevel === lv.key;
              const levelLabel = t(`gameplay:economy.tickets.levels.${lv.key}.label`);
              return (
                <button
                  key={lv.key}
                  disabled={busy}
                  onClick={() => run(
                    () => economyApi.updateTicketPrices(lv.key),
                    t('gameplay:economy.toasts.ticketPriceUpdated', { level: levelLabel }),
                  )}
                  className={cn('py-2 px-3 text-xs font-bold rounded-lg border transition-all text-left')}
                  style={{
                    background: active ? 'color-mix(in srgb,var(--green-primary) 16%,transparent)' : 'var(--bg-elevated)',
                    borderColor: active ? 'var(--green-primary)' : 'var(--border-color)',
                    color: active ? 'var(--green-primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                  }}
                >
                  {t('gameplay:economy.tickets.priceOption', { label: levelLabel, price: lv.mult * countryLevel })}
                  <span style={{ fontWeight: 400, fontSize: '.64rem', display: 'block', marginTop: 2 }}>{t(`gameplay:economy.tickets.levels.${lv.key}.note`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SectionHeader>
  );

  const preseasonPanel = (
    <SectionHeader
      title={t('gameplay:economy.preseason.title')}
      icon={<Sun size={14} />}
      actions={preseason?.isPreseasonActive
        ? <span className="ec-chip" style={{ color: 'var(--green-primary)', borderColor: 'var(--green-primary)' }}>{t('gameplay:economy.preseason.windowOpen')}</span>
        : <span className="ec-chip">{t('gameplay:economy.preseason.windowClosed', { window: preseasonWindow.toUpperCase() })}</span>}
    >
      <p className="text-xs" style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
        {t('gameplay:economy.preseason.intro')}
        {preseason && t('gameplay:economy.preseason.friendliesUsed', { used: preseason.usedFriendlies, max: preseason.maxFriendlies })}
      </p>

      {friendlies.length > 0 && friendlies.map((f) => {
        const isHome = f.clubAId === myClubId;
        const rival = isHome ? f.clubB : f.clubA;
        const rivalId = isHome ? f.clubBId : f.clubAId;
        const myIncome = isHome ? f.incomeA : f.incomeB;
        return (
          <div key={f.id} className="ec-fr interactive-row">
            <Plane size={13} style={{ color: 'var(--text-muted)', flex: 'none' }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t('gameplay:economy.common.vs')}{' '}
              <b><ClubLink id={rivalId} name={rival?.name ?? t('gameplay:economy.common.clubFallback', { id: rivalId })} /></b>
              <span style={{ color: 'var(--text-muted)' }}> · {new Date(f.dateTurn).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · {isHome ? t('gameplay:economy.common.home') : t('gameplay:economy.common.away')}</span>
            </span>
            {f.result
              ? <span className="ec-chip">{f.result}</span>
              : <>
                  <b style={{ fontFamily: 'var(--font-sans)', fontSize: '.78rem', color: 'var(--green-primary)' }}>+{eur(myIncome)}</b>
                  <button
                    disabled={busy}
                    onClick={() => run(() => friendliesApi.cancel(f.id), t('gameplay:economy.toasts.friendlyCancelled'))}
                    style={{ color: 'var(--red-danger)', fontSize: '.7rem' }}
                  >{t('gameplay:economy.common.cancel')}</button>
                </>}
          </div>
        );
      })}
      {friendlies.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--text-muted)', padding: '6px 0' }}>{t('gameplay:economy.preseason.noFriendlies')}</p>
      )}

      {/* Crear amistoso */}
      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 12 }}>
        <p className="muted-label" style={{ marginBottom: 8 }}>{t('gameplay:economy.preseason.scheduleFriendly')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ flex: '2 1 220px', position: 'relative' }}>
            <input
              className="ec-input"
              placeholder={t('gameplay:economy.preseason.searchPlaceholder')}
              value={oppSelected ? oppSelected.name : oppQuery}
              onChange={(e) => { setOppSelected(null); setOppQuery(e.target.value); }}
              onKeyDown={(e) => { if (e.key === 'Enter') void searchOpponents(); }}
              aria-label={t('gameplay:economy.preseason.searchAria')}
            />
            {!oppSelected && oppResults.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {oppResults.map((c) => (
                  <div key={c.id} className="ec-opp" onClick={() => { setOppSelected(c); setOppResults([]); }}>
                    <ShieldCheck size={13} style={{ color: 'var(--green-primary)' }} />
                    <span style={{ flex: 1 }}>{c.name}</span>
                    {c.country && <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{c.country}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <input
            type="date"
            className="ec-input"
            style={{ flex: '1 1 140px' }}
            value={friendlyDate}
            onChange={(e) => setFriendlyDate(e.target.value)}
            aria-label={t('gameplay:economy.preseason.dateAria')}
          />
          {!oppSelected ? (
            <Button variant="secondary" size="sm" disabled={busy || searching || !oppQuery.trim()} onClick={() => void searchOpponents()}>
              {searching ? <Loader2 size={14} className="animate-spin" /> : t('gameplay:economy.common.search')}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy || !friendlyDate}
              onClick={() => run(
                () => friendliesApi.create(oppSelected.id, `${friendlyDate}T12:00:00.000Z`),
                t('gameplay:economy.toasts.friendlyScheduled'),
              ).then(() => { setOppSelected(null); setOppQuery(''); setFriendlyDate(''); })}
            >
              {t('gameplay:economy.common.schedule')}
            </Button>
          )}
        </div>
        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
          {t('gameplay:economy.preseason.scheduleHint', { window: preseasonWindow, max: preseason?.maxFriendlies ?? 7 })}
        </p>
      </div>
    </SectionHeader>
  );

  // ── B17 · tab ANÁLISIS (GET /api/economy/analysis) ───────────
  const aSum = analysis?.summary;
  const valuationHistory: ValuationRow[] = asArray<ValuationRow>(analysis?.valuationHistory);
  const compIncome: CompetitionIncomeRow[] = asArray<CompetitionIncomeRow>(analysis?.competitionIncome);
  const variations: VariationRow[] = asArray<VariationRow>(analysis?.topMonthlyVariations);
  const leagueCmp = analysis?.leagueComparison ?? null;
  const ecPeers: any[] = asArray<any>(leagueCmp?.peers);
  const riskMeta = RISK_META[aSum?.salaryRisk ?? 'healthy'] ?? RISK_META.healthy;

  const peerCols: SortCol<any>[] = [
    {
      key: 'club', header: t('gameplay:economy.analysis.columns.club'), render: (r) => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ClubBadge id={r.club?.id} name={r.club?.name ?? r.club?.shortName} size={20} />
          <span style={{ fontWeight: r.club?.id === myClubId ? 700 : 500 }}>{r.club?.shortName ?? r.club?.name}</span>
          {r.club?.id === myClubId && <span className="ec-chip" style={{ color: 'var(--green-primary)', borderColor: 'var(--green-primary)' }}>{t('gameplay:economy.common.you')}</span>}
        </span>
      ), sortValue: (r) => r.club?.shortName ?? r.club?.name ?? '',
    },
    { key: 'valuation', header: t('gameplay:economy.analysis.columns.valuation'), align: 'right', render: (r) => <b style={{ fontFamily: 'var(--font-sans)', color: 'var(--gold-accent)' }}>{eur(r.valuation)}</b>, sortValue: (r) => r.valuation ?? 0 },
    { key: 'budget', header: t('gameplay:economy.analysis.columns.budget'), align: 'right', render: (r) => <span style={{ fontFamily: 'var(--font-sans)' }}>{eur(r.budget)}</span>, sortValue: (r) => r.budget ?? 0 },
    { key: 'salaryMassMonthly', header: t('gameplay:economy.analysis.columns.salaryMass'), align: 'right', render: (r) => <span style={{ fontFamily: 'var(--font-sans)' }}>{eur(r.salaryMassMonthly)}</span>, sortValue: (r) => r.salaryMassMonthly ?? 0 },
  ];

  const analysisPanel = !analysis ? (
    <EmptyState
      icon={<BarChart3 size={28} />}
      title={t('gameplay:economy.analysis.unavailable')}
      hint={t('gameplay:economy.analysis.unavailableHint')}
      action={<Button variant="secondary" size="sm" onClick={() => void load()}>{t('gameplay:economy.retry')}</Button>}
    />
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="ec-grid2">
        <div className="ec-col">
          <SectionHeader
            title={t('gameplay:economy.analysis.salaryRatioTitle')}
            icon={<BarChart3 size={14} />}
            actions={<span className="ec-chip" style={{ color: riskMeta.color, borderColor: riskMeta.color }}>{riskMeta.label}</span>}
          >
            <SalaryRatioGauge ratioPct={aSum?.salaryRatioPct ?? 0} risk={aSum?.salaryRisk ?? 'healthy'} />
            <div className="ec-row" style={{ marginTop: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.analysis.monthlySalaryMass')}</span>
              <b>{eur(aSum?.salaryMassMonthly)}</b>
            </div>
            <div className="ec-row">
              <span style={{ color: 'var(--text-muted)' }}>{t('gameplay:economy.analysis.monthlyBalance')}</span>
              <b style={{ color: (aSum?.netMonthly ?? 0) >= 0 ? 'var(--green-primary)' : 'var(--red-danger)' }}>
                {(aSum?.netMonthly ?? 0) >= 0 ? '+' : ''}{eur(aSum?.netMonthly)}
              </b>
            </div>
          </SectionHeader>

          <SectionHeader title={t('gameplay:economy.analysis.valuationEvolution')} icon={<Star size={14} />}>
            <ValuationEvolution rows={valuationHistory} />
          </SectionHeader>
        </div>

        <div className="ec-col">
          <SectionHeader title={t('gameplay:economy.analysis.competitionIncome')} icon={<Layers size={14} />}>
            <CompetitionIncomePanel rows={compIncome} />
          </SectionHeader>

          <SectionHeader title={t('gameplay:economy.analysis.topVariations')} icon={<TrendingUp size={14} />}>
            <TopVariations rows={variations} />
          </SectionHeader>
        </div>
      </div>

      {leagueCmp && (
        <SectionHeader
          title={t('gameplay:economy.analysis.comparisonTitle', { name: leagueCmp.competition?.name ?? t('gameplay:economy.analysis.leagueFallback') })}
          icon={<BarChart3 size={14} />}
          actions={leagueCmp.rankings && (
            <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
              {leagueCmp.rankings.valuation != null && <span className="ec-chip">{t('gameplay:economy.analysis.rankValuation', { rank: leagueCmp.rankings.valuation })}</span>}
              {leagueCmp.rankings.budget != null && <span className="ec-chip">{t('gameplay:economy.analysis.rankBudget', { rank: leagueCmp.rankings.budget })}</span>}
              {leagueCmp.rankings.salaryMassMonthly != null && <span className="ec-chip">{t('gameplay:economy.analysis.rankSalary', { rank: leagueCmp.rankings.salaryMassMonthly })}</span>}
            </span>
          )}
        >
          <div className="ec-peer-wrap">
            <SortableTable
              columns={peerCols}
              data={ecPeers}
              rowKey={(r: any) => r.club?.id ?? r.club?.shortName ?? r.club?.name ?? 'club'}
              initialSort={{ key: 'valuation', dir: 'desc' }}
              rowClassName={(r: any) => r.club?.id === myClubId ? 'row-highlight' : undefined}
            />
          </div>
          {leagueCmp.averages && (
            <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', marginTop: 8 }}>
              {t('gameplay:economy.analysis.leagueAverage', {
                valuation: eur(leagueCmp.averages.valuation),
                budget: eur(leagueCmp.averages.budget),
                salary: eur(leagueCmp.averages.salaryMassMonthly),
              })}
            </p>
          )}
        </SectionHeader>
      )}
    </div>
  );

  return (
    <div className="bg-[var(--bg-base)] text-[var(--text-primary)] font-sans min-h-screen" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .ec-sp{border:1px solid var(--border-color);border-radius:0.75rem;padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:var(--bg-elevated);box-shadow:0 2px 8px rgba(0,0,0,0.02)}
        .ec-yr{font-family:var(--font-sans);font-size:.72rem;padding:3px 9px;border-radius:3px;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-muted);cursor:pointer}
        .ec-yr:hover{border-color:var(--text-muted);color:var(--text-primary)}
        .ec-out{display:flex;align-items:center;gap:10px;padding:8px 6px;border-top:1px solid var(--border-color)}
        .ec-out strong{font-family:var(--font-display);font-size:1.1rem;color:var(--text-primary)}
        .ec-fr{display:flex;align-items:center;gap:10px;padding:8px 6px;border-top:1px solid var(--border-color);font-size:.82rem}
        .ec-opp{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border-color);border-radius:0.5rem;cursor:pointer;font-size:.8rem;background:var(--bg-elevated)}
        .ec-opp:hover{background:var(--bg-surface)}
        .ec-input{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:0.5rem;color:var(--text-primary);font-size:.82rem;padding:7px 10px;width:100%;font-family:var(--font-sans);box-shadow:inset 0 1px 3px rgba(0,0,0,0.05)}
        .ec-wage-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border-color);font-size:.78rem}
        .ec-chip{font-size:.64rem;font-family:var(--font-sans);padding:2px 7px;border-radius:3px;border:1px solid var(--border-color);letter-spacing:.4px}
      `}</style>

      <div>
        <NarrativePageHeader
          kicker={t('gameplay:economy.kicker')}
          title={t('gameplay:economy.title')}
          lede={t('gameplay:economy.lede')}
        />
      </div>

      <Tabs
        tabs={[
          { id: 'resumen', label: t('gameplay:economy.tabs.summary') },
          { id: 'sponsors', label: t('gameplay:economy.tabs.sponsors'), count: sponsors.length || undefined },
          { id: 'outsourcing', label: t('gameplay:economy.tabs.outsourcing'), count: outsourcings.filter((o) => o.active).length || undefined },
          { id: 'analisis', label: t('gameplay:economy.tabs.analysis') },
          { id: 'tickets', label: t('gameplay:economy.tabs.tickets') },
          { id: 'preseason', label: t('gameplay:economy.tabs.preseason'), count: friendlies.length || undefined },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as EcTab)}
      />

      {tab === 'resumen' && (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            
            <div className="premium-card">
              <div className="premium-title"><Wallet size={18} className="text-[var(--text-primary)]"/> {t('gameplay:economy.summary.cashAvailable')}</div>
              <div className="premium-value">{eur(snap.budget)}</div>
              <div className="premium-sub">{t('gameplay:economy.summary.immobilizedMargin', { amount: eur(snap.managerWealth) })}</div>
            </div>

            {/* Previsión de gastos a 30 días */}
            <div className="premium-card">
              <div className="premium-title"><TrendingDown size={18} className="text-[var(--red-danger)]"/> {t('gameplay:economy.summary.expenseForecast30')}</div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.squadSalaries')}</span>
                <span className="font-bold text-[var(--red-danger)]">−{eur(expenses.salaries)}</span>
              </div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.outsourcingServices')}</span>
                <span className="font-bold text-[var(--red-danger)]">−{eur(expenses.outsourcing)}</span>
              </div>
              <div className="premium-row mt-2 pt-4 border-t border-[var(--border-color)]">
                <span className="text-[var(--text-primary)] font-bold">{t('gameplay:economy.summary.estimatedTotal')}</span>
                <span className="font-bold text-[var(--red-danger)]">−{eur(expenses.total)}</span>
              </div>
            </div>

            {/* Previsión de ingresos a 30 días */}
            <div className="premium-card">
              <div className="premium-title"><TrendingUp size={18} className="text-[var(--green-primary)]"/> {t('gameplay:economy.summary.incomeForecast30')}</div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.estimatedGate')}</span>
                <span className="font-bold text-[var(--green-primary)]">+{eur(income.gate)}</span>
              </div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.tickets.tv')}</span>
                <span className="font-bold text-[var(--green-primary)]">+{eur(income.tv)}</span>
              </div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.sponsorships')}</span>
                <span className="font-bold text-[var(--green-primary)]">+{eur(income.sponsorship)}</span>
              </div>
              <div className="premium-row">
                <span className="text-[var(--text-muted)]">{t('gameplay:economy.tickets.merch')}</span>
                <span className="font-bold text-[var(--green-primary)]">+{eur(income.merch)}</span>
              </div>
              <div className="premium-row mt-2 pt-4 border-t border-[var(--border-color)]">
                <span className="text-[var(--text-primary)] font-bold">{t('gameplay:economy.summary.estimatedTotal')}</span>
                <span className="font-bold text-[var(--green-primary)]">+{eur(income.total)}</span>
              </div>
            </div>

            {/* Previsión a 12 meses */}
            <div className="premium-card">
              <div className="premium-title">
                <Layers size={18} className="text-[var(--blue-info)]"/> {t('gameplay:economy.summary.forecast12m')}
                <select 
                  value={horizon} 
                  onChange={(e) => setHorizon(Number(e.target.value))}
                  className="ml-auto bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--text-primary)] text-xs rounded px-2 py-1"
                >
                  <option value={12}>{t('gameplay:economy.summary.months12')}</option>
                  <option value={24}>{t('gameplay:economy.summary.months24')}</option>
                  <option value={36}>{t('gameplay:economy.summary.months36')}</option>
                </select>
              </div>
              <div className="h-[280px] mt-4">
                {forecastRows.length > 0 ? (
                  <IncomeExpenseArea data={forecastRows} />
                ) : (
                  <div className="flex items-center justify-center h-full text-[var(--text-muted)] text-sm">{t('gameplay:economy.summary.noForecast')}</div>
                )}
              </div>
            </div>

          </div>

          {/* Right Column */}
          <div className="flex flex-col gap-6 min-w-0">
            
            {/* Listado de movimientos de caja */}
            <div className="premium-card">
              <div className="premium-title"><BarChart3 size={18} className="text-[var(--text-muted)]"/> {t('gameplay:economy.summary.cashMovements')}</div>
              <div className="flex flex-col">
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.incomeGate')}</span><span className="font-bold text-[var(--green-primary)]">+{eur(income.gate)}</span></div>
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.incomeTv')}</span><span className="font-bold text-[var(--green-primary)]">+{eur(income.tv)}</span></div>
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.incomeSponsorship')}</span><span className="font-bold text-[var(--green-primary)]">+{eur(income.sponsorship)}</span></div>
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.incomeMerch')}</span><span className="font-bold text-[var(--green-primary)]">+{eur(income.merch)}</span></div>
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.paySalaries')}</span><span className="font-bold text-[var(--red-danger)]">−{eur(expenses.salaries)}</span></div>
                <div className="premium-row"><span className="text-[var(--text-muted)]">{t('gameplay:economy.summary.payOutsourcing')}</span><span className="font-bold text-[var(--red-danger)]">−{eur(expenses.outsourcing)}</span></div>
                <div className="premium-row mt-2 pt-4 border-t border-[var(--border-color)]">
                  <span className="text-[var(--text-primary)] font-bold">{t('gameplay:economy.summary.netMonthlyBalance')}</span>
                  <span className={(snap.netMonthly ?? 0) >= 0 ? "font-bold text-[var(--green-primary)]" : "font-bold text-[var(--red-danger)]"}>
                    {(snap.netMonthly ?? 0) >= 0 ? '+' : ''}{eur(snap.netMonthly)}
                  </span>
                </div>
              </div>
            </div>

            {/* Valor del club */}
            <div className="premium-card">
              <div className="premium-title"><Star size={18} className="text-yellow-500"/> {t('gameplay:economy.summary.clubValue')}</div>
              <div className="premium-value text-yellow-500">{eur(snap.valuation)}</div>
              <div className="premium-sub">{t('gameplay:economy.summary.shareholders')}</div>
            </div>

            {/* Evolución del efectivo */}
            <div className="premium-card">
              <div className="premium-title"><TrendingUp size={18}/> {t('gameplay:economy.summary.cashEvolution')}</div>
              <div className="h-[280px] mt-4">
                {forecastRows.length > 0 ? (
                  <CashProjection data={forecastRows} />
                ) : (
                  <div className="flex items-center justify-center h-full text-[#888] text-sm">{t('gameplay:economy.summary.noForecast')}</div>
                )}
              </div>
            </div>

          </div>
        </div>
        <div className="mt-6">
          <GlobalEconomicDistribution />
        </div>
        </>
      )}

      {tab === 'analisis' && analysisPanel}
      {tab === 'sponsors' && sponsorsPanel}
      {tab === 'outsourcing' && outsourcingPanel}
      {tab === 'tickets' && ticketsPanel}
      {tab === 'preseason' && preseasonPanel}

      <ConfirmModal
        open={confirmBreak != null}
        onClose={() => setConfirmBreak(null)}
        onConfirm={async () => {
          const id = confirmBreak;
          setConfirmBreak(null);
          if (id != null) await run(() => economyApi.breakSponsor(id), t('gameplay:economy.toasts.sponsorBroken'));
        }}
        title={t('gameplay:economy.sponsorBreakTitle')}
        confirmText={t('gameplay:economy.sponsorBreakAction')}
        isDestructive
        isSubmitting={busy}
      >
        <p>{t('gameplay:economy.sponsorBreakConfirm')}</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmOutsourcing != null}
        onClose={() => setConfirmOutsourcing(null)}
        onConfirm={async () => {
          const target = confirmOutsourcing;
          setConfirmOutsourcing(null);
          if (!target) return;
          const outsourcingName = t(`gameplay:economy.outsourcing.types.${target.key}.name`);
          await run(
            () => economyApi.updateSubcontracts({ [target.key]: target.hire ? 1 : 0 }),
            t('gameplay:economy.toasts.outsourcingStatus', {
              name: outsourcingName,
              status: target.hire ? t('gameplay:economy.toasts.outsourcingHired') : t('gameplay:economy.toasts.outsourcingCancelled'),
            }),
          );
        }}
        title={confirmOutsourcing?.hire ? t('gameplay:economy.outsourcingHireTitle') : t('gameplay:economy.outsourcingCancelTitle')}
        confirmText={confirmOutsourcing?.hire ? t('gameplay:economy.outsourcingHireAction') : t('gameplay:economy.outsourcingCancelAction')}
        isDestructive={!confirmOutsourcing?.hire}
        isSubmitting={busy}
      >
        {confirmOutsourcing && (
          <p>
            {confirmOutsourcing.hire
              ? t('gameplay:economy.outsourcingHireBody', { name: t(`gameplay:economy.outsourcing.types.${confirmOutsourcing.key}.name`), cost: eur(outsourcings.find((o) => o.type === confirmOutsourcing.key)?.monthlyCost) })
              : t('gameplay:economy.outsourcingCancelBody', { name: t(`gameplay:economy.outsourcing.types.${confirmOutsourcing.key}.name`) })}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}
