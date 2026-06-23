// ─── #9 · Mercado completo (AUD-4) ─────────────────────────────────────────────
// Pestañas: Buscar (listings con oferta multi-apartado FDF) · Libres (fichaje
// directo con términos) · En venta (listings propios y ajenos) · Cesiones ·
// Mis ofertas (retirar). Cabecera fija: ventana de fichajes + tope salarial 15%.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Search, Star, KeyRound, Handshake, Trash2, Radio } from 'lucide-react';
import toast from 'react-hot-toast';
import { marketApi, playersApi, worldApi, clubApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { asArray } from '../lib/normalize';
import { eur } from '../lib/format';
import { normalizeOffer, type NormalizedOffer } from '../lib/offersLogic';
import { Button, Modal, PlayerCard, Skeleton, StatBar, Tabs, EmptyState, PosBadge, SortableTable, NarrativePageHeader, ConfirmModal, type SortCol, type PlayerCardData } from '../components/ui';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';
import { PlayerLink, ClubLink } from '../components/common/EntityLink';
import { OfferPanel } from '../components/market/OfferPanel';
import { DeadlineDayPanel } from '../components/market/DeadlineDayPanel';

interface MarketPlayer {
  id: number;
  name?: string; firstName?: string; lastName?: string;
  position?: string; preferredPosition?: string; age?: number; overall?: number; potential?: number; marketValue?: number;
  wage?: number;
  club?: { id?: number; name?: string; badge?: string }; clubName?: string;
  nationality?: string;
  passing?: number; tackling?: number; shooting?: number; organization?: number;
  unmarking?: number; finishing?: number; dribbling?: number; fouls?: number; goalkeeping?: number;
}
interface Filters {
  position: string; ageMin: string; ageMax: string; valueMax: string; potentialMin: string; potentialMax: string;
  country: string; clubId: string;
  minPassing: string; minTackling: string; minShooting: string;
  minOrganization: string; minUnmarking: string; minFinishing: string;
  minDribbling: string; minGoalkeeping: string; minOverall: string;
}
const POSITIONS = ['', 'POR', 'DEF', 'MED', 'DEL'];
// A2 · tono CSS por estado normalizado de offersLogic (label/tone/acciones vienen de la lib).
const OFFER_TONE_VAR: Record<NormalizedOffer['tone'], string> = {
  info: 'var(--gold-accent)',
  success: 'var(--green-primary)',
  warning: 'var(--gold-accent)',
  danger: 'var(--red-danger)',
  muted: 'var(--text-muted)',
};
const fullName = (p: MarketPlayer) => (p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) || 'Jugador';

function toCard(p: MarketPlayer): PlayerCardData {
  return { name: fullName(p), position: p.position, preferredPosition: p.preferredPosition, age: p.age, overall: p.overall, potential: p.potential, marketValue: p.marketValue, clubName: p.club?.name ?? p.clubName };
}
function toDossier(p: MarketPlayer): DossierPlayer {
  return { name: fullName(p), position: p.position, age: p.age, potential: p.potential ?? p.overall, nationality: p.nationality, marketValue: p.marketValue, wage: p.wage,
    passing: p.passing, tackling: p.tackling, shooting: p.shooting, organization: p.organization, unmarking: p.unmarking, finishing: p.finishing, dribbling: p.dribbling, fouls: p.fouls, goalkeeping: p.goalkeeping };
}

export function MarketPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const { club } = useSession();
  const [tab, setTab] = useState('buscar');
  const [filters, setFilters] = useState<Filters>({
    position: '', ageMin: '', ageMax: '', valueMax: '', potentialMin: '', potentialMax: '', country: '', clubId: '',
    minPassing: '', minTackling: '', minShooting: '', minOrganization: '', minUnmarking: '', minFinishing: '', minDribbling: '', minGoalkeeping: '', minOverall: ''
  });
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [players, setPlayers] = useState<MarketPlayer[]>([]);
  const [shortlist, setShortlist] = useState<Set<number>>(new Set());
  const [offers, setOffers] = useState<any[]>([]);
  const [rumors, setRumors] = useState<any[]>([]);
  const [rivalWeek, setRivalWeek] = useState<{ rival?: { id: number; name: string; shortName?: string } } | null>(null);
  const [activeSabotage, setActiveSabotage] = useState<{ id: number; headline: string }[]>([]);
  const [sabotageLoading, setSabotageLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketPlayer | null>(null);
  const [confirmClause, setConfirmClause] = useState(false);
  const [clausePaying, setClausePaying] = useState(false);

  // Cabecera: ventana + tope salarial + limites de plantilla
  const [windowInfo, setWindowInfo] = useState<any | null>(null);
  const [cap, setCap] = useState<any | null>(null);
  const [limits, setLimits] = useState<any | null>(null);

  // Pestañas perezosas
  const [freeAgents, setFreeAgents] = useState<MarketPlayer[] | null>(null);
  const [listings, setListings] = useState<any[] | null>(null);
  const [squad, setSquad] = useState<any[] | null>(null);

  // Cláusula del jugador del modal
  const [clause, setClause] = useState<any | null>(null);

  // Cesión: jugador elegido + búsqueda de club destino
  const [loanPlayer, setLoanPlayer] = useState<any | null>(null);
  const [loanQuery, setLoanQuery] = useState('');
  const [loanClubs, setLoanClubs] = useState<any[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState<number | null>(null);
  const [confirmRemoveListing, setConfirmRemoveListing] = useState<number | null>(null);
  const [confirmSabotage, setConfirmSabotage] = useState(false);
  const [confirmLoan, setConfirmLoan] = useState<{ player: any; club: any } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    const f: any = { page, limit: 20 };
    if (filters.position) f.position = filters.position;
    if (filters.ageMin) f.ageMin = Number(filters.ageMin);
    if (filters.ageMax) f.ageMax = Number(filters.ageMax);
    if (filters.valueMax) f.valueMax = Number(filters.valueMax);
    if (filters.potentialMin) f.potentialMin = Number(filters.potentialMin);
    if (filters.potentialMax) f.potentialMax = Number(filters.potentialMax);
    if (filters.country) f.country = filters.country;
    if (filters.clubId) f.clubId = Number(filters.clubId);
    if (filters.minPassing) f.minPassing = Number(filters.minPassing);
    if (filters.minTackling) f.minTackling = Number(filters.minTackling);
    if (filters.minShooting) f.minShooting = Number(filters.minShooting);
    if (filters.minOrganization) f.minOrganization = Number(filters.minOrganization);
    if (filters.minUnmarking) f.minUnmarking = Number(filters.minUnmarking);
    if (filters.minFinishing) f.minFinishing = Number(filters.minFinishing);
    if (filters.minDribbling) f.minDribbling = Number(filters.minDribbling);
    if (filters.minGoalkeeping) f.minGoalkeeping = Number(filters.minGoalkeeping);
    if (filters.minOverall) f.minOverall = Number(filters.minOverall);
    if (sort) { f.sortBy = sort.key; f.sortDir = sort.dir; }

    const [list, sl, my] = await Promise.allSettled([marketApi.search(f), marketApi.getShortlist(), marketApi.getMyOffers()]);
    
    if (signal?.aborted) return;

    if (list.status === 'fulfilled') {
      const resp = list.value as { data?: unknown; total?: number; totalPages?: number };
      const dataArr = asArray<Record<string, unknown>>(resp?.data ?? resp);
      const rows = dataArr.map((r) =>
        r?.player
          ? { ...(r.player as Record<string, unknown>), id: (r.player as { id?: number }).id ?? r.playerId, marketValue: (r.player as { marketValue?: number }).marketValue ?? r.price, club: (r.player as { club?: unknown }).club }
          : r,
      ).filter((p) => p && Number.isFinite((p as { id?: number }).id)) as unknown as MarketPlayer[];
      setPlayers(rows);
      setTotal(resp.total ?? rows.length);
      const tPages = Math.max(1, resp.totalPages ?? 1);
      setTotalPages(tPages);
      if (page > tPages && tPages > 0) setPage(tPages);
    } else {
      setError(t('gameplay:market.filters.loadError'));
    }
    if (sl.status === 'fulfilled') setShortlist(new Set(asArray<{ id?: number; playerId?: number }>(sl.value).map(x => x.id ?? x.playerId).filter((id): id is number => Number.isFinite(id))));
    if (my.status === 'fulfilled') setOffers(asArray(my.value));
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      load(controller.signal);
    }, 350);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [load]);

  useEffect(() => { setConfirmClause(false); }, [selected]);

  // Shortlist / deep-link: abrir modal de oferta para un jugador concreto
  useEffect(() => {
    const st = location.state as { openPlayerId?: number; tab?: string } | null;
    if (st?.tab === 'libres') setTab('libres');
    const pid = st?.openPlayerId;
    if (!pid || !Number.isFinite(pid)) return;
    let alive = true;
    playersApi.getPlayer(pid)
      .then((p) => {
        if (!alive || !p?.id) return;
        setSelected(p as MarketPlayer);
        setTab('buscar');
      })
      .catch(() => toast.error(t('gameplay:market.filters.loadError')))
      .finally(() => { window.history.replaceState({}, document.title); });
    return () => { alive = false; };
  }, [location.state, t]);

  // Ventana + tope + limites: una vez al entrar
  useEffect(() => {
    let alive = true;
    Promise.allSettled([marketApi.getWindow(), marketApi.getSalaryCap(), marketApi.squadLimits()]).then(([w, c, l]) => {
      if (!alive) return;
      if (w.status === 'fulfilled') setWindowInfo(w.value);
      if (c.status === 'fulfilled') setCap(c.value);
      if (l.status === 'fulfilled') setLimits(l.value);
    });
    return () => { alive = false; };
  }, []);

  // Carga perezosa por pestaña
  useEffect(() => {
    let alive = true;
    if (tab === 'libres' && freeAgents === null)
      marketApi.getFreeAgents().then(r => { if (alive) setFreeAgents(asArray<any>(r)); }).catch(() => { if (alive) setFreeAgents([]); });
    if (tab === 'venta' && listings === null)
      marketApi.getListings().then(r => { if (alive) setListings(asArray<any>((r as any)?.data ?? r)); }).catch(() => { if (alive) setListings([]); });
    if (tab === 'cesiones' && squad === null)
      playersApi.getSquad().then(r => { if (alive) setSquad(asArray<any>(r)); }).catch(() => { if (alive) setSquad([]); });
    if (tab === 'rumores') {
      marketApi.rumors().then(r => { if (alive) setRumors(asArray<any>(r?.rumors)); }).catch(() => { if (alive) setRumors([]); });
      clubApi.rivalWeek().then(r => { if (alive) setRivalWeek(r); }).catch(() => { if (alive) setRivalWeek(null); });
      marketApi.activeRumorSabotage().then(r => { if (alive) setActiveSabotage(asArray(r?.sabotages)); }).catch(() => { if (alive) setActiveSabotage([]); });
    }
    return () => { alive = false; };
  }, [tab, freeAgents, listings, squad]);

  // Cláusula al abrir modal (solo jugadores con club ajeno)
  useEffect(() => {
    setClause(null);
    if (!selected?.id) return;
    const ownClub = selected.club?.id != null && selected.club.id === club?.id;
    if (ownClub) return;
    let alive = true;
    marketApi.getClause(selected.id).then(c => { if (alive) setClause(c); }).catch(() => { /* sin cláusula visible */ });
    return () => { alive = false; };
  }, [selected, club?.id]);

  // Búsqueda de club destino para cesión (debounce)
  useEffect(() => {
    if (!loanPlayer || loanQuery.trim().length < 2) { setLoanClubs([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      worldApi.clubs({ q: loanQuery.trim(), take: 8 })
        .then((r: any) => {
          if (cancelled) return;
          setLoanClubs(asArray<any>(r?.clubs ?? r).filter((c: any) => c.id !== club?.id));
        })
        .catch(() => { if (!cancelled) setLoanClubs([]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [loanQuery, loanPlayer, club?.id]);

  const shown = players;

  const columns: SortCol<MarketPlayer>[] = useMemo(() => [
    { key: 'position', header: 'Pos', render: p => <PosBadge position={p.position || '?'} />, sortValue: p => p.position || '' },
    { key: 'name', header: 'Nombre', render: p => <div style={{ display: 'flex', flexDirection: 'column' }}><b>{fullName(p)}</b><small style={{ color: 'var(--text-muted)' }}>{p.nationality || '—'}</small></div>, sortValue: p => fullName(p) },
    { key: 'age', header: 'Edad', align: 'center', render: p => p.age, sortValue: p => p.age || 0 },
    { key: 'club', header: 'Club', render: p => p.club?.name || p.clubName || 'Libre' },
    { key: 'overall', header: 'Med', align: 'center', render: p => <span style={{ fontWeight: 600, color: p.overall && p.overall >= 80 ? 'var(--gold-accent)' : p.overall && p.overall >= 70 ? 'var(--green-primary)' : 'inherit' }}>{p.overall || '?'}</span>, sortValue: p => p.overall || 0 },
    { key: 'potential', header: 'Pot', align: 'center', render: p => p.potential || '?', sortValue: p => p.potential || 0 },
    { key: 'marketValue', header: 'Valor', align: 'right', render: p => eur(p.marketValue), sortValue: p => p.marketValue || 0 },
    { key: 'wage', header: 'Salario', align: 'right', render: p => eur(p.wage), sortValue: p => p.wage ?? 0 },
    { key: 'actions', header: '', align: 'right', render: p => (
      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); toggleShort(p.id); }} style={{ padding: '4px' }}>
          <Star size={14} fill={shortlist.has(p.id) ? 'var(--gold-accent)' : 'none'} color={shortlist.has(p.id) ? 'var(--gold-accent)' : 'currentColor'} />
        </Button>
        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(p); }}>{t('gameplay:market.actions.offer')}</Button>
      </div>
    )}
// eslint-disable-next-line react-hooks/exhaustive-deps
  ], [shortlist]);

  const toggleShort = async (id: number) => {
    const has = shortlist.has(id);
    setShortlist(s => { const n = new Set(s); if (has) n.delete(id); else n.add(id); return n; });
    try { if (has) await marketApi.removeShortlist(id); else await marketApi.addShortlist(id); } catch { /* optimista: el estado local ya refleja el cambio */ }
  };

  const payClause = async () => {
    if (!selected || !clause?.clause) return;
    setClausePaying(true);
    try {
      await marketApi.payClause(selected.id, clause.clause);
      toast.success(t('gameplay:market.toasts.clauseSigned', { player: fullName(selected) }));
      setSelected(null);
      setConfirmClause(false);
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo pagar la cláusula'); }
    finally { setClausePaying(false); }
  };

  const signFree = async (p: MarketPlayer, wage: number, years: number) => {
    try {
      await marketApi.signFreeAgent(p.id, { wage, contractYears: years });
      toast.success(t('gameplay:market.toasts.freeAgentSigned', { player: fullName(p), years }));
      setFreeAgents(null); setSelected(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'El jugador no acepta'); }
  };

  const doLoan = async (clubTo: any) => {
    if (!loanPlayer) return;
    try {
      await marketApi.loanPlayer(loanPlayer.id, clubTo.id);
      toast.success(t('gameplay:market.toasts.loanDone', { player: loanPlayer.name ?? 'Jugador', club: clubTo.name }));
      setLoanPlayer(null); setLoanQuery(''); setSquad(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo ceder'); }
  };

  const withdraw = async (offerId: number) => {
    try { await marketApi.withdrawOffer(offerId); setOffers(o => o.filter(x => x.id !== offerId)); toast.success(t('gameplay:market.toasts.offerWithdrawn')); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo retirar'); }
  };

  const removeListing = async (id: number) => {
    try { await marketApi.removeListing(id); setListings(l => (l ?? []).filter(x => x.id !== id)); toast.success(t('gameplay:market.toasts.listingRemoved')); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'No se pudo retirar'); }
  };

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFilters(f => ({ ...f, [k]: e.target.value }));

  const winOpen = !!windowInfo?.transferWindow;
  const loanOpen = !!windowInfo?.loanWindow;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .mk-filters{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:12px;padding:16px;box-shadow:var(--shadow-soft);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .mk-f{display:flex;flex-direction:column;gap:6px}
        .mk-f label{font-size:.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);font-weight:600;}
        .mk-f input,.mk-f select{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:8px;padding:8px 12px;color:var(--text-primary);font-size:.875rem;width:120px;transition:border-color .2s;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .mk-f input:focus,.mk-f select:focus{border-color:var(--green-primary);outline:none;}
        .mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
        .mk-pt{font-family:var(--font-display);font-weight:800;font-size:1rem;color:var(--text-primary);text-transform:uppercase;letter-spacing:-0.01em;margin:12px 0 8px}
        .mk-head{display:grid;grid-template-columns:auto 1fr;gap:20px;align-items:center;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:12px;padding:16px 20px;box-shadow:var(--shadow-soft);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .mk-win{display:flex;flex-direction:column;gap:6px;min-width:200px}
        .mk-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);font-size:.75rem;padding:4px 12px;border-radius:8px;width:fit-content;font-weight:700;}
        .mk-chip--open{background:color-mix(in srgb,var(--green-primary) 15%,transparent);color:var(--green-primary)}
        .mk-chip--closed{background:color-mix(in srgb,var(--red-danger) 15%,transparent);color:var(--red-danger)}
        .mk-cap{display:flex;flex-direction:column;gap:6px}
        .mk-cap small{font-size:.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);font-weight:600;}
        .mk-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-elevated);transition:background .2s;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        .mk-row:hover{background:var(--bg-surface);border-color:var(--green-primary);}
        .mk-row b{font-family:var(--font-sans);font-weight:700;}
        .mk-clause{display:flex;align-items:center;gap:12px;background:color-mix(in srgb,var(--gold-accent) 10%,var(--bg-elevated));border:1px solid color-mix(in srgb,var(--gold-accent) 30%,transparent);border-radius:8px;padding:14px 16px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
        @media(max-width:850px){.mk-head{grid-template-columns:1fr}}
      `}</style>

      <NarrativePageHeader
        kicker={t('gameplay:market.kicker')}
        title={t('gameplay:market.title')}
        lede={t('gameplay:market.lede')}
      />

      {/* X7 · Deadline Day: destacado arriba cuando la ventana cierra */}
      <DeadlineDayPanel />

      {/* Cabecera fija: ventana + tope salarial */}
      <div className="mk-head">
        <div className="mk-win">
          <span className={`mk-chip ${winOpen ? 'mk-chip--open' : 'mk-chip--closed'}`}>● {t('gameplay:market.window.transfer')} {winOpen ? t('gameplay:market.window.open') : t('gameplay:market.window.closed')}</span>
          <span className={`mk-chip ${loanOpen ? 'mk-chip--open' : 'mk-chip--closed'}`}>● {t('gameplay:market.window.loans')} {loanOpen ? t('gameplay:market.window.loansOpen') : t('gameplay:market.window.loansClosed')}</span>
          {!winOpen && windowInfo?.nextTransferWindow && <small style={{ color: 'var(--text-muted)', fontSize: '.68rem' }}>{windowInfo.nextTransferWindow}</small>}
        </div>
        <div className="mk-cap">
          <small>
            {t('gameplay:market.cap.summary', { used: eur(cap?.usedMonthly), cap: eur(cap?.capMonthly) })}
            {cap?.isOverCap && <> · <b style={{ color: 'var(--red-danger)' }}>{t('gameplay:market.cap.exceeded', { amount: eur(cap?.overCap) })}</b></>}
          </small>
          <StatBar value={Math.min(100, cap?.capMonthly ? (cap.usedMonthly / cap.capMonthly) * 100 : 0)} max={100}
            color={cap?.isOverCap ? 'red' : (cap?.usedMonthly ?? 0) / Math.max(1, cap?.capMonthly ?? 1) > 0.85 ? 'amber' : 'green'} />
          <small>{t('gameplay:market.cap.margin', { amount: eur(cap?.remaining) })}</small>
        </div>
        {limits && (
          <div className="mk-cap">
            <small>{t('gameplay:market.squadLimits.firstTeam', { current: limits.firstTeam, max: limits.limits.maxFirstTeamPlusIncoming })}</small>
            <StatBar value={Math.min(100, (limits.firstTeam / limits.limits.maxFirstTeamPlusIncoming) * 100)} max={100}
              color={limits.firstTeam < limits.limits.minFirstTeamAfterExit ? 'amber' : limits.firstTeam > limits.limits.maxFirstTeamPlusIncoming ? 'red' : 'green'} />
            <small>{t('gameplay:market.squadLimits.youth', { current: limits.youth, max: limits.limits.maxYouth, loanedOut: limits.loanedOut })}</small>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'buscar', label: t('gameplay:market.tabs.search') },
          { id: 'libres', label: t('gameplay:market.tabs.free'), count: freeAgents?.length },
          { id: 'venta', label: t('gameplay:market.tabs.sale'), count: listings?.length },
          { id: 'cesiones', label: t('gameplay:market.tabs.loans') },
          { id: 'ofertas', label: t('gameplay:market.tabs.offers'), count: offers.length },
          { id: 'rumores', label: t('gameplay:market.tabs.rumors'), count: rumors.length },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {/* ── BUSCAR ── */}
      {tab === 'buscar' && (
        <>
          <div className="mk-filters">
            <div className="mk-f"><label htmlFor="mk-filter-position">{t('gameplay:market.filters.position')}</label><select id="mk-filter-position" value={filters.position} onChange={set('position')}>{POSITIONS.map(p => <option key={p} value={p}>{p || t('gameplay:market.filters.allPositions')}</option>)}</select></div>
            <div className="mk-f"><label htmlFor="mk-filter-age-min">{t('gameplay:market.filters.ageMin')}</label><input id="mk-filter-age-min" type="number" value={filters.ageMin} onChange={set('ageMin')} /></div>
            <div className="mk-f"><label htmlFor="mk-filter-age-max">{t('gameplay:market.filters.ageMax')}</label><input id="mk-filter-age-max" type="number" value={filters.ageMax} onChange={set('ageMax')} /></div>
            <div className="mk-f"><label htmlFor="mk-filter-value-max">{t('gameplay:market.filters.valueMax')}</label><input id="mk-filter-value-max" type="number" value={filters.valueMax} onChange={set('valueMax')} /></div>
            <div className="mk-f"><label htmlFor="mk-filter-potential-min">{t('gameplay:market.filters.potentialMin')}</label><input id="mk-filter-potential-min" type="number" value={filters.potentialMin} onChange={set('potentialMin')} /></div>
            <Button variant="ghost" onClick={() => setShowAdvFilters(s => !s)}>{showAdvFilters ? t('gameplay:market.filters.lessFilters') : t('gameplay:market.filters.advanced')}</Button>
            <Button onClick={() => setPage(1)}><Search size={14} /> {t('gameplay:market.filters.search')}</Button>
            
            {showAdvFilters && (
              <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                <div className="mk-f"><label htmlFor="mk-filter-country">{t('gameplay:market.filters.country')}</label><input id="mk-filter-country" type="text" value={filters.country} onChange={set('country')} placeholder={t('gameplay:market.filters.countryPlaceholder')} /></div>
                <div className="mk-f"><label htmlFor="mk-filter-min-overall">{t('gameplay:market.filters.minOverall')}</label><input id="mk-filter-min-overall" type="number" value={filters.minOverall} onChange={set('minOverall')} /></div>
                <div className="mk-f"><label htmlFor="mk-filter-min-passing">{t('gameplay:market.filters.minPassing')}</label><input id="mk-filter-min-passing" type="number" value={filters.minPassing} onChange={set('minPassing')} /></div>
                <div className="mk-f"><label htmlFor="mk-filter-min-shooting">{t('gameplay:market.filters.minShooting')}</label><input id="mk-filter-min-shooting" type="number" value={filters.minShooting} onChange={set('minShooting')} /></div>
                <div className="mk-f"><label htmlFor="mk-filter-min-dribbling">{t('gameplay:market.filters.minDribbling')}</label><input id="mk-filter-min-dribbling" type="number" value={filters.minDribbling} onChange={set('minDribbling')} /></div>
                <div className="mk-f"><label htmlFor="mk-filter-min-tackling">{t('gameplay:market.filters.minTackling')}</label><input id="mk-filter-min-tackling" type="number" value={filters.minTackling} onChange={set('minTackling')} /></div>
              </div>
            )}
          </div>

          <div className="mk-pt" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{t('gameplay:market.filters.available')} {total > 0 && `(${total})`}</span>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>{t('gameplay:market.pagination.prev')}</Button>
                <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('gameplay:market.pagination.page', { page, total: totalPages })}</span>
                <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>{t('gameplay:market.pagination.next')}</Button>
              </div>
            )}
          </div>
          
          {loading ? <div className="mk-grid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={150} />)}</div> : null}
          {!loading && error && (
            <EmptyState
              title={t('gameplay:market.filters.loadError')}
              hint={error}
              action={<Button variant="secondary" onClick={() => void load()}>{t('gameplay:market.retry')}</Button>}
            />
          )}
          {!loading && !error && (
            <>
              {shown.length === 0 ? (
                <EmptyState
                  mood="transfer"
                  kicker={t('gameplay:market.empty.kicker', 'Ventana fría')}
                  title={t('gameplay:market.filters.noResults')}
                />
              ) : (
                <SortableTable 
                  columns={columns} 
                  data={shown} 
                  rowKey={p => p.id} 
                  onRowClick={p => setSelected(p)} 
                  onSortChange={setSort} 
                  initialSort={sort || undefined} 
                />
              )}
            </>
          )}
        </>
      )}

      {/* ── LIBRES ── */}
      {tab === 'libres' && (
        freeAgents === null ? <div className="mk-grid">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={150} />)}</div>
        : freeAgents.length === 0 ? <EmptyState title={t('gameplay:market.empty.freeAgents')} hint={t('gameplay:market.empty.freeAgentsHint')} />
        : (
          <div className="mk-grid">
            {freeAgents.map(p => (
              <PlayerCard key={p.id} player={{ ...toCard(p), clubName: t('gameplay:market.freeAgentLabel') }} onClick={() => setSelected({ ...p, clubName: t('gameplay:market.freeAgentLabel') })}
                actions={<Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected({ ...p, clubName: t('gameplay:market.freeAgentLabel') }); }}>{t('gameplay:market.actions.sign')}</Button>} />
            ))}
          </div>
        )
      )}

      {/* ── EN VENTA ── */}
      {tab === 'venta' && (
        listings === null ? <Skeleton height={200} />
        : listings.length === 0 ? <EmptyState title={t('gameplay:market.empty.listings')} hint={t('gameplay:market.empty.listingsHint')} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {listings.map((l: any) => {
              const p = l.player ?? {};
              const mine = p.clubId === club?.id || p.club?.id === club?.id;
              return (
                <div key={l.id} className="mk-row">
                  <b style={{ minWidth: 40, color: 'var(--green-primary)' }}>{p.overall ?? '—'}</b>
                  <span style={{ flex: 1 }}>
                    <PlayerLink id={p.id} name={p.name ?? 'Jugador'} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {p.position && <PosBadge position={p.position} preferredPosition={p.preferredPosition} short />}
                      <span>{t('gameplay:market.ageYears', { age: p.age })} · <ClubLink id={p.club?.id} name={p.club?.shortName ?? p.club?.name ?? '—'} /></span>
                    </span>
                  </span>
                  <b style={{ color: 'var(--gold-accent)' }}>{eur(l.price)}</b>
                  {mine
                    ? <Button size="sm" variant="ghost" onClick={() => setConfirmRemoveListing(l.id)}><Trash2 size={13} /> {t('gameplay:market.actions.withdraw')}</Button>
                    : <Button size="sm" variant="ghost" onClick={() => setSelected({ ...p, marketValue: l.price })}>{t('gameplay:market.actions.offer')}</Button>}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── CESIONES ── */}
      {tab === 'cesiones' && (
        <>
          {!loanOpen && <p style={{ color: 'var(--gold-accent)', fontSize: '.8rem' }}>{t('gameplay:market.loan.windowClosed')}</p>}
          {squad === null ? <Skeleton height={200} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {squad.map((p: any) => (
                <div key={p.id} className="mk-row">
                  <b style={{ minWidth: 40, color: 'var(--green-primary)' }}>{p.overall ?? '—'}</b>
                  <span style={{ flex: 1 }}>
                    <PlayerLink id={p.id} name={p.name ?? 'Jugador'} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '.78rem', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      {p.position && <PosBadge position={p.position} preferredPosition={p.preferredPosition} short />}
                      <span>{t('gameplay:market.ageYears', { age: p.age })} · {eur(p.wage)}{t('gameplay:market.perMonth')}</span>
                    </span>
                  </span>
                  {p.loanOwnerClubId
                    ? <span className="mk-chip mk-chip--open">{t('gameplay:market.loan.loanedHere')}</span>
                    : <Button size="sm" variant="ghost" onClick={() => { setLoanPlayer(p); setLoanQuery(''); }}><Handshake size={13} /> {t('gameplay:market.actions.loan')}</Button>}
                </div>
              ))}
              {squad.length === 0 && <EmptyState title={t('gameplay:market.empty.squad')} />}
            </div>
          )}
        </>
      )}

      {/* ── MIS OFERTAS ── */}
      
        {tab === 'rumores' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-6">
              <Radio size={20} className="text-[var(--gold-accent)]" />
              <h2 className="font-display font-bold uppercase tracking-wide">{t('gameplay:market.rumors.title')}</h2>
            </div>
            {rivalWeek?.rival && (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-4 space-y-3">
                <p className="text-sm text-[var(--text-muted)]">
                  <strong className="text-[var(--text-primary)]">{t('gameplay:market.rumors.dirtyWarTitle')}</strong>{' '}
                  {t('gameplay:market.rumors.dirtyWarBefore')}{' '}
                  <ClubLink id={rivalWeek.rival.id} name={rivalWeek.rival.name} />{' '}
                  {t('gameplay:market.rumors.dirtyWarAfter')}
                </p>
                <Button
                  variant="secondary"
                  disabled={sabotageLoading}
                  onClick={() => setConfirmSabotage(true)}
                >
                  {t('gameplay:market.rumors.plantCrisis')}
                </Button>
              </div>
            )}
            {activeSabotage.length > 0 && (
              <div className="rounded-lg border border-[var(--red-danger)]/40 bg-[var(--bg-elevated)] p-4">
                <p className="text-sm font-bold text-[var(--red-danger)] mb-2">{t('gameplay:market.rumors.activeCrisis')}</p>
                {activeSabotage.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{s.headline}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        try {
                          await marketApi.debunkRumorSabotage(s.id);
                          toast.success(t('gameplay:market.toasts.denialPublished'));
                          setActiveSabotage([]);
                        } catch (e: unknown) {
                          toast.error(e instanceof Error ? e.message : 'Error al desmentir');
                        }
                      }}
                    >
                      {t('gameplay:market.actions.deny')}
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {rumors.length === 0 ? (
              <EmptyState title={t('gameplay:market.empty.rumors')} hint={t('gameplay:market.empty.rumorsHint')} icon={<Radio />} />
            ) : (
              <div className="grid gap-3">
                {rumors.map(r => (
                  <div key={r.id} className="bg-[var(--bg-elevated)] p-4 rounded-md border border-[var(--border-color)] flex items-center gap-4">
                    <div className="text-2xl">{r.icon}</div>
                    <div className="flex-1">
                      <div className="font-bold">{r.headline}</div>
                      <div className="text-sm text-[var(--text-muted)] flex items-center gap-2 mt-1">
                        {r.player && <span><b>{r.player.name}</b> ({r.player.position})</span>}
                        {r.player && r.club && <span>→</span>}
                        {r.club && <span>{r.club.shortName}</span>}
                      </div>
                    </div>
                    <div className="text-[0.65rem] font-mono uppercase tracking-widest text-[var(--gold-accent)] border border-[var(--gold-accent)] px-2 py-1 rounded">
                      {r.kind}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'ofertas' && (
        offers.length === 0 ? <EmptyState title={t('gameplay:market.empty.offers')} hint={t('gameplay:market.empty.offersHint')} />
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {offers.map((o: any) => {
              const pos = o.player?.position ?? o.position;
              const age = o.player?.age ?? o.age;
              const clubName = o.player?.club?.name ?? o.clubName ?? o.player?.clubName;
              const n = normalizeOffer(o, club?.id ?? null);
              const tone = OFFER_TONE_VAR[n.tone];
              const label = n.label;
              const hasTerms = o.salary != null || o.years != null || o.clause != null;
              return (
                <div key={o.id} className="mk-row" style={{ flexWrap: 'wrap' }}>
                  {/* Fila principal */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {pos && <PosBadge position={pos} short />}
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <PlayerLink id={o.playerId ?? o.player?.id} name={o.playerName ?? o.player?.name ?? 'Jugador'} />
                      <span style={{ color: 'var(--text-muted)', fontSize: '.74rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {age != null && <span>{t('gameplay:market.ageYears', { age })}</span>}
                        {clubName && <span>· {clubName}</span>}
                      </span>
                    </div>
                  </div>

                  <b style={{ color: 'var(--gold-accent)', fontFamily: 'var(--font-sans)', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{eur(o.amount)}</b>

                  <span className="mk-chip" style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
                    {label}
                  </span>

                  {n.actions.canWithdraw && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(o.id)}><Trash2 size={13} /> {t('gameplay:market.actions.withdraw')}</Button>
                  )}

                  {/* Términos de contrato (si existen) */}
                  {hasTerms && (
                    <div style={{ width: '100%', display: 'flex', gap: 12, paddingTop: 4, marginTop: 4, borderTop: '1px dashed var(--border-color)', fontSize: '.72rem', color: 'var(--text-muted)' }}>
                      {o.salary != null && <span>{t('gameplay:market.offers.salary')} <b style={{ color: 'var(--text-primary)' }}>{eur(o.salary)}{t('gameplay:market.perMonth')}</b></span>}
                      {o.years != null && <span>{t('gameplay:market.offers.duration')} <b style={{ color: 'var(--text-primary)' }}>{t('gameplay:market.offers.years', { count: o.years })}</b></span>}
                      {o.clause != null && <span>{t('gameplay:market.offers.clause')} <b style={{ color: 'var(--text-primary)' }}>{eur(o.clause)}</b></span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Modal jugador: dossier + cláusula + oferta / fichaje libre ── */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? fullName(selected) : ''} width={1100}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PlayerDossier player={toDossier(selected)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <Link to={`/player/${selected.id}`} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--green-primary)', marginRight: 'auto' }}>
                {t('gameplay:market.actions.fullProfile')}
              </Link>
              <Button variant="ghost" onClick={() => toggleShort(selected.id)}>
                <Star size={14} fill={shortlist.has(selected.id) ? 'var(--gold-accent)' : 'none'} /> {t('gameplay:market.actions.shortlist')}
              </Button>
            </div>

            {selected.clubName === t('gameplay:market.freeAgentLabel') ? (
              <FreeAgentSign player={selected} onSign={signFree} />
            ) : (
              <>
                {clause?.clause != null && (
                  <div className="mk-clause">
                    <KeyRound size={16} style={{ color: 'var(--gold-accent)' }} />
                    <span style={{ flex: 1, fontSize: '.85rem' }}>{t('gameplay:market.clause.label')} <b style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', color: 'var(--gold-accent)' }}>{eur(clause.clause)}</b><br />
                      <small style={{ color: 'var(--text-muted)' }}>{t('gameplay:market.clause.hint')} {!winOpen && t('gameplay:market.clause.windowClosed')}</small>
                    </span>
                    <Button size="sm" onClick={() => setConfirmClause(true)}>{t('gameplay:market.clause.payAction')}</Button>
                  </div>
                )}
                <OfferPanel
                  mode="bid"
                  player={{ id: selected.id, name: fullName(selected), age: selected.age, marketValue: selected.marketValue }}
                  onSubmit={async (offer) => {
                    try {
                      await marketApi.makeOffer(selected.id, offer.amount,
                        { salary: offer.salary, years: offer.years, clause: offer.clause });
                      toast.success(t('gameplay:market.toasts.offerSent'));
                      await load();
                    } catch (e) { toast.error(e instanceof Error ? e.message : 'El jugador rechaza la oferta'); }
                    setSelected(null);
                  }}
                  onCancel={() => setSelected(null)}
                />
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── Modal cesión: elegir club destino ── */}
      <Modal open={!!loanPlayer} onClose={() => setLoanPlayer(null)} title={loanPlayer ? t('gameplay:market.loan.modalTitle', { player: loanPlayer.name }) : ''} width={460}>
        {loanPlayer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{t('gameplay:market.loan.modalHint')}</p>
            <label htmlFor="loan-club-search" className="text-xs text-[var(--text-muted)]">{t('gameplay:market.loanSearchLabel')}</label>
            <input
              id="loan-club-search"
              autoFocus value={loanQuery} onChange={e => setLoanQuery(e.target.value)} placeholder={t('gameplay:market.loan.searchPlaceholder')}
              aria-label={t('gameplay:market.loan.searchAria')}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '.85rem' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflow: 'auto' }}>
              {loanClubs.map((c: any) => (
                <button key={c.id} className="mk-row" style={{ cursor: 'pointer', textAlign: 'left' }} onClick={() => loanPlayer && setConfirmLoan({ player: loanPlayer, club: c })}>
                  <span style={{ flex: 1 }}>{c.badge ? `${c.badge} ` : ''}{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '.74rem' }}>{c.country ?? c.city ?? ''}</span>
                </button>
              ))}
              {loanQuery.trim().length >= 2 && loanClubs.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{t('gameplay:market.loan.noResults')}</p>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmWithdraw != null}
        onClose={() => setConfirmWithdraw(null)}
        onConfirm={async () => { if (confirmWithdraw != null) { await withdraw(confirmWithdraw); setConfirmWithdraw(null); } }}
        title={t('gameplay:market.confirm.withdrawTitle')}
        confirmText={t('gameplay:market.confirm.withdrawAction')}
        isDestructive
      >
        <p>{t('gameplay:market.confirm.withdrawBody')}</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmRemoveListing != null}
        onClose={() => setConfirmRemoveListing(null)}
        onConfirm={async () => { if (confirmRemoveListing != null) { await removeListing(confirmRemoveListing); setConfirmRemoveListing(null); } }}
        title={t('gameplay:market.confirm.listingTitle')}
        confirmText={t('gameplay:market.confirm.listingAction')}
        isDestructive
      >
        <p>{t('gameplay:market.confirm.listingBody')}</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmSabotage}
        onClose={() => setConfirmSabotage(false)}
        onConfirm={async () => {
          setConfirmSabotage(false);
          if (!rivalWeek?.rival) return;
          setSabotageLoading(true);
          try {
            await marketApi.plantRumorSabotage(rivalWeek.rival.id);
            toast.success(t('gameplay:market.toasts.rumorPlanted'));
            const active = await marketApi.activeRumorSabotage();
            setActiveSabotage(asArray(active?.sabotages));
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'No se pudo plantar el rumor');
          } finally {
            setSabotageLoading(false);
          }
        }}
        title={t('gameplay:market.confirm.sabotageTitle')}
        confirmText={t('gameplay:market.confirm.sabotageAction')}
        isDestructive
        isSubmitting={sabotageLoading}
      >
        <p>{t('gameplay:market.confirm.sabotageBody')}</p>
      </ConfirmModal>
      <ConfirmModal
        open={!!confirmLoan}
        onClose={() => setConfirmLoan(null)}
        onConfirm={async () => {
          const target = confirmLoan;
          setConfirmLoan(null);
          if (target) await doLoan(target.club);
        }}
        title={t('gameplay:market.confirm.loanTitle')}
        confirmText={t('gameplay:market.confirm.loanAction')}
        isDestructive
      >
        {confirmLoan && (
          <p>
            {t('gameplay:market.confirm.loanBody', {
              player: confirmLoan.player.name ?? 'el jugador',
              club: confirmLoan.club.name,
            })}
          </p>
        )}
      </ConfirmModal>
      <ConfirmModal
        open={confirmClause}
        onClose={() => setConfirmClause(false)}
        onConfirm={payClause}
        title={t('gameplay:market.clause.confirmTitle')}
        confirmText={t('gameplay:market.clause.confirmAction')}
        isDestructive
        isSubmitting={clausePaying}
      >
        {selected && clause?.clause != null && (
          <p>{t('gameplay:market.clause.confirmBody', { amount: eur(clause.clause), player: fullName(selected) })}</p>
        )}
      </ConfirmModal>
    </div>
  );
}

// ─── Fichaje de agente libre: términos simples (salario/años) ──────────────────
function FreeAgentSign({ player, onSign }: { player: MarketPlayer; onSign: (p: MarketPlayer, wage: number, years: number) => void }) {
  const { t } = useTranslation();
  const suggested = Math.max(2000, Math.round((player.wage ?? 2000) * 1.1));
  const [wage, setWage] = useState(String(suggested));
  const [years, setYears] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  return (
    <div className="mk-row" style={{ flexWrap: 'wrap' }}>
      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', width: '100%' }}>{t('gameplay:market.freeAgent.intro')}</span>
      <div className="mk-f">
        <label htmlFor="fa-sign-wage" style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{t('gameplay:market.freeAgent.wageLabel')}</label>
        <input id="fa-sign-wage" type="number" value={wage} onChange={e => setWage(e.target.value)} style={{ display: 'block', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-primary)', width: 120 }} />
      </div>
      <div className="mk-f">
        <label htmlFor="fa-sign-years" style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{t('gameplay:market.freeAgent.yearsLabel')}</label>
        <input id="fa-sign-years" type="number" min={1} max={5} value={years} onChange={e => setYears(e.target.value)} style={{ display: 'block', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', borderRadius: 6, padding: '6px 8px', color: 'var(--text-primary)', width: 80 }} />
      </div>
      <Button
        disabled={submitting}
        onClick={() => {
          if (submitting) return;
          setSubmitting(true);
          Promise.resolve(onSign(player, Number(wage) || suggested, Math.min(5, Math.max(1, Number(years) || 2)))).finally(() => setSubmitting(false));
        }}
      >
        {t('gameplay:market.freeAgent.sign')}
      </Button>
    </div>
  );
}
