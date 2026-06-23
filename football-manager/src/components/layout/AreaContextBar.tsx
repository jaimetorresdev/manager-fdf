import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ChevronDown, Compass, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CONTEXT_PHASES, pathActive, tutorialRoute } from './navConfig';
import { cn } from '../../lib/cn';

const PHASE_GUIDANCE: Record<string, { decision: string; impact: string }> = {
  equipo: {
    decision: 'ux.context.teamDecision',
    impact: 'ux.context.teamImpact',
  },
  competicion: {
    decision: 'ux.context.competitionDecision',
    impact: 'ux.context.competitionImpact',
  },
  fichajes: {
    decision: 'ux.context.transfersDecision',
    impact: 'ux.context.transfersImpact',
  },
  club: {
    decision: 'ux.context.clubDecision',
    impact: 'ux.context.clubImpact',
  },
  comunidad: {
    decision: 'ux.context.communityDecision',
    impact: 'ux.context.communityImpact',
  },
  manager: {
    decision: 'ux.context.managerDecision',
    impact: 'ux.context.managerImpact',
  },
  operations: {
    decision: 'ux.context.operationsDecision',
    impact: 'ux.context.operationsImpact',
  },
};

export function AreaContextBar() {
  const { t } = useTranslation('common');
  const location = useLocation();
  const phase = CONTEXT_PHASES.find((item) =>
    (
      item.links.some((link) => pathActive(location.pathname, link.path, link.exact))
      || item.matchPrefixes?.some((prefix) => location.pathname.startsWith(prefix))
    ),
  );

  if (!phase) return null;

  const primary = phase.links.filter((link) => link.primary !== false);
  const secondary = phase.links.filter((link) => link.primary === false);
  const current = phase.links.find((link) => pathActive(location.pathname, link.path, link.exact));
  const guidance = PHASE_GUIDANCE[phase.id];
  const PhaseIcon = phase.icon;

  return (
    <section
      className="area-context"
      style={{ ['--area-accent' as string]: phase.accent ?? 'var(--green-primary)' }}
      aria-label={t(phase.labelKey, phase.fallback)}
    >
      <style>{AREA_CONTEXT_CSS}</style>
      <Link to={phase.homePath} className="area-context__identity">
        <span><PhaseIcon size={16} /></span>
        <div>
          <small>{t(phase.labelKey, phase.fallback)}</small>
          <strong>
            {current ? t(current.labelKey) : t('nav.detail', 'Detalle')}
          </strong>
        </div>
      </Link>

      {guidance && (
        <div className="area-context__guidance" aria-label={t('ux.context.whatChanges')}>
          <Sparkles size={13} />
          <span>{t(guidance.decision)}</span>
          <ArrowRight size={12} />
          <strong>{t(guidance.impact)}</strong>
        </div>
      )}

      <nav className="area-context__links" aria-label={t('nav.sectionTools', 'Herramientas de la sección')}>
        {primary.map((link) => {
          const Icon = link.icon;
          const active = pathActive(location.pathname, link.path, link.exact);
          return (
            <Link
              key={link.path}
              to={link.path}
              className={cn(active && 'is-active')}
              aria-current={active ? 'page' : undefined}
              title={link.descKey ? t(link.descKey) : undefined}
              data-tutorial-route={tutorialRoute(link.path)}
            >
              <Icon size={14} />
              <span>{t(link.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      {secondary.length > 0 && (
        <details className="area-context__more">
          <summary>
            <Compass size={14} />
            <span>{t('nav.more', 'Más')}</span>
            <ChevronDown size={13} />
          </summary>
          <div>
            {secondary.map((link) => {
              const Icon = link.icon;
              const active = pathActive(location.pathname, link.path, link.exact);
              return (
                <Link key={link.path} to={link.path} className={cn(active && 'is-active')}>
                  <Icon size={14} />
                  <span><strong>{t(link.labelKey)}</strong><small>{link.descKey ? t(link.descKey) : ''}</small></span>
                </Link>
              );
            })}
          </div>
        </details>
      )}
    </section>
  );
}

const AREA_CONTEXT_CSS = `
.area-context{position:relative;z-index:25;margin-bottom:12px;padding:5px;display:flex;align-items:center;gap:6px;border:1px solid color-mix(in srgb,var(--area-accent) 28%,var(--border-color));border-radius:12px;background:linear-gradient(110deg,color-mix(in srgb,var(--area-accent) 6%,var(--bg-surface)),color-mix(in srgb,var(--bg-surface) 95%,transparent));box-shadow:0 10px 28px -24px rgba(0,0,0,.82),inset 0 1px color-mix(in srgb,white 4%,transparent);backdrop-filter:blur(14px)}
.area-context::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;border-radius:15px 0 0 15px;background:var(--area-accent);box-shadow:0 0 18px var(--area-accent)}
.area-context__identity{min-width:150px;padding:5px 8px;display:flex;align-items:center;gap:8px;border-radius:9px;color:var(--text-primary);text-decoration:none}
.area-context__identity:hover{background:color-mix(in srgb,var(--area-accent) 7%,transparent)}
.area-context__identity>span{width:32px;height:32px;display:grid;place-items:center;flex:0 0 auto;border:1px solid color-mix(in srgb,var(--area-accent) 38%,var(--border-color));border-radius:9px;color:var(--area-accent);background:color-mix(in srgb,var(--area-accent) 10%,var(--bg-elevated))}
.area-context__identity div{min-width:0;display:flex;flex-direction:column;line-height:1.05}.area-context__identity small{color:var(--area-accent);font-size:.47rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.area-context__identity strong{margin-top:3px;max-width:155px;overflow:hidden;font-family:var(--font-display);font-size:.7rem;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}
.area-context__guidance{min-width:0;max-width:330px;padding:6px 10px;display:flex;align-items:center;gap:6px;border-left:1px solid color-mix(in srgb,var(--border-color) 65%,transparent);color:var(--text-muted);font-size:.6rem;line-height:1.2}
.area-context__guidance svg:first-child{color:var(--gold-accent);flex:none}.area-context__guidance svg{flex:none;opacity:.6}.area-context__guidance span,.area-context__guidance strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.area-context__guidance strong{color:var(--text-primary);font-weight:750}
.area-context__links{min-width:0;display:flex;align-items:stretch;gap:4px;flex:1;overflow-x:auto;scrollbar-width:none}.area-context__links::-webkit-scrollbar{display:none}
.area-context__links a{position:relative;min-width:max-content;padding:7px 10px;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1;border:1px solid transparent;border-radius:8px;color:var(--text-muted);font-size:.58rem;font-weight:800;letter-spacing:.03em;text-decoration:none;text-transform:uppercase;white-space:nowrap}
.area-context__links a::after{content:"";position:absolute;right:24%;bottom:3px;left:24%;height:2px;border-radius:2px;background:transparent}
.area-context__links a:hover{color:var(--text-primary);background:var(--row-hover)}.area-context__links a.is-active{color:var(--area-accent);border-color:color-mix(in srgb,var(--area-accent) 38%,var(--border-color));background:linear-gradient(180deg,color-mix(in srgb,var(--area-accent) 14%,var(--bg-elevated)),color-mix(in srgb,var(--area-accent) 6%,var(--bg-elevated)));box-shadow:0 8px 20px -16px var(--area-accent)}.area-context__links a.is-active::after{background:var(--area-accent);box-shadow:0 0 8px var(--area-accent)}
.area-context__more{position:relative;flex:0 0 auto}.area-context__more summary{padding:7px 8px;display:flex;align-items:center;gap:5px;border:1px solid var(--border-color);border-radius:8px;color:var(--text-muted);background:var(--bg-elevated);cursor:pointer;font-size:.57rem;font-weight:780;text-transform:uppercase;list-style:none}.area-context__more summary::-webkit-details-marker{display:none}.area-context__more[open] summary{color:var(--area-accent);border-color:color-mix(in srgb,var(--area-accent) 35%,var(--border-color))}
.area-context__more>div{position:absolute;top:calc(100% + 7px);right:0;width:250px;padding:6px;display:grid;gap:3px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-elevated);box-shadow:var(--shadow-soft)}
.area-context__more:not([open])>div{display:none}
.area-context__more>div a{padding:9px;display:flex;align-items:center;gap:9px;border-radius:8px;color:var(--text-muted);text-decoration:none}.area-context__more>div a:hover,.area-context__more>div a.is-active{color:var(--text-primary);background:var(--row-hover)}.area-context__more>div a>svg{color:var(--area-accent);flex:0 0 auto}.area-context__more>div a span{min-width:0;display:flex;flex-direction:column}.area-context__more>div strong{font-size:.65rem}.area-context__more>div small{overflow:hidden;font-size:.55rem;text-overflow:ellipsis;white-space:nowrap}
@media(max-width:1180px){.area-context__guidance{display:none}}
@media(max-width:980px){.area-context__identity{min-width:145px}.area-context__links a{padding-inline:8px}}
@media(max-width:760px){.area-context{align-items:center;flex-wrap:nowrap;margin-bottom:9px}.area-context__identity{min-width:125px}.area-context__identity>span{width:29px;height:29px}.area-context__links{width:auto;padding-top:0;border-top:0}.area-context__links a{padding:7px 8px;flex:0 0 auto}.area-context__links a span{display:none}.area-context__more>div{position:fixed;right:12px;left:12px;top:auto;width:auto}}
`;
