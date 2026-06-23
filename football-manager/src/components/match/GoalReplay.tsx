// ─── GoalReplay — repetición del gol re-trazando chain[] (B18, cierra C7-UI) ──
// «Anatomía de la jugada»: re-traza la transición completa del gol sobre un 2D
// con el carril real (lane) de cada eslabón y el DUELO de atributos que lo
// decidió (atacante vs defensor con sus valores exactos del motor).
// Solo presentación: lee chain[] del timeline persistido, cero lógica de juego.
import { useEffect, useMemo, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Swords, ZoomIn } from 'lucide-react';
import { cn } from '../../lib/cn';
import { PlayerLink } from '../common/EntityLink';
import type { ChainLink, DuelSide, Lane, Team } from '../../types/engine';

interface Props {
  chain: ChainLink[];
  team: Team;            // equipo que marca (orienta el re-trazado)
  minute: number;
  teamName: string;
  homeColor: string;
  awayColor: string;
  onClose: () => void;
}

const STEP_LABEL: Record<string, string> = {
  recuperacion: 'RECUPERACIÓN',
  regate: 'REGATE',
  pase_clave: 'PASE CLAVE',
  remate: 'REMATE',
};
const ATTR_LABEL: Record<string, string> = {
  tackling: 'Entrada', organization: 'Organización', passing: 'Pase',
  dribbling: 'Regate', unmarking: 'Desmarque', finishing: 'Definición',
  shooting: 'Tiro', goalkeeping: 'Colocación', reflexes: 'Reflejos', fouls: 'Faltas',
};
const LANE_LABEL: Record<string, string> = { left: 'banda izquierda', center: 'centro', right: 'banda derecha' };

// Geometría del mini-campo (mismo aspecto que Pitch2D)
const W = 100, H = 64, CY = 32;
const LANE_Y: Record<Lane, number> = { left: 14, center: CY, right: 50 };

/** Posición de cada eslabón: avanza hacia la portería rival por su carril. */
function nodePos(chain: ChainLink[], i: number, team: Team) {
  const n = chain.length;
  // x progresa de campo propio (recuperación) al área (remate)
  const t = n > 1 ? i / (n - 1) : 1;
  const xHome = 28 + t * 60;                       // 28 → 88
  const x = team === 'home' ? xHome : W - xHome;
  const lane = (chain[i].lane ?? 'center') as Lane;
  // carril desde la perspectiva del atacante: away lo ve espejado
  const y = team === 'home' ? LANE_Y[lane] : LANE_Y[lane === 'left' ? 'right' : lane === 'right' ? 'left' : 'center'];
  return { x, y };
}

/** Proyección «tras la portería» (I5): segundo ÁNGULO. El gol queda abajo (cerca del
 *  espectador) y el campo recede hacia arriba con perspectiva (carriles que convergen).
 *  El equipo atacante avanza hacia abajo = hacia la portería. Determinista, sin random. */
function perspPos(chain: ChainLink[], i: number, team: Team) {
  const n = chain.length;
  const t = n > 1 ? i / (n - 1) : 1;     // 0 = inicio de la jugada, 1 = remate (más cerca del gol)
  const topY = 9, botY = 54;
  const y = topY + t * (botY - topY);    // recula hacia arriba; el remate cae abajo
  const halfFar = 11, halfNear = 41;     // los carriles se abren al acercarse (perspectiva)
  const half = halfFar + t * (halfNear - halfFar);
  const lane = (chain[i].lane ?? 'center') as Lane;
  let laneFrac = lane === 'left' ? -1 : lane === 'right' ? 1 : 0;
  if (team === 'away') laneFrac = -laneFrac;   // espejo del atacante visitante
  return { x: 50 + laneFrac * half, y };
}

function attrSum(side: DuelSide): number {
  return Object.values(side.attrs ?? {}).reduce((s, v) => s + (Number(v) || 0), 0);
}

