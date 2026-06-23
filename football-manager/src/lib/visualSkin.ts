// ─── Skin visual opcional (CRT retro) ─────────────────────────────────────────
// Off por defecto; activable desde A11yMenu sin imponer estética retro.

export interface VisualSkinSettings {
  crt: boolean;
}

const KEY = 'fdf_visual_skin';
const DEFAULTS: VisualSkinSettings = { crt: false };

export function getVisualSkin(): VisualSkinSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<VisualSkinSettings>;
    return { crt: parsed.crt === true };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyVisualSkin(s: VisualSkinSettings): void {
  const root = document.documentElement;
  if (s.crt) root.setAttribute('data-crt', '1');
  else root.removeAttribute('data-crt');
  document.body.classList.toggle('crt-scanlines', s.crt);
}

export function setVisualSkin(s: VisualSkinSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sin persistencia */
  }
  applyVisualSkin(s);
}

export function applyStoredVisualSkin(): void {
  applyVisualSkin(getVisualSkin());
}
