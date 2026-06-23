// ─── E17 LOTE B · Paneles de presentación de la página de Táctica ──────────────
// SOLO presentación: todos los valores y callbacks llegan por props desde
// TacticsPage (la lógica de autosave/estado/localStorage NO vive aquí).
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Sword, Shield, Zap } from 'lucide-react';
import { Slider } from '../ui';
import { cn } from '../../lib/cn';

export const T2_CSS = `
.t2p{min-width:0;background:linear-gradient(145deg,var(--bg-surface),color-mix(in srgb,var(--bg-elevated) 66%,var(--bg-surface)));border:1px solid var(--border-color);border-radius:13px;
  overflow:hidden;box-shadow:0 18px 40px -34px rgba(0,0,0,.9),inset 0 1px color-mix(in srgb,white 4%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
.t2p-head{display:flex;align-items:center;gap:7px;padding:12px 14px;background:linear-gradient(100deg,color-mix(in srgb,var(--green-primary) 5%,var(--bg-elevated)),var(--bg-elevated));
  border-bottom:1px solid var(--border-color);font-family:var(--font-display);font-weight:850;
  font-size:.72rem;text-transform:uppercase;letter-spacing:.085em;color:var(--text-primary)}
.t2p-head .right{margin-left:auto;font-family:var(--font-sans);font-weight:600;font-size:.7rem;color:var(--text-muted);text-transform:none;letter-spacing:0}
.t2p-body{min-width:0;padding:14px}
.t2-help-button{padding:4px 7px;border:1px solid color-mix(in srgb,var(--blue-info) 28%,var(--border-color));border-radius:6px;color:var(--blue-info);background:color-mix(in srgb,var(--blue-info) 6%,transparent);cursor:pointer;font-family:var(--font-sans);font-size:.62rem;font-weight:750}
.t2p-hint{font-size:.7rem;color:var(--text-muted);margin:0 0 12px;line-height:1.5}
.t2p-warn{margin-top:10px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--gold-accent) 25%,var(--border-color));border-radius:8px;background:color-mix(in srgb,var(--gold-accent) 7%,transparent);font-size:.68rem;color:var(--gold-accent);line-height:1.4}
.t2-chiprow{display:flex;flex-wrap:wrap;gap:6px}
.t2-chip{padding:6px 10px;border-radius:7px;font-size:.72rem;font-family:var(--font-sans);font-weight:650;
  border:1px solid var(--border-color);background:var(--bg-elevated);color:var(--text-muted);
  cursor:pointer;transition:all 150ms ease}
.t2-chip:hover{color:var(--text-primary);transform:translateY(-1px)}
.t2-chip.on-blue{background:color-mix(in srgb,var(--blue-info) 15%,transparent);color:var(--blue-info);
  border-color:color-mix(in srgb,var(--blue-info) 40%,transparent)}
.t2-chip.on-red{background:color-mix(in srgb,var(--red-danger) 15%,transparent);color:var(--red-danger);
  border-color:color-mix(in srgb,var(--red-danger) 40%,transparent)}
.t2-style-block{padding:11px;border:1px solid var(--border-color);border-radius:10px;background:color-mix(in srgb,var(--bg-base) 35%,transparent)}
.t2-style-title{margin:0 0 8px;display:flex;align-items:center;gap:6px;font-size:.62rem;font-weight:850;text-transform:uppercase;letter-spacing:.1em}
.t2-style-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.t2-style-option{min-width:0;padding:9px 10px;display:flex;align-items:center;justify-content:space-between;gap:7px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-elevated);color:var(--text-muted);cursor:pointer;font-size:.7rem;font-weight:700;text-align:left;transition:all 150ms ease}
.t2-style-option:hover{color:var(--text-primary);transform:translateY(-1px)}.t2-style-option svg{flex:0 0 auto}
.t2-style-option.off.on{color:var(--blue-info);border-color:color-mix(in srgb,var(--blue-info) 42%,var(--border-color));background:color-mix(in srgb,var(--blue-info) 12%,var(--bg-elevated))}
.t2-style-option.def.on{color:var(--red-danger);border-color:color-mix(in srgb,var(--red-danger) 42%,var(--border-color));background:color-mix(in srgb,var(--red-danger) 11%,var(--bg-elevated))}
.t2-zone{min-width:0;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:9px;
  padding:10px;text-align:center}
.t2-zone-l{font-size:.65rem;color:var(--text-muted);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}
.t2-zone input{width:100%;min-width:0;background:var(--bg-base);border:1px solid var(--border-color);border-radius:7px;
  text-align:center;font-family:var(--font-scoreboard);font-weight:800;font-size:1rem;color:var(--blue-info);padding:6px 2px}
.t2-zone-pct{font-size:.65rem;color:var(--text-muted);margin:4px 0 6px}
.t2-zone button{width:100%;padding:4px 0;border-radius:6px;font-size:.75rem;font-weight:700;
  font-family:var(--font-sans);border:1px solid var(--border-color);background:var(--bg-base);
  color:var(--text-muted);cursor:pointer;transition:all 150ms ease}
.t2-zone button:hover{color:var(--text-primary)}
.t2-zone button.on{background:color-mix(in srgb,var(--red-danger) 15%,transparent);color:var(--red-danger);
  border-color:color-mix(in srgb,var(--red-danger) 40%,transparent)}
.t2-sub{background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:9px;padding:11px;display:flex;flex-direction:column;gap:8px}
.t2-sub select{background:var(--bg-base);border:1px solid var(--border-color);border-radius:6px;
  min-width:0;padding:7px 8px;font-size:.72rem;color:var(--text-primary)}
.t2-sub .out{border-color:color-mix(in srgb,var(--red-danger) 30%,transparent)}
.t2-sub .in{border-color:color-mix(in srgb,var(--green-primary) 30%,transparent)}
.t2-addbtn{width:100%;margin-top:8px;padding:8px 0;border-radius:8px;font-size:.8rem;
  font-weight:600;color:var(--blue-info);background:transparent;cursor:pointer;
  border:1px dashed color-mix(in srgb,var(--blue-info) 35%,transparent);transition:background 150ms ease}
.t2-addbtn:hover{background:color-mix(in srgb,var(--blue-info) 10%,transparent)}
.t2-xp{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:8px 12px;
  border-radius:8px;background:color-mix(in srgb,var(--gold-accent) 10%,transparent);
  border:1px solid color-mix(in srgb,var(--gold-accent) 22%,transparent);font-size:.75rem;color:var(--gold-accent)}
.t2-xp b{font-family:var(--font-sans);font-weight:bold}
.t2-slider-val{font-family:var(--font-sans);font-weight:700;font-size:.9rem}
.t2-lever-grid{display:grid;gap:9px}.t2-lever{padding:10px 11px;border:1px solid var(--border-color);border-radius:9px;background:color-mix(in srgb,var(--bg-base) 34%,transparent)}.t2-lever .sl-label{font-weight:750}.t2-marking{padding:10px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border-color);border-radius:9px;background:color-mix(in srgb,var(--bg-base) 34%,transparent)}.t2-marking>span{font-size:.66rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted)}
.t2-empty{padding:10px;border:1px dashed var(--border-color);border-radius:8px;color:var(--text-muted);font-size:.68rem;line-height:1.45;text-align:center}
@media(max-width:420px){.t2-style-grid{grid-template-columns:1fr}}
`;

