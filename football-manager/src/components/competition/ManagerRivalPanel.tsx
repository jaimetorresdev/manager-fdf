// ─── X6 · Panel de rival formal para ficha de MÁNAGER ajeno ───────────────────
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Swords, CalendarClock, TrendingUp } from 'lucide-react';
import { ClubBadge } from '../ui';
import { fmtTime } from '../../lib/format';

interface RivalH2H { played?: number; wins?: number; draws?: number; losses?: number }
export interface ManagerRivalData {
  name?: string;
  intensity?: number;
  prestigeMultiplier?: number;
  rival?: { id?: number; name?: string; shortName?: string; badge?: string } | null;
  reasons?: string[];
  metrics?: { sameCity?: boolean; played?: number; finals?: number; bothHuman?: boolean; historicIntensity?: number | null } | null;
  headToHead?: RivalH2H | null;
  nextMeeting?: { matchId?: number; playedAt?: string; home?: boolean } | null;
}

function isDerbyWeek(next?: ManagerRivalData['nextMeeting']): boolean {
  if (!next?.playedAt) return false;
  const ms = +new Date(next.playedAt) - Date.now();
  return ms > 0 && ms <= 7 * 24 * 3600 * 1000;
}

export function ManagerRivalPanel({ data }: { data?: ManagerRivalData | null }) {
  const { t } = useTranslation();
  if (!data?.rival?.id) return null;
  const reasons = (data.reasons ?? []).filter(Boolean);
  const h2h = data.headToHead ?? {};
  const derby = isDerbyWeek(data.nextMeeting);
  const intensity = Math.max(0, Math.min(100, Number(data.intensity ?? 0)));
  const mult = Number(data.prestigeMultiplier ?? 0);

  const reasonLabel = (key: string) => t(`gameplay:rival.reasons.${key}`, { defaultValue: key });

  return (
    <div
      className="rounded-2xl p-5"
      style={{ border: `1px solid color-mix(in srgb, var(--red-danger) ${derby ? 55 : 30}%, var(--border-color))`,
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--red-danger) 12%, var(--bg-surface)) 100%)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold" style={{ color: 'var(--red-danger)' }}>
          <Swords size={14} /> {derby ? t('gameplay:rival.derbyWeek') : data.name || t('gameplay:rival.historicRival')}
        </div>
        {mult > 1 && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-bold"
            style={{ background: 'color-mix(in srgb, var(--gold-accent) 16%, transparent)', color: 'var(--gold-accent)' }}>
            <TrendingUp size={12} /> {t('gameplay:rival.prestigeMult', { mult: mult.toFixed(2) })}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <ClubBadge id={data.rival.id} name={data.rival.name} badge={data.rival.badge} size={56} />
        <div className="flex-1 min-w-0">
          <Link to={`/club/${data.rival.id}`} className="text-lg font-black font-display hover:underline" style={{ color: 'var(--text-primary)' }}>
            {data.rival.name}
          </Link>
          {data.name && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{data.name}</p>}
        </div>
        {intensity > 0 && (
          <div className="text-right text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
            <div className="text-2xl font-black font-display" style={{ color: 'var(--red-danger)' }}>{intensity}</div>
            <div className="text-[10px] uppercase tracking-wide">{t('gameplay:rival.intensity')}</div>
          </div>
        )}
      </div>

      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {reasons.map(r => (
            <span key={r} className="text-[10px] uppercase tracking-wide px-2 py-1 rounded-md"
              style={{ background: 'color-mix(in srgb, var(--red-danger) 16%, transparent)', color: 'var(--red-danger)' }}>
              {reasonLabel(r)}
            </span>
          ))}
        </div>
      )}

      {(h2h.played ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-4 text-center">
          <div className="rounded-lg py-2" style={{ background: 'var(--bg-elevated, rgba(255,255,255,0.03))' }}>
            <div className="text-xl font-black font-display" style={{ color: 'var(--green-primary)' }}>{h2h.wins ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('gameplay:rival.wins')}</div>
          </div>
          <div className="rounded-lg py-2" style={{ background: 'var(--bg-elevated, rgba(255,255,255,0.03))' }}>
            <div className="text-xl font-black font-display" style={{ color: 'var(--text-muted)' }}>{h2h.draws ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('gameplay:rival.draws')}</div>
          </div>
          <div className="rounded-lg py-2" style={{ background: 'var(--bg-elevated, rgba(255,255,255,0.03))' }}>
            <div className="text-xl font-black font-display" style={{ color: 'var(--red-danger)' }}>{h2h.losses ?? 0}</div>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{t('gameplay:rival.losses')}</div>
          </div>
        </div>
      )}

      {data.nextMeeting?.playedAt && (
        <div className="flex items-center justify-end mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="flex items-center gap-1">
            <CalendarClock size={12} /> {t('gameplay:rival.next')} {data.nextMeeting.home ? t('gameplay:rival.home') : t('gameplay:rival.awayShort')} · {fmtTime(data.nextMeeting.playedAt)}
          </span>
        </div>
      )}
    </div>
  );
}
