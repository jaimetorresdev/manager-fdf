// ─── useGameState ────────────────────────────────────────────────────────────
// Hook que mantiene el estado del juego sincronizado con el backend.
// Hace polling cada 30s y expone el tiempo restante hasta el próximo turno.

import { useEffect, useState } from 'react';
import { gameApi } from '../api/client';

export interface GameStateData {
  season: string; // nombre de temporada, p. ej. "2024-25"
  week:   number;
  phase:  string;
  turn:   number;
  inGameDate: string;
  nextTickAt: string | null;
  isLocked: boolean;
}

// Calcula el próximo turno asumiendo crones a las 11:00 y 23:00 hora peninsular (CET/CEST),
// usando aproximación UTC (10:00 y 22:00 UTC) para evitar desfases locales del navegador.
function computeNextTick(): Date {
  const now = new Date();
  const next11 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 10, 0, 0));
  const next23 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0));

  if (now < next11) return next11;
  if (now < next23) return next23;
  
  const tomorrow11 = new Date(next11);
  tomorrow11.setUTCDate(now.getUTCDate() + 1);
  return tomorrow11;
}

export function useGameState(enabled: boolean = true) {
  const [state, setState] = useState<GameStateData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await gameApi.getState();
        if (cancelled) return;
        setState({
          season: data.season,
          week:   data.week,
          phase:  data.phase,
          turn:   data.turn,
          inGameDate: data.inGameDate,
          nextTickAt: data.nextTickAt || computeNextTick().toISOString(),
          isLocked: data.isLocked,
        });
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  return { state, loading, error };
}

// Hook que devuelve segundos restantes hasta `target` y los actualiza cada segundo.
export function useCountdown(target: string | undefined | null): { hours: number; minutes: number; seconds: number; total: number } {
  const [total, setTotal] = useState(() => target ? Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)) : 0);

  useEffect(() => {
    if (!target) {
      setTotal(0);
      return;
    }
    // Update immediately when target changes
    setTotal(Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000)));
    
    const id = setInterval(() => {
      const diff = Math.max(0, Math.floor((new Date(target).getTime() - Date.now()) / 1000));
      setTotal(diff);
    }, 1000);
    return () => clearInterval(id);
  }, [target]);

  return {
    hours:   Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    total,
  };
}
