// ─── E9 · Página de competición /competition/:id ───────────────────────────────
// Clasificación (con zonas según formato: liga clásica o fase liga de 36) ·
// Cuadro de eliminatorias (copas) · Jornadas · Rankings (goleadores/asistentes/
// notas). Todo clicable (ClubLink/PlayerLink). Contra GET /world/competitions/:id,
// /fixtures, /cup?competitionId= y /leaderboards?competitionId=.
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Trophy, ListOrdered, GitBranch, CalendarDays, Crown } from 'lucide-react';
import { worldApi } from '../api/client';
import { asArray } from '../lib/normalize';
import { Skeleton, Tabs, SortableTable, EmptyState, Button, ClubBadge, type SortCol } from '../components/ui';
import { ClubLink, PlayerLink, ManagerLink } from '../components/common/EntityLink';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';

interface TableRow {
  position: number; played: number; won: number; drawn: number; lost: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
  club: { id: number; name: string; shortName?: string; badge?: string; manager?: { id: number; name: string }; npcCoach?: { name: string; avatarSeed?: string; tacticalStyle?: { favoriteFormation?: string } } };
}
interface CompMatch {
  id: number; status?: string; homeGoals?: number | null; awayGoals?: number | null; playedAt?: string;
  homeClub?: { id: number; name?: string; shortName?: string; badge?: string };
  awayClub?: { id: number; name?: string; shortName?: string; badge?: string };
  winnerClubId?: number | null; penalties?: any; resultHidden?: boolean;
}
interface Round { id: number; number: number; status?: string; matches: CompMatch[] }

// Nombre humano de la ronda según distancia a la final
function roundLabelKey(idx: number, total: number): string {
  const fromEnd = total - 1 - idx;
  if (fromEnd === 0) return 'gameplay:competition.rounds.final';
  if (fromEnd === 1) return 'gameplay:competition.rounds.semis';
  if (fromEnd === 2) return 'gameplay:competition.rounds.quarters';
  if (fromEnd === 3) return 'gameplay:competition.rounds.round16';
  return 'gameplay:competition.rounds.roundN';
}

// Zonas de color: fase liga 36 (UCL/UEL/UECL) vs liga clásica
function zoneColor(pos: number, total: number, isLeaguePhase: boolean): string | undefined {
  if (isLeaguePhase) {
    if (pos <= 8) return 'var(--green-primary)';          // octavos directos
    if (pos <= 24) return 'var(--gold-accent)';           // playoff
    return undefined;                                      // eliminados
  }
  if (pos <= 4) return 'var(--blue-info)';                 // Champions
  if (pos <= 6) return 'var(--green-primary)';             // Europa
  if (pos > total - 3) return 'var(--red-danger)';         // descenso
  return undefined;
}