function DuelCol({ side, color, winner, align }: { side: DuelSide; color: string; winner: boolean; align: 'left' | 'right' }) {
  const entries = Object.entries(side.attrs ?? {});
  return (
    <div className={cn('gr-duel-col', winner && 'is-winner')} style={{ textAlign: align }}>
      <p className="gr-duel-name" style={{ color }}>
        <PlayerLink id={Number(side.playerId) || null} name={side.name} />
        {side.position && <span className="gr-duel-pos"> · {side.position}</span>}
      </p>
      {entries.map(([k, v]) => (
        <div key={k} className="gr-attr" style={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
          <span className="gr-attr-l">{ATTR_LABEL[k] ?? k}</span>
          <span className="gr-attr-bar">
            <i style={{ width: `${Math.min(100, Number(v) || 0)}%`, background: color }} />
          </span>
          <b className="gr-attr-v">{Math.round(Number(v) || 0)}</b>
        </div>
      ))}
      <p className="gr-attr-sum">Σ {Math.round(attrSum(side))}</p>
    </div>
  );
}

export function GoalReplay({ chain, team, minute, teamName, homeColor, awayColor, onClose }: Props) {
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  // Con reduced-motion: arranca en el remate (sin auto-avance ni animaciones)
  const [idx, setIdx] = useState(reduced ? Math.max(0, chain.length - 1) : 0);
  const [auto, setAuto] = useState(!reduced);
  // I5 · multi-ÁNGULO (cenital / tras portería) y multi-NIVEL (zoom al remate decisivo).
  const [angle, setAngle] = useState<'cenital' | 'porteria'>('cenital');
  const [zoom, setZoom] = useState(false);

  // Auto-avance de la repetición (estilo moviola)
  useEffect(() => {
    if (!auto || reduced) return;
    if (idx >= chain.length - 1) { setAuto(false); return; }
    const t = setTimeout(() => setIdx(i => Math.min(chain.length - 1, i + 1)), 1750);
    return () => clearTimeout(t);
  }, [auto, idx, chain.length, reduced]);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (chain.length === 0) return null;
  const link = chain[idx];
  const atkColor = team === 'home' ? homeColor : awayColor;
  const defColor = team === 'home' ? awayColor : homeColor;
  const persp = angle === 'porteria';
  const positions = chain.map((_, i) => (persp ? perspPos(chain, i, team) : nodePos(chain, i, team)));
  const cur = positions[idx];
  // Portería de destino del remate por ángulo (cenital: lateral · perspectiva: abajo).
  const goalPt = persp ? { x: 50, y: 57 } : { x: team === 'home' ? W - 1.5 : 1.5, y: CY };
  // Multi-nivel: zoom al duelo DECISIVO (remate) + portería. Estable (no salta por paso).
  const last = positions[positions.length - 1];
  const viewBox = (() => {
    if (persp || !zoom) return `0 0 ${W} ${H}`;
    const bw = 48, bh = 36;
    let x = (last.x + goalPt.x) / 2 - bw / 2;
    let y = (last.y + goalPt.y) / 2 - bh / 2;
    x = Math.max(0, Math.min(W - bw, x));
    y = Math.max(0, Math.min(H - bh, y));
    return `${x.toFixed(1)} ${y.toFixed(1)} ${bw} ${bh}`;
  })();
  // def puede ser null (eslabón sin oposición directa)
  const attWins = link.def == null || attrSum(link.att) >= attrSum(link.def);

  return (
    <div className="gr" role="dialog" aria-label={`Repetición del gol de ${teamName} en el minuto ${minute}`}>
      <style>{GR_CSS}</style>

      <div className="gr-head">
        <span className="gr-tag">▶ REPETICIÓN</span>
        <span className="gr-title">{teamName} · {minute}'</span>
        <span className="gr-lane">{link.lane ? `por ${LANE_LABEL[link.lane] ?? link.lane}` : ''}</span>
        {/* I5 · selector de ángulo y nivel de la moviola */}
        <div className="gr-views" role="group" aria-label="Ángulo y zoom de la repetición">
          <button className={cn('gr-view', !persp && 'on')} onClick={() => setAngle('cenital')} aria-pressed={!persp} title="Plano cenital">Cenital</button>
          <button className={cn('gr-view', persp && 'on')} onClick={() => setAngle('porteria')} aria-pressed={persp} title="Tras la portería">Portería</button>
          <button className={cn('gr-view gr-view--icon', zoom && !persp && 'on')} onClick={() => setZoom(z => !z)} disabled={persp} aria-pressed={zoom && !persp} title="Zoom al remate decisivo"><ZoomIn size={13} /></button>
        </div>
        <button className="gr-x" onClick={onClose} aria-label="Cerrar repetición"><X size={15} /></button>
      </div>

      {/* Mini-campo con el re-trazado de la transición (ángulo cenital o tras-portería) */}
      <svg viewBox={viewBox} width="100%" className="gr-pitch" role="img" aria-label={`Re-trazado de la jugada (${persp ? 'tras la portería' : 'cenital'})`}>
        {persp ? (
          <g fill="none">
            {/* Campo en perspectiva: trapecio que converge arriba + portería abajo (cerca). */}
            <polygon points="39,9 61,9 91,54 9,54" stroke="color-mix(in srgb, var(--text-muted) 30%, transparent)" strokeWidth={0.3}
              fill="color-mix(in srgb, var(--green-primary) 6%, transparent)" />
            <line x1="39" y1="9" x2="61" y2="9" stroke="color-mix(in srgb, var(--text-muted) 25%, transparent)" strokeWidth={0.3} />
            <line x1="24" y1="31.5" x2="76" y2="31.5" stroke="color-mix(in srgb, var(--text-muted) 22%, transparent)" strokeWidth={0.25} />
            {/* Marco de portería en primer plano */}
            <rect x={30} y={53} width={40} height={6.5} stroke="color-mix(in srgb, var(--text-muted) 55%, transparent)" strokeWidth={0.5} />
            <line x1={30} y1={53} x2={30} y2={59.5} stroke="var(--text-muted)" strokeWidth={0.5} />
            <line x1={70} y1={53} x2={70} y2={59.5} stroke="var(--text-muted)" strokeWidth={0.5} />
          </g>
        ) : (
          <g stroke="color-mix(in srgb, var(--text-muted) 40%, transparent)" strokeWidth={0.3} fill="none">
            <rect x={1} y={1} width={W - 2} height={H - 2} />
            <line x1={50} y1={1} x2={50} y2={H - 1} />
            <circle cx={50} cy={CY} r={8} />
            <rect x={1} y={18} width={12} height={28} />
            <rect x={W - 13} y={18} width={12} height={28} />
          </g>
        )}

        {/* trazado completo (tenue) + tramo recorrido (vivo) */}
        <polyline
          points={positions.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={atkColor} strokeWidth={0.5} strokeDasharray="2 1.4" opacity={0.3}
        />
        <polyline
          key={`trace-${idx}`}
          className="gr-trace"
          points={positions.slice(0, idx + 1).map(p => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={atkColor} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round"
        />

        {/* remate: línea a portería (destino según el ángulo activo) */}
        {link.step === 'remate' && (
          <line key={`shot-${idx}`} className="gr-shot"
            x1={cur.x} y1={cur.y} x2={goalPt.x} y2={goalPt.y}
            stroke="var(--green-primary)" strokeWidth={0.55} strokeLinecap="round" />
        )}

        {/* nodos de la cadena */}
        {positions.map((p, i) => {
          const active = i === idx;
          const done = i < idx;
          return (
            <g key={i} style={{ cursor: 'pointer' }} onClick={() => { setAuto(false); setIdx(i); }}>
              {active && <circle className="gr-pulse" cx={p.x} cy={p.y} r={3.4} fill="none" stroke={atkColor} strokeWidth={0.5} />}
              <circle cx={p.x} cy={p.y} r={active ? 2.2 : 1.6}
                fill={done || active ? atkColor : 'var(--bg-elevated)'}
                stroke={atkColor} strokeWidth={0.4} opacity={done || active ? 1 : 0.55} />
              {/* defensor del eslabón, pegado al nodo (si lo hubo) */}
              {(done || active) && chain[i].def != null && (
                <circle cx={p.x + (team === 'home' ? 2.6 : -2.6)} cy={p.y + 2.1} r={1.3}
                  fill={defColor} stroke="rgba(0,0,0,.4)" strokeWidth={0.3} opacity={active ? 1 : 0.5} />
              )}
              <text x={p.x} y={p.y - 4} textAnchor="middle" fontSize={2.7}
                fill={active ? 'var(--text-primary)' : 'var(--text-muted)'}
                style={{ fontFamily: 'var(--font-sans)', fontWeight: 'bold', paintOrder: 'stroke', stroke: 'var(--bg-base)', strokeWidth: 0.6 }}>
                {STEP_LABEL[chain[i].step] ?? chain[i].step}
              </text>
              <title>{chain[i].text ?? STEP_LABEL[chain[i].step]}</title>
            </g>
          );
        })}
      </svg>

      {/* El duelo de atributos del eslabón actual */}
      <div className="gr-duel" key={`duel-${idx}`}>
        <div className="gr-duel-step">
          <Swords size={12} />
          <span>{STEP_LABEL[link.step] ?? link.step}</span>
          {link.text && <span className="gr-duel-txt">· {link.text}</span>}
        </div>
        <div className="gr-duel-grid">
          <DuelCol side={link.att} color={atkColor} winner={attWins} align="left" />
          <span className="gr-vs">VS</span>
          {link.def ? (
            <DuelCol side={link.def} color={defColor} winner={!attWins} align="right" />
          ) : (
            <div className="gr-duel-col" style={{ textAlign: 'right', alignSelf: 'center' }}>
              <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin oposición directa</p>
            </div>
          )}
        </div>
      </div>

      {/* Controles de moviola */}
      <div className="gr-ctrl">
        <button className="gr-b" onClick={() => { setAuto(false); setIdx(i => Math.max(0, i - 1)); }}
          disabled={idx === 0} aria-label="Eslabón anterior"><ChevronLeft size={14} /></button>
        <span className="gr-dots">
          {chain.map((_, i) => (
            <i key={i} className={cn(i === idx && 'on')} onClick={() => { setAuto(false); setIdx(i); }} />
          ))}
        </span>
        <button className="gr-b" onClick={() => { setAuto(false); setIdx(i => Math.min(chain.length - 1, i + 1)); }}
          disabled={idx >= chain.length - 1} aria-label="Eslabón siguiente"><ChevronRight size={14} /></button>
      </div>
    </div>
  );
}

const GR_CSS = `
.gr{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:var(--radius-retro);
  background:color-mix(in srgb,var(--bg-base) 92%,transparent);backdrop-filter:blur(4px);overflow:auto;animation:grIn .3s ease both}
@keyframes grIn{from{opacity:0}to{opacity:1}}
.gr-head{display:flex;align-items:center;gap:9px}
.gr-tag{font-family:var(--font-sans);font-weight:700;font-size:.65rem;letter-spacing:1px;padding:2px 7px;border-radius:3px;
  color:var(--red-danger);border:1px solid var(--red-danger);animation:grRec 1.4s steps(1) infinite}
@keyframes grRec{50%{opacity:.45}}
.gr-title{font-family:var(--font-display);font-weight:700;font-size:.88rem;color:var(--text-primary)}
.gr-lane{font-size:.7rem;color:var(--text-muted);font-style:italic}
.gr-views{margin-left:auto;display:flex;gap:3px;align-items:center}
.gr-view{font-family:var(--font-sans);font-size:.62rem;font-weight:700;letter-spacing:.04em;padding:3px 7px;border-radius:5px;cursor:pointer;
  background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-muted);display:grid;place-items:center;line-height:1}
.gr-view.on{background:color-mix(in srgb,var(--green-primary) 18%,transparent);border-color:var(--green-primary);color:var(--text-primary)}
.gr-view:disabled{opacity:.4;cursor:default}
.gr-view--icon{padding:3px 6px}
.gr-x{display:grid;place-items:center;width:26px;height:26px;border-radius:6px;cursor:pointer;
  background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-primary)}
.gr-pitch{flex:none;border-radius:var(--radius-retro);border:1px solid var(--border-color);max-height:46%;
  background:radial-gradient(120% 80% at 50% 0%, color-mix(in srgb,var(--green-primary) 8%, var(--bg-base)), var(--bg-base) 70%)}
.gr-trace{stroke-dasharray:200;stroke-dashoffset:200;animation:grTrace .8s ease-out forwards}
@keyframes grTrace{to{stroke-dashoffset:0}}
.gr-shot{stroke-dasharray:60;stroke-dashoffset:60;animation:grTrace .45s .3s ease-out forwards}
.gr-pulse{animation:grPulse 1.2s ease-in-out infinite}
@keyframes grPulse{0%,100%{r:3;opacity:.9}50%{r:4.2;opacity:.35}}
.gr-duel{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:var(--radius-retro);padding:8px 10px;animation:grIn .25s ease both}
.gr-duel-step{display:flex;align-items:center;gap:6px;font-family:var(--font-display);font-weight:700;font-size:.74rem;
  letter-spacing:1.2px;color:var(--gold-accent);margin-bottom:6px}
.gr-duel-txt{color:var(--text-muted);font-weight:400;letter-spacing:0;font-family:var(--font-sans);font-size:.7rem;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gr-duel-grid{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:start}
.gr-vs{font-family:var(--font-sans);font-weight:600;font-size:.7rem;color:var(--text-muted);align-self:center}
.gr-duel-col{min-width:0;opacity:.78;border-radius:6px;padding:4px 6px}
.gr-duel-col.is-winner{opacity:1;background:color-mix(in srgb,var(--green-primary) 7%,transparent)}
.gr-duel-name{font-size:.78rem;font-weight:700;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gr-duel-pos{color:var(--text-muted);font-weight:400;font-size:.64rem}
.gr-attr{display:flex;align-items:center;gap:6px;padding:1.5px 0}
.gr-attr-l{font-size:.62rem;color:var(--text-muted);min-width:64px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gr-attr-bar{flex:1;height:5px;border-radius:3px;background:var(--track-color);border:1px solid color-mix(in srgb,var(--border-color) 70%,transparent);overflow:hidden;min-width:30px}
.gr-attr-bar i{display:block;height:100%;border-radius:2px}
.gr-attr-v{font-family:var(--font-sans);font-weight:700;font-size:.7rem;min-width:20px;text-align:right}
.gr-attr-sum{font-family:var(--font-sans);font-weight:600;font-size:.65rem;color:var(--text-muted);margin-top:3px}
.gr-ctrl{display:flex;align-items:center;justify-content:center;gap:10px}
.gr-b{display:grid;place-items:center;width:26px;height:26px;border-radius:6px;cursor:pointer;
  background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-primary)}
.gr-b:disabled{opacity:.4;cursor:default}
.gr-dots{display:flex;gap:6px}
.gr-dots i{width:8px;height:8px;border-radius:50%;background:var(--bg-elevated);border:1px solid var(--border-color);cursor:pointer}
.gr-dots i.on{background:var(--green-primary);border-color:transparent}
@media(prefers-reduced-motion:reduce){.gr,.gr *{animation:none!important;transition:none!important}
  .gr-trace,.gr-shot{stroke-dashoffset:0!important}}
`;
