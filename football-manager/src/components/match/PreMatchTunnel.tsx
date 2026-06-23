// I-23 · Secuencia pre-saque: escudos + XI antes de la previa de MatchCenter
import { useEffect, useMemo, useState } from 'react';
import { ClubBadge } from '../ui/ClubBadge';
import type { PlayerRating } from '../../types/engine';
import type { MCClub } from './MatchCenter';

function xiNames(rs: PlayerRating[]): string[] {
  return rs.slice(0, 11).map(r => r.name.split(' ').slice(-1)[0] || r.name);
}

interface Props {
  homeName: string;
  awayName: string;
  homeClub?: MCClub;
  awayClub?: MCClub;
  homeRatings?: PlayerRating[];
  awayRatings?: PlayerRating[];
  onComplete: () => void;
}

export function PreMatchTunnel({ homeName, awayName, homeClub, awayClub, homeRatings = [], awayRatings = [], onComplete }: Props) {
  const [phase, setPhase] = useState(0);
  const homeXi = useMemo(() => xiNames(homeRatings), [homeRatings]);
  const awayXi = useMemo(() => xiNames(awayRatings), [awayRatings]);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) { onComplete(); return; }
    const delays = [1800, 2200, 1200];
    const t = setTimeout(() => {
      if (phase >= 2) onComplete();
      else setPhase(p => p + 1);
    }, delays[phase] ?? 1200);
    return () => clearTimeout(t);
  }, [phase, onComplete, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div className="pmt" role="presentation" onClick={() => phase < 2 ? setPhase(p => p + 1) : onComplete()}>
      <style>{`
        .pmt{position:relative;overflow:hidden;border-radius:20px;border:1px solid var(--border-color);
          background:linear-gradient(180deg,var(--bg-base) 0%,color-mix(in srgb,var(--green-primary) 8%,var(--bg-surface)) 100%);
          min-height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
          padding:32px 24px;cursor:pointer;box-shadow:var(--shadow-soft)}
        .pmt-scan{position:absolute;inset:0;pointer-events:none;
          background:repeating-linear-gradient(0deg,transparent 0 2px,var(--scanline-color) 2px 4px);opacity:.45}
        .pmt-label{font-family:var(--font-mono-retro);font-size:.65rem;letter-spacing:.22em;text-transform:uppercase;
          color:var(--gold-accent);font-weight:800}
        .pmt-teams{display:flex;align-items:center;justify-content:center;gap:28px;width:100%;max-width:520px}
        .pmt-team{display:flex;flex-direction:column;align-items:center;gap:10px;flex:1;min-width:0}
        .pmt-name{font-family:var(--font-display);font-weight:900;font-size:1.1rem;text-transform:uppercase;
          text-align:center;color:var(--text-primary);line-height:1.15}
        .pmt-vs{font-family:var(--font-display);font-weight:900;font-size:2rem;color:var(--text-muted);opacity:.35}
        .pmt-xi{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:220px}
        .pmt-xi span{font-size:.68rem;padding:3px 8px;border-radius:6px;border:1px solid var(--border-color);
          background:var(--bg-elevated);color:var(--text-primary);font-weight:700}
        .pmt-hint{font-size:.7rem;color:var(--text-muted);font-style:italic}
        .pmt-fade{animation:pmtIn .5s ease both}
        @keyframes pmtIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
      `}</style>
      <div className="pmt-scan" />
      <p className="pmt-label">Túnel de vestuario · en directo</p>

      {phase === 0 && (
        <div className="pmt-teams pmt-fade">
          <div className="pmt-team">
            <ClubBadge id={homeClub?.id ?? 0} name={homeName} badge={homeClub?.badge} size={88} />
            <span className="pmt-name">{homeName}</span>
          </div>
          <span className="pmt-vs">VS</span>
          <div className="pmt-team">
            <ClubBadge id={awayClub?.id ?? 0} name={awayName} badge={awayClub?.badge} size={88} />
            <span className="pmt-name">{awayName}</span>
          </div>
        </div>
      )}

      {phase === 1 && (
        <div className="pmt-teams pmt-fade" style={{ alignItems: 'flex-start' }}>
          <div className="pmt-team">
            <span className="pmt-label" style={{ color: 'var(--green-primary)' }}>XI local</span>
            <div className="pmt-xi">
              {(homeXi.length ? homeXi : ['—']).map(n => <span key={n}>{n}</span>)}
            </div>
          </div>
          <div className="pmt-team">
            <span className="pmt-label" style={{ color: 'var(--red-danger)' }}>XI visitante</span>
            <div className="pmt-xi">
              {(awayXi.length ? awayXi : ['—']).map(n => <span key={n}>{n}</span>)}
            </div>
          </div>
        </div>
      )}

      {phase === 2 && (
        <div className="pmt-fade" style={{ textAlign: 'center' }}>
          <p className="pmt-name" style={{ fontSize: '1.6rem', color: 'var(--gold-accent)' }}>¡A jugar!</p>
          <p className="pmt-hint">Entrando al centro del partido…</p>
        </div>
      )}

      <p className="pmt-hint">{phase < 2 ? 'Toca para avanzar' : ''}</p>
    </div>
  );
}
