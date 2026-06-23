// ─── Negociación formal TransferAgreement (Etapa 8 / issue 5.4) ───────────────
// Proponer venta/compra entre clubes, aceptar/rechazar/contraofertar. En vivo por
// el canal WS privado club:{id} (negotiation:proposed/accepted/rejected/countered)
// con fallback automático a polling de la lista.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Handshake, ArrowRightLeft, Search, Loader2, Check, X as XIcon, Reply } from 'lucide-react';
import { negotiationsApi, playersApi, clubApi, worldApi, type NegotiationInput } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { subscribe, type LiveChannel } from '../lib/ws';
import { asArray } from '../lib/normalize';
import { eur } from '../lib/format';
import { validateOfferTerms } from '../lib/offersLogic';
import { Button, Modal, Skeleton, EmptyState, ConfirmModal } from '../components/ui';
import { DecisionSignal, type DecisionSignalParams } from '../components/market/DecisionSignal';
import { cn } from '../lib/cn';
import toast from 'react-hot-toast';

interface ClubRef { id: number; name?: string; shortName?: string; badge?: string }
interface Agreement {
  id: number; type: string; status: string; amount: number;
  fromClubId: number; toClubId: number; playerId: number;
  fromClub?: ClubRef | null; toClub?: ClubRef | null;
  player?: { id: number; name?: string; marketValue?: number; salary?: number; clubId?: number } | null;
  createdAt?: string;
  message?: string;
}
interface ClubLite { id: number; name: string; shortName?: string; country?: string }
interface PlayerLite { id: number; name: string; position?: string; overall?: number; marketValue?: number }

const STATUS_META: Record<string, { label: string; tone: string }> = {
  proposed: { label: 'PROPUESTA', tone: 'var(--gold-accent)' },
  accepted: { label: 'ACEPTADA', tone: 'var(--green-primary)' },
  rejected: { label: 'RECHAZADA', tone: 'var(--red-danger)' },
};

