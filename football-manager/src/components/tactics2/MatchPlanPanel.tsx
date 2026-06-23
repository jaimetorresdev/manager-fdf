// ─── X5 · Plan de partido condicional (constructor de reglas) ──────────────────
// SOLO presentación: el estado de las reglas vive en TacticsPage (igual que el
// resto de paneles de tactics2). Aquí se construye, por cada regla, una frase
// "SI <condición de marcador> desde <minuto> ENTONCES <palancas>" que TacticsPage
// serializa dentro de `subsLogic[]` (junto a las sustituciones R4) y envía con la
// táctica vía PUT /api/tactics/:id. El motor (X5, Codex) resegmenta el partido
// desde `fromMin` cuando se cumple la condición y devuelve `tacticalChanges[]`.
// AppliedTacticalChangesPanel lee esos cambios del último partido jugado (visto).
// No toca la pizarra dnd-kit ni el modelo de posiciones de Antigravity.
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, History } from 'lucide-react';
import { Slider } from '../ui';
import { cn } from '../../lib/cn';
import { matchesApi } from '../../api/client';
import { useSession } from '../../stores/sessionStore';
import { T2Panel, T2_CSS } from './TacticsPanels';

// ─── Tipos compartidos con TacticsPage ────────────────────────────────────────
export interface TacticalRuleView {
  fromMin: number;
  toMin?: number;
  condition: string;
  changes: Record<string, unknown>;
}

type StyleOpt = ReadonlyArray<{ id: string; label: string }>;

// Palancas que el motor X5 entiende dentro de `changes` (subconjunto de alto
// impacto; el contrato admite además zonas/refuerzos/lanzadores, fuera de v1).
type LeverKind = 'slider' | 'marking' | 'offStyle' | 'defStyle' | 'formation';
interface Lever { key: string; kind: LeverKind; left?: string; right?: string; def: unknown }
const LEVERS: Lever[] = [
  { key: 'mentality', kind: 'slider', left: 'defensive', right: 'offensive', def: 70 },
  { key: 'pressing', kind: 'slider', left: 'low', right: 'high', def: 70 },
  { key: 'tempo', kind: 'slider', left: 'slow', right: 'fast', def: 70 },
  { key: 'width', kind: 'slider', left: 'narrow', right: 'wide', def: 60 },
  { key: 'construction', kind: 'slider', left: 'low', right: 'high', def: 60 },
  { key: 'destruction', kind: 'slider', left: 'low', right: 'high', def: 60 },
  { key: 'marking', kind: 'marking', def: 'individual' },
  { key: 'offensiveStyle', kind: 'offStyle', def: '' },
  { key: 'defensiveStyle', kind: 'defStyle', def: '' },
  { key: 'formation', kind: 'formation', def: '' },
];
const LEVER_KEYS = LEVERS.map(l => l.key);

const MINUTE_OPTIONS = [15, 30, 45, 60, 70, 80];

export const MP_CSS = `
.mp-rule{background:linear-gradient(145deg,var(--bg-elevated),color-mix(in srgb,var(--blue-info) 3%,var(--bg-elevated)));border:1px solid var(--border-color);border-radius:10px;
  padding:12px;display:flex;flex-direction:column;gap:10px}
.mp-when{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mp-when .lab{font-family:var(--font-display);font-weight:700;font-size:.7rem;letter-spacing:.8px;
  text-transform:uppercase;color:var(--green-primary)}
.mp-when select{min-width:0;background:var(--bg-base);border:1px solid var(--border-color);border-radius:7px;
  padding:7px 8px;font-size:.72rem;color:var(--text-primary)}
.mp-x{margin-left:auto;background:none;border:none;color:var(--red-danger);font-weight:700;
  cursor:pointer;font-size:.78rem;padding:0 4px}
.mp-then-lab{font-family:var(--font-display);font-weight:700;font-size:.7rem;letter-spacing:.8px;
  text-transform:uppercase;color:var(--blue-info);margin:2px 0 0}
.mp-levers{display:flex;flex-wrap:wrap;gap:5px}
.mp-chip{padding:6px 9px;border-radius:7px;font-size:.69rem;font-family:var(--font-sans);font-weight:650;
  border:1px solid var(--border-color);background:var(--bg-base);color:var(--text-muted);
  cursor:pointer;transition:all 150ms ease}
.mp-chip:hover{color:var(--text-primary)}
.mp-chip.on{background:color-mix(in srgb,var(--blue-info) 15%,transparent);color:var(--blue-info);
  border-color:color-mix(in srgb,var(--blue-info) 40%,transparent)}
.mp-ctrls{display:flex;flex-direction:column;gap:10px;border-top:1px dashed var(--border-color);padding-top:10px}
.mp-ctrl-row{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mp-ctrl-row .k{font-size:.7rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted)}
.mp-ctrl-row select{background:var(--bg-base);border:1px solid var(--border-color);border-radius:7px;
  padding:7px 8px;font-size:.72rem;color:var(--text-primary);min-width:130px}
.mp-mk{display:inline-flex;gap:5px}
.mp-empty{font-size:.72rem;color:var(--text-muted);font-style:italic;padding:6px 2px}
.mp-applied{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:8px;padding:10px 12px}
.mp-applied .min{font-family:var(--font-mono-retro);font-weight:700;color:var(--green-primary);font-size:.8rem}
.mp-applied .cond{font-size:.68rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px}
.mp-applied .diff{font-size:.72rem;color:var(--text-primary);margin-top:4px;line-height:1.5}
.mp-applied .diff b{color:var(--blue-info)}
@media(max-width:410px){.mp-when select{flex:1}.mp-ctrl-row{align-items:stretch;flex-direction:column}.mp-ctrl-row select{width:100%}}
`;

