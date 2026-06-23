// ─── E7 · Página completa de jugador /player/:id ───────────────────────────────
// Dossier (radar FDF + forma + desarrollo) + contrato/traspasos + trayectoria por
// temporada con totales + últimos partidos + palmarés individual.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { FileText, History, Medal, CalendarDays, TrendingUp, AlertCircle, ArrowLeftRight, Star } from 'lucide-react';
import { playersApi, marketApi, scoutApi } from '../api/client';
import toast from 'react-hot-toast';
import { Skeleton, SortableTable, Sparkline, TrophyCard, EmptyState, Button, type SortCol } from '../components/ui';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';
import { ClubLink } from '../components/common/EntityLink';
import { adaptPlayerProfile } from '../lib/entityViewModels';
import { eur } from '../lib/format';
import { kitFromPlayer } from '../components/match/kitColors';

interface SeasonRow {
  id: number; season?: { name?: string };
  matchesPlayed?: number; minutes?: number; goals?: number; assists?: number;
  shots?: number; shotsOnTarget?: number; keyPasses?: number; interceptions?: number;
  xG?: number; averageRating?: number;
}
interface MatchRow {
  id: number; rating?: number; goals?: number; assists?: number; minutes?: number; shots?: number; xG?: number;
  match?: { id?: number; playedAt?: string; homeGoals?: number | null; awayGoals?: number | null; resultHidden?: boolean;
    homeClub?: { id?: number; shortName?: string; badge?: string }; awayClub?: { id?: number; shortName?: string } };
}

function num(n: unknown, d = 0): number { const v = Number(n); return Number.isFinite(v) ? v : d; }
function ratingColor(r: number) { return r >= 7 ? 'var(--green-primary)' : r >= 5.5 ? 'var(--gold-accent)' : 'var(--red-danger)'; }

