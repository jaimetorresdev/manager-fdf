// ─── TrophyCard — premio / honor en vitrina ───────────────────────────────────
import { Trophy } from 'lucide-react';
import { PlayerLink } from '../common/EntityLink';

export interface AwardItem {
  id: number;
  name: string;
  season?: string;
  player?: { id?: number; name?: string; position?: string };
  club?: { name?: string; shortName?: string; badge?: string };
}

export function TrophyCard({ award }: { award: AwardItem }) {
  return (
    <div className="tc">
      <style>{`
        .tc{position:relative;overflow:hidden;display:flex;flex-direction:column;gap:6px;padding:14px;
          background:var(--panel-gradient);border:1px solid color-mix(in srgb,var(--gold-accent) 30%,var(--border-color));
          border-radius:var(--radius-retro);box-shadow:var(--crt-glow)}
        .tc-ic{color:var(--gold-accent)}
        .tc-name{font-family:var(--font-display);font-weight:700;font-size:1.05rem}
        .tc-season{font-size:.66rem;color:var(--text-muted);font-family:var(--font-mono-retro)}
        .tc-win{font-size:.85rem;margin-top:2px}
        .tc-club{font-size:.72rem;color:var(--text-muted)}
      `}</style>
      <div className="tc-ic"><Trophy size={20} /></div>
      <div className="tc-name">{award.name}</div>
      {award.season && <div className="tc-season">{award.season}</div>}
      {award.player?.name && <div className="tc-win">🏅 <PlayerLink id={award.player?.id} name={award.player.name} />{award.player.position ? ` · ${award.player.position}` : ''}</div>}
      {award.club?.name && <div className="tc-club">{award.club.badge ?? ''} {award.club.name}</div>}
    </div>
  );
}