export function CompetitionPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const compId = Number(id);
  const [comp, setComp] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('tabla');
  const [bracket, setBracket] = useState<{ rounds: Round[]; championId?: number | null } | null | undefined>(undefined);
  const [fixtures, setFixtures] = useState<Round[] | null>(null);
  const [boards, setBoards] = useState<any | null>(null);

  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null); setComp(null); setBracket(undefined); setFixtures(null); setBoards(null);
    if (!Number.isFinite(compId)) { setError(t('gameplay:competition.invalid')); setLoading(false); return; }
    worldApi.competition(compId)
      .then(d => { if (alive) { setComp(d); setTab(d?.type === 'cup' ? 'cuadro' : 'tabla'); } })
      .catch(err => { if (alive) setError(err instanceof Error ? err.message : t('gameplay:competition.loadError')); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [compId, refresh, t]);

  // Carga perezosa por pestaña
  useEffect(() => {
    if (!comp) return;
    let alive = true;
    if (tab === 'cuadro' && bracket === undefined) {
      worldApi.cup(compId)
        .then((r: any) => {
          if (!alive) return;
          const cup = (r?.cups ?? []).find((c: any) => c.id === compId) ?? (r?.cups ?? [])[0];
          setBracket(cup ? { rounds: cup.rounds ?? [], championId: cup.championId } : null);
        })
        .catch(() => { if (alive) setBracket(null); });
    }
    if (tab === 'jornadas' && fixtures === null) {
      worldApi.competitionFixtures(compId)
        .then((r: any) => { if (alive) setFixtures(r?.matchdays ?? []); })
        .catch(() => { if (alive) setFixtures([]); });
    }
    if (tab === 'rankings' && boards === null) {
      worldApi.leaderboards({ competitionId: compId, take: 10 })
        .then((r: any) => { if (alive) setBoards(r ?? {}); })
        .catch(() => { if (alive) setBoards({}); });
    }
    return () => { alive = false; };
  }, [tab, comp, compId, bracket, fixtures, boards]);

  const isLeaguePhase = (comp?.table?.length ?? 0) >= 30; // fase liga europea de 36
  const table: TableRow[] = useMemo(() => asArray<TableRow>(comp?.table), [comp]);

  const lbCols = (metric: 'goals' | 'assists' | 'averageRating', label: string): SortCol<any>[] => [
    { key: 'n', header: t('gameplay:competition.table.player'), render: r => <b><PlayerLink id={r.playerId} name={r.name ?? '—'} /></b>, sortValue: r => r.name ?? '' },
    { key: 'c', header: t('gameplay:competition.table.club'), render: r => r.club ? <ClubLink id={r.club.id} name={r.club.shortName ?? r.club.name} /> : '—' },
    { key: 'pj', header: t('gameplay:competition.table.played'), align: 'right', render: r => r.matches ?? 0, sortValue: r => r.matches ?? 0 },
    { key: 'v', header: label, align: 'right', render: r => <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>{metric === 'averageRating' ? (r[metric] ?? 0).toFixed(1) : r[metric] ?? 0}</b>, sortValue: r => r[metric] ?? 0 },
  ];

  if (loading) return <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}><Skeleton height={90} /><Skeleton height={300} /></div>;
  if (error || !comp) return (
    <div className="page-surface section-panel p-8">
      <EmptyState
        title={t('gameplay:competition.loadError')}
        hint={error ?? t('gameplay:competition.unavailable')}
        action={<Button variant="secondary" onClick={() => setRefresh((x) => x + 1)}>{t('gameplay:competition.retry')}</Button>}
      />
    </div>
  );

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .cp-hero{position:relative;overflow:hidden;display:flex;align-items:center;gap:24px;padding:40px;
          border-radius:32px;background:var(--bg-elevated);border:1px solid var(--border-color);box-shadow:var(--shadow-soft);
          backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);transition:all 0.5s}
        .cp-hero::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
        .cp-scan{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at top right, rgba(250,204,21,0.15), transparent 70%);opacity:0.8;mix-blend-mode:screen;}
        .cp-hero-ic{z-index:1;width:80px;height:80px;display:grid;place-items:center;border-radius:24px;
          background:linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,215,0,0.05));border:2px solid rgba(255,215,0,0.4);color:var(--gold-accent);
          box-shadow:0 0 40px rgba(255,215,0,0.2), inset 0 0 20px rgba(255,215,0,0.1);transition:transform 0.5s}
        .cp-hero:hover .cp-hero-ic{transform:scale(1.1) rotate(5deg);box-shadow:0 0 50px rgba(255,215,0,0.4), inset 0 0 30px rgba(255,215,0,0.2);}
        .cp-name{font-family:var(--font-display);font-weight:900;font-size:2.8rem;color:var(--text-primary);text-transform:uppercase;letter-spacing:-1.5px;text-shadow:0 5px 15px rgba(0,0,0,0.3);line-height:1.1;margin-bottom:8px}
        .cp-sub{color:var(--text-muted);font-size:.9rem;font-family:var(--font-sans);font-weight:700;letter-spacing:1px}
        .cp-panel{background:var(--bg-elevated);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid var(--border-color);border-radius:24px;padding:24px;box-shadow:var(--shadow-soft);position:relative;}
        .cp-panel::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
        .cp-table{width:100%;border-collapse:collapse;font-size:.95rem}
        .cp-table th{text-align:center;padding:16px 12px;font-size:.75rem;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);border-bottom:1px solid var(--border-color);font-family:var(--font-display);background:var(--bg-surface)}
        .cp-table th:nth-child(2){text-align:left}
        .cp-table td{padding:14px 12px;text-align:center;border-bottom:1px solid var(--border-color)}
        .cp-table td:nth-child(2){text-align:left}
        .cp-table tr{transition:all .3s}
        .cp-table tr:hover{background:var(--row-hover);transform:scale(1.01);box-shadow:0 5px 15px rgba(0,0,0,0.1);position:relative;z-index:2;}
        .cp-pos{display:inline-flex;align-items:center;gap:12px;font-family:var(--font-sans);font-weight:900;font-size:1.1rem;text-shadow:0 2px 4px rgba(0,0,0,0.5)}
        .cp-dot{width:10px;height:10px;border-radius:50%;box-shadow:0 0 15px currentColor}
        .cp-pts{font-family:var(--font-mono-retro);font-weight:900;font-size:1.3rem;color:var(--gold-accent);text-shadow:0 2px 10px rgba(250,204,21,0.5)}
        .cp-round{margin-bottom:32px}
        .cp-round:last-child{margin-bottom:0}
        .cp-rt{display:flex;align-items:center;gap:12px;font-family:var(--font-display);font-weight:900;font-size:1rem;text-transform:uppercase;letter-spacing:2px;color:var(--text-primary);margin-bottom:16px;border-bottom:2px solid rgba(34,197,94,0.5);padding-bottom:12px}
        .cp-rt svg{color:var(--green-primary);filter:drop-shadow(0 0 8px var(--green-primary));}
        .cp-tie{display:flex;align-items:center;gap:16px;padding:16px 20px;border:1px solid var(--border-color);border-radius:16px;background:var(--bg-surface);margin-bottom:12px;font-size:.95rem;transition:all .3s}
        .cp-tie:hover{background:var(--row-hover);transform:translateY(-2px);box-shadow:var(--shadow-soft);border-color:var(--border-color)}
        .cp-score{font-family:var(--font-mono-retro);font-weight:900;font-size:1.1rem;min-width:64px;text-align:center;background:var(--bg-elevated);padding:6px 10px;border-radius:10px;box-shadow:inset 0 2px 5px rgba(0,0,0,0.2), 0 1px 1px var(--border-color);text-shadow:0 2px 4px rgba(0,0,0,0.2);color:var(--text-primary);}
        .cp-win{color:var(--green-primary);font-weight:900;text-shadow:0 2px 10px rgba(34,197,94,0.5)}
        .cp-leg{display:grid;grid-template-columns:1fr 1fr;gap:20px}
        @media(max-width:800px){.cp-leg{grid-template-columns:1fr}}
      `}</style>

      <div className="cp-hero">
        <div className="cp-scan" />
        <div className="cp-hero-ic"><Trophy size={28} /></div>
        <div style={{ zIndex: 1 }}>
          <p className="text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold-accent)] animate-pulse" />
            {t('gameplay:competition.kicker')}
          </p>
          <div className="cp-name">{comp.name}</div>
          <div className="cp-sub">{[comp.country, comp.season?.name, comp.type === 'cup' ? t('gameplay:competition.typeCup') : isLeaguePhase ? t('gameplay:competition.typeLeaguePhase') : t('gameplay:competition.typeLeague')].filter(Boolean).join(' · ')}</div>
        </div>
      </div>

      <Tabs
        tabs={[
          ...(table.length > 0 ? [{ id: 'tabla', label: isLeaguePhase ? t('gameplay:competition.tabs.leaguePhase') : t('gameplay:competition.tabs.table') }] : []),
          ...(comp.type === 'cup' || isLeaguePhase ? [{ id: 'cuadro', label: t('gameplay:competition.tabs.bracket') }] : []),
          { id: 'jornadas', label: t('gameplay:competition.tabs.matchdays'), count: comp.matchdays?.length },
          { id: 'rankings', label: t('gameplay:competition.tabs.rankings') },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {tab === 'tabla' && (
        <div className="cp-panel" style={{ overflowX: 'auto' }}>
          <table className="cp-table">
            <thead><tr><th>#</th><th>{t('gameplay:competition.table.club')}</th><th>{t('gameplay:competition.table.played')}</th><th>{t('gameplay:competition.table.won')}</th><th>{t('gameplay:competition.table.drawn')}</th><th>{t('gameplay:competition.table.lost')}</th><th>{t('gameplay:competition.table.gf')}</th><th>{t('gameplay:competition.table.ga')}</th><th>{t('gameplay:competition.table.gd')}</th><th>{t('gameplay:competition.table.pts')}</th></tr></thead>
            <tbody>
              {table.map(r => {
                const zone = zoneColor(r.position, table.length, isLeaguePhase);
                return (
                  <tr key={r.club.id}>
                    <td><span className="cp-pos">{zone && <span className="cp-dot" style={{ background: zone }} />}{r.position}</span></td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <ClubBadge id={r.club.id} name={r.club.name} badge={(r.club as any).badge} primaryColor={(r.club as any).primaryColor} secondaryColor={(r.club as any).secondaryColor} size={17} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <ClubLink id={r.club.id} name={r.club.name} />
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.2px' }}>
                            {r.club.manager
                              ? <ManagerLink id={r.club.manager.id} name={r.club.manager.name} />
                              : r.club.npcCoach
                                ? <NpcCoachIdentity npcCoach={r.club.npcCoach} size={14} compact showFormation={false} />
                                : '—'}
                          </span>
                        </div>
                      </span>
                    </td>
                    <td>{r.played}</td><td>{r.won}</td><td>{r.drawn}</td><td>{r.lost}</td>
                    <td>{r.goalsFor}</td><td>{r.goalsAgainst}</td>
                    <td style={{ color: r.goalDifference >= 0 ? 'var(--green-primary)' : 'var(--red-danger)' }}>{r.goalDifference > 0 ? `+${r.goalDifference}` : r.goalDifference}</td>
                    <td className="cp-pts">{r.points}</td>
                  </tr>
                );
              })}
              {table.length === 0 && <tr><td colSpan={10} style={{ color: 'var(--text-muted)', padding: 16 }}>{t('gameplay:competition.emptyTable')}</td></tr>}
            </tbody>
          </table>
          {isLeaguePhase && (
            <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 8 }}>
              <span className="cp-dot" style={{ display: 'inline-block', background: 'var(--green-primary)' }} /> {t('gameplay:competition.leaguePhaseLegend.direct')} ·{' '}
              <span className="cp-dot" style={{ display: 'inline-block', background: 'var(--gold-accent)' }} /> {t('gameplay:competition.leaguePhaseLegend.playoff')} · {t('gameplay:competition.leaguePhaseLegend.eliminated')}
            </p>
          )}
        </div>
      )}

      {tab === 'cuadro' && (
        <div className="cp-panel">
          {bracket === undefined && <Skeleton height={200} />}
          {bracket === null && <EmptyState icon={<GitBranch size={20} />} title={t('gameplay:competition.emptyBracket')} hint={t('gameplay:competition.emptyBracketHint')} />}
          {bracket && bracket.rounds.length === 0 && <EmptyState icon={<GitBranch size={20} />} title={t('gameplay:competition.emptyBracketPending')} />}
          {bracket && bracket.rounds.map((round, i) => (
            <div key={round.id} className="cp-round">
              <div className="cp-rt"><GitBranch size={13} /> {t(roundLabelKey(i, bracket.rounds.length), { n: i + 1 })} {round.status === 'played' && t('gameplay:competition.roundClosed')}</div>
              <div className="cp-leg">
                {round.matches.map(m => {
                  const played = m.status === 'played' && m.homeGoals != null;
                  const homeWin = played && m.winnerClubId === m.homeClub?.id;
                  const awayWin = played && m.winnerClubId === m.awayClub?.id;
                  return (
                    <div key={m.id} className="cp-tie">
                      <span style={{ flex: 1, textAlign: 'right' }} className={homeWin ? 'cp-win' : undefined}>
                        <ClubLink id={m.homeClub?.id} name={m.homeClub?.shortName ?? m.homeClub?.name ?? '—'} />
                        {bracket.championId != null && m.winnerClubId === m.homeClub?.id && i === bracket.rounds.length - 1 && <Crown size={12} style={{ display: 'inline', marginLeft: 4, color: 'var(--gold-accent)' }} />}
                      </span>
                      <span className="cp-score">{played ? (m.resultHidden ? '? - ?' : `${m.homeGoals}-${m.awayGoals}`) : 'vs'}{m.penalties ? ' (p)' : ''}</span>
                      <span style={{ flex: 1 }} className={awayWin ? 'cp-win' : undefined}>
                        <ClubLink id={m.awayClub?.id} name={m.awayClub?.shortName ?? m.awayClub?.name ?? '—'} />
                        {bracket.championId != null && m.winnerClubId === m.awayClub?.id && i === bracket.rounds.length - 1 && <Crown size={12} style={{ display: 'inline', marginLeft: 4, color: 'var(--gold-accent)' }} />}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'jornadas' && (
        <div className="cp-panel">
          {fixtures === null && <Skeleton height={200} />}
          {fixtures !== null && fixtures.length === 0 && <EmptyState icon={<CalendarDays size={20} />} title={t('gameplay:competition.emptyMatchdays')} />}
          {(fixtures ?? []).map(md => (
            <div key={md.id} className="cp-round">
              <div className="cp-rt"><ListOrdered size={13} /> {t('gameplay:competition.matchday', { n: md.number })} {md.status === 'played' && t('gameplay:competition.matchdayPlayed')}</div>
              <div className="cp-leg">
                {md.matches.map(m => (
                  <div key={m.id} className="cp-tie">
                    <span style={{ flex: 1, textAlign: 'right' }}><ClubLink id={m.homeClub?.id} name={m.homeClub?.shortName ?? m.homeClub?.name ?? '—'} /></span>
                    <span className="cp-score">{m.status === 'played' && m.homeGoals != null ? (m.resultHidden ? '? - ?' : `${m.homeGoals}-${m.awayGoals}`) : 'vs'}</span>
                    <span style={{ flex: 1 }}><ClubLink id={m.awayClub?.id} name={m.awayClub?.shortName ?? m.awayClub?.name ?? '—'} /></span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'rankings' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))', gap: 14 }}>
          {boards === null && <Skeleton height={200} />}
          {boards && (
            <>
              <div className="cp-panel"><div className="cp-rt">⚽ {t('gameplay:competition.rankings.scorers')}</div>
                {(boards.topScorers ?? []).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{t('gameplay:competition.rankings.noData')}</p>
                  : <SortableTable columns={lbCols('goals', t('gameplay:competition.table.goals'))} data={boards.topScorers} rowKey={(r: any) => r.playerId} />}
              </div>
              <div className="cp-panel"><div className="cp-rt">🎯 {t('gameplay:competition.rankings.assists')}</div>
                {(boards.topAssists ?? []).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{t('gameplay:competition.rankings.noData')}</p>
                  : <SortableTable columns={lbCols('assists', t('gameplay:competition.table.assists'))} data={boards.topAssists} rowKey={(r: any) => r.playerId} />}
              </div>
              <div className="cp-panel"><div className="cp-rt">⭐ {t('gameplay:competition.rankings.bestRating')}</div>
                {(boards.bestAverageRatings ?? []).length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>{t('gameplay:competition.rankings.noData')}</p>
                  : <SortableTable columns={lbCols('averageRating', t('gameplay:competition.table.rating'))} data={boards.bestAverageRatings} rowKey={(r: any) => r.playerId} />}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
