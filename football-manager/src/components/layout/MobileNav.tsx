import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ChevronRight, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../stores/sessionStore';
import { cn } from '../../lib/cn';
import { MOBILE_QUICK_LINKS, NAV_PHASES, pathActive, tutorialRoute } from './navConfig';

export function MobileNav() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const user = useSession(state => state.user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openPhase, setOpenPhase] = useState<string | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    setOpenPhase(null);
  }, [location.pathname]);

  const hasClub = Boolean(user?.manager?.clubId);
  if (!hasClub) return null;

  const visiblePhases = NAV_PHASES.filter(p => !p.requiresClub || hasClub);
  const isActive = pathActive;

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-[90] border-t border-[var(--border-color)] bg-[var(--topbar-bg)] backdrop-blur-xl pb-safe"
        aria-label={t('nav.main', 'Navegación principal')}
      >
        <div className="flex items-stretch justify-around px-1 py-1.5 max-w-lg mx-auto">
          {MOBILE_QUICK_LINKS.map(item => {
            const Icon = item.icon;
            const active = isActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg min-w-0',
                  active ? 'text-[var(--green-primary)]' : 'text-[var(--text-muted)]',
                )}
                data-tutorial-route={tutorialRoute(item.path)}
              >
                <Icon size={20} />
                <span className="text-[9px] font-bold uppercase tracking-wide truncate max-w-full px-0.5">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg min-w-0',
              menuOpen ? 'text-[var(--gold-accent)]' : 'text-[var(--text-muted)]',
            )}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
            <span className="text-[9px] font-bold uppercase tracking-wide">{t('nav.menu', 'Menú')}</span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-[80]"
          style={{ background: 'var(--overlay-backdrop)' }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute bottom-[60px] left-0 right-0 mx-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-elevated)] p-2 max-h-[70vh] overflow-y-auto shadow-[var(--shadow-soft)]"
            onClick={e => e.stopPropagation()}
          >
            <Link
              to="/landing"
              className="flex items-center gap-2 px-3 py-2.5 mb-1.5 rounded-xl font-bold text-xs uppercase tracking-wider text-[var(--text-primary)] bg-[var(--accent-soft)] border border-[color-mix(in_srgb,var(--gold-accent)_30%,var(--border-color))]"
            >
              <Home size={16} className="shrink-0 text-[var(--gold-accent)]" />
              <span className="truncate">{t('nav.landing', 'Portada')}</span>
              <ChevronRight size={14} className="ml-auto opacity-50" />
            </Link>
            {visiblePhases.map(phase => {
              const PhaseIcon = phase.icon;
              const expanded = openPhase === phase.id;
              const phaseActive = phase.links.some(l => isActive(location.pathname, l.path, l.exact))
                || phase.matchPrefixes?.some(prefix => location.pathname.startsWith(prefix));
              return (
                <div key={phase.id} className="mb-0.5">
                  <div
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left font-bold text-xs uppercase tracking-wider',
                      phaseActive ? 'text-[var(--green-primary)] bg-[var(--accent-soft)]' : 'text-[var(--text-primary)] hover:bg-[var(--row-hover)]',
                    )}
                  >
                    <Link to={phase.homePath} className="flex items-center gap-2 min-w-0 flex-1">
                      <PhaseIcon size={16} className="shrink-0" />
                      <span className="truncate">{t(phase.labelKey, phase.fallback)}</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setOpenPhase(expanded ? null : phase.id)}
                      aria-expanded={expanded}
                      aria-label={t('nav.openSectionMenu', { section: t(phase.labelKey, phase.fallback) })}
                      className="p-1.5 rounded-lg hover:bg-[var(--row-hover)]"
                    >
                      <ChevronDown size={14} className={cn('shrink-0 opacity-50 transition-transform', expanded && 'rotate-180')} />
                    </button>
                  </div>
                  {expanded && (
                    <div className="grid grid-cols-2 gap-1 px-1 pb-2 pt-1">
                      {phase.links.map(link => {
                        const Icon = link.icon;
                        const active = isActive(location.pathname, link.path, link.exact);
                        return (
                          <Link
                            key={link.path}
                            to={link.path}
                            className={cn(
                              'flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-bold uppercase',
                              active ? 'bg-[var(--accent-soft)] text-[var(--green-primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--row-hover)]',
                            )}
                            data-tutorial-route={tutorialRoute(link.path)}
                          >
                            <Icon size={14} className="shrink-0" />
                            <span className="truncate">{t(link.labelKey)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
