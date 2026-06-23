// ─── Match Center v3 — retransmisión broadcast (B18) ──────────────────────────
// Campo 2D con los 22 jugadores + marcador estilo TV con posesión en vivo,
// lower-thirds en goles, REPETICIÓN del gol re-trazando chain[]+lane con los
// duelos de atributos (C7), cortinillas de DESCANSO/FINAL, transición
// previa→campo, sonido Web Audio opcional (off por defecto) y respeto a
// prefers-reduced-motion. SOLO presentación: la lógica del partido es la misma.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Crown, Flame, Target, SkipForward, Volume2, VolumeX, Repeat, History as HistoryIcon, ChevronLeft, ChevronRight, SkipBack, List, BarChart2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Radar } from '../ui/Radar';
import { ClubBadge } from '../ui/ClubBadge';
import { PosBadge } from '../ui/PosBadge';
import { Pitch2D } from './Pitch2D';
import { GoalReplay } from './GoalReplay';
import { MatchTunnelButton } from './MatchTunnelBanner';
import { GoalFreezeFrame } from './GoalFreezeFrame';
import { targetZoom, isDuelStep, weatherTint, type CameraPreset } from './broadcastCamera';
import { playGoal, playWhistle, playKickoff, startAmbientLoop, stopAmbientLoop, isAmbientEnabled } from './broadcastAudio';
import { kitOf, resolveClash } from './kitColors';
import { stepDurationMs, resolveCarrier } from '../../lib/pitchMovement';
import { commentaryFor } from '../../lib/matchCommentary';
import type { PlayerRating, SimulationResult, TimelineEntry } from '../../types/engine';
import { PlayerLink } from '../common/EntityLink';

export interface MCClub { id?: number | null; badge?: string | null }
interface Props {
  result: SimulationResult;
  homeName: string;
  awayName: string;
  homeClub?: MCClub;
  awayClub?: MCClub;
  weather?: string;
  /** Formaciones reales (p. ej. "4-3-3") para alinear el once en el campo. */
  homeFormation?: string;
  awayFormation?: string;
  /** true → arranca con la presentación de alineaciones y reproduce desde el 1' */
  cinematic?: boolean;
  jumpToMinute?: number;
  onResimulate?: () => void;
  timeMachineLoading?: boolean;
  className?: string;
  onOpenPreview?: () => void;
  onOpenAnalysis?: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  gol: 'GOL', remate: 'REMATE', parada: 'PARADA', falta: 'FALTA',
  progresion: 'ATAQUE', saque: 'SAQUE', construccion: 'JUEGO', final: 'FINAL',
};
const PHASE_TONE: Record<string, string> = {
  gol: 'var(--green-primary)', remate: 'var(--blue-info)', parada: 'var(--teal-accent)',
  falta: 'var(--gold-accent)', progresion: 'var(--text-muted)', saque: 'var(--text-muted)',
  final: 'var(--gold-accent)', construccion: 'var(--text-muted)',
};
const ZONE_BUCKET: Record<string, number> = { def: 0, med: 1, ataque: 2, area: 2 };
const POS_ORDER = ['POR', 'DEF', 'MED', 'DEL'];

function goalsAt(tl: TimelineEntry[], c: number): [number, number] {
  let h = 0, a = 0;
  for (let i = 0; i <= c && i < tl.length; i++) if (tl[i].phase === 'gol') if (tl[i].team === 'home') { h++; } else { a++; }
  return [h, a];
}

// I4 · Speed-ramp de slow-mo en el golpeo. Remapea el progreso LINEAL del paso de
// disparo (gol/remate/parada) para que el reloj se RALENTICE al acercarse al impacto
// (`contact`) y RE-ACELERE tras él — cámara lenta cinematográfica encadenada con el
// hit-stop, que congela justo en `contact` (ya en lo más lento). Invariantes:
// warp(0)=0, warp(contact)=contact, warp(1)=1, monótona → el instante de impacto y la
// duración total NO cambian; solo se redistribuye la velocidad dentro del paso.
function slowmoWarp(tRaw: number, contact: number | null): number {
  if (contact == null || contact <= 0 || contact >= 1) return tRaw;
  const t = Math.max(0, Math.min(1, tRaw));
  if (t < contact) { const u = t / contact; return contact * (1 - (1 - u) * (1 - u)); } // easeOut: decelera al impacto
  const u = (t - contact) / (1 - contact); return contact + (1 - contact) * (u * u);     // easeIn: acelera tras el impacto
}
function teamRadar(rs: PlayerRating[]) {
  const sum = (f: (r: PlayerRating) => number) => rs.reduce((s, r) => s + f(r), 0);
  const acc = rs.length ? sum(r => r.passAccuracy) / rs.length : 0;
  return [
    { label: 'TIROS', value: Math.min(100, sum(r => r.shots) * 6) },
    { label: 'PRECIS', value: acc * 100 },
    { label: 'xG', value: Math.min(100, sum(r => r.xg) * 35) },
    { label: 'ENTRADAS', value: Math.min(100, sum(r => r.tackles) * 8) },
    { label: 'CLAVE', value: Math.min(100, sum(r => r.keyPasses) * 18) },
    { label: 'GOLES', value: Math.min(100, sum(r => r.goals) * 30) },
  ];
}
/** XI ordenado por líneas para la presentación (con fallback 1-4-4-2). */
function lineupOf(rs: PlayerRating[]) {
  const xi = rs.slice(0, 11).map((r, i) => ({
    ...r,
    position: POS_ORDER.includes(r.position ?? '') ? r.position!
      : i === 0 ? 'POR' : i <= 4 ? 'DEF' : i <= 8 ? 'MED' : 'DEL',
  }));
  return POS_ORDER.map(line => ({ line, players: xi.filter(p => p.position === line) }))
    .filter(g => g.players.length > 0);
}

