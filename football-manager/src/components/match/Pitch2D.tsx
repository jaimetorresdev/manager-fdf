// ─── Pitch2D v7 — broadcast cenital fluido, porterías con red y jugadores vivos ─
// Movimiento fluido (Catmull-Rom en pitchMovement) + jugadores con zancada/inclinación,
// dorsal estable, capitán, portero diferenciado y disco de identidad del portador.
// Porterías con red (el balón cruza la línea y entra), celebración de gol (flash +
// temblor + GOOOL + confeti), follow-spot del balón, banderines, gradas y clima.
import { useEffect, useMemo, useRef } from 'react';
import { computePitchFrame, GOAL, type PitchPlayer, type PlacedPlayer } from '../../lib/pitchMovement';
import { smoothDampAxis } from './broadcastCamera';
import type { TimelineEntry } from '../../types/engine';

export type { PitchPlayer };

interface ShotDot { x: number; y: number; team: 'home' | 'away'; goal?: boolean }
interface Props {
  step?: TimelineEntry;
  prevStep?: TimelineEntry;
  prev2Step?: TimelineEntry;
  nextStep?: TimelineEntry;
  stepIndex?: number;
  blend?: number;
  heatHome?: number[];
  heatAway?: number[];
  shots?: ShotDot[];
  showHeat?: boolean;
  showShots?: boolean;
  homePlayers?: PitchPlayer[];
  awayPlayers?: PitchPlayer[];
  homeColor?: string;
  awayColor?: string;
  showPlayers?: boolean;
  viewBox?: string;
  slowMo?: boolean;
  liveMotion?: boolean;
  reducedMotion?: boolean;
  weather?: string;
  momentum?: number;
  homeFormation?: string;
  awayFormation?: string;
  /** Zoom OBJETIVO de la cámara broadcast (1 = campo completo). El seguimiento del
   *  balón + suavizado se calcula aquí por frame; reemplaza el salto de viewBox. */
  camZoom?: number;
}

const W = 100, H = 64, CY = 32;
// Lienzo extendido: deja sitio tras las líneas de gol para las redes.
const VBX = -4, VBW = 108;
const BALL_R = 1.42;
// Distancia (Euclídea) por frame que marca un CORTE de realización (jugada nueva → origen
// local): por encima, la cámara CORTA en seco y el balón NO deja estela ni gira (C4). Un
// único umbral coherente para cámara + estela + giro (antes: cámara Manhattan>35 vs estela
// Euclídea<30, que dejaba colar "whooshes" en los cambios de posesión de medio campo).
const CUT_DIST = 22;
// Geometría de área/portería (líneas de gol en x=0 y x=100).
const PEN_W = 16.5, PEN_H = 40, PEN_Y = CY - PEN_H / 2;
const SIX_W = 5.5, SIX_H = 18, SIX_Y = CY - SIX_H / 2;
const SPOT_L = 11, SPOT_R = W - 11;
// Confeti determinista (sin Math.random — estable entre frames).
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  dx: ((i * 53) % 22) - 11,
  dy: -(2 + (i * 31) % 9),
  rot: (i * 47) % 360,
  fall: 7 + (i * 17) % 7,
  delay: ((i * 13) % 10) / 22,
  hue: i % 3,
}));


// ── Equipación del portero: color distinto de AMBOS equipos ───────────────────
const GK_PALETTE = ['#16f06a', '#f5c211', '#e83e8c', '#22d3ee', '#f97316', '#1f2937', '#a3e635'];
function toRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}
function colorDist(a: string, b: string): number {
  const ra = toRgb(a), rb = toRgb(b);
  if (!ra || !rb) return 1e6; // si alguno no es hex, no restringe
  return Math.hypot(ra[0] - rb[0], ra[1] - rb[1], ra[2] - rb[2]);
}
/** Elige el color de la paleta que MAXIMIZA la distancia mínima a los kits a evitar. */
function pickGkColor(avoid: string[]): string {
  let best = GK_PALETTE[0]!, bestScore = -1;
  for (const c of GK_PALETTE) {
    const score = Math.min(...avoid.map(a => colorDist(c, a)));
    if (score > bestScore) { bestScore = score; best = c; }
  }
  return best;
}

function SoccerBall({ x, y, z = 0, active, spin = 0, streak }: { x: number; y: number; z?: number; active?: boolean; spin?: number; streak?: { len: number; angle: number } | null }) {
  const scale = 1 + z * 0.18;
  const shadowY = 0.58 + z * 0.72;                         // la sombra se separa al elevarse
  const shadowScale = Math.max(0.45, 1 - z * 0.08);        // y encoge suave
  const shadowOpacity = Math.max(0.25, 0.9 - z * 0.5);     // gradiente suave (núcleo .36)

  return (
    <g className={['p2d-ball', active && 'p2d-ball--active'].filter(Boolean).join(' ')}
       transform={`translate(${x} ${y})`}>
      <ellipse className="p2d-ball-shadow" cx={0.32} cy={shadowY} rx={1.6 * shadowScale} ry={0.56 * shadowScale} fill="url(#p2d-soft-shadow)" opacity={shadowOpacity} />
      {streak && (
        <ellipse transform={`rotate(${streak.angle})`} cx={-streak.len / 2} cy={0}
                 rx={streak.len} ry={BALL_R * 0.7} fill="url(#p2d-streak)" opacity={Math.min(0.5, streak.len * 0.08)} pointerEvents="none" />
      )}
      {/* Balón premium 6-paneles (estilo Brazuca): esfera lustrosa con costuras que
          GIRAN bajo un brillo especular FIJO arriba-izquierda + AO de borde + tinte de cielo. */}
      <g transform={`translate(0 ${-z}) scale(${scale})`}>
        <circle r={BALL_R} fill="url(#p2d-ball-base)" />
        <g clipPath="url(#p2d-ball-clip)">
          {/* Costuras que giran: el ángulo lo ACUMULA el padre a partir de la distancia
              recorrida por el balón → la velocidad del giro sigue a la del balón (I1). */}
          <g className="p2d-ball-spin" transform={`rotate(${spin.toFixed(1)})`}>
            {/* Balón LIMPIO a juego con las fichas: pentágono tenue + costuras finas
                apenas insinuadas (lee como esfera nítida, no como Telstar recargado). */}
            <path d="M0,-0.78 L0.44,-0.46 L0.27,0.05 L-0.27,0.05 L-0.44,-0.46 Z" fill="#2b333f" opacity={0.4} />
            <g stroke="#2b333f" strokeWidth={0.075} strokeLinecap="round" fill="none" opacity={0.42}>
              <path d="M0,-0.78 L0,-1.32" />
              <path d="M0.44,-0.46 L1.04,-0.66" />
              <path d="M0.27,0.05 L0.72,0.56" />
              <path d="M-0.27,0.05 L-0.72,0.56" />
              <path d="M-0.44,-0.46 L-1.04,-0.66" />
            </g>
          </g>
        </g>
        <circle r={BALL_R} fill="url(#p2d-ball-rim)" pointerEvents="none" />
        <ellipse cx={-0.45} cy={-0.55} rx={0.46} ry={0.34} fill="url(#p2d-ball-spec)" pointerEvents="none" />
        <circle cx={-0.42} cy={-0.6} r={0.12} fill="#fff" opacity={0.85} pointerEvents="none" />
        {z > 0.01 && <circle r={BALL_R} fill="url(#p2d-ball-sky)" opacity={z * 0.25} pointerEvents="none" />}
        {active && <circle r={BALL_R + 0.35} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={0.12} className="p2d-ball-halo" />}
      </g>
    </g>
  );
}

