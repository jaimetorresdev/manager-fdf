// ─── X7 · Deadline Day (evento en vivo de cierre de ventana) ──────────────────
// Consume GET /api/market/deadline-day (marketApi.deadlineDay, API_UI §X7):
//   { status:{active,phase,closesAt,hoursRemaining,panicIndex},
//     ticker:[{id,kind,urgency,text,route,ts,meta}],
//     expiringAuctions:[{id,endsAt,currentBid,winningClubId,sellerClub,player,ws}],
//     ws:{market,club} }
// Solo se muestra cuando la ventana entra en sus últimas 24 h (status.active).
// Tiempo real por POLLING (fallback oficial = repetir el endpoint); cuenta atrás
// local por estado (sin Date.now() en render). Defensivo; tokens CSS; sin neón.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, ArrowLeftRight, Handshake, MessageCircle, Info, Flame, Timer } from 'lucide-react';
import { marketApi } from '../../api/client';
import { asArray } from '../../lib/normalize';
import { eur, fmtTime } from '../../lib/format';

interface TickerItem { id?: string; kind?: string; urgency?: string; text?: string; route?: string; ts?: string }
interface ExpiringAuction {
  id?: number; endsAt?: string; currentBid?: number; winningClubId?: number;
  sellerClub?: { id?: number; shortName?: string; badge?: string };
  player?: { id?: number; name?: string; position?: string; marketValue?: number };
}
interface DeadlineStatus { active?: boolean; phase?: string; closesAt?: string; hoursRemaining?: number; panicIndex?: number }
interface DeadlineData { status?: DeadlineStatus; ticker?: TickerItem[]; expiringAuctions?: ExpiringAuction[] }

const URGENCY_COLOR: Record<string, string> = {
  low: 'var(--text-muted)', medium: 'var(--blue-info)', high: 'var(--gold-accent)', panic: 'var(--red-danger)',
};
const KIND_ICON: Record<string, React.ReactNode> = {
  system: <Info size={13} />, transfer: <ArrowLeftRight size={13} />, offer: <Handshake size={13} />,
  rumor: <MessageCircle size={13} />, auction: <Gavel size={13} />,
};

const DD_CSS = `
.dd{border-radius:14px;padding:18px 20px;border:1px solid color-mix(in srgb,var(--red-danger) 42%,var(--border-color));
  background:linear-gradient(135deg,var(--bg-surface) 0%,color-mix(in srgb,var(--red-danger) 12%,var(--bg-surface)) 100%);
  box-shadow:var(--shadow-soft);display:flex;flex-direction:column;gap:14px}
.dd-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dd-badge{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-display);font-weight:800;
  font-size:.78rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--red-danger)}
.dd-count{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-family:var(--font-mono-retro);
  font-weight:700;font-size:1.1rem;color:var(--text-primary)}
.dd-panic{display:flex;flex-direction:column;gap:4px}
.dd-panic-l{display:flex;justify-content:space-between;font-size:.68rem;text-transform:uppercase;
  letter-spacing:.8px;color:var(--text-muted)}
.dd-panic-bar{height:8px;border-radius:6px;background:var(--bg-elevated);overflow:hidden}
.dd-panic-fill{height:100%;border-radius:6px;background:var(--red-danger)}
.dd-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:780px){.dd-cols{grid-template-columns:1fr}}
.dd-sec-h{font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:8px}
.dd-tick{display:flex;flex-direction:column;gap:6px;max-height:280px;overflow:auto}
.dd-tick-row{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:8px;
  background:var(--bg-elevated);border:1px solid var(--border-color)}
.dd-tick-row .ic{flex:none;margin-top:1px}
.dd-tick-row .tx{font-size:.8rem;color:var(--text-primary);line-height:1.35;min-width:0}
.dd-tick-row .meta{font-size:.64rem;color:var(--text-muted);margin-top:2px}
.dd-auc{display:flex;flex-direction:column;gap:8px}
.dd-auc-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;
  background:var(--bg-elevated);border:1px solid var(--border-color)}
.dd-auc-row .name{font-weight:700;font-size:.82rem;color:var(--text-primary)}
.dd-auc-row .bid{margin-left:auto;text-align:right}
.dd-auc-row .bid b{font-family:var(--font-mono-retro);color:var(--gold-accent);font-size:.85rem}
.dd-auc-row .bid small{display:block;font-size:.62rem;color:var(--text-muted)}
.dd-empty{font-size:.74rem;color:var(--text-muted);font-style:italic;padding:4px 2px}
`;

