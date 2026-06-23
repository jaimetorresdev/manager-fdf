// ─── broadcastAudio — efectos de sonido del Match Center (B18) ────────────────
// Web Audio sintetizado (0 assets), OFF por defecto. El AudioContext se crea
// perezosamente en el primer uso (requiere gesto del usuario) y todo va
// envuelto en try/catch: si el navegador lo bloquea, el partido sigue mudo.

let ctx: AudioContext | null = null;
let ambientStop: (() => void) | null = null;

const AMBIENT_KEY = 'fdf_ambient';

export function isAmbientEnabled(): boolean {
  try { return localStorage.getItem(AMBIENT_KEY) === '1'; } catch { return false; }
}

export function setAmbientEnabled(on: boolean): void {
  try { localStorage.setItem(AMBIENT_KEY, on ? '1' : '0'); } catch { /* noop */ }
  if (!on) stopAmbientLoop();
}

function prefersReducedMotion(): boolean {
  try { return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; } catch { return false; }
}

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol = 0.12, type: OscillatorType = 'square') {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, c.currentTime + start);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.05);
}

/** Ráfaga corta de "grada" (ruido blanco filtrado). */
function crowd(c: AudioContext, start: number, dur: number, vol = 0.08) {
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 900;
  filter.Q.value = 0.6;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol, c.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(c.currentTime + start);
}

/** ¡Gol!: arpegio ascendente + rugido de grada. */
export function playGoal() {
  const c = ensureCtx();
  if (!c) return;
  try {
    tone(c, 523, 0, 0.12);     // C5
    tone(c, 659, 0.1, 0.12);   // E5
    tone(c, 784, 0.2, 0.26);   // G5
    crowd(c, 0.05, 1.1, 0.1);
  } catch { /* silencio digno */ }
}

/** Silbato (descanso / final): dos pitidos agudos. */
export function playWhistle(double = true) {
  const c = ensureCtx();
  if (!c) return;
  try {
    tone(c, 2200, 0, 0.18, 0.07, 'sine');
    if (double) tone(c, 2200, 0.26, 0.3, 0.07, 'sine');
  } catch { /* nada */ }
}

/** Saque inicial: pitido único + murmullo. */
export function playKickoff() {
  const c = ensureCtx();
  if (!c) return;
  try {
    tone(c, 2000, 0, 0.22, 0.06, 'sine');
    crowd(c, 0, 0.7, 0.05);
  } catch { /* nada */ }
}

/** Murmullo de grada en bucle (ambiente matchday). Respeta reduced-motion. */
export function startAmbientLoop(vol = 0.045) {
  if (prefersReducedMotion() || !isAmbientEnabled()) return;
  stopAmbientLoop();
  const c = ensureCtx();
  if (!c) return;
  try {
    const len = Math.ceil(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 650;
    filter.Q.value = 0.5;
    const gain = c.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    ambientStop = () => {
      try { gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.2); src.stop(c.currentTime + 0.25); } catch { /* noop */ }
      ambientStop = null;
    };
  } catch { /* nada */ }
}

export function stopAmbientLoop() {
  try { ambientStop?.(); } catch { /* noop */ }
  ambientStop = null;
}