/** Marco de panel con titlebar retro (presentación común de la columna táctica). */
export function T2Panel({ title, icon, right, children }: {
  title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="t2p">
      <style>{T2_CSS}</style>
      <div className="t2p-head">{icon}{title}{right && <span className="right">{right}</span>}</div>
      <div className="t2p-body">{children}</div>
    </div>
  );
}

// ─── Centro del campo (construcción/destrucción + penalización XP) ─────────────
export function MidfieldPanel({ construction, destruction, effectiveConstruction, effectiveDestruction, expPenalty, avgExp, onConstruction, onDestruction }: {
  construction: number; destruction: number; effectiveConstruction: number; effectiveDestruction: number;
  expPenalty: number; avgExp: number; onConstruction: (v: number) => void; onDestruction: (v: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <T2Panel title={t('gameplay:tactics.panels.midfield.title')} icon={<Sword size={12} />}>
      <div className="t2-xp">
        <span>{t('gameplay:tactics.panels.midfield.xpPenalty')}</span>
        <b>{t('gameplay:tactics.panels.midfield.xpValue', { penalty: expPenalty, avg: avgExp })}</b>
      </div>
      <div className="t2-lever-grid">
        <div className="t2-lever">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '.8px' }}>
              <Sword size={11} style={{ color: 'var(--blue-info)' }} /> {t('gameplay:tactics.panels.midfield.construction')}
            </span>
            <span className="t2-slider-val" style={{ color: 'var(--blue-info)' }}>{effectiveConstruction} <span style={{ fontWeight: 400, fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('gameplay:tactics.panels.common.base', { value: construction })}</span></span>
          </div>
          <input type="range" min={1} max={100} value={construction}
            onChange={e => onConstruction(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--blue-info)', cursor: 'pointer' }} />
        </div>
        <div className="t2-lever">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4, textTransform: 'uppercase', letterSpacing: '.8px' }}>
              <Shield size={11} style={{ color: 'var(--red-danger)' }} /> {t('gameplay:tactics.panels.midfield.destruction')}
            </span>
            <span className="t2-slider-val" style={{ color: 'var(--red-danger)' }}>{effectiveDestruction} <span style={{ fontWeight: 400, fontSize: '.66rem', color: 'var(--text-muted)' }}>{t('gameplay:tactics.panels.common.base', { value: destruction })}</span></span>
          </div>
          <input type="range" min={1} max={100} value={destruction}
            onChange={e => onDestruction(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--red-danger)', cursor: 'pointer' }} />
        </div>
      </div>
    </T2Panel>
  );
}

