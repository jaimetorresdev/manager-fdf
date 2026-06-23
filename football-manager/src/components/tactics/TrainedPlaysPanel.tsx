import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { tacticsApi } from '../../api/client';
import { Plus, PlayCircle, PauseCircle } from 'lucide-react';
import { cn } from '../../lib/cn';
import { T2Panel } from '../tactics2/TacticsPanels';

interface TrainedPlay {
  id: number;
  type: string;
  level: number;
  progress: number;
  status: 'developing' | 'trainable' | 'maxed';
  isActive: boolean;
}

const PLAYS_CSS = `
.tp-list{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}.tp-card{padding:10px;border:1px solid var(--border-color);border-radius:9px;background:var(--bg-elevated)}
.tp-top,.tp-meta{display:flex;align-items:center;justify-content:space-between;gap:8px}.tp-top strong{min-width:0;overflow:hidden;color:var(--text-primary);font-size:.76rem;text-overflow:ellipsis;white-space:nowrap}.tp-level{color:var(--green-primary);font-family:var(--font-scoreboard);font-size:.72rem}
.tp-meta{margin-top:5px;color:var(--text-muted);font-size:.62rem}.tp-progress{height:5px;margin-top:8px;overflow:hidden;border-radius:9px;background:var(--bg-surface)}.tp-progress>span{display:block;height:100%;border-radius:inherit}
.tp-actions{margin-top:8px;display:flex;justify-content:flex-end}.tp-toggle{padding:6px 8px;display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:7px;color:var(--text-muted);background:var(--bg-surface);cursor:pointer;font-size:.64rem;font-weight:800}.tp-toggle.on{color:var(--bg-surface);border-color:transparent;background:var(--green-primary)}
.tp-new{padding-top:11px;border-top:1px solid var(--border-color)}.tp-new p{margin:0 0 7px;color:var(--text-muted);font-size:.65rem}.tp-new-row{display:grid;grid-template-columns:minmax(0,1fr) 38px;gap:7px}.tp-new select{min-width:0;padding:8px;border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);background:var(--bg-elevated);font-size:.7rem}.tp-new button{display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--green-primary) 45%,var(--border-color));border-radius:8px;color:var(--bg-base);background:var(--green-primary);cursor:pointer}
`;

export function TrainedPlaysPanel() {
  const { t } = useTranslation();
  const [plays, setPlays] = useState<TrainedPlay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPlays = () => {
    tacticsApi.getPlays()
      .then(setPlays)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPlays();
  }, []);

  const handleStart = async (type: string) => {
    try {
      await tacticsApi.startPlay(type);
      fetchPlays();
    } catch (e: any) {
      toast.error(e.message || 'Error al iniciar jugada');
    }
  };

  // Máx. 8 jugadas activas por partido (manual FDF §2.7).
  const MAX_ACTIVE_PLAYS = 8;
  const activeCount = plays.filter(p => p.isActive).length;

  const handleToggle = async (id: number) => {
    const target = plays.find(p => p.id === id);
    if (target && !target.isActive && activeCount >= MAX_ACTIVE_PLAYS) {
      toast.error(t('gameplay:common.maxActivePlays', { max: MAX_ACTIVE_PLAYS }));
      return;
    }
    try {
      await tacticsApi.togglePlay(id);
      fetchPlays();
    } catch (e: any) {
      toast.error(e.message || 'Error al activar/desactivar');
    }
  };

  if (loading) return <T2Panel title="Jugadas entrenadas"><p className="text-[var(--text-muted)] text-xs">Cargando jugadas...</p></T2Panel>;

  const hasDeveloping = plays.some(p => p.status === 'developing');
  const availableTypes = ['Saque de esquina', 'Falta directa', 'Fuera de juego', 'Contragolpe'].filter(
    type => !plays.some(p => p.type === type)
  );

  return (
    <T2Panel
      title="Jugadas entrenadas"
      right={<span style={{ color: activeCount >= MAX_ACTIVE_PLAYS ? 'var(--gold-accent)' : undefined }}>{activeCount}/{MAX_ACTIVE_PLAYS} en partido</span>}
    >
      <style>{PLAYS_CSS}</style>
      <div className="tp-list">
        {plays.length === 0 && (
          <p className="text-xs text-[var(--text-muted)]">No tienes jugadas entrenadas todavía.</p>
        )}
        {plays.map(play => (
          <div key={play.id} className="tp-card">
            <div className="tp-top">
              <strong>{play.type}</strong>
              <span className="tp-level">Lvl {play.level}</span>
            </div>
            <div className="tp-meta">
              <span>{play.status === 'developing' ? t('gameplay:common.playStatus.developing') : play.status === 'maxed' ? t('gameplay:common.playStatus.maxed') : t('gameplay:common.playStatus.available')}</span>
              <span>Progreso: {play.progress}/{play.level * 3}</span>
            </div>

            {play.status !== 'maxed' && (
              <div className="tp-progress">
                <span
                  style={{
                    width: `${(play.progress / (play.level * 3)) * 100}%`,
                    background: play.status === 'developing' ? 'var(--gold-accent)' : 'var(--green-primary)',
                  }}
                />
              </div>
            )}

            <div className="tp-actions">
              {play.status !== 'developing' && (
                <button
                  onClick={() => handleToggle(play.id)}
                  className={cn('tp-toggle', play.isActive && 'on')}
                >
                  {play.isActive ? <PauseCircle size={12} /> : <PlayCircle size={12} />}
                  {play.isActive ? 'Desactivar' : 'Activar en Partido'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {!hasDeveloping && availableTypes.length > 0 && (
        <div className="tp-new">
          <p>Nueva Jugada (Ocupa 1 hueco de entreno):</p>
          <div className="tp-new-row">
            <select id="new-play-type">
              {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button 
              onClick={() => {
                const sel = document.getElementById('new-play-type') as HTMLSelectElement;
                if (sel) handleStart(sel.value);
              }}
              aria-label="Añadir jugada"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </T2Panel>
  );
}
