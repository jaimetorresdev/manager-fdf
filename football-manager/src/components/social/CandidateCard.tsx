// ─── CandidateCard — tarjeta de candidato electoral (E17 · lote A) ────────────
// Avatar de iniciales, barra de apoyo animada con %, corona para el ganador.
import { Crown, Vote, Loader2 } from 'lucide-react';
import { Button } from '../ui';
import { useTranslation } from 'react-i18next';

export interface CandidateData {
  id: number;
  name: string;
  username?: string;
  prestige?: number;
  /** % de la barra (votos o prestigio relativo, según disponga el backend). */
  pct: number;
  /** Votos absolutos si el backend los provee. */
  votes?: number | null;
  /** Qué representa la barra. */
  barMode: 'votes' | 'prestige';
  isWinner?: boolean;
}

interface Props {
  candidate: CandidateData;
  canVote: boolean;
  voting?: boolean;
  onVote?: (candidateId: number) => void;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function CandidateCard({ candidate: c, canVote, voting, onVote }: Props) {
  const { t } = useTranslation('common');
  const barColor = c.isWinner ? 'var(--gold-accent)' : 'var(--blue-info)';
  return (
    <div className="cnd" data-winner={c.isWinner ? '1' : '0'}>
      <style>{`
        .cnd{position:relative;padding:13px 14px;border-radius:var(--radius-retro);background:var(--bg-elevated);
          border:1px solid var(--border-color);box-shadow:inset 0 1px 0 var(--bevel-light);transition:border-color .2s ease}
        .cnd:hover{border-color:color-mix(in srgb,var(--green-primary) 30%,var(--border-color))}
        .cnd[data-winner='1']{border-color:color-mix(in srgb,var(--gold-accent) 55%,transparent);
          background:linear-gradient(180deg,color-mix(in srgb,var(--gold-accent) 9%,var(--bg-elevated)),var(--bg-elevated));
          box-shadow:inset 0 1px 0 var(--bevel-light),0 0 14px color-mix(in srgb,var(--gold-accent) 18%,transparent)}
        .cnd-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}
        .cnd-id{display:flex;align-items:center;gap:10px;min-width:0}
        .cnd-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex-shrink:0;
          font-family:var(--font-display);font-weight:700;font-size:.92rem;color:var(--text-primary);
          background:radial-gradient(circle at 30% 28%,color-mix(in srgb,var(--blue-info) 28%,var(--bg-surface)),var(--bg-surface));
          border:1px solid var(--border-color)}
        .cnd[data-winner='1'] .cnd-av{color:var(--gold-accent);border-color:color-mix(in srgb,var(--gold-accent) 55%,transparent);
          background:radial-gradient(circle at 30% 28%,color-mix(in srgb,var(--gold-accent) 26%,var(--bg-surface)),var(--bg-surface))}
        .cnd-name{font-family:var(--font-display);font-weight:700;font-size:.92rem;color:var(--text-primary);
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .cnd-meta{font-size:.68rem;color:var(--text-muted);font-family:var(--font-mono-retro)}
        .cnd-track{height:9px;border-radius:4px;background:var(--track-color);border:1px solid var(--border-color);overflow:hidden}
        .cnd-fill{height:100%;border-radius:3px;background:var(--cnd-c);
          box-shadow:0 0 7px color-mix(in srgb,var(--cnd-c) 55%,transparent)}
        @media(prefers-reduced-motion:no-preference){
          .cnd-fill{animation:cnd-grow .7s cubic-bezier(.34,1.2,.64,1) both}
          @keyframes cnd-grow{from{width:0%!important}}
        }
        .cnd-bar-label{display:flex;justify-content:space-between;font-size:.64rem;color:var(--text-muted);
          font-family:var(--font-mono-retro);margin-top:4px}
      `}</style>

      <div className="cnd-top">
        <div className="cnd-id">
          <div className="cnd-av">{initials(c.name)}</div>
          <div style={{ minWidth: 0 }}>
            <p className="cnd-name">
              {c.name}
              {c.isWinner && <Crown size={12} style={{ display: 'inline', marginLeft: 5, verticalAlign: -1, color: 'var(--gold-accent)' }} />}
            </p>
            <p className="cnd-meta">@{c.username ?? '—'} · {t('elections.prestige')} {c.prestige ?? 0}</p>
          </div>
        </div>
        {canVote && onVote && (
          <Button variant="primary" size="sm" onClick={() => onVote(c.id)} disabled={voting}>
            {voting ? <Loader2 size={13} className="animate-spin" /> : <><Vote size={13} /> {t('elections.vote')}</>}
          </Button>
        )}
      </div>

      <div className="cnd-track" style={{ ['--cnd-c' as string]: barColor }}>
        <div className="cnd-fill" style={{ width: `${Math.max(2, Math.min(100, c.pct))}%` }} />
      </div>
      <div className="cnd-bar-label">
        <span>{c.barMode === 'votes' ? t('elections.barVotes') : t('elections.barPrestigeEstimate')}</span>
        <span style={{ color: barColor }}>
          {c.barMode === 'votes'
            ? (c.votes != null ? `${c.votes} · ${c.pct.toFixed(0)}%` : `${c.pct.toFixed(0)}%`)
            : `${c.prestige ?? 0}`}
        </span>
      </div>
    </div>
  );
}
