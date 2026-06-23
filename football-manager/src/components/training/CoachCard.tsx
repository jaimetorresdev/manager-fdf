// ─── E17 LOTE B · Tarjeta de entrenador con 6 slots visuales ───────────────────
// Presentación pura: nivel (pips), especialidad GK/DEF/MID/ATT/TAC con acento de
// color, 6 huecos de grupo (lleno/vacío) y flujo de asignación por desplegable.
import { useState } from 'react';
import { Dumbbell, X, UserPlus } from 'lucide-react';
import { PlayerLink } from '../common/EntityLink';
import { cn } from '../../lib/cn';
import { PosBadge } from '../ui/PosBadge';
import { ConfirmModal } from '../ui/ConfirmModal';

export const COACH_CSS = `
.cc{position:relative;overflow:hidden;background:var(--bg-surface);border:1px solid var(--border-color);
  border-radius:var(--radius-retro);box-shadow:inset 0 1px 0 var(--bevel-light);display:flex;flex-direction:column;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.cc::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--cc-accent,var(--green-primary))}
.cc-head{display:flex;align-items:center;gap:8px;padding:9px 14px;background:var(--titlebar-bg);
  border-bottom:1px solid var(--border-color)}
.cc-title{font-family:var(--font-display);font-weight:700;font-size:.86rem;text-transform:uppercase;
  letter-spacing:.8px;color:var(--text-primary)}
.cc-chip{font-family:var(--font-mono-retro);font-size:.64rem;font-weight:700;padding:2px 7px;border-radius:3px;
  color:var(--avatar-text);background:var(--cc-accent,var(--green-primary))}
.cc-fire{margin-left:auto;background:none;border:1px solid color-mix(in srgb,var(--red-danger) 35%,transparent);
  color:var(--red-danger);font-family:var(--font-display);font-weight:700;font-size:.62rem;text-transform:uppercase;
  letter-spacing:.8px;padding:3px 9px;border-radius:4px;cursor:pointer;transition:background 150ms ease}
.cc-fire:hover{background:color-mix(in srgb,var(--red-danger) 14%,transparent)}
.cc-fire:disabled{opacity:.5;cursor:not-allowed}
.cc-body{padding:12px 14px;display:flex;flex-direction:column;gap:12px}
.cc-meta{display:flex;align-items:center;gap:14px;font-family:var(--font-mono-retro);font-size:.72rem;color:var(--text-muted)}
.cc-pips{display:inline-flex;gap:3px;align-items:center}
.cc-pip{width:7px;height:7px;border-radius:2px;background:var(--bg-elevated);border:1px solid var(--border-color)}
.cc-pip.on{background:var(--cc-accent,var(--green-primary));border-color:transparent;
  box-shadow:0 0 4px color-mix(in srgb,var(--cc-accent,var(--green-primary)) 55%,transparent)}
.cc-sec{font-size:.62rem;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--text-muted);margin-bottom:6px}
.cc-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.cc-slot{display:flex;align-items:center;gap:5px;min-height:34px;padding:4px 8px;border-radius:4px;font-size:.72rem;
  background:var(--bg-elevated);border:1px solid var(--border-color)}
.cc-slot.empty{border-style:dashed;justify-content:center;color:var(--text-muted);
  background:color-mix(in srgb,var(--bg-elevated) 50%,transparent);font-family:var(--font-mono-retro);font-size:.64rem}
.cc-slot .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)}
.cc-slot .rm{display:inline-flex;background:none;border:none;padding:0;color:var(--red-danger);cursor:pointer;flex:none}
.cc-slot .rm:hover{opacity:.7}
.cc-assign{display:flex;gap:8px}
.cc-assign select{flex:1;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:4px;
  padding:5px 8px;font-size:.76rem;color:var(--text-primary)}
.cc-assign button{display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:4px;cursor:pointer;
  background:color-mix(in srgb,var(--green-primary) 12%,transparent);color:var(--green-primary);
  border:1px solid color-mix(in srgb,var(--green-primary) 30%,transparent);font-size:.72rem;font-weight:700;transition:background 150ms ease}
.cc-assign button:hover{background:color-mix(in srgb,var(--green-primary) 20%,transparent)}
.cc-assign button:disabled{opacity:.45;cursor:not-allowed}
`;

