import { useEffect, useState } from 'react';

interface CountUpOptions {
  duration?: number;
  enabled?: boolean;
  decimals?: number;
}

/** Anima un número de 0 → target al montar (easing ease-out cúbico). */
export function useCountUp(target: number, opts: CountUpOptions = {}) {
  const { duration = 720, enabled = true, decimals = 0 } = opts;
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, enabled]);

  if (decimals > 0) return Number(value.toFixed(decimals));
  return Math.round(value);
}
