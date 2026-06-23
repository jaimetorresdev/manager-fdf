import { useEffect, type RefObject } from 'react';

// ─── Preferencias de accesibilidad (issue 6.1a) ───────────────────────────────
// Modo daltónico (paleta Okabe-Ito: verde→azul, rojo→naranja vía tokens CSS) y
// tamaño de fuente global (html font-size → escala todo lo basado en rem).
// Persistencia en localStorage; se aplican como data-attrs en <html> y las
// hojas de estilo de index.css hacen el resto.

export type FontScale = 'sm' | 'md' | 'lg';
export interface A11ySettings { colorblind: boolean; fontScale: FontScale }

const KEY = 'fdf_a11y';
const DEFAULTS: A11ySettings = { colorblind: false, fontScale: 'md' };

export function getA11y(): A11ySettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<A11ySettings>;
    return {
      colorblind: parsed.colorblind === true,
      fontScale: parsed.fontScale === 'sm' || parsed.fontScale === 'lg' ? parsed.fontScale : 'md',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyA11y(s: A11ySettings): void {
  const root = document.documentElement;
  if (s.colorblind) root.setAttribute('data-cb', '1');
  else root.removeAttribute('data-cb');
  if (s.fontScale === 'md') root.removeAttribute('data-fontsize');
  else root.setAttribute('data-fontsize', s.fontScale);
}

export function setA11y(s: A11ySettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sin persistencia */ }
  applyA11y(s);
}

/** Llamar una vez al arrancar la app (AppLayout). */
export function applyStoredA11y(): void {
  applyA11y(getA11y());
}

/**
 * Trap focus within an element when active.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current;
    
    // Ocultar el resto de la app a screen readers para hacer el modal "verdaderamente modal"
    // Buscamos el div root (id="root"). Si existe, le ponemos aria-hidden, pero no al modal
    // (Asumimos que los modales se montan en un portal o al final del body fuera del root? 
    // En FDF no usamos portales para modales, se renderizan in-place. Mejor no tocar aria-hidden del root
    // a menos que estemos seguros de que el modal no es descendiente de #root).

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = el.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      
      if (focusable.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === el) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [active, ref]);
}
