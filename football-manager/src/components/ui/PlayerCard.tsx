// ─── PlayerCard — tarjeta compacta de jugador (reutilizable) ──────────────────
import type { ReactNode } from 'react';
import { Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { eur } from '../../lib/format';
import { useTranslation } from 'react-i18next';

export interface PlayerCardData {
  name: string;
  position?: string;
  preferredPosition?: string | null;
  age?: number;
  overall?: number;
  potential?: number;
  marketValue?: number;
  clubName?: string;
}

interface Props {
  player: PlayerCardData;
  onClick?: () => void;
  shortlisted?: boolean;
  onToggleShortlist?: () => void;
  actions?: ReactNode;
  className?: string;
}


export function PlayerCard({ player: p, onClick, shortlisted, onToggleShortlist, actions, className }: Props) {
  const { t } = useTranslation('common');
  // EA FC Style color tone
  function getCardTheme(v?: number) {
    if (v == null) return { bg: 'var(--panel-gradient)', border: 'var(--border-color)', glow: 'transparent', text: 'var(--text-primary)' };
    if (v >= 85) return { bg: 'var(--fut-card-elite-bg, linear-gradient(135deg, #1a1a1a 0%, #2a2a00 50%, #4a3b00 100%))', border: 'var(--gold-accent)', glow: 'var(--gold-accent)', text: 'var(--fut-card-text, #fff)' };
    if (v >= 75) return { bg: 'var(--fut-card-pro-bg, linear-gradient(135deg, #1a1a1a 0%, #001a1a 50%, #003333 100%))', border: 'var(--teal-accent)', glow: 'var(--teal-accent)', text: 'var(--fut-card-text, #fff)' };
    if (v >= 65) return { bg: 'var(--fut-card-standard-bg, linear-gradient(135deg, #1a1a1a 0%, #112211 50%, #114411 100%))', border: 'var(--green-primary)', glow: 'var(--green-primary)', text: 'var(--fut-card-text, #fff)' };
    return { bg: 'var(--fut-card-basic-bg, linear-gradient(135deg, #1a1a1a 0%, #222 100%))', border: 'var(--border-color)', glow: 'var(--border-color)', text: 'var(--text-primary)' };
  }

  const theme = getCardTheme(p.overall);

  return (
    <div className={cn('fut-card', className)} onClick={onClick} role={onClick ? 'button' : undefined} style={{ '--card-bg': theme.bg, '--card-border': theme.border, '--card-glow': theme.glow, '--card-text': theme.text } as React.CSSProperties}>
      <style>{`
        .fut-card {
          position: relative;
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          overflow: hidden;
          box-shadow: var(--shadow-soft);
        }
        .fut-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 50%);
          pointer-events: none;
        }
        .fut-card:hover {
          transform: translateY(-5px) scale(1.02);
          box-shadow: inset 0 2px 0 rgba(255,255,255,0.3), 0 15px 30px rgba(0,0,0,0.6), 0 0 20px color-mix(in srgb, var(--card-glow) 40%, transparent);
          border-color: var(--card-glow);
        }
        .fut-card:hover::before {
          left: 200%;
        }
        .fut-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255,255,255,0.1);
          padding-bottom: 12px;
          margin-bottom: 12px;
        }
        .fut-ovr-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          line-height: 1;
        }
        .fut-ovr {
          font-family: var(--font-scoreboard);
          font-size: 2.75rem;
          font-weight: 400;
          color: var(--card-glow);
          letter-spacing: 0.02em;
        }
        .fut-pos {
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-top: 2px;
        }
        .fut-name {
          font-family: var(--font-display);
          font-weight: 700;
          font-size: 1.1rem;
          color: var(--card-text);
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fut-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        :root[data-theme='light'] .fut-card {
          box-shadow: var(--shadow-soft);
        }
        :root[data-theme='light'] .fut-card::before {
          background: linear-gradient(180deg, rgba(0,0,0,0.03) 0%, transparent 50%);
        }
        :root[data-theme='light'] .fut-card:hover {
          box-shadow: 0 12px 24px rgba(0,0,0,0.12), 0 0 12px color-mix(in srgb, var(--card-glow) 25%, transparent);
        }
        .fut-star {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          cursor: pointer;
          background: var(--bg-elevated);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          transition: all 0.2s;
        }
        .fut-star:hover {
          background: color-mix(in srgb, var(--gold-accent) 12%, var(--bg-elevated));
          color: var(--gold-accent);
        }
        .fut-star.on {
          color: var(--gold-accent);
          border-color: var(--gold-accent);
          box-shadow: 0 0 10px color-mix(in srgb, var(--gold-accent) 40%, transparent);
        }
        .fut-foot {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: auto;
        }
        .fut-val {
          font-family: var(--font-sans);
          font-weight: 700;
          font-size: 0.9rem;
          color: var(--card-text);
          background: var(--bg-surface);
          padding: 4px 8px;
          border-radius: 4px;
          border-left: 2px solid var(--card-glow);
        }
        .fut-pot {
          font-size: 0.75rem;
          color: var(--gold-accent);
          font-family: var(--font-sans);
          font-weight: 600;
          background: var(--bg-surface);
          padding: 3px 6px;
          border-radius: 4px;
        }
      `}</style>
      
      <div className="fut-card-header">
        <div className="fut-ovr-container">
          <span className="fut-ovr">{p.overall ?? '—'}</span>
          <span className="fut-pos">{p.position || p.preferredPosition || 'POR'}</span>
        </div>
        
        {onToggleShortlist && (
          <button className={cn('fut-star', shortlisted && 'on')} aria-label="Shortlist"
                  onClick={(e) => { e.stopPropagation(); onToggleShortlist(); }}>
            <Star size={16} fill={shortlisted ? 'var(--gold-accent)' : 'none'} />
          </button>
        )}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div>
          <div className="fut-name">{p.name}</div>
          <div className="fut-sub">
            {[p.age ? `${p.age} ${t('player.years')}` : null, p.clubName].filter(Boolean).join(' | ')}
          </div>
        </div>

        <div className="fut-foot">
          <span className="fut-val">{eur(p.marketValue)}</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {p.potential != null && <span className="fut-pot">{t('player.potential')} {p.potential}</span>}
            {actions}
          </div>
        </div>
      </div>
    </div>
  );
}
