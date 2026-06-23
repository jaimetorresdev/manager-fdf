import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { UserPlus, MapPin } from 'lucide-react';
import { scoutApi } from '../api/client';
import { eur } from '../lib/format';
import { assignScoutToTrackedPlayer } from '../lib/offersLogic';
import { Button, Modal, Skeleton, PosBadge, EmptyState } from '../components/ui';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';

interface ScoutedPlayer {
  id: number; firstName?: string; lastName?: string; name?: string; clubId?: number; clubName?: string; club?: { name?: string };
  position?: string; preferredPosition?: string; age?: number; overall?: number; potential?: number; marketValue?: number;
  passing?: number; tackling?: number; shooting?: number; organization?: number; unmarking?: number; finishing?: number; dribbling?: number; fouls?: number; goalkeeping?: number;
  report?: string; rating?: number;
}
interface ScoutStaff { id: number; name?: string; rating?: number; zone?: string; level?: number }
interface ScoutCandidate { name: string; level: number; zone: string; specialty: string; effectiveness: number; salary: number; signingFee: number }
interface ScoutTarget { id: number; name: string; shortName?: string; country?: string; reputation?: number }
interface ScoutAssignment {
  id: number; scoutStaffId: number; analysisPoints: number;
  target: { id: number; name: string; shortName?: string; country?: string };
}

const ZONES = ['España', 'Europa', 'Sudamérica', 'África', 'Asia'];

