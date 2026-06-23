import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, ChevronDown, Compass, Eye, Sparkles, X } from 'lucide-react';
import { useTutorialStore } from '../../stores/tutorialStore';
import { useSession } from '../../stores/sessionStore';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';

const ROUTE_LABELS: Record<string, string> = {
  '/': 'ux.onboarding.routes.club',
  '/squad': 'ux.onboarding.routes.squad',
  '/tactics': 'ux.onboarding.routes.tactics',
  '/training': 'ux.onboarding.routes.training',
  '/market': 'ux.onboarding.routes.market',
  '/matches': 'ux.onboarding.routes.matches',
};

function routeForStep(step: { key: string; route: string }) {
  if (step.key === 'club_context') return '/';
  if (step.key === 'review_squad') return '/squad';
  return step.route;
}

export function TutorialOverlay() {
  const { state, status, load, skip, advance } = useTutorialStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation('common');
  const hasClub = useSession((session) => Boolean(session.user?.manager?.clubId));

  useEffect(() => {
    if (status === 'idle') void load();
  }, [status, load]);

  useEffect(() => {
    if (status !== 'loaded' || !state || !hasClub || state.tutorialStep !== 0) return;
    if (state.steps[0]?.key === 'choose_club') void advance();
  }, [status, state, hasClub, advance]);

  const currentStep = useMemo(
    () => state?.steps.find((step) => step.step > state.tutorialStep) ?? null,
    [state],
  );
  const currentRoute = currentStep ? routeForStep(currentStep) : null;
  const immersiveMatch = /^\/matches\/\d+(?:\/live)?$/.test(location.pathname);
  const atTarget = Boolean(currentStep && (
    currentRoute === '/'
      ? location.pathname === '/'
      : location.pathname === currentRoute || location.pathname.startsWith(`${currentRoute}/`)
  ));

  useEffect(() => {
    if (!currentStep || !currentRoute || atTarget || currentRoute === '/') return;
    const selector = `[data-tutorial-route="${currentRoute}"]`;
    const targets = Array.from(document.querySelectorAll<HTMLElement>(selector));
    targets.forEach((target) => target.classList.add('tutorial-target-pulse'));
    return () => targets.forEach((target) => target.classList.remove('tutorial-target-pulse'));
  }, [currentStep, currentRoute, atTarget, location.pathname]);

  if (status !== 'loaded' || !state || state.tutorialCompleted || state.tutorialSkipped || !currentStep || immersiveMatch) return null;

  const completed = state.steps.filter((step) => step.step <= state.tutorialStep).length;
  const routeLabel = t(ROUTE_LABELS[currentRoute ?? ''] ?? 'ux.onboarding.routes.next');
  const objective = t(`ux.onboarding.steps.${currentStep.key}.objective`, { defaultValue: currentStep.objective });
  const consequence = t(`ux.onboarding.steps.${currentStep.key}.consequence`);

  return (
    <aside className={cn('first-run-coach', expanded && 'is-expanded')} aria-label={t('ux.onboarding.title')}>
      <style>{TUTORIAL_CSS}</style>

      <header className="first-run-coach__head">
        <span className="first-run-coach__avatar">👔</span>
        <div>
          <small>{t('ux.onboarding.kicker')}</small>
          <strong>{t('ux.onboarding.mission', { current: completed + 1, total: state.steps.length })}</strong>
        </div>
        <button type="button" onClick={() => void skip()} aria-label={t('ux.onboarding.skip')} title={t('ux.onboarding.skip')}>
          <X size={14} />
        </button>
      </header>

      <div className="first-run-coach__progress" aria-hidden>
        {state.steps.map((step) => (
          <i key={step.step} className={cn(step.step <= state.tutorialStep && 'is-done', step.step === currentStep.step && 'is-current')} />
        ))}
      </div>

      <div className="first-run-coach__mission">
        <span><Compass size={14} />{routeLabel}</span>
        <h2>{objective}</h2>
        <p><Eye size={13} />{t(`ux.onboarding.steps.${currentStep.key}.look`)}</p>
        <p className="is-impact"><Sparkles size={13} />{consequence}</p>
      </div>

      <div className="first-run-coach__actions">
        <button
          type="button"
          className="first-run-coach__primary"
          onClick={() => atTarget ? void advance() : navigate(currentRoute ?? '/')}
        >
          {atTarget ? <><Check size={14} />{t('ux.onboarding.completeMission')}</> : <>{t('ux.onboarding.goTo', { place: routeLabel })}<ArrowRight size={14} /></>}
        </button>
        <button type="button" className="first-run-coach__plan" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
          {t('ux.onboarding.viewPlan')} <ChevronDown size={13} />
        </button>
      </div>

      {expanded && (
        <ol className="first-run-coach__steps">
          {state.steps.map((step) => {
            const done = step.step <= state.tutorialStep;
            const active = step.step === currentStep.step;
            const stepRoute = routeForStep(step);
            return (
              <li key={step.step} className={cn(done && 'is-done', active && 'is-active')}>
                <span>{done ? <Check size={11} /> : step.step}</span>
                <div>
                  <strong>{t(ROUTE_LABELS[stepRoute] ?? 'ux.onboarding.routes.next')}</strong>
                  <small>{t(`ux.onboarding.steps.${step.key}.objective`, { defaultValue: step.objective })}</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

const TUTORIAL_CSS = `
.first-run-coach{position:fixed;left:18px;bottom:18px;z-index:155;width:min(390px,calc(100vw - 28px));padding:13px;border:1px solid color-mix(in srgb,var(--gold-accent) 45%,var(--border-color));border-radius:15px;background:color-mix(in srgb,var(--bg-elevated) 95%,transparent);box-shadow:0 20px 60px -22px rgba(0,0,0,.8),0 0 30px color-mix(in srgb,var(--gold-accent) 10%,transparent);backdrop-filter:blur(18px)}
.first-run-coach__head{display:flex;align-items:center;gap:10px}.first-run-coach__avatar{width:36px;height:36px;display:grid;place-items:center;border-radius:10px;background:var(--gold-accent);color:#111;font-size:1rem}.first-run-coach__head>div{min-width:0;flex:1;display:flex;flex-direction:column}.first-run-coach__head small{color:var(--gold-accent);font-size:.52rem;font-weight:850;letter-spacing:.12em;text-transform:uppercase}.first-run-coach__head strong{font-family:var(--font-display);font-size:.78rem}.first-run-coach__head>button{width:28px;height:28px;display:grid;place-items:center;border:0;border-radius:7px;color:var(--text-muted);background:transparent;cursor:pointer}.first-run-coach__head>button:hover{color:var(--text-primary);background:var(--row-hover)}
.first-run-coach__progress{margin:10px 0 11px;display:flex;gap:4px}.first-run-coach__progress i{height:3px;flex:1;border-radius:3px;background:var(--border-color)}.first-run-coach__progress i.is-done{background:var(--green-primary)}.first-run-coach__progress i.is-current{background:var(--gold-accent);box-shadow:0 0 8px color-mix(in srgb,var(--gold-accent) 55%,transparent)}
.first-run-coach__mission>span{display:flex;align-items:center;gap:6px;color:var(--text-muted);font-size:.58rem;font-weight:800;text-transform:uppercase}.first-run-coach__mission>span svg{color:var(--gold-accent)}.first-run-coach__mission h2{margin-top:5px;color:var(--text-primary);font-family:var(--font-display);font-size:1rem;line-height:1.2}.first-run-coach__mission p{margin-top:8px;display:flex;align-items:flex-start;gap:7px;color:var(--text-muted);font-size:.68rem;line-height:1.35}.first-run-coach__mission p svg{margin-top:1px;flex:none;color:var(--blue-info)}.first-run-coach__mission p.is-impact{padding:7px 8px;border-radius:8px;color:var(--text-primary);background:color-mix(in srgb,var(--green-primary) 8%,transparent);border:1px solid color-mix(in srgb,var(--green-primary) 22%,var(--border-color))}.first-run-coach__mission p.is-impact svg{color:var(--green-primary)}
.first-run-coach__actions{margin-top:11px;display:flex;align-items:center;gap:7px}.first-run-coach__actions button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:8px;font-size:.63rem;font-weight:800;cursor:pointer}.first-run-coach__primary{min-height:34px;padding:0 12px;border:1px solid color-mix(in srgb,var(--green-primary) 52%,transparent);color:#07130c;background:var(--green-primary);box-shadow:0 8px 22px -14px var(--green-primary)}.first-run-coach__plan{min-height:34px;padding:0 9px;border:1px solid var(--border-color);color:var(--text-muted);background:transparent}.first-run-coach.is-expanded .first-run-coach__plan svg{transform:rotate(180deg)}
.first-run-coach__steps{margin-top:11px;padding-top:10px;display:grid;gap:5px;border-top:1px solid var(--border-color)}.first-run-coach__steps li{display:flex;align-items:flex-start;gap:8px;padding:6px;border-radius:8px;color:var(--text-muted)}.first-run-coach__steps li>span{width:20px;height:20px;display:grid;place-items:center;flex:none;border-radius:6px;border:1px solid var(--border-color);font-size:.58rem;font-weight:800}.first-run-coach__steps li div{min-width:0;display:flex;flex-direction:column}.first-run-coach__steps li strong{font-size:.65rem}.first-run-coach__steps li small{margin-top:2px;overflow:hidden;font-size:.58rem;text-overflow:ellipsis;white-space:nowrap}.first-run-coach__steps li.is-active{color:var(--text-primary);background:color-mix(in srgb,var(--gold-accent) 8%,transparent)}.first-run-coach__steps li.is-active>span{color:#111;background:var(--gold-accent);border-color:transparent}.first-run-coach__steps li.is-done>span{color:#07130c;background:var(--green-primary);border-color:transparent}
.tutorial-target-pulse{position:relative;z-index:2;box-shadow:0 0 0 2px var(--gold-accent),0 0 18px color-mix(in srgb,var(--gold-accent) 60%,transparent)!important;animation:tutorialPulse 1.6s ease-in-out infinite}
@keyframes tutorialPulse{50%{box-shadow:0 0 0 4px color-mix(in srgb,var(--gold-accent) 35%,transparent),0 0 26px color-mix(in srgb,var(--gold-accent) 72%,transparent)}}
@media(max-width:767px){.first-run-coach{left:10px;right:10px;bottom:72px;width:auto}.first-run-coach__steps{max-height:180px;overflow:auto}}
@media(prefers-reduced-motion:reduce){.tutorial-target-pulse{animation:none}}
`;
