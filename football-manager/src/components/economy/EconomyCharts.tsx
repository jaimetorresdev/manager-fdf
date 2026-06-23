// ─── EconomyCharts — gráficas recharts del módulo financiero (E17 · lote A) ───
// Componentes de presentación puros: reciben datos ya normalizados desde
// EconomyPage. Todos los colores via tokens CSS (tema claro/oscuro + daltónico).
import { useMemo } from 'react';
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, PieChart, Pie,
} from 'recharts';

// ── helpers de formato (movidos a ./chartUtils para cumplir react-refresh) ─────
import { eurFmt } from './chartUtils';

function moneyValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

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

export interface ForecastMonth {
  label: string;
  gate: number;
  commercial: number;
  salaries: number;
  outsourcing: number;
  net: number;
  budgetAfter: number;
}

// ── Área apilada: ingresos vs gastos a 12 meses ──────────────────────────────
export function IncomeExpenseArea({ data }: { data: ForecastMonth[] }) {
  // Gastos como negativos para leer "lo que entra arriba, lo que sale abajo".
  const rows = useMemo(() => data.map((m) => ({
    label: m.label,
    Taquilla: moneyValue(m.gate),
    Comercial: moneyValue(m.commercial),
    Salarios: -moneyValue(m.salaries),
    Subcontratas: -moneyValue(m.outsourcing),
    caja: moneyValue(m.budgetAfter),
  })), [data]);

  return (
    <div style={{ height: 260, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} stackOffset="sign" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ecGate" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--green-primary)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--green-primary)" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="ecComm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--blue-info)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--blue-info)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="ecSal" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--red-danger)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--red-danger)" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="ecOut" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="var(--gold-accent)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--gold-accent)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => eurFmt(v)} width={62} />
          <ReferenceLine y={0} stroke="var(--border-color)" />
          <Tooltip
            formatter={(value: any, name: any) => [eurFmt(Math.abs(Number(value))), String(name)]}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)', fontSize: 11 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono-retro)' }} iconType="square" iconSize={9} />
          <Area type="monotone" dataKey="Taquilla" stackId="in" stroke="var(--green-primary)" fill="url(#ecGate)" strokeWidth={1.6} />
          <Area type="monotone" dataKey="Comercial" stackId="in" stroke="var(--blue-info)" fill="url(#ecComm)" strokeWidth={1.6} />
          <Area type="monotone" dataKey="Salarios" stackId="out" stroke="var(--red-danger)" fill="url(#ecSal)" strokeWidth={1.6} />
          <Area type="monotone" dataKey="Subcontratas" stackId="out" stroke="var(--gold-accent)" fill="url(#ecOut)" strokeWidth={1.6} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Línea de caja proyectada (12 meses) ──────────────────────────────────────
export function CashProjection({ data }: { data: ForecastMonth[] }) {
  const rows = useMemo(() => data.map((m) => ({
    ...m,
    budgetAfter: moneyValue(m.budgetAfter),
  })), [data]);
  return (
    <div style={{ height: 180, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ecCash2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--green-primary)" stopOpacity={0.22} />
              <stop offset="95%" stopColor="var(--green-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => eurFmt(v)} width={62} />
          <ReferenceLine y={0} stroke="color-mix(in srgb, var(--red-danger) 55%, transparent)" strokeDasharray="4 3" />
          <Tooltip
            formatter={(value: any) => [eurFmt(Number(value)), 'Caja proyectada']}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)', fontSize: 11 }}
          />
          <Area type="monotone" dataKey="budgetAfter" stroke="var(--green-primary)" fill="url(#ecCash2)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Waterfall: composición del cambio de caja del mes ────────────────────────
interface WaterfallProps {
  startBudget: number;
  gate: number;
  commercial: number;
  salaries: number;
  outsourcing: number;
}

export function MonthWaterfall({ startBudget, gate, commercial, salaries, outsourcing }: WaterfallProps) {
  // Cada paso es una barra flotante [base, base+delta] vía barra invisible + barra de valor.
  const rows = useMemo(() => {
    const start = moneyValue(startBudget);
    const steps: { name: string; delta: number; kind: 'start' | 'in' | 'out' | 'end' }[] = [
      { name: 'Caja', delta: start, kind: 'start' },
      { name: 'Taquilla', delta: moneyValue(gate), kind: 'in' },
      { name: 'Comercial', delta: moneyValue(commercial), kind: 'in' },
      { name: 'Salarios', delta: -moneyValue(salaries), kind: 'out' },
      { name: 'Subcontr.', delta: -moneyValue(outsourcing), kind: 'out' },
    ];
    let running = 0;
    const out = steps.map((s) => {
      const base = s.kind === 'start' ? 0 : Math.min(running, running + s.delta);
      const value = Math.abs(s.delta);
      running += s.delta;
      return { name: s.name, base, value, kind: s.kind, total: running, delta: s.delta };
    });
    out.push({ name: 'Final', base: Math.min(0, running), value: Math.abs(running), kind: 'end', total: running, delta: running });
    return out;
  }, [startBudget, gate, commercial, salaries, outsourcing]);

  const colorFor = (kind: string) =>
    kind === 'in' ? 'var(--green-primary)'
      : kind === 'out' ? 'var(--red-danger)'
        : kind === 'end' ? 'var(--gold-accent)'
          : 'var(--blue-info)';

  return (
    <div style={{ height: 220, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => eurFmt(v)} width={62} />
          <Tooltip
            cursor={{ fill: 'var(--row-hover)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row: any = payload[payload.length - 1]?.payload;
              if (!row) return null;
              return (
                <div style={{ ...TOOLTIP_STYLE, padding: '8px 10px' }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{label}</div>
                  <div style={{ color: colorFor(row.kind), fontWeight: 700 }}>
                    {row.kind === 'in' ? '+' : row.kind === 'out' ? '−' : ''}{eurFmt(Math.abs(row.delta))}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Acumulado: {eurFmt(row.total)}</div>
                </div>
              );
            }}
          />
          {/* base invisible para que la barra "flote" */}
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="wf" radius={[3, 3, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={colorFor(r.kind)} fillOpacity={r.kind === 'start' ? 0.55 : 0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Donut: masa salarial por posición + top jugadores ────────────────────────
export interface WageSlice { name: string; value: number; color: string }

export function WageDonut({ slices, total }: { slices: WageSlice[]; total: number }) {
  const data = useMemo(() => slices
    .map((slice) => ({ ...slice, value: moneyValue(slice.value) }))
    .filter((slice) => slice.value > 0), [slices]);
  const safeTotal = moneyValue(total);
  return (
    <div style={{ position: 'relative', height: 210, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            stroke="var(--bg-surface)"
            strokeWidth={2}
          >
            {data.map((s, i) => <Cell key={i} fill={s.color} />)}
          </Pie>
          <Tooltip
            formatter={(value: any, name: any) => [`${eurFmt(Number(value))}/mes`, String(name)]}
            contentStyle={TOOLTIP_STYLE}
          />
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <span style={{ fontSize: '.6rem', textTransform: 'uppercase', letterSpacing: 1.2, color: 'var(--text-muted)' }}>Masa salarial</span>
        <span style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '1.15rem', color: 'var(--text-primary)' }}>{eurFmt(safeTotal)}</span>
        <span style={{ fontSize: '.6rem', color: 'var(--text-muted)' }}>/ mes</span>
      </div>
    </div>
  );
}
