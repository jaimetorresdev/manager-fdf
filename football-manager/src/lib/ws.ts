// ─── Cliente WebSocket con reconexión y fallback a polling ────────────────────
// Contrato (API_UI.md §11 + QB8): rutas `ws://<host>/ws/<tipo>/<id>` con ticket
// efímero `?ticket=` (POST /ws/ticket + Bearer). Legacy `?token=` solo en DEV.
// Canales: chat/:channel · auction/:id · league/:id · club/:id · user/:id · match/:id.
// Frames servidor→cliente: {type, channel, payload, ts}. Fallback a polling si WS falla.
import { getToken, issueWsTicket, apiOrigin } from '../api/client';
import { parseJson } from './normalize';

type Listener = (msg: { type: string; channel?: string; payload: unknown; ts?: string }) => void;

const WS_BASE = (() => {
  try {
    return apiOrigin().replace(/^http/, 'ws');
  } catch { return ''; }
})();

const LEGACY_TOKEN_QUERY = import.meta.env.DEV;

/** "auction:12" | "chat:general" | "club:4" → ruta real /ws/auction/12 … */
function channelPath(channel: string): string {
  const [kind, ...rest] = channel.split(':');
  if (kind === 'system') return '/ws/system';
  return `/ws/${kind}${rest.length ? `/${rest.join(':')}` : ''}`;
}

export interface LiveChannel {
  close: () => void;
  /** Envía un frame JSON por el WS (p.ej. {type:'chat:send', text}). No-op en polling. */
  send: (frame: Record<string, unknown>) => boolean;
  readonly mode: 'ws' | 'polling';
}

/**
 * Suscribe a un canal. Si WS falla (o se cae 3 veces), pasa a polling:
 * llama a `poll()` cada `pollMs` y emite {type:'poll', payload}.
 */
export function subscribe(
  channel: string,
  onMessage: Listener,
  poll?: () => Promise<unknown>,
  pollMs = 5000,
): LiveChannel {
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retries = 0;
  let closed = false;
  let mode: 'ws' | 'polling' = 'ws';

  const startPolling = () => {
    if (closed || pollTimer || !poll) return;
    mode = 'polling';
    const tick = async () => { try { onMessage({ type: 'poll', payload: await poll() }); } catch { /* siguiente */ } };
    tick();
    pollTimer = setInterval(tick, pollMs);
  };

  const connect = async () => {
    if (closed) return;
    try {
      const token = getToken();
      let qs = '';
      if (token) {
        const ticket = await issueWsTicket();
        if (ticket) qs = `?ticket=${encodeURIComponent(ticket)}`;
        else if (LEGACY_TOKEN_QUERY) qs = `?token=${encodeURIComponent(token)}`;
        else { startPolling(); return; }
      }
      ws = new WebSocket(`${WS_BASE}${channelPath(channel)}${qs}`);
      ws.onmessage = (e) => {
        const msg = parseJson<{ type: string; channel?: string; payload: unknown; ts?: string }>(
          typeof e.data === 'string' ? e.data : '',
        );
        if (msg) onMessage(msg);
      };
      ws.onopen = () => { retries = 0; mode = 'ws'; };
      ws.onclose = () => {
        if (closed) return;
        retries += 1;
        if (retries >= 3) startPolling();
        else setTimeout(() => { void connect(); }, 1000 * retries);
      };
      ws.onerror = () => ws?.close();
    } catch {
      startPolling();
    }
  };

  if (typeof WebSocket !== 'undefined' && WS_BASE) void connect();
  else startPolling();

  return {
    close: () => { closed = true; ws?.close(); if (pollTimer) clearInterval(pollTimer); },
    send: (frame) => {
      if (ws && ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify(frame)); return true; }
      return false;
    },
    get mode() { return mode; },
  };
}
