// ─── CareerPage — Perfil y carrera del mánager (Etapa 9 / issue 4.4) ──────────
// Nivel + XP, prestigio FDF, reputación, árbol de habilidades RPG (3 ramas),
// objetivo de la junta y vitrina de logros. Lee GET /api/manager/career y
// /api/manager/profile; desbloquea con POST /api/manager/skills/unlock {nodeId}.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Trophy, Briefcase, Lock, Check } from 'lucide-react';
import { managerApi, prestigeApi } from '../api/client';
import { KPICard, Skeleton, Button, EmptyState } from '../components/ui';
import { ClubLink, ManagerLink } from '../components/common/EntityLink';

interface Career {
  level: number; xp: number; reputation?: string | number; prestige: number;
  skills: string[]; achievements: any[];
  currentClub?: { name?: string; shortName?: string; badge?: string } | null;
}

// Árbol de habilidades — nodeId es contrato con el backend.
const SKILL_BRANCHES: { id: 'motivator' | 'tactician' | 'financier'; icon: string; nodes: string[] }[] = [
  { id: 'motivator', icon: '🔥', nodes: ['mot_1', 'mot_2', 'mot_3'] },
  { id: 'tactician', icon: '🧠', nodes: ['tac_1', 'tac_2', 'tac_3'] },
  { id: 'financier', icon: '💰', nodes: ['fin_1', 'fin_2', 'fin_3'] },
];

const xpForLevel = (level: number) => level * 100;   // contrato simple; el back manda

