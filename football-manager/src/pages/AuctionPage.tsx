// ─── Subastas en vivo (Etapa 8) — lista + sala con pujas en tiempo real ───────
// Contrato confirmado (API_UI.md §11 / N2-4): WS y REST público sellan bid.amount y
// bid.managerId; el precio visible es SIEMPRE auction.currentBid. La respuesta del
// propio POST /bids puede incluir la puja en claro para confirmación del pujador.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gavel, TimerReset, Lock } from 'lucide-react';
import { auctionsApi } from '../api/client';
import type { AuctionDetail, AuctionBid, AuctionSummary } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { subscribe, type LiveChannel } from '../lib/ws';
import { asArray } from '../lib/normalize';
import { eur } from '../lib/format';
import { Button, Modal, Skeleton, EmptyState, ConfirmModal } from '../components/ui';
import { cn } from '../lib/cn';

function pName(a: AuctionSummary) { return a.player?.name ?? a.playerName ?? 'Jugador'; }

/** Precio público canónico (N2-4): solo currentBid, nunca bid.amount del historial. */
function publicPrice(a: Pick<AuctionSummary, 'currentBid' | 'startPrice'>) {
  return a.currentBid ?? a.startPrice ?? 0;
}

function isSealedBid(b: AuctionBid) {
  return b.sealed === true || (b.amount == null && b.encrypted != null);
}

function bidLabel(b: AuctionBid, index: number, ownAmount?: number) {
  if (!isSealedBid(b) && b.amount != null) {
    const who = b.managerName ?? b.manager?.name ?? 'Mánager';
    return { who, amount: b.amount };
  }
  if (ownAmount != null && index === 0) {
    return { who: 'Tu puja', amount: ownAmount };
  }
  return { who: `Puja sellada #${b.id ?? index + 1}`, amount: null as number | null };
}

function Countdown({ endsAt, closedLabel }: { endsAt?: string; closedLabel: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!endsAt) return <span className="au-cd">—</span>;
  const ms = +new Date(endsAt) - now;
  if (ms <= 0) return <span className="au-cd au-cd--end">{closedLabel}</span>;
  const s = Math.floor(ms / 1000);
  const txt = s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return <span className={cn('au-cd', s < 60 && 'au-cd--hot')}>{txt}</span>;
}

