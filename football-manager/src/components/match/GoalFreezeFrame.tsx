// I-9 · Freeze-frame estilo foto de prensa al marcar
import { PlayerPortrait } from '../ui/PlayerPortrait';

interface Props {
  playerId?: number | null;
  playerName: string;
  minute: number;
  score: string;
  teamName: string;
  teamColor: string;
  onDismiss: () => void;
}

export function GoalFreezeFrame({ playerId, playerName, minute, score, teamName, teamColor, onDismiss }: Props) {
  const id = playerId && Number.isFinite(playerId) ? playerId : Math.abs(playerName.split('').reduce((s, c) => s + c.charCodeAt(0), 0));

  return (
    <div className="mc-freeze" role="dialog" aria-label={`Gol de ${playerName}`} onClick={onDismiss}>
      <div className="mc-freeze-card" onClick={e => e.stopPropagation()}>
        <div className="mc-freeze-photo" style={{ ['--team-color' as string]: teamColor }}>
          <PlayerPortrait id={id} size={120} jerseyColor={teamColor} variant="broadcast" className="mc-freeze-portrait" />
          <div className="mc-freeze-grass" />
        </div>
        <div className="mc-freeze-meta">
          <p className="mc-freeze-goal">¡GOL!</p>
          <p className="mc-freeze-name">{playerName}</p>
          <p className="mc-freeze-team">{teamName} · {minute}&apos;</p>
          <p className="mc-freeze-score">{score}</p>
          <button type="button" className="mc-freeze-btn" onClick={onDismiss}>Continuar</button>
        </div>
      </div>
      <style>{`
        .mc-freeze{position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;
          background:color-mix(in srgb,var(--bg-base) 55%,transparent);backdrop-filter:blur(4px);
          animation:mcFreezeIn .35s ease both}
        .mc-freeze-card{display:flex;gap:16px;max-width:90%;padding:16px;border-radius:12px;
          background:var(--bg-elevated);border:2px solid var(--team-color);box-shadow:var(--shadow-soft)}
        .mc-freeze-photo{position:relative;display:flex;align-items:flex-end;justify-content:center;
          width:140px;height:150px;border-radius:8px;overflow:hidden;
          background:radial-gradient(ellipse at 50% 20%,color-mix(in srgb,var(--team-color) 25%,var(--bg-surface)),var(--bg-base))}
        .mc-freeze-grass{position:absolute;bottom:0;left:0;right:0;height:35%;
          background:linear-gradient(180deg,transparent,var(--green-primary));
          opacity:.35}
        .mc-freeze-meta{display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0}
        .mc-freeze-goal{font-family:var(--font-display);font-weight:900;font-size:1.4rem;color:var(--green-primary);letter-spacing:.12em}
        .mc-freeze-name{font-weight:800;font-size:1.1rem;color:var(--text-primary)}
        .mc-freeze-team{font-size:.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.08em}
        .mc-freeze-score{font-family:var(--font-sans);font-weight:900;font-size:2rem;color:var(--text-primary)}
        .mc-freeze-btn{margin-top:8px;padding:6px 14px;border-radius:6px;border:none;cursor:pointer;
          background:var(--green-primary);color:var(--avatar-text);font-weight:700;font-size:.75rem;text-transform:uppercase}
        @keyframes mcFreezeIn{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}
        @media(prefers-reduced-motion:reduce){.mc-freeze{animation:none!important}}
      `}</style>
    </div>
  );
}