export function CareerPage() {
  const { t } = useTranslation();
  const [career, setCareer] = useState<Career | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Prestigio 2.0 (E12, API_UI §PrestigioManager)
  const [prestige, setPrestige] = useState<any | null>(null);
  const [ranking, setRanking] = useState<any[]>([]);

  const load = async () => {
    setLoading(true); setError(null);
    const [c, p, pr, rk] = await Promise.allSettled([
      managerApi.getCareer(), managerApi.getProfile(), prestigeApi.get(), prestigeApi.ranking(10),
    ]);
    if (c.status === 'fulfilled') setCareer(c.value);
    else setError(t('gameplay:career.loadError'));
    if (p.status === 'fulfilled') setProfile(p.value);
    if (pr.status === 'fulfilled') setPrestige(pr.value);
    if (rk.status === 'fulfilled' && Array.isArray(rk.value)) setRanking(rk.value);
    setLoading(false);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const unlock = async (nodeId: string) => {
    setBusy(nodeId);
    try { await managerApi.unlockSkill(nodeId); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t('gameplay:career.unlockError')); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="page-surface" style={{ display: 'grid', gap: 12 }}><Skeleton height={90} /><Skeleton height={260} /><Skeleton height={160} /></div>;
  if (error || !career) return (
    <div className="page-surface section-panel p-6">
      <EmptyState
        title={t('gameplay:career.loadError')}
        hint={error ?? t('gameplay:career.unavailable')}
        action={<Button variant="secondary" onClick={() => void load()}>{t('gameplay:career.retry')}</Button>}
      />
    </div>
  );

  const unlocked = new Set(career.skills ?? []);
  const points = Math.max(0, (career.level ?? 1) - 1 - unlocked.size);
  const xpNext = xpForLevel(career.level ?? 1);
  const xpPct = Math.min(100, Math.round(((career.xp ?? 0) / Math.max(1, xpNext)) * 100));

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="muted-label">{t('gameplay:career.kicker')}</p>
        <h1 className="section-title text-3xl">{t('gameplay:career.title')}</h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <KPICard label={t('gameplay:career.kpis.level')} value={String(career.level ?? 1)} tone="green" hint={`${career.xp ?? 0}/${xpNext} XP`} />
        <KPICard label={t('gameplay:career.kpis.prestige')} value={`${prestige?.value ?? career.prestige ?? 0}%`} tone="gold" hint={t('gameplay:career.kpis.prestigeHint')} />
        <KPICard label={t('gameplay:career.kpis.reputation')} value={String(career.reputation ?? '—')} tone="blue" />
        <KPICard label={t('gameplay:career.kpis.skillPoints')} value={String(points)} tone={points > 0 ? 'green' : 'neutral'} />
      </div>

      {/* Barra XP */}
      <div className="section-panel" style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{t('gameplay:career.xpProgress', { level: Number(career.level ?? 1) + 1 })}</span>
          <span style={{ fontSize: '.72rem', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-primary)' }}>{xpPct}%</span>
        </div>
        <div style={{ height: 8, background: 'var(--bg-base)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${xpPct}%`, height: '100%', background: 'var(--green-primary)' }} />
        </div>
      </div>

      {/* E12 · Prestigio 2.0: desglose por bloques + ranking de mánagers */}
      {prestige?.breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }} className="prest-grid">
          <style>{`
            .prest-row{display:flex;align-items:center;gap:10px;margin:7px 0;font-size:.8rem}
            .prest-row span:first-child{width:110px;color:var(--text-muted);text-transform:uppercase;font-size:.66rem;letter-spacing:1px}
            .prest-bar{flex:1;height:8px;border-radius:4px;background:var(--bg-base);overflow:hidden}
            .prest-fill{height:100%;background:var(--gold-accent)}
            .prest-row em{font-style:normal;font-family:var(--font-mono-retro);font-size:.74rem;width:52px;text-align:right}
            .prest-it{display:flex;justify-content:space-between;gap:8px;font-size:.76rem;padding:4px 0;border-top:1px solid color-mix(in srgb,var(--border-color) 50%,transparent)}
            .prest-rk{width:100%;border-collapse:collapse;font-size:.8rem}
            .prest-rk td{padding:5px 6px;border-top:1px solid color-mix(in srgb,var(--border-color) 50%,transparent)}
            .prest-rk tr.me td{background:color-mix(in srgb,var(--gold-accent) 10%,transparent)}
            @media(max-width:760px){.prest-grid{grid-template-columns:1fr!important}}
          `}</style>
          <div className="section-panel" style={{ padding: 14 }}>
            <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>
              ⭐ {t('gameplay:career.prestigeTitle')} · <b style={{ color: 'var(--gold-accent)', fontSize: '.9rem' }}>{prestige.value}%</b> {t('gameplay:career.prestigeOf', { max: prestige.max ?? 100 })}
            </p>
            {([
              [t('gameplay:career.breakdown.achievements'), prestige.breakdown.achievements],
              [t('gameplay:career.breakdown.experience'), prestige.breakdown.experience],
              [t('gameplay:career.breakdown.wealth'), prestige.breakdown.wealth],
              [t('gameplay:career.breakdown.objective'), prestige.breakdown.objective],
            ] as [string, any][]).map(([label, b]) => b && (
              <div key={label} className="prest-row">
                <span>{label}</span>
                <div className="prest-bar"><div className="prest-fill" style={{ width: `${Math.min(100, (b.score / Math.max(1, b.cap)) * 100)}%` }} /></div>
                <em>{b.score}/{b.cap}</em>
              </div>
            ))}
            {(prestige.breakdown.achievements?.items ?? []).slice(0, 5).map((it: any) => (
              <div key={it.id} className="prest-it">
                <span>🏆 {it.title}</span>
                <b style={{ fontFamily: 'var(--font-mono-retro)', color: 'var(--green-primary)' }}>+{it.points}</b>
              </div>
            ))}
          </div>
          <div className="section-panel" style={{ padding: 14 }}>
            <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 8 }}>🏅 {t('gameplay:career.rankingTitle')}</p>
            <table className="prest-rk">
              <tbody>
                {ranking.map((r: any) => (
                  <tr key={r.managerId} className={r.managerId === prestige.managerId ? 'me' : undefined}>
                    <td style={{ fontFamily: 'var(--font-mono-retro)', fontWeight: 700, width: 28 }}>{r.rank}</td>
                    <td><b><ManagerLink id={r.managerId} name={r.username ?? r.name} /></b></td>
                    <td style={{ color: 'var(--text-muted)' }}>{r.club ? <ClubLink id={r.club.id} name={r.club.shortName ?? r.club.name} /> : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono-retro)', color: 'var(--gold-accent)', fontWeight: 700 }}>{r.prestige}%</td>
                  </tr>
                ))}
                {ranking.length === 0 && <tr><td style={{ color: 'var(--text-muted)', padding: 10 }}>{t('gameplay:career.rankingEmpty')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Junta + club */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="section-panel" style={{ padding: 14 }}>
          <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}><Briefcase size={11} style={{ display: 'inline' }} /> {t('gameplay:career.benchTitle')}</p>
          <p style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{career.currentClub?.name ?? t('gameplay:career.noClub')}</p>
          {profile?.contract?.objective && (
            <p style={{ fontSize: '.78rem', color: 'var(--gold-accent)', marginTop: 4 }}>🎯 {t('gameplay:career.boardObjective', { objective: profile.contract.objective })}</p>
          )}
          <Link to="/vacancies" style={{ fontSize: '.72rem', color: 'var(--blue-info)' }}>{t('gameplay:career.vacanciesLink')}</Link>
        </div>
        <div className="section-panel" style={{ padding: 14 }}>
          <p style={{ fontSize: '.66rem', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}><Trophy size={11} style={{ display: 'inline' }} /> {t('gameplay:career.achievementsTitle', { count: career.achievements?.length ?? 0 })}</p>
          {(career.achievements ?? []).slice(0, 4).map((a: any, i: number) => (
            <p key={i} style={{ fontSize: '.78rem', color: 'var(--text-primary)' }}>🏆 {a.title ?? a.name ?? a.type} <span style={{ color: 'var(--text-muted)', fontSize: '.68rem' }}>{a.date ? new Date(a.date).toLocaleDateString() : ''}</span></p>
          ))}
          {(career.achievements ?? []).length === 0 && <p style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{t('gameplay:career.achievementsEmpty')}</p>}
        </div>
      </div>

      {/* Árbol de habilidades */}
      <div>
        <div className="mk-pt" style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, margin: '4px 0' }}>
          {t('gameplay:career.skillTreeTitle')} {points > 0 && <span style={{ color: 'var(--green-primary)' }}>{t('gameplay:career.pointsAvailable', { count: points })}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          {SKILL_BRANCHES.map(branch => (
            <div key={branch.id} className="section-panel" style={{ padding: 14 }}>
              <p style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: 2 }}>{branch.icon} {t(`gameplay:career.skills.${branch.id}.branch`)}</p>
              <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginBottom: 10 }}>{t(`gameplay:career.skills.${branch.id}.desc`)}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {branch.nodes.map((nodeId, i) => {
                  const isUnlocked = unlocked.has(nodeId);
                  const prevOk = i === 0 || unlocked.has(branch.nodes[i - 1]);
                  const canUnlock = !isUnlocked && prevOk && points > 0;
                  return (
                    <div key={nodeId} style={{
                      background: isUnlocked ? 'color-mix(in srgb, var(--green-primary) 8%, var(--bg-elevated))' : 'var(--bg-elevated)',
                      border: `1px solid ${isUnlocked ? 'color-mix(in srgb, var(--green-primary) 40%, transparent)' : 'var(--border-color)'}`,
                      borderRadius: 8, padding: '8px 10px', opacity: !isUnlocked && !prevOk ? 0.55 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {isUnlocked ? <Check size={12} style={{ display: 'inline', color: 'var(--green-primary)' }} /> : <Lock size={11} style={{ display: 'inline', color: 'var(--text-muted)' }} />} {t(`gameplay:career.skills.${branch.id}.${nodeId}.label`)}
                        </span>
                        {canUnlock && (
                          <Button size="sm" onClick={() => unlock(nodeId)} disabled={busy === nodeId}>
                            {busy === nodeId ? t('gameplay:career.unlocking') : t('gameplay:career.unlock')}
                          </Button>
                        )}
                      </div>
                      <p style={{ fontSize: '.68rem', color: 'var(--text-muted)', marginTop: 2 }}>{t(`gameplay:career.skills.${branch.id}.${nodeId}.effect`)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* NECESITO: que el backend aplique los efectos de cada nodeId (mot_1..3, tac_1..3,
            fin_1..3) en discursos/subs/jugadas/negociación/derechos — hoy solo persiste el desbloqueo. */}
      </div>
    </div>
  );
}
