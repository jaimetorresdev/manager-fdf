import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { managerApi } from '../api/client';
import { asArray } from '../lib/normalize';
import { ClubLink } from '../components/common/EntityLink';
import { Skeleton, EmptyState, Button, ClubBadge, StatBar } from '../components/ui';
import { Award, Target, Medal, MessageSquare, Briefcase, Flag, Brain, RefreshCw } from 'lucide-react';

const API_ORIGIN =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/api\/?$/, '') ??
  (typeof location !== 'undefined' && location.origin.includes('5173') ? 'http://localhost:3001' : '');


interface ManagerProfile {
  manager: {
    id?: number;
    name: string;
    nationality?: string;
    personality?: string;
    level?: number;
    xp?: number;
    clubId?: number | null;
    club?: { id?: number; name: string; shortName?: string } | null;
  };
  prestige: number;
  contract?: {
    objective: string;
    season: string;
  } | null;
}

interface Career {
  level?: number;
  xp?: number;
  reputation?: number;
  prestige?: number;
  achievements?: { id: number; type: string; title: string; date: string }[];
  currentClub?: { name: string; shortName?: string } | null;
}

function initialsOf(name?: string) {
  if (!name) return 'M';
  const parts = name.trim().split(/\s+/);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

function fmtDate(iso?: string) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function ManagerProfilePage() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ManagerProfile | null>(null);
  const [career, setCareer] = useState<Career | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    Promise.allSettled([managerApi.getProfile(), managerApi.getCareer()])
      .then(([p, c]) => {
        if (p.status === 'fulfilled') setProfile(p.value);
        else {
          setError(t('No se pudo cargar el perfil de mánager'));
          toast.error(t('No se pudo cargar el perfil de mánager'));
        }
        if (c.status === 'fulfilled') setCareer(c.value);
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="page-surface flex flex-col gap-6">
        <Skeleton height={140} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton height={240} /><Skeleton height={240} />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-surface">
        <EmptyState
          icon={<Award size={48} />}
          title={t('Perfil no disponible')}
          hint={error ?? t('No se pudo cargar tu ficha de mánager.')}
          action={<Button variant="secondary" size="sm" onClick={load}><RefreshCw size={14} className="mr-2"/> {t('Reintentar')}</Button>}
        />
      </div>
    );
  }

  const { manager, prestige, contract } = profile;
  const achievements = asArray<NonNullable<Career['achievements']>[number]>(career?.achievements);
  const prestigePct = Math.min(100, Math.max(0, prestige));

  return (
    <div className="page-surface flex flex-col gap-6 font-sans">

      {/* Cabecera Premium Glassmorphism */}
      <div className="relative flex flex-col md:flex-row items-center md:items-start gap-8 p-8 rounded-3xl border border-white/5 overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-black/40 backdrop-blur-xl">
        <div className="absolute top-[-50px] right-[-50px] w-[300px] h-[300px] rounded-full bg-[var(--gold-accent)] opacity-[0.05] blur-[80px] pointer-events-none" />
        
        {/* Avatar */}
        <div className="z-10 w-28 h-28 rounded-3xl flex items-center justify-center text-5xl font-display font-black text-white shrink-0 border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.3)] overflow-hidden" style={{ background: manager?.club ? 'linear-gradient(135deg, var(--club-primary, var(--gold-accent)), var(--club-secondary, #b45309))' : 'linear-gradient(135deg, var(--gold-accent), #b45309)' }}>
          {!avatarFailed && manager?.id ? (
            <img src={`${API_ORIGIN}/api/public/avatar/${manager.id}`} alt={manager?.name ?? 'Avatar'} className="w-full h-full object-cover" onError={() => setAvatarFailed(true)} />
          ) : (
            initialsOf(manager?.name)
          )}
        </div>

        {/* Info */}
        <div className="z-10 flex-1 text-center md:text-left min-w-0">
          <p className="text-[10px] text-[var(--gold-accent)] uppercase tracking-widest font-black mb-2 flex items-center justify-center md:justify-start gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold-accent)] animate-pulse" />
            {t('Mi Perfil de Mánager')}
          </p>
          <h1 className="font-display font-black text-4xl md:text-5xl text-white tracking-tight leading-none mb-4 drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)] uppercase">
            {manager?.name ?? t('Mánager')}
          </h1>
          <div className="flex flex-wrap justify-center md:justify-start items-center gap-3 mt-2">
            {manager?.club ? (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.2)] backdrop-blur-md">
                <ClubBadge id={manager.club.id ?? manager.clubId} name={manager.club.name} size={18} />
                <ClubLink id={manager.club.id ?? manager.clubId ?? 0} name={manager.club.name} />
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-white/5 text-sm font-bold text-white/60">
                {t('Sin club — agente libre')}
              </span>
            )}
            {manager?.nationality && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-white/70 font-semibold">
                <Flag size={14} /> {manager.nationality}
              </span>
            )}
            {manager?.personality && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/5 text-xs text-white/70 font-semibold">
                <Brain size={14} /> {manager.personality}
              </span>
            )}
            {career?.level != null && (
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[rgba(255,215,0,0.1)] border border-[rgba(255,215,0,0.2)] text-[var(--gold-accent)] text-xs font-black uppercase tracking-wider shadow-[0_0_15px_rgba(255,215,0,0.1)]">
                {t('Nivel')} {career.level}
              </span>
            )}
          </div>
        </div>

        {/* Prestigio */}
        <div className="z-10 flex flex-col items-center md:items-end w-full md:w-56 mt-6 md:mt-0 shrink-0">
          <div className="flex items-baseline gap-1">
            <span className="font-display font-black text-6xl text-[var(--gold-accent)] drop-shadow-[0_0_25px_rgba(255,215,0,0.3)]">
              {prestige}
            </span>
            <span className="text-2xl text-white/50 font-bold">%</span>
          </div>
          <span className="text-[11px] text-white/60 uppercase tracking-[0.2em] font-black mt-2">{t('Prestigio Total')}</span>
          <div className="w-full mt-4 bg-black/40 p-3 rounded-xl border border-white/5">
            <StatBar value={prestigePct} max={100} color="amber" size="md" />
          </div>
        </div>
      </div>

      {/* Atajos */}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" size="sm" onClick={() => navigate('/messages')} className="shadow-sm">
          <MessageSquare size={14} className="mr-2" /> {t('Mensajes directos')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/career')}>
          <Briefcase size={14} className="mr-2" /> {t('Carrera y habilidades')}
        </Button>
      </div>

      {/* Cuerpo Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        
        {/* Columna Izquierda: Prestigio y Contrato */}
        <div className="flex flex-col gap-6">
          {/* Panel: Prestigio Info */}
          <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border-b border-white/5 font-display font-black text-sm uppercase tracking-widest text-white">
              <Award size={18} className="text-[var(--gold-accent)] drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" /> 
              {t('Análisis de Prestigio')}
            </div>
            <div className="p-6">
              <p className="text-sm text-white/60 leading-relaxed mb-6 font-medium">
                {t('El prestigio determina qué clubes estarán interesados en contratarte y tus opciones de dirigir una Selección Nacional. Sube cumpliendo objetivos, ganando títulos y ascendiendo.')}
              </p>
              <div className="flex items-end justify-between bg-black/50 rounded-xl p-5 border border-white/5 shadow-inner">
                <div className="flex items-baseline gap-1">
                  <span className="font-display font-black text-4xl text-[var(--gold-accent)]">{prestige}</span>
                  <span className="text-sm text-white/50 font-bold ml-1">{t('pts')}</span>
                </div>
                {career?.reputation != null && (
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-black">{t('Reputación Mundial')}</span>
                    <span className="font-sans font-black text-2xl text-white mt-1">{career.reputation}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel: Contrato */}
          <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.3)]">
            <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border-b border-white/5 font-display font-black text-sm uppercase tracking-widest text-white">
              <Target size={18} className="text-[var(--blue-info)] drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" /> 
              {t('Contrato Actual')}
            </div>
            <div className="p-6">
              {contract ? (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="flex flex-col gap-1 bg-black/30 p-3 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-white/50 font-black">{t('Temporada')}</span>
                      <span className="font-sans font-bold text-white text-lg">{contract.season}</span>
                    </div>
                    <div className="flex flex-col gap-1 bg-black/30 p-3 rounded-xl border border-white/5">
                      <span className="text-[10px] uppercase tracking-widest text-white/50 font-black">{t('Club')}</span>
                      <span className="font-sans font-bold text-white text-lg truncate">{manager?.club?.shortName ?? manager?.club?.name ?? '—'}</span>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-[rgba(59,130,246,0.15)] to-[rgba(59,130,246,0.05)] border border-[rgba(59,130,246,0.3)] rounded-xl p-5 shadow-[0_4px_15px_rgba(59,130,246,0.1)]">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--blue-info)] font-black mb-2 opacity-80">{t('Objetivo de la Directiva')}</p>
                    <p className="font-display font-black text-white text-xl uppercase tracking-tight">{contract.objective}</p>
                  </div>
                  <p className="text-[11px] text-white/50 mt-4 italic text-center font-medium">
                    {t('Cumplirlo otorga prestigio extra al cierre de temporada. Fallar puede acabar en despido.')}
                  </p>
                </>
              ) : (
                <EmptyState
                  icon={<Target size={36} className="text-white/20" />}
                  title={t('Sin contrato')}
                  hint={t('Cuando dirijas un club, la directiva fijará aquí tu objetivo.')}
                />
              )}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Palmarés */}
        <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.3)] h-full">
          <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border-b border-white/5 font-display font-black text-sm uppercase tracking-widest text-white">
            <Medal size={18} className="text-[var(--gold-accent)] drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]" /> 
            {t('Palmarés y Logros')}
          </div>
          <div className="p-0">
            {achievements.length === 0 ? (
              <div className="p-10">
                <EmptyState
                  icon={<Medal size={48} className="text-white/20" />}
                  title={t('Vitrina vacía (por ahora)')}
                  hint={t('Los títulos, ascensos y hitos de tu carrera aparecerán aquí.')}
                />
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {achievements.map(a => (
                  <div key={a.id} className="flex items-center gap-5 px-6 py-5 hover:bg-white/5 transition-colors group cursor-default">
                    <div className="w-12 h-12 rounded-2xl bg-[rgba(255,215,0,0.1)] border border-[rgba(255,215,0,0.2)] text-[var(--gold-accent)] flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(255,215,0,0.05)] group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(255,215,0,0.2)] transition-all">
                      <Medal size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display font-black text-white text-lg truncate drop-shadow-md">{a.title}</p>
                      <p className="text-[10px] text-[var(--gold-accent)] uppercase tracking-[0.2em] font-black mt-1 truncate">
                        {t(a.type)}
                      </p>
                    </div>
                    <div className="shrink-0 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 text-xs text-white/50 font-bold font-mono">
                      {fmtDate(a.date)}
                    </div>
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
