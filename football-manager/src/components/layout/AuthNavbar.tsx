import { Link, useLocation } from 'react-router-dom';
import { Moon, Sun, ArrowRight, Compass, Shield } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from 'react-i18next';

export function AuthNavbar() {
  const { isLight, toggleTheme } = useTheme();
  const location = useLocation();
  const { t } = useTranslation('common');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 bg-black/30 backdrop-blur-xl border-b border-white/5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
      {/* Brand Side */}
      <div className="flex items-center gap-3">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--green-primary)] to-emerald-900 border border-white/20 shadow-[0_0_20px_rgba(34,197,94,0.3)]">
          <Shield size={20} className="text-white" />
          <div className="absolute inset-0 bg-white/20 rounded-xl blur-md -z-10 animate-pulse" />
        </div>
        <div className="hidden sm:flex flex-col">
          <span className="font-display font-black tracking-widest text-white text-sm uppercase leading-none drop-shadow-md">
            {t('brand.managerFdf', 'Manager FDF')}
          </span>
          <span className="font-mono-retro text-[9px] text-[var(--gold-accent)] tracking-widest">
            {location.pathname === '/register' ? t('auth.registerTitle', 'ALTA MANAGER') : t('auth.loginTitle', 'SISTEMA DE ACCESO')}
          </span>
        </div>
      </div>

      {/* Actions Side */}
      <div className="flex items-center gap-4">
        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="relative flex items-center justify-center w-10 h-10 rounded-full bg-black/40 border border-white/10 text-white/70 hover:text-[var(--gold-accent)] hover:bg-white/10 transition-all hover:scale-105 active:scale-95 shadow-inner"
          title={isLight ? t('a11y.darkMode', 'Activar Modo Oscuro') : t('a11y.lightMode', 'Activar Modo Claro')}
        >
          {isLight ? <Moon size={18} /> : <Sun size={18} />}
          <div className="absolute inset-0 rounded-full opacity-0 hover:opacity-100 shadow-[0_0_15px_var(--gold-accent)] transition-opacity pointer-events-none" />
        </button>

        {/* Guest Mode Link */}
        <Link 
          to="/landing" 
          className="group relative flex items-center gap-2 px-6 py-2.5 rounded-full bg-gradient-to-r from-white/5 to-white/10 border border-white/10 hover:border-white/20 text-white/90 font-display text-xs font-bold tracking-widest uppercase overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_4px_15px_rgba(0,0,0,0.3)]"
        >
          {/* Animated glow background */}
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--green-primary)] to-[var(--gold-accent)] opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none" />
          
          <Compass size={16} className="text-[var(--gold-accent)] group-hover:animate-spin-slow drop-shadow-[0_0_8px_var(--gold-accent)]" />
          <span className="relative z-10 drop-shadow-md">{t('auth.continueAsGuest', 'Continuar sin sesión')}</span>
          <ArrowRight size={16} className="ml-1 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-[var(--green-primary)]" />
        </Link>
      </div>
    </nav>
  );
}
