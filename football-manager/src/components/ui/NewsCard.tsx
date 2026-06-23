// ─── NewsCard — titular de prensa estilo periódico ───────────────────────────
import { Newspaper, Swords, HeartPulse, ArrowLeftRight, Landmark, Trophy } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface NewsItem {
  id: number;
  headline?: string; subject?: string;
  content?: string; body?: string;
  type?: string;
  createdAt?: string;
  isRead?: boolean;
}

const TYPE_ICON: Record<string, typeof Newspaper> = {
  result: Trophy, derbi: Swords, derby: Swords, injury: HeartPulse, lesion: HeartPulse,
  transfer: ArrowLeftRight, fichaje: ArrowLeftRight, board: Landmark, junta: Landmark,
};
const TYPE_TONE: Record<string, string> = {
  result: 'var(--green-primary)', derbi: 'var(--red-danger)', derby: 'var(--red-danger)',
  injury: 'var(--gold-accent)', lesion: 'var(--gold-accent)', transfer: 'var(--blue-info)',
  fichaje: 'var(--blue-info)', board: 'var(--violet-accent)', junta: 'var(--violet-accent)',
};

function when(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function NewsCard({ item, featured, onClick }: { item: NewsItem; featured?: boolean; onClick?: () => void }) {
  const title = item.headline ?? item.subject ?? 'Noticia';
  const text = item.content ?? item.body ?? '';
  const Icon = TYPE_ICON[item.type ?? ''] ?? Newspaper;
  const tone = TYPE_TONE[item.type ?? ''] ?? 'var(--text-muted)';
  return (
    <article className={cn('nc', featured && 'nc--feat', item.isRead === false && 'nc--unread')} onClick={onClick}>
      <style>{`
        .nc{position:relative;display:flex;gap:12px;padding:12px 14px;border:1px solid var(--border-color);
          border-radius:var(--radius-retro);background:var(--bg-surface);cursor:${onClick ? 'pointer' : 'default'};transition:border-color .15s}
        .nc:hover{border-color:color-mix(in srgb,var(--green-primary) 35%,var(--border-color))}
        .nc--unread{background:var(--accent-faint)}
        .nc--feat{background:var(--panel-gradient);box-shadow:var(--crt-glow);padding:18px}
        .nc-ic{width:34px;height:34px;border-radius:8px;display:grid;place-items:center;flex:none;background:var(--bg-elevated)}
        .nc-h{font-family:var(--font-display);font-weight:700;line-height:1.2}
        .nc--feat .nc-h{font-size:1.4rem}
        .nc-b{color:var(--text-muted);font-size:.85rem;margin-top:4px}
        .nc--feat .nc-b{font-size:.95rem}
        .nc-t{font-size:.66rem;color:var(--text-muted);font-family:var(--font-mono-retro);margin-top:6px}
      `}</style>
      <div className="nc-ic" style={{ color: tone }}><Icon size={featured ? 20 : 16} /></div>
      <div style={{ minWidth: 0 }}>
        <div className="nc-h">{title}</div>
        {text && <div className="nc-b">{text}</div>}
        <div className="nc-t">{when(item.createdAt)}{item.type ? ` · ${item.type}` : ''}</div>
      </div>
    </article>
  );
}
