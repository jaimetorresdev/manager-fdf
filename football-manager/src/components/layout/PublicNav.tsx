// ─── PublicNav — barra pública unificada (I-25/I-26/I-35) ─────────────────────
import type { ReactNode } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Trophy, LogIn, BookOpen, Globe2, UserPlus, Sun, Moon } from 'lucide-react';
import { useSession } from '../../stores/sessionStore';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/cn';
import { useTranslation } from 'react-i18next';
import { A11yMenu } from './A11yMenu';
import { LanguageMenu } from './LanguageMenu';

type NavItem = { path: string; label: string; fallback: string; icon: typeof Trophy; auth?: boolean };

const ITEMS: NavItem[] = [
  { path: '/landing', label: 'nav.landing', fallback: 'Portada', icon: Trophy },
  { path: '/explore', label: 'nav.world', fallback: 'Mundo', icon: Globe2 },
  { path: '/manual', label: 'nav.manual', fallback: 'Manual', icon: BookOpen },
];

export function PublicNav({ ticker }: { ticker?: ReactNode }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const { isLight, toggleTheme } = useTheme();
  const location = useLocation().pathname;
  const { t } = useTranslation('common');

  const go = (item: NavItem) => {
    if (item.auth && !user) {
      navigate('/login', { state: { from: item.path, hint: `${t('auth.loginToAccess', 'Inicia sesión para acceder a')} ${t(item.label, item.fallback).toLowerCase()}.` } });
      return;
    }
    navigate(item.path);
  };

  return (
    <header className="sticky top-0 z-50 app-topbar border-b border-[var(--border-color)]">
      {ticker}
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-4 h-12 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:gap-3">

        <Link to="/landing" className="flex items-center gap-2 shrink-0 rounded-lg hover:opacity-90 transition-opacity">
          <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--green-primary)] to-[color-mix(in_srgb,var(--green-primary)_60%,var(--bg-base))] border border-[var(--border-color)]">
            <Trophy size={15} className="text-[var(--avatar-text)]" />
          </span>
          <span className="hidden sm:flex flex-col leading-tight">
            <span className="font-display font-black text-xs tracking-wider text-[var(--text-primary)]">{t('brand.fdf', 'FDF')}</span>
            <span className="font-mono-retro text-[7px] text-[var(--gold-accent)] tracking-widest uppercase">{t('brand.manager', 'Manager')}</span>
          </span>
        </Link>

        <nav className="flex items-center justify-center gap-0.5 overflow-x-auto hide-scrollbar min-w-0" aria-label="Navegación pública">
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = location === item.path || location.startsWith(`${item.path}/`);
            return (
              <button
                key={item.path}
                type="button"
                onClick={() => go(item)}
                className={cn('nav-tab', active && 'on')}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{t(item.label, item.fallback)}</span>
              </button>
            );
          })}
        </nav>

        <div className="flex items-center justify-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1 border-r border-[var(--border-color)] pr-2 mr-1">
            <div onMouseDown={(e) => e.stopPropagation()}>
              <LanguageMenu />
            </div>
            <button type="button" onClick={toggleTheme} className="topbar-sys-btn" title={t('topbar.theme')}>
              {isLight ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <div onMouseDown={(e) => e.stopPropagation()}>
              <A11yMenu />
            </div>
          </div>
          {!user && (
            <Link
              to="/register"
              className="hidden sm:flex items-center gap-1 h-[34px] px-3 rounded-lg border border-[var(--green-primary)] text-[var(--green-primary)] text-[10px] font-bold uppercase tracking-wider hover:bg-[var(--green-primary)] hover:text-[var(--avatar-text)] transition-colors"
            >
              <UserPlus size={13} />
              {t('nav.register', 'Registro')}
            </Link>
          )}
          <Link
            to={user ? '/' : '/login'}
            className="flex items-center gap-1.5 h-[34px] px-3 sm:px-4 rounded-lg bg-[var(--green-primary)] text-[var(--avatar-text)] text-[10px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity"
          >
            <LogIn size={13} />
            <span className="hidden sm:inline">{user ? t('nav.myClub', 'Mi club') : t('nav.login', 'Entrar')}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Tira broadcast para titulares públicos */
export function PublicTickerBar({ items }: { items: { text?: string; icon?: string }[] }) {
  const { t } = useTranslation('common');
  if (!items.length) return null;
  const line = items.slice(0, 8).map((t) => `${t.icon ?? '•'} ${t.text ?? ''}`).join('   ·   ');
  return (
    <div className="overflow-hidden border-b border-[var(--border-color)]/50 bg-[var(--bg-surface)]">
      <div className="flex items-center gap-3 px-4 py-1 max-w-7xl mx-auto">
        <span className="shrink-0 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-[var(--red-danger)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--red-danger)] animate-pulse" />
          {t('topbar.live', 'En directo')}
        </span>
        <div className="overflow-hidden flex-1">
          <p className="text-[10px] text-[var(--text-muted)] font-mono whitespace-nowrap animate-[marquee_40s_linear_infinite]">
            {line}
          </p>
        </div>
      </div>
      <style>{`@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style>
    </div>
  );
}
