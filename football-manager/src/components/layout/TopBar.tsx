import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Moon, Sun, Settings, Calendar, Banknote, ChevronDown, MessageSquare, Newspaper, Clock, Check, Home,
} from 'lucide-react';
import { PitchIcon } from '../ui/FootballIcons';
import { useTheme } from '../../hooks/useTheme';
import { A11yMenu } from './A11yMenu';
import { LanguageMenu } from './LanguageMenu';
import { GlobalSearch } from './GlobalSearch';
import { useSession } from '../../stores/sessionStore';
import { useGameStore } from '../../stores/gameStore';
import { useCountdown } from '../../hooks/useGameState';
import { dmApi } from '../../api/client';
import { cn } from '../../lib/cn';
import { PressBadge, UrgencyBadge } from '../live';
import { useTranslation } from 'react-i18next';
import { eur, fmtGameDate } from '../../lib/format';
import { NAV_PHASES, pathActive, tutorialRoute, type NavLink, type NavPhase } from './navConfig';

function pad(n: number) { return String(n).padStart(2, '0'); }

const DATE_LOCALES: Record<string, string> = {
  es: 'es-ES', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', it: 'it-IT',
};

function HudItem({ label, value, className, title, icon }: {
  label: string;
  value: ReactNode;
  className?: string;
  title?: string;
  icon?: ReactNode;
}) {
  return (
    <div className={cn('topbar-hud-item', className)} title={title}>
      {icon && <span className="topbar-hud-item__icon">{icon}</span>}
      <span className="topbar-hud-item__body">
        <span className="topbar-hud-item__label">{label}</span>
        <span className="topbar-hud-item__value">{value}</span>
      </span>
    </div>
  );
}

