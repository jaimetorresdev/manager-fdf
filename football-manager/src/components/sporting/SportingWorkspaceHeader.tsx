import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { useSession } from '../../stores/sessionStore';
import { useGameStore } from '../../stores/gameStore';
import { ClubBadge } from '../ui';

export interface SportingMetric {
  label: string;
  value: ReactNode;
  tone?: 'good' | 'watch' | 'risk' | 'neutral';
}

interface Props {
  eyebrow: string;
  title: string;
  description: string;
  metrics?: SportingMetric[];
  alert?: { tone: 'good' | 'watch' | 'risk'; title: string; detail?: string };
  actions?: ReactNode;
}

export function SportingWorkspaceHeader({
  eyebrow,
  title,
  description,
  metrics = [],
  alert,
  actions,
}: Props) {
  const { t } = useTranslation();
  const club = useSession((state) => state.club);
  const gameState = useGameStore((state) => state.gameState);

  return (
    <section className="sporting-workspace">
      <style>{SPORTING_WORKSPACE_CSS}</style>
      <div className="sporting-workspace__main">
        <div className="sporting-workspace__identity">
          <span className="sporting-workspace__badge">
            <ClubBadge id={club?.id} name={club?.name} size={62} />
          </span>
          <div className="sporting-workspace__copy">
            <span className="sporting-workspace__eyebrow"><Activity size={12} />{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
        <div className="sporting-workspace__context">
          {gameState?.seasonWeek != null && (
            <span>{t('gameplay:sportingHub.matchday', { week: gameState.seasonWeek })}</span>
          )}
          {gameState?.season && <span>{gameState.season}</span>}
          {actions && <div className="sporting-workspace__actions">{actions}</div>}
        </div>
      </div>

      {(alert || metrics.length > 0) && <div className="sporting-workspace__rail">
        {alert && (
          <div className={`sporting-workspace__alert sporting-workspace__alert--${alert.tone}`}>
            <strong>{alert.title}</strong>
            {alert.detail && <span>{alert.detail}</span>}
          </div>
        )}
        {metrics.length > 0 && (
          <div className="sporting-workspace__metrics">
            {metrics.map((metric) => (
              <div key={metric.label} className={`sporting-workspace__metric sporting-workspace__metric--${metric.tone ?? 'neutral'}`}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        )}
      </div>}
    </section>
  );
}

const SPORTING_WORKSPACE_CSS = `
.sporting-workspace {
  position: relative;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--club-primary) 38%, var(--border-color));
  border-radius: 18px;
  background:
    radial-gradient(circle at 10% -40%, color-mix(in srgb, var(--club-primary) 22%, transparent), transparent 45%),
    linear-gradient(120deg, var(--bg-surface), color-mix(in srgb, var(--club-secondary) 6%, var(--bg-surface)));
  box-shadow: 0 18px 50px rgba(0,0,0,.16);
}
.sporting-workspace::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 2px;
  background: linear-gradient(90deg, var(--club-primary), var(--club-secondary), transparent 86%);
}
.sporting-workspace__main {
  min-height: 104px;
  padding: 16px 18px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}
.sporting-workspace__identity { min-width: 0; display: flex; align-items: center; gap: 15px; }
.sporting-workspace__badge {
  width: 68px;
  height: 68px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--club-primary) 38%, var(--border-color));
  border-radius: 22px;
  background: color-mix(in srgb, var(--bg-base) 72%, transparent);
}
.sporting-workspace__copy { min-width: 0; }
.sporting-workspace__eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  color: color-mix(in srgb, var(--club-primary) 70%, var(--text-primary));
  font-size: .63rem;
  font-weight: 850;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.sporting-workspace h1 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-size: clamp(1.55rem, 2.6vw, 2.25rem);
  font-weight: 950;
  letter-spacing: -.045em;
  line-height: 1;
  text-transform: uppercase;
}
.sporting-workspace__copy p {
  max-width: 720px;
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: .76rem;
  line-height: 1.45;
}
.sporting-workspace__context { display: flex; align-items: center; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
.sporting-workspace__context > span {
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  color: var(--text-muted);
  background: var(--bg-elevated);
  font-size: .62rem;
  font-weight: 750;
  letter-spacing: .06em;
  text-transform: uppercase;
}
.sporting-workspace__actions { display: flex; gap: 7px; }
.sporting-workspace__rail {
  padding: 8px 12px 10px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-top: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-base) 55%, transparent);
}
.sporting-workspace__alert {
  min-width: min(390px, 40%);
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-left: 2px solid var(--sporting-tone);
  color: var(--text-primary);
}
.sporting-workspace__alert--good { --sporting-tone: var(--green-primary); }
.sporting-workspace__alert--watch { --sporting-tone: var(--gold-accent); }
.sporting-workspace__alert--risk { --sporting-tone: var(--red-danger); }
.sporting-workspace__alert strong { overflow: hidden; font-size: .68rem; text-overflow: ellipsis; white-space: nowrap; }
.sporting-workspace__alert span { overflow: hidden; color: var(--text-muted); font-size: .59rem; text-overflow: ellipsis; white-space: nowrap; }
.sporting-workspace__metrics { margin-left: auto; display: flex; gap: 7px; }
.sporting-workspace__metric {
  min-width: 86px;
  padding: 6px 9px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-elevated);
}
.sporting-workspace__metric small { color: var(--text-muted); font-size: .54rem; font-weight: 750; letter-spacing: .06em; text-transform: uppercase; }
.sporting-workspace__metric strong { color: var(--sporting-metric, var(--text-primary)); font-family: var(--font-scoreboard); font-size: .82rem; }
.sporting-workspace__metric--good { --sporting-metric: var(--green-primary); }
.sporting-workspace__metric--watch { --sporting-metric: var(--gold-accent); }
.sporting-workspace__metric--risk { --sporting-metric: var(--red-danger); }
@media(max-width:900px) {
  .sporting-workspace__main { align-items: flex-start; flex-direction: column; }
  .sporting-workspace__context { justify-content: flex-start; }
  .sporting-workspace__rail { align-items: stretch; flex-direction: column; }
  .sporting-workspace__alert { width: 100%; }
  .sporting-workspace__metrics { width: 100%; margin-left: 0; display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); }
  .sporting-workspace__metric { min-width: 0; }
}
@media(max-width:560px) {
  .sporting-workspace__main { padding: 16px; }
  .sporting-workspace__badge { width: 62px; height: 62px; border-radius: 17px; }
  .sporting-workspace__badge > * { transform: scale(.82); }
  .sporting-workspace h1 { font-size: 1.45rem; }
  .sporting-workspace__copy p { font-size: .7rem; }
  .sporting-workspace__metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
`;