interface Props {
  coach: any;
  accent: string;
  label: string;
  candidates: any[]; // jugadores de la categoría aún sin asignar a este coach
  isSubmitting: boolean;
  onFire: (id: number) => void;
  onAssign: (coachId: number, playerId: number) => void;
  onUnassign: (coachId: number, playerId: number) => void;
}

export function CoachCard({ coach, accent, label, candidates, isSubmitting, onFire, onAssign, onUnassign }: Props) {
  const players: any[] = Array.isArray(coach?.players) ? coach.players : [];
  const [pick, setPick] = useState('');
  const [showFireConfirm, setShowFireConfirm] = useState(false);
  const slots = Array.from({ length: 6 }, (_, i) => players[i] ?? null);
  const full = players.length >= 6;

  return (
    <div className="cc" style={{ ['--cc-accent' as string]: accent }}>
      <div className="cc-head">
        <Dumbbell size={14} style={{ color: accent }} />
        <span className="cc-title">{label}</span>
        <span className="cc-chip">{coach?.category ?? '—'}</span>
        <button className="cc-fire" disabled={isSubmitting} onClick={() => setShowFireConfirm(true)}>Despedir</button>
      </div>
      
      <ConfirmModal
        open={showFireConfirm}
        onClose={() => setShowFireConfirm(false)}
        onConfirm={() => {
          setShowFireConfirm(false);
          onFire(coach.id);
        }}
        title="Despedir Entrenador"
        confirmText="Sí, despedir"
        isDestructive
        isSubmitting={isSubmitting}
      >
        <p>¿Estás seguro de que deseas despedir al entrenador <strong>{label}</strong>?</p>
        <p className="text-sm mt-2 opacity-80">Perderás su nivel de mejora y los jugadores asignados dejarán de recibir entrenamiento hasta que contrates a otro.</p>
      </ConfirmModal>
      <div className="cc-body">
        <div className="cc-meta">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            NIVEL
            <span className="cc-pips">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={cn('cc-pip', i < Number(coach?.level ?? 0) && 'on')} />
              ))}
            </span>
            <b style={{ color: 'var(--text-primary)' }}>{coach?.level ?? '—'}</b>
          </span>
          <span>GRUPO <b style={{ color: full ? 'var(--gold-accent)' : 'var(--text-primary)' }}>{players.length}/6</b></span>
        </div>

        <div>
          <p className="cc-sec">Grupo de trabajo</p>
          <div className="cc-slots">
            {slots.map((p, i) => p ? (
              <span key={p.id} className="cc-slot">
                <span className="nm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.position && <PosBadge position={p.position} preferredPosition={p.preferredPosition} short />}
                  <PlayerLink id={p.id} name={p?.name ?? `Jugador #${p.id}`} />
                </span>
                <button className="rm" title="Quitar del grupo" disabled={isSubmitting}
                  onClick={() => onUnassign(coach.id, p.id)}>
                  <X size={12} />
                </button>
              </span>
            ) : (
              <span key={`e${i}`} className="cc-slot empty">LIBRE</span>
            ))}
          </div>
        </div>

        <div>
          <p className="cc-sec">Asignar jugador (cat. {coach?.category})</p>
          {candidates.length === 0 ? (
            <p style={{ fontSize: '.74rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
              Sin candidatos disponibles para esta categoría.
            </p>
          ) : (
            <div className="cc-assign">
              <select value={pick} onChange={e => setPick(e.target.value)} aria-label="Candidato">
                <option value="">Elige jugador…</option>
                {candidates.map(p => (
                  <option key={p.id} value={p.id}>{p.position ?? '—'} · {p.name} · {p.overall ?? '—'}</option>
                ))}
              </select>
              <button disabled={isSubmitting || full || !pick}
                onClick={() => { if (pick) { onAssign(coach.id, Number(pick)); setPick(''); } }}>
                <UserPlus size={13} /> Asignar
              </button>
            </div>
          )}
          {full && <p style={{ fontSize: '.66rem', color: 'var(--gold-accent)', margin: '6px 0 0' }}>Grupo completo (6/6).</p>}
        </div>
      </div>
    </div>
  );
}
