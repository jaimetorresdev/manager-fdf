// ─── Y10 · Panel de inteligencia de formación ─────────────────────────────────
// Cablea la lógica PURA de Codex (src/lib/tacticsLogic.ts) en la UI de tácticas:
// perfil del dibujo (estilo + demanda física), counters (fuerte/débil frente a),
// y AVISOS de fuera de posición calculando la mejor colocación del XI actual.
// Componente de presentación: recibe formación + titulares, no toca red ni estado.
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Swords, ShieldAlert, Gauge } from 'lucide-react';
import { useGameStore } from '../../stores/gameStore';
import {
  getFormationDefinition,
  computePhysicalDemand,
  autoPlaceLineup,
  type TacticPlayer,
} from '../../lib/tacticsLogic';

const FI_CSS = `
.t2fi{background:linear-gradient(145deg,var(--bg-surface),color-mix(in srgb,var(--bg-elevated) 62%,var(--bg-surface)));border:1px solid var(--border-color);border-radius:13px;overflow:hidden;box-shadow:0 18px 40px -34px rgba(0,0,0,.9),inset 0 1px color-mix(in srgb,white 4%,transparent)}
.t2fi-h{display:flex;align-items:center;gap:7px;padding:12px 14px;background:linear-gradient(100deg,color-mix(in srgb,var(--gold-accent) 6%,var(--bg-elevated)),var(--bg-elevated));
  border-bottom:1px solid var(--border-color);font-family:var(--font-display);font-weight:850;font-size:.72rem;
  text-transform:uppercase;letter-spacing:1px;color:var(--text-primary)}
.t2fi-b{padding:13px 14px;display:flex;flex-direction:column;gap:10px}
.t2fi-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:.75rem}
.t2fi-k{color:var(--text-muted);font-size:.65rem;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.t2fi-v{font-family:var(--font-sans);font-weight:600;color:var(--text-primary);text-align:right}
.t2fi-dots{display:inline-flex;gap:2px}
.t2fi-dot{width:7px;height:7px;border-radius:50%;background:var(--border-color)}
.t2fi-dot.on{background:var(--gold-accent)}
.t2fi-tags{display:flex;flex-wrap:wrap;gap:4px}
.t2fi-tag{font-family:var(--font-sans);font-size:.62rem;font-weight:700;padding:2px 6px;border-radius:4px;
  border:1px solid var(--border-color);background:var(--bg-elevated)}
.t2fi-tag.good{color:var(--green-primary);border-color:color-mix(in srgb,var(--green-primary) 34%,var(--border-color))}
.t2fi-tag.bad{color:var(--red-danger);border-color:color-mix(in srgb,var(--red-danger) 34%,var(--border-color))}
.t2fi-warn{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;font-size:.7rem;
  background:color-mix(in srgb,var(--gold-accent) 10%,transparent);border:1px solid color-mix(in srgb,var(--gold-accent) 28%,transparent)}
.t2fi-warn.ok{background:color-mix(in srgb,var(--green-primary) 9%,transparent);border-color:color-mix(in srgb,var(--green-primary) 26%,transparent)}
.t2fi-oop{display:flex;flex-direction:column;gap:4px}
.t2fi-oop-row{display:flex;align-items:center;gap:6px;font-size:.7rem;color:var(--text-primary)}
.t2fi-pen{margin-left:auto;font-family:var(--font-mono-retro);font-size:.65rem;font-weight:700}
.t2fi-pen.adapt{color:var(--gold-accent)}
.t2fi-pen.emerg{color:var(--red-danger)}
.t2fi-note{font-size:.65rem;color:var(--text-muted);line-height:1.3}
.t2fi-more{padding:5px 7px;border:1px dashed var(--border-color);border-radius:6px;color:var(--text-muted);font-size:.65rem}
.t2fi-more summary{cursor:pointer;color:var(--gold-accent);font-weight:700}
.t2fi-more[open] summary{margin-bottom:6px}
`;

const STYLE_LABEL: Record<string, string> = {
  posesion: 'posesion', contraataque: 'contraataque', equilibrada: 'equilibrada',
  defensiva: 'defensiva', ofensiva: 'ofensiva', historica: 'historica',
};

export interface PositionalAlert {
  message: string;
  severity?: 'info' | 'warn' | 'critical';
  playerName?: string;
  slotLabel?: string;
}

interface Props {
  formation: string;
  starters: any[];
  /** N3-1 · avisos del back cuando exponga incompatibilidad posicional absoluta. */
  positionalAlerts?: PositionalAlert[];
}