// ── Portería con red (se dibuja dos veces, espejada) ─────────────────────────
function Goal({ side, scoring, scoredLane, color }: {
  side: 'home' | 'away'; scoring: boolean; scoredLane?: string | null; color: string;
}) {
  const flip = side === 'home' ? 1 : -1;
  const baseX = side === 'home' ? W : 0;
  const D = GOAL.NET_DEPTH, TOP = GOAL.POST_TOP, BOT = GOAL.POST_BOT, MH = BOT - TOP;
  const lane = scoredLane === 'left' || scoredLane === 'right' ? scoredLane : 'center';
  const cls = ['p2d-goal-unit', scoring && 'p2d-goal-unit--score', scoring && `p2d-goal--${lane}`].filter(Boolean).join(' ');
  return (
    <g className={cls} transform={`translate(${baseX} 0) scale(${flip} 1)`}>
      <rect className="p2d-net-tint" x={0.05} y={TOP} width={D - 0.1} height={MH} fill={color} opacity={0} />
      {/* Cavidad recesada (oscura) → la red se lee hundida tras la línea. */}
      <rect x={0.05} y={TOP} width={D - 0.1} height={MH} fill="rgba(8,20,10,.28)" />
      <path className="p2d-net-roof" d={`M0,${TOP} L${D},${TOP + 1.15} L${D},${BOT - 1.15} L0,${BOT} Z`} fill="url(#p2d-net-grad)" opacity={0.92} />
      <rect className="p2d-net-mesh" x={0.05} y={TOP} width={D - 0.1} height={MH} fill="url(#p2d-net-pattern)" />
      <line x1={0} y1={TOP} x2={D} y2={TOP + 1.15} stroke="url(#p2d-post)" strokeWidth={0.22} />
      <line x1={0} y1={BOT} x2={D} y2={BOT - 1.15} stroke="url(#p2d-post)" strokeWidth={0.22} />
      <line x1={D} y1={TOP + 1.15} x2={D} y2={BOT - 1.15} stroke="rgba(255,255,255,.5)" strokeWidth={0.12} />
      {/* Poste delantero: halo tenue ancho + poste nítido (sin filtro). */}
      <line x1={0} y1={TOP} x2={0} y2={BOT} stroke="rgba(214,255,224,.2)" strokeWidth={0.9} strokeLinecap="round" />
      <line x1={0} y1={TOP} x2={0} y2={BOT} stroke="url(#p2d-post)" strokeWidth={0.42} strokeLinecap="round" />
      <circle cx={0} cy={TOP} r={0.42} fill="#f4f7fa" stroke="#aeb6c0" strokeWidth={0.08} />
      <circle cx={0} cy={BOT} r={0.42} fill="#f4f7fa" stroke="#aeb6c0" strokeWidth={0.08} />
    </g>
  );
}

interface Celebrate { role: 'scorer' | 'mate' | 'slump'; cvx?: number; cvy?: number }
function PlayerFigure({
  p, color, gkColor, side, ball, index, reducedMotion, isCaptain, celebrate,
}: {
  p: PlacedPlayer;
  color: string;
  gkColor?: string;
  side: 'home' | 'away';
  ball: { x: number; y: number };
  index: number;
  reducedMotion?: boolean;
  isCaptain?: boolean;
  celebrate?: Celebrate | null;
}) {
  // Color de equipo (el portero, claramente distinto); dorsal; relleno top-lit.
  const kit = p.gk && gkColor ? gkColor : color;
  const num = p.number.toString();
  const gid = `jg-${side}-${index}`;
  const R = p.gk ? 1.62 : 1.45;                                  // radio de la ficha
  const stride = reducedMotion ? 0 : Math.max(0, Math.min(1, p.speed));
  const z = p.z ?? 0;                                            // elevación (estirada / cabezazo)
  // Estirada del portero (C4): el disco SE LANZA lateralmente hacia el balón (gkDiveY) en vez
  // de solo elevarse en el sitio; la peana lo acompaña y la muesca apunta a la estirada.
  const gkDive = !!(p.gk && (p.gkAction === 'dive' || p.gkAction === 'catch') && p.gkDiveY != null);
  const lungeY = gkDive ? Math.max(-3.4, Math.min(3.4, (p.gkDiveY as number) - p.y)) : 0;
  const lungeX = gkDive ? (side === 'home' ? 0.9 : -0.9) : 0;
  // Orientación de la ficha: portero en estirada mira al balón; si corre, al rumbo; si está
  // casi parada, mira al balón.
  const ang = gkDive
    ? Math.atan2(lungeY, lungeX)
    : (p.speed > 0.2 && !reducedMotion) ? p.heading : Math.atan2(ball.y - p.y, ball.x - p.x);
  const angDeg = (ang * 180 / Math.PI).toFixed(1);
  const ringColor = p.gk ? 'var(--teal-accent)' : 'rgba(255,255,255,.92)';
  const discFill = p.gk ? `color-mix(in srgb, ${kit} 88%, #000)` : `url(#${gid})`;
  const celClass = celebrate && !reducedMotion ? `p2d-cel p2d-cel--${celebrate.role}` : undefined;
  const celStyle = celebrate ? ({
    ['--cvx' as string]: String(celebrate.cvx ?? 0),
    ['--cvy' as string]: String(celebrate.cvy ?? 0),
    animationDelay: celebrate.role === 'mate' ? `${index * 55}ms` : '0ms',
  } as React.CSSProperties) : undefined;
  return (
    <g className="p2d-player" transform={`translate(${p.x} ${p.y})`}>
      {p.isCarrier && (
        <>
          <ellipse className="p2d-carrier-glow" cx={0} cy={0} rx={R + 1.0} ry={R + 0.6} fill="var(--gold-accent)" opacity={0.12} />
          <circle className="p2d-carrier-ring" cx={0} cy={0} r={R + 0.5}
                  fill="none" stroke="var(--gold-accent)" strokeWidth={0.16} opacity={0.9} strokeDasharray="0.8 0.6" />
        </>
      )}
      {/* Peana / sombra de contacto: se ESTIRA con la velocidad (en el sentido del rumbo)
          y se separa/aclara al elevarse (estirada del portero / cabezazo). */}
      <ellipse className="p2d-shadow" cx={0} cy={0} rx={R * 0.98} ry={R * 0.42 * (1 - z * 0.12)}
               transform={`translate(${(lungeX * 0.8).toFixed(2)} ${(0.32 + z * 1.4 + lungeY * 0.8).toFixed(2)}) rotate(${angDeg}) scale(${(1 + stride * 0.7).toFixed(2)},1)`}
               fill="url(#p2d-soft-shadow)" opacity={Math.max(0.18, 0.92 - z * 0.34)} />
      <g className={celClass} style={celStyle}>
        <g transform={`translate(${lungeX.toFixed(2)} ${(lungeY - z * 2.2).toFixed(2)})`}>
          {/* Ficha (disco táctico): borde/AO + relleno top-lit + bisel + anillo */}
          <circle r={R + 0.07} fill="rgba(0,0,0,.34)" />
          <circle r={R} fill={discFill} />
          <ellipse cx={-R * 0.3} cy={-R * 0.36} rx={R * 0.56} ry={R * 0.4} fill="rgba(255,255,255,.24)" pointerEvents="none" />
          <circle r={R} fill="none" stroke={ringColor} strokeWidth={p.gk ? 0.2 : 0.17} />
          {isCaptain && !p.gk && <circle r={R + 0.24} fill="none" stroke="var(--gold-accent)" strokeWidth={0.13} opacity={0.95} />}
          {p.isCarrier && <circle r={R} fill="none" stroke="var(--gold-accent)" strokeWidth={0.13} opacity={0.85} />}
          {/* Muesca de orientación (hacia dónde mira / corre) */}
          <g transform={`rotate(${angDeg})`}>
            <path d={`M${(R + 0.52).toFixed(2)},0 L${(R - 0.22).toFixed(2)},-0.46 L${(R - 0.22).toFixed(2)},0.46 Z`}
                  fill={ringColor} stroke="rgba(0,0,0,.32)" strokeWidth={0.04} />
          </g>
          {/* Dorsal grande y legible (el disco no vuelca → sin doble-flip) */}
          <text x={0} y={0.52} textAnchor="middle" fontSize={1.5} fontWeight={900}
                fill="#fff" stroke="rgba(0,0,0,.55)" strokeWidth={0.13} paintOrder="stroke"
                style={{ fontFamily: 'var(--font-sans)' }}>{num}</text>
        </g>
      </g>
      <title>{`${p.name}${p.rating != null ? ` · ${p.rating.toFixed(1)}` : ''}`}</title>
    </g>
  );
}

