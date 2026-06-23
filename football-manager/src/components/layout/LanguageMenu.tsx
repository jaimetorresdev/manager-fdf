import { useEffect, useRef, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES, setStoredLocale, type AppLocale } from '../../i18n';
import { cn } from '../../lib/cn';

const LOCALE_META: Record<AppLocale, { label: string; native: string }> = {
  es: { label: 'Español', native: 'ES' },
  en: { label: 'English', native: 'EN' },
  fr: { label: 'Français', native: 'FR' },
  de: { label: 'Deutsch', native: 'DE' },
  it: { label: 'Italiano', native: 'IT' },
};

export function LanguageMenu() {
  const { i18n, t } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = (SUPPORTED_LOCALES.includes(i18n.language as AppLocale) ? i18n.language : 'es') as AppLocale;
  const meta = LOCALE_META[current];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onEsc); };
  }, [open]);

  const pick = (lng: AppLocale) => {
    setStoredLocale(lng);
    void i18n.changeLanguage(lng);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={cn('lang-menu-btn', open && 'on')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('topbar.language')}
        title={t('topbar.languagePick', 'Elegir idioma')}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      >
        <Globe size={14} className="lang-menu-btn__icon" />
        <span className="lang-menu-btn__label hidden md:inline">{meta.label}</span>
        <span className="lang-menu-btn__code">{meta.native}</span>
      </button>
      {open && (
        <div className="lang-menu-pop" role="listbox" aria-label={t('topbar.language')} onMouseDown={(e) => e.stopPropagation()}>
          <p className="lang-menu-pop__title">{t('topbar.languagePick', 'Elegir idioma')}</p>
          {SUPPORTED_LOCALES.map((code) => {
            const item = LOCALE_META[code];
            const selected = code === current;
            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn('lang-menu-option', selected && 'on')}
                onClick={() => pick(code)}
              >
                <span className="lang-menu-option__text">
                  <span className="lang-menu-option__name">{item.label}</span>
                  <span className="lang-menu-option__code">{item.native}</span>
                </span>
                {selected && <Check size={14} className="lang-menu-option__check" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
