import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { DecisionImpactDetail } from '../../lib/decisionImpact';

export function DecisionImpactCenter() {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [impact, setImpact] = useState<DecisionImpactDetail | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onImpact = (event: Event) => {
      const detail = (event as CustomEvent<DecisionImpactDetail>).detail;
      if (!detail?.kind) return;
      setImpact(detail);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setImpact(null), 7200);
    };
    window.addEventListener('fdf:decision-impact', onImpact);
    return () => {
      window.removeEventListener('fdf:decision-impact', onImpact);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  if (!impact) return null;

  return (
    <aside className="decision-impact" role="status" aria-live="polite">
      <style>{DECISION_IMPACT_CSS}</style>
      <button type="button" className="decision-impact__close" onClick={() => setImpact(null)} aria-label={t('actions.close')}>
        <X size={14} />
      </button>
      <span className="decision-impact__icon"><CheckCircle2 size={21} /></span>
      <div className="decision-impact__body">
        <small><Sparkles size={11} />{t('ux.impact.applied')}</small>
        <strong>{t(`ux.impact.${impact.kind}.title`)}</strong>
        <p>{t(`ux.impact.${impact.kind}.effect`)}</p>
        <span><Clock3 size={11} />{t(`ux.impact.${impact.kind}.timing`)}</span>
      </div>
      <button
        type="button"
        className="decision-impact__action"
        onClick={() => { setImpact(null); navigate(impact.route); }}
      >
        {t('ux.impact.review')} <ArrowRight size={13} />
      </button>
    </aside>
  );
}

const DECISION_IMPACT_CSS = `
.decision-impact{position:fixed;right:18px;bottom:18px;z-index:160;width:min(410px,calc(100vw - 28px));padding:14px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:start;gap:11px;border:1px solid color-mix(in srgb,var(--green-primary) 48%,var(--border-color));border-radius:14px;background:color-mix(in srgb,var(--bg-elevated) 94%,transparent);box-shadow:0 18px 55px -18px rgba(0,0,0,.75),0 0 28px color-mix(in srgb,var(--green-primary) 12%,transparent);backdrop-filter:blur(18px);animation:impactIn .28s cubic-bezier(.2,.8,.2,1) both}
.decision-impact__close{position:absolute;top:6px;right:6px;width:26px;height:26px;display:grid;place-items:center;border:0;border-radius:7px;color:var(--text-muted);background:transparent;cursor:pointer}.decision-impact__close:hover{color:var(--text-primary);background:var(--row-hover)}
.decision-impact__icon{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 14%,var(--bg-surface));border:1px solid color-mix(in srgb,var(--green-primary) 35%,var(--border-color))}
.decision-impact__body{min-width:0;padding-right:12px}.decision-impact__body small{display:flex;align-items:center;gap:5px;margin-bottom:3px;color:var(--green-primary);font-size:.54rem;font-weight:850;letter-spacing:.1em;text-transform:uppercase}.decision-impact__body strong{display:block;color:var(--text-primary);font-family:var(--font-display);font-size:.88rem}.decision-impact__body p{margin-top:4px;color:var(--text-muted);font-size:.7rem;line-height:1.35}.decision-impact__body>span{display:flex;align-items:center;gap:5px;margin-top:7px;color:var(--gold-accent);font-size:.58rem;font-weight:700}
.decision-impact__action{align-self:end;margin-top:22px;padding:7px 9px;display:inline-flex;align-items:center;gap:5px;border:1px solid color-mix(in srgb,var(--green-primary) 35%,var(--border-color));border-radius:8px;color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 8%,transparent);font-size:.6rem;font-weight:800;white-space:nowrap;cursor:pointer}
@keyframes impactIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
@media(max-width:767px){.decision-impact{right:10px;bottom:72px;left:10px;width:auto;grid-template-columns:auto minmax(0,1fr)}.decision-impact__action{grid-column:2;margin-top:0;justify-self:start}}
@media(prefers-reduced-motion:reduce){.decision-impact{animation:none}}
`;