export function PlayerPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const playerId = Number(id);
  const [p, setP] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [refresh, setRefresh] = useState(0);

  const handleFollow = async () => {
    if (!p?.id) return;
    setFollowing(true);
    try {
      await marketApi.addShortlist(p.id);
      await scoutApi.track(p.id);
      toast.success(t('gameplay:player.toasts.shortlistAdded'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:player.toasts.followError'));
    } finally {
      setFollowing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setP(null);
    if (!Number.isFinite(playerId)) { setError(t('gameplay:player.unavailable')); setLoading(false); return; }
    playersApi.getPublicPlayer(playerId)
      .then(d => { if (!cancelled) setP(d); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : t('gameplay:player.loadError')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [playerId, refresh, t]);

  // A2 · capa adaptadora defensiva (lib/entityViewModels): normaliza identidad,
  // valor, forma y disponibilidad del payload público. Aditivo: solo se usa como
  // fallback/refuerzo de los campos que ya derivaba la página → mismo render del
  // PlayerDossier, datos más robustos.
  const vm = useMemo(() => (p ? adaptPlayerProfile(p) : null), [p]);

  const playerKit = useMemo(() => kitFromPlayer(p), [p]);

  const dossier: DossierPlayer | null = useMemo(() => p && ({
    id: p.id,
    name: p.name, position: p.position, preferredPosition: p.preferredPosition, age: p.age, potential: p.potential,
    nationality: p.nationality, marketValue: p.marketValue ?? vm?.value.marketValue, wage: p.wage ?? vm?.value.wage,
    releaseClause: p.contract?.releaseClause ?? p.releaseClause ?? vm?.value.clause,
    experience: p.experience,
    jerseyColor: playerKit.primary,
    jerseySecondary: playerKit.secondary,
    squadNumber: p.squadNumber ?? undefined,
    passing: p.passing, tackling: p.tackling, shooting: p.shooting, organization: p.organization,
    unmarking: p.unmarking, finishing: p.finishing, dribbling: p.dribbling, fouls: p.fouls, goalkeeping: p.goalkeeping,
    fitness: p.fitness, muscularFitness: p.muscularFitness, mentalSharpness: p.mentalSharpness, matchRhythm: p.matchRhythm,
    morale: p.morale ?? p.form?.morale ?? vm?.form.morale,
    isInjured: (p.injuries?.length ?? 0) > 0 || Boolean(vm?.availability.injured),
    isSuspended: (p.suspensions?.length ?? 0) > 0 || (p.suspendedMatches ?? 0) > 0 || Boolean(vm?.availability.suspended),
  }), [p, vm, playerKit]);

  const seasons: SeasonRow[] = useMemo(() => Array.isArray(p?.seasonStats) ? p.seasonStats : [], [p]);
  const matches: MatchRow[] = useMemo(() => Array.isArray(p?.matchStats) ? p.matchStats : [], [p]);
  const honours: any[] = useMemo(() => Array.isArray(p?.honours) ? p.honours : [], [p]);
  const ratings = useMemo(() => matches.map(m => num(m.rating)).filter(r => r > 0), [matches]);

  // E4 · Progresión: curva acumulada de deltas de desarrollo + resumen por temporada
  const development = useMemo(() => {
    const recs: any[] = Array.isArray(p?.development) ? p.development : [];
    const deltaOf = (r: any) =>
      num(r.passingDelta) + num(r.shootingDelta) + num(r.dribblingDelta) +
      num(r.defendingDelta) + num(r.physicalDelta) + num(r.speedDelta);
    let acc = 0;
    const curve = recs.map(r => { acc += deltaOf(r); return acc; });
    const bySeason = new Map<string, number>();
    recs.forEach(r => bySeason.set(r.season ?? '—', (bySeason.get(r.season ?? '—') ?? 0) + deltaOf(r)));
    return { curve, total: acc, seasons: [...bySeason.entries()] };
  }, [p]);

  const totals = useMemo(() => seasons.reduce((acc, s) => ({
    pj: acc.pj + num(s.matchesPlayed), min: acc.min + num(s.minutes), g: acc.g + num(s.goals),
    a: acc.a + num(s.assists), xg: acc.xg + num(s.xG),
    notaSum: acc.notaSum + num(s.averageRating) * num(s.matchesPlayed), pjConNota: acc.pjConNota + (num(s.averageRating) > 0 ? num(s.matchesPlayed) : 0),
  }), { pj: 0, min: 0, g: 0, a: 0, xg: 0, notaSum: 0, pjConNota: 0 }), [seasons]);

  const seasonCols: SortCol<SeasonRow>[] = useMemo(() => [
    { key: 'season', header: t('gameplay:player.table.season'), render: r => <b>{r.season?.name ?? '—'}</b>, sortValue: r => r.season?.name ?? '' },
    { key: 'pj', header: t('gameplay:player.table.played'), align: 'right', render: r => num(r.matchesPlayed), sortValue: r => num(r.matchesPlayed) },
    { key: 'min', header: t('gameplay:player.table.minutes'), align: 'right', render: r => num(r.minutes), sortValue: r => num(r.minutes) },
    { key: 'g', header: t('gameplay:player.table.goals'), align: 'right', render: r => <b style={{ color: 'var(--green-primary)' }}>{num(r.goals)}</b>, sortValue: r => num(r.goals) },
    { key: 'a', header: t('gameplay:player.table.assists'), align: 'right', render: r => num(r.assists), sortValue: r => num(r.assists) },
    { key: 'xg', header: 'xG', align: 'right', render: r => num(r.xG).toFixed(1), sortValue: r => num(r.xG) },
    { key: 'nota', header: t('gameplay:player.table.rating'), align: 'right', render: r => { const n = num(r.averageRating); return <b style={{ color: ratingColor(n), fontFamily: 'var(--font-mono-retro)' }}>{n > 0 ? n.toFixed(2) : '—'}</b>; }, sortValue: r => num(r.averageRating) },
  ], [t]);

  const matchCols: SortCol<MatchRow>[] = useMemo(() => [
    {
      key: 'match', header: t('gameplay:player.table.match'), render: r => {
        const m = r.match;
        const score = m?.homeGoals != null && m?.awayGoals != null ? (m.resultHidden ? '? - ?' : `${m.homeGoals}-${m.awayGoals}`) : 'vs';
        return (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
            <ClubLink id={m?.homeClub?.id} name={m?.homeClub?.shortName ?? '—'} />
            <b style={{ fontFamily: 'var(--font-mono-retro)' }}>{score}</b>
            <ClubLink id={m?.awayClub?.id} name={m?.awayClub?.shortName ?? '—'} />
          </span>
        );
      }, sortValue: r => r.match?.playedAt ?? '',
    },
    { key: 'fecha', header: t('gameplay:player.table.date'), render: r => r.match?.playedAt ? new Date(r.match.playedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—', sortValue: r => r.match?.playedAt ?? '' },
    { key: 'min', header: t('gameplay:player.table.minutes'), align: 'right', render: r => num(r.minutes), sortValue: r => num(r.minutes) },
    { key: 'g', header: 'G', align: 'right', render: r => num(r.goals) > 0 ? <b style={{ color: 'var(--green-primary)' }}>{num(r.goals)}</b> : '·', sortValue: r => num(r.goals) },
    { key: 'a', header: 'A', align: 'right', render: r => num(r.assists) > 0 ? num(r.assists) : '·', sortValue: r => num(r.assists) },
    { key: 'nota', header: t('gameplay:player.table.rating'), align: 'right', render: r => { const n = num(r.rating); return <b style={{ color: ratingColor(n), fontFamily: 'var(--font-mono-retro)' }}>{n > 0 ? n.toFixed(1) : '—'}</b>; }, sortValue: r => num(r.rating) },
  ], [t]);

  if (loading) return <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Skeleton height={260} /><Skeleton height={160} /><Skeleton height={160} /></div>;
  if (error || !p) return (
    <div className="page-surface section-panel p-8">
      <EmptyState
        title={t('gameplay:player.loadError')}
        hint={error ?? t('gameplay:player.unavailable')}
        action={<Button variant="secondary" onClick={() => setRefresh((x) => x + 1)}>{t('gameplay:player.retry')}</Button>}
      />
    </div>
  );

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .pp-grid{display:grid;grid-template-columns:2fr 1fr;gap:14px;align-items:start}
        .pp-panel{background:var(--bg-elevated);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border-color);border-radius:16px;padding:24px;box-shadow:var(--shadow-soft);position:relative;overflow:hidden;transition:all 0.3s;}
        .pp-panel::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
        .pp-panel:hover{background:var(--bg-surface);border-color:var(--border-color);box-shadow:0 12px 40px rgba(0,0,0,0.2);}
        .pp-pt{display:flex;align-items:center;gap:8px;font-family:var(--font-display);font-weight:800;font-size:1.1rem;color:var(--text-primary);text-transform:uppercase;letter-spacing:1px;margin-bottom:20px;}
        .pp-pt svg{color:var(--green-primary);filter:drop-shadow(0 0 8px var(--green-primary));}
        .pp-row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid color-mix(in srgb,var(--border-color) 30%,transparent);font-size:.85rem;color:var(--text-muted);transition:background 0.2s;margin:0 -12px;padding-inline:12px;border-radius:4px;}
        .pp-row:hover{background:var(--row-hover);color:var(--text-primary);}
        .pp-row b{font-family:var(--font-mono-retro);color:var(--text-primary);}
        .pp-totals{display:flex;gap:14px;flex-wrap:wrap;margin-top:16px;padding-top:16px;border-top:1px dashed var(--border-color);font-size:.8rem;color:var(--text-muted);background:var(--bg-surface);padding:12px;border-radius:8px;}
        .pp-totals b{font-family:var(--font-mono-retro);color:var(--gold-accent);}
        @media(max-width:860px){.pp-grid{grid-template-columns:1fr}}
      `}</style>

      {dossier && (
        <PlayerDossier 
          player={dossier} 
          actionButton={
            <button 
              disabled={following}
              onClick={handleFollow}
              className="flex items-center gap-2 bg-black/30 hover:bg-white text-white hover:text-black border border-white/20 hover:border-white shadow-[0_4px_10px_rgba(0,0,0,0.5)] transition-all uppercase tracking-widest text-xs h-8 px-3 rounded"
            >
              {following ? <span className="animate-spin">⟳</span> : <Star size={14} />}
              {following ? t('gameplay:player.following') : t('gameplay:player.follow')}
            </button>
          }
        />
      )}

      <div className="pp-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Trayectoria por temporada */}
          <div className="pp-panel">
            <div className="pp-pt"><History size={14} /> {t('gameplay:player.career.title')}</div>
            {seasons.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('gameplay:player.career.empty')}</p>
              : (
                <>
                  <SortableTable columns={seasonCols} data={seasons} initialSort={{ key: 'season', dir: 'asc' }} rowKey={r => r.id} />
                  <div className="pp-totals">
                    <span>{t('gameplay:player.career.total')}</span>
                    <span><b>{totals.pj}</b> {t('gameplay:player.table.played')}</span>
                    <span><b>{totals.min}</b> {t('gameplay:player.table.minutes').toLowerCase()}</span>
                    <span><b>{totals.g}</b> {t('gameplay:player.table.goals').toLowerCase()}</span>
                    <span><b>{totals.a}</b> {t('gameplay:player.table.assists').toLowerCase()}</span>
                    <span><b>{totals.xg.toFixed(1)}</b> {t('gameplay:player.career.xg')}</span>
                    <span>{t('gameplay:player.career.avgRating')} <b>{totals.pjConNota > 0 ? (totals.notaSum / totals.pjConNota).toFixed(2) : '—'}</b></span>
                  </div>
                </>
              )}
          </div>

          {/* Últimos partidos */}
          <div className="pp-panel">
            <div className="pp-pt"><CalendarDays size={14} /> {t('gameplay:player.matches.title')}
              {ratings.length > 1 && <span style={{ marginLeft: 'auto' }}><Sparkline data={ratings} width={120} height={26} /></span>}
            </div>
            {matches.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('gameplay:player.matches.empty')}</p>
              : <SortableTable columns={matchCols} data={matches} initialSort={{ key: 'fecha', dir: 'desc' }} rowKey={r => r.id} />}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Estado de Disponibilidad */}
          {p.availability && p.availability.status !== 'available' && (
            <div className="pp-panel" style={{ borderColor: p.availability.status === 'injured' ? 'var(--gold-accent)' : 'var(--red-danger)', background: p.availability.status === 'injured' ? 'color-mix(in srgb,var(--gold-accent) 10%,transparent)' : 'color-mix(in srgb,var(--red-danger) 10%,transparent)' }}>
              <div className="pp-pt" style={{ color: p.availability.status === 'injured' ? 'var(--gold-accent)' : 'var(--red-danger)' }}><AlertCircle size={14} /> {t('gameplay:player.availability.title')}</div>
              <p style={{ fontSize: '.85rem', color: 'var(--text-primary)' }}>
                {p.availability.status === 'injured' ? t('gameplay:player.availability.injured') : t('gameplay:player.availability.suspended')}
                {p.availability.reason ? ` - ${p.availability.reason}` : ''}
              </p>
              {p.availability.untilDate && <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{t('gameplay:player.availability.until', { date: new Date(p.availability.untilDate).toLocaleDateString('es-ES') })}</p>}
            </div>
          )}

          {/* Contrato detallado */}
          <div className="pp-panel">
            <div className="pp-pt"><FileText size={14} /> {t('gameplay:player.contract.title')}</div>
            <div className="pp-row"><span>{t('gameplay:player.contract.club')}</span><b><ClubLink id={p.club?.id ?? p.clubId} name={p.club?.name ?? t('gameplay:player.freeAgent')} /></b></div>
            <div className="pp-row"><span>{t('gameplay:player.contract.wage')}</span><b style={{ color: 'var(--gold-accent)' }}>{eur(p.contract?.wage ?? p.wage)}</b></div>
            <div className="pp-row"><span>{t('gameplay:player.contract.clause')}</span><b>{eur(p.contract?.releaseClause ?? p.releaseClause)}</b></div>
            <div className="pp-row"><span>{t('gameplay:player.contract.yearsLeft')}</span><b>{p.contract?.yearsRemaining ?? p.contractYears ?? '—'}</b></div>
            {(p.contract?.endsAt) && <div className="pp-row"><span>{t('gameplay:player.contract.endsAt')}</span><b>{new Date(p.contract.endsAt).toLocaleDateString('es-ES')}</b></div>}
            <div className="pp-row"><span>{t('gameplay:player.contract.marketValue')}</span><b style={{ color: 'var(--green-primary)' }}>{eur(p.marketValue)}</b></div>
            {p.squadNumber != null && <div className="pp-row"><span>{t('gameplay:player.contract.squadNumber')}</span><b>#{p.squadNumber}</b></div>}
            <div className="pp-row"><span>{t('gameplay:player.contract.foot')}</span><b>{p.preferredFoot === 'Left' ? t('gameplay:player.contract.footLeft') : p.preferredFoot === 'Right' ? t('gameplay:player.contract.footRight') : p.preferredFoot ?? '—'}</b></div>
            <div className="pp-row"><span>{t('gameplay:player.contract.personality')}</span><b>{p.personality ?? '—'}</b></div>
          </div>

          {/* Historial de traspasos */}
          {Array.isArray(p.transferHistory) && p.transferHistory.length > 0 && (
            <div className="pp-panel">
              <div className="pp-pt"><ArrowLeftRight size={14} /> {t('gameplay:player.transfers.title')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {p.transferHistory.map((th: any, idx: number) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', paddingBottom: 8, borderBottom: idx < p.transferHistory.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{th.date ? new Date(th.date).getFullYear() : th.season}</span>
                      <b style={{ fontSize: '.85rem', fontFamily: 'var(--font-mono-retro)', color: th.fee > 0 ? 'var(--gold-accent)' : 'var(--text-primary)' }}>{th.fee === 0 ? t('gameplay:player.transfers.free') : eur(th.fee)}</b>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem', marginTop: 4 }}>
                      {th.fromClub ? <ClubLink id={th.fromClub.id} name={th.fromClub.shortName ?? th.fromClub.name} /> : <span style={{ color: 'var(--text-muted)' }}>{t('gameplay:player.freeAgent')}</span>}
                      <ArrowLeftRight size={12} style={{ color: 'var(--text-muted)' }} />
                      {th.toClub ? <ClubLink id={th.toClub.id} name={th.toClub.shortName ?? th.toClub.name} /> : <span style={{ color: 'var(--text-muted)' }}>{t('gameplay:player.freeAgent')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* E4 · Progresión (PlayerDevelopment acumulado) */}
          <div className="pp-panel">
            <div className="pp-pt"><TrendingUp size={14} /> {t('gameplay:player.progression.title')}</div>
            {development.curve.length < 2
              ? <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('gameplay:player.progression.empty')}</p>
              : (
                <>
                  <Sparkline data={development.curve} width={240} height={48} responsive
                    color={development.total >= 0 ? 'var(--green-primary)' : 'var(--red-danger)'} />
                  <div className="pp-row" style={{ borderTop: 'none', paddingTop: 10 }}>
                    <span>{t('gameplay:player.progression.totalChange')}</span>
                    <b style={{ color: development.total >= 0 ? 'var(--green-primary)' : 'var(--red-danger)' }}>
                      {development.total > 0 ? `+${development.total}` : development.total} {t('gameplay:player.progression.points')}
                    </b>
                  </div>
                  {development.seasons.map(([season, delta]) => (
                    <div key={season} className="pp-row">
                      <span>{season}</span>
                      <b style={{ color: delta >= 0 ? 'var(--green-primary)' : 'var(--red-danger)' }}>{delta > 0 ? `+${delta}` : delta}</b>
                    </div>
                  ))}
                </>
              )}
          </div>

          {/* Palmarés individual */}
          <div className="pp-panel">
            <div className="pp-pt"><Medal size={14} /> {t('gameplay:player.honours.title')}</div>
            {honours.length === 0
              ? <p style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{t('gameplay:player.honours.empty')}</p>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {honours.map((h: any) => <TrophyCard key={h.id} award={{ id: h.id, name: h.name, season: h.season }} />)}
                </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