function PitchMarkings() {
  const arc = (spotX: number, dir: 1 | -1) => {
    const boxEdge = dir === 1 ? PEN_W : W - PEN_W;
    const r = 9;
    const dx = Math.abs(boxEdge - spotX);
    if (dx >= r) return null;
    const dy = Math.sqrt(r * r - dx * dx);
    const sweep = dir === 1 ? 1 : 0;
    return `M ${boxEdge} ${CY - dy} A ${r} ${r} 0 0 ${sweep} ${boxEdge} ${CY + dy}`;
  };
  // Trazos (sin relleno) dibujados DOS veces: un halo ancho y tenue + la línea nítida.
  // Reemplaza el feGaussianBlur (que se re-rasterizaba con el zoom de cámara) por un
  // "double-stroke bloom" sin filtro → floodlit y a 60fps incluso con zoom.
  const lines = (
    <>
      <rect x={0} y={2} width={W} height={H - 4} />
      <line x1={50} y1={2} x2={50} y2={H - 2} />
      <circle cx={50} cy={CY} r={9} />
      <rect x={0} y={PEN_Y} width={PEN_W} height={PEN_H} />
      <rect x={W - PEN_W} y={PEN_Y} width={PEN_W} height={PEN_H} />
      <rect x={0} y={SIX_Y} width={SIX_W} height={SIX_H} />
      <rect x={W - SIX_W} y={SIX_Y} width={SIX_W} height={SIX_H} />
      <path d={arc(SPOT_L, 1) ?? ''} />
      <path d={arc(SPOT_R, -1) ?? ''} />
      <path d={`M ${1.4} 2 A 1.4 1.4 0 0 1 0 ${3.4}`} />
      <path d={`M 0 ${H - 3.4} A 1.4 1.4 0 0 1 ${1.4} ${H - 2}`} />
      <path d={`M ${W - 1.4} 2 A 1.4 1.4 0 0 0 ${W} ${3.4}`} />
      <path d={`M ${W} ${H - 3.4} A 1.4 1.4 0 0 0 ${W - 1.4} ${H - 2}`} />
    </>
  );
  return (
    <g className="p2d-lines" fill="none" strokeLinejoin="round">
      <g stroke="rgba(222,240,228,.09)" strokeWidth={0.5} strokeLinecap="round">{lines}</g>
      <g stroke="#e9f3ec" strokeWidth={0.2} strokeLinecap="round">{lines}</g>
      <circle cx={50} cy={CY} r={0.42} fill="rgba(255,255,255,.82)" />
      <circle cx={SPOT_L} cy={CY} r={0.38} fill="rgba(255,255,255,.78)" />
      <circle cx={SPOT_R} cy={CY} r={0.38} fill="rgba(255,255,255,.78)" />
    </g>
  );
}

function CornerFlag({ x, y, color, top }: { x: number; y: number; color: string; top: boolean }) {
  const dirY = top ? 1 : -1;
  return (
    <g className="p2d-cornerflag" transform={`translate(${x} ${y})`}>
      <line x1={0} y1={0} x2={0} y2={dirY * -2.4} stroke="#e5e7eb" strokeWidth={0.12} />
      <path className="p2d-flag" d={`M0,${dirY * -2.4} L${1.6},${dirY * -2.0} L0,${dirY * -1.6} Z`} fill={color} opacity={0.92} />
    </g>
  );
}