export function AuctionPage() {
  const { t } = useTranslation();
  const { club } = useSession();
  const myClubId = club?.id;
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [status, setStatus] = useState<'active' | 'finished' | ''>('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AuctionDetail | null>(null);
  const [amount, setAmount] = useState('');
  const [bidMsg, setBidMsg] = useState<string | null>(null);
  const [ownLastBid, setOwnLastBid] = useState<number | null>(null);
  const [priceFlash, setPriceFlash] = useState(false);
  const [bidding, setBidding] = useState(false);
  const [confirmBid, setConfirmBid] = useState(false);
  const chan = useRef<LiveChannel | null>(null);
  const prevPrice = useRef<number | null>(null);

  const flashPrice = useCallback(() => {
    setPriceFlash(true);
    window.setTimeout(() => setPriceFlash(false), 900);
  }, []);

  const load = useCallback(async () => {
    try { setAuctions(asArray<AuctionSummary>(await auctionsApi.list(status || undefined))); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : t('gameplay:auction.loadError')); }
    finally { setLoading(false); }
  }, [status, t]);
  useEffect(() => { setLoading(true); void load(); }, [load]);

  useEffect(() => {
    chan.current?.close();
    if (!open) return;
    const mergeAuction = (a: Partial<AuctionDetail> | undefined) => {
      if (!a || typeof a !== 'object' || !('id' in a)) return;
      setOpen(prev => (prev && prev.id === a.id ? { ...prev, ...a } : prev));
      setAuctions(prev => prev.map(pa => pa.id === a.id ? { ...pa, ...a } : pa));
    };
    chan.current = subscribe(
      `auction:${open.id}`,
      (msg) => {
        if (msg.type === 'poll') {
          mergeAuction(msg.payload as AuctionDetail);
        } else if (msg.type === 'auction:bid') {
          const p = msg.payload as { auction?: AuctionDetail; bid?: AuctionBid };
          if (p?.auction) {
            const upd = p.auction;
            const newPrice = publicPrice(upd);
            if (prevPrice.current != null && newPrice > prevPrice.current) flashPrice();
            prevPrice.current = newPrice;
            const newBid = p.bid;
            setOpen(prev => {
              if (!prev || prev.id !== upd.id) return prev;
              const bids = newBid ? [...asArray<AuctionBid>(prev.bids), newBid] : prev.bids;
              return { ...prev, ...upd, bids };
            });
            setAuctions(prev => prev.map(pa => {
              if (pa.id !== upd.id) return pa;
              const bids = newBid ? [...asArray<AuctionBid>(pa.bids), newBid] : pa.bids;
              return { ...pa, ...upd, bids };
            }));
          }
        } else if (msg.type === 'auction:closed') {
          mergeAuction(msg.payload as AuctionDetail);
          void load();
        }
      },
      () => auctionsApi.get(open.id),
      4000,
    );
    return () => chan.current?.close();
  }, [open?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeBid = async () => {
    if (!open || bidding) return;
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= publicPrice(open)) { setBidMsg(t('gameplay:auction.bidTooLow')); return; }
    setBidding(true);
    try {
      const res = await auctionsApi.bid(open.id, v);
      setOwnLastBid(typeof res?.bid?.amount === 'number' ? res.bid.amount : v);
      flashPrice();
      setBidMsg(t('gameplay:auction.bidSuccess'));
      setAmount('');
      try {
        const fresh = await auctionsApi.get(open.id);
        setOpen(prev => (prev && prev.id === fresh?.id ? { ...prev, ...fresh } : prev));
      } catch { /* el canal lo traerá */ }
    } catch (e) { setBidMsg(e instanceof Error ? e.message : t('gameplay:auction.bidError')); }
    finally { setBidding(false); }
  };

  const tryBid = () => {
    if (!open || bidding) return;
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= publicPrice(open)) {
      setBidMsg(t('gameplay:auction.bidTooLow'));
      return;
    }
    setConfirmBid(true);
  };

  const openRoom = (a: AuctionSummary) => {
    setOpen(a);
    setBidMsg(null);
    setOwnLastBid(null);
    prevPrice.current = publicPrice(a);
  };

  const bidRows = asArray<AuctionBid>(open?.bids).slice().reverse();

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{AU_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="muted-label"><Gavel size={12} style={{ display: 'inline' }} /> {t('gameplay:auction.kicker')}</p>
          <h1 className="section-title text-3xl">{t('gameplay:auction.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['active', t('gameplay:auction.filters.active')], ['finished', t('gameplay:auction.filters.finished')], ['', t('gameplay:auction.filters.all')]] as const).map(([k, lbl]) => (
            <button key={k} className={cn('au-filter', status === k && 'on')} onClick={() => setStatus(k)}>{lbl}</button>
          ))}
        </div>
      </div>

      {loading && <Skeleton height={220} />}
      {!loading && error && (
        <EmptyState
          title={t('gameplay:auction.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>{t('gameplay:auction.retry')}</Button>}
        />
      )}
      {!loading && !error && (
        <div className="au-grid">
          {auctions.length === 0 && (
            <EmptyState icon={<Gavel size={28} />} title={t('gameplay:auction.emptyTitle')}
                        hint={status === 'active' ? t('gameplay:auction.emptyActiveHint') : t('gameplay:auction.emptyFilterHint')}
                        className="col-span-full" />
          )}
          {auctions.map(a => (
            <button key={a.id} className="au-card" onClick={() => openRoom(a)}>
              <div className="au-name">{pName(a)}</div>
              <div className="au-sub">{a.player?.position ?? ''}{a.player?.overall ? ` · media ${a.player.overall}` : ''}</div>
              <div className="au-row">
                <span className="au-bid">{eur(publicPrice(a))}</span>
                {a.status === 'finished' ? <span className="au-cd au-cd--end">{t('gameplay:auction.awarded')}</span>
                  : a.status === 'cancelled' ? <span className="au-cd au-cd--end">{t('gameplay:auction.noSale')}</span>
                  : <Countdown endsAt={a.endsAt} closedLabel={t('gameplay:auction.closed')} />}
              </div>
              {a.status !== 'active' && a.winningClubId != null && a.winningClubId === myClubId && (
                <span className="au-winning">{t('gameplay:auction.wonByYou')}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Subasta · ${pName(open)}` : ''} width={560}>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="au-room-head">
              <div>
                <div className="au-room-bid" data-flash={priceFlash || undefined}>{eur(publicPrice(open))}</div>
                <div className="au-sub">
                  {t('gameplay:auction.room.currentBid', {
                    mode: chan.current?.mode === 'ws' ? t('gameplay:auction.room.live') : t('gameplay:auction.room.poll'),
                  })}{bidRows.length > 0 ? t('gameplay:auction.room.bidCount', { count: bidRows.length }) : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {open.status === 'finished' ? <span className="au-cd au-cd--end">{t('gameplay:auction.awarded')}</span>
                  : open.status === 'cancelled' ? <span className="au-cd au-cd--end">{t('gameplay:auction.noSale')}</span>
                  : <Countdown endsAt={open.endsAt} closedLabel={t('gameplay:auction.closed')} />}
                <div className="au-sub"><TimerReset size={11} style={{ display: 'inline' }} /> {t('gameplay:auction.room.antiSnipe')}</div>
              </div>
            </div>

            <div className="au-bids">
              {bidRows.map((b, i) => {
                const row = bidLabel(b, i, i === 0 ? ownLastBid ?? undefined : undefined);
                const who = row.amount != null
                  ? (row.who === 'Tu puja' ? t('gameplay:auction.yourBid') : row.who)
                  : t('gameplay:auction.sealedBid', { id: b.id ?? i + 1 });
                return (
                  <div key={b.id ?? `bid-${i}`} className={cn('au-bidrow', row.amount == null && 'au-bidrow--sealed')}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {row.amount == null && <Lock size={11} aria-hidden />}
                      {who}
                    </span>
                    <b>{row.amount != null ? eur(row.amount) : t('gameplay:auction.sealed')}</b>
                  </div>
                );
              })}
              {bidRows.length === 0 && <p className="au-sub" style={{ padding: 8 }}>{t('gameplay:auction.noBidsYet')}</p>}
            </div>

            {open.status === 'active' ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label htmlFor="auction-bid-amount" className="au-sub">{t('gameplay:auction.bidLabel')}</label>
                  <input id="auction-bid-amount" className="au-input" type="number" placeholder={`> ${eur(publicPrice(open))}`}
                       value={amount} onChange={e => setAmount(e.target.value)}
                       onKeyDown={e => { if (e.key === 'Enter') tryBid(); }} />
                </div>
                <Button onClick={tryBid} disabled={bidding}><Gavel size={14} /> {bidding ? t('gameplay:auction.bidding') : t('gameplay:auction.bidAction')}</Button>
              </div>
            ) : (
              <p className="au-sub">
                {t('gameplay:auction.closed.base')}{open.winningClubId != null
                  ? open.winningClubId === myClubId ? t('gameplay:auction.closed.won') : t('gameplay:auction.closed.lost')
                  : t('gameplay:auction.closed.noBid')}
              </p>
            )}
            {bidMsg && <p className="au-sub">{bidMsg}</p>}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={confirmBid}
        onClose={() => setConfirmBid(false)}
        onConfirm={async () => {
          setConfirmBid(false);
          await placeBid();
        }}
        title={t('gameplay:auction.confirmTitle')}
        confirmText={t('gameplay:auction.confirmAction')}
        isSubmitting={bidding}
      >
        {open && (
          <p>{t('gameplay:auction.confirmBody', { amount: eur(Number(amount)), player: pName(open) })}</p>
        )}
      </ConfirmModal>
    </div>
  );
}

const AU_CSS = `
.au-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.au-card{text-align:left;display:flex;flex-direction:column;gap:6px;padding:14px;cursor:pointer;
  background:var(--panel-gradient);border:1px solid var(--border-color);border-radius:var(--radius-retro);
  color:var(--text-primary);transition:border-color .15s,transform .15s}
.au-card:hover{border-color:color-mix(in srgb,var(--gold-accent) 45%,var(--border-color));transform:translateY(-1px)}
.au-name{font-family:var(--font-display);font-weight:700;font-size:1.02rem}
.au-sub{font-size:.7rem;color:var(--text-muted)}
.au-row{display:flex;justify-content:space-between;align-items:center;border-top:1px solid color-mix(in srgb,var(--border-color) 60%,transparent);padding-top:8px}
.au-bid{font-family:var(--font-mono-retro);font-weight:700;color:var(--gold-accent)}
.au-cd{font-family:var(--font-mono-retro);font-size:.78rem;color:var(--green-primary)}
.au-cd--hot{color:var(--red-danger);animation:aup 1s infinite}
.au-cd--end{color:var(--text-muted)}
@keyframes aup{50%{opacity:.45}}
.au-filter{padding:5px 11px;border-radius:6px;font-size:.72rem;cursor:pointer;background:var(--bg-elevated);
  border:1px solid var(--border-color);color:var(--text-muted);font-family:var(--font-mono-retro)}
.au-filter.on{color:var(--avatar-text);background:var(--gold-accent);border-color:transparent}
.au-winning{font-family:var(--font-mono-retro);font-size:.6rem;color:var(--green-primary);
  border:1px solid var(--green-primary);border-radius:99px;padding:2px 8px;align-self:flex-start}
.au-room-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.au-room-bid{font-family:var(--font-mono-retro);font-size:1.9rem;font-weight:700;color:var(--gold-accent);
  text-shadow:0 0 14px color-mix(in srgb,var(--gold-accent) 40%,transparent);transition:transform .2s,color .2s}
.au-room-bid[data-flash="true"]{transform:scale(1.04);color:var(--green-primary);text-shadow:0 0 18px color-mix(in srgb,var(--green-primary) 50%,transparent)}
.au-bid-ok{color:var(--green-primary)!important;font-weight:700}
.au-bids{max-height:200px;overflow-y:auto;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-retro)}
.au-bidrow{display:flex;justify-content:space-between;padding:7px 10px;font-size:.82rem;border-top:1px solid color-mix(in srgb,var(--border-color) 50%,transparent)}
.au-bidrow--sealed{color:var(--text-muted)}
.au-bidrow--sealed b{font-style:italic;font-weight:600;color:var(--text-muted)}
.au-bidrow b{font-family:var(--font-mono-retro)}
.au-input{flex:1;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:6px;padding:8px 10px;color:var(--text-primary);font-family:var(--font-mono-retro)}
`;
