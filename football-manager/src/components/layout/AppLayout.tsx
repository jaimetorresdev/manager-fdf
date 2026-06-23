import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from './TopBar';
import { MatchdayBanner } from './MatchdayBanner';
import { cn } from '../../lib/cn';
import { useGameStore } from '../../stores/gameStore';
import { useSession } from '../../stores/sessionStore';
import { subscribe } from '../../lib/ws';
import { useShortcuts, SHORTCUTS } from '../../hooks/useShortcuts';
import { applyStoredA11y } from '../../lib/a11y';
import { applyStoredVisualSkin } from '../../lib/visualSkin';
import { Modal } from '../ui';
import { TutorialOverlay } from '../tutorial/TutorialOverlay';
import { MobileNav } from './MobileNav';
import { AreaContextBar } from './AreaContextBar';
import { DecisionImpactCenter } from './DecisionImpactCenter';

export function AppLayout() {
  const { t } = useTranslation('common');
  const fetchGameState = useGameStore(state => state.fetchGameState);
  const fetchShellContext = useGameStore(state => state.fetchShellContext);
  const handleTickCompleted = useGameStore(state => state.handleTickCompleted);
  const gameState = useGameStore(state => state.gameState);
  const shellContext = useGameStore(state => state.shellContext);
  const sessionStatus = useSession(state => state.status);
  const club = useSession(state => state.club);
  const { helpOpen, closeHelp } = useShortcuts();
  const location = useLocation();

  const mode = shellContext?.visual?.mode || 'normal';
  const isMatchDay = mode === 'matchday' || mode === 'matchday_takeover' || gameState?.phase?.toLowerCase().includes('partido') || gameState?.phase?.toLowerCase().includes('match');
  const isCrisis = mode === 'crisis';
  const isEuphoria = mode === 'euphoria';
  const immersiveMatch = /^\/matches\/\d+(?:\/live)?$/.test(location.pathname);

  useEffect(() => {
    applyStoredA11y();
    applyStoredVisualSkin();
    fetchGameState();
    fetchShellContext();
    const interval = setInterval(() => {
      fetchGameState();
      fetchShellContext();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchGameState, fetchShellContext]);

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    const channel = subscribe('system:world', (msg) => {
      if (msg.type !== 'tick:completed') return;
      const payload = msg.payload;
      if (payload && typeof payload === 'object') {
        handleTickCompleted(payload as { invalidates?: string[]; turn?: number; inGameDate?: string });
      }
    });
    return () => channel.close();
  }, [sessionStatus, handleTickCompleted]);

  return (
    <div className={cn(
      "min-h-screen text-[var(--text-primary)] relative z-0 flex flex-col transition-colors duration-1000",
      isCrisis && "shadow-[inset_0_0_150px_rgba(239,68,68,0.15)]",
      isEuphoria && "shadow-[inset_0_0_150px_rgba(255,215,0,0.15)]"
    )} style={{
      backgroundColor: 'var(--bg-base)',
      ['--club-primary' as string]: club?.primaryColor ?? 'var(--green-primary)',
      ['--club-secondary' as string]: club?.secondaryColor ?? 'var(--gold-accent)',
    }}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-color)]">{t('Saltar al contenido')}</a>
      
      {/* Global MatchDay Background Effect */}
      {isMatchDay && (
        <div 
          className="fixed inset-0 pointer-events-none opacity-5 transition-opacity duration-1000 z-0"
          style={{ 
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, var(--green-primary) 40px, var(--green-primary) 80px)', 
            mixBlendMode: 'overlay', 
            backgroundSize: '100% 160px', 
            animation: 'panBackground 30s linear infinite' 
          }} 
        />
      )}
      
      <div className="transition-all duration-300 min-w-0 relative z-10 w-full flex flex-col min-h-screen">
        <TopBar />
        {!immersiveMatch && <MatchdayBanner />}
        <main id="main" className={cn(
          'app-main flex-1 overflow-y-auto p-3 sm:p-4 xl:p-5 bg-transparent w-full max-w-[1920px] mx-auto',
          immersiveMatch && 'app-main--immersive',
          isMatchDay && 'ring-1 ring-[color-mix(in_srgb,var(--club-primary)_25%,transparent)]',
        )}>
          <div className={cn('page-frame w-full mx-auto pb-20 md:pb-0', immersiveMatch ? 'max-w-[1680px]' : 'max-w-7xl')}>
            {!immersiveMatch && <AreaContextBar />}
            <div key={location.pathname} className="route-stage">
              <Outlet />
            </div>
          </div>
        </main>
        <MobileNav />
      </div>

      {/* Ayuda de atajos de teclado (tecla ?) */}
      <Modal open={helpOpen} onClose={closeHelp} title={t('shortcuts.title')} width={420}>
        <style>{`
          .sc-row{display:flex;justify-content:space-between;align-items:center;padding:7px 2px;
            border-top:1px solid color-mix(in srgb,var(--border-color) 55%,transparent);font-size:.84rem}
          .sc-kbd{font-family:var(--font-sans);font-weight:700;font-size:.74rem;border:1px solid var(--border-color);
            border-radius:4px;padding:1px 7px;background:var(--bg-elevated);color:var(--text-primary)}
        `}</style>
        <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          {t('shortcuts.hint')}
        </p>
        {SHORTCUTS.map(s => (
          <div key={s.keys} className="sc-row">
            <span>{t(s.i18nKey)}</span>
            <span className="sc-kbd">{s.keys}</span>
          </div>
        ))}
      </Modal>

      <TutorialOverlay />
      <DecisionImpactCenter />
    </div>
  );
}
