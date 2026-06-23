// ─── ShareTicker — terminal de bolsa para SharesPage (E17 · lote A) ───────────
// Cabecera tipo ticker con la cotización en grande + gráfica de evolución
// (recharts área) alimentada por el histórico observado en la sesión / backend.
import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { LineChart as LineChartIcon } from 'lucide-react';

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K €`;
  return `${v.toFixed(2)} €`;
}

interface Props {
  clubName: string;
  shareValue: number;
  /** Histórico de lecturas (orden cronológico). */
  history: number[];
  /** Variación frente a la lectura anterior, si la hay. */
  delta?: number;
}

export function ShareTicker({ clubName, shareValue, history, delta }: Props) {
  const up = delta == null || delta >= 0;
  const trendColor = up ? 'var(--green-primary)' : 'var(--red-danger)';
  const ticker = clubName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'CLUB';

  const rows = useMemo(() => history.map((v, i) => ({ i: `T${i + 1}`, v })), [history]);
  const first = history[0];
  const sessionDelta = history.length >= 2 ? shareValue - first : null;
  const sessionPct = sessionDelta != null && first > 0 ? (sessionDelta / first) * 100 : null;

  return (
    <div className="shx">
      <style>{`
        .shx{position:relative;overflow:hidden;display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:stretch;
          padding:18px 22px;background:var(--panel-gradient);border:1px solid var(--border-color);
          border-radius:var(--radius-retro);box-shadow:inset 0 1px 0 var(--bevel-light),var(--crt-glow)}
        .shx-scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px)}
        .shx-meta{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:230px}
        .shx-sym{display:inline-flex;align-items:center;gap:8px;font-family:var(--font-mono-retro);font-size:.7rem;letter-spacing:2px;color:var(--text-muted)}
        .shx-sym b{padding:2px 8px;border:1px solid var(--border-color);border-radius:3px;background:var(--bg-base);color:var(--gold-accent)}
        .shx-val{font-family:var(--font-mono-retro);font-weight:700;font-size:2.5rem;line-height:1.02;color:var(--shx-c);
          text-shadow:0 0 14px color-mix(in srgb,var(--shx-c) 35%,transparent)}
        .shx-delta{font-family:var(--font-mono-retro);font-weight:700;font-size:.84rem;color:var(--shx-c)}
        .shx-session{font-family:var(--font-mono-retro);font-size:.7rem;color:var(--text-muted)}
        .shx-chart{position:relative;z-index:1;min-height:120px}
        .shx-empty{display:flex;align-items:center;justify-content:center;gap:8px;height:100%;
          font-family:var(--font-mono-retro);font-size:.74rem;color:var(--text-muted)}
        @media(max-width:900px){.shx{grid-template-columns:1fr}.shx-chart{min-height:140px}}
        @media(prefers-reduced-motion:no-preference){
          @keyframes shx-blink{0%,49%{opacity:1}50%,100%{opacity:.25}}
          .shx-live{animation:shx-blink 1.4s step-end infinite}
        }
      `}</style>
      <div className="shx-scan" />

      <div className="shx-meta" style={{ ['--shx-c' as string]: trendColor }}>
        <span className="shx-sym">
          <b>{ticker}</b> {clubName.toUpperCase()}
          <span className="shx-live" style={{ color: 'var(--green-primary)' }}>● EN VIVO</span>
        </span>
        <span className="shx-val">{fmt(shareValue)}</span>
        {delta != null && (
          <span className="shx-delta">{up ? '▲' : '▼'} {fmt(Math.abs(delta))} vs. última lectura</span>
        )}
        {sessionDelta != null && sessionPct != null && (
          <span className="shx-session">
            Sesión: <b style={{ color: sessionDelta >= 0 ? 'var(--green-primary)' : 'var(--red-danger)' }}>
              {sessionDelta >= 0 ? '+' : '−'}{fmt(Math.abs(sessionDelta))} ({sessionPct >= 0 ? '+' : ''}{sessionPct.toFixed(2)}%)
            </b>
          </span>
        )}
      </div>

      <div className="shx-chart">
        {rows.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="shxFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={trendColor} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={trendColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="color-mix(in srgb,var(--border-color) 40%,transparent)" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}
                axisLine={false} tickLine={false} tickFormatter={(v) => fmt(Number(v))} width={64}
              />
              {first != null && <ReferenceLine y={first} stroke="var(--border-color)" strokeDasharray="4 3" />}
              <Tooltip
                formatter={(value: any) => [fmt(Number(value)), 'Cotización']}
                labelFormatter={(l) => `Lectura ${String(l).replace('T', '')}`}
                contentStyle={{
                  borderRadius: 6, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono-retro)',
                }}
              />
              <Area type="monotone" dataKey="v" stroke={trendColor} strokeWidth={2} fill="url(#shxFill)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="shx-empty">
            <LineChartIcon size={15} /> HISTÓRICO EN CONSTRUCCIÓN — RECARGA PARA ACUMULAR LECTURAS
          </div>
        )}
      </div>
    </div>
  );
}
