// ─── SharesPage — terminal de bolsa del accionariado (E17 · lote A) ───────────
// Cabecera ticker con cotización en grande + gráfica de evolución, mesa de
// operaciones compra/venta, mi cartera con variación coloreada, tabla de
// accionistas y ranking de patrimonio. MISMA lógica de negocio que antes.
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, Users, Trophy, RefreshCw, Briefcase } from 'lucide-react';
import toast from 'react-hot-toast';
import { sharesApi, clubApi } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { KPICard, SortableTable, Skeleton, Button, Tabs, EmptyState, SectionHeader, ConfirmModal, type SortCol } from '../components/ui';
import { ClubLink } from '../components/common/EntityLink';
import { ShareTicker } from '../components/economy/ShareTicker';

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K €`;
  return `${v.toFixed(2)} €`;
}

type TabId = 'club' | 'ranking';

interface ShareRow { id: number; ownerId?: number; ownerName?: string; ownerUsername?: string; shares: number; pct: number; totalValue: number }
interface RankRow { managerId: number; rank: number; name?: string; username?: string; clubShortName?: string; portfolioValue: number; totalNetWorth: number }

export function SharesPage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [tab, setTab] = useState<TabId>('club');
  const [clubData, setClubData] = useState<any>(null);
  const [ranking, setRanking] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [buyAmount, setBuyAmount] = useState(1);
  const [sellAmount, setSellAmount] = useState(1);
  const [clubId, setClubId] = useState<number | null>(null);
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [confirmSell, setConfirmSell] = useState(false);
  // Histórico de cotización (sesión): se alimenta del backend si existe + snapshots locales.
  const historyRef = useRef<number[]>([]);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    clubApi.get()
      .then((c: any) => setClubId(c.id))
      .catch((e: any) => toast.error(e?.message ?? 'No se pudo identificar tu club'));
  }, []);

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      const [rank] = await Promise.all([sharesApi.getRanking()]);
      setRanking(rank);
      if (clubId) {
        const cd = await sharesApi.getClubShares(clubId);
        setClubData(cd);
        // Histórico: backend (si lo provee) o acumulación local de snapshots
        const backendHist: number[] = Array.isArray(cd?.valueHistory) ? cd.valueHistory
          : Array.isArray(cd?.history) ? cd.history : [];
        const base = backendHist.length >= 2 ? backendHist : historyRef.current;
        const next = typeof cd?.shareValue === 'number' && base[base.length - 1] !== cd.shareValue
          ? [...base, cd.shareValue].slice(-30)
          : base.slice(-30);
        historyRef.current = next;
        setHistory(next);
      }
    } catch (e: any) {
      setError(e.message ?? 'Error cargando acciones');
      toast.error(e.message ?? 'Error cargando acciones');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (clubId !== null) loadData(); }, [clubId]);

  const handleBuy = async () => {
    if (!clubId || buyAmount < 1) return;
    const totalCost = buyAmount * (clubData?.shareValue ?? 0);
    const budget = clubData?.managerBudget ?? clubData?.budget;
    if (budget != null && totalCost > budget) {
      toast.error(t('gameplay:shares.toasts.insufficientFunds'));
      return;
    }
    setSubmitting(true);
    try {
      await sharesApi.buy(clubId, buyAmount);
      toast.success(t('gameplay:shares.toasts.buySuccess', { count: buyAmount }));
      setConfirmBuy(false);
      await loadData();
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo comprar');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSell = async () => {
    if (!clubId || sellAmount < 1) return;
    const owned = myStake?.shares ?? 0;
    if (sellAmount > owned) {
      toast.error(t('gameplay:shares.toasts.sellOverLimit', { owned }));
      return;
    }
    setSubmitting(true);
    try {
      const res = await sharesApi.sell(clubId, sellAmount);
      toast.success(t('gameplay:shares.toasts.sellSuccess', { count: sellAmount, proceeds: formatMoney(res?.proceeds ?? 0) }));
      setConfirmSell(false);
      await loadData();
    } catch (e: any) {
      toast.error(e.message ?? 'No se pudo vender');
    } finally {
      setSubmitting(false);
    }
  };

  const shares: ShareRow[] = clubData?.shares ?? [];
  const myStake = shares.find(s => s.ownerUsername != null && s.ownerUsername === user?.username);
  const delta = history.length >= 2
    ? Math.round((history[history.length - 1] - history[history.length - 2]) * 100) / 100
    : undefined;
  // Variación de mi cartera derivada del histórico observado (no inventada):
  // mis acciones × variación de cotización de la sesión.
  const sessionMove = history.length >= 2 ? history[history.length - 1] - history[0] : null;
  const myPL = myStake && sessionMove != null ? myStake.shares * sessionMove : null;

  const shareCols: SortCol<ShareRow>[] = [
    {
      key: 'owner', header: t('gameplay:shares.table.manager'),
      render: r => (
        <div>
          <b style={{ color: r.ownerUsername === user?.username ? 'var(--gold-accent)' : 'var(--text-primary)' }}>
            {r.ownerName ?? t('gameplay:shares.table.unknown')}{r.ownerUsername === user?.username ? t('gameplay:shares.table.youSuffix') : ''}
          </b>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>@{r.ownerUsername ?? '—'}</div>
        </div>
      ),
      sortValue: r => r.ownerName ?? '',
    },
    { key: 'shares', header: t('gameplay:shares.table.shares'), align: 'right', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)' }}>{(r.shares ?? 0).toLocaleString('es-ES')}</b>, sortValue: r => r.shares ?? 0 },
    {
      key: 'pct', header: t('gameplay:shares.table.pct'), align: 'right',
      render: r => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 54, height: 5, borderRadius: 3, background: 'var(--track-color)', border: '1px solid var(--border-color)', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.min(100, r.pct ?? 0)}%`, background: 'var(--blue-info)' }} />
          </span>
          <span style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--blue-info)' }}>{(r.pct ?? 0).toFixed(2)}%</span>
        </div>
      ),
      sortValue: r => r.pct ?? 0,
    },
    { key: 'value', header: t('gameplay:shares.table.totalValue'), align: 'right', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>{formatMoney(r.totalValue ?? 0)}</b>, sortValue: r => r.totalValue ?? 0 },
  ];

  const rankCols: SortCol<RankRow>[] = [
    { key: 'rank', header: '#', align: 'center', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)', color: r.rank === 1 ? 'var(--gold-accent)' : r.rank <= 3 ? 'var(--blue-info)' : 'var(--text-muted)' }}>#{r.rank}</b>, sortValue: r => r.rank ?? 0 },
    {
      key: 'manager', header: t('gameplay:shares.table.manager'),
      render: r => (
        <div>
          <b style={{ color: 'var(--text-primary)' }}>{r.name ?? '—'}</b>
          <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>@{r.username ?? '—'}{r.clubShortName ? ` · ${r.clubShortName}` : ''}</div>
        </div>
      ),
      sortValue: r => r.name ?? '',
    },
    { key: 'portfolio', header: t('gameplay:shares.table.portfolio'), align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.78rem', color: 'var(--blue-info)' }}>{formatMoney(r.portfolioValue ?? 0)}</span>, sortValue: r => r.portfolioValue ?? 0 },
    { key: 'networth', header: t('gameplay:shares.table.netWorth'), align: 'right', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>{formatMoney(r.totalNetWorth ?? 0)}</b>, sortValue: r => r.totalNetWorth ?? 0 },
  ];

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .sh-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
        .sh-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .sh-trade{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        .sh-trade-panel{border-radius:var(--radius-retro);padding:16px;background:var(--bg-surface);box-shadow:inset 0 1px 0 var(--bevel-light)}
        .sh-trade-buy{border:1px solid color-mix(in srgb,var(--green-primary) 32%,transparent)}
        .sh-trade-sell{border:1px solid color-mix(in srgb,var(--red-danger) 32%,transparent)}
        .sh-trade-title{font-family:var(--font-display);font-weight:700;font-size:.92rem;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
        .sh-input{flex:1;background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-primary);
          border-radius:var(--radius-retro);padding:8px 12px;font-size:.86rem;font-family:var(--font-mono-retro);outline:none}
        .sh-input:focus{border-color:var(--green-primary)}
        .sh-meta{font-size:.72rem;color:var(--text-muted)}
        .sh-meta b{font-family:var(--font-mono-retro)}
        @media(max-width:900px){.sh-kpis{grid-template-columns:repeat(2,1fr)}.sh-trade{grid-template-columns:1fr}}
      `}</style>

      <div className="sh-head">
        <div>
          <p className="muted-label">{t('gameplay:shares.kicker')}</p>
          <h1 className="section-title text-3xl font-display phosphor">{t('gameplay:shares.title')}</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={loading} aria-label="Recargar">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      <Tabs
        tabs={[
          { id: 'club', label: t('gameplay:shares.tabs.club') },
          { id: 'ranking', label: t('gameplay:shares.tabs.ranking'), count: ranking.length || undefined },
        ]}
        activeTab={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {error && (
        <EmptyState
          title={t('gameplay:shares.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => void loadData()}>{t('gameplay:shares.retry')}</Button>}
        />
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={140} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[0, 1, 2, 3].map(i => <Skeleton key={i} height={88} />)}
          </div>
          <Skeleton height={220} />
        </div>
      ) : tab === 'club' ? (
        clubData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Terminal de cotización */}
            <ShareTicker
              clubName={clubData.club?.name ?? 'Club'}
              shareValue={clubData.shareValue ?? 0}
              history={history}
              delta={delta}
            />

            <div className="sh-kpis">
              <KPICard label={t('gameplay:shares.kpis.shareValue')} value={formatMoney(clubData.shareValue ?? 0)} tone="green" delta={delta} icon={<TrendingUp size={16} />} />
              <KPICard
                label={t('gameplay:shares.kpis.portfolio')}
                value={(myStake?.shares ?? 0).toLocaleString('es-ES')}
                hint={myStake ? `${(myStake.pct ?? 0).toFixed(2)}% · ${formatMoney(myStake.totalValue ?? 0)}` : t('gameplay:shares.kpis.noStake')}
                tone="gold"
                icon={<Briefcase size={16} />}
                delta={myPL != null && myPL !== 0 ? Math.round(myPL) : undefined}
              />
              <KPICard label={t('gameplay:shares.kpis.totalShares')} value={(clubData.totalShares ?? 0).toLocaleString('es-ES')} tone="neutral" icon={<Users size={16} />} />
              <KPICard label={t('gameplay:shares.kpis.distributed')} value={`${(clubData.totalPct ?? 0).toFixed(1)}%`} tone="blue" icon={<Trophy size={16} />} />
            </div>

            {/* Mesa de operaciones */}
            <div className="sh-trade">
              <div className="sh-trade-panel sh-trade-buy">
                <p className="sh-trade-title" style={{ color: 'var(--green-primary)' }}>{t('gameplay:shares.trade.buyTitle')}</p>
                <p className="sh-meta" style={{ marginBottom: 10 }}>{t('gameplay:shares.trade.unitPrice')} <b style={{ color: 'var(--text-primary)' }}>{formatMoney(clubData.shareValue ?? 0)}</b></p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min={1} max={1500} value={buyAmount} className="sh-input" aria-label={t('gameplay:shares.table.shares')}
                    onChange={e => setBuyAmount(Math.max(1, parseInt(e.target.value) || 1))} />
                  <Button variant="primary" size="md" onClick={() => setConfirmBuy(true)} disabled={submitting}>{t('gameplay:shares.trade.buy')}</Button>
                </div>
                <p className="sh-meta" style={{ marginTop: 8 }}>{t('gameplay:shares.trade.total')} <b style={{ color: 'var(--gold-accent)' }}>{formatMoney(buyAmount * (clubData.shareValue ?? 0))}</b></p>
              </div>
              <div className="sh-trade-panel sh-trade-sell">
                <p className="sh-trade-title" style={{ color: 'var(--red-danger)' }}>{t('gameplay:shares.trade.sellTitle')}</p>
                <p className="sh-meta" style={{ marginBottom: 10 }}>{t('gameplay:shares.trade.unitPrice')} <b style={{ color: 'var(--text-primary)' }}>{formatMoney(clubData.shareValue ?? 0)}</b></p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" min={1} max={1500} value={sellAmount} className="sh-input" aria-label={t('gameplay:shares.table.shares')}
                    onChange={e => setSellAmount(Math.max(1, parseInt(e.target.value) || 1))} />
                  <Button variant="danger" size="md" onClick={() => setConfirmSell(true)} disabled={submitting || (myStake?.shares ?? 0) < 1}>{t('gameplay:shares.trade.sell')}</Button>
                </div>
                <p className="sh-meta" style={{ marginTop: 8 }}>{t('gameplay:shares.trade.proceeds')} <b style={{ color: 'var(--green-primary)' }}>{formatMoney(sellAmount * (clubData.shareValue ?? 0))}</b></p>
              </div>
            </div>

            {/* Accionistas */}
            <SectionHeader
              title={t('gameplay:shares.shareholdersTitle')}
              icon={<Users size={14} />}
              actions={clubData.club?.name
                ? <span style={{ fontSize: '.7rem', fontFamily: 'var(--font-mono-retro)', color: 'var(--text-muted)' }}>
                    <ClubLink id={clubData.club?.id ?? clubId} name={clubData.club.name} />
                  </span>
                : undefined}
              flush
            >
              {shares.length === 0 ? (
                <div style={{ padding: 16 }}>
                  <EmptyState icon={<Users size={32} />} title={t('gameplay:shares.noShareholders')} hint={t('gameplay:shares.noShareholdersHint')} />
                </div>
              ) : (
                <SortableTable columns={shareCols} data={shares} rowKey={r => r.id} initialSort={{ key: 'pct', dir: 'desc' }} />
              )}
            </SectionHeader>
          </div>
        ) : (
          <EmptyState
            icon={<Users size={36} />}
            title={t('gameplay:shares.noClubTitle')}
            hint={t('gameplay:shares.noClubHint')}
          />
        )
      ) : (
        /* RANKING */
        <SectionHeader title={t('gameplay:shares.rankingTitle')} icon={<Trophy size={14} />} flush>
          {ranking.length === 0 ? (
            <div style={{ padding: 16 }}>
              <EmptyState icon={<Trophy size={32} />} title={t('gameplay:shares.noRanking')} hint={t('gameplay:shares.noRankingHint')} />
            </div>
          ) : (
            <SortableTable columns={rankCols} data={ranking as RankRow[]} rowKey={r => r.managerId} initialSort={{ key: 'rank', dir: 'asc' }} />
          )}
        </SectionHeader>
      )}
      <ConfirmModal
        open={confirmBuy}
        onClose={() => setConfirmBuy(false)}
        onConfirm={handleBuy}
        title={t('gameplay:shares.confirm.buyTitle')}
        confirmText={t('gameplay:shares.confirm.buyAction')}
        isSubmitting={submitting}
      >
        <p>{t('gameplay:shares.confirm.buyBody', { count: buyAmount, amount: formatMoney(buyAmount * (clubData?.shareValue ?? 0)) })}</p>
      </ConfirmModal>
      <ConfirmModal
        open={confirmSell}
        onClose={() => setConfirmSell(false)}
        onConfirm={handleSell}
        title={t('gameplay:shares.confirm.sellTitle')}
        confirmText={t('gameplay:shares.confirm.sellAction')}
        isDestructive
        isSubmitting={submitting}
      >
        <p>{t('gameplay:shares.confirm.sellBody', { count: sellAmount, amount: formatMoney(sellAmount * (clubData?.shareValue ?? 0)) })}</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t('gameplay:shares.confirm.owned', { count: (myStake?.shares ?? 0).toLocaleString('es-ES') })}</p>
      </ConfirmModal>
    </div>
  );
}
