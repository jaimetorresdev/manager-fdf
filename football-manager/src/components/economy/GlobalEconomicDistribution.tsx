import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';
import { publicApi, type PublicStatsResponse } from '../../api/client';
import { asArray } from '../../lib/normalize';
import { eur } from '../../lib/format';
import { SectionHeader } from '../ui';

type QuartileRow = { label: string; value: number };

function extractQuartiles(stats: PublicStatsResponse | null): QuartileRow[] {
  if (!stats) return [];
  const candidates = [
    stats.budgetByLeagueQuartile,
    stats.economicDistribution?.leagueQuartiles,
    stats.leagueBudgetQuartiles,
    stats.budgetQuartiles,
  ];
  for (const raw of candidates) {
    const rows = asArray<Record<string, unknown>>(raw);
    if (!rows.length) continue;
    return rows.map((q, i) => ({
      label: String(q.label ?? q.quartile ?? `Q${i + 1}`),
      value: Number(q.avgBudget ?? q.budget ?? q.value ?? 0),
    })).filter((r) => Number.isFinite(r.value) && r.value > 0);
  }
  const flat = stats.quartileBudgets;
  if (Array.isArray(flat) && flat.length) {
    return flat.map((v, i) => ({ label: `Q${i + 1}`, value: Number(v) || 0 }));
  }
  return [];
}

export function GlobalEconomicDistribution() {
  const [stats, setStats] = useState<PublicStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicApi.stats()
      .then((res) => { if (!cancelled) setStats(res); })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Estadísticas no disponibles');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const quartiles = useMemo(() => extractQuartiles(stats), [stats]);
  const max = Math.max(...quartiles.map((q) => q.value), 1);

  return (
    <SectionHeader title="Distribución económica global" icon={<BarChart3 size={14} />}>
      {loading && (
        <p className="text-sm flex items-center gap-2" style={{ color: 'var(--text-muted)' }}>
          <Loader2 size={14} className="animate-spin" /> Cargando…
        </p>
      )}
      {error && <p className="text-sm" style={{ color: 'var(--red-danger)' }}>{error}</p>}
      {!loading && stats && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>Mánagers activos: <b style={{ color: 'var(--text-primary)' }}>{String(stats.activeManagers ?? '—')}</b></span>
            <span>Clubes humanos: <b style={{ color: 'var(--text-primary)' }}>{String(stats.humanClubs ?? '—')}</b></span>
            <span>Total clubes: <b style={{ color: 'var(--text-primary)' }}>{String(stats.totalClubs ?? '—')}</b></span>
            {(stats.season as { name?: string } | null)?.name && (
              <span>Temporada: <b style={{ color: 'var(--gold-accent)' }}>{(stats.season as { name: string }).name}</b></span>
            )}
          </div>

          {quartiles.length > 0 ? (
            <div className="flex items-end gap-3" style={{ minHeight: 120 }}>
              {quartiles.map((q) => (
                <div key={q.label} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-bold truncate w-full text-center" style={{ color: 'var(--text-primary)' }}>
                    {eur(q.value)}
                  </span>
                  <div
                    className="w-full rounded-t-md"
                    style={{
                      height: `${Math.max(12, (q.value / max) * 88)}px`,
                      background: 'color-mix(in srgb, var(--green-primary) 70%, var(--bg-base))',
                      border: '1px solid color-mix(in srgb, var(--green-primary) 40%, transparent)',
                    }}
                    title={`${q.label}: ${eur(q.value)}`}
                  />
                  <span className="text-[10px] uppercase font-bold" style={{ color: 'var(--text-muted)' }}>{q.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Presupuesto medio por cuartil de liga pendiente en <code>GET /api/public/stats</code> (QA2).
            </p>
          )}
        </div>
      )}
    </SectionHeader>
  );
}