export function MatchCenter({ result, homeName, awayName, homeClub, awayClub, weather, homeFormation, awayFormation, cinematic, jumpToMinute, onResimulate, timeMachineLoading, className, onOpenPreview, onOpenAnalysis }: Props) {
  const tl = useMemo(() => result.timeline ?? [], [result.timeline]);
  const max = Math.max(0, tl.length - 1);
  const hasTl = tl.length > 0;
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 4>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [layer, setLayer] = useState<'none' | 'heat' | 'shots'>('none');
  const [screen, setScreen] = useState<'intro' | 'live' | 'ht' | 'ft'>(cinematic && hasTl ? 'intro' : 'live');
  const htSeen = useRef(!cinematic);
  const dismissedGoals = useRef(new Set<number>());
  const feedRef = useRef<HTMLDivElement>(null);
  // B18 · broadcast: sonido off por defecto, repetición de gol y transición previa→campo
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  soundRef.current = sound;
  const [replayIdx, setReplayIdx] = useState<number | null>(null);
  const [goalFreezeIdx, setGoalFreezeIdx] = useState<number | null>(null);
  const [wipeKey, setWipeKey] = useState(0);
  const [blend, setBlend] = useState(1);
  const [detailTab, setDetailTab] = useState<'timeline' | 'stats' | 'ratings'>('timeline');
  const rafRef = useRef(0);
  const stepStartRef = useRef(0);
  // Hit-stop: micro-congelación en el momento del impacto (gol/remate/parada).
  const hitStopUntilRef = useRef(0);
  const hitStopDoneRef = useRef(false);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Colores de equipación (badge emoji → hex, con resolución de choque)
  const kit = useMemo(() => resolveClash(
    kitOf(homeClub?.badge, homeClub?.id, homeName),
    kitOf(awayClub?.badge, awayClub?.id, awayName),
  ), [homeClub, awayClub, homeName, awayName]);

  const step = tl[cursor];
  const prevStep = cursor > 0 ? tl[cursor - 1] : undefined;
  const prev2Step = cursor > 1 ? tl[cursor - 2] : undefined;
  const nextStep = cursor < max ? tl[cursor + 1] : undefined;
  const duelStep = isDuelStep(step);
  const stepDur = useMemo(() => stepDurationMs(step, duelStep, prevStep, cursor) / speed, [step, duelStep, prevStep, cursor, speed]);
  const camZoom = useMemo(() => targetZoom(step, duelStep, cameraPreset), [step, duelStep, cameraPreset]);
  // Hit-stop escalado por la POTENCIA del disparo (definición del rematador): un
  // misil congela más que un toque flojo. Memo sobre el evento → el rAF lee escalares.
  const hitStop = useMemo(() => {
    // El balón golpea en eased=settle; el blend es LINEAL, así que el instante REAL del
    // golpeo es t=acos(1-2·settle)/π. Sincronizamos ahí el hit-stop y la cresta del slow-mo
    // (antes congelaba en `settle`, ~4% tarde en el gol) → el golpe cae justo en el impacto.
    const settle = step?.phase === 'gol' ? 0.6 : step?.phase === 'remate' ? 0.5 : step?.phase === 'parada' ? 0.55 : null;
    const contact = settle == null ? null : Math.acos(1 - 2 * settle) / Math.PI;
    const attrs = step?.duel?.att?.attrs ?? step?.chain?.[(step?.chain?.length ?? 0) - 1]?.att?.attrs;
    const power = Math.max(0, Math.min(1, Number(attrs?.finishing ?? attrs?.shooting ?? 60) / 100));
    const base = step?.phase === 'gol' ? 110 : step?.phase === 'parada' ? 70 : step?.phase === 'remate' ? 55 : 0;
    return { contact, ms: base > 0 ? Math.round(base + power * 95) : 0 }; // ~55–205 ms
  }, [step]);
  const weatherOverlay = useMemo(() => weatherTint(weather), [weather]);
  const carrier = useMemo(
    () => resolveCarrier(step, result.homeRatings ?? [], result.awayRatings ?? []),
    [step, result.homeRatings, result.awayRatings],
  );
  const [hG, aG] = useMemo(() => goalsAt(tl, cursor), [tl, cursor]);
  // I2 · pista de comentario play-by-play: línea de relato en campo APARTE (no
  // reescribe step.text). Determinista; se recalcula por evento, no por frame.
  const commentary = useMemo(
    () => commentaryFor(step, prevStep, cursor, {
      homeName, awayName,
      carrierName: carrier?.fullName ?? carrier?.name ?? null,
      defenderName: step?.duel?.def?.name ?? step?.chain?.[(step?.chain?.length ?? 0) - 1]?.def?.name ?? null,
      homeGoals: hG, awayGoals: aG,
    }),
    [step, prevStep, cursor, homeName, awayName, carrier, hG, aG],
  );
  const goalMarks = useMemo(
    () => tl.reduce<number[]>((acc, e, i) => { if (e.phase === 'gol') acc.push(i); return acc; }, []),
    [tl],
  );
  const htIndex = useMemo(() => tl.findIndex(e => e.minute >= 46), [tl]);

  useEffect(() => {
    if (jumpToMinute == null || !hasTl) return;
    let idx = tl.findIndex(e => e.minute >= jumpToMinute);
    if (idx === -1) idx = max;
    setCursor(idx);
    setScreen('live');
    setPlaying(false);
    setReplayIdx(null);
    setGoalFreezeIdx(null);
  }, [jumpToMinute, hasTl, tl, max]);

  // I-9 · freeze-frame breve en goles (gestionado en el loop de reproducción)
  useEffect(() => {
    if (goalFreezeIdx == null) return;
    const t = setTimeout(() => {
      dismissedGoals.current.add(goalFreezeIdx);
      setGoalFreezeIdx(null);
      setPlaying(true);
    }, 4500);
    return () => clearTimeout(t);
  }, [goalFreezeIdx]);

  // ── Reproducción fluida con interpolación entre jugadas ──
  useEffect(() => {
    if (!playing || screen !== 'live' || replayIdx != null) {
      if (!playing) setBlend(1);
      return;
    }
    if (cursor >= max) {
      setPlaying(false);
      setScreen('ft');
      setBlend(1);
      return;
    }

    if (reducedMotion) {
      const t = setTimeout(() => {
        const currentStep = tl[cursor];
        if (currentStep?.phase === 'gol' && !dismissedGoals.current.has(cursor)) {
          setGoalFreezeIdx(cursor);
          setPlaying(false);
          return;
        }
        const next = Math.min(max, cursor + 1);
        if (!htSeen.current && htIndex > 0 && next >= htIndex) {
          htSeen.current = true;
          setScreen('ht');
          setPlaying(false);
          setTimeout(() => { setScreen('live'); setCursor(next); setPlaying(true); }, 2300);
          return;
        }
        if (cursor < max) setCursor(c => c + 1);
        else { setPlaying(false); setScreen('ft'); }
      }, stepDur);
      return () => clearTimeout(t);
    }

    setBlend(0);
    stepStartRef.current = performance.now();
    hitStopUntilRef.current = 0;
    hitStopDoneRef.current = false;
    const hsContact = hitStop.contact, hsMs = hitStop.ms;
    const tick = (now: number) => {
      // Progreso lineal del paso, remapeado por la rampa de slow-mo del golpeo (I4).
      const tWarp = slowmoWarp((now - stepStartRef.current) / stepDur, hsContact);
      // Hit-stop: congela el frame justo en el impacto del disparo/parada/gol.
      if (hsContact != null && hsMs > 0) {
        if (!hitStopDoneRef.current && tWarp >= hsContact) {
          hitStopDoneRef.current = true;
          hitStopUntilRef.current = now + hsMs;
          stepStartRef.current += hsMs;            // rebobina para reanudar sin salto
        }
        if (now < hitStopUntilRef.current) {
          setBlend(hsContact);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }
      const t = Math.min(1, tWarp);
      setBlend(t);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const currentStep = tl[cursor];
      if (currentStep?.phase === 'gol' && !dismissedGoals.current.has(cursor)) {
        setGoalFreezeIdx(cursor);
        setPlaying(false);
        setBlend(1);
        return;
      }
      const next = Math.min(max, cursor + 1);
      if (!htSeen.current && htIndex > 0 && next >= htIndex) {
        htSeen.current = true;
        setScreen('ht');
        setPlaying(false);
        setBlend(1);
        setTimeout(() => { setScreen('live'); setCursor(next); setPlaying(true); }, 2300);
        return;
      }
      if (cursor < max) setCursor(c => c + 1);
      else { setPlaying(false); setScreen('ft'); setBlend(1); }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, cursor, screen, replayIdx, stepDur, max, htIndex, tl, reducedMotion, step?.phase, hitStop]);

  // Scroll del feed solo durante reproducción — nunca al cargar la página
  useEffect(() => {
    if (!playing) return;
    const feed = feedRef.current;
    if (!feed) return;
    const line = feed.querySelector(`[data-event-idx="${cursor}"]`) as HTMLElement | null;
    if (!line) return;
    const top = line.offsetTop - feed.clientHeight * 0.35;
    feed.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [cursor, playing]);

  // B18 · efectos de sonido (off por defecto): gol al avanzar a una entrada de gol,
  // silbato en descanso/final. Solo reaccionan a CAMBIOS de estado, nunca relógica.
  useEffect(() => {
    if (!soundRef.current || screen !== 'live' || !playing) return;
    if (tl[cursor]?.phase === 'gol') playGoal();
  }, [cursor, screen, playing, tl]);
  useEffect(() => {
    if (!soundRef.current) return;
    if (screen === 'ht') playWhistle(false);
    if (screen === 'ft') playWhistle(true);
  }, [screen]);

  // I-17 · ambiente de grada cuando sonido activo y sin reduced-motion
  useEffect(() => {
    if (!sound || reducedMotion || !isAmbientEnabled()) {
      stopAmbientLoop();
      return;
    }
    if (screen === 'live' && playing) startAmbientLoop();
    else stopAmbientLoop();
    return () => stopAmbientLoop();
  }, [sound, screen, playing, reducedMotion]);

  const { heatHome, heatAway, shots } = useMemo(() => {
    const hH = [0, 0, 0], hA = [0, 0, 0];
    const sh: { x: number; y: number; team: 'home' | 'away'; goal?: boolean }[] = [];
    tl.forEach((e, i) => {
      const b = ZONE_BUCKET[e.zone] ?? 1;
      (e.team === 'home' ? hH : hA)[b] += 1;
      if (e.phase === 'remate' || e.phase === 'gol' || e.phase === 'parada') {
        const base = e.zone === 'area' ? 88 : 74;
        sh.push({ x: e.team === 'home' ? base : 100 - base, y: 14 + ((i * 13) % 36), team: e.team, goal: e.phase === 'gol' });
      }
    });
    const norm = (a: number[]) => { const m = Math.max(1, ...a); return a.map(v => v / m); };
    return { heatHome: norm(hH), heatAway: norm(hA), shots: sh };
  }, [tl]);

  // ── Métricas EN VIVO hasta el cursor ──
  const live = useMemo(() => {
    let ph = 0, pa = 0, sH = 0, sA = 0, tH = 0, tA = 0;
    for (let i = 0; i <= cursor && i < tl.length; i++) {
      const e = tl[i];
      if (e.team === 'home') { ph++; } else { pa++; }
      if (e.phase === 'remate' || e.phase === 'gol' || e.phase === 'parada') if (e.team === 'home') { sH++; } else { sA++; }
      if (e.phase === 'gol' || e.phase === 'parada') if (e.team === 'home') { tH++; } else { tA++; }
    }
    const tot = ph + pa;
    return { poss: tot ? Math.round(ph / tot * 100) : 50, shotsH: sH, shotsA: sA, onH: tH, onA: tA };
  }, [tl, cursor]);

  // Momentum: ventana móvil de las últimas 12 jugadas (gol pesa 4, remate 2)
  const momentum = useMemo(() => {
    let h = 1, a = 1;
    for (let i = Math.max(0, cursor - 11); i <= cursor && i < tl.length; i++) {
      const e = tl[i];
      const w = e.phase === 'gol' ? 4 : (e.phase === 'remate' || e.phase === 'parada') ? 2 : 1;
      if (e.team === 'home') { h += w; } else { a += w; }
    }
    return h / (h + a) * 100;
  }, [tl, cursor]);

  const atEnd = cursor >= max;
  const xgH = (result.homeRatings ?? []).reduce((s, r) => s + (r.xg || 0), 0);
  const xgA = (result.awayRatings ?? []).reduce((s, r) => s + (r.xg || 0), 0);
  const possFinal = result.homeStats?.possession ?? 50;
  const motmRow = [...(result.homeRatings ?? []), ...(result.awayRatings ?? [])].find(r => r.name === result.motm);

  const startMatch = () => {
    if (!reducedMotion) setWipeKey(k => k + 1); // cortinilla previa→campo
    if (soundRef.current) playKickoff();
    setScreen('live'); setCursor(0); setPlaying(true);
  };
  const restart = () => {
    htSeen.current = false;
    dismissedGoals.current.clear();
    setScreen('intro');
    setPlaying(false);
    setCursor(0);
    setReplayIdx(null);
    setGoalFreezeIdx(null);
  };
  const dismissGoalFreeze = () => {
    const idx = goalFreezeIdx ?? (step?.phase === 'gol' ? cursor : null);
    if (idx != null) dismissedGoals.current.add(idx);
    setGoalFreezeIdx(null);
    setPlaying(true);
  };

  const goTo = (idx: number) => {
    setPlaying(false);
    setGoalFreezeIdx(null);
    if (screen !== 'live') setScreen('live');
    setCursor(Math.max(0, Math.min(max, idx)));
    setBlend(1);
  };
  const stepEvent = (delta: number) => goTo(cursor + delta);
  const jumpGoal = (dir: -1 | 1) => {
    if (dir === 1) {
      const next = goalMarks.find(g => g > cursor);
      if (next != null) goTo(next);
    } else {
      const prev = [...goalMarks].reverse().find(g => g < cursor);
      if (prev != null) goTo(prev);
    }
  };
  const togglePlay = () => {
    if (screen !== 'live') setScreen('live');
    setPlaying(p => !p);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); stepEvent(-1); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); stepEvent(1); }
      else if (e.code === 'Home') { e.preventDefault(); goTo(0); }
      else if (e.code === 'End') { e.preventDefault(); goTo(max); }
      else if (e.key === 'g' || e.key === 'G') jumpGoal(e.shiftKey ? -1 : 1);
      else if (e.key === '1') setSpeed(1);
      else if (e.key === '2') setSpeed(2);
      else if (e.key === '4') setSpeed(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- atajos usan estado actual vía closures
  }, [cursor, max, goalMarks, screen, playing]);

  // B18 · repetición: entrada de gol con chain[] (C7) → moviola disponible
  const replayEntry = replayIdx != null ? tl[replayIdx] : undefined;

  // Sin timeline ni ratings → partido simulado con motor básico o muy antiguo
  const hasNoData = !hasTl && (result.homeRatings ?? []).length === 0;
  if (hasNoData) {
    return (
      <div className={cn('mc', className)}>
        <style>{MC_CSS}</style>
        <div className="mc-board">
          <div className="mc-scan" />
          <span className="mc-side">
            <ClubBadge id={homeClub?.id ?? 0} name={homeName} size={30} />
            <span className="mc-tname">{homeName}</span>
          </span>
          <div className="mc-score">
            {result.resultHidden ? (
              <><b>?</b><i>:</i><b>?</b></>
            ) : (
              <><b>{result.homeGoals ?? '?'}</b><i>:</i><b>{result.awayGoals ?? '?'}</b></>
            )}
            <span className="mc-clock">FINAL</span>
          </div>
          <span className="mc-side mc-side--a">
            <span className="mc-tname">{awayName}</span>
            <ClubBadge id={awayClub?.id ?? 1} name={awayName} size={30} />
          </span>
        </div>
        <div className="text-center p-8 text-[var(--text-muted)] text-sm flex flex-col items-center">
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📺</div>
          <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Registro Antiguo</p>
          <p style={{ fontSize: '.85rem', lineHeight: 1.5 }}>
            Este partido no tiene timeline.
          </p>
          {onResimulate && (
            <MatchTunnelButton loading={timeMachineLoading} onClick={onResimulate} />
          )}
        </div>
      </div>
    );
  }

  const progressPct = max > 0 ? (cursor / max) * 100 : 0;

  return (
    <div className={cn('mc', className)} style={{ ['--mc-home' as string]: kit.home, ['--mc-away' as string]: kit.away }}>
      <style>{MC_CSS}</style>

      <div className="mc-arena">
        <div className="mc-arena-beam" aria-hidden />
        <header className="mc-arena-head">
          <div className="mc-arena-brand">
            {playing && screen === 'live' && <span className="mc-live"><i /> EN DIRECTO</span>}
            <span className="mc-arena-tag">RETRANSMISIÓN</span>
            {weather && <span className="mc-arena-weather">{weather}</span>}
          </div>
          <nav className="mc-arena-nav" role="tablist">
            <button type="button" role="tab" className={cn('mc-atab', detailTab === 'timeline' && 'on')} onClick={() => setDetailTab('timeline')} aria-selected={detailTab === 'timeline'}><List size={13} /> Crónica</button>
            <button type="button" role="tab" className={cn('mc-atab', detailTab === 'stats' && 'on')} onClick={() => setDetailTab('stats')} aria-selected={detailTab === 'stats'}><BarChart2 size={13} /> Stats</button>
            <button type="button" role="tab" className={cn('mc-atab', detailTab === 'ratings' && 'on')} onClick={() => setDetailTab('ratings')} aria-selected={detailTab === 'ratings'}><Crown size={13} /> Notas</button>
          </nav>
          <div className="mc-arena-links">
            {onOpenPreview && <button type="button" className="mc-alink" onClick={onOpenPreview}>Previa</button>}
            {onOpenAnalysis && <button type="button" className="mc-alink mc-alink--gold" onClick={onOpenAnalysis}>Análisis</button>}
          </div>
        </header>

        <div className="mc-arena-body">
          <section className="mc-theater" aria-label="Visor del partido">
            <div className="mc-pitchwrap">
              <div className="mc-pitch-stage">
                <div className="mc-pitch-inner">
                {weatherOverlay && <div className="mc-weather-overlay" style={{ background: weatherOverlay }} aria-hidden />}
                <Pitch2D step={screen === 'live' ? step : undefined}
                         prevStep={screen === 'live' ? prevStep : undefined}
                         prev2Step={screen === 'live' ? prev2Step : undefined}
                         nextStep={screen === 'live' ? nextStep : undefined}
                         stepIndex={cursor}
                         blend={playing && screen === 'live' && !reducedMotion ? blend : 1}
                         camZoom={screen === 'live' ? camZoom : 1}
                         slowMo={duelStep}
                         heatHome={heatHome} heatAway={heatAway} shots={shots}
                         showHeat={layer === 'heat'} showShots={layer === 'shots'}
                         homePlayers={result.homeRatings ?? []} awayPlayers={result.awayRatings ?? []}
                         homeColor={kit.home} awayColor={kit.away}
                         showPlayers={screen === 'live'} weather={weather}
                         reducedMotion={reducedMotion} momentum={momentum}
                         homeFormation={homeFormation} awayFormation={awayFormation}
                         liveMotion={playing && screen === 'live' && !reducedMotion && blend < 1} />

                {/* HUD marcador flotante */}
                <div className={cn('mc-hud-score', step?.phase === 'gol' && screen === 'live' && 'mc-hud-score--goal')}>
                  <div className="mc-hud-team mc-hud-team--h">
                    <ClubBadge id={homeClub?.id ?? 0} name={homeName} size={32} />
                    <span className="mc-hud-name">{homeName}</span>
                    <i className="mc-kit" style={{ background: kit.home }} />
                  </div>
                  <div className="mc-hud-mid">
                    <span className="mc-hud-clock">
                      {screen === 'intro' ? 'PREVIA' : screen === 'ht' ? 'DESCANSO' : step ? `${step.minute}'` : '—'}
                    </span>
                    <div className="mc-hud-goals">
                      <b key={`h${hG}`} className="mc-pop">{screen === 'intro' ? '–' : result.resultHidden ? '?' : hG}</b>
                      <span>:</span>
                      <b key={`a${aG}`} className="mc-pop">{screen === 'intro' ? '–' : result.resultHidden ? '?' : aG}</b>
                    </div>
                    {screen !== 'intro' && (
                      <div className="mc-hud-poss" aria-hidden>
                        <i style={{ width: `${atEnd ? possFinal : live.poss}%`, background: kit.home }} />
                        <i style={{ width: `${100 - (atEnd ? possFinal : live.poss)}%`, background: kit.away }} />
                      </div>
                    )}
                  </div>
                  <div className="mc-hud-team mc-hud-team--a">
                    <i className="mc-kit" style={{ background: kit.away }} />
                    <span className="mc-hud-name">{awayName}</span>
                    <ClubBadge id={awayClub?.id ?? 1} name={awayName} size={32} />
                  </div>
                </div>

                {/* Chips stats — solo pausado (evita duplicar crónica) */}
                {screen === 'live' && !playing && (
                  <div className="mc-hud-chips">
                    <span className="mc-chip-mini">Tiros {live.shotsH}-{live.shotsA}</span>
                    <span className="mc-chip-mini">Pos {atEnd ? possFinal : live.poss}%</span>
                  </div>
                )}

                {/* Rótulo del jugador que tiene el balón (siempre visible) */}
                {screen === 'live' && carrier && (
                  <div key={(carrier.id ?? carrier.name) + carrier.team}
                       className={cn('mc-lt', `mc-lt--${carrier.team}`, step?.phase === 'gol' && 'mc-lt--goal')}
                       style={{ ['--lt-kit' as string]: carrier.team === 'home' ? kit.home : kit.away }}
                       aria-live="polite">
                    {carrier.number > 0 && <span className="mc-lt-num">{carrier.number}</span>}
                    <span className="mc-lt-body">
                      <span className="mc-lt-name">{carrier.fullName}</span>
                      <span className="mc-lt-sub">
                        {carrier.position && <PosBadge position={carrier.position} short />}
                        {carrier.verb && <span className="mc-lt-verb">{carrier.verb}</span>}
                      </span>
                    </span>
                  </div>
                )}

                {goalFreezeIdx != null && tl[goalFreezeIdx]?.phase === 'gol' && (
                  <GoalFreezeFrame
                    playerId={tl[goalFreezeIdx].playerId ? Number(tl[goalFreezeIdx].playerId) : null}
                    playerName={tl[goalFreezeIdx].text?.split('·').pop()?.trim() || tl[goalFreezeIdx].text || 'Goleador'}
                    minute={tl[goalFreezeIdx].minute}
                    score={result.resultHidden ? '?–?' : `${goalsAt(tl, goalFreezeIdx)[0]}–${goalsAt(tl, goalFreezeIdx)[1]}`}
                    teamName={tl[goalFreezeIdx].team === 'home' ? homeName : awayName}
                    teamColor={tl[goalFreezeIdx].team === 'home' ? kit.home : kit.away}
                    onDismiss={dismissGoalFreeze}
                  />
                )}
                {wipeKey > 0 && <div key={`wipe-${wipeKey}`} className="mc-wipe" aria-hidden="true" />}
                {replayEntry?.chain && replayEntry.chain.length > 0 && (
                  <GoalReplay chain={replayEntry.chain} team={replayEntry.team} minute={replayEntry.minute}
                    teamName={replayEntry.team === 'home' ? homeName : awayName} homeColor={kit.home} awayColor={kit.away}
                    onClose={() => setReplayIdx(null)} />
                )}
                {screen === 'intro' && (
                  <div className="mc-screen">
                    <p className="mc-sc-label">ALINEACIONES{weather ? ` · ${weather}` : ''}</p>
                    <div className="mc-lineups">
                      {[{ n: homeName, rs: result.homeRatings ?? [], c: kit.home }, { n: awayName, rs: result.awayRatings ?? [], c: kit.away }].map(t => (
                        <div key={t.n} className="mc-xi">
                          <div className="mc-xi-t" style={{ color: t.c === '#E8ECF1' ? 'var(--text-primary)' : t.c }}>{t.n}</div>
                          {lineupOf(t.rs).map(g => (
                            <div key={g.line} className="mc-xi-line"><span className="mc-xi-pos">{g.line}</span><span>{g.players.map(p => p.name.split(' ').slice(-1)[0]).join(' · ')}</span></div>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="mc-sc-actions">
                      <button className="mc-cta" onClick={startMatch}><Play size={14} /> COMENZAR</button>
                      <button className="mc-b" onClick={() => { setScreen('live'); setCursor(max); }} title="Final"><SkipForward size={14} /></button>
                    </div>
                  </div>
                )}
                {screen === 'ht' && (
                  <div className="mc-screen mc-screen--flash mc-screen--curtain">
                    <p className="mc-sc-big">DESCANSO</p>
                    <p className="mc-sc-score">{result.resultHidden ? '? - ?' : goalsAt(tl, Math.max(0, htIndex - 1)).join(' - ')}</p>
                    <p className="mc-sc-label">POSESIÓN {live.poss}% · TIROS {live.shotsH}-{live.shotsA}</p>
                  </div>
                )}
                {screen === 'ft' && (
                  <div className="mc-screen mc-screen--curtain">
                    <p className="mc-sc-label">FINAL</p>
                    <p className="mc-sc-score mc-sc-score--xl">{result.resultHidden ? '? - ?' : `${result.homeGoals} - ${result.awayGoals}`}</p>
                    {motmRow && <p className="mc-sc-motm"><Crown size={13} /> {motmRow.name} · {motmRow.rating.toFixed(1)}</p>}
                    <div className="mc-sc-actions">
                      <button className="mc-cta" onClick={() => setScreen('live')}>SEGUIR VIENDO</button>
                      {onOpenAnalysis && <button className="mc-b" onClick={onOpenAnalysis} title="Análisis"><BarChart2 size={14} /></button>}
                      <button className="mc-b" onClick={restart} title="Reiniciar"><RotateCcw size={14} /></button>
                    </div>
                  </div>
                )}

                </div>
              </div>

              <div className="mc-controls">
                {screen === 'live' && step && (
                  <div className="mc-controls-top">
                    {playing ? (
                      <div className="mc-live-ticker">
                        <span className="mc-cap-min">{step.minute}'</span>
                        <span className="mc-cap-phase" style={{ color: PHASE_TONE[step.phase] }}>{PHASE_LABEL[step.phase] ?? step.phase}</span>
                      </div>
                    ) : (
                      <div className="mc-dock-caption" key={cursor}>
                        <span className="mc-cap-min">{step.minute}'</span>
                        <span className="mc-cap-phase" style={{ color: PHASE_TONE[step.phase] }}>{PHASE_LABEL[step.phase] ?? step.phase}</span>
                        <span className="mc-cap-txt">{step.text}</span>
                      </div>
                    )}
                    {/* I2 · pista de comentario play-by-play (campo APARTE, no step.text) */}
                    {commentary && (
                      <p className={cn('mc-commentary', `mc-commentary--${commentary.tone}`)} key={`pbp-${cursor}`} aria-live="polite">
                        <span className="mc-commentary-mic" aria-hidden="true" />
                        {commentary.text}
                      </p>
                    )}
                  </div>
                )}
                <div className="mc-dock-row">
                  <div className="mc-dock-transport">
                    <button className="mc-b" onClick={restart} title="Reiniciar"><RotateCcw size={15} /></button>
                    <button className="mc-b" onClick={() => goTo(0)} title="Inicio"><SkipBack size={15} /></button>
                    <button className="mc-b" onClick={() => stepEvent(-1)} title="Anterior"><ChevronLeft size={17} /></button>
                    <button className="mc-b mc-b--play" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Play'}>
                      {playing ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button className="mc-b" onClick={() => stepEvent(1)} title="Siguiente"><ChevronRight size={17} /></button>
                    <button className="mc-b" onClick={() => jumpGoal(1)} title="Siguiente gol"><span className="mc-ico-g">⚽</span></button>
                    <button className="mc-b" onClick={() => goTo(max)} title="Final"><SkipForward size={15} /></button>
                  </div>
                  <div className="mc-dock-tools">
                    <button className={cn('mc-chip', speed !== 1 && 'on')} onClick={() => setSpeed(s => (s === 1 ? 2 : s === 2 ? 4 : 1))}>×{speed}</button>
                    <button className={cn('mc-chip', cameraPreset !== 'wide' && 'on')} onClick={() => setCameraPreset(p => (p === 'wide' ? 'auto' : p === 'auto' ? 'tight' : p === 'tight' ? 'director' : 'wide'))} title="Cámara">📺</button>
                    <button className={cn('mc-chip', layer === 'heat' && 'on')} onClick={() => setLayer(l => l === 'heat' ? 'none' : 'heat')} title="Mapa de calor"><Flame size={12} /></button>
                    <button className={cn('mc-chip', layer === 'shots' && 'on')} onClick={() => setLayer(l => l === 'shots' ? 'none' : 'shots')} title="Tiros"><Target size={12} /></button>
                    <button className={cn('mc-chip', sound && 'on')} onClick={() => setSound(s => !s)} title="Sonido">{sound ? <Volume2 size={12} /> : <VolumeX size={12} />}</button>
                  </div>
                </div>
                <div className="mc-dock-timeline">
                  <span className="mc-tl-min">0'</span>
                  <div className="mc-rangewrap">
                    <div className="mc-tl-fill" style={{ width: `${progressPct}%` }} />
                    <input className="mc-range" type="range" min={0} max={max} value={cursor} onChange={e => goTo(Number(e.target.value))} aria-label="Minuto del partido" />
                    {max > 0 && goalMarks.map((idx, i) => (
                      <button key={i} type="button" className="mc-mark" style={{ left: `${(idx / max) * 100}%` }}
                              title={`Gol ${tl[idx].minute}'`} onClick={() => goTo(idx)} />
                    ))}
                  </div>
                  <span className="mc-tl-min">{tl[max]?.minute ?? 90}'</span>
                </div>
              </div>
            </div>
          </section>

          <aside className="mc-panel">
            <div className="mc-panel-head">
              <span className="mc-panel-title">
                {detailTab === 'timeline' && <><List size={14} /> Crónica en vivo</>}
                {detailTab === 'stats' && <><BarChart2 size={14} /> Estadísticas</>}
                {detailTab === 'ratings' && <><Crown size={14} /> Notas</>}
              </span>
              {playing && detailTab === 'timeline' && <span className="mc-panel-live">● EN JUEGO</span>}
            </div>
            {detailTab === 'timeline' && (
              <div className="mc-feed-wrap">
                {!hasTl ? (
                  <div className="mc-panel-empty">
                    <HistoryIcon size={28} className="text-[var(--gold-accent)]" />
                    <p>Registro antiguo — sin crónica minuto a minuto.</p>
                    {onResimulate && <MatchTunnelButton size="sm" loading={timeMachineLoading} onClick={onResimulate} />}
                  </div>
                ) : (
                  <div className="mc-feed" ref={feedRef}>
                    {tl.slice(0, cursor + 1).map((e, i) => (
                      <button key={i} type="button" data-event-idx={i}
                        className={cn('mc-feed-item', `mc-feed-item--${e.team}`, e.phase === 'gol' && 'goal', i === cursor && 'is-active')}
                        onClick={() => goTo(i)}>
                        <span className="mc-fi-min">{e.minute}'</span>
                        <span className="mc-fi-dot" style={{ background: PHASE_TONE[e.phase] }} />
                        <span className="mc-fi-txt">{e.text}</span>
                        {e.phase === 'gol' && Array.isArray(e.chain) && e.chain.length > 0 && (
                          <span className="mc-fi-replay" onClick={ev => { ev.stopPropagation(); setPlaying(false); setScreen('live'); setCursor(i); setReplayIdx(i); }}><Repeat size={10} /></span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {detailTab === 'stats' && (
              <div className="mc-stats-panel">
                <div className="mc-metrics">
                  <div className="mc-bh"><span style={{ color: kit.home }}>{homeName}</span><span className="mc-bl">MOMENTUM</span><span style={{ color: kit.away }}>{awayName}</span></div>
                  <div className="mc-momentum"><div className="mc-mom-h" style={{ width: `${momentum}%`, background: kit.home }} /><div className="mc-mom-a" style={{ width: `${100 - momentum}%`, background: kit.away }} /></div>
                  <Bar label="Posesión" l={`${atEnd ? possFinal : live.poss}%`} r={`${100 - (atEnd ? possFinal : live.poss)}%`} pct={atEnd ? possFinal : live.poss} />
                  <Bar label="Tiros" l={`${atEnd ? (result.homeStats?.shots ?? live.shotsH) : live.shotsH}`} r={`${atEnd ? (result.awayStats?.shots ?? live.shotsA) : live.shotsA}`} pct={share(atEnd ? result.homeStats?.shots : live.shotsH, atEnd ? result.awayStats?.shots : live.shotsA)} />
                  <Bar label="xG" l={xgH.toFixed(2)} r={xgA.toFixed(2)} pct={(xgH + xgA) ? xgH / (xgH + xgA) * 100 : 50} />
                </div>
                <div className="mc-radars">
                  <div className="mc-radar"><span style={{ color: kit.home }}>{homeName}</span><Radar axes={teamRadar(result.homeRatings ?? [])} size={120} color={kit.home} /></div>
                  <div className="mc-radar"><span style={{ color: kit.away }}>{awayName}</span><Radar axes={teamRadar(result.awayRatings ?? [])} size={120} color={kit.away} /></div>
                </div>
              </div>
            )}
            {detailTab === 'ratings' && (
              <div className="mc-ratings mc-ratings--stack">
                <RCol title={homeName} rows={result.homeRatings ?? []} motm={result.motm} />
                <RCol title={awayName} rows={result.awayRatings ?? []} motm={result.motm} />
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function share(h?: number, a?: number) { const t = (h ?? 0) + (a ?? 0); return t ? (h ?? 0) / t * 100 : 50; }
function Bar({ label, l, r, pct }: { label: string; l: string; r: string; pct: number }) {
  return (<div><div className="mc-bh"><span>{l}</span><span className="mc-bl">{label}</span><span>{r}</span></div>
    <div className="mc-bb"><div className="mc-bf" style={{ width: `${pct}%` }} /></div></div>);
}
function tone(v: number) { return v >= 8 ? 'var(--green-primary)' : v >= 7 ? 'color-mix(in srgb,var(--green-primary) 60%,var(--bg-elevated))' : v >= 6 ? 'var(--bg-elevated)' : 'color-mix(in srgb,var(--red-danger) 45%,var(--bg-elevated))'; }
function RCol({ title, rows, motm }: { title: string; rows: PlayerRating[]; motm: string }) {
  const s = [...rows].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  return (<div className="mc-rcol"><div className="mc-rct">{title}</div>
    {s.map((r, index) => (<div key={`${String(r.playerId ?? r.name)}-${index}`} className="mc-rr">
      <span className="mc-rn">{r.name === motm && <Crown size={11} className="mc-cr" />}
        {r.position && <PosBadge position={r.position} preferredPosition={(r as any).preferredPosition} short />}
        <PlayerLink id={Number(r.playerId) || null} name={r.name} /></span>
      <span className="mc-rm">{r.goals > 0 && `⚽${r.goals} `}{r.assists > 0 && `🅰${r.assists} `}{r.xg > 0 && `xG ${r.xg.toFixed(2)}`}</span>
      <span className="mc-rv" style={{ background: tone(r.rating ?? 5.0) }}>{(r.rating ?? 5.0).toFixed(1)}</span></div>))}</div>);
}

const MC_CSS = `
.mc{font-family:var(--font-sans);color:var(--text-primary);
  --mc-arena-bg:linear-gradient(165deg,#141f2e 0%,#162820 42%,#132218 100%);
  --mc-arena-head-bg:linear-gradient(180deg,rgba(255,255,255,.06),transparent);
  --mc-arena-shadow:0 0 0 1px rgba(255,255,255,.06),0 24px 60px rgba(0,0,0,.45),0 0 40px color-mix(in srgb,var(--mc-home) 14%,transparent);
  --mc-nav-bg:rgba(0,0,0,.28);
  --mc-nav-chip-bg:rgba(255,255,255,.06);
  --mc-link-bg:rgba(255,255,255,.06);
  --mc-panel-bg:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.32));
  --mc-feed-hover:rgba(255,255,255,.05);
  --mc-letterbox:var(--pitch-letterbox, linear-gradient(180deg,#1a3028,#122820));
  --mc-hud-fg:#fff;
  --mc-hud-muted:rgba(255,255,255,.78);
  --mc-hud-chip-bg:rgba(0,0,0,.48);
  --mc-hud-chip-fg:rgba(255,255,255,.9);
  --mc-controls-bg:linear-gradient(180deg,rgba(12,18,24,.92),rgba(16,24,30,.96));
  --mc-controls-border:rgba(255,255,255,.1);
  --mc-dock-bg:transparent;
  --mc-dock-btn-bg:rgba(255,255,255,.1);
  --mc-dock-btn-border:rgba(255,255,255,.14);
  --mc-dock-btn-fg:#fff;
  --mc-dock-chip-bg:rgba(255,255,255,.08);
  --mc-dock-chip-border:rgba(255,255,255,.12);
  --mc-dock-chip-fg:rgba(255,255,255,.75);
  --mc-tl-track:rgba(255,255,255,.18);
  --mc-tl-min:rgba(255,255,255,.6);
  --mc-screen-bg:rgba(0,0,0,.68);
  --mc-board-bg:var(--bg-surface);
  --mc-board-border:var(--border-color)}
:root[data-theme='light'] .mc{
  --mc-arena-bg:linear-gradient(165deg,#ffffff 0%,#f8fafc 48%,#f1f5f9 100%);
  --mc-arena-head-bg:linear-gradient(180deg,#ffffff,rgba(248,250,252,.85));
  --mc-arena-shadow:0 0 0 1px rgba(15,23,42,.06),0 16px 40px rgba(15,23,42,.08),0 0 32px color-mix(in srgb,var(--mc-home) 10%,transparent);
  --mc-nav-bg:rgba(15,23,42,.06);
  --mc-nav-chip-bg:rgba(255,255,255,.9);
  --mc-link-bg:var(--bg-elevated);
  --mc-panel-bg:var(--bg-surface);
  --mc-feed-hover:var(--row-hover);
  --mc-controls-bg:linear-gradient(180deg,#f8fafc,#f1f5f9);
  --mc-controls-border:var(--border-color);
  --mc-letterbox:linear-gradient(180deg,#e2e8f0,#cbd5e1);
  --mc-board-bg:var(--bg-surface);
  --mc-board-border:var(--border-color)}
.mc-arena{position:relative;border-radius:16px;overflow:hidden;
  background:var(--mc-arena-bg);
  border:1px solid color-mix(in srgb,var(--mc-home) 22%,var(--border-color));
  box-shadow:var(--mc-arena-shadow)}
.mc-arena-beam{position:absolute;top:-40%;left:20%;width:60%;height:50%;pointer-events:none;
  background:radial-gradient(ellipse,color-mix(in srgb,var(--green-primary) 8%,transparent),transparent 70%);opacity:.9}
.mc-arena-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;
  border-bottom:1px solid color-mix(in srgb,var(--border-color) 80%,transparent);
  background:var(--mc-arena-head-bg)}
.mc-arena-brand{display:flex;align-items:center;gap:10px;flex:1;min-width:0}
.mc-live{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:20px;
  font-size:.65rem;font-weight:800;letter-spacing:.1em;color:#fff;
  background:linear-gradient(135deg,#dc2626,#b91c1c);box-shadow:0 0 16px rgba(220,38,38,.5);animation:mcLivePulse 1.8s ease infinite}
.mc-live i{width:6px;height:6px;border-radius:50%;background:#fff;animation:mcLiveDot 1s step-end infinite}
@keyframes mcLivePulse{0%,100%{box-shadow:0 0 12px rgba(220,38,38,.4)}50%{box-shadow:0 0 22px rgba(220,38,38,.75)}}
@keyframes mcLiveDot{50%{opacity:.2}}
.mc-arena-tag{font-size:.68rem;font-weight:800;letter-spacing:.14em;color:var(--text-muted)}
.mc-arena-weather{font-size:.68rem;color:var(--text-muted);padding:2px 8px;border-radius:6px;background:var(--mc-nav-chip-bg)}
.mc-arena-nav{display:flex;gap:4px;padding:3px;border-radius:10px;background:var(--mc-nav-bg);border:1px solid var(--border-color)}
.mc-atab{display:flex;align-items:center;gap:5px;padding:7px 12px;border-radius:7px;border:none;cursor:pointer;
  font-size:.7rem;font-weight:700;color:var(--text-muted);background:transparent;transition:all .15s}
.mc-atab.on{color:var(--text-primary);background:var(--bg-surface);box-shadow:0 2px 8px rgba(0,0,0,.12)}
.mc-arena-links{display:flex;gap:6px}
.mc-alink{padding:6px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--mc-link-bg);
  font-size:.7rem;font-weight:700;color:var(--text-muted);cursor:pointer;transition:all .15s}
.mc-alink:hover{color:var(--text-primary);border-color:color-mix(in srgb,var(--text-muted) 50%,transparent)}
.mc-alink--gold{color:var(--gold-accent);border-color:color-mix(in srgb,var(--gold-accent) 35%,transparent)}
.mc-arena-body{display:grid;grid-template-columns:1fr;gap:0;min-height:0;align-items:stretch}
@media(min-width:920px){.mc-arena-body{grid-template-columns:minmax(0,1fr) min(300px,28vw);min-height:min(72dvh,860px)}}
.mc-theater{position:relative;min-width:0;display:flex;flex-direction:column;min-height:min(50dvh,520px)}
.mc-pitchwrap{position:relative;flex:1;display:flex;flex-direction:column;min-height:0;width:100%;background:var(--mc-letterbox)}
.mc-pitch-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:6px 8px;container-type:size;container-name:pitch}
.mc-pitch-inner{position:relative;width:min(100cqw,calc(100cqh * 108 / 64));aspect-ratio:108/64;max-width:100%;max-height:100cqh;border-radius:6px;overflow:hidden;
  box-shadow:0 8px 32px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.08)}
.mc-pitch-inner .p2d{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:none!important;border-radius:0}
.mc-controls{flex:none;padding:10px 12px 12px;background:var(--mc-controls-bg);border-top:1px solid var(--mc-controls-border)}
.mc-controls-top{margin-bottom:8px;min-height:22px}
.mc-live-ticker{display:inline-flex;align-items:center;gap:8px;font-size:.75rem;color:var(--text-muted)}
:root[data-theme='light'] .mc-live-ticker{color:var(--text-muted)}
.mc-live-ticker .mc-cap-min{color:var(--gold-accent)}
.mc-live-ticker .mc-cap-phase{background:rgba(255,255,255,.08);padding:2px 8px;border-radius:4px;font-size:.62rem;font-weight:800}
:root[data-theme='light'] .mc-live-ticker .mc-cap-phase{background:var(--bg-elevated)}
.mc-dock-caption{display:flex;align-items:center;gap:8px;font-size:.78rem;line-height:1.35;color:var(--text-primary)}
.mc-dock-caption .mc-cap-txt{color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.mc-dock-caption .mc-cap-min{color:var(--gold-accent);font-weight:800;font-size:.75rem;flex:none}
.mc-dock-caption .mc-cap-phase{font-size:.6rem;font-weight:800;letter-spacing:.08em;flex:none;padding:2px 8px;border-radius:4px;background:var(--bg-elevated)}
/* I2 · pista de comentario play-by-play (campo aparte, no step.text) */
.mc-commentary{display:flex;align-items:flex-start;gap:7px;margin-top:6px;font-size:.82rem;line-height:1.4;
  color:var(--text-primary);font-style:italic;border-left:2px solid var(--text-muted);padding-left:9px;
  animation:mcPbpIn .32s ease both}
.mc-commentary-mic{flex:none;width:7px;height:7px;border-radius:50%;margin-top:5px;background:var(--text-muted);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--text-muted) 22%,transparent)}
.mc-commentary--build,.mc-commentary--neutral{color:var(--text-secondary)}
.mc-commentary--goal{border-left-color:var(--green-primary);color:var(--green-primary);font-weight:700;font-style:normal}
.mc-commentary--goal .mc-commentary-mic{background:var(--green-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--green-primary) 30%,transparent)}
.mc-commentary--shot{border-left-color:var(--blue-info)}
.mc-commentary--shot .mc-commentary-mic{background:var(--blue-info)}
.mc-commentary--save{border-left-color:var(--teal-accent)}
.mc-commentary--save .mc-commentary-mic{background:var(--teal-accent)}
.mc-commentary--foul{border-left-color:var(--gold-accent)}
.mc-commentary--foul .mc-commentary-mic{background:var(--gold-accent)}
.mc-commentary--final{border-left-color:var(--gold-accent);font-weight:700;font-style:normal}
@keyframes mcPbpIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.mc-controls .mc-dock-row{margin-bottom:8px}
.mc-controls .mc-b{background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-primary)}
.mc-controls .mc-b:hover{background:var(--bg-surface);border-color:color-mix(in srgb,var(--text-muted) 40%,transparent)}
.mc-controls .mc-chip{background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-muted)}
.mc-controls .mc-chip.on{background:var(--gold-accent);color:var(--avatar-text);border-color:transparent}
.mc-controls .mc-tl-min{color:var(--text-muted)}
.mc-controls .mc-range::-webkit-slider-runnable-track{background:var(--border-color)}
@media(min-width:920px){
  .mc-theater{min-height:0}
  .mc-arena-body{min-height:min(78dvh,900px)}
}
.mc-weather-overlay{position:absolute;inset:0;pointer-events:none;z-index:1}
/* HUD marcador */
.mc-hud-score{position:absolute;top:6px;left:50%;transform:translateX(-50%);z-index:3;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:4px;
  width:min(96%,520px);padding:5px 10px;border-radius:999px;pointer-events:none;color:var(--mc-hud-fg);
  background:var(--mc-hud-bg,linear-gradient(180deg,rgba(0,0,0,.72),rgba(0,0,0,.45)));backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.1);box-shadow:0 6px 20px rgba(0,0,0,.35)}
.mc-hud-score--goal{animation:mcFlash 1s ease;border-color:color-mix(in srgb,var(--green-primary) 50%,transparent)}
.mc-hud-team{display:flex;align-items:center;gap:8px;min-width:0}
.mc-hud-team--a{justify-content:flex-end}
.mc-hud-name{font-weight:800;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mc-hud-mid{text-align:center}
.mc-hud-clock{font-size:.65rem;font-weight:700;color:var(--gold-accent);letter-spacing:.08em;display:block;margin-bottom:2px}
.mc-hud-goals{display:flex;align-items:center;justify-content:center;gap:6px}
.mc-hud-goals b{font-size:1.35rem;font-weight:900;color:var(--green-primary);line-height:1;text-shadow:0 0 12px color-mix(in srgb,var(--green-primary) 40%,transparent)}
.mc-hud-goals span{font-size:1.2rem;color:var(--mc-hud-muted);font-weight:700}
.mc-hud-poss{display:flex;height:3px;border-radius:2px;overflow:hidden;margin-top:6px;opacity:.85}
.mc-hud-poss i{display:block;height:100%;transition:width .5s ease}
.mc-hud-chips{position:absolute;top:46px;right:6px;z-index:3;display:flex;gap:4px;pointer-events:none}
.mc-chip-mini{font-size:.6rem;font-weight:700;padding:3px 8px;border-radius:6px;
  background:var(--mc-hud-chip-bg);border:1px solid rgba(255,255,255,.1);color:var(--mc-hud-chip-fg);backdrop-filter:blur(6px)}
/* Rótulo broadcast del jugador con el balón */
.mc-lt{position:absolute;bottom:10px;z-index:4;display:inline-flex;align-items:stretch;max-width:46%;border-radius:9px;overflow:hidden;
  pointer-events:none;background:linear-gradient(180deg,rgba(8,12,16,.94),rgba(8,12,16,.82));
  border:1px solid color-mix(in srgb,var(--lt-kit) 55%,transparent);
  box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 18px color-mix(in srgb,var(--lt-kit) 22%,transparent);
  transform:translateZ(0);animation:mcLtIn .34s cubic-bezier(.34,1.56,.64,1) both}
.mc-lt--home{left:12px}
.mc-lt--away{right:12px;flex-direction:row-reverse}
.mc-lt-num{display:flex;align-items:center;justify-content:center;min-width:34px;padding:0 8px;
  font-family:var(--font-scoreboard,var(--font-display));font-size:1.5rem;font-weight:900;line-height:1;
  color:#0b0f14;background:var(--lt-kit);text-shadow:0 1px 0 rgba(255,255,255,.25)}
.mc-lt-body{display:flex;flex-direction:column;justify-content:center;gap:2px;padding:5px 12px;min-width:0}
.mc-lt-name{font-family:var(--font-display);font-weight:800;font-size:.92rem;color:#fff;letter-spacing:.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:30ch;text-shadow:0 1px 3px rgba(0,0,0,.6)}
.mc-lt-sub{display:flex;align-items:center;gap:6px}
.mc-lt-verb{font-size:.6rem;font-weight:800;letter-spacing:.12em;color:var(--mc-hud-muted)}
.mc-lt--goal .mc-lt-num{background:var(--green-primary)}
.mc-lt--goal{animation:mcLtIn .34s cubic-bezier(.34,1.56,.64,1) both,mcLtGoal 1.1s ease-out .1s}
@keyframes mcLtIn{0%{opacity:0;transform:translateY(8px) scale(.96)}100%{opacity:1;transform:none}}
@keyframes mcLtGoal{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.5)}40%{box-shadow:0 0 30px var(--green-primary)}}
@container pitch (max-width:520px){
  .mc-lt-name{font-size:.78rem;max-width:18ch}.mc-lt-num{font-size:1.2rem;min-width:28px}.mc-lt-verb{display:none}}
.mc-kit{width:8px;height:12px;border-radius:2px;flex:none}
/* Controles bajo el campo (mc-hud-dock legacy oculto) */
.mc-hud-dock{display:none}
.mc-cap-min{color:var(--gold-accent);font-weight:800;font-size:.75rem;flex:none}
.mc-cap-phase{font-size:.6rem;font-weight:800;letter-spacing:.08em;flex:none;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.08)}
.mc-cap-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;opacity:.92}
.mc-dock-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.mc-dock-transport{display:flex;align-items:center;gap:6px}
.mc-dock-tools{display:flex;gap:5px;flex-wrap:wrap}
.mc-dock-timeline{display:flex;align-items:center;gap:8px}
.mc-tl-min{font-size:.65rem;font-weight:700;color:var(--mc-tl-min);flex:none;min-width:22px;text-align:center}
.mc-rangewrap{position:relative;flex:1;height:20px;display:flex;align-items:center}
.mc-tl-fill{position:absolute;left:0;top:50%;transform:translateY(-50%);height:4px;border-radius:2px;
  background:var(--green-primary);opacity:.5;pointer-events:none;transition:width .3s ease}
.mc-range{position:relative;z-index:1;width:100%;height:4px;appearance:none;background:transparent;cursor:pointer}
.mc-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:var(--mc-tl-track)}
.mc-range::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;margin-top:-5px;
  background:var(--green-primary);border:2px solid #fff;box-shadow:0 0 8px color-mix(in srgb,var(--green-primary) 60%,transparent)}
.mc-mark{position:absolute;top:50%;transform:translate(-50%,-50%);width:9px;height:9px;border-radius:50%;padding:0;border:2px solid rgba(0,0,0,.6);
  background:var(--green-primary);cursor:pointer;z-index:2}
.mc-b{display:grid;place-items:center;width:34px;height:34px;border-radius:8px;cursor:pointer;
  background:var(--mc-dock-btn-bg);border:1px solid var(--mc-dock-btn-border);color:var(--mc-dock-btn-fg);transition:all .12s}
.mc-b:hover{background:color-mix(in srgb,var(--mc-dock-btn-bg) 70%,#fff);transform:translateY(-1px)}
.mc-b--play{width:40px;height:40px;background:var(--green-primary);color:var(--avatar-text);border-color:transparent;
  box-shadow:0 0 20px color-mix(in srgb,var(--green-primary) 45%,transparent)}
.mc-chip{display:grid;place-items:center;min-width:32px;height:32px;padding:0 7px;border-radius:7px;font-size:.68rem;font-weight:700;cursor:pointer;
  background:var(--mc-dock-chip-bg);border:1px solid var(--mc-dock-chip-border);color:var(--mc-dock-chip-fg)}
.mc-chip.on{background:var(--gold-accent);color:var(--avatar-text);border-color:transparent}
.mc-ico-g{font-size:.9rem}
/* Panel lateral */
.mc-panel{display:flex;flex-direction:column;min-height:0;border-top:1px solid var(--border-color);
  background:var(--mc-panel-bg);max-height:min(58dvh,640px)}
@media(min-width:920px){.mc-panel{border-top:none;border-left:1px solid var(--border-color);max-height:none;height:100%}}
.mc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border-color);flex:none}
.mc-panel-title{display:inline-flex;align-items:center;gap:6px;font-size:.78rem;font-weight:800;color:var(--text-primary)}
.mc-panel-live{font-size:.62rem;font-weight:800;color:var(--green-primary);letter-spacing:.06em;animation:mcPanelLive 1.4s ease infinite}
@keyframes mcPanelLive{0%,100%{opacity:1}50%{opacity:.45}}
.mc-feed-wrap{flex:1;min-height:0;display:flex;flex-direction:column}
.mc-feed{flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:3px;overscroll-behavior:contain}
.mc-feed-item{display:flex;align-items:flex-start;gap:8px;width:100%;padding:7px 9px;border-radius:8px;border:1px solid transparent;
  background:transparent;cursor:pointer;text-align:left;color:var(--text-primary);transition:all .12s}
.mc-feed-item:hover{background:var(--mc-feed-hover);border-color:var(--border-color)}
.mc-feed-item.is-active{background:color-mix(in srgb,var(--gold-accent) 12%,transparent);border-color:color-mix(in srgb,var(--gold-accent) 40%,transparent);box-shadow:inset 3px 0 0 var(--gold-accent)}
.mc-feed-item.goal .mc-fi-txt{color:var(--green-primary);font-weight:700}
.mc-fi-min{font-size:.68rem;font-weight:700;color:var(--text-muted);flex:none;min-width:24px}
.mc-fi-dot{width:8px;height:8px;border-radius:50%;flex:none;margin-top:4px}
.mc-fi-txt{font-size:.78rem;line-height:1.35;flex:1}
.mc-fi-replay{display:grid;place-items:center;padding:4px;border-radius:4px;color:var(--gold-accent)}
.mc-panel-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px;text-align:center;color:var(--text-muted);font-size:.85rem}
/* Overlays partido */
.mc-lower3{position:absolute;left:10px;right:10px;bottom:140px;z-index:5;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;
  background:rgba(0,0,0,.8);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);animation:mcL3 4s ease both;color:var(--mc-hud-fg)}
.mc-l3-edge{position:absolute;left:0;top:0;bottom:0;width:5px;border-radius:10px 0 0 10px}
.mc-l3-score{font-weight:900;font-size:1.8rem;color:var(--green-primary);flex:none}
.mc-l3-body{flex:1;min-width:0}
.mc-l3-title{font-weight:800;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--mc-hud-fg)}
.mc-l3-sub{font-size:.75rem;color:var(--mc-hud-muted)}
.mc-l3-replay,.mc-l3-close{border:none;cursor:pointer;border-radius:6px}
.mc-l3-replay{padding:6px 10px;background:var(--gold-accent);color:var(--avatar-text);font-weight:700;font-size:.65rem;display:flex;align-items:center;gap:4px}
.mc-l3-close{position:absolute;top:6px;right:8px;width:24px;height:24px;background:rgba(255,255,255,.1);color:#fff;font-size:1rem}
@keyframes mcL3{0%{opacity:0;transform:translateY(20px)}10%,85%{opacity:1;transform:none}100%{opacity:0}}
.mc-wipe{position:absolute;inset:0;z-index:6;pointer-events:none;
  background:linear-gradient(105deg,transparent 30%,rgba(34,197,94,.3) 50%,transparent 70%);background-size:200% 100%;
  animation:mcWipe .8s ease both}
@keyframes mcWipe{0%{background-position:100% 0}100%{background-position:-100% 0;opacity:0}}
.mc-screen{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;text-align:center;
  background:var(--mc-screen-bg);backdrop-filter:blur(8px);color:var(--mc-hud-fg)}
.mc-sc-label{font-size:.72rem;font-weight:700;letter-spacing:.1em;color:var(--mc-hud-muted);text-transform:uppercase}
.mc-sc-big{font-size:2rem;font-weight:900;color:var(--gold-accent);letter-spacing:.12em}
.mc-sc-score{font-family:var(--font-scoreboard);font-size:1.85rem;font-weight:400;letter-spacing:0.02em}
.mc-sc-score--xl{font-size:2.75rem;color:var(--green-primary)}
.mc-sc-motm{font-size:.85rem;display:flex;align-items:center;gap:6px}
.mc-sc-actions{display:flex;gap:8px;margin-top:8px}
.mc-cta{display:flex;align-items:center;gap:6px;padding:10px 18px;border-radius:8px;border:none;cursor:pointer;
  font-weight:800;font-size:.8rem;background:var(--green-primary);color:var(--avatar-text)}
.mc-lineups{display:grid;grid-template-columns:1fr 1fr;gap:16px;width:min(480px,94%);text-align:left}
.mc-xi-t{font-weight:700;font-size:.85rem;margin-bottom:4px}
.mc-xi-line{display:flex;gap:6px;font-size:.72rem;line-height:1.4}
.mc-xi-pos{color:var(--mc-hud-muted);min-width:24px;font-weight:600}
.mc-pop{animation:mcPop .4s cubic-bezier(.3,1.6,.5,1)}
@keyframes mcPop{0%{transform:scale(1)}40%{transform:scale(1.2)}100%{transform:scale(1)}}
@keyframes mcFlash{0%,100%{box-shadow:0 8px 24px rgba(0,0,0,.4)}50%{box-shadow:0 0 28px color-mix(in srgb,var(--green-primary) 50%,transparent)}}
/* Stats panel */
.mc-stats-panel{padding:12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto}
.mc-metrics{display:flex;flex-direction:column;gap:8px}
.mc-momentum{display:flex;height:8px;border-radius:4px;overflow:hidden;border:1px solid var(--border-color)}
.mc-mom-h,.mc-mom-a{transition:width .5s ease}
.mc-bh{display:flex;justify-content:space-between;font-size:.72rem;font-weight:600}
.mc-bl{color:var(--text-muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.06em}
.mc-bb{height:5px;border-radius:3px;background:var(--bg-elevated);overflow:hidden}
.mc-bf{height:100%;background:var(--green-primary);transition:width .4s ease}
.mc-radars{display:flex;flex-direction:column;gap:8px;align-items:center}
.mc-radar{display:flex;flex-direction:column;align-items:center;gap:4px}
.mc-radar span{font-size:.75rem;font-weight:700}
.mc-ratings--stack{padding:10px;gap:10px;overflow-y:auto}
.mc-rcol{background:var(--bg-surface);border:1px solid var(--border-color);border-radius:10px;padding:10px}
.mc-rct{font-weight:800;font-size:.82rem;padding-bottom:8px}
.mc-rr{display:flex;align-items:center;gap:6px;padding:5px 2px;font-size:.75rem;border-top:1px solid color-mix(in srgb,var(--border-color) 50%,transparent)}
.mc-rn{flex:1;display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-rm{font-size:.65rem;color:var(--text-muted)}
.mc-rv{font-weight:700;font-size:.72rem;min-width:28px;text-align:center;border-radius:5px;padding:2px 0;color:var(--avatar-text)}
.mc-cr{color:var(--gold-accent)}
/* Marcador simple sin timeline */
.mc-board{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:16px 20px;
  background:var(--mc-board-bg);border:1px solid var(--mc-board-border);border-radius:12px;margin-bottom:12px}
.mc-side{display:flex;align-items:center;gap:10px;min-width:0}
.mc-side--a{justify-content:flex-end;text-align:right}
.mc-tname{font-weight:800;font-size:.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-score{text-align:center}
.mc-score b{font-family:var(--font-scoreboard);font-size:2.35rem;font-weight:400;color:var(--green-primary);line-height:1;letter-spacing:0.02em}
.mc-score i{font-size:1.4rem;color:var(--text-muted);font-style:normal;padding:0 4px}
.mc-clock{display:block;font-size:.68rem;font-weight:700;color:var(--text-muted);letter-spacing:.08em;margin-top:4px}
@media(max-width:680px){
  .mc-arena-head{flex-direction:column;align-items:stretch;padding:8px 10px}
  .mc-arena-nav{order:3}
  .mc-arena-tag{display:none}
  .mc-hud-name{display:none}
  .mc-theater{min-height:48dvh}
  .mc-controls{padding:8px 10px 10px}
}
@media(prefers-reduced-motion:reduce){.mc *,.mc *::before,.mc *::after{animation:none!important;transition:none!important}}
`;
