// ─── Residencias y Cantera · identidad v2 elevada (E17 LOTE B) ─────────────────
// Edificio SVG por niveles (el nivel actual iluminado), KPIs, mapa de habitaciones,
// canteranos con potencial en estrellas + barra y panel de mejoras. Lógica de
// datos intacta (academyApi.get / promote / upgrade) y <details> de la fórmula
// FDF conservado con mejor presentación.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, Users, ArrowUp, AlertTriangle, GraduationCap, BookOpen, Star, Zap, Activity } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../lib/cn';
import { academyApi } from '../api/client';
import { Skeleton, StatBar, Badge, Button, EmptyState, Modal, ConfirmModal } from '../components/ui';
import { PlayerLink } from '../components/common/EntityLink';

const RS_CSS = `
.rs-page { padding: 24px; min-height: 100vh; }
.rs-header { margin-bottom: 24px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.rs-kpis { display: flex; gap: 16px; flex-wrap: wrap; }
.rs-kpi { flex: 1; min-width: 200px; background: var(--bg-elevated); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px; position: relative; overflow: hidden; box-shadow: var(--shadow-soft); }
.rs-kpi::before { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, var(--border-color) 0%, transparent 100%); pointer-events: none; }
.rs-kpi-lbl { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
.rs-kpi-val { font-size: 2rem; font-family: var(--font-display); font-weight: 900; color: var(--text-primary); text-shadow: 0 2px 10px rgba(0,0,0,0.2); line-height: 1; }
.rs-grid { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 4fr); gap: 24px; align-items: start; }
.rs-glass { background: var(--bg-elevated); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; box-shadow: var(--shadow-soft); position: relative; overflow: hidden; }
.rs-glass::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, var(--border-color), transparent); }
.rs-pt { display: flex; align-items: center; gap: 8px; font-family: var(--font-display); font-weight: 800; font-size: 1.1rem; color: var(--text-primary); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; text-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.rs-pt svg { color: var(--green-primary); filter: drop-shadow(0 0 8px var(--green-primary)); }
.rs-rooms { display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 8px; margin-top: 16px; }
.rs-room { aspect-ratio: 1; border-radius: 6px; display: grid; place-items: center; font-size: 10px; font-weight: 800; font-family: var(--font-mono-retro); cursor: default; transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); position: relative; }
.rs-room:hover { transform: scale(1.15) translateY(-2px); z-index: 2; }
.rs-room.occ { background: linear-gradient(135deg, var(--green-primary) 0%, #047857 100%); color: var(--bg-primary); box-shadow: 0 4px 12px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.4); border: 1px solid #34d399; }
.rs-room.emp { background: var(--bg-surface); color: var(--text-muted); border: 1px solid var(--border-color); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
.rs-table { width: 100%; border-collapse: separate; border-spacing: 0 4px; }
.rs-table th { text-align: left; padding: 12px; font-size: 0.65rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); border-bottom: 1px solid var(--border-color); }
.rs-table td { padding: 12px; background: var(--bg-surface); transition: background 0.2s; }
.rs-table tr td:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
.rs-table tr td:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; }
.rs-table tbody tr:hover td { background: var(--row-hover); }
.rs-mono { font-family: var(--font-mono-retro); }
.rs-up { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-bottom: 12px; transition: all 0.2s; position: relative; overflow: hidden; }
.rs-up:hover { border-color: rgba(59,130,246,0.3); box-shadow: var(--shadow-soft); transform: translateY(-2px); }
.rs-up-t { font-size: 0.9rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; font-family: var(--font-display); letter-spacing: 0.5px; }
.rs-up-row { display: flex; justify-content: space-between; align-items: center; }
.rs-cost { font-family: var(--font-mono-retro); font-size: 1rem; color: var(--gold-accent); font-weight: 800; }
.rs-formula { margin-top: 24px; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 12px; padding: 16px; }
.rs-formula summary { cursor: pointer; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--text-muted); font-family: var(--font-display); transition: color 0.2s; outline: none; }
.rs-formula summary:hover { color: var(--green-primary); }
.rs-formula p { font-size: 0.8rem; color: var(--text-muted); margin-top: 8px; line-height: 1.6; }
.rs-formula strong { color: var(--text-primary); }
.rs-building { display: flex; gap: 24px; align-items: center; background: var(--bg-surface); border-radius: 16px; padding: 20px; border: 1px solid var(--border-color); }
.rs-bld-svg { flex: none; filter: drop-shadow(0 20px 30px rgba(0,0,0,0.8)); }
.rs-bld-legend { flex: 1; display: flex; flex-direction: column; gap: 8px; font-size: 0.8rem; color: var(--text-muted); }
.rs-bld-legend b { color: var(--text-primary); font-family: var(--font-mono-retro); font-size: 0.9rem; }
.rs-stars { display: inline-flex; gap: 2px; vertical-align: middle; }
.rs-progress-wrap { background: var(--bg-elevated); height: 8px; border-radius: 4px; overflow: hidden; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); margin-top: 12px; }
.rs-progress-fill { height: 100%; background: linear-gradient(90deg, var(--green-primary), #34d399); border-radius: 4px; transition: width 1s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(16,185,129,0.5); }
@media (prefers-reduced-motion: no-preference){
  .rs-bld-glow { animation: rs-glow 3s ease-in-out infinite; }
  @keyframes rs-glow { 0%, 100% { filter: drop-shadow(0 0 8px rgba(34,197,94,0.3)); } 50% { filter: drop-shadow(0 0 20px rgba(34,197,94,0.8)); } }
}
@media(max-width:1024px){ .rs-grid { grid-template-columns: 1fr; } .rs-building { flex-direction: column; } }
`;

