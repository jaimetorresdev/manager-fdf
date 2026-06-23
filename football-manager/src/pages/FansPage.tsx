// ─── FansPage — masa social del club (E17 · lote A + B16 análisis ampliado) ───
// Pirámide social INTERACTIVA a ancho completo (clic en estrato → detalle con
// rendimiento de taquilla y riesgo), evolución por turno, conversión
// afición→taquilla (€/fan + rank) y comparativa con clubes de la liga.
// Datos: GET /api/fans + GET /api/fans/analysis (API_UI §AficionAnalisis).
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users, AlertTriangle, TrendingUp, Heart, Megaphone, Flame, Gauge,
  CalendarClock, Coins, Trophy, LineChart as LineChartIcon, BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/cn';
import { fansApi } from '../api/client';
import {
  KPICard, Skeleton, EmptyState, Button, StatBar, Badge, SectionHeader,
  SortableTable, ClubBadge, type SortCol,
} from '../components/ui';
import { FanPyramid, type PyramidLevel } from '../components/social/FanPyramid';
import { FanEvolutionChart, type FanEvolutionRow } from '../components/social/FanAnalysisCharts';
import { FanPulsePanel } from '../components/social/FanPulsePanel';

function formatMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M €`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K €`;
  return `${v} €`;
}

const CAMPAIGN_LABELS: Record<string, string> = {
  familyDay: 'Día de familia',
  schoolProgram: 'Programa escolar',
  vipHospitality: 'Hospitalidad VIP',
  cityCampaign: 'Campaña ciudad',
  derbyHype: 'Hype del derby',
};

// B16 · estratos de la pirámide → segmentos del análisis y narrativa de yield
const LEVEL_SEGMENT_IDS: string[][] = [
  ['youngHigh', 'adultHigh'],  // 0 · alta renta (cúspide)
  ['youngMid', 'adultMid'],    // 1 · renta media
  ['youngLow', 'adultLow'],    // 2 · renta baja (base)
];

const LEVEL_NARRATIVE: { yield: string; desc: string }[] = [
  { yield: 'high', desc: 'Máximo gasto por entrada: palcos, abonos premium y hospitalidad VIP. Pocos pero muy rentables.' },
  { yield: 'medium', desc: 'El grueso fiable de la taquilla: abonos estándar y consumo regular. Crece con resultados.' },
  { yield: 'low', desc: 'La base más numerosa y ruidosa: entradas baratas, mucho ambiente… y el origen del riesgo de disturbios.' },
];

const YIELD_META: Record<string, { label: string; variant: 'success' | 'info' | 'warning' }> = {
  high: { label: 'Rendimiento ALTO', variant: 'success' },
  medium: { label: 'Rendimiento MEDIO', variant: 'info' },
  low: { label: 'Rendimiento BAJO', variant: 'warning' },
};

interface AnalysisSegment {
  id: string;
  label: string;
  fans: number;
  pct: number;
  ticketYield: 'low' | 'medium' | 'high';
  risk: string | null;
}

interface PeerRow {
  club: { id: number; name?: string; shortName?: string; badge?: string | null };
  fans: number;
  socialMass: number;
  highClass: number;
  reputation?: number;
  rank: number;
}

