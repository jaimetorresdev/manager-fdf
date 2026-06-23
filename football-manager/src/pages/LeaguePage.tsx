// ─── Ligas · Clasificación premium (E17 · LOTE C) ──────────────────────────────
// Zonas de color con borde izquierdo (UCL verde / UEL violeta / descenso rojo),
// forma de los últimos 5 como puntitos V/E/D, escudo por fila, mi fila resaltada
// y panel lateral de líderes (goleadores/asistentes vía /world/leaderboards).
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import { worldApi, authApi, apiOrigin } from '../api/client';
import { dedupeBy, asArray } from '../lib/normalize';
import { ClubLink, ManagerLink } from '../components/common/EntityLink';
import { NpcCoachIdentity } from '../components/public/NpcCoachIdentity';
import { ClubBadge, Skeleton, EmptyState, Button } from '../components/ui';
import { LeagueLeaders, type LeaderRow } from '../components/world2/LeagueLeaders';
import { LeagueDropdown } from '../components/ui/LeagueDropdown';
import {
  DISPLAY_ZONE_COLOR,
  leagueDisplayZone,
  standingsLegend,
  type DisplayZone,
  type LeagueZoneMeta,
} from '../lib/standingsZones';

interface Standing {
  position: number;
  movementZone?: 'promotion' | 'relegation' | 'safe';
  club: {
    id: number;
    name: string;
    shortName: string;
    manager?: { id: number; name: string };
    npcCoach?: { name: string; avatarSeed?: string; tacticalStyle?: { favoriteFormation?: string } };
  };
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  goalDifference: number;
}

interface StandingsCompetition {
  id: number;
  name: string;
  shortName?: string;
  country?: string;
  tier: number;
  promotionSlots: number;
  relegationSlots: number;
  table: Standing[];
}

interface StandingsResponse {
  season?: { id: number; name: string; year: number } | null;
  competitions: StandingsCompetition[];
}

interface Competition {
  id: number;
  name: string;
  shortName: string;
  country: string;
  tier?: number;
  promotionSlots?: number;
  relegationSlots?: number;
}


type FormResult = 'V' | 'E' | 'D' | '?';

const ZONE_ARIA: Record<Exclude<DisplayZone, 'normal'>, string> = {
  champion: 'gameplay:league.zoneAriaChampions',
  europa: 'gameplay:league.zoneAriaEuropa',
  relegated: 'gameplay:league.zoneAriaRelegation',
};

const LEGEND_I18N: Record<DisplayZone, string> = {
  champion: 'gameplay:league.zoneChampions',
  europa: 'gameplay:league.zoneEuropa',
  relegated: 'gameplay:league.zoneRelegation',
  normal: 'gameplay:league.zoneAriaNormal',
};

const FORM_COLOR: Record<FormResult, string> = {
  V: 'var(--green-primary)',
  E: 'var(--gold-accent)',
  D: 'var(--red-danger)',
  '?': 'var(--text-muted)',
};