function ResidenceBuilding({ level, maxLevel = 5 }: { level: number; maxLevel?: number }) {
  const { t } = useTranslation();
  return (
    <div className="relative flex justify-center items-end" style={{ width: 180, height: 260, perspective: '1000px' }}>
      <div className="absolute bottom-0 w-[140%] h-[40px] bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.3)_0%,transparent_70%)] rounded-[100%] blur-[15px] pointer-events-none" />
      
      {/* Base Foundation */}
      <div className="absolute bottom-2 w-32 h-6 bg-gradient-to-r from-gray-900 to-black border-t border-gray-700 rounded-sm shadow-[0_10px_20px_rgba(0,0,0,0.8)]" />

      {/* Building Container with 3D rotation */}
      <div 
        className="relative flex flex-col-reverse items-center pb-8" 
        style={{ transformStyle: 'preserve-3d', transform: 'rotateX(5deg) rotateY(-15deg)' }}
      >
        {Array.from({ length: maxLevel }).map((_, i) => {
          const floorLevel = i + 1;
          const isBuilt = floorLevel <= level;
          const isCurrent = floorLevel === level;
          const zIndex = maxLevel - i;

          return (
            <div 
              key={floorLevel}
              className="relative w-28 h-10 transition-all duration-700 ease-in-out"
              style={{
                transformStyle: 'preserve-3d',
                zIndex,
                opacity: isBuilt ? 1 : 0.2,
                transform: `translateZ(${isBuilt ? '0px' : '-20px'})`,
                filter: isCurrent ? 'drop-shadow(0 0 15px rgba(34,197,94,0.5))' : 'none'
              }}
            >
              {/* Front Face */}
              <div 
                className={cn(
                  "absolute inset-0 border flex items-center justify-center overflow-hidden backdrop-blur-md",
                  isBuilt ? "bg-gradient-to-b from-gray-800/80 to-gray-900/90" : "bg-gray-900/40",
                  isCurrent ? "border-green-400" : "border-gray-600"
                )}
                style={{ transform: 'translateZ(14px)' }}
              >
                {/* Windows */}
                <div className="flex gap-2 w-full px-2">
                  {[0, 1, 2, 3].map(w => (
                    <div 
                      key={w} 
                      className={cn(
                        "flex-1 h-5 rounded-sm border transition-all duration-1000",
                        isBuilt 
                          ? (isCurrent ? "bg-yellow-200/90 border-yellow-100 shadow-[0_0_10px_rgba(253,224,71,0.8)]" : "bg-cyan-900/40 border-cyan-700/50") 
                          : "bg-transparent border-dashed border-gray-600/30"
                      )} 
                    />
                  ))}
                </div>
                
                {/* Floor Label */}
                <div className="absolute top-0 right-1 text-[8px] font-mono text-white/30 font-bold">{t('gameplay:residences.campus.floorLabel', { level: floorLevel })}</div>
              </div>

              {/* Right Face */}
              <div 
                className={cn(
                  "absolute top-0 right-0 h-10 w-7 border-y border-r origin-right",
                  isBuilt ? "bg-gradient-to-b from-gray-900/90 to-black/95" : "bg-black/40",
                  isCurrent ? "border-green-500/70" : "border-gray-700"
                )}
                style={{ transform: 'rotateY(90deg) translateZ(0px) translateX(14px)' }}
              >
                <div className="flex flex-col gap-1 py-1 px-1 h-full">
                   <div className={cn("flex-1 rounded-sm", isBuilt ? (isCurrent ? "bg-yellow-400/20" : "bg-black/50") : "bg-transparent")} />
                   <div className={cn("flex-1 rounded-sm", isBuilt ? (isCurrent ? "bg-yellow-400/20" : "bg-black/50") : "bg-transparent")} />
                </div>
              </div>

              {/* Top Face (Roof of each floor) */}
              <div 
                className={cn(
                  "absolute top-0 left-0 w-28 h-7 border origin-top",
                  isBuilt ? "bg-gray-700/80" : "bg-gray-800/20",
                  isCurrent ? "border-green-400/50" : "border-gray-600/50"
                )}
                style={{ transform: 'rotateX(-90deg) translateZ(0px)' }}
              />
            </div>
          );
        })}

        {/* Roof Antenna */}
        {level > 0 && (
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full flex flex-col items-center" style={{ transform: 'translateZ(14px)' }}>
            <div className="w-1 h-8 bg-gradient-to-t from-gray-400 to-gray-600 rounded-t-full" />
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,1)] absolute -top-1" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Potencial en estrellas con Glow ───
function TalentStars({ talent, title }: { talent: number; title: string }) {
  const stars = Math.max(0, Math.min(5, Math.round((talent / 99) * 5)));
  return (
    <span className="rs-stars" title={title}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} size={12} style={{ color: i < stars ? 'var(--gold-accent)' : 'rgba(255,255,255,0.1)', fill: i < stars ? 'var(--gold-accent)' : 'none', filter: i < stars ? 'drop-shadow(0 0 4px rgba(250,204,21,0.5))' : 'none' }} />
      ))}
    </span>
  );
}

