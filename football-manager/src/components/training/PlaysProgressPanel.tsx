// ─── E17 LOTE B · Progreso de jugadas entrenadas (vista de Entrenamiento) ──────
// Misma API y mismas reglas que TrainedPlaysPanel (tope 8 activas, manual §2.7),
// presentadas en identidad v2: barras de progreso por jugada y contador del tope.
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { PlayCircle, PauseCircle, Plus, ClipboardList } from 'lucide-react';
import { tacticsApi } from '../../api/client';
import { Skeleton, EmptyState } from '../ui';
import { cn } from '../../lib/cn';

interface TrainedPlay {
  id: number;
  type: string;
  level: number;
  progress: number;
  status: 'developing' | 'trainable' | 'maxed';
  isActive: boolean;
}

const PP_CSS = `
.pp-wrap{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);
  overflow:hidden;box-shadow:inset 0 1px 0 var(--bevel-light);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.pp-head{display:flex;align-items:center;gap:6px;padding:8px 12px;background:var(--titlebar-bg);
  border-bottom:1px solid var(--border-color);font-family:var(--font-display);font-weight:700;
  font-size:.74rem;text-transform:uppercase;letter-spacing:1px;color:var(--titlebar-text)}
.pp-cap{margin-left:auto;font-family:var(--font-mono-retro);font-size:.68rem;text-transform:none;letter-spacing:0}
.pp-body{padding:12px;display:flex;flex-direction:column;gap:10px}
.pp-row{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-retro);padding:10px}
.pp-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.pp-name{font-family:var(--font-display);font-weight:700;font-size:.88rem;color:var(--text-primary)}
.pp-lvl{font-family:var(--font-mono-retro);font-size:.7rem;font-weight:700;color:var(--green-primary)}
.pp-meta{display:flex;justify-content:space-between;font-size:.66rem;color:var(--text-muted);margin-bottom:6px;
  font-family:var(--font-mono-retro)}
.pp-bar{height:7px;border-radius:3px;background:var(--track-color);border:1px solid var(--border-color);overflow:hidden}
.pp-fill{height:100%;transition:width .55s cubic-bezier(.34,1.56,.64,1)}
.pp-actions{display:flex;justify-content:flex-end;margin-top:8px}
.pp-toggle{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:4px;cursor:pointer;
  font-size:.7rem;font-weight:700;font-family:var(--font-mono-retro);transition:all 150ms ease}
.pp-toggle.on{background:var(--green-primary);color:var(--avatar-text);border:1px solid transparent}
.pp-toggle.on:hover{filter:brightness(.95)}
.pp-toggle.off{background:var(--bg-surface);color:var(--text-muted);border:1px solid var(--border-color)}
.pp-toggle.off:hover{color:var(--text-primary)}
.pp-new{display:flex;gap:8px;border-top:1px solid color-mix(in srgb,var(--border-color) 60%,transparent);padding-top:10px}
.pp-new select{flex:1;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:4px;
  padding:5px 8px;font-size:.76rem;color:var(--text-primary)}
.pp-new button{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:4px;border:none;
  cursor:pointer;background:var(--green-primary);color:var(--avatar-text);font-weight:700;font-size:.74rem;transition:filter 150ms ease}
.pp-new button:hover{filter:brightness(.95)}
`;

// Máx. 8 jugadas activas por partido (manual FDF §2.7).
const MAX_ACTIVE_PLAYS = 8;
/** Tipos en español exigidos por la API del backend. */
const PLAY_TYPES_API = ['Saque de esquina', 'Falta directa', 'Fuera de juego', 'Contragolpe'] as const;
const PLAY_TYPE_I18N: Record<string, 'corner' | 'freekick' | 'offside' | 'counter'> = {
  'Saque de esquina': 'corner',
  'Falta directa': 'freekick',
  'Fuera de juego': 'offside',
  'Contragolpe': 'counter',
};