// ─── Instrucciones avanzadas (palancas 0-100 + marcaje) ────────────────────────
export function AdvancedPanel({ adv = {}, setAdvKey }: { adv?: any; setAdvKey: (k: string, v: unknown) => void }) {
  const { t } = useTranslation();
  return (
    <T2Panel title={t('gameplay:tactics.panels.advanced.title')} icon={<Zap size={12} />}>
      <div className="t2-lever-grid">
        <div className="t2-lever"><Slider label={t('gameplay:tactics.panels.advanced.pressing')} value={adv.pressing} onChange={(v) => setAdvKey('pressing', v)} leftLabel={t('gameplay:tactics.panels.common.low')} rightLabel={t('gameplay:tactics.panels.common.high')} /></div>
        <div className="t2-lever"><Slider label={t('gameplay:tactics.panels.advanced.tempo')} value={adv.tempo} onChange={(v) => setAdvKey('tempo', v)} leftLabel={t('gameplay:tactics.panels.common.slow')} rightLabel={t('gameplay:tactics.panels.common.fast')} /></div>
        <div className="t2-lever"><Slider label={t('gameplay:tactics.panels.advanced.width')} value={adv.width} onChange={(v) => setAdvKey('width', v)} leftLabel={t('gameplay:tactics.panels.common.narrow')} rightLabel={t('gameplay:tactics.panels.common.wide')} /></div>
        <div className="t2-lever"><Slider label={t('gameplay:tactics.panels.advanced.mentality')} value={adv.mentality} onChange={(v) => setAdvKey('mentality', v)} leftLabel={t('gameplay:tactics.panels.common.defensive')} rightLabel={t('gameplay:tactics.panels.common.offensive')} /></div>
        <div className="t2-marking">
          <span>{t('gameplay:tactics.panels.advanced.marking')}</span>
          <div className="t2-chiprow">
            {(['zonal', 'individual'] as const).map(m => (
              <button key={m} className={cn('t2-chip', adv.marking === m && 'on-blue')}
                onClick={() => setAdvKey('marking', m)}>
                {t(`gameplay:tactics.panels.common.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </T2Panel>
  );
}

// ─── Estilo de juego FDF (piedra-papel-tijera, manual §2.9) ────────────────────
export function StylePanel({ adv = {}, setAdvKey, offensiveStyles, defensiveStyles }: {
  adv?: any; setAdvKey: (k: string, v: unknown) => void;
  offensiveStyles: ReadonlyArray<{ id: string; label: string }>;
  defensiveStyles: ReadonlyArray<{ id: string; label: string }>;
}) {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);
  return (
    <T2Panel title={t('gameplay:tactics.panels.style.title')} right={
      <button type="button" className="t2-help-button" onClick={() => setShowHelp((v: boolean) => !v)}>{t('gameplay:tactics.panels.style.helpToggle')}</button>
    }>
      <p className="t2p-hint">{t('gameplay:tactics.panels.style.hint')}</p>
      
      <div className="t2p-help-panel" style={{ display: showHelp ? 'block' : 'none', fontSize: '.65rem', color: 'var(--text-muted)', marginBottom: 12, padding: '8px', background: 'var(--bg-base)', borderRadius: 6, border: '1px solid var(--border-color)' }}>
        <p style={{ margin: '0 0 6px', color: 'var(--text-primary)', fontWeight: 700 }}>{t('gameplay:tactics.panels.style.helpTitle')}</p>
        <p style={{ margin: '0 0 6px' }}>{t('gameplay:tactics.panels.style.helpIntro')}</p>
        <ul style={{ paddingLeft: 16, margin: '0 0 6px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>{t('gameplay:tactics.panels.style.helpItem1')}</li>
          <li>{t('gameplay:tactics.panels.style.helpItem2')}</li>
          <li>{t('gameplay:tactics.panels.style.helpItem3')}</li>
          <li>{t('gameplay:tactics.panels.style.helpItem4')}</li>
          <li>{t('gameplay:tactics.panels.style.helpItem5')}</li>
        </ul>
      </div>

      <div className="t2-style-block" style={{ marginBottom: 10 }}>
        <p className="t2-style-title" style={{ color: 'var(--blue-info)' }}><Sword size={12} />{t('gameplay:tactics.panels.style.offensive')}</p>
        <div className="t2-style-grid">
          {offensiveStyles.map(s => {
            const selected = adv.offensiveStyle === s.id;
            return (
              <button key={s.id} type="button" aria-pressed={selected} className={cn('t2-style-option off', selected && 'on')}
                onClick={() => setAdvKey('offensiveStyle', selected ? null : s.id)}>
                <span>{t(`gameplay:tactics.panels.styleLabels.${s.id}`, s.label)}</span>
                {selected && <Check size={13} />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="t2-style-block">
        <p className="t2-style-title" style={{ color: 'var(--red-danger)' }}><Shield size={12} />{t('gameplay:tactics.panels.style.defensive')}</p>
        <div className="t2-style-grid">
          {defensiveStyles.map(s => {
            const selected = adv.defensiveStyle === s.id;
            return (
              <button key={s.id} type="button" aria-pressed={selected} className={cn('t2-style-option def', selected && 'on')}
                onClick={() => setAdvKey('defensiveStyle', selected ? null : s.id)}>
                <span>{t(`gameplay:tactics.panels.styleLabels.${s.id}`, s.label)}</span>
                {selected && <Check size={13} />}
              </button>
            );
          })}
        </div>
      </div>
      {(!adv.offensiveStyle || !adv.defensiveStyle) && (
        <p className="t2p-warn">
          ⚠ {!adv.offensiveStyle && !adv.defensiveStyle ? t('gameplay:tactics.panels.style.warnBoth')
            : !adv.offensiveStyle ? t('gameplay:tactics.panels.style.warnOffensive') : t('gameplay:tactics.panels.style.warnDefensive')}
        </p>
      )}
    </T2Panel>
  );
}

// ─── Zonas de ataque + refuerzo defensivo (manual §2.6) ────────────────────────
export function ZonesPanel({ adv = {}, formation, reinforcementPoints, zoneLabels, onAttackZone, onCycleReinforcement }: {
  adv?: any; formation: string; reinforcementPoints: number;
  zoneLabels: Record<string, string>;
  onAttackZone: (zone: string, value: number) => void;
  onCycleReinforcement: (zone: string, totalAllowed: number) => void;
}) {
  const { t } = useTranslation();
  const sum = (['left', 'center', 'right'] as const).reduce((s, z) => s + Number(adv.attackZones?.[z] ?? 0), 0);
  return (
    <T2Panel title={t('gameplay:tactics.panels.zones.title')} right={t('gameplay:tactics.panels.zones.rightPts', { pts: reinforcementPoints })}>
      <p className="t2p-hint">{t('gameplay:tactics.panels.zones.hint', { pts: reinforcementPoints, defs: formation.split('-')[0] })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8 }}>
        {(['left', 'center', 'right'] as const).map(zone => {
          const reinf = Number(adv.defenseReinforcement?.[zone] ?? 0);
          return (
            <div key={zone} className="t2-zone">
              <p className="t2-zone-l">{zoneLabels[zone]}</p>
              <input type="number" min={0} max={100} value={adv.attackZones?.[zone] ?? 33}
                onChange={e => onAttackZone(zone, Number(e.target.value))} />
              <p className="t2-zone-pct">{t('gameplay:tactics.panels.zones.attackPct')}</p>
              <button className={cn(reinf > 0 && 'on')}
                onClick={() => onCycleReinforcement(zone, reinforcementPoints)}>
                🛡 {reinf > 0 ? `+${reinf}` : t('gameplay:tactics.panels.common.dash')}
              </button>
            </div>
          );
        })}
      </div>
      {sum !== 100 && <p className="t2p-warn">{t('gameplay:tactics.panels.zones.warnSum', { sum })}</p>}
    </T2Panel>
  );
}

// ─── Sustituciones programadas (máx 3, manual §2.8) ────────────────────────────
export interface SubRuleView { fromMin: number; toMin: number; condition: string; outId: number | null; inId: number | null }

export function SubsPanel({ subRules, starters, subs, minuteWindows, conditions, onAdd, onUpdate, onRemove }: {
  subRules: SubRuleView[];
  starters: any[]; subs: any[];
  minuteWindows: [number, number][];
  conditions: ReadonlyArray<{ id: string; label: string }>;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<SubRuleView>) => void;
  onRemove: (i: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <T2Panel title={t('gameplay:tactics.panels.subs.title')} right={t('gameplay:tactics.panels.subs.rightCount', { count: subRules.length })}>
      <p className="t2p-hint">{t('gameplay:tactics.panels.subs.hint')}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {subRules.length === 0 && (
          <div className="t2-empty">{t('gameplay:tactics.panels.subs.empty', { defaultValue: 'No hay cambios programados. Añade uno para automatizar el banquillo.' })}</div>
        )}
        {subRules.map((rule, i) => (
          <div key={i} className="t2-sub">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(88px,.7fr) minmax(110px,1fr) auto', alignItems: 'center', gap: 6 }}>
              <select value={`${rule.fromMin}-${rule.toMin}`}
                onChange={e => { const [a, b] = e.target.value.split('-').map(Number); onUpdate(i, { fromMin: a, toMin: b }); }}>
                {minuteWindows.map(([a, b]) => <option key={a} value={`${a}-${b}`}>{t('gameplay:tactics.panels.common.minuteRange', { from: a, to: b })}</option>)}
              </select>
              <select value={rule.condition} onChange={e => onUpdate(i, { condition: e.target.value })}>
                {conditions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <button onClick={() => onRemove(i)}
                style={{ background: 'none', border: 'none', color: 'var(--red-danger)', fontWeight: 700, cursor: 'pointer', fontSize: '.78rem', padding: '0 4px' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', alignItems: 'center', gap: 6 }}>
              <select className="out" value={rule.outId ?? ''}
                onChange={e => onUpdate(i, { outId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('gameplay:tactics.panels.subs.playerOut')}</option>
                {starters.map(p => <option key={p.id} value={p.id}>↓ {p.name}</option>)}
              </select>
              <select className="in" value={rule.inId ?? ''}
                onChange={e => onUpdate(i, { inId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('gameplay:tactics.panels.subs.playerIn')}</option>
                {subs.map(p => <option key={p.id} value={p.id}>↑ {p.name}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
      {subRules.length < 3 && (
        <button className="t2-addbtn" onClick={onAdd}>{t('gameplay:tactics.panels.subs.addBtn')}</button>
      )}
    </T2Panel>
  );
}

// ─── Próximo rival (simulación de prueba) ──────────────────────────────────────
export function RivalPanel() {
  const { t } = useTranslation();
  return (
    <T2Panel title={t('gameplay:tactics.panels.rival.title')} right={t('gameplay:tactics.panels.rival.right')}>
      <p style={{ fontSize: '.84rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>{t('gameplay:tactics.panels.rival.name')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: 'color-mix(in srgb,var(--blue-info) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--blue-info) 20%,transparent)', borderRadius: '8px', padding: '12px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: '.65rem', color: 'var(--blue-info)', fontWeight: 700, margin: '0 0 4px', letterSpacing: '.8px' }}>{t('gameplay:tactics.panels.rival.rivalConstr')}</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'var(--font-sans)', color: 'var(--blue-info)', margin: 0 }}>50</p>
        </div>
        <div style={{ background: 'color-mix(in srgb,var(--red-danger) 10%,transparent)', border: '1px solid color-mix(in srgb,var(--red-danger) 20%,transparent)', borderRadius: '8px', padding: '12px 8px', textAlign: 'center' }}>
          <p style={{ fontSize: '.65rem', color: 'var(--red-danger)', fontWeight: 700, margin: '0 0 4px', letterSpacing: '.8px' }}>{t('gameplay:tactics.panels.rival.rivalDestr')}</p>
          <p style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'var(--font-sans)', color: 'var(--red-danger)', margin: 0 }}>50</p>
        </div>
      </div>
    </T2Panel>
  );
}