const POS_BADGE: Record<string, 'info' | 'success' | 'danger' | 'warning'> = {
  DEF: 'info', MED: 'success', DEL: 'danger', POR: 'warning',
};

export function ResidencesPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmUpgrade, setConfirmUpgrade] = useState<'capacity' | 'level' | null>(null);

  const loadAcademy = useCallback(async () => {
    setError(null);
    try {
      const res = await academyApi.get();
      setData(res);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? t('gameplay:residences.loadError'));
      toast.error(e?.message ?? t('gameplay:residences.loadErrorToast'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadAcademy();
  }, [loadAcademy]);

  const [promoTarget, setPromoTarget] = useState<any | null>(null);
  const [promoSalary, setPromoSalary] = useState(0);
  const [promoYears, setPromoYears] = useState(3);
  const demandOf = (talent: number) => 1000 + (talent ?? 0) * 50;

  const openPromotion = (r: any) => {
    setPromoTarget(r);
    setPromoSalary(demandOf(r?.talent ?? 0));
    setPromoYears(3);
  };

  const promotePlayer = async () => {
    if (!promoTarget) return;
    setSubmitting(true);
    try {
      await academyApi.promote(promoTarget.id, { salary: promoSalary, years: promoYears });
      toast.success(t('gameplay:residences.toasts.promoted'), { icon: '🎓' });
      setPromoTarget(null);
      await loadAcademy();
    } catch (e: any) {
      toast.error(e?.message || t('gameplay:residences.toasts.promoteError'));
    } finally {
      setSubmitting(false);
    }
  };

  const upgradeAcademy = async (type: 'capacity' | 'level') => {
    setConfirmUpgrade(null);
    setSubmitting(true);
    try {
      await academyApi.upgrade(type);
      toast.success(t('gameplay:residences.toasts.upgradeDone'), { icon: '🏗️' });
      await loadAcademy();
    } catch (e: any) {
      toast.error(e?.message || t('gameplay:residences.toasts.upgradeError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rs-page page-surface">
        <style>{RS_CSS}</style>
        <div className="rs-header">
          <div><Skeleton width={150} height={20} className="mb-2" /><Skeleton width={300} height={40} /></div>
        </div>
        <div className="rs-kpis mb-6"><Skeleton height={100} className="flex-1" /><Skeleton height={100} className="flex-1" /><Skeleton height={100} className="flex-1" /></div>
        <div className="rs-grid"><Skeleton height={400} /><Skeleton height={400} /></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rs-page">
        <EmptyState icon={<AlertTriangle size={32} className="text-red-500" />} title={t('gameplay:residences.closedTitle')} hint={error ?? t('gameplay:residences.loadError')} action={<Button variant="primary" onClick={loadAcademy}>{t('gameplay:residences.retry')}</Button>} />
      </div>
    );
  }

  const level: number = data.level ?? 1;
  const residences: number = data.residences ?? 1;
  const CAPACITY: number = data.capacity ?? 0;
  const youthPlayers: any[] = data.youthPlayers ?? [];
  const OCCUPIED: number = youthPlayers.length;

  const rooms = Array.from({ length: CAPACITY }, (_, i) => {
    if (i < OCCUPIED) return 'occupied';
    return 'empty';
  });

  return (
    <div className="rs-page page-surface">
      <style>{RS_CSS}</style>

      <div className="rs-header">
        <div>
          <p className="text-[10px] uppercase tracking-[2px] font-bold text-white/50 mb-1 flex items-center gap-2"><Zap size={12} className="text-green-400" /> {t('gameplay:residences.kicker')}</p>
          <h1 className="text-4xl font-black text-white font-display uppercase tracking-tight drop-shadow-md">{t('gameplay:residences.title')}</h1>
        </div>
      </div>

      <div className="rs-kpis mb-6">
        <div className="rs-kpi">
          <div className="rs-kpi-lbl"><Home size={14} /> {t('gameplay:residences.kpis.capacity')}</div>
          <div className="rs-kpi-val">{CAPACITY} <span className="text-sm text-white/40 font-sans tracking-normal">{t('gameplay:residences.kpis.slots')}</span></div>
        </div>
        <div className="rs-kpi">
          <div className="rs-kpi-lbl"><Users size={14} /> {t('gameplay:residences.kpis.residents')}</div>
          <div className="rs-kpi-val text-green-400">{OCCUPIED}<span className="text-white/40">/{CAPACITY}</span></div>
          <div className="rs-progress-wrap"><div className="rs-progress-fill" style={{ width: `${Math.min(100, (OCCUPIED/Math.max(1, CAPACITY))*100)}%` }} /></div>
        </div>
        <div className="rs-kpi">
          <div className="rs-kpi-lbl"><ArrowUp size={14} /> {t('gameplay:residences.kpis.archLevel')}</div>
          <div className="rs-kpi-val text-yellow-400">{t('gameplay:residences.campus.levelShort', { level })}</div>
          <div className="text-xs text-white/40 font-bold mt-2 uppercase tracking-wider">{t('gameplay:residences.kpis.modules', { count: residences })}</div>
        </div>
      </div>

      <div className="rs-grid">
        <div className="flex flex-col gap-6">
          {/* Edificio y Habitaciones */}
          <div className="rs-glass">
            <div className="rs-pt"><Activity size={18} /> {t('gameplay:residences.campus.title')}</div>
            <div className="rs-building">
              <ResidenceBuilding level={level} maxLevel={5} />
              <div className="rs-bld-legend">
                <div className="bg-black/30 p-3 rounded-lg border border-white/5 mb-2">
                  <span className="block text-[10px] uppercase text-white/40 font-bold mb-1">{t('gameplay:residences.campus.currentLevel')}</span>
                  <b className="text-2xl text-green-400">{t('gameplay:residences.campus.levelShort', { level })} <span className="text-sm text-white/40">{t('gameplay:residences.campus.max')}</span></b>
                </div>
                <p className="leading-relaxed">{t('gameplay:residences.campus.desc')}</p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]"></div>
                  <span className="text-xs text-white/70">{t('gameplay:residences.campus.optimal')}</span>
                </div>
              </div>
            </div>
            
            <div className="mt-6">
              <div className="flex justify-between items-end mb-2">
                <span className="text-xs font-bold uppercase tracking-widest text-white/50">{t('gameplay:residences.campus.floorPlan')}</span>
                <span className="rs-mono text-xs text-white/40">{t('gameplay:residences.campus.occupied', { occupied: OCCUPIED, capacity: CAPACITY })}</span>
              </div>
              <div className="rs-rooms">
                {rooms.map((status, i) => (
                  <div key={i} title={status === 'occupied' ? t('gameplay:residences.campus.roomOccupied') : t('gameplay:residences.campus.roomEmpty')} className={cn('rs-room', status === 'occupied' ? 'occ' : 'emp')}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla de Residentes */}
          <div className="rs-glass p-0 overflow-hidden">
            <div className="rs-pt p-6 pb-0 mb-4"><GraduationCap size={18} /> {t('gameplay:residences.youth.title')}</div>
            <div className="overflow-x-auto px-6 pb-6">
              <table className="rs-table">
                <thead>
                  <tr>
                    <th>{t('gameplay:residences.youth.prospect')}</th>
                    <th className="text-center">{t('gameplay:residences.youth.role')}</th>
                    <th className="text-center">{t('gameplay:residences.youth.age')}</th>
                    <th className="text-center">{t('gameplay:residences.youth.projection')}</th>
                    <th className="text-right">{t('gameplay:residences.youth.talent')}</th>
                    <th className="text-right">{t('gameplay:residences.youth.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {youthPlayers.map((r: any) => {
                    const attrs = r?.attrs ?? {};
                    const position: string = attrs.position ?? '—';
                    const flag: string = attrs.flag ?? '';
                    const name: string = attrs.name ?? t('gameplay:residences.youth.playerFallback', { id: r.id });
                    const overall: number = r?.talent ?? 0;
                    const playerId: number | null = attrs.playerId ?? r?.playerId ?? null;
                    return (
                      <tr key={r.id} className="group">
                        <td className="font-bold text-white whitespace-nowrap">
                          {flag} <span className="group-hover:text-green-400 transition-colors"><PlayerLink id={playerId} name={name} /></span>
                        </td>
                        <td className="text-center">
                          <Badge variant={POS_BADGE[position] ?? 'neutral'} className="bg-black/40 border-white/10">{position}</Badge>
                        </td>
                        <td className="rs-mono text-center text-white/50">{r?.age ?? '—'}</td>
                        <td className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <TalentStars talent={overall} title={t('gameplay:residences.youth.potential', { talent: overall })} />
                            <div className="w-16 opacity-50 group-hover:opacity-100 transition-opacity"><StatBar value={overall} max={99} size="sm" /></div>
                          </div>
                        </td>
                        <td className="text-right">
                          <b className="rs-mono text-[14px] drop-shadow-md" style={{ color: overall >= 75 ? '#a855f7' : overall >= 60 ? '#22c55e' : overall >= 50 ? '#3b82f6' : '#eab308' }}>
                            {overall}
                          </b>
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="secondary" className="bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 text-xs py-1" disabled={submitting} onClick={() => openPromotion(r)}>
                            <ArrowUp size={12} className="mr-1" /> {t('gameplay:residences.youth.promote')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {youthPlayers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-white/30 italic font-medium">{t('gameplay:residences.youth.empty')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Panel de Mejoras RPG */}
          <div className="rs-glass">
            <div className="rs-pt"><ArrowUp size={18} /> {t('gameplay:residences.upgrades.title')}</div>
            <p className="text-xs text-white/40 mb-6 leading-relaxed">{t('gameplay:residences.upgrades.lede')}</p>
            
            <div className="rs-up group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <p className="rs-up-t flex items-center gap-2"><Home size={14} className="text-blue-400" /> {t('gameplay:residences.upgrades.capacityTitle')}</p>
              <p className="text-[10px] text-white/40 mb-3 uppercase tracking-wider">{t('gameplay:residences.upgrades.capacityHint')}</p>
              <div className="rs-up-row">
                <span className="rs-cost">{t('gameplay:residences.upgrades.capacityCost')}</span>
                <Button size="sm" variant="secondary" className="bg-blue-500/20 text-blue-300 border-blue-500/30 hover:bg-blue-500/30 font-bold" disabled={submitting} onClick={() => setConfirmUpgrade('capacity')}>
                  {t('gameplay:residences.upgrades.invest')}
                </Button>
              </div>
            </div>
            
            <div className="rs-up group">
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/0 via-yellow-500/5 to-yellow-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
              <p className="rs-up-t flex items-center gap-2"><ArrowUp size={14} className="text-yellow-400" /> {t('gameplay:residences.upgrades.levelTitle')}</p>
              <p className="text-[10px] text-white/40 mb-3 uppercase tracking-wider">{t('gameplay:residences.upgrades.levelHint')}</p>
              <div className="rs-up-row">
                <span className="rs-cost">{t('gameplay:residences.upgrades.levelCost')}</span>
                <Button size="sm" variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 hover:bg-yellow-500/30 font-bold" disabled={submitting || level >= 5} onClick={() => setConfirmUpgrade('level')}>
                  {level >= 5 ? t('gameplay:residences.upgrades.maxLevel') : t('gameplay:residences.upgrades.evolve')}
                </Button>
              </div>
            </div>
          </div>

          <details className="rs-formula">
            <summary><BookOpen size={12} className="inline mr-1 -mt-1" /> {t('gameplay:residences.formula.title')}</summary>
            <div>
              <p>{t('gameplay:residences.formula.l1')}</p>
              <p>{t('gameplay:residences.formula.l2')}</p>
              <p>{t('gameplay:residences.formula.l3')}</p>
              <p>{t('gameplay:residences.formula.l4')}</p>
              <p>{t('gameplay:residences.formula.l5')}</p>
            </div>
          </details>
        </div>
      </div>

      {/* Modal Negociación de Contrato */}
      <Modal open={!!promoTarget} onClose={() => setPromoTarget(null)} title={promoTarget ? t('gameplay:residences.promo.title', { name: promoTarget?.attrs?.name ?? t('gameplay:residences.promo.prospect', { id: promoTarget?.id }) }) : ''}>
        {promoTarget && (() => {
          const attrs = promoTarget.attrs ?? {};
          const demand = demandOf(promoTarget.talent ?? 0);
          const skillKeys = ['passing', 'tackling', 'shooting', 'organization', 'unmarking', 'finishing', 'dribbling', 'goalkeeping'] as const;
          return (
            <div className="flex flex-col gap-6">
              <div className="flex gap-4 items-center flex-wrap bg-black/20 p-4 rounded-xl border border-white/5">
                <Badge variant={POS_BADGE[attrs.position as string] ?? 'neutral'} className="text-sm px-3 py-1">{attrs.position ?? '—'}</Badge>
                <span className="text-sm font-bold text-white/60">{t('gameplay:residences.promo.years', { count: promoTarget.age })}</span>
                <div className="flex-1" />
                <div className="flex items-center gap-3">
                  <TalentStars talent={promoTarget.talent ?? 0} title={t('gameplay:residences.youth.potential', { talent: promoTarget.talent ?? 0 })} />
                  <b className="rs-mono text-xl text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">{promoTarget.talent ?? '—'}</b>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 px-2">
                {skillKeys.map((key) => (
                  <div key={key} className="flex justify-between items-center text-sm border-b border-white/5 pb-1">
                    <span className="text-white/50 font-bold uppercase tracking-wider text-[10px]">{t(`gameplay:residences.promo.attrs.${key}`)}</span>
                    <b className="rs-mono text-white/90">{Number(attrs[key]) || '—'}</b>
                  </div>
                ))}
              </div>

              <div className="bg-[#0a1510] border border-green-900/50 rounded-xl p-5 flex flex-col gap-4 shadow-inner">
                <p className="text-[10px] text-green-400 m-0 uppercase tracking-widest font-bold flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                  {t('gameplay:residences.promo.demands')}
                </p>
                <div className="flex justify-between items-center bg-black/40 p-3 rounded-lg border border-white/5">
                  <span className="text-xs font-bold text-white/50 uppercase">{t('gameplay:residences.promo.salaryRequired')}</span>
                  <b className="text-yellow-400 font-mono text-lg">{demand.toLocaleString('es-ES')} €<span className="text-xs text-white/40">{t('gameplay:residences.promo.perMonth')}</span></b>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2">
                  <label className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('gameplay:residences.promo.salaryOffer')}</span>
                    <div className="relative">
                      <input type="number" min={demand} step={100} value={promoSalary} onChange={e => setPromoSalary(Number(e.target.value))} className="w-full bg-black/60 border border-white/10 rounded-lg text-white p-3 font-mono text-right focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-all outline-none" />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 font-bold">€</span>
                    </div>
                  </label>
                  <label className="flex flex-col gap-2">
                    <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{t('gameplay:residences.promo.duration')}</span>
                    <div className="flex gap-1 h-[46px]">
                      {[1, 2, 3, 4, 5].map(y => (
                        <button key={y} onClick={() => setPromoYears(y)} className={cn("flex-1 rounded-md font-mono font-bold text-sm transition-all border", promoYears === y ? "bg-green-500 text-black border-green-400 shadow-[0_0_10px_rgba(34,197,94,0.3)]" : "bg-black/40 text-white/40 border-white/5 hover:bg-white/10")}>{y}</button>
                      ))}
                    </div>
                  </label>
                </div>
                {promoSalary < demand && <p className="text-xs text-red-400 font-bold m-0 mt-1 flex items-center gap-1"><AlertTriangle size={12} /> {t('gameplay:residences.promo.offerRejected')}</p>}
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <Button variant="ghost" className="hover:bg-white/5" onClick={() => setPromoTarget(null)}>{t('gameplay:residences.promo.break')}</Button>
                <Button disabled={submitting || promoSalary < demand} className="bg-green-600 hover:bg-green-500 text-white shadow-[0_0_15px_rgba(22,163,74,0.4)] border-none" onClick={promotePlayer}>
                  {t('gameplay:residences.promo.sign')}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmModal open={!!confirmUpgrade} onClose={() => setConfirmUpgrade(null)} onConfirm={() => confirmUpgrade && upgradeAcademy(confirmUpgrade)} title={confirmUpgrade === 'capacity' ? t('gameplay:residences.confirm.capacityTitle') : t('gameplay:residences.confirm.levelTitle')} confirmText={t('gameplay:residences.confirm.confirm')} isSubmitting={submitting}>
        <div className="bg-black/20 p-4 rounded-lg border border-white/5 mt-2">
          <p className="text-sm text-white/80 leading-relaxed m-0">
            {t('gameplay:residences.confirm.body', {
              amount: confirmUpgrade === 'capacity' ? t('gameplay:residences.upgrades.capacityCost') : t('gameplay:residences.upgrades.levelCost'),
              project: confirmUpgrade === 'capacity' ? t('gameplay:residences.confirm.capacityProject') : t('gameplay:residences.confirm.levelProject'),
            })}
          </p>
        </div>
      </ConfirmModal>
    </div>
  );
}
