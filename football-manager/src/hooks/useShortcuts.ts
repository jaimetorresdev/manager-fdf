// ─── Atajos de teclado globales (issue 6.1a) ──────────────────────────────────
// Secuencias estilo "g luego tecla" para navegar (g d → dashboard…) y "?" para
// abrir la ayuda de atajos. Se ignoran cuando el foco está en un campo editable.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export const SHORTCUTS: { keys: string; i18nKey: string; path: string }[] = [
  { keys: 'g d', i18nKey: 'shortcuts.club', path: '/' },
  { keys: 'g p', i18nKey: 'shortcuts.squad', path: '/squad' },
  { keys: 'g t', i18nKey: 'shortcuts.tactics', path: '/tactics' },
  { keys: 'g m', i18nKey: 'shortcuts.market', path: '/market' },
  { keys: 'g u', i18nKey: 'shortcuts.auctions', path: '/auctions' },
  { keys: 'g n', i18nKey: 'shortcuts.negotiations', path: '/negotiations' },
  { keys: 'g e', i18nKey: 'shortcuts.economy', path: '/economy' },
  { keys: 'g c', i18nKey: 'shortcuts.calendar', path: '/calendar' },
  { keys: 'g l', i18nKey: 'shortcuts.league', path: '/league' },
  { keys: 'g w', i18nKey: 'shortcuts.competitions', path: '/world' },
  { keys: 'g v', i18nKey: 'shortcuts.live', path: '/live' },
  { keys: 'g a', i18nKey: 'shortcuts.news', path: '/news' },
  { keys: 'g f', i18nKey: 'shortcuts.forum', path: '/forum' },
  { keys: 'g h', i18nKey: 'shortcuts.manual', path: '/manual' },
];

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function useShortcuts() {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingG = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;

      // "?" abre/cierra la ayuda
      if (e.key === '?') { e.preventDefault(); setHelpOpen(o => !o); return; }
      if (e.key === 'Escape') { setHelpOpen(false); return; }

      // Secuencia g + tecla (ventana de 1.2s)
      if (e.key === 'g' || e.key === 'G') {
        if (pendingG.current != null) clearTimeout(pendingG.current);
        pendingG.current = window.setTimeout(() => { pendingG.current = null; }, 1200);
        return;
      }
      if (pendingG.current != null) {
        const hit = SHORTCUTS.find(s => s.keys === `g ${e.key.toLowerCase()}`);
        clearTimeout(pendingG.current);
        pendingG.current = null;
        if (hit) { e.preventDefault(); navigate(hit.path); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (pendingG.current != null) clearTimeout(pendingG.current);
    };
  }, [navigate]);

  return { helpOpen, closeHelp: () => setHelpOpen(false) };
}