// ─── Constructor de reglas condicionales ──────────────────────────────────────
export function MatchPlanPanel({
  rules, conditions, offensiveStyles, defensiveStyles, formations,
  onAdd, onUpdate, onRemove, max = 5,
}: {
  rules: TacticalRuleView[];
  conditions: ReadonlyArray<{ id: string; label: string }>;
  offensiveStyles: StyleOpt;
  defensiveStyles: StyleOpt;
  formations: string[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<TacticalRuleView>) => void;
  onRemove: (i: number) => void;
  max?: number;
}) {
  const { t } = useTranslation();
  const toggleLever = (i: number, lever: Lever) => {
    const rule = rules[i];
    const changes = { ...(rule.changes ?? {}) };
    if (lever.key in changes) delete changes[lever.key];
    else changes[lever.key] = lever.def;
    onUpdate(i, { changes });
  };
  const setLever = (i: number, key: string, value: unknown) => {
    const rule = rules[i];
    onUpdate(i, { changes: { ...(rule.changes ?? {}), [key]: value } });
  };

  return (
    <T2Panel title={t('gameplay:tactics.panels.matchPlan.title')} icon={<ListChecks size={12} />} right={t('gameplay:tactics.panels.matchPlan.rightCount', { count: rules.length, max })}>
      <style>{T2_CSS}</style>
      <style>{MP_CSS}</style>
      <p className="t2p-hint">
        {t('gameplay:tactics.panels.matchPlan.hint')}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.length === 0 && <p className="mp-empty">{t('gameplay:tactics.panels.matchPlan.empty')}</p>}
        {rules.map((rule, i) => {
          const changes = rule.changes ?? {};
          const activeKeys = Object.keys(changes);
          return (
            <div key={i} className="mp-rule">
              <div className="mp-when">
                <span className="lab">{t('gameplay:tactics.panels.matchPlan.if')}</span>
                <select value={rule.condition} onChange={e => onUpdate(i, { condition: e.target.value })}>
                  {conditions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <span className="lab">{t('gameplay:tactics.panels.matchPlan.from')}</span>
                <select value={rule.fromMin} onChange={e => onUpdate(i, { fromMin: Number(e.target.value) })}>
                  {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{t('gameplay:tactics.panels.common.minute', { value: m })}</option>)}
                </select>
                <button className="mp-x" title={t('gameplay:tactics.panels.matchPlan.removeRule')} onClick={() => onRemove(i)}>✕</button>
              </div>

              <p className="mp-then-lab">{t('gameplay:tactics.panels.matchPlan.then')}</p>
              <div className="mp-levers">
                {LEVERS.map(lever => (
                  <button key={lever.key}
                    className={cn('mp-chip', lever.key in changes && 'on')}
                    onClick={() => toggleLever(i, lever)}>
                    {t(`gameplay:tactics.panels.matchPlan.levers.${lever.key}`)}
                  </button>
                ))}
              </div>

              {activeKeys.length > 0 && (
                <div className="mp-ctrls">
                  {LEVERS.filter(l => l.key in changes).map(lever => {
                    const leverLabel = t(`gameplay:tactics.panels.matchPlan.levers.${lever.key}`);
                    if (lever.kind === 'slider') {
                      return (
                        <Slider key={lever.key} label={leverLabel}
                          value={Number(changes[lever.key] ?? lever.def)}
                          onChange={v => setLever(i, lever.key, v)}
                          leftLabel={lever.left ? t(`gameplay:tactics.panels.common.${lever.left}`) : undefined}
                          rightLabel={lever.right ? t(`gameplay:tactics.panels.common.${lever.right}`) : undefined} />
                      );
                    }
                    if (lever.kind === 'marking') {
                      return (
                        <div key={lever.key} className="mp-ctrl-row">
                          <span className="k">{leverLabel}</span>
                          <div className="mp-mk">
                            {(['zonal', 'individual'] as const).map(m => (
                              <button key={m} className={cn('mp-chip', changes[lever.key] === m && 'on')}
                                onClick={() => setLever(i, lever.key, m)}>
                                {t(`gameplay:tactics.panels.common.${m}`)}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    const opts = lever.kind === 'offStyle' ? offensiveStyles
                      : lever.kind === 'defStyle' ? defensiveStyles
                      : formations.map(f => ({ id: f, label: f }));
                    return (
                      <div key={lever.key} className="mp-ctrl-row">
                        <span className="k">{leverLabel}</span>
                        <select value={String(changes[lever.key] ?? '')}
                          onChange={e => setLever(i, lever.key, e.target.value)}>
                          <option value="">{t('gameplay:tactics.panels.common.choose')}</option>
                          {opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rules.length < max && (
        <button className="t2-addbtn" onClick={onAdd}>{t('gameplay:tactics.panels.matchPlan.addRule')}</button>
      )}
    </T2Panel>
  );
}

// ─── Cambios tácticos aplicados en el último partido (lectura post-partido) ─────
interface AppliedChange {
  minute: number;
  condition?: string;
  changes?: Record<string, unknown>;
  previous?: Record<string, unknown>;
  team?: string;
}

const COND_KEYS = ['any', 'winning', 'drawing', 'losing'] as const;

function fmtVal(v: unknown, dash: string): string {
  if (v == null || v === '') return dash;
  return String(v);
}

export function AppliedTacticalChangesPanel() {
  const { t } = useTranslation();
  const clubId = useSession(s => s.club?.id ?? s.user?.manager?.clubId ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'unseen' | 'none' | 'error'>('loading');
  const [applied, setApplied] = useState<AppliedChange[]>([]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const mine = await matchesApi.getMine();
        const played: any[] = Array.isArray(mine?.played) ? mine.played : [];
        if (played.length === 0) { if (mounted.current) setState('none'); return; }
        const last = played[played.length - 1];
        // E15: si el resultado no está visto, el backend oculta homeStatsJson.
        if (last && last.seen === false) { if (mounted.current) setState('unseen'); return; }

        const detail = await matchesApi.getPublic(last.id);
        let raw: any = (detail as any)?.tacticalChanges
          ?? (detail as any)?.matchCenter?.tacticalChanges
          ?? null;
        if (!raw) {
          const stats = (detail as any)?.homeStatsJson;
          const parsed = typeof stats === 'string' ? safeParse(stats) : stats;
          raw = parsed?.tacticalChanges ?? null;
        }
        const list: AppliedChange[] = Array.isArray(raw) ? raw : [];
        const isHome = clubId != null && (detail as any)?.homeClubId === clubId;
        const mySide = clubId == null ? null : (isHome ? 'home' : 'away');
        const filtered = mySide ? list.filter(c => !c.team || c.team === mySide) : list;
        if (!mounted.current) return;
        setApplied(filtered.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0)));
        setState(filtered.length > 0 ? 'ready' : 'none');
      } catch (e) {
        console.error(e);
        if (mounted.current) setState('error');
      }
    })();
    return () => { mounted.current = false; };
  }, [clubId]);

  return (
    <T2Panel title={t('gameplay:tactics.panels.appliedChanges.title')} icon={<History size={12} />}>
      <style>{T2_CSS}</style>
      <style>{MP_CSS}</style>
      {state === 'loading' && <p className="mp-empty">{t('gameplay:tactics.panels.appliedChanges.loading')}</p>}
      {state === 'unseen' && <p className="mp-empty">{t('gameplay:tactics.panels.appliedChanges.unseen')}</p>}
      {state === 'none' && <p className="mp-empty">{t('gameplay:tactics.panels.appliedChanges.none')}</p>}
      {state === 'error' && <p className="t2p-warn">{t('gameplay:tactics.panels.appliedChanges.error')}</p>}
      {state === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {applied.map((c, i) => {
            const ch = c.changes ?? {};
            const prev = c.previous ?? {};
            const condKey = c.condition ?? '';
            const condLabel = (COND_KEYS as readonly string[]).includes(condKey)
              ? t(`gameplay:tactics.panels.conditions.${condKey}`)
              : condKey;
            return (
              <div key={i} className="mp-applied">
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="min">{t('gameplay:tactics.panels.appliedChanges.minute', { value: c.minute })}</span>
                  <span className="cond">{condLabel}</span>
                </div>
                <div className="diff">
                  {Object.keys(ch).map(k => (
                    <div key={k}>
                      {(LEVER_KEYS.includes(k) ? t(`gameplay:tactics.panels.matchPlan.levers.${k}`) : k)}: {fmtVal(prev[k], t('gameplay:tactics.panels.common.dash'))} → <b>{fmtVal(ch[k], t('gameplay:tactics.panels.common.dash'))}</b>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </T2Panel>
  );
}

function safeParse(raw: string): any {
  try { return JSON.parse(raw); } catch { return null; }
}