export function Pitch2D({
  step, prevStep, prev2Step, nextStep, stepIndex = 0, blend = 1, heatHome = [], heatAway = [], shots = [],
  showHeat, showShots, homePlayers = [], awayPlayers = [], homeColor = 'var(--green-primary)',
  awayColor = 'var(--blue-info)', showPlayers = true, viewBox, slowMo = false, liveMotion = false,
  reducedMotion = false, weather, momentum = 50, homeFormation, awayFormation, camZoom = 1,
}: Props) {
  const frame = useMemo(
    () => computePitchFrame(step, prevStep, prev2Step, nextStep, stepIndex, blend, homePlayers, awayPlayers, homeFormation, awayFormation),
    [step, prevStep, prev2Step, nextStep, stepIndex, blend, homePlayers, awayPlayers, homeFormation, awayFormation],
  );
  const { ball, home, away } = frame;

  const carrier = useMemo(() => [...home, ...away].find(p => p.isCarrier) ?? null, [home, away]);

  // Equipación de portero: distinta de ambos equipos (y entre porteros).
  const gkColors = useMemo(() => {
    const home = pickGkColor([homeColor, awayColor]);
    const away = pickGkColor([homeColor, awayColor, home]);
    return { home, away };
  }, [homeColor, awayColor]);

  // Capitán: mejor valorado de campo por equipo (estable, no por frame).
  const captainIds = useMemo(() => {
    const cap = (rs: PitchPlayer[]) => rs.slice(0, 11).filter(p => (p.position ?? '') !== 'POR')
      .reduce<PitchPlayer | null>((b, p) => (p.rating ?? 0) > (b?.rating ?? -1) ? p : b, null);
    return { home: cap(homePlayers)?.playerId ?? null, away: cap(awayPlayers)?.playerId ?? null };
  }, [homePlayers, awayPlayers]);

  const lastBall = useRef({ x: 50, y: CY });
  // Giro del balón ACOPLADO a su velocidad (I1): se acumula el ángulo a partir de la
  // distancia real recorrida (deg/u), una sola vez por frame confirmado en el efecto.
  // Determinista por cadencia (como la cámara); sin Math.random.
  const spinRef = useRef(0);
  const SPIN_DEG_PER_UNIT = 40;
  // Velocidad del balón (estela + look-ahead de cámara). lastBall se actualiza en el efecto.
  const vdx = ball.x - lastBall.current.x, vdy = ball.y - lastBall.current.y;
  const vmag = Math.hypot(vdx, vdy);
  const streak = liveMotion && vmag > 0.6 && vmag < CUT_DIST
    ? { len: Math.min(6, vmag * 1.1), angle: Math.atan2(vdy, vdx) * 180 / Math.PI } : null;
  const ballSpin = reducedMotion ? 0 : spinRef.current;
  useEffect(() => {
    if (!ball.on) return;
    const ex = ball.x - lastBall.current.x, ey = ball.y - lastBall.current.y;
    const dx = Math.abs(ex) + Math.abs(ey);
    if (dx > 0.12) {
      // Avanza el giro solo en juego en vivo y descartando los saltos de corte de
      // jugada (dist >= 30 = teletransporte de realización), igual que la estela.
      const dist = Math.hypot(ex, ey);
      if (liveMotion && dist < CUT_DIST) spinRef.current = (spinRef.current + dist * SPIN_DEG_PER_UNIT) % 360;
      lastBall.current = { x: ball.x, y: ball.y };
    }
  }, [ball.x, ball.y, ball.on, liveMotion]);

  const key = step ? `${stepIndex}-${step.minute}-${step.phase}` : 'none';
  const isGoal = step?.phase === 'gol';
  const isShot = step?.phase === 'remate';
  const fastBall = isGoal || isShot || step?.phase === 'parada';
  const card = step?.phase === 'falta' ? (/roja|expuls/i.test(step.text) ? 'red' : /amarilla|tarjeta/i.test(step.text) ? 'yellow' : null) : null;
  const possTeam = step?.team;
  const ballInNet = !!(isGoal && ball.on && (ball.x > W - 0.5 || ball.x < 0.5));
  const weatherKind = useMemo(() => {
    const w = (weather ?? '').toLowerCase();
    if (/lluv|rain|🌧|🌦/.test(w)) return 'rain';
    if (/niev|snow|❄/.test(w)) return 'snow';
    return null;
  }, [weather]);
  const possGlow = 0.05 + Math.abs(momentum - 50) / 50 * 0.07;

  // ── Cámara broadcast suave: sigue al balón (zona muerta + look-ahead + muelle) ─
  // El zoom OBJETIVO llega como prop; aquí se persigue el balón en vivo y se suaviza
  // con SmoothDamp. Reemplaza el salto de viewBox por un transform en <g.p2d-cam>.
  // A zoom=1 el centro queda forzado a (50,32) → transform identidad (campo completo).
  const camRef = useRef({ x: 50, y: 32, z: 1, vx: 0, vy: 0, vz: 0, lx: 0, ly: 0, wasLive: 0, trauma: 0, shakeN: 0, netArmed: 0, impArmed: 0 });
  const camTransform = (() => {
    const c = camRef.current;
    if (reducedMotion) { c.x = 50; c.y = 32; c.z = 1; c.vx = c.vy = c.vz = c.lx = c.ly = 0; c.wasLive = 0; c.trauma = 0; return ''; }
    const targetZ = Math.max(1, Math.min(1.35, camZoom || 1));
    const fast = isGoal || isShot || step?.phase === 'parada';
    // ── Screen-shake por TRAUMA (I3) ──────────────────────────────────────────
    // Acumulador trauma∈[0,1] que DECAE cada frame; el desplazamiento (más abajo)
    // = trauma² · ruido, así un toque flojo apenas tiembla y un golpe contundente
    // sacude. Se "patea" en el flanco del impacto: el GOL (balón en la red) fuerte;
    // remate/parada más leve y ESCALADO por la velocidad real del balón (proxy de
    // potencia). dt fijo 1/60 y ruido determinista (sin Math.random) → reproducible.
    c.trauma = Math.max(0, c.trauma - 1.7 / 60);
    if (ballInNet) { if (!c.netArmed) { c.trauma = Math.min(1, Math.max(c.trauma, 0.9)); c.netArmed = 1; } }
    else c.netArmed = 0;
    const striking = isShot || step?.phase === 'parada';
    if (striking && liveMotion && vmag > 3) {
      if (!c.impArmed) { c.trauma = Math.min(1, Math.max(c.trauma, Math.min(0.6, 0.3 + vmag * 0.04))); c.impArmed = 1; }
    } else if (!striking || vmag <= 2) c.impArmed = 0;
    if (c.trauma > 0) c.shakeN++;
    // Corte de jugada: si el balón SALTA (cambio de jugada → origen local), la cámara
    // CORTA en seco (corte de realización) en vez de hacer un barrido largo.
    const cut = Math.hypot(vdx, vdy) > CUT_DIST;
    // Suavizar también el corte natural entre eventos (blend 1→0): se ENCAJA directo
    // en pausa/scrub real (frame anterior tampoco en juego) o en un corte de jugada.
    const smooth = (liveMotion || c.wasLive === 1) && !cut;
    c.wasLive = liveMotion ? 1 : 0;
    // Look-ahead = velocidad del balón paso-bajo (acotada para que un corte no la dispare).
    const vlx = Math.max(-6, Math.min(6, Number.isFinite(vdx) ? vdx : 0));
    const vly = Math.max(-6, Math.min(6, Number.isFinite(vdy) ? vdy : 0));
    c.lx += (vlx - c.lx) * 0.18;
    c.ly += (vly - c.ly) * 0.18;
    const leadX = Math.max(-18, Math.min(18, c.lx * 7));
    const leadY = Math.max(-9, Math.min(9, c.ly * 7));
    let tx = (ball.on ? ball.x : 50) + leadX;
    let ty = (ball.on ? ball.y : CY) + leadY;
    // Zona muerta: el balón cerca del centro no mueve la cámara (estabilidad).
    const dzx = fast ? 6 : 13, dzy = fast ? 4 : 8;
    const ex = tx - c.x, ey = ty - c.y;
    tx = c.x + Math.sign(ex) * Math.max(0, Math.abs(ex) - dzx);
    ty = c.y + Math.sign(ey) * Math.max(0, Math.abs(ey) - dzy);
    if (!smooth) {
      c.z = targetZ; c.x = tx; c.y = ty; c.vx = c.vy = c.vz = 0;
      if (cut) c.lx = c.ly = 0;   // jugada nueva → sin sesgo de adelanto heredado
    } else {
      // dt fijo ≈ 60fps (la cadencia de render = el rAF de MatchCenter); mantiene la
      // pureza del render (sin reloj) — el suavizado de cámara no exige dt real.
      const dt = 1 / 60;
      const st = fast ? 0.2 : 0.42;
      const vz = { v: c.vz }; c.z = smoothDampAxis(c.z, targetZ, vz, st * 1.5, dt); c.vz = vz.v;
      const vx = { v: c.vx }; c.x = smoothDampAxis(c.x, tx, vx, st, dt); c.vx = vx.v;
      const vy = { v: c.vy }; c.y = smoothDampAxis(c.y, ty, vy, st, dt); c.vy = vy.v;
    }
    // Red de seguridad: nunca dejar que un valor no finito propague (transform NaN
    // ocultaría todo el campo). Recupera al centro/campo completo.
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) {
      c.x = 50; c.y = CY; c.z = 1; c.vx = c.vy = c.vz = c.lx = c.ly = 0;
    }
    // Clamp del centro por el zoom: el campo SIEMPRE llena el cuadro (sin descubrir fondo).
    const z = Math.max(1, c.z);
    const mx = VBW / 2 / z, my = H / 2 / z;
    c.x = Math.max(VBX + mx, Math.min(VBX + VBW - mx, c.x));
    c.y = Math.max(my, Math.min(H - my, c.y));
    if (z <= 1.0008) return '';
    return `translate(${(50 - z * c.x).toFixed(3)} ${(CY - z * c.y).toFixed(3)}) scale(${z.toFixed(4)})`;
  })();

  // Transform del temblor (I3): se aplica a .p2d-shakeable (dentro de la cámara) para
  // que sacude el campo aunque el zoom sea 1 (wide). Ruido suave = suma de senos a
  // frecuencias incomensurables sobre un contador de frames (determinista, sin random).
  // Rotación acotada a ≤2.6° (<0.05 rad). reduced-motion → sin temblor.
  const shakeTransform = (() => {
    const c = camRef.current;
    if (reducedMotion || c.trauma <= 0.0008) return '';
    const tr = c.trauma * c.trauma;          // trauma² → suave abajo, contundente arriba
    const n = c.shakeN;
    const noise = (k: number) => Math.sin((n + k) * 1.7) * 0.6 + Math.sin((n + k) * 0.97) * 0.4; // ∈[-1,1]
    const sx = (tr * 0.85 * noise(0)).toFixed(3);
    const sy = (tr * 0.85 * noise(37)).toFixed(3);
    const srot = (tr * 2.6 * noise(71)).toFixed(3); // grados; |srot| ≤ 2.6°
    return `translate(${sx} ${sy}) rotate(${srot} 50 ${CY})`;
  })();

  // Coreografía de gol (sin chocar con los transforms de posición/pose): el goleador
  // RUGE, sus compañeros CONVERGEN hacia él (escalonado) y el rival batido se HUNDE.
  const celebrating = isGoal && ball.on && !!carrier;
  const celebFor = (p: PlacedPlayer, sideKey: 'home' | 'away'): Celebrate | null => {
    if (!celebrating || !carrier) return null;
    if (p === carrier) return { role: 'scorer' };
    const onScoring = sideKey === possTeam;
    if (onScoring && !p.gk) {
      const dx = carrier.x - p.x, dy = carrier.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const mag = Math.min(2, d * 0.22);
      return { role: 'mate', cvx: +(dx / d * mag).toFixed(2), cvy: +(dy / d * mag).toFixed(2) };
    }
    if (!onScoring && (p.duelRole === 'beaten' || p.gk)) return { role: 'slump' };
    return null;
  };

  const renderPlaced = (placed: typeof home, color: string, sideKey: 'home' | 'away', capId: string | null, gkColor: string) =>
    placed.map((p, i) => (
      <PlayerFigure key={`${sideKey}-${p.playerId ?? p.name}-${i}`} p={p} color={color} gkColor={gkColor} side={sideKey} ball={ball} index={i}
                    reducedMotion={reducedMotion} isCaptain={capId != null && String(p.playerId) === String(capId)} celebrate={celebFor(p, sideKey)} />
    ));

  const jerseyGrad = (id: string, col: string) => (
    <linearGradient key={id} id={id} x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stopColor={`color-mix(in srgb, ${col} 72%, white)`} />
      <stop offset="50%" stopColor={col} />
      <stop offset="100%" stopColor={`color-mix(in srgb, ${col} 78%, black)`} />
    </linearGradient>
  );

  return (
    <svg viewBox={viewBox ?? `${VBX} 0 ${VBW} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
         role="img" aria-label="Campo de juego"
         className={['p2d', isGoal && 'p2d--goal', isShot && 'p2d--shot', ballInNet && 'p2d--net', slowMo ? 'p2d--slow' : '', liveMotion ? 'p2d--live' : ''].filter(Boolean).join(' ')}>
      <style>{P2D_CSS}</style>

      <defs>
        {home.map((_, i) => jerseyGrad(`jg-home-${i}`, homeColor))}
        {away.map((_, i) => jerseyGrad(`jg-away-${i}`, awayColor))}
        <radialGradient id="p2d-grass-base" cx="50%" cy="46%" r="94%">
          <stop offset="0%" stopColor="var(--pitch-grass-a, #2b7536)" />
          <stop offset="62%" stopColor="var(--pitch-grass-b, #287234)" />
          <stop offset="100%" stopColor="var(--pitch-grass-c, #22652d)" />
        </radialGradient>
        {/* Sombra suave compartida (sin filtros): un único gradiente para los 23 contactos. */}
        <radialGradient id="p2d-soft-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(0,0,0,.36)" />
          <stop offset="55%" stopColor="rgba(0,0,0,.20)" />
          <stop offset="80%" stopColor="rgba(0,0,0,.07)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <linearGradient id="p2d-grass-sheen" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(255,255,255,.07)" />
          <stop offset="50%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(0,0,0,.06)" />
        </linearGradient>
        <linearGradient id="p2d-depth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(0,0,0,.16)" />
          <stop offset="34%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(255,255,255,.05)" />
        </linearGradient>
        {/* Luz global única: el fondo (lejos) queda en sombra, el frente capta luz. */}
        <linearGradient id="p2d-litdepth" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="rgba(0,0,0,.12)" />
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(255,255,255,.07)" />
        </linearGradient>
        {/* Balón premium 6-paneles: caída esférica + AO de borde + brillo especular + tinte de cielo. */}
        <radialGradient id="p2d-ball-base" cx="32%" cy="28%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="22%" stopColor="#f6f7f9" />
          <stop offset="55%" stopColor="#e3e6ea" />
          <stop offset="82%" stopColor="#c2c7cf" />
          <stop offset="100%" stopColor="#9aa0aa" />
        </radialGradient>
        <radialGradient id="p2d-ball-rim" cx="50%" cy="50%" r="50%">
          <stop offset="62%" stopColor="rgba(0,0,0,0)" />
          <stop offset="82%" stopColor="rgba(0,0,0,.07)" />
          <stop offset="100%" stopColor="rgba(0,0,0,.28)" />
        </radialGradient>
        <radialGradient id="p2d-ball-spec" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,.92)" />
          <stop offset="45%" stopColor="rgba(255,255,255,.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
        <radialGradient id="p2d-ball-sky" cx="50%" cy="50%" r="50%">
          <stop offset="30%" stopColor="rgba(214,230,255,0)" />
          <stop offset="100%" stopColor="rgba(214,230,255,.5)" />
        </radialGradient>
        <clipPath id="p2d-ball-clip"><circle r={BALL_R} /></clipPath>
        <linearGradient id="p2d-streak" x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="100%" stopColor="rgba(255,255,255,.55)" />
        </linearGradient>
        <radialGradient id="p2d-ballspot" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,245,.16)" />
          <stop offset="60%" stopColor="rgba(255,255,245,.05)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <pattern id="p2d-net-pattern" width="0.8" height="0.8" patternUnits="userSpaceOnUse">
          <path d="M0,0 L0.8,0.8 M0.8,0 L0,0.8" stroke="rgba(255,255,255,.5)" strokeWidth="0.07" fill="none" />
        </pattern>
        <linearGradient id="p2d-net-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,.12)" />
          <stop offset="100%" stopColor="rgba(0,0,0,.32)" />
        </linearGradient>
        <linearGradient id="p2d-post" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" /><stop offset="50%" stopColor="#e8edf2" /><stop offset="100%" stopColor="#aeb6c0" />
        </linearGradient>
        <pattern id="p2d-stand" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <rect width="2.4" height="2.4" fill="rgba(10,16,24,.9)" />
          <circle cx="0.7" cy="0.7" r="0.22" fill="rgba(255,255,255,.10)" />
          <circle cx="1.8" cy="1.5" r="0.22" fill="rgba(255,255,255,.07)" />
        </pattern>
        <linearGradient id="p2d-stand-fade-l" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,0,0,.5)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </linearGradient>
        <linearGradient id="p2d-stand-fade-r" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(0,0,0,0)" /><stop offset="100%" stopColor="rgba(0,0,0,.5)" />
        </linearGradient>
        <radialGradient id="p2d-vignette" cx="50%" cy="46%" r="86%">
          <stop offset="72%" stopColor="transparent" />
          <stop offset="100%" stopColor="rgba(4,20,8,.16)" />
        </radialGradient>
        <radialGradient id="p2d-flood" cx="50%" cy="-8%" r="95%">
          <stop offset="0%" stopColor="rgba(255,255,255,.22)" />
          <stop offset="40%" stopColor="rgba(255,255,255,.08)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <pattern id="p2d-mow" width="10.8" height={H} patternUnits="userSpaceOnUse">
          <rect width="5.4" height={H} fill="rgba(255,255,255,.05)" />
          <rect x={5.4} width="5.4" height={H} fill="rgba(0,0,0,.07)" />
        </pattern>
        {/* Estadio: textura de césped, charcos de foco y valla de publicidad */}
        <filter id="p2d-grass-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7 0.7" numOctaves="2" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.6 0" />
        </filter>
        <radialGradient id="p2d-floodpool" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,250,.05)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <pattern id="p2d-adboard" width="5" height="1.3" patternUnits="userSpaceOnUse">
          <rect width="5" height="1.3" fill="rgba(8,12,18,.88)" />
          <rect x={0.35} y={0.28} width={4.3} height={0.74} rx={0.1} fill="rgba(255,255,255,.07)" />
          <rect x={0.35} y={0.28} width={1.4} height={0.74} rx={0.1} fill="color-mix(in srgb, var(--gold-accent) 30%, transparent)" />
        </pattern>
      </defs>

      {/* Cámara broadcast: todo el "mundo" (campo, jugadores, balón) pana/zooma como
          un grupo; los rótulos (GOOOL), clima y viñeta quedan fijos a la pantalla. */}
      <g className="p2d-cam" transform={camTransform}>

      {/* Gradas tras las porterías (profundidad de estadio) */}
      <rect x={VBX} y={0} width={-VBX} height={H} fill="url(#p2d-stand)" />
      <rect x={VBX} y={0} width={-VBX} height={H} fill="url(#p2d-stand-fade-r)" />
      <rect x={W} y={0} width={VBW + VBX - W} height={H} fill="url(#p2d-stand)" />
      <rect x={W} y={0} width={VBW + VBX - W} height={H} fill="url(#p2d-stand-fade-l)" />

      {/* Césped: base + rayas de corte goal-a-goal (sin bandas horizontales que las ensucien) */}
      <rect x={0} y={0} width={W} height={H} fill="url(#p2d-grass-base)" />
      <rect x={VBX} y={0} width={VBW} height={H} fill="url(#p2d-mow)" opacity={0.42} />
      {/* Anillo de corte del jardinero (sutil, un solo aro) + desgaste en puntos clave */}
      <circle cx={50} cy={CY} r={12} fill="none" stroke="rgba(255,255,255,.035)" strokeWidth={3.2} />
      <ellipse cx={SPOT_L} cy={CY} rx={3} ry={2.4} fill="rgba(0,0,0,.05)" />
      <ellipse cx={SPOT_R} cy={CY} rx={3} ry={2.4} fill="rgba(0,0,0,.05)" />
      <ellipse cx={50} cy={CY} rx={4} ry={3} fill="rgba(0,0,0,.04)" />
      <rect x={0} y={0} width={W} height={H} fill="url(#p2d-grass-sheen)" pointerEvents="none" />
      <rect x={0} y={0} width={W} height={H} fill="url(#p2d-depth)" pointerEvents="none" />
      <rect x={0} y={0} width={W} height={H} fill="url(#p2d-litdepth)" pointerEvents="none" />
      {/* Charcos de foco (estadio) */}
      {[[14, 10], [86, 10], [14, 54], [86, 54]].map(([cx, cy], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={30} ry={20} fill="url(#p2d-floodpool)" pointerEvents="none" className="p2d-floodpool" />
      ))}

      <PitchMarkings />

      {/* Vallas de publicidad tras las líneas de banda */}
      <rect x={2} y={0.5} width={W - 4} height={1.1} fill="url(#p2d-adboard)" opacity={0.9} pointerEvents="none" />
      <rect x={2} y={H - 1.6} width={W - 4} height={1.1} fill="url(#p2d-adboard)" opacity={0.9} pointerEvents="none" />

      {/* Banderines de córner */}
      <CornerFlag x={0} y={2} color={homeColor} top />
      <CornerFlag x={0} y={H - 2} color={homeColor} top={false} />
      <CornerFlag x={W} y={2} color={awayColor} top />
      <CornerFlag x={W} y={H - 2} color={awayColor} top={false} />

      {/* Iluminación de estadio */}
      <rect className="p2d-sweep" x={VBX} y={0} width={VBW} height={H} fill="url(#p2d-flood)" pointerEvents="none" />

      {possTeam && showPlayers && (
        <rect className="p2d-poss-glow"
              x={possTeam === 'home' ? 0 : 50} y={2}
              width={50} height={H - 4} rx={0.5}
              fill={possTeam === 'home' ? homeColor : awayColor} opacity={possGlow} />
      )}

      {isGoal && <rect x={VBX} y={0} width={VBW} height={H} className="p2d-goal-flash" fill="var(--green-primary)" pointerEvents="none" />}
      {isShot && !isGoal && <rect x={VBX} y={0} width={VBW} height={H} className="p2d-shot-flash" fill="var(--blue-info)" pointerEvents="none" />}

      {showHeat && [['home', heatHome, homeColor], ['away', heatAway, awayColor]].map(
        ([team, heat, col]) => (heat as number[]).map((v, z) => {
          const left = team === 'home';
          const x = left ? z * (50 / (heat as number[]).length) : 50 + z * (50 / (heat as number[]).length);
          return <rect key={`${team}-${z}`} x={x} y={2} width={50 / (heat as number[]).length} height={H - 4}
                       fill={col as string} opacity={Math.min(0.28, (v as number) * 0.28)} />;
        }))}

      {showShots && shots.map((s, i) => (
        <g key={i}>
          <circle cx={s.x} cy={s.y} r={s.goal ? 2 : 1.2} fill={s.goal ? 'var(--green-primary)' : 'none'}
                  stroke={s.team === 'home' ? homeColor : awayColor} strokeWidth={0.4} opacity={0.85} />
        </g>
      ))}

      <Goal side="home" color={homeColor} scoring={ballInNet && possTeam === 'home'} scoredLane={step?.lane} />
      <Goal side="away" color={awayColor} scoring={ballInNet && possTeam === 'away'} scoredLane={step?.lane} />

      {/* Follow-spot del balón (charco de luz sobre el césped) */}
      {ball.on && (
        <g className={['p2d-ballspot-g', fastBall && 'p2d-ballspot-g--hot'].filter(Boolean).join(' ')} transform={`translate(${ball.x} ${ball.y})`} pointerEvents="none">
          <circle r={22} fill="url(#p2d-ballspot)" />
        </g>
      )}

      {/* Grupo que tiembla en el gol (cámara) — solo jugadores, balón y efectos de gol;
          sin líneas de telestración (cadena/flecha/tether/arcos) para una vista limpia. */}
      <g className="p2d-shakeable" transform={shakeTransform || undefined}>
        {showPlayers && renderPlaced(home, homeColor, 'home', captainIds.home, gkColors.home)}
        {showPlayers && renderPlaced(away, awayColor, 'away', captainIds.away, gkColors.away)}

        {ballInNet && (
          <g key={`g-${key}`} className="p2d-goal-shockwave" transform={`translate(${ball.x} ${ball.y})`}>
            <circle cx={0} cy={0} r={2} className="p2d-ring p2d-ring-1" />
            <circle cx={0} cy={0} r={2} className="p2d-ring p2d-ring-2" />
            <circle cx={0} cy={0} r={2} className="p2d-ring p2d-ring-3" />
          </g>
        )}

        {card && ball.on && (
          <g key={`c-${key}`} className="p2d-card" transform={`translate(${ball.x + 2} ${ball.y - 4})`}>
            <rect width={2.2} height={3.2} rx={0.35} y={-3.2}
                  fill={card === 'red' ? 'var(--red-danger)' : 'var(--gold-accent)'}
                  stroke="rgba(0,0,0,.4)" strokeWidth={0.15} />
          </g>
        )}

        {ball.on && <SoccerBall x={ball.x} y={ball.y} z={(ball as any).z ?? 0} active={carrier != null} spin={ballSpin} streak={streak} />}

        {ballInNet && (
          <rect className="p2d-net-front"
                x={possTeam === 'home' ? W : VBX + 0.6} y={GOAL.POST_TOP}
                width={possTeam === 'home' ? GOAL.NET_DEPTH : -VBX - 0.6}
                height={GOAL.POST_BOT - GOAL.POST_TOP} fill="url(#p2d-net-pattern)" opacity={0.5} pointerEvents="none" />
        )}

        {/* Confeti + foco del goleador */}
        {ballInNet && carrier && (
          <g key={`cf-${key}`} className="p2d-celebrate" pointerEvents="none">
            <ellipse className="p2d-scorer-spot" cx={carrier.x} cy={carrier.y + 0.4} rx={3} ry={2} fill="url(#p2d-ballspot)" />
            {CONFETTI.map((c, i) => (
              <rect key={i} className="p2d-confetto" x={carrier.x + c.dx * 0.18} y={carrier.y + c.dy}
                    width={0.5} height={0.8} rx={0.1}
                    fill={c.hue === 0 ? (possTeam === 'home' ? homeColor : awayColor) : c.hue === 1 ? 'var(--gold-accent)' : '#fff'}
                    style={{ ['--cx' as string]: `${c.dx * 0.5}`, ['--cy' as string]: `${c.fall}`, ['--rot' as string]: `${c.rot}deg`, animationDelay: `${c.delay}s` }} />
            ))}
          </g>
        )}

      </g>
      </g>{/* /p2d-cam */}

      {/* Fogonazo blanco del gol (espacio de pantalla, una sola pasada) */}
      {ballInNet && <rect key={`wf-${key}`} className="p2d-goal-whiteflash" x={VBX} y={0} width={VBW} height={H} fill="#fff" pointerEvents="none" />}

      {/* GOOOL — rótulo inferior */}
      {ballInNet && (
        <g className="p2d-goool" pointerEvents="none">
          <rect x={28} y={46} width={44} height={9} rx={1.6} fill="rgba(0,0,0,.66)" stroke={possTeam === 'home' ? homeColor : awayColor} strokeWidth={0.3} />
          <text x={50} y={53.1} textAnchor="middle" fontSize={6.4} fontWeight={900}
                fill="#fff" letterSpacing="0.6" style={{ fontFamily: 'var(--font-scoreboard, var(--font-display))' }}>¡GOOOL!</text>
        </g>
      )}

      {/* Clima */}
      {weatherKind === 'rain' && (
        <g className="p2d-weather p2d-rain" pointerEvents="none">
          {Array.from({ length: 60 }).map((_, i) => {
            const x = VBX + (i * 37) % VBW;
            const delay = ((i * 13) % 100) / 100;
            return <line key={i} className="p2d-drop" x1={x} y1={-3} x2={x - 1.2} y2={1} stroke="rgba(200,225,255,.5)" strokeWidth={0.18} style={{ animationDelay: `${delay}s` }} />;
          })}
        </g>
      )}
      {weatherKind === 'snow' && (
        <g className="p2d-weather p2d-snow" pointerEvents="none">
          {Array.from({ length: 44 }).map((_, i) => {
            const x = VBX + (i * 41) % VBW;
            const delay = ((i * 17) % 100) / 100;
            const r = 0.18 + ((i * 7) % 5) / 18;
            return <circle key={i} className="p2d-flake" cx={x} cy={-2} r={r} fill="rgba(255,255,255,.78)" style={{ animationDelay: `${delay}s` }} />;
          })}
        </g>
      )}

      {/* Grano de césped: capa ESTÁTICA en espacio de pantalla (fuera de la cámara) →
          el feTurbulence se rasteriza UNA vez y no se recalcula con el zoom. */}
      <rect x={VBX} y={0} width={VBW} height={H} fill="url(#p2d-grass-noise)" opacity={0.05} pointerEvents="none" />
      <rect x={VBX} y={0} width={VBW} height={H} fill="url(#p2d-vignette)" pointerEvents="none" />
    </svg>
  );
}

const P2D_CSS = `
.p2d{display:block;border-radius:0;border:none;
  background:var(--pitch-letterbox, linear-gradient(180deg,#0c2418 0%,#08160e 100%));
  box-shadow:inset 0 0 60px rgba(0,0,0,.3),inset 0 -18px 36px rgba(0,0,0,.2)}
.p2d .p2d-sweep{opacity:.22;mix-blend-mode:soft-light;animation:p2dSweep 14s ease-in-out infinite}
@keyframes p2dSweep{0%,100%{opacity:.14}50%{opacity:.3}}
.p2d--goal .p2d-sweep{opacity:.5}
.p2d--goal .p2d-goal-flash{animation:p2dGoalBg .8s ease-out forwards;pointer-events:none}
@keyframes p2dGoalBg{0%{opacity:.24}100%{opacity:0}}
.p2d--shot .p2d-shot-flash{animation:p2dShotBg .5s ease-out forwards;pointer-events:none}
@keyframes p2dShotBg{0%{opacity:.1}100%{opacity:0}}
.p2d .p2d-carrier-ring{animation:p2dCarrierPulse 1.8s ease-in-out infinite, p2dCarrierFlow 2.5s linear infinite}
.p2d .p2d-carrier-glow{animation:p2dCarrierGlow 1.8s ease-in-out infinite}
@keyframes p2dCarrierPulse{0%,100%{opacity:.5;stroke-width:.12}50%{opacity:.95;stroke-width:.2}}
@keyframes p2dCarrierGlow{0%,100%{opacity:.08}50%{opacity:.18}}
@keyframes p2dCarrierFlow{to{stroke-dashoffset:-1.4}}
.p2d .p2d-ball--active .p2d-ball-halo{animation:p2dBallHalo 1.4s ease-in-out infinite}
@keyframes p2dBallHalo{0%,100%{opacity:.15;r:1.75}50%{opacity:.4;r:1.95}}
/* El giro lo conduce un transform inline (ángulo acumulado por velocidad, I1); aquí
   solo se fija el origen de rotación. Sin keyframe de velocidad fija. */
.p2d .p2d-ball-spin{transform-box:fill-box;transform-origin:center}
/* Jugadores = fichas (disco): el movimiento se lee por la peana que se estira con la
   velocidad, la muesca de orientación y la estela del balón — sin ciclo de piernas. */
.p2d .p2d-player,.p2d .p2d-shadow,.p2d .p2d-ball,.p2d .p2d-ball-shadow,.p2d .p2d-carrier-ring,.p2d .p2d-carrier-glow,.p2d .p2d-ballspot-g{
  transition:transform .55s cubic-bezier(.34, 1.56, .64, 1),opacity .28s ease}
.p2d.p2d--live .p2d-player,.p2d.p2d--live .p2d-shadow,.p2d.p2d--live .p2d-ball,.p2d.p2d--live .p2d-ball-shadow,
.p2d.p2d--live .p2d-carrier-ring,.p2d.p2d--live .p2d-carrier-glow,.p2d.p2d--live .p2d-ballspot-g{transition:none!important}
.p2d.p2d--live .p2d-carrier-ring,.p2d.p2d--live .p2d-carrier-glow,.p2d.p2d--live .p2d-ball-halo{animation:none!important}
.p2d.p2d--slow:not(.p2d--live) .p2d-player,.p2d.p2d--slow:not(.p2d--live) .p2d-shadow,.p2d.p2d--slow:not(.p2d--live) .p2d-ball,
.p2d.p2d--slow:not(.p2d--live) .p2d-ball-shadow,.p2d.p2d--slow:not(.p2d--live) .p2d-carrier-ring{
  transition:transform 1.1s cubic-bezier(.34, 1.56, .64, 1),opacity .35s ease}
.p2d .p2d-poss-glow{transition:opacity .6s ease}
.p2d .p2d-ballspot-g{transition:opacity .4s ease,transform .55s cubic-bezier(.34,1.56,.64,1)}
.p2d--goal .p2d-ballspot-g{opacity:.4}
.p2d .p2d-cornerflag .p2d-flag{transform-box:fill-box;transform-origin:0 50%;animation:p2dFlag 2.4s ease-in-out infinite}
@keyframes p2dFlag{0%,100%{transform:scaleX(1) skewX(0deg)}50%{transform:scaleX(.82) skewX(-6deg)}}
/* Red */
.p2d .p2d-net-mesh,.p2d .p2d-net-roof{transform-box:fill-box;transform-origin:left center;will-change:transform}
.p2d .p2d-goal-unit--score .p2d-net-mesh,.p2d .p2d-goal-unit--score .p2d-net-roof{animation:p2dNetRipple .9s cubic-bezier(.2,.9,.25,1) both}
@keyframes p2dNetRipple{0%{transform:scaleX(.55)}18%{transform:scaleX(1.5)}44%{transform:scaleX(.84)}70%{transform:scaleX(1.12)}100%{transform:scaleX(1)}}
.p2d .p2d-goal--left .p2d-net-mesh{transform-origin:left 26%}
.p2d .p2d-goal--center .p2d-net-mesh{transform-origin:left 50%}
.p2d .p2d-goal--right .p2d-net-mesh{transform-origin:left 74%}
.p2d .p2d-net-front{animation:p2dNetFront .9s ease-out both}
@keyframes p2dNetFront{0%{opacity:0}30%{opacity:.6}100%{opacity:.42}}
.p2d .p2d-goal-unit--score .p2d-net-tint{animation:p2dNetTint 1s ease-out both}
@keyframes p2dNetTint{0%{opacity:0}22%{opacity:.34}100%{opacity:.12}}
/* Temblor de cámara por TRAUMA (I3): lo conduce un transform inline en .p2d-shakeable
   (acumulador que decae + ruido determinista, escalado por el impacto). Ya no hay
   keyframe de fase fija; reduced-motion lo anula desde JS (shakeTransform = ''). */
/* GOOOL + celebración */
.p2d .p2d-goool{animation:p2dGoool .5s cubic-bezier(.2,1.4,.4,1) both}
@keyframes p2dGoool{0%{opacity:0;transform:translateY(4px) scale(.85)}100%{opacity:1;transform:none}}
.p2d .p2d-scorer-spot{transform-box:fill-box;transform-origin:center;animation:p2dSpot .6s ease-out both}
@keyframes p2dSpot{0%{opacity:0;transform:scale(.3)}100%{opacity:1;transform:scale(1)}}
.p2d .p2d-confetto{transform-box:fill-box;transform-origin:center;animation:p2dConfetti 1.1s ease-in forwards}
@keyframes p2dConfetti{0%{opacity:0;transform:translate(0,0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translate(calc(var(--cx)*1px),calc(var(--cy)*1px)) rotate(var(--rot))}}
/* Coreografía de gol: goleador ruge, compañeros convergen, rival se hunde + fogonazo */
.p2d .p2d-cel{transform-box:fill-box}
.p2d .p2d-cel--scorer{transform-origin:center;animation:p2dRoar .6s cubic-bezier(.2,1.5,.4,1) both}
@keyframes p2dRoar{0%{transform:none}45%{transform:scale(1.28) translateY(-0.5px)}100%{transform:scale(1.12) translateY(-0.25px)}}
.p2d .p2d-cel--slump{transform-origin:center;animation:p2dSlump .5s ease-out both}
@keyframes p2dSlump{0%{transform:none;opacity:1}100%{transform:scale(.78);opacity:.6}}
.p2d .p2d-cel--mate{animation:p2dConverge .55s cubic-bezier(.2,.8,.3,1) both}
@keyframes p2dConverge{0%{transform:none}100%{transform:translate(calc(var(--cvx,0)*1px),calc(var(--cvy,0)*1px))}}
.p2d .p2d-goal-whiteflash{animation:p2dWhiteFlash .5s ease-out forwards}
@keyframes p2dWhiteFlash{0%{opacity:.5}100%{opacity:0}}
/* Anillos de gol */
.p2d .p2d-ring{fill:none;stroke:var(--green-primary);filter:drop-shadow(0 0 6px var(--green-primary))}
.p2d .p2d-ring-1{animation:p2dring 1.5s cubic-bezier(.1,.8,.3,1) forwards;}
.p2d .p2d-ring-2{animation:p2dring 1.5s cubic-bezier(.1,.8,.3,1) .15s forwards;}
.p2d .p2d-ring-3{animation:p2dring 1.5s cubic-bezier(.1,.8,.3,1) .3s forwards;}
@keyframes p2dring{0%{r:1.2;opacity:.9;stroke-width:1}100%{r:18;opacity:0;stroke-width:.05}}
.p2d .p2d-card{animation:p2dcard .45s cubic-bezier(.3,1.4,.5,1) both}
@keyframes p2dcard{0%{opacity:0;transform:translateY(3px) scale(.8)}100%{opacity:1;transform:none}}
/* Clima */
.p2d .p2d-drop{animation:p2dRain .7s linear infinite}
@keyframes p2dRain{0%{transform:translate(0,0);opacity:0}10%{opacity:.7}100%{transform:translate(-6px,68px);opacity:0}}
.p2d .p2d-flake{animation:p2dSnow 3.4s linear infinite}
@keyframes p2dSnow{0%{transform:translate(0,0);opacity:0}10%{opacity:.85}100%{transform:translate(3px,68px);opacity:.2}}
@media(prefers-reduced-motion:reduce){.p2d *,.p2d::before,.p2d::after{animation:none!important;transition:none!important}}
`;
