// ─── EconomyAnalysisCharts — tab ANÁLISIS de EconomyPage (B17) ────────────────
// Presentación pura sobre GET /api/economy/analysis (API_UI §EconomiaAnalisis):
// medidor de ratio salarial con zonas sano/vigilancia/riesgo, evolución de la
// valoración, ingresos por competición y top variaciones. Tokens CSS v2.
import { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { eurFmt, RISK_META } from './chartUtils';

const AXIS_TICK = { fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' } as const;
const GRID_STROKE = 'color-mix(in srgb, var(--border-color) 40%, transparent)';
const TOOLTIP_STYLE = {
  borderRadius: 6,
  border: '1px solid var(--border-color)',
  backgroundColor: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'var(--font-mono-retro)',
  boxShadow: 'var(--shadow-soft)',
} as const;

// ── Medidor de ratio masa salarial / ingresos con zonas ──────────────────────
// Zonas espejo del backend (salaryRisk): ≤55 sano · ≤75 vigilancia · >75 riesgo.
const ZONES = [
  { from: 0, to: 55, color: 'var(--green-primary)', label: 'SANO' },
  { from: 55, to: 75, color: 'var(--gold-accent)', label: 'VIGILANCIA' },
  { from: 75, to: 110, color: 'var(--red-danger)', label: 'RIESGO' },
];


export function SalaryRatioGauge({ ratioPct, risk }: { ratioPct: number; risk: string }) {
  const W = 560, H = 86, PAD = 6, BAR_Y = 30, BAR_H = 20;
  const MAX = 110;
  const clamped = Math.max(0, Math.min(MAX, ratioPct));
  const x = (v: number) => PAD + (v / MAX) * (W - PAD * 2);
  const meta = RISK_META[risk] ?? RISK_META.healthy;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Ratio masa salarial sobre ingresos: ${ratioPct}% (${meta.label})`}>
        {ZONES.map(z => (
          <g key={z.label}>
            <rect x={x(z.from)} y={BAR_Y} width={x(z.to) - x(z.from)} height={BAR_H} rx={3}
              fill={`color-mix(in srgb, ${z.color} 18%, transparent)`}
              stroke={`color-mix(in srgb, ${z.color} 45%, transparent)`} strokeWidth={1} />
            <text x={(x(z.from) + x(z.to)) / 2} y={BAR_Y + BAR_H + 16} textAnchor="middle"
              fontFamily="var(--font-display)" fontSize="9.5" letterSpacing="1.4" fill={z.color}>
              {z.label}
            </text>
          </g>
        ))}
        {/* marcas 55 y 75 */}
        {[55, 75].map(v => (
          <g key={v}>
            <line x1={x(v)} y1={BAR_Y - 4} x2={x(v)} y2={BAR_Y + BAR_H + 4} stroke="var(--border-color)" strokeWidth={1} strokeDasharray="2 2" />
            <text x={x(v)} y={BAR_Y - 8} textAnchor="middle" fontFamily="var(--font-mono-retro)" fontSize="9" fill="var(--text-muted)">{v}%</text>
          </g>
        ))}
        {/* aguja */}
        <g>
          <line x1={x(clamped)} y1={BAR_Y - 6} x2={x(clamped)} y2={BAR_Y + BAR_H + 6} stroke={meta.color} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={x(clamped)} cy={BAR_Y - 10} r={3.2} fill={meta.color} />
          <text x={Math.min(W - 30, Math.max(30, x(clamped)))} y={BAR_Y + BAR_H + 34} textAnchor="middle"
            fontFamily="var(--font-mono-retro)" fontSize="15" fontWeight="700" fill={meta.color}>
            {ratioPct}%{ratioPct > MAX ? ' ⚠' : ''}
          </text>
        </g>
      </svg>
      <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{meta.desc}</p>
    </div>
  );
}

// ── Evolución de la valoración (proxy presupuesto + activos fijos) ───────────
export interface ValuationRow {
  week: number;
  season: string;
  valuationEstimate: number;
  budget: number;
  income: number;
  expenses: number;
}

export function ValuationEvolution({ rows }: { rows: ValuationRow[] }) {
  const data = useMemo(() => rows.map(r => ({
    label: `J${r.week}`,
    season: r.season,
    Valoración: r.valuationEstimate,
    Presupuesto: r.budget,
  })), [rows]);

  if (data.length < 2) {
    return (
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '12px 0' }}>
        Aún no hay suficientes turnos para dibujar la evolución de la valoración.
      </p>
    );
  }

  return (
    <div style={{ height: 220, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ecVal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--gold-accent)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--gold-accent)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => eurFmt(v)} width={62} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)', fontSize: 11 }}
            formatter={(value: any, name: any) => [eurFmt(Number(value)), String(name)]}
            labelFormatter={(label: any, payload: any) => {
              const season = payload?.[0]?.payload?.season;
              return season ? `${label} · ${season}` : String(label);
            }}
          />
          <Area type="monotone" dataKey="Valoración" stroke="var(--gold-accent)" fill="url(#ecVal)" strokeWidth={2} />
          <Area type="monotone" dataKey="Presupuesto" stroke="var(--blue-info)" fill="none" strokeWidth={1.4} strokeDasharray="4 3" />
        </AreaChart>
      </ResponsiveContainer>
      <p style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 2 }}>
        Valoración estimada (presupuesto + activos fijos) · línea discontinua: presupuesto.
      </p>
    </div>
  );
}

// ── Ingresos por competición (premios devengados) ─────────────────────────────
export interface CompetitionIncomeRow {
  id: number;
  week: number;
  competition: string;
  concept: string;
  amount: number;
}

export function CompetitionIncomePanel({ rows }: { rows: CompetitionIncomeRow[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const r of rows) {
      const cur = map.get(r.competition) ?? { total: 0, count: 0 };
      cur.total += r.amount; cur.count += 1;
      map.set(r.competition, cur);
    }
    return [...map.entries()]
      .map(([competition, v]) => ({ competition, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '12px 0' }}>
        Sin premios devengados todavía: los premios de liga, copa y Europa aparecerán aquí al cerrar jornadas y rondas.
      </p>
    );
  }

  const max = Math.max(1, ...grouped.map(g => g.total));
  const recent = rows.slice(0, 6);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {grouped.map(g => (
        <div key={g.competition}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.74rem', marginBottom: 3 }}>
            <b style={{ fontFamily: 'var(--font-display)' }}>{g.competition}</b>
            <span style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--gold-accent)', fontWeight: 700 }}>
              {eurFmt(g.total)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {g.count} {g.count === 1 ? 'premio' : 'premios'}</span>
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--track-color)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(g.total / max) * 100}%`, borderRadius: 3,
              background: 'color-mix(in srgb, var(--gold-accent) 70%, transparent)',
              boxShadow: '0 0 6px color-mix(in srgb, var(--gold-accent) 40%, transparent)',
            }} />
          </div>
        </div>
      ))}
      <div style={{ borderTop: '1px solid color-mix(in srgb,var(--border-color) 55%,transparent)', paddingTop: 8 }}>
        <p style={{ fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)', marginBottom: 4 }}>Últimos devengos</p>
        {recent.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.74rem', padding: '4px 0' }}>
            <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'var(--font-mono-retro)' }}>J{r.week}</span> · {r.concept}
            </span>
            <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)', flexShrink: 0 }}>+{eurFmt(r.amount)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Top variaciones del presupuesto ───────────────────────────────────────────
