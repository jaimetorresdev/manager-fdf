// ─── FanAnalysisCharts — gráficas de afición (B16) ────────────────────────────
// Presentación pura: evolución de taquilla por turno + conversión €/aficionado.
// Datos de GET /api/fans/analysis (API_UI §AficionAnalisis). Tokens CSS v2.
import { useMemo } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { eurFmt } from '../economy/chartUtils';

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

export interface FanEvolutionRow {
  week: number;
  season: string;
  budget: number;
  income: number;
  ticketRevenue: number;
}

interface Props {
  rows: FanEvolutionRow[];
  /** Aficionados actuales — para la línea de conversión €/fan por turno. */
  totalFans: number;
}

/**
 * Evolución por turno: barras = taquilla de cada turno, línea = €/aficionado
 * (conversión afición→taquilla). Doble eje Y.
 */
export function FanEvolutionChart({ rows, totalFans }: Props) {
  const { t } = useTranslation('common');
  const data = useMemo(() => rows.map((r) => ({
    label: `${t('J')}${r.week}`,
    season: r.season,
    [t('Taquilla')]: r.ticketRevenue,
    [t('€/fan')]: totalFans > 0 ? Math.round((r.ticketRevenue / totalFans) * 100) / 100 : 0,
  })), [rows, totalFans, t]);

  if (data.length === 0) {
    return (
      <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '14px 0' }}>
        {t('Aún no hay turnos registrados: la evolución aparecerá cuando se procesen jornadas.')}
      </p>
    );
  }

  return (
    <div style={{ height: 240, minWidth: 0, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis yAxisId="eur" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => eurFmt(v)} width={58} />
          <YAxis yAxisId="fan" orientation="right" tick={AXIS_TICK} axisLine={false} tickLine={false} width={42}
            tickFormatter={(v) => `${v}€`} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)', fontSize: 11 }}
            formatter={(value: any, name: any) =>
              name === t('€/fan')
                ? [`${Number(value).toLocaleString('es-ES')} ${t('€/aficionado')}`, t('Conversión')]
                : [eurFmt(Number(value)), t('Taquilla del turno')]}
            labelFormatter={(label: any, payload: any) => {
              const season = payload?.[0]?.payload?.season;
              return season ? `${label} · ${season}` : String(label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono-retro)' }} iconType="square" iconSize={9} />
          <Bar yAxisId="eur" dataKey={t('Taquilla')} fill="var(--green-primary)" fillOpacity={0.55} radius={[3, 3, 0, 0]} maxBarSize={34} />
          <Line yAxisId="fan" type="monotone" dataKey={t('€/fan')} stroke="var(--gold-accent)" strokeWidth={2}
            dot={{ r: 2.4, fill: 'var(--gold-accent)' }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