export function FansPage() {
  const { t } = useTranslation('common');
  const [data, setData] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [moodData, setMoodData] = useState<{ mood: string; score: number; reasons: string[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const loadFans = useCallback(async () => {
    setError(null);
    // El análisis (B16) es aditivo: si falla, la página base sigue funcionando.
    const [base, extra, mood] = await Promise.allSettled([fansApi.get(), fansApi.analysis(), fansApi.mood()]);
    if (base.status === 'fulfilled') {
      setData(base.value);
    } else {
      const msg = (base.reason as any)?.message ?? t('No se pudo cargar la afición');
      setError(msg);
      toast.error(msg);
    }
    if (extra.status === 'fulfilled') setAnalysis(extra.value);
    if (mood.status === 'fulfilled') setMoodData(mood.value);
    setLoading(false);
  }, [t]);

  useEffect(() => { loadFans(); }, [loadFans]);

  const startCampaign = async (type: string) => {
    setSubmitting(type);
    try {
      await fansApi.startCampaign(type);
      toast.success(`${t('Campaña')} "${CAMPAIGN_LABELS[type] ?? type}" ${t('iniciada')}`);
      await loadFans();
    } catch (e: any) {
      toast.error(e.message ?? t('No se pudo iniciar la campaña'));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skeleton height={60} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={92} />)}
        </div>
        <Skeleton height={300} />
        <Skeleton height={240} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="page-surface">
        <EmptyState
          icon={<AlertTriangle size={36} />}
          title={t('Afición no disponible')}
          hint={error ?? t('Sin datos de afición')}
          action={<Button variant="secondary" size="sm" onClick={() => { setLoading(true); loadFans(); }}>{t('Reintentar')}</Button>}
        />
      </div>
    );
  }

  const { summary, segments, activeCampaigns, availableCampaigns, budget } = data ?? {};
  const total = summary?.totalFans ?? 0;

  // Pirámide social: alta renta arriba (estrecha), baja renta abajo (ancha)
  const PYRAMID: PyramidLevel[] = [
    { label: 'Alta renta', value: (segments?.youngHigh ?? 0) + (segments?.adultHigh ?? 0), color: 'var(--gold-accent)', detail: `J ${(segments?.youngHigh ?? 0).toLocaleString('es-ES')} · A ${(segments?.adultHigh ?? 0).toLocaleString('es-ES')}` },
    { label: 'Renta media', value: (segments?.youngMid ?? 0) + (segments?.adultMid ?? 0), color: 'var(--green-primary)', detail: `J ${(segments?.youngMid ?? 0).toLocaleString('es-ES')} · A ${(segments?.adultMid ?? 0).toLocaleString('es-ES')}` },
    { label: 'Renta baja', value: (segments?.youngLow ?? 0) + (segments?.adultLow ?? 0), color: 'var(--blue-info)', detail: `J ${(segments?.youngLow ?? 0).toLocaleString('es-ES')} · A ${(segments?.adultLow ?? 0).toLocaleString('es-ES')}` },
  ];

  const reputation = Number(summary?.reputation ?? 0);
  const lowPct = Number(summary?.bothLowPct ?? 0); // % de renta baja → proxy del riesgo de disturbios

  // B16 · análisis ampliado (puede no estar si el endpoint falla — degradar con dignidad)
  const aSummary = analysis?.summary;
  const aSegments: AnalysisSegment[] = Array.isArray(analysis?.segments) ? analysis.segments : [];
  const evolution: FanEvolutionRow[] = Array.isArray(analysis?.evolution) ? analysis.evolution : [];
  const peers: PeerRow[] = Array.isArray(analysis?.peerComparison) ? analysis.peerComparison : [];
  const myClubId = analysis?.club?.id;

  // Detalle del estrato seleccionado: segmentos joven/adulto que lo componen
  const selectedSegments: AnalysisSegment[] = selectedLevel == null ? [] :
    LEVEL_SEGMENT_IDS[selectedLevel]
      .map(id => aSegments.find(s => s.id === id) ?? {
        // Fallback sin análisis: contar desde los segmentos crudos de /fans
        id,
        label: id.startsWith('young') ? 'Joven' : 'Adulta',
        fans: segments?.[id] ?? 0,
        pct: total > 0 ? Math.round(((segments?.[id] ?? 0) / total) * 100) : 0,
        ticketYield: (LEVEL_NARRATIVE[selectedLevel].yield as AnalysisSegment['ticketYield']),
        risk: null,
      });

  const peerColumns: SortCol<PeerRow>[] = [
    { key: 'rank', header: '#', align: 'center', render: r => <span style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--text-muted)' }}>{r.rank}</span>, sortValue: r => r.rank },
    {
      key: 'club', header: t('Club'), render: r => (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <ClubBadge id={r.club.id} name={r.club.name ?? r.club.shortName} size={20} />
          <span style={{ fontWeight: r.club.id === myClubId ? 700 : 500 }}>{r.club.shortName ?? r.club.name}</span>
          {r.club.id === myClubId && <Badge variant="success" size="sm">{t('TÚ')}</Badge>}
        </span>
      ), sortValue: r => r.club.shortName ?? r.club.name ?? '',
    },
    { key: 'fans', header: t('Aficionados'), align: 'right', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)' }}>{(r.fans ?? 0).toLocaleString('es-ES')}</b>, sortValue: r => r.fans ?? 0 },
    { key: 'socialMass', header: t('Masa social'), align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono-retro)' }}>{(r.socialMass ?? 0).toLocaleString('es-ES')}</span>, sortValue: r => r.socialMass ?? 0 },
    { key: 'highClass', header: t('Clase alta'), align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--gold-accent)' }}>{(r.highClass ?? 0).toLocaleString('es-ES')}</span>, sortValue: r => r.highClass ?? 0 },
    { key: 'reputation', header: t('Reputación'), align: 'right', render: r => <span style={{ fontFamily: 'var(--font-mono-retro)' }}>{r.reputation ?? '—'}</span>, sortValue: r => r.reputation ?? 0 },
  ];

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .fn-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px}
        .fn-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:14px;align-items:start}
        .fn-pyr-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:18px;align-items:start}
        .fn-alert{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-radius:var(--radius-retro);
          background:color-mix(in srgb,var(--red-danger) 10%,transparent);
          border:1px solid color-mix(in srgb,var(--red-danger) 40%,transparent);
          box-shadow:0 0 14px color-mix(in srgb,var(--red-danger) 18%,transparent)}
        .fn-alert-title{font-family:var(--font-display);font-weight:700;font-size:.92rem;color:var(--red-danger);text-transform:uppercase;letter-spacing:.8px}
        .fn-alert-sub{font-size:.78rem;color:color-mix(in srgb,var(--red-danger) 80%,var(--text-primary))}
        .fn-meter{display:flex;flex-direction:column;gap:5px;padding:10px 0}
        .fn-meter+.fn-meter{border-top:1px solid color-mix(in srgb,var(--border-color) 55%,transparent)}
        .fn-meter-head{display:flex;justify-content:space-between;align-items:baseline}
        .fn-meter-l{font-size:.66rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-muted)}
        .fn-meter-v{font-family:var(--font-mono-retro);font-weight:700;font-size:1.3rem;color:var(--fn-c)}
        .fn-detail{padding:12px 14px;border-radius:var(--radius-retro);border:1px solid var(--border-color);
          background:var(--bg-elevated);box-shadow:inset 0 1px 0 var(--bevel-light);display:flex;flex-direction:column;gap:10px}
        .fn-detail-title{font-family:var(--font-display);font-weight:700;font-size:.9rem;color:var(--text-primary);text-transform:uppercase;letter-spacing:.8px}
        .fn-detail-desc{font-size:.74rem;color:var(--text-muted);line-height:1.45}
        .fn-detail-seg{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px;
          border-radius:var(--radius-retro);background:var(--bg-surface);border:1px solid color-mix(in srgb,var(--border-color) 60%,transparent)}
        .fn-detail-hint{font-size:.7rem;color:var(--text-muted);font-style:italic}
        .fn-camp{display:flex;flex-direction:column;gap:10px}
        .fn-camp-card{padding:12px;border-radius:var(--radius-retro);border:1px solid var(--border-color);background:var(--bg-elevated);box-shadow:inset 0 1px 0 var(--bevel-light)}
        .fn-camp-card.is-active{border-color:color-mix(in srgb,var(--green-primary) 35%,transparent);background:color-mix(in srgb,var(--green-primary) 6%,var(--bg-elevated))}
        .fn-camp-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
        .fn-camp-name{font-family:var(--font-display);font-weight:700;font-size:.86rem;color:var(--text-primary)}
        .fn-camp-meta{font-size:.7rem;color:var(--text-muted);font-family:var(--font-mono-retro)}
        .fn-camp-cost{font-family:var(--font-mono-retro);font-weight:700;font-size:.8rem;color:var(--gold-accent)}
        .fn-feed-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-retro);background:var(--bg-elevated);
          border:1px solid color-mix(in srgb,var(--green-primary) 22%,transparent);border-left-width:3px}
        .fn-feed-time{font-size:.66rem;color:var(--text-muted);font-family:var(--font-mono-retro)}
        .fn-peer-wrap{max-height:380px;overflow:auto}
        .fn-peer-wrap tr.row-highlight td{background:color-mix(in srgb,var(--green-primary) 9%,transparent)}
        @media(max-width:1100px){.fn-kpis{grid-template-columns:repeat(3,1fr)}}
        @media(max-width:900px){.fn-kpis{grid-template-columns:repeat(2,1fr)}.fn-grid{grid-template-columns:1fr}.fn-pyr-grid{grid-template-columns:1fr}}
      `}</style>

      <div>
        <p className="muted-label">{t('Masa social del club')}</p>
        <h1 className="section-title text-3xl font-display phosphor">{t('Afición')}</h1>
      </div>

      {summary?.disturbanceRisk && (
        <div className="fn-alert" role="alert">
          <Flame size={20} style={{ color: 'var(--red-danger)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p className="fn-alert-title">⚠ {t('Riesgo de disturbios')}</p>
            <p className="fn-alert-sub">
              {t('Alta proporción de aficionados de renta baja. Multa estimada:')}{' '}
              <b style={{ fontFamily: 'var(--font-mono-retro)' }}>{formatMoney(summary?.disturbanceFineEstimate ?? 0)}</b>
            </p>
          </div>
        </div>
      )}

      <div className="fn-kpis">
        <KPICard label={t('Total aficionados')} value={total.toLocaleString('es-ES')} tone="green" icon={<Users size={16} />} />
        <KPICard label={t('Clase alta')} value={(summary?.highClassFans ?? 0).toLocaleString('es-ES')} tone="gold" icon={<Heart size={16} />} />
        <KPICard label={t('Masa social')} value={(summary?.socialMass ?? 0).toLocaleString('es-ES')} tone="blue" icon={<TrendingUp size={16} />} />
        <KPICard label={t('Reputación')} value={`${summary?.reputation ?? '—'}`} hint={t('sobre 100')} tone={reputation >= 60 ? 'green' : reputation >= 40 ? 'gold' : 'red'} icon={<Gauge size={16} />} />
        <KPICard
          label={t('€ / aficionado')}
          value={aSummary ? `${Number(aSummary.ticketRevenuePerFan ?? 0).toLocaleString('es-ES')} €` : '—'}
          hint={t('taquilla últimos 6 turnos')}
          tone="gold" icon={<Coins size={16} />}
        />
        <KPICard
          label={t('Rank de afición')}
          value={aSummary?.rankInPeerGroup != null ? `#${aSummary.rankInPeerGroup}` : '—'}
          hint={aSummary ? `${t('de')} ${aSummary.peerClubs ?? '—'} ${t('clubes')}` : t('en tus competiciones')}
          tone={aSummary?.rankInPeerGroup != null && aSummary.rankInPeerGroup <= 3 ? 'green' : 'neutral'}
          icon={<Trophy size={16} />}
        />
      </div>

      {/* Pirámide social a ANCHO COMPLETO + detalle interactivo (B16) */}
      <SectionHeader title={t('Pirámide social')} icon={<Users size={14} />}>
        <div className="fn-pyr-grid">
          <div>
            <FanPyramid
              levels={PYRAMID}
              total={total}
              selectedIndex={selectedLevel}
              onSelect={(i) => setSelectedLevel(prev => prev === i ? null : i)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 8, fontFamily: 'var(--font-mono-retro)' }}>
              <span>{t('JÓVENES BAJA RENTA:')} {summary?.youngLowPct ?? 0}%</span>
              <span>{t('RENTA BAJA TOTAL:')} {summary?.bothLowPct ?? 0}%</span>
            </div>
          </div>

          {selectedLevel == null ? (
            <div className="fn-detail" aria-live="polite">
              <p className="fn-detail-title">{t('Anatomía de la grada')}</p>
              <p className="fn-detail-desc">
                {t('Cada estrato gasta distinto en taquilla y conlleva riesgos diferentes.')}
                {t('Haz')} <b>{t('clic en un estrato')}</b> {t('de la pirámide para ver su composición, rendimiento de taquilla y riesgo.')}
              </p>
              <p className="fn-detail-hint">{t('La cúspide paga más por asiento; la base llena el estadio.')}</p>
            </div>
          ) : (
            <div className="fn-detail" aria-live="polite">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <p className="fn-detail-title" style={{ color: PYRAMID[selectedLevel].color }}>{PYRAMID[selectedLevel].label}</p>
                <Badge variant={YIELD_META[LEVEL_NARRATIVE[selectedLevel].yield].variant}>
                  {YIELD_META[LEVEL_NARRATIVE[selectedLevel].yield].label}
                </Badge>
              </div>
              <p className="fn-detail-desc">{LEVEL_NARRATIVE[selectedLevel].desc}</p>
              {selectedSegments.map(seg => (
                <div key={seg.id} className="fn-detail-seg">
                  <div>
                    <p style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{seg.label}</p>
                    <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>
                      {(seg.fans ?? 0).toLocaleString('es-ES')} · {seg.pct ?? 0}% {t('del total')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {seg.risk === 'disturbance' && <Badge variant="danger" size="sm">⚠ {t('DISTURBIOS')}</Badge>}
                    <Badge variant={YIELD_META[seg.ticketYield]?.variant ?? 'neutral'} size="sm">
                      {seg.ticketYield === 'high' ? t('ALTO') : seg.ticketYield === 'medium' ? t('MEDIO') : t('BAJO')}
                    </Badge>
                  </div>
                </div>
              ))}
              <p className="fn-detail-hint">{t('Las campañas de captación mueven estratos concretos: elige según lo que necesites.')}</p>
            </div>
          )}
        </div>
      </SectionHeader>

      <div className="fn-grid">
        {/* Evolución por turno + conversión afición→taquilla (B16) */}
        <SectionHeader
          title={t('Evolución y conversión')}
          icon={<LineChartIcon size={14} />}
          actions={aSummary && (
            <span style={{ fontSize: '.7rem', fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>
              {t('TAQUILLA 6 TURNOS:')} {formatMoney(aSummary.ticketRevenueLast6 ?? 0)}
            </span>
          )}
        >
          {analysis ? (
            <FanEvolutionChart rows={evolution} totalFans={total} />
          ) : (
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', padding: '10px 0' }}>
              {t('Análisis no disponible ahora mismo: la evolución por turno aparecerá al recargar.')}
            </p>
          )}
        </SectionHeader>

        {/* Termómetro social */}
        <SectionHeader title={t('Termómetro social')} icon={<Gauge size={14} />}>
          <div className="fn-meter" style={{ ['--fn-c' as string]: reputation >= 60 ? 'var(--green-primary)' : reputation >= 40 ? 'var(--gold-accent)' : 'var(--red-danger)' }}>
            <div className="fn-meter-head">
              <span className="fn-meter-l">{t('Reputación del club')}</span>
              <span className="fn-meter-v">{reputation}<span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}> /100</span></span>
            </div>
            <StatBar value={reputation} max={100} size="lg" />
          </div>
          <div className="fn-meter" style={{ ['--fn-c' as string]: lowPct >= 60 ? 'var(--red-danger)' : lowPct >= 45 ? 'var(--gold-accent)' : 'var(--green-primary)' }}>
            <div className="fn-meter-head">
              <span className="fn-meter-l">{t('Renta baja (riesgo de disturbios)')}</span>
              <span className="fn-meter-v">{lowPct}<span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}> %</span></span>
            </div>
            <StatBar value={lowPct} max={100} size="lg" color={lowPct >= 60 ? 'red' : lowPct >= 45 ? 'amber' : 'green'} />
            <p style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
              {summary?.disturbanceRisk
                ? <>{t('Multa estimada si estalla:')} <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--red-danger)' }}>{formatMoney(summary?.disturbanceFineEstimate ?? 0)}</b></>
                : t('Proporción bajo control: sin riesgo de multa.')}
            </p>
          </div>
        </SectionHeader>

        {/* Pulso de la grada */}
        <div style={{ gridColumn: '1 / -1', marginTop: '14px' }}>
          <FanPulsePanel reputation={reputation} lowPct={lowPct} moodData={moodData} />
        </div>
      </div>

      {/* Comparativa con los clubes de la liga (B16) */}
      {peers.length > 0 && (
        <SectionHeader
          title={t('Comparativa de afición')}
          icon={<BarChart3 size={14} />}
          actions={<span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)' }}>{t('CLUBES DE TUS COMPETICIONES')}</span>}
        >
          <div className="fn-peer-wrap">
            <SortableTable<PeerRow>
              columns={peerColumns}
              data={peers}
              rowKey={(r) => r.club.id}
              initialSort={{ key: 'rank', dir: 'asc' }}
              rowClassName={(r) => r.club.id === myClubId ? 'row-highlight' : undefined}
            />
          </div>
        </SectionHeader>
      )}

      <div className="fn-grid">
        {/* Campañas activas — feed */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(activeCampaigns ?? []).length > 0 && (
            <SectionHeader title={t('Campañas en curso')} icon={<Megaphone size={14} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(activeCampaigns ?? []).map((c: any) => (
                  <div key={c.id} className="fn-feed-row interactive-row">
                    <Megaphone size={14} style={{ color: 'var(--green-primary)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{CAMPAIGN_LABELS[c.type] ?? c.type}</p>
                      <p className="fn-feed-time">
                        <CalendarClock size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                        {t('EXPIRA:')} {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString('es-ES') : '—'}
                      </p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono-retro)', fontWeight: 700, fontSize: '.8rem', color: 'var(--green-primary)' }}>{formatMoney(c.cost ?? 0)}</span>
                  </div>
                ))}
              </div>
            </SectionHeader>
          )}
        </div>

        {/* Campañas disponibles */}
        <SectionHeader
          title={t('Campañas disponibles')}
          icon={<Megaphone size={14} />}
          actions={<span style={{ fontSize: '.7rem', fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>{formatMoney(budget ?? 0)}</span>}
        >
          <div className="fn-camp">
            {(availableCampaigns ?? []).map((camp: any) => {
              const isActive = (activeCampaigns ?? []).some((a: any) => a.type === camp.type);
              const canAfford = (budget ?? 0) >= camp.cost;
              return (
                <div key={camp.type} className={cn('fn-camp-card', isActive && 'is-active')}>
                  <div className="fn-camp-top">
                    <div>
                      <p className="fn-camp-name">{CAMPAIGN_LABELS[camp.type] ?? camp.type}</p>
                      <p className="fn-camp-meta">{camp.months} {camp.months === 1 ? t('MES') : t('MESES')}</p>
                    </div>
                    <span className="fn-camp-cost">{formatMoney(camp.cost ?? 0)}</span>
                  </div>
                  {isActive ? (
                    <Badge variant="success" block className="w-full justify-center py-1.5">{t('En curso')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant={canAfford ? 'primary' : 'secondary'}
                      className="w-full"
                      disabled={!canAfford || submitting === camp.type}
                      onClick={() => startCampaign(camp.type)}
                    >
                      {submitting === camp.type ? t('Iniciando…') : canAfford ? t('Iniciar campaña') : t('Sin fondos')}
                    </Button>
                  )}
                </div>
              );
            })}
            {(availableCampaigns ?? []).length === 0 && (
              <EmptyState icon={<Megaphone size={26} />} title={t('Sin campañas disponibles')} hint={t('El club no tiene campañas de captación abiertas ahora mismo.')} />
            )}
          </div>
        </SectionHeader>
      </div>
    </div>
  );
}
