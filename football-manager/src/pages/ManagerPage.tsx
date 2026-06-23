// ─── E6 / Y8 · Ficha pública premium de mánager ──────────────────────────────
// Consume el contrato completo de GET /manager/public/:id (avatar, club, prestigio,
// estilo, nivel/etapa, récord, forma reciente con rivales, palmarés). Defensivo:
// nunca tumba la página por huecos; el avatar cae a iniciales si la imagen falla.
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { managerApi } from '../api/client';
import { ClubLink } from '../components/common/EntityLink';
import { adaptManagerProfile } from '../lib/entityViewModels';
import { ManagerRivalPanel, type ManagerRivalData } from '../components/competition/ManagerRivalPanel';
import { Skeleton, EmptyState, Button, ClubBadge, StatBar } from '../components/ui';
import { Award, Medal, MessageSquare, Flag, Brain, RefreshCw, Briefcase, Activity, Star } from 'lucide-react';
import { asArray } from '../lib/normalize';

interface ManagerClub { id: number; name: string; shortName?: string; badge?: string; country?: string; reputation?: number }
interface FormRow {
  matchId: number; result: 'W' | 'D' | 'L'; goalsFor: number; goalsAgainst: number;
  opponent?: { id: number; name: string; shortName?: string } | null;
  playedAt?: string; competition?: { id: number; name: string; shortName?: string } | null; matchdayNum?: number | null;
}
interface PublicManager {
  managerId?: number; id?: number;
  name?: string; username?: string;
  nationality?: string; personality?: string; mentality?: string;
  level?: number; reputation?: number; prestige?: number; recentPrestige?: number;
  avatarUrl?: string | null;
  club?: ManagerClub | null; clubId?: number | null;
  record?: { w: number; d: number; l: number };
  form?: FormRow[];
  styleTags?: string[];
  careerSummary?: { stage?: string; level?: number; prestige?: number; clubReputation?: number | null };
  achievements?: any[];
  dm?: { toManagerId?: number } | boolean | number;
  rivalry?: ManagerRivalData | null; // X6: rival formal (mismo contrato que formalRivalry)
}

// Origen del backend para imágenes (avatarUrl ya incluye el prefijo /api/...).
const API_ORIGIN =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/api\/?$/, '') ??
  (typeof location !== 'undefined' && location.origin.includes('5173') ? 'http://localhost:3001' : '');

const FORM_TONE: Record<string, string> = { W: 'var(--green-primary)', D: 'var(--gold-accent)', L: 'var(--red-danger)' };
const FORM_LABEL: Record<string, string> = { W: 'V', D: 'E', L: 'D' };

function legendTier(prestige: number): string {
  if (prestige >= 85) return 'Leyenda del banquillo';
  if (prestige >= 65) return 'Referente nacional';
  if (prestige >= 45) return 'Mánager consolidado';
  if (prestige >= 25) return 'Promesa en ascenso';
  return 'Técnico en formación';
}

