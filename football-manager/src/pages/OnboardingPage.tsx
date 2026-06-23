import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { onboardingApi, setToken, type FreeClub } from '../api/client';
import { useSession } from '../stores/sessionStore';
import { Skeleton, EmptyState, Button, Modal } from '../components/ui';
import { ChevronLeft, ChevronRight, Shield, UserRound, Loader2, Target, CheckCircle2, Circle, ListChecks, Info } from 'lucide-react';
import { cn } from '../lib/cn';

const PERSONALITIES = ['Equilibrado', 'Ofensivo', 'Defensivo', 'Motivador', 'Táctico'];

export function OnboardingPage() {
  const { t } = useTranslation('common');
  const navigate     = useNavigate();
  const { user, setClubId } = useSession();

  const [clubs,    setClubs]    = useState<FreeClub[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [choosing, setChoosing] = useState<number | null>(null);
  const [nationality, setNationality] = useState('España');
  const [personality, setPersonality] = useState('Equilibrado');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [guide, setGuide] = useState<any | null>(null);
  const [confirmingClub, setConfirmingClub] = useState<FreeClub | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.manager?.clubId != null) {
      navigate('/', { replace: true });
      return;
    }

    let cancelled = false;
    onboardingApi.freeClubs()
      .then(({ clubs }) => { if (!cancelled) setClubs(clubs); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando clubes'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [user, navigate]);

  async function pick() {
    if (!confirmingClub) return;
    const clubId = confirmingClub.id;
    setConfirmingClub(null);
    setError(null);
    setChoosing(clubId);
    try {
      const { token } = await onboardingApi.chooseClub(clubId, nationality, personality);
      setToken(token);
      const syncClub = setClubId(clubId).catch(() => undefined);
      try {
        const g = await onboardingApi.guide();
        await syncClub;
        setGuide(g);
        setStep(3);
      } catch {
        await syncClub;
        navigate('/', { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo elegir el club');
    } finally {
      setChoosing(null);
    }
  }



  return (
    <div className="min-h-screen bg-black text-white font-sans relative overflow-x-hidden flex flex-col pt-12 pb-24 px-4 sm:px-6">
      
      {/* Fondo Inmersivo FIFA/FM */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-[var(--green-primary)] rounded-full mix-blend-screen filter blur-[200px] opacity-[0.15] animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-[var(--gold-accent)] rounded-full mix-blend-screen filter blur-[200px] opacity-[0.1]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black"></div>
      </div>

      <div className="max-w-5xl w-full mx-auto relative z-10 flex flex-col gap-10">
        
        {/* Cabecera / Progreso */}
        <div className="text-center select-none flex flex-col items-center">
          <h1 className="font-display font-black text-5xl sm:text-7xl uppercase tracking-widest text-white mb-3 drop-shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
            {t('Mánager')} <span className="text-[var(--green-primary)] drop-shadow-[0_0_20px_rgba(0,255,100,0.4)]">{t('FDF')}</span>
          </h1>
          <p className="text-xs font-black text-[var(--gold-accent)] uppercase tracking-[0.3em] flex items-center gap-2 drop-shadow-md">
            <Target size={14} className="text-[var(--gold-accent)]" /> 
            {t('Proceso de Alta y Asignación de Club')}
          </p>

          <div className="flex items-center justify-center gap-2 sm:gap-4 mt-10 mb-4">
            <div className={cn("flex items-center gap-3 font-display font-black text-sm uppercase tracking-[0.2em] transition-colors duration-500", step === 1 ? "text-[var(--green-primary)] drop-shadow-[0_0_10px_rgba(0,255,100,0.3)]" : "text-white/40")}>
              <span className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500", step === 1 ? "border-[var(--green-primary)] bg-[rgba(0,255,100,0.1)] shadow-[0_0_20px_rgba(0,255,100,0.4)]" : "border-[var(--green-primary)] bg-[var(--green-primary)] text-black shadow-[0_0_15px_rgba(0,255,100,0.3)]")}>
                {step > 1 ? '✓' : '1'}
              </span>
              <span className="hidden sm:inline">{t('Identidad Federativa')}</span>
              <span className="sm:hidden">{t('Identidad')}</span>
            </div>
            <div className="w-16 h-[2px] bg-white/10 relative overflow-hidden rounded-full shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--green-primary)] to-[var(--gold-accent)] transition-all duration-700 ease-out" style={{ width: step >= 2 ? '100%' : '0%' }} />
            </div>
            <div className={cn("flex items-center gap-3 font-display font-black text-sm uppercase tracking-[0.2em] transition-colors duration-500", step === 2 ? "text-[var(--gold-accent)] drop-shadow-[0_0_10px_rgba(255,215,0,0.3)]" : "text-white/40")}>
              <span className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500", step === 2 ? "border-[var(--gold-accent)] bg-[rgba(255,215,0,0.1)] shadow-[0_0_20px_rgba(255,215,0,0.4)] text-[var(--gold-accent)]" : step > 2 ? "border-[var(--green-primary)] bg-[var(--green-primary)] text-black" : "border-white/10 bg-black/40")}>
                {step > 2 ? '✓' : '2'}
              </span>
              <span className="hidden sm:inline">{t('Selección de Club')}</span>
              <span className="sm:hidden">{t('Tu Club')}</span>
            </div>
            <div className="w-16 h-[2px] bg-white/10 relative overflow-hidden rounded-full shadow-inner">
              <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-[var(--gold-accent)] to-[var(--green-primary)] transition-all duration-700 ease-out" style={{ width: step >= 3 ? '100%' : '0%' }} />
            </div>
            <div className={cn("flex items-center gap-3 font-display font-black text-sm uppercase tracking-[0.2em] transition-colors duration-500", step === 3 ? "text-[var(--green-primary)] drop-shadow-[0_0_10px_rgba(0,255,100,0.3)]" : "text-white/40")}>
              <span className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all duration-500", step === 3 ? "border-[var(--green-primary)] bg-[rgba(0,255,100,0.1)] shadow-[0_0_20px_rgba(0,255,100,0.4)]" : "border-white/10 bg-black/40")}>
                3
              </span>
              <span className="hidden sm:inline">{t('Primer día')}</span>
              <span className="sm:hidden">{t('Inicio')}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto w-full max-w-md rounded-xl px-5 py-4 text-sm font-semibold flex items-center gap-3 bg-[color-mix(in_srgb,var(--red-danger)_12%,transparent)] border border-[var(--red-danger)] text-[var(--red-danger)] shadow-sm">
            <span className="w-6 h-6 rounded-full bg-[var(--red-danger)] text-white flex items-center justify-center shrink-0">!</span>
            {error}
          </div>
        )}

        {/* ── PASO 1 · Identidad RPG ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="mx-auto w-full max-w-lg bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.6)] overflow-hidden transform transition-all animate-in zoom-in-95 duration-500">
            <div className="flex items-center gap-3 px-8 py-5 bg-gradient-to-r from-black/80 to-black/40 border-b border-white/10">
              <UserRound size={20} className="text-[var(--green-primary)] drop-shadow-[0_0_8px_rgba(0,255,100,0.5)]" />
              <span className="font-display font-black text-sm uppercase tracking-[0.2em] text-white">{t('Perfil de Entrenador')}</span>
            </div>
            <div className="p-8 flex flex-col gap-10">
              
              <label className="flex flex-col gap-3">
                <span className="text-[11px] font-black uppercase tracking-widest text-[var(--gold-accent)] drop-shadow-sm">{t('Nacionalidad')}</span>
                <input
                  type="text"
                  className="w-full bg-black/50 border border-white/10 rounded-xl px-5 py-4 font-sans text-lg font-bold text-white focus:outline-none focus:border-[var(--gold-accent)] focus:ring-2 focus:ring-[rgba(255,215,0,0.2)] transition-all shadow-inner"
                  value={nationality}
                  onChange={e => setNationality(e.target.value)}
                  placeholder="Ej: España"
                />
              </label>

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-black uppercase tracking-widest text-[var(--gold-accent)] drop-shadow-sm">{t('Atributo Especial (Clase)')}</span>
                  <span className="text-[11px] text-white/50 italic font-medium">{t('Define tu estilo de gestión y trato con el vestuario. Inmutable.')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {PERSONALITIES.map(p => (
                    <button
                      key={p}
                      type="button"
                      className={cn(
                        "px-4 py-4 rounded-2xl border-2 text-xs font-black uppercase tracking-widest transition-all duration-300",
                        personality === p 
                          ? "bg-[rgba(255,215,0,0.1)] border-[var(--gold-accent)] text-[var(--gold-accent)] shadow-[0_0_20px_rgba(255,215,0,0.15)] scale-[1.02]" 
                          : "bg-black/30 border-white/5 text-white/50 hover:border-white/20 hover:text-white hover:bg-white/5"
                      )}
                      onClick={() => setPersonality(p)}
                    >
                      {t(p)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full h-14 text-sm uppercase tracking-[0.2em] font-black shadow-[0_0_30px_rgba(0,255,100,0.2)] hover:shadow-[0_0_40px_rgba(0,255,100,0.4)] rounded-xl"
                  disabled={!nationality.trim()}
                  onClick={() => setStep(2)}
                >
                  {t('Confirmar Identidad')} <ChevronRight size={20} className="ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 2 · Elegir club (Cartas 3D) ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-white/50 hover:text-[var(--gold-accent)] transition-colors"
              >
                <ChevronLeft size={16} /> {t('Volver a Clase')}
              </button>
              <div className="flex items-center gap-3 text-xs text-[var(--gold-accent)] font-black uppercase tracking-widest drop-shadow-md">
                <span className="w-2.5 h-2.5 rounded-full bg-[var(--gold-accent)] shadow-[0_0_10px_var(--gold-accent)] animate-pulse" />
                {t('Explorando banquillos vacantes')}
              </div>
            </div>

            {/* Y12 · Explicación de prestigio y clubes bloqueados */}
            <div className="flex items-start gap-4 bg-gradient-to-r from-[rgba(59,130,246,0.15)] to-transparent border border-[rgba(59,130,246,0.3)] rounded-2xl px-6 py-5 text-sm text-white/70 shadow-[0_10px_30px_rgba(0,0,0,0.3)] backdrop-blur-md">
              <Info size={24} className="text-[var(--blue-info)] shrink-0 mt-0.5 drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
              <p className="leading-relaxed font-medium">
                {t('Como mánager novato empiezas con')} <b className="text-white font-black drop-shadow-sm">{t('prestigio bajo')}</b>{t(': solo puedes firmar por clubes')}
                {t(' modestos sin entrenador. Los grandes equipos están ')}<b className="text-[var(--red-danger)] font-black drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]">{t('bloqueados')}</b>{t(' hasta que ganes')}
                {t(' prestigio con buenos resultados. Elige bien: ')}<b className="text-[var(--gold-accent)] font-black">{t('un club por persona')}</b>{t(' y el cambio de banquillo no es inmediato.')}
              </p>
            </div>

            {loading ? (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} height={320} className="rounded-3xl border border-white/5 bg-white/5" />)}
              </div>
            ) : clubs.length === 0 && !error ? (
              <div className="py-16">
                <EmptyState
                  icon={<Shield size={64} className="text-white/10" />}
                  title={t('No hay vacantes disponibles')}
                  hint={t('Todos los clubes tienen mánager actualmente. Vuelve más tarde cuando haya un despido.')}
                />
              </div>
            ) : (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {clubs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setConfirmingClub(c)}
                    disabled={choosing != null}
                    className="group relative flex flex-col bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 text-left transition-all duration-500 hover:border-[var(--green-primary)] hover:shadow-[0_20px_50px_rgba(0,255,100,0.15)] hover:-translate-y-2 disabled:opacity-50 disabled:hover:transform-none overflow-hidden"
                  >
                    {/* Club Background Glow */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--green-primary)] opacity-[0.05] filter blur-3xl rounded-full group-hover:opacity-20 transition-opacity duration-500 pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center mb-6 text-center">
                      <div className="w-24 h-24 rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-4xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] shrink-0 group-hover:scale-110 group-hover:border-[var(--green-primary)] group-hover:shadow-[0_0_30px_rgba(0,255,100,0.2)] transition-all duration-500 mb-4">
                        {c.badge}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-display font-black text-2xl text-white truncate drop-shadow-md">{c.name}</p>
                        <p className="text-xs text-[var(--gold-accent)] font-black uppercase tracking-[0.2em] truncate mt-1">
                          {c.city} · {c.country}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-3 bg-white/5 rounded-2xl border border-white/10 mb-5 relative z-10">
                      <div className="flex flex-col items-center text-center p-2 bg-black/30 rounded-xl">
                        <span className="text-[8px] uppercase tracking-widest text-white/50 font-black mb-1">{t('Prestigio')}</span>
                        <span className="font-display font-black text-lg text-white">{c.reputation}</span>
                      </div>
                      <div className="flex flex-col items-center text-center p-2 bg-black/30 rounded-xl">
                        <span className="text-[8px] uppercase tracking-widest text-white/50 font-black mb-1">{t('Afición')}</span>
                        <span className="font-display font-black text-lg text-white">{(c.fans/1000).toFixed(0)}{t('k')}</span>
                      </div>
                      <div className="flex flex-col items-center text-center p-2 bg-black/30 rounded-xl">
                        <span className="text-[8px] uppercase tracking-widest text-white/50 font-black mb-1">{t('Aforo')}</span>
                        <span className="font-display font-black text-lg text-white">{(c.stadiumCapacity/1000).toFixed(1)}{t('k')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-5 border-t border-white/10 mt-auto relative z-10">
                      <div className="flex flex-col">
                        <span className="text-[9px] uppercase tracking-widest text-white/40 font-black mb-0.5">{t('Presupuesto Inicial')}</span>
                        <span className="font-sans font-black text-xl text-[var(--gold-accent)] drop-shadow-[0_0_8px_rgba(255,215,0,0.3)]">{(c.budget / 1_000_000).toFixed(1)}{t('M €')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[var(--green-primary)] group-hover:bg-[color-mix(in_srgb,var(--green-primary)_10%,transparent)] px-3 py-1.5 rounded-lg transition-colors">
                        {choosing === c.id ? (
                          <><Loader2 size={14} className="animate-spin" /> {t('Asignando')}</>
                        ) : (
                          <>{t('Firmar')} <ChevronRight size={14} /></>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PASO 3 · Bienvenida + checklist de primer turno (Y12) ───────── */}
        {step === 3 && (
          <div className="mx-auto w-full max-w-lg flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="bg-black/40 backdrop-blur-2xl border border-[var(--green-primary)] rounded-3xl shadow-[0_20px_50px_rgba(0,255,100,0.1)] overflow-hidden relative">
              <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--green-primary)] opacity-10 filter blur-[80px] pointer-events-none" />
              
              <div className="px-8 py-8 bg-gradient-to-b from-black/80 to-transparent border-b border-white/5 text-center relative z-10">
                <div className="w-24 h-24 mx-auto rounded-full bg-black/50 border border-white/10 flex items-center justify-center text-5xl mb-4 shadow-[0_0_30px_rgba(0,255,100,0.2)]">
                  {guide?.manager?.club?.badge ?? '🏟️'}
                </div>
                <h2 className="font-display font-black text-3xl uppercase tracking-tight text-white drop-shadow-md">
                  {t('¡Bienvenido a')} <span className="text-[var(--green-primary)]">{guide?.manager?.club?.name ?? 'tu club'}</span>!
                </h2>
                <p className="text-xs text-[var(--gold-accent)] font-black uppercase tracking-[0.2em] mt-2">{t('Tu aventura como mánager FDF empieza aquí.')}</p>
              </div>

              <div className="p-8 flex flex-col gap-6 relative z-10">
                <div className="rounded-2xl border border-[var(--gold-accent)]/40 bg-[rgba(255,215,0,0.07)] p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--gold-accent)]">{t('Objetivo de temporada')}</p>
                  <p className="mt-2 text-lg font-display font-black text-white">
                    {guide?.manager?.seasonObjective ?? t('Construir un equipo competitivo y cumplir las expectativas de la directiva')}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-white/55">
                    {t('Cada decisión de plantilla, táctica y entrenamiento alimentará este objetivo. Empezaremos por conocer tus recursos.')}
                  </p>
                </div>

                <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-[var(--green-primary)] border-b border-white/10 pb-4">
                  <ListChecks size={18} className="drop-shadow-[0_0_8px_rgba(0,255,100,0.5)]" /> {t('Tu primer turno')}
                </div>
                
                <div className="flex flex-col gap-4">
                  {[
                    { key: 'choose_club', label: t('Conocer tu club y el objetivo de temporada'), route: '/', done: true },
                    { key: 'review_squad', label: t('Revisar plantilla, bajas y contratos'), route: '/squad' },
                    { key: 'set_tactics', label: t('Preparar el once y la primera táctica'), route: '/tactics' },
                    { key: 'start_training', label: t('Conectar el entrenamiento con tu plan de juego'), route: '/training' },
                    { key: 'open_match_center', label: t('Vivir el primer partido y revisar sus consecuencias'), route: '/matches' },
                  ].map((item: any, i: number) => {
                    const serverItem = guide?.checklist?.find((row: any) => row.key === item.key);
                    const done = item.done || serverItem?.done;
                    return (
                    <div key={i} className={cn(
                      "flex items-start gap-4 p-4 rounded-2xl border transition-all duration-300",
                      done
                        ? "bg-[rgba(0,255,100,0.05)] border-[var(--green-primary)] text-white shadow-[0_0_15px_rgba(0,255,100,0.1)]" 
                        : "bg-black/30 border-white/10 text-white/50"
                    )}>
                      {done ? (
                        <CheckCircle2 size={20} className="text-[var(--green-primary)] shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(0,255,100,0.5)]" />
                      ) : (
                        <Circle size={20} className="text-white/20 shrink-0 mt-0.5" />
                      )}
                      <span className={cn("text-sm font-medium", done && "font-bold text-[var(--green-primary)]")}>
                        {item.label}
                      </span>
                    </div>
                  )})}
                </div>

                <div className="pt-6 border-t border-white/10 mt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full h-14 text-sm font-black uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(0,255,100,0.2)] hover:shadow-[0_0_40px_rgba(0,255,100,0.4)] rounded-xl"
                    onClick={() => navigate('/squad', { replace: true })}
                  >
                    {t('Empezar por la plantilla')} <ChevronRight size={20} className="ml-2" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!confirmingClub} onClose={() => setConfirmingClub(null)} title={t('Confirmar firma')} width={400}>
        <div className="text-sm text-white/70">
          <p>{t('Estás a punto de firmar como mánager del')} <strong className="text-white">{confirmingClub?.name}</strong>.</p>
          <p className="mt-2 text-[var(--red-danger)] font-bold">{t('Esta acción es irreversible y tu elección será definitiva.')}</p>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setConfirmingClub(null)}>{t('Cancelar')}</Button>
          <Button variant="primary" onClick={pick}>{t('Firmar Contrato')}</Button>
        </div>
      </Modal>
    </div>
  );
}
