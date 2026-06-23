// ─── Diagnóstico — pinga el read-layer y muestra qué responde ─────────────────
// Herramienta para el QA end-to-end: verde/rojo, latencia y shape por endpoint.
import { useCallback, useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { request } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import { cn } from '../lib/cn';

interface Probe { name: string; path: (clubId: number) => string }
interface Result { name: string; path: string; status: 'ok' | 'fail' | 'pending'; ms?: number; keys?: string; error?: string }

const PROBES: Probe[] = [
  { name: 'Estado de juego', path: () => '/game/state' },
  { name: 'Dashboard', path: () => '/game/dashboard' },
  { name: 'Club (público)', path: (c) => `/club/public/${c}` },
  { name: 'Plantilla (pública)', path: (c) => `/club/public/${c}/squad` },
  { name: 'Partidos (lista)', path: () => '/matches' },
  { name: 'Mercado', path: () => '/market' },
  { name: 'Shortlist', path: () => '/market/shortlist' },
  { name: 'Noticias', path: () => '/news' },
  { name: 'Premios', path: () => '/awards' },
  { name: 'Goleadores', path: () => '/leaderboards/goals' },
  { name: 'Asistentes', path: () => '/leaderboards/assists' },
  { name: 'Mejores notas', path: () => '/leaderboards/ratings' },
  { name: 'Honores del club', path: (c) => `/club/${c}/honours` },
  { name: 'Canales de chat', path: () => '/chat/channels' },
  { name: 'Competiciones', path: () => '/world/competitions' },
  { name: 'Ofertas de banquillo', path: () => '/manager/offers' },
  { name: 'Vacantes', path: () => '/manager/vacancies' },
  { name: 'Scout: jugadores', path: () => '/scout/players' },
  { name: 'Scout: ojeadores', path: () => '/scout/staff' },
  { name: 'Tácticas', path: () => '/tactics' },
  // Etapa 8 multijugador + economía ampliada (4.5/5.4)
  { name: 'Subastas (activas)', path: () => '/auctions?status=active' },
  { name: 'Negociaciones', path: () => '/negotiations' },
  { name: 'Economía (snapshot)', path: () => '/economy' },
  { name: 'Economía (previsión)', path: () => '/economy/forecast?months=12' },
  { name: 'Patrocinios', path: () => '/economy/sponsors' },
  { name: 'Pretemporada', path: () => '/friendlies/preseason' },
  { name: 'Amistosos', path: () => '/friendlies' },
];

function shapeOf(v: unknown): string {
  if (Array.isArray(v)) return `array(${v.length})${v.length ? ` · {${Object.keys(v[0] ?? {}).slice(0, 5).join(', ')}}` : ''}`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).slice(0, 6).join(', ')}}`;
  return String(typeof v);
}

export function DiagnosticsPage() {
  const { t } = useTranslation('common');
  const { club } = useSession();
  const clubId = club?.id ?? 1;
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    setResults(PROBES.map(p => ({ name: p.name, path: p.path(clubId), status: 'pending' })));
    await Promise.all(PROBES.map(async (p, i) => {
      const path = p.path(clubId);
      const t0 = performance.now();
      try {
        const res = await request<unknown>(path);
        const ms = Math.round(performance.now() - t0);
        setResults(rs => rs.map((r, j) => j === i ? { ...r, status: 'ok', ms, keys: shapeOf(res) } : r));
      } catch (err) {
        const ms = Math.round(performance.now() - t0);
        setResults(rs => rs.map((r, j) => j === i
          ? { ...r, status: 'fail', ms, error: err instanceof Error ? err.message : 'error' } : r));
      }
    }));
    setRunning(false);
  }, [clubId]);

  useEffect(() => { run(); }, [run]);

  const ok = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'fail').length;

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <style>{`
        .dg-sum{display:flex;gap:14px;align-items:center;font-family:var(--font-mono-retro)}
        .dg-table{width:100%;border-collapse:collapse;font-size:.82rem;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);overflow:hidden}
        .dg-table th{text-align:left;font-size:.64rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);padding:9px 12px;background:var(--bg-elevated)}
        .dg-table td{padding:8px 12px;border-top:1px solid color-mix(in srgb,var(--border-color) 55%,transparent)}
        .dg-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:7px}
        .dg-ok{background:var(--green-primary);box-shadow:0 0 6px var(--green-primary)}
        .dg-fail{background:var(--red-danger);box-shadow:0 0 6px var(--red-danger)}
        .dg-pending{background:var(--gold-accent);animation:dgp 1s infinite}
        @keyframes dgp{50%{opacity:.4}}
        .dg-path{font-family:var(--font-mono-retro);font-size:.72rem;color:var(--text-muted)}
        .dg-keys{font-family:var(--font-mono-retro);font-size:.7rem;color:var(--text-muted);max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dg-ms{font-family:var(--font-mono-retro)}
      `}</style>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p className="muted-label"><Activity size={12} style={{ display: 'inline' }} /> {t('QA end-to-end')}</p>
          <h1 className="section-title text-3xl">{t('Diagnóstico del read-layer')}</h1>
        </div>
        <Button onClick={run} disabled={running}><RefreshCw size={14} className={cn(running && 'animate-spin')} /> {t('Re-probar')}</Button>
      </div>

      <div className="dg-sum">
        <span style={{ color: 'var(--green-primary)' }}>● {ok} {t('OK')}</span>
        <span style={{ color: 'var(--red-danger)' }}>● {fail} {t('FALLAN')}</span>
        <span style={{ color: 'var(--text-muted)' }}>{t('de')} {PROBES.length} {t('endpoints')}</span>
      </div>

      <table className="dg-table">
        <thead><tr><th>{t('Endpoint')}</th><th>{t('Ruta')}</th><th>{t('Latencia')}</th><th>{t('Shape / error')}</th></tr></thead>
        <tbody>
          {results.map(r => (
            <tr key={r.path}>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={cn('dg-dot', r.status === 'ok' ? 'dg-ok' : r.status === 'fail' ? 'dg-fail' : 'dg-pending')} aria-hidden="true" style={{ marginRight: 0 }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: r.status === 'ok' ? 'var(--green-primary)' : r.status === 'fail' ? 'var(--red-danger)' : 'var(--gold-accent)' }}>
                    {r.status === 'ok' ? t('OK') : r.status === 'fail' ? t('Falló') : t('Pendiente')}
                  </span>
                  <span>{r.name}</span>
                </div>
              </td>
              <td className="dg-path">{r.path}</td>
              <td className="dg-ms">{r.ms != null ? `${r.ms} ms` : '…'}</td>
              <td className="dg-keys" style={r.status === 'fail' ? { color: 'var(--red-danger)' } : undefined}>
                {r.status === 'fail' ? r.error : r.keys ?? '…'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
        {t('Verde = el endpoint responde y se muestra su forma. Rojo = revisa backend/seed (detalle del error en la fila). Esta página es la referencia para la sesión de QA conjunto con el backend.')}
      </p>
    </div>
  );
}
