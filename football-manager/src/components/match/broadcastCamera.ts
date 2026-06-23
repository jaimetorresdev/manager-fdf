// I-9 · Cámara broadcast: zoom/pan según zona del balón
import type { TimelineEntry } from '../../types/engine';

const W = 100;
const H = 64;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface BroadcastCamera {
  viewBox: string;
  scale: number;
}

export type CameraPreset = 'auto' | 'wide' | 'tight' | 'director';

export function cameraForStep(step?: TimelineEntry, duel = false, preset: CameraPreset = 'auto'): BroadcastCamera {
  if (!step) return { viewBox: `0 0 ${W} ${H}`, scale: 1 };

  // Vista completa por defecto — solo acerca en modos tight/director o jugadas clave con preset auto suave
  if (preset === 'wide') return { viewBox: `0 0 ${W} ${H}`, scale: 1 };

  // Lienzo extendido (Pitch2D dibuja las redes tras las líneas de gol).
  const MIN_X = -4, MAX_X = 104;
  const zoneX: Record<string, number> = { def: 22, med: 50, ataque: 76, area: 90 };
  const base = zoneX[step.zone] ?? 50;
  const ballX = step.team === 'away' ? W - base : base;
  // En gol/remate la cámara se va hacia la portería atacada (donde entra el balón).
  const goalX = step.team === 'home' ? 100 : 0;
  const focusX = step.phase === 'gol' || step.phase === 'remate'
    ? lerp(ballX, goalX, step.phase === 'gol' ? 0.85 : 0.55)
    : ballX;
  const ballY = 32;

  let zoom = preset === 'tight' ? 1.35
    : preset === 'director' ? (duel ? 1.25 : step.phase === 'gol' ? 1.24 : step.phase === 'remate' ? 1.16 : 1.08)
    : duel ? 1.12 : step.phase === 'gol' ? 1.22 : step.phase === 'remate' ? 1.12 : step.zone === 'area' ? 1.1 : 1;
  zoom = Math.min(zoom, 1.35);
  if (zoom <= 1.01) return { viewBox: `0 0 ${W} ${H}`, scale: 1 };

  const vw = W / zoom;
  const vh = H / zoom;
  const cx = Math.max(MIN_X + vw / 2, Math.min(MAX_X - vw / 2, focusX));
  const cy = Math.max(vh / 2, Math.min(H - vh / 2, ballY));
  const x = cx - vw / 2;
  const y = cy - vh / 2;

  return { viewBox: `${x.toFixed(2)} ${y.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`, scale: zoom };
}

// ── Cámara suave por transform (sin saltos de viewBox) ────────────────────────
// El zoom OBJETIVO depende de la fase y el preset; el seguimiento/suavizado del
// centro vive en Pitch2D (donde está el balón en vivo cada frame). 'wide' mantiene
// el campo completo salvo un punch-in cinematográfico en los grandes momentos.
export function targetZoom(step?: TimelineEntry, duel = false, preset: CameraPreset = 'auto'): number {
  if (!step) return 1;
  if (preset === 'wide') {
    return step.phase === 'gol' ? 1.16 : step.phase === 'remate' ? 1.09 : step.phase === 'parada' ? 1.07 : 1;
  }
  const zoom = preset === 'tight' ? 1.32
    : preset === 'director' ? (duel ? 1.22 : step.phase === 'gol' ? 1.26 : step.phase === 'remate' ? 1.18 : step.phase === 'parada' ? 1.16 : 1.10)
    : /* auto */ step.phase === 'gol' ? 1.22 : step.phase === 'remate' ? 1.14 : step.phase === 'parada' ? 1.12
      : step.zone === 'area' ? 1.10 : duel ? 1.09 : 1.05;
  return Math.min(zoom, 1.35);
}

/** Muelle críticamente amortiguado (Unity SmoothDamp) — seguimiento sin tirones.
 *  Muta vel.v (velocidad actual del eje) y devuelve la nueva posición. */
export function smoothDampAxis(cur: number, target: number, vel: { v: number }, smoothTime: number, dt: number): number {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel.v + omega * change) * dt;
  vel.v = (vel.v - omega * temp) * e;
  return target + (change + temp) * e;
}

export function isDuelStep(step?: TimelineEntry): boolean {
  if (!step) return false;
  if (step.duel) return true;
  if (step.phase === 'remate' || step.phase === 'parada') return true;
  if (!step.chain?.length) return false;
  return step.chain.some(c =>
    c.step === 'regate' || c.def != null || /duelo|regate|entrada|parada/i.test(c.text ?? ''),
  );
}

export function weatherTint(weather?: string): string | undefined {
  if (!weather) return undefined;
  const w = weather.toLowerCase();
  if (w.includes('lluv') || w.includes('rain')) return 'color-mix(in srgb, var(--blue-info) 18%, transparent)';
  if (w.includes('nubl') || w.includes('cloud')) return 'color-mix(in srgb, var(--text-muted) 22%, transparent)';
  if (w.includes('noche') || w.includes('night')) return 'color-mix(in srgb, var(--bg-base) 35%, transparent)';
  if (w.includes('sol') || w.includes('☀')) return 'color-mix(in srgb, var(--gold-accent) 8%, transparent)';
  return undefined;
}
