// ─── LeagueLeaders — panel lateral de líderes (goleadores/asistentes) ──────────
// LOTE C · E17. Presentación pura: recibe las filas de /world/leaderboards.
import { Target, Zap } from 'lucide-react';
import { ClubBadge, EmptyState, Skeleton } from '../ui';
import { PlayerLink, ClubLink } from '../common/EntityLink';
import { useTranslation } from 'react-i18next';

export interface LeaderRow {
  playerId: number;
  name: string;
  club?: { id: number; name: string; shortName?: string } | null;
  goals: number;
  assists: number;
}

interface Props {
  loading: boolean;
  topScorers: LeaderRow[];
  topAssists: LeaderRow[];
}

function LeaderList({ rows, valueOf, tone }: {
  rows: LeaderRow[];
  valueOf: (r: LeaderRow) => number;
  tone: string;
}) {
  return (
    <ol className="ldr-list">
      {rows.map((r, i) => (
        <li key={`${r.playerId}-${i}`} className="ldr-row">
          <span className="ldr-pos">{i + 1}</span>
          <ClubBadge id={r.club?.id} name={r.club?.name} size={16} />
          <span className="ldr-name">
            <PlayerLink id={r.playerId} name={r.name} />
            {r.club && (
              <span className="ldr-club">
                <ClubLink id={r.club.id} name={r.club.shortName ?? r.club.name} />
              </span>
            )}
          </span>
          <span className="ldr-val" style={{ color: tone }}>{valueOf(r)}</span>
        </li>
      ))}
    </ol>
  );
}

export function LeagueLeaders({ loading, topScorers, topAssists }: Props) {
  const { t } = useTranslation('common');
  return (
    <div className="ldr">
      <style>{`
        .ldr{display:flex;flex-direction:column;gap:14px}
        .ldr-panel{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);overflow:hidden}
        .ldr-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--titlebar-bg);
          border-bottom:1px solid var(--border-color);font-family:var(--font-display);font-weight:700;font-size:.74rem;
          text-transform:uppercase;letter-spacing:1px;color:var(--titlebar-text)}
        .ldr-list{margin:0;padding:0;list-style:none}
        .ldr-row{display:flex;align-items:center;gap:8px;padding:8px 14px;
          border-bottom:1px solid color-mix(in srgb,var(--border-color) 50%,transparent);transition:background .12s}
        .ldr-row:last-child{border-bottom:none}
        .ldr-row:hover{background:var(--row-hover)}
        .ldr-pos{font-family:var(--font-mono-retro);font-size:.7rem;color:var(--text-muted);width:16px;flex-shrink:0;text-align:right}
        .ldr-name{flex:1;min-width:0;display:flex;flex-direction:column;font-size:.82rem;font-weight:600;color:var(--text-primary);
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .ldr-club{font-size:.64rem;color:var(--text-muted);font-family:var(--font-mono-retro)}
        .ldr-val{font-family:var(--font-mono-retro);font-weight:800;font-size:1rem;flex-shrink:0}
      `}</style>

      <div className="ldr-panel">
        <div className="ldr-head"><Target size={13} /> {t('Máximos goleadores')}</div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
            {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} height={26} />)}
          </div>
        ) : topScorers.length === 0 ? (
          <div style={{ padding: 12 }}>
            <EmptyState title={t('Sin datos de goleadores')} hint={t('Aún no hay estadísticas registradas.')} />
          </div>
        ) : (
          <LeaderList rows={topScorers} valueOf={r => r.goals} tone="var(--gold-accent)" />
        )}
      </div>

      <div className="ldr-panel">
        <div className="ldr-head"><Zap size={13} /> {t('Máximos asistentes')}</div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12 }}>
            {[0, 1, 2].map(i => <Skeleton key={i} height={26} />)}
          </div>
        ) : topAssists.length === 0 ? (
          <div style={{ padding: 12 }}>
            <EmptyState title={t('Sin datos de asistentes')} hint={t('Aún no hay estadísticas registradas.')} />
          </div>
        ) : (
          <LeaderList rows={topAssists} valueOf={r => r.assists} tone="var(--blue-info)" />
        )}
      </div>
    </div>
  );
}