export interface VariationRow {
  week: number;
  season: string;
  budgetDelta: number;
  income: number;
  expenses: number;
  label: string;
}

export function TopVariations({ rows }: { rows: VariationRow[] }) {
  if (rows.length === 0) {
    return (
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '12px 0' }}>
        Sin variaciones registradas todavía.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {rows.map((r, i) => {
        const up = r.budgetDelta >= 0;
        const c = up ? 'var(--green-primary)' : 'var(--red-danger)';
        return (
          <div key={`${r.season}-${r.week}-${i}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i > 0 ? '1px solid color-mix(in srgb,var(--border-color) 50%,transparent)' : 'none' }}>
            <span style={{
              fontFamily: 'var(--font-mono-retro)', fontSize: '.7rem', color: c, width: 18, textAlign: 'center',
            }}>{up ? '▲' : '▼'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '.78rem', fontWeight: 600 }}>
                <span style={{ fontFamily: 'var(--font-mono-retro)' }}>J{r.week}</span>
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {r.season}</span>
              </p>
              <p style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>
                +{eurFmt(r.income)} / −{eurFmt(r.expenses)}
              </p>
            </div>
            <b style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.84rem', color: c }}>
              {up ? '+' : '−'}{eurFmt(Math.abs(r.budgetDelta))}
            </b>
          </div>
        );
      })}
    </div>
  );
}