function PhaseDropdown({
  phase, label, description, open, active, linkCount, onToggle, children,
}: {
  phase: NavPhase;
  label: string;
  description: string;
  open: boolean;
  active: boolean;
  linkCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation('common');
  const Icon = phase.icon;
  return (
    <div className="topbar-nav-cell">
      <div
        className={cn('topbar-phase-btn', (open || active) && 'on', open && 'open')}
        style={(open || active) && phase.accent ? { '--phase-accent': phase.accent } as CSSProperties : undefined}
      >
        <Link to={phase.homePath} className="topbar-phase-btn__main" aria-label={label}>
          <span className="topbar-phase-btn__icon" aria-hidden="true">
            <Icon size={15} />
          </span>
          <span className="topbar-phase-btn__copy">
            <span className="topbar-phase-btn__label">{label}</span>
            <small>{description}</small>
          </span>
        </Link>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={t('nav.openSectionMenu', { section: label, defaultValue: `Abrir menú de ${label}` })}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className="topbar-phase-btn__menu"
        >
          <ChevronDown size={11} className={cn('topbar-phase-btn__chev', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open && (
        <div
          className={cn('nav-dropdown nav-dropdown--phase', linkCount > 4 && 'nav-dropdown--wide')}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownLink({ link, onClose, active, accent, t }: {
  link: NavLink;
  onClose: () => void;
  active?: boolean;
  accent?: string;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const Icon = link.icon;
  return (
    <Link
      to={link.path}
      role="menuitem"
      onClick={onClose}
      className={cn('nav-menu-link', active && 'active')}
      style={active && accent ? { '--phase-accent': accent } as CSSProperties : undefined}
      data-tutorial-route={tutorialRoute(link.path)}
    >
      <Icon size={15} className={link.iconClass} />
      <span className="nav-menu-link__body">
        <span className="nav-menu-link__title">{t(link.labelKey)}</span>
        {link.descKey && <span className="nav-menu-link__desc">{t(link.descKey)}</span>}
      </span>
      {active && <Check size={14} className="nav-menu-link__check" aria-hidden="true" />}
    </Link>
  );
}

export function TopBar() {
  const { i18n, t } = useTranslation();
  const { isLight, toggleTheme } = useTheme();
  const { user, club, logout, refreshClub } = useSession();
  const state = useGameStore(s => s.gameState);
  const shellContext = useGameStore(s => s.shellContext);
  const countdown = useCountdown(state?.nextTickAt);
  const location = useLocation();
  const headerRef = useRef<HTMLElement>(null);

  const [dmUnread, setDmUnread] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const budgetStr = eur(club?.budget);
  const hasClub = Boolean(user?.manager?.clubId);
  const hasPress = Boolean(shellContext?.press?.unread || shellContext?.press?.pendingQuestions);
  const closeMenus = () => setActiveDropdown(null);
  const toggle = (id: string) => setActiveDropdown(prev => (prev === id ? null : id));

  const visiblePhases = NAV_PHASES.filter(p => !p.requiresClub || hasClub);
  const dateLocale = DATE_LOCALES[i18n.language] ?? 'es-ES';
  const gameDateStr = fmtGameDate(state?.inGameDate, dateLocale);
  const phaseStr = state?.phase
    ? t(`topbar.gamePhase.${state.phase}`, { defaultValue: state.phase.replace(/_/g, ' ') })
    : null;
  const immersiveMatch = /^\/matches\/\d+(?:\/live)?$/.test(location.pathname);

  useEffect(() => {
    if (hasClub && !club) void refreshClub();
  }, [hasClub, club, refreshClub]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const loadDm = () => dmApi.conversations()
      .then((convos) => {
        if (cancelled) return;
        setDmUnread((convos ?? []).reduce((acc, c) => acc + (Number(c?.unread) || 0), 0));
      })
      .catch(() => { if (!cancelled) setDmUnread(0); });
    loadDm();
    const id = setInterval(loadDm, 60_000);
    const onDmRead = () => { void loadDm(); };
    window.addEventListener('fdf:dm-read', onDmRead);
    return () => { cancelled = true; clearInterval(id); window.removeEventListener('fdf:dm-read', onDmRead); };
  }, [user]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (headerRef.current?.contains(e.target as Node)) return;
      setActiveDropdown(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => { setActiveDropdown(null); }, [location.pathname]);

  return (
    <header ref={headerRef} className={cn('app-topbar', immersiveMatch && 'app-topbar--immersive')}>
      <div className="topbar-accent" aria-hidden="true" />

      <div className="topbar-inner">
        <div className="topbar-row topbar-row--primary">
          <div className="topbar-primary-left">
            <Link
              to="/landing"
              className="topbar-home"
              title={t('topbar.goLanding', 'Ir a la portada FDF')}
              aria-label={t('topbar.goLanding', 'Ir a la portada FDF')}
            >
              <span className="topbar-home__icon" aria-hidden="true"><Home size={17} /></span>
              <span className="topbar-home__label hidden sm:inline">{t('brand.fdf', 'FDF')}</span>
            </Link>

            {hasClub && (
              <>
                <span className="topbar-left-sep" aria-hidden="true" />
                <Link to="/" className="topbar-brand" title={club?.name || t('topbar.goClub', 'Ir a tu club')}>
                  <span className="topbar-brand__crest">
                    <PitchIcon size={18} className="text-white" />
                  </span>
                  <span className="topbar-brand__text hidden lg:flex">
                    <span className="topbar-brand__club">{club?.shortName || t('brand.fdf', 'FDF')}</span>
                    <span className="topbar-brand__tag">{t('brand.manager', 'Manager')}</span>
                  </span>
                </Link>
              </>
            )}
          </div>

          {hasClub && (
            <div className="topbar-primary-center hidden md:flex">
              <div className="topbar-hud-strip">
                <HudItem
                  className="topbar-hud-item--live"
                  label={t('topbar.turn')}
                  title={t('topbar.nextTurn')}
                  icon={<><span className="topbar-live-dot" aria-hidden="true" /><Clock size={13} /></>}
                  value={
                    <span className="tabular-nums">
                      {pad(countdown.hours)}:{pad(countdown.minutes)}:{pad(countdown.seconds)}
                    </span>
                  }
                />
                {state?.season && (
                  <>
                    <span className="topbar-hud-sep topbar-hud-sep--lg" aria-hidden="true" />
                    <HudItem className="topbar-hud-item--lg" label={t('topbar.season', 'Temporada')} title={t('topbar.currentSeason')} icon={<Calendar size={13} />} value={state.season} />
                  </>
                )}
                {state?.inGameDate && (
                  <>
                    <span className="topbar-hud-sep topbar-hud-sep--lg" aria-hidden="true" />
                    <HudItem className="topbar-hud-item--lg" label={t('topbar.date', 'Fecha')} title={t('topbar.inGameDate', 'Fecha en juego')} value={gameDateStr} />
                  </>
                )}
                {phaseStr && (
                  <>
                    <span className="topbar-hud-sep topbar-hud-sep--xl" aria-hidden="true" />
                    <HudItem className="topbar-hud-item--phase topbar-hud-item--xl" label={t('topbar.phase', 'Fase')} title={phaseStr} value={<span className="topbar-phase-tag">{phaseStr}</span>} />
                  </>
                )}
                {club && (
                  <>
                    <span className="topbar-hud-sep" aria-hidden="true" />
                    <HudItem className="topbar-hud-item--money" label={t('topbar.balance', 'Fondos')} title={t('topbar.clubBalance')} icon={<Banknote size={13} />} value={budgetStr} />
                  </>
                )}
              </div>
            </div>
          )}

          <div className="topbar-primary-right">
            <div className="topbar-search hidden 2xl:block">
              <GlobalSearch />
            </div>
            <div className="topbar-actions">
              {hasPress && (
                <Link to="/news" className="topbar-action topbar-action--press" title={t('topbar.fdfNews')}>
                  <PressBadge compact />
                </Link>
              )}
              <Link to="/messages" className="topbar-action topbar-action--icon relative" title={t('topbar.inbox')}>
                <MessageSquare size={16} />
                <span className="absolute -top-1.5 -right-1.5 pointer-events-none">
                  <UrgencyBadge count={dmUnread} pulse={dmUnread > 0} />
                </span>
              </Link>
              {!hasPress && (
                <Link to="/news" className="topbar-action topbar-action--icon" title={t('topbar.fdfNews')}>
                  <Newspaper size={16} />
                </Link>
              )}
            </div>
            <div className="topbar-sys hidden sm:flex">
              <LanguageMenu />
              <button type="button" onClick={toggleTheme} className="topbar-sys-btn" title={t('topbar.theme')}>
                {isLight ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              <div onMouseDown={(e) => e.stopPropagation()}>
                <A11yMenu />
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'user'}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); toggle('user'); }}
                className={cn('topbar-user', activeDropdown === 'user' && 'on')}
              >
                <span className="topbar-user__avatar">
                  {(user?.manager?.name || user?.username || '?').charAt(0).toUpperCase()}
                </span>
                <span className="topbar-user__name hidden lg:block">{user?.manager?.name || user?.username}</span>
                <Settings size={14} className="topbar-user__gear" />
              </button>
              {activeDropdown === 'user' && (
                <div className="nav-dropdown nav-dropdown--right w-52" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                  <Link to="/me" role="menuitem" onClick={closeMenus}>{t('topbar.myProfile')}</Link>
                  <Link to="/career" role="menuitem" onClick={closeMenus}>{t('topbar.myCareer')}</Link>
                  <Link to="/ideology" role="menuitem" onClick={closeMenus}>{t('topbar.ideology')}</Link>
                  <Link to="/shares" role="menuitem" onClick={closeMenus}>{t('topbar.shareholders')}</Link>
                  <Link to="/settings" role="menuitem" onClick={closeMenus}>{t('topbar.generalSettings')}</Link>
                  <Link to="/diagnostics" role="menuitem" onClick={closeMenus}>{t('nav.diagnostics', 'Diagnósticos')}</Link>
                  <Link to="/styleguide" role="menuitem" onClick={closeMenus}>{t('nav.styleguide', 'Styleguide')}</Link>
                  {user?.role && ['agente_fifa', 'admin', 'master'].includes(user.role) && (
                    <Link to="/fifa" role="menuitem" onClick={closeMenus} className="text-[var(--blue-info)]">{t('nav.fifaPanel', 'Panel FIFA')}</Link>
                  )}
                  {user?.role && ['admin', 'master'].includes(user.role) && (
                    <Link to="/admin" role="menuitem" onClick={closeMenus} className="text-[var(--red-danger)]">{t('nav.adminPanel', 'Panel Admin')}</Link>
                  )}
                  {user?.role === 'master' && (
                    <Link to="/master" role="menuitem" onClick={closeMenus} className="text-[var(--gold-accent)]">{t('nav.masterPanel', 'Panel Master')}</Link>
                  )}
                  <div className="h-px bg-[var(--border-color)] my-1 mx-2" />
                  <button type="button" role="menuitem" onClick={() => { closeMenus(); logout(); }} className="text-[var(--red-danger)] font-bold">
                    {t('topbar.disconnect')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="topbar-row topbar-row--nav hidden md:block">
          <div className="topbar-nav-shell">
            <nav
              className="topbar-nav-rail"
              style={{ '--phase-count': visiblePhases.length } as CSSProperties}
              aria-label={t('nav.main', 'Navegación principal')}
            >
              {visiblePhases.map((phase) => {
                const phaseActive = phase.links.some(l => pathActive(location.pathname, l.path, l.exact))
                  || phase.matchPrefixes?.some(prefix => location.pathname.startsWith(prefix));
                const label = t(phase.labelKey, phase.fallback);
                const description = t(phase.descKey, phase.descFallback);
                return (
                  <PhaseDropdown
                    key={phase.id}
                    phase={phase}
                    label={label}
                    description={description}
                    linkCount={phase.links.length}
                    open={activeDropdown === phase.id}
                    active={Boolean(phaseActive)}
                    onToggle={() => toggle(phase.id)}
                  >
                  {phase.links.map((link) => (
                    <DropdownLink
                      key={link.path}
                      link={link}
                      accent={phase.accent}
                      onClose={closeMenus}
                      active={pathActive(location.pathname, link.path, link.exact)}
                      t={t}
                    />
                  ))}
                  </PhaseDropdown>
                );
              })}
            </nav>

          </div>
        </div>
      </div>
    </header>
  );
}