export function PlaysProgressPanel() {
  const { t } = useTranslation();
  const [plays, setPlays] = useState<TrainedPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState('');

  const playTypeLabel = (type: string) => {
    const key = PLAY_TYPE_I18N[type];
    return key ? t(`gameplay:plays.types.${key}`) : type;
  };

  const fetchPlays = useCallback(() => {
    tacticsApi.getPlays()
      .then(d => setPlays(Array.isArray(d) ? d : []))
      .catch(e => toast.error(e instanceof Error ? e.message : t('gameplay:plays.loadError')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { fetchPlays(); }, [fetchPlays]);

  const activeCount = plays.filter(p => p.isActive).length;
  const hasDeveloping = plays.some(p => p.status === 'developing');
  const availableTypes = PLAY_TYPES_API.filter(type => !plays.some(p => p.type === type));

  const handleStart = async (type: string) => {
    if (!type) return;
    try {
      await tacticsApi.startPlay(type);
      toast.success(t('gameplay:common.trainingPlay', { type: playTypeLabel(type) }));
      fetchPlays();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:plays.startError'));
    }
  };

  const handleToggle = async (id: number) => {
    const target = plays.find(p => p.id === id);
    if (target && !target.isActive && activeCount >= MAX_ACTIVE_PLAYS) {
      toast.error(t('gameplay:common.maxActivePlays', { max: MAX_ACTIVE_PLAYS }));
      return;
    }
    try {
      await tacticsApi.togglePlay(id);
      fetchPlays();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('gameplay:plays.toggleError'));
    }
  };

  if (loading) return <Skeleton height={180} />;

  return (
    <div className="pp-wrap">
      <style>{PP_CSS}</style>
      <div className="pp-head">
        <ClipboardList size={13} />
        {t('gameplay:plays.title')}
        <span className="pp-cap" style={{ color: activeCount >= MAX_ACTIVE_PLAYS ? 'var(--gold-accent)' : 'var(--text-muted)' }}>
          {t('gameplay:plays.inMatch', { active: activeCount, max: MAX_ACTIVE_PLAYS })}
        </span>
      </div>
      <div className="pp-body">
        {plays.length === 0 && (
          <EmptyState icon={<ClipboardList size={24} />} title={t('gameplay:plays.emptyTitle')}
            hint={t('gameplay:plays.emptyHint')} />
        )}
        {plays.map(play => {
          const target = play.level * 3;
          const pct = target > 0 ? Math.min(100, (play.progress / target) * 100) : 0;
          const barColor = play.status === 'developing' ? 'var(--gold-accent)' : 'var(--green-primary)';
          const statusLabel = play.status === 'developing'
            ? t('gameplay:plays.statusDeveloping')
            : play.status === 'maxed'
              ? t('gameplay:plays.statusMaxed')
              : t('gameplay:plays.statusAvailable');
          return (
            <div key={play.id} className="pp-row">
              <div className="pp-top">
                <span className="pp-name">{playTypeLabel(play.type)}</span>
                <span className="pp-lvl">{t('gameplay:plays.level', { level: play.level })}</span>
              </div>
              <div className="pp-meta">
                <span>{statusLabel}</span>
                <span>{play.progress}/{target}</span>
              </div>
              {play.status !== 'maxed' && (
                <div className="pp-bar">
                  <div className="pp-fill" style={{ width: `${pct}%`, background: barColor, boxShadow: `0 0 6px color-mix(in srgb, ${barColor} 50%, transparent)` }} />
                </div>
              )}
              <div className="pp-actions">
                {play.status !== 'developing' && (
                  <button className={cn('pp-toggle', play.isActive ? 'on' : 'off')} onClick={() => handleToggle(play.id)}>
                    {play.isActive ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
                    {play.isActive ? t('gameplay:plays.deactivate') : t('gameplay:plays.activate')}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!hasDeveloping && availableTypes.length > 0 && (
          <div className="pp-new">
            <select value={newType || availableTypes[0]} onChange={e => setNewType(e.target.value)} aria-label={t('gameplay:plays.newPlay')}>
              {availableTypes.map(type => <option key={type} value={type}>{playTypeLabel(type)}</option>)}
            </select>
            <button onClick={() => handleStart(newType || availableTypes[0])}>
              <Plus size={13} /> {t('gameplay:plays.train')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
