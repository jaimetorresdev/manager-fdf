// ─── X6 · Panel de rival histórico / semana de derbi ─────────────────────────
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Swords, CalendarClock, TrendingUp } from 'lucide-react';
import { clubApi } from '../../api/client';
import { ClubBadge, Skeleton } from '../ui';
import { fmtTime } from '../../lib/format';

interface H2H { played?: number; wins?: number; draws?: number; losses?: number;
  lastMatch?: { id?: number; score?: string; result?: string; playedAt?: string } | null }
export interface RivalWeekData {
  rival?: { id?: number; name?: string; shortName?: string; badge?: string } | null;
  reasons?: string[];
  pointsGap?: number;
  myPosition?: number;
  rivalPosition?: number;
  headToHead?: H2H | null;
  nextMeeting?: { matchId?: number; playedAt?: string; home?: boolean } | null;
  tagline?: string;
  prestigeMultiplier?: number;
}

function isDerbyWeek(next?: RivalWeekData['nextMeeting']): boolean {
  if (!next?.playedAt) return false;
  const ms = +new Date(next.playedAt) - Date.now();
  return ms > 0 && ms <= 7 * 24 * 3600 * 1000;
}

export function RivalWeekPanel({ data, variant = 'panel' }: { data?: RivalWeekData | null; variant?: 'panel' | 'banner' }) {
  const { t } = useTranslation();
  const [fetched, setFetched] = useState<RivalWeekData | null | undefined>(data);
  const [loading, setLoading] = useState(data === undefined);

  const reasonLabel = (key: string) => t(`gameplay:rival.reasons.${key}`, { defaultValue: key });

  useEffect(() => {
    if (data !== undefined) { setFetched(data); return; }
    let alive = true;
    clubApi.rivalWeek()
      .then(r => { if (alive) setFetched(r as RivalWeekData); })
      .catch(() => { if (alive) setFetched(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [data]);

  if (loading) return <Skeleton className="h-28 w-full rounded-xl" />;
  const rw = fetched;
  if (!rw?.rival) return null;

  const reasons = (rw.reasons ?? []).filter(Boolean);
  const h2h = rw.headToHead ?? {};
  const derby = isDerbyWeek(rw.nextMeeting);
  const venue = rw.nextMeeting?.home ? t('gameplay:rival.home') : t('gameplay:rival.away');

  if (variant === 'banner') {
    if (!derby) return null;
    return (
      <div
        className="flex items-center gap-3 rounded-xl px-4 py-3 mb-4"
        style={{ border: '1px solid color-mix(in srgb, var(--red-danger) 45%, transparent)',
          background: 'linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--red-danger) 14%, var(--bg-surface)) 100%)' }}
      >
        <CalendarClock size={18} style={{ color: 'var(--red-danger)' }} />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--red-danger)' }}>{t('gameplay:rival.derbyWeek')}</div>
          <div className="text-sm truncate">
            <strong>{rw.rival.name}</strong> · {venue} · {fmtTime(rw.nextMeeting?.playedAt)}
          </div>
        </div>
        <ClubBadge id={rw.rival.id} name={rw.rival.name} badge={rw.rival.badge} size={36} />
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ border: `1px solid color-mix(in srgb, var(--red-danger) ${derby ? 55 : 30}%, var(--border-color))`,
        background: 'linear-gradient(135deg, var(--bg-surface) 0%, color-mix(in srgb, var(--red-danger) 12%, var(--bg-surface)) 100%)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] font-bold" style={{ color: 'var(--red-danger)' }}>
          <Swords size={14} /> {derby ? t('gameplay:rival.derbyWeek') : t('gameplay:rival.historicRival')}
        </div>
        <div className="flex items-center gap-2">
          {(rw.prestigeMultiplier ?? 0) > 1 && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md font-bold"
              style={{ background: 'color-mix(in srgb, var(--gold-accent) 16%, transparent)', color: 'var(--gold-accent)' }}>
              <TrendingUp size={12} /> {t('gameplay:rival.prestigeMult', { mult: (rw.prestigeMultiplier as number).toFixed(2) })}
            </span>
          )}
          {rw.pointsGap != null && (
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
              {rw.pointsGap === 0 ? t('gameplay:rival.pointsTied') : t('gameplay:rival.pointsGap', { count: Math.abs(rw.pointsGap) })}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ClubBadge id={rw.rival.id} name={rw.rival.name} badge={rw.rival.badge} size={56} />
        <div className="flex-1 min-w-0">
          <Link to={`/club/${rw.rival.id}`} className="text-lg font-black font-display hover:underline" style={{ color: 'var(--text-primary)' }}>
            {rw.rival.name}
          </Link>
          {rw.tagline && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{rw.tagline}</p>}
        </div>
        {(rw.myPosition != null && rw.rivalPosition != null) && (
          <div className="text-right text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
            <div>{t('gameplay:rival.you')} <strong style={{ color: 'var(--text-primary)' }}>#{rw.myPosition}</strong></div>
            <div>{t('gameplay:rival.them')} <strong style={{ color: 'var(--text-primary)' }}>#{rw.rivalPosition}</strong></div>
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

      {(h2h.lastMatch || rw.nextMeeting) && (
        <div className="flex items-center justify-between mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          {h2h.lastMatch?.score ? (
            <span>{t('gameplay:rival.last')} <strong style={{ color: 'var(--text-primary)' }}>{h2h.lastMatch.score}</strong> · {fmtTime(h2h.lastMatch.playedAt)}</span>
          ) : <span />}
          {rw.nextMeeting?.playedAt && (
            <span className="flex items-center gap-1">
              <CalendarClock size={12} /> {t('gameplay:rival.next')} {rw.nextMeeting.home ? t('gameplay:rival.home') : t('gameplay:rival.awayShort')} · {fmtTime(rw.nextMeeting.playedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