export function FormationInsightPanel({ formation, starters, positionalAlerts = [] }: Props) {
  const { t } = useTranslation();
  const inGameDate = useGameStore((s) => s.gameState?.inGameDate);
  const referenceDate = useMemo(
    () => (inGameDate ? new Date(inGameDate) : undefined),
    [inGameDate],
  );
  const def = useMemo(() => getFormationDefinition(formation), [formation]);
  const demand = useMemo(() => computePhysicalDemand(formation), [formation]);
  const validation = useMemo(
    () => autoPlaceLineup(starters as TacticPlayer[], formation, referenceDate),
    [starters, formation, referenceDate],
  );

  const outOfPos = useMemo(
    () => validation.xi.filter(a => a.player && (a.severity === 'adapted' || a.severity === 'emergency')),
    [validation],
  );
  const uniquePositionalAlerts = useMemo(() => {
    const seen = new Set<string>();
    return positionalAlerts.filter((alert) => {
      const key = `${alert.playerName ?? ''}|${alert.slotLabel ?? ''}|${alert.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [positionalAlerts]);
  const visiblePositionalAlerts = uniquePositionalAlerts.slice(0, 3);
  const extraAlertCount = Math.max(0, uniquePositionalAlerts.length - visiblePositionalAlerts.length);

  if (!def) return null;

  const demandLevel = demand.demand ?? def.physicalDemand;

  return (
    <div className="t2fi">
      <style>{FI_CSS}</style>
      <div className="t2fi-h"><Gauge size={13} /> {t('gameplay:tactics.panels.formationInsight.title')}</div>
      <div className="t2fi-b">
        <div className="t2fi-row">
          <span className="t2fi-k">{t('gameplay:tactics.panels.formationInsight.style')}</span>
          <span className="t2fi-v">{STYLE_LABEL[def.style] ? t(`gameplay:tactics.panels.formationInsight.formationStyles.${STYLE_LABEL[def.style]}`) : def.style}</span>
        </div>

        <div className="t2fi-row">
          <span className="t2fi-k"><Activity size={11} style={{ verticalAlign: -1 }} /> {t('gameplay:tactics.panels.formationInsight.physicalDemand')}</span>
          <span className="t2fi-dots" title={t('gameplay:tactics.panels.common.level', { level: demandLevel })}>
            {[1, 2, 3, 4, 5].map(n => <span key={n} className={`t2fi-dot${n <= demandLevel ? ' on' : ''}`} />)}
          </span>
        </div>

        {/* Counters del catálogo (manual de formaciones) */}
        {(def.counters.strongVs.length > 0 || def.counters.weakVs.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="t2fi-k" style={{ display: 'flex', gap: 4, alignItems: 'center' }}><Swords size={11} /> {t('gameplay:tactics.panels.formationInsight.counters')}</span>
            {def.counters.strongVs.length > 0 && (
              <div className="t2fi-tags">
                <span style={{ fontSize: '.62rem', color: 'var(--green-primary)', alignSelf: 'center', fontWeight: 700 }}>{t('gameplay:tactics.panels.formationInsight.strong')}</span>
                {def.counters.strongVs.map(c => <span key={c} className="t2fi-tag good">{c}</span>)}
              </div>
            )}
            {def.counters.weakVs.length > 0 && (
              <div className="t2fi-tags">
                <span style={{ fontSize: '.62rem', color: 'var(--red-danger)', alignSelf: 'center', fontWeight: 700 }}>{t('gameplay:tactics.panels.formationInsight.weak')}</span>
                {def.counters.weakVs.map(c => <span key={c} className="t2fi-tag bad">{c}</span>)}
              </div>
            )}
          </div>
        )}

        {/* Avisos de incompatibilidad posicional (contrato N3-1, cuando el back los publique) */}
        {uniquePositionalAlerts.length > 0 && (
          <div className="t2fi-oop">
            {visiblePositionalAlerts.map((a, i) => (
              <div
                key={`${a.message}-${i}`}
                className="t2fi-warn"
                style={a.severity === 'critical'
                  ? { borderColor: 'color-mix(in srgb, var(--red-danger) 35%, transparent)', background: 'color-mix(in srgb, var(--red-danger) 8%, transparent)' }
                  : undefined}
              >
                <ShieldAlert size={13} style={{ color: a.severity === 'critical' ? 'var(--red-danger)' : 'var(--gold-accent)' }} />
                <span>
                  {a.playerName ? <b>{a.playerName}: </b> : null}
                  {a.message}
                  {a.slotLabel ? ` (${a.slotLabel})` : ''}
                </span>
              </div>
            ))}
            {extraAlertCount > 0 && (
              <details className="t2fi-more">
                <summary>{t('gameplay:tactics.command.moreAlerts', { count: extraAlertCount })}</summary>
                <div className="t2fi-oop">
                  {uniquePositionalAlerts.slice(3).map((alert, index) => (
                    <div key={`${alert.message}-extra-${index}`} className="t2fi-oop-row">
                      <span style={{ fontWeight: 600 }}>{alert.playerName ?? t('gameplay:tactics.panels.formationInsight.title')}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{alert.slotLabel ?? alert.message}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Avisos de fuera de posición (WT2 / tacticsLogic local) */}
        {starters.length > 0 && (
          outOfPos.length === 0 && validation.missingSlots.length === 0 ? (
            <div className="t2fi-warn ok">
              <ShieldAlert size={13} style={{ color: 'var(--green-primary)' }} />
              <span>{t('gameplay:tactics.panels.formationInsight.xiNatural')}</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="t2fi-warn">
                <ShieldAlert size={13} style={{ color: 'var(--gold-accent)' }} />
                <span>
                  {outOfPos.length > 0 && t('gameplay:tactics.panels.formationInsight.outOfPosition', { count: outOfPos.length })}
                  {outOfPos.length > 0 && validation.missingSlots.length > 0 && t('gameplay:tactics.panels.formationInsight.separator')}
                  {validation.missingSlots.length > 0 && t('gameplay:tactics.panels.formationInsight.uncoveredSlots', { count: validation.missingSlots.length })}
                </span>
              </div>
              {outOfPos.length > 0 && (
                <div className="t2fi-oop">
                  {outOfPos.map(a => (
                    <div key={a.player!.id} className="t2fi-oop-row">
                      <span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.player!.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '.68rem' }}>
                        {a.naturalPosition ?? t('gameplay:tactics.panels.common.dash')} → {a.slotLabel}
                      </span>
                      <span className={`t2fi-pen ${a.severity === 'emergency' ? 'emerg' : 'adapt'}`}>{a.penalty}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {demand.notes.length > 0 && (
          <p className="t2fi-note">{demand.notes.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}