export function NegotiationsPage() {
  const { t } = useTranslation();
  const { club } = useSession();
  const myClubId = club?.id;

  const [rows, setRows] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'in' | 'out' | 'history'>('in');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<Agreement | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [proposeOpen, setProposeOpen] = useState(false);
  const [confirmAccept, setConfirmAccept] = useState<Agreement | null>(null);
  const [confirmReject, setConfirmReject] = useState<Agreement | null>(null);
  const chan = useRef<LiveChannel | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(asArray<Agreement>(await negotiationsApi.list()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('gameplay:negotiations.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void load(); }, [load]);

  // Canal privado del club: cualquier evento negotiation:* → recargar lista.
  useEffect(() => {
    if (!myClubId) return;
    chan.current = subscribe(
      `club:${myClubId}`,
      (msg) => {
        if (msg.type === 'poll') {
          const list = asArray<Agreement>(msg.payload);
          if (list.length || Array.isArray(msg.payload)) setRows(list);
        } else if (msg.type.startsWith('negotiation:')) {
          void load();
        }
      },
      () => negotiationsApi.list(),
      8000,
    );
    return () => chan.current?.close();
  }, [myClubId, load]);

  const inbox = useMemo(() => rows.filter(r => r.toClubId === myClubId && r.status === 'proposed'), [rows, myClubId]);
  const outbox = useMemo(() => rows.filter(r => r.fromClubId === myClubId && r.status === 'proposed'), [rows, myClubId]);
  const history = useMemo(() => rows.filter(r => r.status !== 'proposed'), [rows]);
  const view = tab === 'in' ? inbox : tab === 'out' ? outbox : history;

  const act = async (id: number, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id); setNotice(null);
    try { await fn(); setNotice(ok); await load(); }
    catch (e) { const msg = e instanceof Error ? e.message : 'Operación fallida'; toast.error(msg); setNotice(msg); }
    finally { setBusyId(null); }
  };

  const sendCounter = async () => {
    if (!counterFor) return;
    const v = Number(counterAmount);
    if (!Number.isFinite(v) || v <= 0) { toast.error(t('gameplay:negotiations.toasts.invalidCounter')); return; }
    await act(counterFor.id, () => negotiationsApi.counter(counterFor.id, {
      type: 'sale',
      targetClubId: counterFor.fromClubId,
      playerId: counterFor.playerId,
      amount: Math.round(v),
    }), t('gameplay:negotiations.toasts.counterSent'));
    setCounterFor(null); setCounterAmount('');
  };

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{NG_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <p className="muted-label"><Handshake size={12} style={{ display: 'inline' }} /> {t('gameplay:negotiations.multiplayer')} {chan.current?.mode === 'ws' ? t('gameplay:negotiations.liveWs') : chan.current ? t('gameplay:negotiations.livePoll') : ''}</p>
          <h1 className="section-title text-3xl">{t('gameplay:negotiations.title')}</h1>
        </div>
        <Button onClick={() => setProposeOpen(true)}><ArrowRightLeft size={14} /> {t('gameplay:negotiations.proposeTransfer')}</Button>
      </div>

      {notice && <div className="ng-notice" role="status">{notice}<button onClick={() => setNotice(null)} aria-label="Cerrar aviso" style={{ float: 'right', color: 'inherit' }}><XIcon size={13} /></button></div>}

      <div className="ng-tabs">
        {([['in', t('gameplay:negotiations.tabs.in'), inbox.length], ['out', t('gameplay:negotiations.tabs.out'), outbox.length], ['history', t('gameplay:negotiations.tabs.history'), history.length]] as const).map(([k, lbl, count]) => (
          <button key={k} className={cn('ng-tab', tab === k && 'on')} onClick={() => setTab(k)}>{lbl} ({count})</button>
        ))}
      </div>

      {loading && <Skeleton height={180} />}
      {!loading && error && (
        <EmptyState
          title={t('gameplay:negotiations.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => { setLoading(true); void load(); }}>{t('gameplay:negotiations.retry')}</Button>}
        />
      )}
      {!loading && !error && view.length === 0 && (
        <EmptyState
          icon={<Handshake size={28} />}
          title={tab === 'in' ? t('gameplay:negotiations.empty.inTitle') : tab === 'out' ? t('gameplay:negotiations.empty.outTitle') : t('gameplay:negotiations.empty.historyTitle')}
          hint={tab === 'history' ? t('gameplay:negotiations.empty.historyHint') : t('gameplay:negotiations.empty.defaultHint')}
        />
      )}

      {!loading && !error && view.map((r) => {
        const meta = STATUS_META[r.status] ?? { label: r.status?.toUpperCase?.() ?? '?', tone: 'var(--text-muted)' };
        const incoming = r.toClubId === myClubId;
        const isSelling = r.player?.clubId === myClubId;
        const opLabel = isSelling ? t('gameplay:negotiations.sale') : t('gameplay:negotiations.buy');
        return (
          <div key={r.id} className="ng-row">
            <div className="ng-main">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <b className="ng-player">{r.player?.name ?? `Jugador #${r.playerId}`}</b>
                <span className="ng-status" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-color)', padding: '2px 6px', fontSize: '0.6rem' }}>{opLabel}</span>
              </div>
              <span className="ng-clubs">
                {r.fromClub?.name ?? `Club #${r.fromClubId}`} <ArrowRightLeft size={11} style={{ display: 'inline' }} /> {r.toClub?.name ?? `Club #${r.toClubId}`}
              </span>
              {r.message && <span className="ng-sub" style={{ fontStyle: 'italic', marginTop: 2 }}>"{r.message}"</span>}
              {r.player?.marketValue != null && <span className="ng-sub">{t('gameplay:negotiations.marketValue', { value: eur(r.player.marketValue) })}</span>}
            </div>
            <b className="ng-amount">{eur(r.amount)}</b>
            <span className="ng-status" style={{ color: meta.tone, borderColor: meta.tone }}>{meta.label}</span>
            {incoming && r.status === 'proposed' && (
              <div className="ng-actions">
                <Button size="sm" disabled={busyId === r.id} onClick={() => setConfirmAccept(r)}>
                  {busyId === r.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {t('gameplay:negotiations.accept')}
                </Button>
                <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => { setCounterFor(r); setCounterAmount(String(r.amount || '')); }}>
                  <Reply size={13} /> {t('gameplay:negotiations.counter')}
                </Button>
                <Button size="sm" variant="secondary" disabled={busyId === r.id} onClick={() => setConfirmReject(r)}>
                  <XIcon size={13} /> {t('gameplay:negotiations.reject')}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Contraoferta */}
      <Modal open={!!counterFor} onClose={() => setCounterFor(null)} title={counterFor ? t('gameplay:negotiations.counterModalTitle', { player: counterFor.player?.name ?? 'jugador' }) : ''} width={420}>
        {counterFor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p className="ng-sub">{t('gameplay:negotiations.counterOriginal')} <b>{eur(counterFor.amount)}</b>. {t('gameplay:negotiations.counterHint')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="ng-input" type="number" value={counterAmount} onChange={e => setCounterAmount(e.target.value)} placeholder="Importe €" aria-label="Importe de la contraoferta" />
              <Button disabled={busyId === counterFor.id} onClick={() => void sendCounter()}>{t('gameplay:negotiations.send')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <ProposeModal open={proposeOpen} onClose={() => setProposeOpen(false)} myClubId={myClubId}
                    onDone={(msg) => { setProposeOpen(false); setNotice(msg); void load(); }} />

      <ConfirmModal
        open={!!confirmAccept}
        onClose={() => setConfirmAccept(null)}
        onConfirm={async () => {
          const row = confirmAccept;
          setConfirmAccept(null);
          if (row) await act(row.id, () => negotiationsApi.accept(row.id), 'Traspaso ejecutado ✔');
        }}
        title="Confirmar traspaso"
        confirmText={t('gameplay:negotiations.acceptAction')}
        isSubmitting={busyId === confirmAccept?.id}
      >
        <p>{t('gameplay:negotiations.acceptConfirm')}</p>
        {confirmAccept && (
          <p className="text-sm" style={{ marginTop: 8 }}>
            <strong>{confirmAccept.player?.name ?? `Jugador #${confirmAccept.playerId}`}</strong> · {eur(confirmAccept.amount)}
          </p>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={!!confirmReject}
        onClose={() => setConfirmReject(null)}
        onConfirm={async () => {
          const row = confirmReject;
          setConfirmReject(null);
          if (row) await act(row.id, () => negotiationsApi.reject(row.id), 'Propuesta rechazada');
        }}
        title="Rechazar propuesta"
        confirmText={t('gameplay:negotiations.rejectAction')}
        isDestructive
        isSubmitting={busyId === confirmReject?.id}
      >
        <p>{t('gameplay:negotiations.rejectConfirm')}</p>
        {confirmReject && (
          <p className="text-sm" style={{ marginTop: 8 }}>
            <strong>{confirmReject.player?.name ?? `Jugador #${confirmReject.playerId}`}</strong> · {eur(confirmReject.amount)}
          </p>
        )}
      </ConfirmModal>
    </div>
  );
}

// ─── Modal de propuesta: vender un jugador mío o comprar uno del rival ─────────
function ProposeModal({ open, onClose, myClubId, onDone }: {
  open: boolean; onClose: () => void; myClubId?: number; onDone: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const { club } = useSession();
  const [mode, setMode] = useState<'sell' | 'buy'>('buy');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClubLite[]>([]);
  const [target, setTarget] = useState<ClubLite | null>(null);
  const [players, setPlayers] = useState<PlayerLite[]>([]);
  const [playerId, setPlayerId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const selectedPlayer = useMemo(
    () => players.find(p => p.id === playerId) ?? null,
    [players, playerId],
  );

  const signalParams = useMemo<DecisionSignalParams | null>(() => {
    if (playerId === '') return null;
    const v = Number(amount);
    return {
      action: mode === 'buy' ? 'sign' : 'sell',
      playerId: Number(playerId),
      amount: Number.isFinite(v) && v > 0 ? Math.round(v) : undefined,
    };
  }, [mode, playerId, amount]);

  const termsAdvice = useMemo(
    () => validateOfferTerms(
      { amount: Number(amount) || 0 },
      {
        marketValue: selectedPlayer?.marketValue,
        buyerBudget: mode === 'buy' && club?.budget != null ? club.budget : undefined,
      },
    ),
    [amount, selectedPlayer, mode, club?.budget],
  );

  // Reset al abrir
  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setTarget(null); setPlayers([]); setPlayerId(''); setAmount(''); setMsg(null); }
  }, [open]);

  // Carga de jugadores según modo y club objetivo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode === 'sell') {
          const sq = asArray<any>(await playersApi.getSquad());
          if (!cancelled) setPlayers(sq.map(p => ({ id: p.id, name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), position: p.position, overall: p.overall, marketValue: p.marketValue })));
        } else if (target) {
          const sq = asArray<any>(await clubApi.getPublicSquad(target.id));
          if (!cancelled) setPlayers(sq.map(p => ({ id: p.id, name: p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim(), position: p.position, overall: p.overall, marketValue: p.marketValue })));
        } else {
          setPlayers([]);
        }
      } catch { if (!cancelled) setPlayers([]); }
    })();
    return () => { cancelled = true; };
  }, [mode, target]);

  const search = async () => {
    if (!query.trim()) return;
    try {
      const res = await worldApi.clubs({ q: query.trim(), take: 8 });
      setResults(asArray<any>((res as any)?.clubs ?? res)
        .filter(c => c && (c.id ?? c.clubId) !== myClubId)
        .map(c => ({ id: c.id ?? c.clubId, name: c.name, shortName: c.shortName, country: c.country }))
        .filter(c => Number.isFinite(c.id)));
    } catch { setResults([]); }
  };

  const submit = async () => {
    if (!target || playerId === '') { toast.error(t('gameplay:negotiations.toasts.pickClubPlayer')); setMsg(t('gameplay:negotiations.toasts.pickClubPlayer')); return; }
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) { toast.error(t('gameplay:negotiations.toasts.invalidAmount')); setMsg(t('gameplay:negotiations.toasts.invalidAmount')); return; }
    setBusy(true); setMsg(null);
    try {
      const input: NegotiationInput = {
        type: 'sale',
        targetClubId: target.id,
        playerId: Number(playerId),
        amount: Math.round(v),
        message: mode === 'sell' ? 'Propuesta de venta formal.' : 'Propuesta de compra formal.',
      };
      await negotiationsApi.propose(input);
      onDone(mode === 'sell' ? 'Propuesta de venta enviada' : 'Propuesta de compra enviada');
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'No se pudo proponer'; toast.error(errMsg); setMsg(errMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === 'buy' ? t('gameplay:negotiations.propose.buyTitle') : t('gameplay:negotiations.propose.sellTitle')} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="ng-tabs">
          <button className={cn('ng-tab', mode === 'buy' && 'on')} onClick={() => { setMode('buy'); setPlayerId(''); }}>{t('gameplay:negotiations.propose.buyTab')}</button>
          <button className={cn('ng-tab', mode === 'sell' && 'on')} onClick={() => { setMode('sell'); setPlayerId(''); }}>{t('gameplay:negotiations.propose.sellTab')}</button>
        </div>

        <div>
          <p className="ng-sub" style={{ marginBottom: 6 }}>{mode === 'buy' ? t('gameplay:negotiations.propose.ownerClub') : t('gameplay:negotiations.propose.targetClub')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="ng-input" placeholder={t('gameplay:negotiations.propose.searchClub')} value={target ? target.name : query}
                   onChange={e => { setTarget(null); setQuery(e.target.value); }}
                   onKeyDown={e => { if (e.key === 'Enter') void search(); }} aria-label="Buscar club" />
            <Button variant="secondary" size="sm" onClick={() => void search()} disabled={!query.trim()}><Search size={13} /></Button>
          </div>
          {!target && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {results.map(c => (
                <button key={c.id} className="ng-opt" onClick={() => { setTarget(c); setResults([]); }}>
                  {c.name}{c.country ? ` · ${c.country}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="ng-sub" style={{ marginBottom: 6 }}>{t('gameplay:negotiations.propose.player')}</p>
          <select className="ng-input" value={playerId} onChange={e => setPlayerId(e.target.value ? Number(e.target.value) : '')} aria-label="Jugador del traspaso">
            <option value="">{mode === 'buy' && !target ? t('gameplay:negotiations.propose.pickClubFirst') : t('gameplay:negotiations.propose.pickPlayer')}</option>
            {players.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.position ? ` · ${p.position}` : ''}{p.overall ? ` · ${p.overall}` : ''}{p.marketValue != null ? ` · ${eur(p.marketValue)}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="ng-sub" style={{ marginBottom: 6 }}>{t('gameplay:negotiations.propose.amount')}</p>
          <input className="ng-input" type="number" placeholder="€" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Importe del traspaso" />
        </div>

        <DecisionSignal params={signalParams} compact />

        {termsAdvice.warnings.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: '.72rem', color: 'var(--gold-accent)' }}>
            {termsAdvice.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}

        {msg && <p className="ng-sub" style={{ color: 'var(--gold-accent)' }}>{msg}</p>}
        <Button disabled={busy} onClick={() => void submit()}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Handshake size={14} />} {mode === 'buy' ? t('gameplay:negotiations.propose.sendBuy') : t('gameplay:negotiations.propose.sendSell')}
        </Button>
      </div>
    </Modal>
  );
}

const NG_CSS = `
.ng-tabs{display:flex;gap:6px}
.ng-tab{padding:6px 12px;border-radius:6px;font-size:.76rem;cursor:pointer;background:var(--bg-elevated);
  border:1px solid var(--border-color);color:var(--text-muted);font-family:var(--font-mono-retro)}
.ng-tab.on{color:var(--avatar-text);background:var(--green-primary);border-color:transparent}
.ng-row{display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--panel-gradient);
  border:1px solid var(--border-color);border-radius:var(--radius-retro);animation:ngIn .25s ease both}
@keyframes ngIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.ng-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.ng-player{font-family:var(--font-display);font-size:.98rem}
.ng-clubs{font-size:.74rem;color:var(--text-muted)}
.ng-sub{font-size:.72rem;color:var(--text-muted)}
.ng-amount{font-family:var(--font-mono-retro);font-size:1.05rem;color:var(--gold-accent);white-space:nowrap}
.ng-status{font-family:var(--font-mono-retro);font-size:.62rem;padding:3px 8px;border-radius:99px;border:1px solid;white-space:nowrap}
.ng-actions{display:flex;gap:6px;flex-wrap:wrap}
.ng-input{flex:1;width:100%;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:6px;
  padding:8px 10px;color:var(--text-primary);font-size:.84rem}
.ng-opt{text-align:left;padding:7px 10px;border:1px solid var(--border-color);border-radius:6px;cursor:pointer;
  background:var(--bg-surface);color:var(--text-primary);font-size:.8rem}
.ng-opt:hover{border-color:var(--green-primary)}
.ng-notice{font-size:.78rem;font-family:var(--font-mono-retro);padding:8px 12px;border-radius:6px;
  border:1px solid var(--gold-accent);color:var(--gold-accent);background:color-mix(in srgb,var(--gold-accent) 8%,transparent)}
@media(max-width:680px){.ng-row{flex-wrap:wrap}}
`;