/** Cuenta atrás "Xh Ym" (o "Ym Zs" en la última hora) entre now y closesAt. */
function formatRemaining(closesAt: string | undefined, nowMs: number): string {
  if (!closesAt) return '—';
  const ms = +new Date(closesAt) - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return 'cerrada';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;
}

export function DeadlineDayPanel() {
  const [data, setData] = useState<DeadlineData | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mounted = useRef(true);

  // Cuenta atrás local (estado, no Date.now() en render → cumple A6).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Carga + polling. Más rápido en deadline_day; fallback oficial = repetir GET.
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const d = await marketApi.deadlineDay();
        if (mounted.current) setData(d as DeadlineData);
        if (mounted.current) {
          const fast = (d as DeadlineData)?.status?.phase === 'deadline_day';
          timer = setTimeout(tick, fast ? 12000 : 25000);
        }
      } catch {
        /* error de poll: conservamos los últimos datos (no spam de toasts) */
        if (mounted.current) timer = setTimeout(tick, 25000);
      }
    };
    tick();
    return () => { mounted.current = false; if (timer) clearTimeout(timer); };
  }, []);

  const status = data?.status;
  if (!status?.active) return null; // solo en las últimas 24 h de ventana

  const ticker = asArray<TickerItem>(data?.ticker);
  const auctions = asArray<ExpiringAuction>(data?.expiringAuctions);
  const panic = Math.max(0, Math.min(100, Number(status.panicIndex ?? 0)));
  const isDeadline = status.phase === 'deadline_day';

  return (
    <div className="dd">
      <style>{DD_CSS}</style>
      <div className="dd-top">
        <span className="dd-badge">
          <Flame size={15} /> {isDeadline ? 'Deadline Day' : 'Cierre de ventana'}
        </span>
        <span className="dd-count">
          <Timer size={15} style={{ color: 'var(--red-danger)' }} />
          {formatRemaining(status.closesAt, now)}
        </span>
      </div>

      <div className="dd-panic">
        <div className="dd-panic-l"><span>Índice de pánico</span><span>{panic}</span></div>
        <div className="dd-panic-bar"><div className="dd-panic-fill" style={{ width: `${panic}%` }} /></div>
      </div>

      <div className="dd-cols">
        <div>
          <div className="dd-sec-h">Última hora</div>
          {ticker.length === 0 ? (
            <p className="dd-empty">Sin movimientos por ahora.</p>
          ) : (
            <div className="dd-tick">
              {ticker.map((t, i) => {
                const color = URGENCY_COLOR[t.urgency ?? 'low'] ?? 'var(--text-muted)';
                const body = (
                  <>
                    <span className="ic" style={{ color }}>{KIND_ICON[t.kind ?? 'system'] ?? <Info size={13} />}</span>
                    <span className="tx">
                      {t.text}
                      {t.ts && <span className="meta">{fmtTime(t.ts)}</span>}
                    </span>
                  </>
                );
                return t.route ? (
                  <Link key={t.id ?? i} to={t.route} className="dd-tick-row" style={{ borderLeft: `3px solid ${color}` }}>{body}</Link>
                ) : (
                  <div key={t.id ?? i} className="dd-tick-row" style={{ borderLeft: `3px solid ${color}` }}>{body}</div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <div className="dd-sec-h">Subastas expirando</div>
          {auctions.length === 0 ? (
            <p className="dd-empty">Ninguna subasta a punto de cerrar.</p>
          ) : (
            <div className="dd-auc">
              {auctions.map((a, i) => (
                <Link key={a.id ?? i} to="/auctions" className="dd-auc-row">
                  <Gavel size={15} style={{ color: 'var(--red-danger)', flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="name">{a.player?.name ?? 'Jugador'} {a.player?.position ? `· ${a.player.position}` : ''}</div>
                    {a.endsAt && <div style={{ fontSize: '.64rem', color: 'var(--text-muted)' }}>cierra {fmtTime(a.endsAt)}</div>}
                  </div>
                  <div className="bid">
                    <b>{eur(a.currentBid)}</b>
                    {a.player?.marketValue != null && <small>valor {eur(a.player.marketValue)}</small>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
