// ─── Menú de accesibilidad del TopBar (issue 6.1a) ────────────────────────────
// Modo daltónico (paleta azul/naranja Okabe-Ito) + tamaño de texto A−/A/A+.
import { useEffect, useRef, useState } from 'react';
import { Accessibility, Keyboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getA11y, setA11y, type A11ySettings, type FontScale } from '../../lib/a11y';
import { getVisualSkin, setVisualSkin, type VisualSkinSettings } from '../../lib/visualSkin';
import { cn } from '../../lib/cn';

const SIZES: { key: FontScale; label: string }[] = [
  { key: 'sm', label: 'A−' },
  { key: 'md', label: 'A' },
  { key: 'lg', label: 'A+' },
];

export function A11yMenu() {
  const { t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<A11ySettings>(() => getA11y());
  const [skin, setSkin] = useState<VisualSkinSettings>(() => getVisualSkin());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const update = (next: A11ySettings) => { setPrefs(next); setA11y(next); };
  const updateSkin = (next: VisualSkinSettings) => { setSkin(next); setVisualSkin(next); };

  return (
    <div className="relative" ref={ref}>
      <style>{`
        .a11y-pop{position:absolute;right:0;top:calc(100% + 6px);width:240px;z-index:200;padding:12px;
          background:var(--bg-surface);border:1px solid var(--border-color);border-radius:8px;box-shadow:var(--shadow-soft)}
        .a11y-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 0}
        .a11y-lbl{font-size:.76rem;color:var(--text-primary)}
        .a11y-sw{position:relative;width:36px;height:20px;border-radius:99px;border:1px solid var(--border-color);
          background:var(--bg-elevated);cursor:pointer;transition:background .15s}
        .a11y-sw[data-on='1']{background:var(--green-primary);border-color:transparent}
        .a11y-sw::after{content:'';position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
          background:var(--text-primary);transition:transform .15s}
        .a11y-sw[data-on='1']::after{transform:translateX(16px);background:var(--avatar-text)}
        .a11y-size{display:flex;gap:4px}
        .a11y-sz{padding:3px 9px;border-radius:6px;font-family:var(--font-mono-retro);font-size:.74rem;cursor:pointer;
          background:var(--bg-elevated);border:1px solid var(--border-color);color:var(--text-muted)}
        .a11y-sz.on{color:var(--avatar-text);background:var(--green-primary);border-color:transparent}
        .a11y-hint{display:flex;align-items:center;gap:6px;margin-top:8px;padding-top:8px;font-size:.68rem;
          color:var(--text-muted);border-top:1px solid var(--border-color)}
        .a11y-kbd{font-family:var(--font-mono-retro);border:1px solid var(--border-color);border-radius:4px;padding:0 5px}
      `}</style>
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="nav-icon-btn"
        title={t('a11y.menuLabel', 'Accesibilidad')}
        aria-label={t('a11y.menuOptions', 'Opciones de accesibilidad')}
        aria-expanded={open}
        style={prefs.colorblind || prefs.fontScale !== 'md' || skin.crt ? { color: 'var(--green-primary)', borderColor: 'var(--green-primary)' } : undefined}
      >
        <Accessibility size={15} />
      </button>
      {open && (
        <div className="a11y-pop" onMouseDown={(e) => e.stopPropagation()}>
          <div className="a11y-row">
            <span className="a11y-lbl">{t('a11y.colorblindMode', 'Modo daltónico')}</span>
            <button
              className="a11y-sw"
              data-on={prefs.colorblind ? '1' : '0'}
              role="switch"
              aria-checked={prefs.colorblind}
              aria-label={t('a11y.colorblindMode', 'Modo daltónico')}
              onClick={() => update({ ...prefs, colorblind: !prefs.colorblind })}
            />
          </div>
          <div className="a11y-row">
            <span className="a11y-lbl">{t('a11y.textSize', 'Tamaño de texto')}</span>
            <div className="a11y-size">
              {SIZES.map(s => (
                <button key={s.key} className={cn('a11y-sz', prefs.fontScale === s.key && 'on')}
                        aria-pressed={prefs.fontScale === s.key}
                        onClick={() => update({ ...prefs, fontScale: s.key })}>{s.label}</button>
              ))}
            </div>
          </div>
          <div className="a11y-row">
            <span className="a11y-lbl">{t('a11y.crtSkin', 'Skin CRT retro')}</span>
            <button
              className="a11y-sw"
              data-on={skin.crt ? '1' : '0'}
              role="switch"
              aria-checked={skin.crt}
              aria-label={t('a11y.crtSkin', 'Skin CRT retro')}
              onClick={() => updateSkin({ ...skin, crt: !skin.crt })}
            />
          </div>
          <div className="a11y-hint">
            <Keyboard size={12} />
            <span>{t('a11y.press', 'Pulsa')} <span className="a11y-kbd">?</span> {t('a11y.toViewShortcuts', 'para ver los atajos de teclado')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