export function ScoutPage() {
  const { t } = useTranslation();
  const fullName = (p: ScoutedPlayer) => (p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()) || t('gameplay:scout.playerFallback');
  const [players, setPlayers] = useState<ScoutedPlayer[]>([]);
  const [staff, setStaff] = useState<ScoutStaff[]>([]);
  const [candidates, setCandidates] = useState<ScoutCandidate[]>([]);
  const [targets, setTargets] = useState<ScoutTarget[]>([]);
  const [assignments, setAssignments] = useState<ScoutAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ScoutedPlayer | null>(null);
  const [missionScout, setMissionScout] = useState<number | ''>('');
  const [missionTarget, setMissionTarget] = useState<number | ''>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const scoutSuggestion = useMemo(() => {
    if (!missionTarget || staff.length === 0) return null;
    return assignScoutToTrackedPlayer(
      staff.map(s => ({ id: s.id, name: s.name, level: s.level, rating: s.rating, zone: s.zone })),
      assignments.map(a => {
        const pts = typeof a.analysisPoints === 'object' && a.analysisPoints !== null ? (a.analysisPoints as any).analysisPoints : a.analysisPoints;
        return { id: a.id, scoutStaffId: a.scoutStaffId, playerId: a.target?.id ?? null, analysisPoints: Number(pts) || 0 };
      }),
      { playerId: missionTarget },
    );
  }, [missionTarget, staff, assignments]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true); setError(null);
      const [p, s, o] = await Promise.allSettled([
        scoutApi.getPlayers(), scoutApi.getStaff(), scoutApi.overview(),
      ]);
      if (cancelled) return;
      if (p.status === 'fulfilled' && Array.isArray(p.value)) setPlayers(p.value);
      if (s.status === 'fulfilled' && s.value) {
        const arr = Array.isArray(s.value) ? s.value : s.value?.scouts;
        if (Array.isArray(arr)) setStaff(arr);
        if (Array.isArray(s.value?.candidates)) setCandidates(s.value.candidates);
      }
      if (o.status === 'fulfilled' && o.value) {
        if (Array.isArray(o.value.targets)) setTargets(o.value.targets);
        if (Array.isArray(o.value.assignments)) setAssignments(o.value.assignments);
      }
      if (p.status === 'rejected' && s.status === 'rejected') setError(t('gameplay:scout.loadError'));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const toDossier = (p: ScoutedPlayer): DossierPlayer => ({ name: fullName(p), position: p.position, preferredPosition: p.preferredPosition, age: p.age, potential: p.potential ?? p.overall, marketValue: p.marketValue, passing: p.passing, tackling: p.tackling, shooting: p.shooting, organization: p.organization, unmarking: p.unmarking, finishing: p.finishing, dribbling: p.dribbling, fouls: p.fouls, goalkeeping: p.goalkeeping });
  const act = async (fn: Promise<any>, ok?: string) => {
    try { await fn; if (ok) toast.success(ok); setRefreshKey(k => k + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : t('gameplay:scout.toasts.failed')); }
  };


  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .sc-pt{font-family:var(--font-display);font-weight:700;font-size:.9rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin:4px 0}
        .sc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
        .sc-staff{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:14px;background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro)}
        .sc-staff-header{display:flex;align-items:center;gap:10px}
        .sc-zone{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:.78rem;padding:6px 8px;width:100%}
        .sc-suggest:hover{background:color-mix(in srgb,var(--gold-accent) 20%,transparent)}
        .sc-polaroids{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
        .sc-polaroid{position:relative;background:var(--bg-surface);border:1px solid var(--border-color);
          border-radius:4px;padding:10px 10px 28px;box-shadow:0 8px 24px color-mix(in srgb,var(--bg-base) 75%,transparent);cursor:pointer;transition:transform .2s}
        .sc-polaroid:nth-child(odd){transform:rotate(-1.2deg)}
        .sc-polaroid:nth-child(even){transform:rotate(1deg)}
        .sc-polaroid:hover{transform:rotate(0deg) scale(1.02);z-index:2}
        .sc-polaroid-photo{aspect-ratio:4/5;background:linear-gradient(180deg,var(--bg-elevated),var(--bg-base));
          border:1px solid var(--border-color);display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:8px;padding:12px}
        .sc-polaroid-name{font-family:var(--font-display);font-weight:800;font-size:.95rem;color:var(--text-primary);text-align:center}
        .sc-polaroid-meta{font-size:.65rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em}
        .sc-polaroid-note{margin-top:10px;font-family:var(--font-sans);font-size:.72rem;color:var(--text-muted);font-style:italic;line-height:1.35;
          border-top:1px dashed var(--border-color);padding-top:8px;min-height:2.5em}
        .sc-polaroid-pin{position:absolute;top:-6px;left:50%;transform:translateX(-50%);width:14px;height:14px;border-radius:50%;
          background:var(--red-danger);box-shadow:0 2px 6px rgba(0,0,0,.3)}
      `}</style>
      <div><p className="muted-label">{t('gameplay:scout.kicker')}</p><h1 className="section-title text-3xl">{t('gameplay:scout.title')}</h1></div>

      {loading && <Skeleton height={260} />}
      {!loading && error && (
        <EmptyState
          title={t('gameplay:scout.loadError')}
          hint={error}
          action={<Button variant="secondary" onClick={() => setRefreshKey(k => k + 1)}>{t('gameplay:scout.retry')}</Button>}
        />
      )}
      {!loading && !error && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="sc-pt" style={{ margin: 0 }}>{t('gameplay:scout.staffTitle')} {staff.length > 0 && `(${staff.length})`}</div>
          </div>
          {candidates.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="sc-pt" style={{ margin: 0 }}>Candidatos disponibles</div>
              <div className="sc-grid">
                {candidates.map((c, index) => (
                  <div key={index} className="sc-staff" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>
                      {t('gameplay:scout.staffLevel', { level: c.level })} · {t('gameplay:scout.signingFee', { fee: eur(c.signingFee) })}
                    </div>
                    <Button size="sm" onClick={() => act(scoutApi.hire({ candidateIndex: index, zone: c.zone }), t('gameplay:scout.toasts.hireSuccess'))}>
                      <UserPlus size={13} /> {t('gameplay:scout.hire')}
                    </Button>
                  </div>
                ))}
              </div>
              <hr style={{ border: 0, borderTop: '1px solid var(--border-color)', margin: '12px 0' }} />
            </div>
          )}
          <div className="sc-grid">
            {staff.length === 0 && <p style={{ color: 'var(--text-muted)' }}>{t('gameplay:scout.noStaff')}</p>}
            {staff.map(s => (
              <div key={s.id} className="sc-staff">
                <div className="sc-staff-header">
                  <MapPin size={16} style={{ color: 'var(--gold-accent)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{s.name ?? t('gameplay:scout.staffFallback', { id: s.id })}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{t('gameplay:scout.staffLevel', { level: s.level ?? s.rating ?? '—' })}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label htmlFor={`scout-zone-${s.id}`} style={{ fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    {t('gameplay:scout.zoneLabel')}
                  </label>
                  <select id={`scout-zone-${s.id}`} className="sc-zone" value={s.zone ?? ''} onChange={(e) => act(scoutApi.assign(s.id, e.target.value))} aria-label={t('gameplay:scout.zoneLabel')}>
                    <option value="">{t('gameplay:scout.zonePlaceholder')}</option>
                    {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="sc-pt">{t('gameplay:scout.missionsTitle')} {assignments.length > 0 && `(${assignments.length})`}</div>
          {staff.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="scout-mission-staff" style={{ fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('gameplay:scout.missionScout')}</label>
                <select id="scout-mission-staff" className="sc-zone" value={missionScout} onChange={e => setMissionScout(e.target.value ? Number(e.target.value) : '')} aria-label={t('gameplay:scout.missionScout')}>
                  <option value="">{t('gameplay:scout.scoutPlaceholder')}</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name ?? t('gameplay:scout.staffFallback', { id: s.id })}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <label htmlFor="scout-mission-target" style={{ fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{t('gameplay:scout.missionTarget')}</label>
                <select id="scout-mission-target" className="sc-zone" value={missionTarget} onChange={e => setMissionTarget(e.target.value ? Number(e.target.value) : '')} aria-label={t('gameplay:scout.missionTarget')}>
                  <option value="">{t('gameplay:scout.targetPlaceholder')}</option>
                  {targets.map(tg => <option key={tg.id} value={tg.id}>{tg.name}{tg.country ? ` · ${tg.country}` : ''}</option>)}
                </select>
              </div>
              <Button size="sm" disabled={!missionScout || !missionTarget}
                onClick={() => act(scoutApi.assignClub(Number(missionScout), Number(missionTarget)), t('gameplay:scout.toasts.missionCreated'))}>
                {t('gameplay:scout.sendScout')}
              </Button>
              {scoutSuggestion?.ok && scoutSuggestion.scoutId && String(missionScout) !== scoutSuggestion.scoutId && (
                <button type="button" className="sc-suggest"
                  onClick={() => setMissionScout(Number(scoutSuggestion.scoutId))}
                  title={scoutSuggestion.reason}>
                  💡 {scoutSuggestion.alreadyAssigned
                    ? t('gameplay:scout.missionInProgress')
                    : t('gameplay:scout.missionRecommended', { name: staff.find(s => String(s.id) === scoutSuggestion.scoutId)?.name ?? t('gameplay:scout.scoutFallback') })}
                </button>
              )}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>{t('gameplay:scout.hireFirst')}</p>
          )}
          {assignments.length > 0 && (
            <div className="sc-grid">
              {assignments.map(a => {
                const pts = typeof a.analysisPoints === 'object' && a.analysisPoints !== null ? (a.analysisPoints as any).analysisPoints : a.analysisPoints;
                const pct = Math.min(100, Number(pts) || 0);
                return (
                <div key={a.id} className="sc-staff" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.target?.name ?? t('gameplay:scout.clubFallback')}</span>
                    <span style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.72rem', color: 'var(--green-primary)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--green-primary)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <Button size="sm" variant="ghost" onClick={() => act(scoutApi.progressAssignment(a.id), t('gameplay:scout.toasts.reportAdvanced'))}>{t('gameplay:scout.advanceReport')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(scoutApi.cancelAssignment(a.id))} aria-label="✕">✕</Button>
                  </div>
                </div>
              )})}
            </div>
          )}

          <div className="sc-pt">{t('gameplay:scout.playersTitle')} {players.length > 0 && `(${players.length})`}</div>
          {players.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('gameplay:scout.noReports')}</p>
          ) : (
            <div className="sc-polaroids">
              {[...players].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0)).map(p => (
                <button key={p.id} type="button" className="sc-polaroid" onClick={() => setSelected(p)} aria-label={fullName(p)}>
                  <span className="sc-polaroid-pin" aria-hidden />
                  <div className="sc-polaroid-photo">
                    <PosBadge position={p.position ?? '—'} preferredPosition={p.preferredPosition} />
                    <span className="sc-polaroid-name">{fullName(p)}</span>
                    <span className="sc-polaroid-meta">{p.club?.name ?? p.clubName ?? t('gameplay:scout.freeAgent')} · {t('gameplay:scout.ovr')} {p.overall ?? '—'}</span>
                  </div>
                  <p className="sc-polaroid-note">
                    {p.report ?? t('gameplay:scout.potentialNote', { potential: p.potential ?? '—', value: eur(p.marketValue) })}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? fullName(selected) : ''} width={1100}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PlayerDossier player={toDossier(selected)} />
            {selected.report &&<p style={{ fontSize: '.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>“{selected.report}”</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link to={`/player/${selected.id}`} style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '.78rem', textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--green-primary)' }}>
                {t('gameplay:scout.fullProfile')}
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