function FormDots({ form }: { form: FormResult[] }) {
  if (form.length === 0) return <span className="lg-mut" style={{ fontFamily: 'var(--font-mono-retro)', fontSize: '.7rem' }}>—</span>;
  return (
    <span className="lg-form" title={form.join(' · ')}>
      {form.map((r, i) => (
        <span
          key={i}
          className="lg-fdot"
          style={{
            background: `color-mix(in srgb, ${FORM_COLOR[r]} ${i === form.length - 1 ? 100 : 70}%, transparent)`,
            boxShadow: i === form.length - 1 ? `0 0 6px ${FORM_COLOR[r]}` : undefined,
          }}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

function StandingsTable({ standings, myClubId, formByClub, zoneMeta }: {
  standings: Standing[];
  myClubId?: number;
  formByClub: Map<number, FormResult[]>;
  zoneMeta: LeagueZoneMeta;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="lg-scroll">
      <table className="lg-table">
        <thead>
          <tr>
            <th className="lg-th lg-c" style={{ width: 52 }}>#</th>
            <th className="lg-th">{t('gameplay:league.table.team')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.played')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.won')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.drawn')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.lost')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.gf')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.ga')}</th>
            <th className="lg-th lg-c">{t('gameplay:competition.table.gd')}</th>
            <th className="lg-th lg-c">{t('gameplay:league.table.form')}</th>
            <th className="lg-th lg-c lg-pts-h">{t('gameplay:competition.table.pts')}</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, i) => {
            const isMe = row.club?.id === myClubId;
            const posType = leagueDisplayZone(row.position, {
              ...zoneMeta,
              movementZone: row.movementZone,
            });

            const zoneAria = posType === 'normal'
              ? t('gameplay:league.zoneAriaNormal', { pos: row.position })
              : t(ZONE_ARIA[posType], { pos: row.position });

            return (
              <tr
                key={row.club?.id ?? i}
                role="button"
                tabIndex={0}
                aria-label={zoneAria}
                onClick={() => row.club?.id && navigate(`/club/${row.club.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (row.club?.id) navigate(`/club/${row.club.id}`); } }}
                className={`lg-row${isMe ? ' lg-me' : ''}${posType === 'relegated' ? ' lg-rel' : ''}`}
                style={{ cursor: 'pointer', boxShadow: posType !== 'normal' ? `inset 3px 0 0 ${DISPLAY_ZONE_COLOR[posType]}` : undefined }}
              >
                <td className="lg-td lg-c">
                  <span className="lg-pos-wrap">
                    {posType !== 'normal' && (
                      <span className="lg-dot" style={{ background: DISPLAY_ZONE_COLOR[posType] }} aria-hidden="true" />
                    )}
                    <span
                      className="lg-pos"
                      style={{ color: isMe ? 'var(--green-primary)' : posType !== 'normal' ? DISPLAY_ZONE_COLOR[posType] : 'var(--text-muted)' }}
                    >
                      {row.position}
                    </span>
                  </span>
                </td>
                <td className="lg-td">
                  <span className="lg-club">
                    <ClubBadge id={row.club?.id} name={row.club?.name} badge={(row.club as any)?.badge} primaryColor={(row.club as any)?.primaryColor} secondaryColor={(row.club as any)?.secondaryColor} size={18} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className={isMe ? 'lg-club-me' : 'lg-club-name'}>
                          <ClubLink id={row.club?.id ?? 0} name={row.club?.name ?? 'Club'} />
                        </span>
                        {isMe && <span className="lg-tag lg-tag-me">{t('gameplay:league.youTag')}</span>}
                        {i === 0 && !isMe && <span className="lg-tag lg-tag-gold">🏆</span>}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {row.club?.manager ? (
                          <>
                            <img src={`${apiOrigin()}/api/public/avatar/${row.club.manager.id}`} style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', background: 'var(--brutal-bg-elevated)' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} alt="" />
                            <ManagerLink id={row.club.manager.id} name={row.club.manager.name} />
                          </>
                        ) : row.club?.npcCoach ? (
                          <NpcCoachIdentity npcCoach={row.club.npcCoach} size={18} compact />
                        ) : '—'}
                      </span>
                    </div>
                  </span>
                </td>
                <td className="lg-td lg-c lg-num lg-mut">{row.played}</td>
                <td className="lg-td lg-c lg-num" style={{ color: 'var(--green-primary)' }}>{row.won}</td>
                <td className="lg-td lg-c lg-num lg-mut">{row.drawn}</td>
                <td className="lg-td lg-c lg-num" style={{ color: 'var(--red-danger)' }}>{row.lost}</td>
                <td className="lg-td lg-c lg-num">{row.goalsFor}</td>
                <td className="lg-td lg-c lg-num lg-mut">{row.goalsAgainst}</td>
                <td
                  className="lg-td lg-c lg-num"
                  style={{ color: row.goalDifference > 0 ? 'var(--green-primary)' : row.goalDifference < 0 ? 'var(--red-danger)' : 'var(--text-muted)' }}
                >
                  {row.goalDifference > 0 ? '+' : ''}{row.goalDifference}
                </td>
                <td className="lg-td lg-c">
                  <FormDots form={formByClub.get(row.club?.id ?? -1) ?? []} />
                </td>
                <td className="lg-td lg-c">
                  <span className="lg-pts" style={{ color: isMe ? 'var(--gold-accent)' : 'var(--brutal-text)' }}>
                    {row.points}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Forma (últimos 5, V/E/D) por club a partir de los fixtures de la competición. */
function computeForm(fixtures: any): Map<number, FormResult[]> {
  const map = new Map<number, FormResult[]>();
  const matchdays = asArray<any>(fixtures?.matchdays).slice().sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  for (const md of matchdays) {
    for (const m of asArray<any>(md?.matches)) {
      if (m?.status !== 'played' || m.homeGoals == null || m.awayGoals == null) continue;
      const hid = m.homeClub?.id; const aid = m.awayClub?.id;
      if (hid == null || aid == null) continue;
      const hRes: FormResult = m.resultHidden ? '?' : m.homeGoals > m.awayGoals ? 'V' : m.homeGoals < m.awayGoals ? 'D' : 'E';
      const aRes: FormResult = m.resultHidden ? '?' : hRes === 'V' ? 'D' : hRes === 'D' ? 'V' : 'E';
      map.set(hid, [...(map.get(hid) ?? []), hRes].slice(-5));
      map.set(aid, [...(map.get(aid) ?? []), aRes].slice(-5));
    }
  }
  return map;
}

export function LeaguePage() {
  const { t } = useTranslation();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [selectedCompId, setSelectedCompId] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [compError, setCompError] = useState<string | null>(null);
  const [myClubId, setMyClubId] = useState<number | undefined>(undefined);
  const [formByClub, setFormByClub] = useState<Map<number, FormResult[]>>(new Map());
  const [leaders, setLeaders] = useState<{ topScorers: LeaderRow[]; topAssists: LeaderRow[] }>({ topScorers: [], topAssists: [] });
  const [leadersLoading, setLeadersLoading] = useState(true);
  const [compRefresh, setCompRefresh] = useState(0);
  const [zoneMeta, setZoneMeta] = useState<LeagueZoneMeta>({ tier: 1, maxTier: 1, totalRows: 0 });

  useEffect(() => {
    let cancelled = false;
    
    Promise.all([
      authApi.me().catch(() => null),
      worldApi.standings().catch((e) => { throw e; })
    ]).then(([me, raw]) => {
      if (cancelled) return;
      
      const userClubId = me?.manager?.clubId;
      if (userClubId) setMyClubId(userClubId);
      
      const data = raw as StandingsResponse;
      setCompError(null);
      const leagues = dedupeBy(
        data.competitions ?? [],
        (c) => `${c.name}·${c.country ?? ''}`,
      );
      
      setCompetitions(leagues.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.shortName ?? c.name,
        country: c.country ?? '',
        tier: c.tier,
        promotionSlots: c.promotionSlots,
        relegationSlots: c.relegationSlots,
      })));

      let defaultCompId = leagues[0]?.id ?? null;
      if (userClubId) {
        const myComp = data.competitions.find(c => c.table?.some(row => row.club.id === userClubId));
        if (myComp) defaultCompId = myComp.id;
      }
      setSelectedCompId((prev) => prev ?? defaultCompId);
    }).catch(() => {
      if (!cancelled) {
        setCompError(t('gameplay:league.compError'));
        toast.error(t('gameplay:league.compError'));
        setLoading(false);
      }
    });
    
    return () => { cancelled = true; };
  }, [compRefresh, t]);

  useEffect(() => {
    if (!selectedCompId) return;

    let cancelled = false;
    setLoading(true);
    worldApi.standings({ division: String(selectedCompId) }).then((raw) => {
      if (cancelled) return;
      const data = raw as StandingsResponse;
      const comp = (data.competitions ?? []).find((c) => c.id === selectedCompId)
        ?? data.competitions?.[0];
      if (!comp) {
        setStandings([]);
        setLoading(false);
        return;
      }
      const allTiers = (data.competitions ?? []).map((c) => c.tier);
      const maxTier = Math.max(...allTiers, comp.tier, 1);
      setStandings(comp.table ?? []);
      setZoneMeta({
        tier: comp.tier,
        maxTier,
        totalRows: comp.table?.length ?? 0,
      });
    }).catch(() => {
      if (!cancelled) {
        toast.error(t('gameplay:league.loadError'));
        setStandings([]);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    setFormByClub(new Map());
    worldApi.competitionFixtures(selectedCompId)
      .then((fx) => { if (!cancelled) setFormByClub(computeForm(fx)); })
      .catch(() => { /* sin fixtures: columna Forma muestra — */ });

    setLeadersLoading(true);
    worldApi.leaderboards({ competitionId: selectedCompId, take: 8 })
      .then((lb) => {
        if (cancelled) return;
        setLeaders({
          topScorers: asArray<LeaderRow>(lb?.topScorers).filter(r => (r.goals ?? 0) > 0).slice(0, 8),
          topAssists: asArray<LeaderRow>(lb?.topAssists).filter(r => (r.assists ?? 0) > 0).slice(0, 8),
        });
      })
      .catch(() => { if (!cancelled) setLeaders({ topScorers: [], topAssists: [] }); })
      .finally(() => { if (!cancelled) setLeadersLoading(false); });

    return () => { cancelled = true; };
  }, [selectedCompId, t]);

  const currentComp = competitions.find(c => c.id === selectedCompId);
  const legend = standingsLegend(zoneMeta);

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{`
        .lg-hero {
          position: relative; overflow: hidden; display: flex; align-items: center; gap: 18px; padding: 28px;
          border-radius: 20px; background: linear-gradient(145deg, var(--brutal-bg-1), var(--brutal-bg-2)); border: 2px solid rgba(34,197,94,0.3); 
          box-shadow: 0 20px 50px var(--brutal-shadow), inset 0 0 40px rgba(34,197,94,0.05);
        }
        .lg-hero::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, transparent 0 2px, var(--brutal-scanline) 2px 4px); opacity: 0.5; z-index: 0; }
        .lg-scan { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at top right, rgba(34,197,94,0.2), transparent 70%); opacity: 0.8; mix-blend-mode: screen; }
        .lg-hero-ic {
          z-index: 1; width: 68px; height: 68px; display: grid; place-items: center; border-radius: 18px;
          background: linear-gradient(135deg, rgba(255,215,0,0.3), var(--brutal-glow)); border: 2px solid rgba(255,215,0,0.6); color: var(--gold-accent);
          box-shadow: 0 0 30px rgba(255,215,0,0.3), inset 0 0 20px rgba(255,215,0,0.2); transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lg-hero:hover .lg-hero-ic { transform: scale(1.1) rotate(5deg); box-shadow: 0 0 50px rgba(255,215,0,0.5), inset 0 0 30px rgba(255,215,0,0.4); }
          background: linear-gradient(135deg, color-mix(in srgb, var(--gold-accent) 30%, transparent), var(--brutal-glow)); border: 2px solid color-mix(in srgb, var(--gold-accent) 60%, transparent); color: var(--gold-accent);
          box-shadow: 0 0 30px color-mix(in srgb, var(--gold-accent) 30%, transparent), inset 0 0 20px color-mix(in srgb, var(--gold-accent) 20%, transparent); transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lg-hero:hover .lg-hero-ic { transform: scale(1.1) rotate(5deg); box-shadow: 0 0 50px color-mix(in srgb, var(--gold-accent) 50%, transparent), inset 0 0 30px color-mix(in srgb, var(--gold-accent) 40%, transparent); }
        
        .lg-legend {
          display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 24px; padding: 16px 24px; font-size: 0.75rem; color: var(--brutal-text-muted);
          background: var(--brutal-glass); border: 1px solid var(--brutal-border); border-radius: 16px; font-family: var(--font-mono-retro); font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; box-shadow: 0 10px 30px var(--brutal-shadow); backdrop-filter: blur(10px);
        }
        .lg-legend span { display: flex; align-items: center; gap: 12px; color: var(--brutal-text); }
        .lg-ldot { width: 14px; height: 14px; border-radius: 4px; display: inline-block; flex-shrink: 0; box-shadow: 0 0 15px currentColor; border: 1px solid color-mix(in srgb, var(--text-primary) 20%, transparent); }
        .lg-layout { display: grid; grid-template-columns: minmax(0,1fr) 350px; gap: 32px; align-items: start; margin-top: 24px; }
        .lg-panel { background: var(--brutal-glass); border: 1px solid var(--brutal-border); border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px var(--brutal-shadow); backdrop-filter: blur(10px); }
        .lg-panel-h { display: flex; align-items: center; gap: 20px; padding: 28px 32px; background: var(--brutal-glow); border-bottom: 2px solid color-mix(in srgb, var(--green-primary) 50%, transparent); box-shadow: inset 0 -10px 20px color-mix(in srgb, var(--bg-base) 40%, transparent); }
        .lg-panel-t { font-family: var(--font-display); font-weight: 900; font-size: 1.5rem; color: var(--brutal-text); text-transform: uppercase; letter-spacing: 3px; text-shadow: 0 0 20px color-mix(in srgb, var(--text-primary) 20%, transparent); }
        .lg-scroll { overflow-x: auto; padding-bottom: 10px; }
        .lg-scroll::-webkit-scrollbar { height: 8px; }
        .lg-scroll::-webkit-scrollbar-thumb { background: var(--brutal-border); border-radius: 4px; }
        .lg-table { width: 100%; border-collapse: separate; border-spacing: 0 8px; font-size: 1rem; padding: 0 16px; }
        .lg-th {
          padding: 16px 20px; font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 2px;
          color: var(--brutal-text-muted); font-family: var(--font-display); text-align: left; background: transparent; border-bottom: 1px solid var(--brutal-border);
        }
        .lg-pts-h { color: var(--gold-accent); text-shadow: 0 0 10px rgba(255,215,0,0.3); }
        .lg-c { text-align: center; }
        .lg-row { transition: all .3s cubic-bezier(0.4, 0, 0.2, 1); background: linear-gradient(90deg, var(--brutal-card-bg-1), var(--brutal-card-bg-2)); border-radius: 12px; box-shadow: 0 4px 15px var(--brutal-shadow); }
        .lg-row > td:first-child { border-top-left-radius: 12px; border-bottom-left-radius: 12px; }
        .lg-row > td:last-child { border-top-right-radius: 12px; border-bottom-right-radius: 12px; }
        .lg-row:hover { background: linear-gradient(90deg, var(--brutal-bg-elevated), var(--brutal-card-bg-1)); transform: scale(1.02) translateX(5px); box-shadow: 0 15px 30px var(--brutal-shadow), 0 0 20px var(--brutal-border); position: relative; z-index: 2; border: 1px solid var(--brutal-border); }
        .lg-rel { background: linear-gradient(90deg, rgba(239,68,68,0.1), var(--brutal-card-bg-1)); }
        .lg-rel:hover { background: linear-gradient(90deg, rgba(239,68,68,0.2), var(--brutal-bg-elevated)); box-shadow: 0 15px 30px var(--brutal-shadow), 0 0 20px rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.3); }
        .lg-me { background: linear-gradient(90deg, rgba(34,197,94,0.15), var(--brutal-card-bg-1)); border-left: 4px solid var(--green-primary); box-shadow: 0 0 20px rgba(34,197,94,0.1); }
        .lg-me:hover { background: linear-gradient(90deg, rgba(34,197,94,0.25), var(--brutal-bg-elevated)); box-shadow: 0 15px 30px var(--brutal-shadow), 0 0 30px rgba(34,197,94,0.3); border-color: rgba(34,197,94,0.5); }
        .lg-td { padding: 16px 20px; border-top: 1px solid var(--brutal-border); border-bottom: 1px solid var(--brutal-border); }
        .lg-pos-wrap { display: inline-flex; align-items: center; gap: 12px; }
        .lg-dot { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; box-shadow: 0 0 15px currentColor; border: 1px solid color-mix(in srgb, var(--text-primary) 20%, transparent); }
        .lg-pos { font-family: var(--font-display); font-weight: 900; font-size: 1.2rem; text-shadow: 0 0 15px currentColor; }
        .lg-club { display: flex; align-items: center; gap: 16px; }
        .lg-club-name { font-weight: 900; color: var(--brutal-text); font-size: 1.1rem; letter-spacing: 0.5px; }
        .lg-club-me { font-weight: 900; color: var(--green-primary); font-size: 1.1rem; text-shadow: 0 0 15px rgba(34,197,94,0.5); letter-spacing: 0.5px; }
        .lg-tag { font-size: 0.65rem; font-weight: 900; padding: 4px 10px; border-radius: 6px; letter-spacing: 2px; text-transform: uppercase; box-shadow: 0 4px 10px var(--brutal-shadow); }
        .lg-tag-me { background: var(--green-primary); color: #0b1120; box-shadow: 0 0 15px rgba(34,197,94,0.4); }
        .lg-tag-gold { background: var(--gold-accent); color: #0b1120; box-shadow: 0 0 15px rgba(255,215,0,0.4); }
        .lg-num { font-family: var(--font-sans); font-weight: 800; color: var(--brutal-text); font-size: 1.05rem; }
        .lg-mut { color: var(--brutal-text-muted); font-weight: 600; }
        .lg-pts { font-family: var(--font-mono-retro); font-weight: 900; font-size: 1.6rem; text-shadow: 0 0 20px currentColor; }
        .lg-form { display: inline-flex; gap: 8px; position: relative; z-index: 10; }
        .lg-fdot {
          width: 28px; height: 28px; border-radius: 8px; display: inline-grid; place-items: center;
          font-family: var(--font-display); font-size: 0.8rem; font-weight: 900; color: var(--text-primary); line-height: 1; text-shadow: 0 2px 5px color-mix(in srgb, var(--bg-base) 80%, transparent);
          box-shadow: 0 4px 10px color-mix(in srgb, var(--bg-base) 40%, transparent), inset 0 2px 4px color-mix(in srgb, var(--text-primary) 20%, transparent); border: 1px solid color-mix(in srgb, var(--text-primary) 10%, transparent); transition: transform 0.2s;
        }
        .lg-fdot:hover { transform: scale(1.15) translateY(-2px); z-index: 11; }
        @media(max-width:1100px){.lg-layout{grid-template-columns:minmax(0,1fr)}}
        @media(max-width:700px){.lg-legend{gap:12px}.lg-td,.lg-th{padding:12px 14px}.lg-hero { padding: 24px; }}
      `}</style>

      {compError && (
        <EmptyState
          title={t('gameplay:league.compError')}
          hint={compError}
          action={<Button variant="secondary" onClick={() => setCompRefresh((x) => x + 1)}>{t('gameplay:league.retry')}</Button>}
        />
      )}

      {/* Hero */}
      <div className="lg-hero">
        <div className="lg-scan" />
        <div className="lg-hero-ic"><Trophy size={32} /></div>
        <div style={{ zIndex: 1 }}>
          <p className="font-display text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded bg-[var(--gold-accent)] animate-pulse shadow-[0_0_10px_var(--gold-accent)]" />
            {t('gameplay:league.kicker')}
          </p>
          <h1 className="font-display font-black text-4xl text-[var(--text-primary)] tracking-widest uppercase leading-none">{t('gameplay:league.title')}</h1>
        </div>
      </div>

      {/* League Selector */}
      <div className="my-6">
        <LeagueDropdown
          competitions={competitions}
          selectedId={selectedCompId}
          onChange={setSelectedCompId}
          label={t('gameplay:league.kicker')}
        />
      </div>

      {/* Legend — zonas dinámicas según tier/formato */}
      <div className="lg-legend">
        {legend.map((item) => (
          <span key={item.key}>
            <span className="lg-ldot" style={{ background: item.color }} />
            {t(LEGEND_I18N[item.key])}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>{t('gameplay:league.formLegend')}</span>
      </div>

      <div className="lg-layout">
        {/* Table Container */}
        <div className="lg-panel">
          <div className="lg-panel-h">
            <Trophy size={16} style={{ color: 'var(--gold-accent)' }} />
            <div>
              <div className="lg-panel-t">{currentComp ? currentComp.name : t('gameplay:league.loading')}</div>
              <div className="lg-panel-s">{t('gameplay:league.seasonMatchday', { week: standings[0]?.played || 0 })}</div>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 14 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map(i => <Skeleton key={i} height={34} />)}
            </div>
          ) : standings.length === 0 ? (
            <div style={{ padding: 14 }}>
              <EmptyState
                icon={<Trophy size={36} />}
                title={t('gameplay:league.emptyTitle')}
                hint={t('gameplay:league.emptyHint')}
              />
            </div>
          ) : (
            <StandingsTable standings={standings} myClubId={myClubId} formByClub={formByClub} zoneMeta={zoneMeta} />
          )}
        </div>

        {/* Panel lateral de líderes */}
        <LeagueLeaders
          loading={leadersLoading}
          topScorers={leaders.topScorers}
          topAssists={leaders.topAssists}
        />
      </div>
    </div>
  );
}
