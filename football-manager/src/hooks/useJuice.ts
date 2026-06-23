import { useCallback, useId, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { cn } from '../lib/cn';

export type JuiceIntensity = 'subtle' | 'medium' | 'epic';

interface JuiceConfig {
  punch: boolean;
  shake: boolean;
  flash: boolean;
  particles: number;
  scorePop: boolean;
}

const INTENSITY: Record<JuiceIntensity, JuiceConfig> = {
  subtle: { punch: true, shake: false, flash: false, particles: 0, scorePop: false },
  medium: { punch: true, shake: true, flash: true, particles: 4, scorePop: true },
  epic: { punch: true, shake: true, flash: true, particles: 10, scorePop: true },
};

export interface JuicePop {
  id: string;
  style: CSSProperties;
}

interface UseJuiceResult<T extends HTMLElement = HTMLElement> {
  ref: RefObject<T | null>;
  trigger: () => void;
  bind: {
    ref: RefObject<T | null>;
    className: string;
    onAnimationEnd: (e: React.AnimationEvent) => void;
  };
  pops: JuicePop[];
  particles: JuicePop[];
  intensity: JuiceIntensity;
}

let popSeq = 0;

/**
 * Feedback táctil unificado: punch-scale, shake, flash y partículas.
 * Usa `.score-pop` para el burst efímero en intensidades medium/epic.
 */
export function useJuice<T extends HTMLElement = HTMLElement>(
  intensity: JuiceIntensity = 'subtle',
): UseJuiceResult<T> {
  const ref = useRef<T | null>(null);
  const uid = useId();
  const [fx, setFx] = useState<string[]>([]);
  const [pops, setPops] = useState<JuicePop[]>([]);
  const [particles, setParticles] = useState<JuicePop[]>([]);

  const clearFx = useCallback(() => setFx([]), []);

  const trigger = useCallback(() => {
    const cfg = INTENSITY[intensity];
    const next: string[] = [];
    if (cfg.punch) next.push('juice-punch');
    if (cfg.shake) next.push('juice-shake');
    if (cfg.flash) next.push('juice-flash');
    setFx(next);

    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    if (cfg.scorePop) {
      const id = `${uid}-pop-${++popSeq}`;
      setPops(p => [...p, { id, style: { left: cx, top: cy } }]);
      window.setTimeout(() => setPops(p => p.filter(x => x.id !== id)), 420);
    }

    if (cfg.particles > 0) {
      const burst = Array.from({ length: cfg.particles }, (_, i) => {
        const angle = (i / cfg.particles) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 18 + Math.random() * (intensity === 'epic' ? 36 : 22);
        return {
          id: `${uid}-pt-${++popSeq}-${i}`,
          style: {
            left: cx,
            top: cy,
            ['--jx' as string]: `${Math.cos(angle) * dist}px`,
            ['--jy' as string]: `${Math.sin(angle) * dist}px`,
            ['--jd' as string]: `${0.32 + Math.random() * 0.28}s`,
          } as CSSProperties,
        };
      });
      setParticles(p => [...p, ...burst]);
      window.setTimeout(
        () => setParticles(p => p.filter(x => !burst.some(b => b.id === x.id))),
        520,
      );
    }
  }, [intensity, uid]);

  return {
    ref,
    trigger,
    bind: {
      ref,
      className: cn('juice-host', ...fx),
      onAnimationEnd: e => {
        if (e.target === ref.current) clearFx();
      },
    },
    pops,
    particles,
    intensity,
  };
}