function initialsOf(name?: string) {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function ManagerPage() {
  const { t } = useTranslation('common');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<PublicManager | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const load = () => {
    if (!id || !Number.isFinite(Number(id))) {
      setError(t('Mánager no válido'));
      setLoading(false);
      return;
    }
    setLoading(true); setError(null); setAvatarFailed(false);
    managerApi.getPublic(Number(id))
      .then(d => setData(d))
      .catch(err => {
        setError(err.message || t('No se pudo cargar la ficha del mánager'));
      })
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const css = `
    .mp-hero{position:relative;overflow:hidden;display:flex;flex-wrap:wrap;align-items:center;gap:24px;padding:40px;
      border-radius:32px;background:var(--bg-elevated);border:1px solid var(--border-color);box-shadow:var(--shadow-soft);
      backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);transition:all 0.5s cubic-bezier(0.4, 0, 0.2, 1)}
    .mp-hero::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
    .mp-hero:hover{background:var(--bg-surface);border-color:var(--border-color);box-shadow:0 30px 60px rgba(0,0,0,0.2);}
    .mp-scan{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at top right, rgba(250,204,21,0.15), transparent 70%);opacity:0.8;mix-blend-mode:screen;}
    .mp-avatar{z-index:1;width:110px;height:110px;border-radius:28px;display:grid;place-items:center;flex-shrink:0;overflow:hidden;
      font-family:var(--font-display);font-weight:800;font-size:2.8rem;color:var(--text-primary);
      background:var(--bg-surface);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      box-shadow:0 0 50px rgba(34,197,94,0.3), inset 0 0 20px var(--border-color);border:2px solid var(--border-color);
      transition:all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)}
    .mp-hero:hover .mp-avatar{transform:scale(1.1) rotate(-3deg);box-shadow:0 0 60px rgba(34,197,94,0.5), inset 0 0 30px var(--border-color);border-color:var(--border-color);}
    .mp-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .mp-name{font-family:var(--font-display);font-weight:900;font-size:3.5rem;color:var(--text-primary);line-height:1;text-transform:uppercase;letter-spacing:-1.5px;text-shadow:0 10px 30px rgba(0,0,0,0.3);margin-bottom:12px;}
    .mp-sub{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:12px;font-size:.8rem;color:var(--text-muted);
      font-family:var(--font-sans);font-weight:600}
    .mp-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:12px;
      background:var(--bg-elevated);border:1px solid var(--border-color);box-shadow:0 4px 15px rgba(0,0,0,0.1);backdrop-filter:blur(10px);transition:all 0.2s}
    .mp-chip:hover{background:var(--bg-surface);transform:translateY(-2px);border-color:var(--border-color);}
    .mp-chip-style{color:var(--text-primary);border-color:rgba(34,197,94,0.5);background:linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.05));box-shadow:0 4px 20px rgba(34,197,94,0.2);}
    .mp-prest{z-index:1;margin-left:auto;text-align:right;min-width:200px;display:flex;flex-direction:column;align-items:flex-end}
    .mp-prest-n{font-family:var(--font-display);font-weight:900;font-size:4.5rem;line-height:0.9;color:var(--gold-accent);
      text-shadow:0 0 30px rgba(250,204,21,0.6);letter-spacing:-2px;}
    .mp-prest-l{font-size:.8rem;text-transform:uppercase;letter-spacing:3px;color:var(--text-muted);
      font-family:var(--font-sans);font-weight:900;margin-top:8px}
    .mp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;align-items:start}
    .mp-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;margin:32px 0}
    .mp-stat{background:var(--bg-elevated);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      border:1px solid var(--border-color);border-radius:24px;padding:24px;text-align:center;
      box-shadow:var(--shadow-soft);transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1);position:relative;overflow:hidden;}
    .mp-stat::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
    .mp-stat:hover{background:var(--bg-surface);transform:translateY(-5px);border-color:var(--border-color);box-shadow:0 20px 50px rgba(0,0,0,0.15);}
    .mp-stat-n{font-family:var(--font-display);font-weight:900;font-size:2.8rem;line-height:1;color:var(--text-primary);text-shadow:0 5px 15px rgba(0,0,0,0.2)}
    .mp-stat-l{font-size:.7rem;text-transform:uppercase;letter-spacing:2px;color:var(--text-muted);font-weight:800;margin-top:10px}
    .mp-panel{background:var(--bg-elevated);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      border:1px solid var(--border-color);border-radius:24px;overflow:hidden;
      box-shadow:var(--shadow-soft);position:relative;transition:all 0.3s}
    .mp-panel::after{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,var(--border-color),transparent);}
    .mp-panel:hover{background:var(--bg-surface);border-color:var(--border-color);}
    .mp-panel-h{display:flex;align-items:center;gap:12px;padding:20px 24px;background:var(--row-hover);
      border-bottom:1px solid var(--border-color);font-family:var(--font-display);font-weight:900;font-size:.9rem;
      text-transform:uppercase;letter-spacing:2px;color:var(--text-primary)}
    .mp-panel-h svg{color:var(--green-primary);filter:drop-shadow(0 0 8px var(--green-primary));}
    .mp-panel-b{padding:24px}
    .mp-kv{display:flex;flex-direction:column;gap:6px}
    .mp-k{font-size:.7rem;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-muted);font-weight:800}
    .mp-v{font-family:var(--font-mono-retro);font-weight:600;font-size:1.4rem;color:var(--text-primary)}
    .mp-form-row{display:flex;align-items:center;gap:16px;padding:16px 24px;
      border-bottom:1px solid var(--border-color);transition:background 0.2s}
    .mp-form-row:hover{background:var(--row-hover)}
    .mp-form-row:last-child{border-bottom:none}
    .mp-form-pill{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;flex-shrink:0;
      font-family:var(--font-display);font-weight:900;font-size:1rem;color: var(--text-primary);
      box-shadow:inset 0 1px 1px rgba(255,255,255,0.3), 0 4px 10px rgba(0,0,0,0.2)}
    .mp-form-score{font-family:var(--font-mono-retro);font-weight:900;font-size:1.2rem;min-width:60px;text-align:center;color:var(--text-primary);text-shadow:0 2px 5px rgba(0,0,0,0.1)}
    .mp-form-meta{margin-left:auto;font-size:.75rem;color:var(--text-muted);font-family:var(--font-sans);font-weight:600;text-align:right}
    .mp-streak{display:flex;gap:8px}
    .mp-streak span{width:32px;height:32px;border-radius:10px;display:grid;place-items:center;
      font-family:var(--font-display);font-weight:900;font-size:.9rem;color: var(--text-primary);
      box-shadow:inset 0 1px 1px rgba(255,255,255,0.3), 0 4px 10px rgba(0,0,0,0.2);transition:transform 0.2s}
    .mp-streak span:hover{transform:translateY(-2px);box-shadow:inset 0 1px 1px rgba(255,255,255,0.4), 0 6px 15px rgba(0,0,0,0.3);}
    .mp-ach{display:flex;align-items:center;gap:20px;padding:20px 24px;
      border-bottom:1px solid var(--border-color);transition:background .2s}
    .mp-ach:last-child{border-bottom:none}
    .mp-ach:hover{background:var(--row-hover)}
    .mp-ach-ic{width:48px;height:48px;border-radius:16px;display:grid;place-items:center;flex-shrink:0;
      background:linear-gradient(135deg, rgba(250,204,21,0.2), rgba(250,204,21,0.05));color:var(--gold-accent);
      border:1px solid rgba(250,204,21,0.4);box-shadow:0 0 20px rgba(250,204,21,0.2), inset 0 0 10px rgba(250,204,21,0.1)}
    .mp-ach-t{font-family:var(--font-display);font-weight:900;font-size:1.2rem;color:var(--text-primary);margin-bottom:4px}
    .mp-ach-d{margin-left:auto;font-family:var(--font-mono-retro);font-weight:800;font-size:.9rem;color:var(--text-muted);flex-shrink:0}
    @media(max-width:900px){.mp-grid{grid-template-columns:minmax(0,1fr)}.mp-prest{margin-left:0;text-align:left;align-items:flex-start}.mp-stats{grid-template-columns:1fr;}}
  `;

  if (loading) {
    return (
      <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Skeleton height={120} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Skeleton height={220} /><Skeleton height={220} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-surface">
        <EmptyState
          icon={<Award size={40} />}
          title={t('Mánager no disponible')}
          hint={error ?? t('No se pudo cargar la ficha del mánager.')}
          action={<Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} /> {t('Reintentar')}</Button>}
        />
      </div>
    );
  }

  const manager = data;
  const managerId = data.managerId ?? data.id ?? Number(id);
  // A2 · capa adaptadora defensiva (lib/entityViewModels): normaliza carrera y
  // estilo del mánager. Aditivo: solo se usa como último fallback de prestigio/
  // nivel/etapa → mismo render premium, datos más robustos ante huecos.
  const vm = adaptManagerProfile(data);
  const achievements = asArray<any>(data.achievements);
  const form = asArray<FormRow>(data.form);
  const styleTags = asArray<string>(data.styleTags);
  // Aditivo: vm.prestige solo entra si faltan los campos directos (su default es
  // 0, idéntico al fallback previo). `stage`/`level` NO usan vm: sus defaults no
  // nulos ('promesa'/0) cambiarían el render cuando el dato falta.
  const prestige = Number(data.prestige ?? data.recentPrestige ?? vm.prestige ?? 0);
  const prestigePct = Math.min(100, Math.max(0, prestige));
  const stage = data.careerSummary?.stage;
  const level = data.level ?? data.careerSummary?.level;
  const reputation = data.reputation;
  const streak = form.slice(0, 5);
  // Always use the dynamic endpoint for avatars if possible
  const avatarSrc = !avatarFailed ? `${API_ORIGIN}/api/public/avatar/${managerId}` : null;
  const canMessage = typeof data.dm === 'object' ? Boolean(data.dm?.toManagerId) : Boolean(data.dm);

  return (
    <div className="page-surface" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{css}</style>

      {/* Cabecera */}
      <div className="mp-hero">
        <div className="mp-scan" />
        <div className="mp-avatar">
          {avatarSrc
            ? <img src={avatarSrc} alt={manager.name ?? t('Mánager')} onError={() => setAvatarFailed(true)} />
            : initialsOf(manager.name)}
        </div>
        <div style={{ zIndex: 1, minWidth: 0, flex: 1 }}>
          <p className="text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold-accent)] animate-pulse" />
            {t('Perfil de Mánager')}
          </p>
          <h1 className="mp-name">{manager.name ?? manager.username ?? t('Mánager')}</h1>
          <div className="mp-sub">
            {manager.club ? (
              <span className="mp-chip">
                <ClubBadge id={manager.club.id ?? manager.clubId} name={manager.club.name} size={14} />
                <ClubLink id={manager.club.id ?? manager.clubId ?? 0} name={manager.club.name} />
              </span>
            ) : (
              <span className="mp-chip">{t('Sin club — agente libre')}</span>
            )}
            {stage && <span className="mp-chip mp-chip-style"><Star size={11} /> {stage}</span>}
            {manager.nationality && <span className="mp-chip"><Flag size={11} /> {manager.nationality}</span>}
            {styleTags.length > 0
              ? styleTags.slice(0, 3).map((tag, i) => <span key={i} className="mp-chip"><Brain size={11} /> {tag}</span>)
              : manager.personality && <span className="mp-chip"><Brain size={11} /> {manager.personality}</span>}
          </div>
          <p style={{ marginTop: 14, fontSize: '.85rem', lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 520 }}>
            {manager.name ?? t('Este mánager')} {t('acumula un récord de')} <strong style={{ color: 'var(--text-primary)' }}>{data.record ? `${data.record.w}V-${data.record.d}E-${data.record.l}D` : '0-0-0'}</strong>
            {stage ? <> {t('en etapa')} <strong style={{ color: 'var(--green-primary)' }}>{stage}</strong></> : null}.
            {manager.mentality ? ` ${t('Estilo')}: ${manager.mentality}.` : ''}
          </p>
        </div>
        <div className="mp-prest">
          <div className="mp-prest-n">{prestige.toFixed(1)}<span style={{ fontSize: '1.3rem', color: 'var(--text-muted)' }}>%</span></div>
          <div className="mp-prest-l">{t(legendTier(prestigePct))}</div>
          <div style={{ marginTop: 8 }}>
            <StatBar value={prestigePct} max={100} color="amber" size="md" />
          </div>
        </div>
      </div>

      {data.rivalry?.rival?.id && <ManagerRivalPanel data={data.rivalry} />}

      {/* Stats rápidas: nivel, reputación, racha */}
      <div className="mp-stats">
        <div className="mp-stat">
          <div className="mp-stat-n" style={{ color: 'var(--green-primary)' }}>{level ?? '—'}</div>
          <div className="mp-stat-l">{t('Nivel Global')}</div>
        </div>
        <div className="mp-stat">
          <div className="mp-stat-n" style={{ color: 'rgba(255,255,255,0.9)' }}>{reputation ?? '—'}</div>
          <div className="mp-stat-l">{t('Reputación')}</div>
        </div>
        <div className="mp-stat">
          <div className="mp-stat-n" style={{ color: 'var(--gold-accent)' }}>
            {data.record ? `${data.record.w}-${data.record.d}-${data.record.l}` : '0-0-0'}
          </div>
          <div className="mp-stat-l">{t('V-E-D')}</div>
        </div>
      </div>

      {/* Acciones */}
      {canMessage && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/messages?to=${managerId}`)}>
            <MessageSquare size={14} /> {t('Enviar mensaje')}
          </Button>
        </div>
      )}

      <div className="mp-grid">
        {/* Forma reciente */}
        <div className="mp-panel">
          <div className="mp-panel-h">
            <Activity size={13} /> {t('Forma reciente')}
            {streak.length > 0 && (
              <span className="mp-streak" style={{ marginLeft: 'auto' }}>
                {streak.map((r, i) => (
                  <span key={i} style={{ background: FORM_TONE[r.result] ?? 'var(--bg-elevated)' }}>{FORM_LABEL[r.result] ?? r.result}</span>
                ))}
              </span>
            )}
          </div>
          {form.length === 0 ? (
            <div style={{ padding: 14 }}>
              <EmptyState icon={<Activity size={32} />} title={t('Sin partidos recientes')} hint={t('Aún no dirige partidos con resultado.')} />
            </div>
          ) : (
            <div>
              {form.map((r, i) => (
                <div key={r.matchId ?? i} className="mp-form-row">
                  <span className="mp-form-pill" style={{ background: FORM_TONE[r.result] ?? 'var(--bg-elevated)' }}>{FORM_LABEL[r.result] ?? r.result}</span>
                  <span className="mp-form-score" style={{ color: FORM_TONE[r.result] }}>{r.goalsFor}-{r.goalsAgainst}</span>
                  <span style={{ fontSize: '.85rem', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '.7rem' }}>{t('vs')}</span>
                    {r.opponent ? (
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                        <ClubLink id={r.opponent.id} name={r.opponent.shortName ?? r.opponent.name} />
                      </span>
                    ) : '—'}
                  </span>
                  <span className="mp-form-meta">
                    {r.competition?.shortName ?? r.competition?.name ?? ''}
                    {r.matchdayNum ? ` · J${r.matchdayNum}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Récord en los banquillos */}
          <div className="mp-panel">
            <div className="mp-panel-h"><Briefcase size={13} /> {t('Récord en los banquillos')}</div>
            <div className="mp-panel-b">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                <div className="mp-kv">
                  <span className="mp-k">{t('Victorias')}</span>
                  <span className="mp-v" style={{ color: 'var(--green-primary)', fontSize: '1.4rem' }}>{data.record?.w ?? 0}</span>
                </div>
                <div className="mp-kv">
                  <span className="mp-k">{t('Empates')}</span>
                  <span className="mp-v" style={{ color: 'var(--gold-accent)', fontSize: '1.4rem' }}>{data.record?.d ?? 0}</span>
                </div>
                <div className="mp-kv">
                  <span className="mp-k">{t('Derrotas')}</span>
                  <span className="mp-v" style={{ color: 'var(--red-danger)', fontSize: '1.4rem' }}>{data.record?.l ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Palmarés */}
          <div className="mp-panel">
            <div className="mp-panel-h"><Medal size={13} /> {t('Salón de la fama')}</div>
            {achievements.length === 0 ? (
              <div style={{ padding: 14 }}>
                <EmptyState icon={<Medal size={32} />} title={t('Sin títulos aún')} hint={t('El mánager no ha conseguido palmarés.')} />
              </div>
            ) : (
              <div>
                {achievements.map((a: any, i: number) => (
                  <div key={a.id ?? i} className="mp-ach">
                    <div className="mp-ach-ic"><Medal size={14} /></div>
                    <div style={{ minWidth: 0 }}>
                      <p className="mp-ach-t">{a.title ?? a.name ?? a.description ?? String(a)}</p>
                      {a.type && (
                        <p style={{ fontSize: '.66rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono-retro)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          {a.type}{a.points ? ` · +${a.points} ${t('prestigio')}` : ''}
                        </p>
                      )}
                    </div>
                    {(a.date || a.season) && <span className="mp-ach-d">{a.season ?? (a.date ? new Date(a.date).getFullYear() : '')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
