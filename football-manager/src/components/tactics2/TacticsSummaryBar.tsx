// ─── E17 LOTE B · Resumen vivo de la táctica + estado de guardado ──────────────
// Presentación pura: chips siempre visibles con la configuración actual y un
// indicador ●guardando / ✓guardado alimentado desde la página (no toca lógica).
import { Save, Check, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SB_CSS = `
.t2sb{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 12px;
  background:linear-gradient(110deg,color-mix(in srgb,var(--green-primary) 4%,var(--bg-surface)),var(--bg-surface));border:1px solid var(--border-color);
  border-radius:13px;box-shadow:var(--shadow-soft)}
.t2sb-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);
  font-size:.7rem;padding:6px 9px;border-radius:7px;background:var(--bg-elevated);
  border:1px solid color-mix(in srgb,var(--border-color) 88%,transparent);color:var(--text-primary);white-space:nowrap;font-weight:650}
.t2sb-chip b{color:var(--green-primary);font-weight:700}
.t2sb-chip .lbl{color:var(--text-muted);text-transform:uppercase;letter-spacing:.055em;font-size:.56rem;font-weight:800}
.t2sb-save{margin-left:auto;display:inline-flex;align-items:center;gap:5px;
  padding:6px 8px;font-family:var(--font-sans);font-weight:800;font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap}
.t2sb-save.saving{color:var(--gold-accent)}
.t2sb-save.saved{color:var(--green-primary)}
.t2sb-save.error{color:var(--red-danger)}
.t2sb-save .pulse{width:7px;height:7px;border-radius:50%;background:currentColor}
@media (prefers-reduced-motion: no-preference){
  .t2sb-save.saving .pulse{animation:t2sb-blink 1s ease-in-out infinite}
  @keyframes t2sb-blink{0%,100%{opacity:1}50%{opacity:.25}}
}
@media(max-width:700px){.t2sb{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.t2sb::-webkit-scrollbar{display:none}.t2sb-save{position:sticky;right:0;background:var(--bg-surface)}}
`;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  formation: string;
  offensiveStyle?: string | null;
  defensiveStyle?: string | null;
  pressing: number;
  tempo: number;
  mentality: number;
  marking: string;
  construction: number;
  destruction: number;
  saveState: SaveState;
}

function lvl(v: number, t: (key: string) => string): string {
  return v >= 67 ? t('gameplay:tactics.panels.summaryBar.levelHigh') : v >= 34 ? t('gameplay:tactics.panels.summaryBar.levelMid') : t('gameplay:tactics.panels.summaryBar.levelLow');
}

const STYLE_LABELS: Record<string, string> = {
  abrir_campo: 'abrir_campo', pases_cortos: 'pases_cortos', buscar_espalda: 'buscar_espalda',
  moverse_entre_lineas: 'moverse_entre_lineas', pases_largos: 'pases_largos',
  presion_bandas: 'presion_bandas', presion_centro: 'presion_centro', fuera_de_juego: 'fuera_de_juego',
  defensa_adelantada: 'defensa_adelantada', presion_mediocentro: 'presion_mediocentro',
};

export function TacticsSummaryBar({
  formation, offensiveStyle, defensiveStyle, pressing, tempo, mentality, marking,
  construction, destruction, saveState,
}: Props) {
  const { t } = useTranslation();
  const styleLabel = (id?: string | null) => id
    ? (STYLE_LABELS[id] ? t(`gameplay:tactics.panels.styleLabels.${STYLE_LABELS[id]}`) : id)
    : t('gameplay:tactics.panels.common.dash');
  return (
    <div className="t2sb">
      <style>{SB_CSS}</style>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.formation')}</span> <b>{formation}</b></span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.constr')}</span> <b>{construction}</b></span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.destr')}</span> <b>{destruction}</b></span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.pressing')}</span> {lvl(pressing, t)}</span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.tempo')}</span> {lvl(tempo, t)}</span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.ment')}</span> {mentality >= 67 ? t('gameplay:tactics.panels.summaryBar.mentOffensive') : mentality >= 34 ? t('gameplay:tactics.panels.summaryBar.mentBalanced') : t('gameplay:tactics.panels.summaryBar.mentDefensive')}</span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.marking')}</span> {t(`gameplay:tactics.panels.common.${marking === 'individual' ? 'individual' : 'zonal'}`)}</span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.off')}</span> {styleLabel(offensiveStyle)}</span>
      <span className="t2sb-chip"><span className="lbl">{t('gameplay:tactics.panels.summaryBar.def')}</span> {styleLabel(defensiveStyle)}</span>
      {saveState === 'saving' && <span className="t2sb-save saving"><span className="pulse" /> {t('gameplay:tactics.panels.summaryBar.saving')}</span>}
      {saveState === 'saved' && <span className="t2sb-save saved"><Check size={12} /> {t('gameplay:tactics.panels.summaryBar.saved')}</span>}
      {saveState === 'error' && <span className="t2sb-save error"><AlertTriangle size={12} /> {t('gameplay:tactics.panels.summaryBar.saveError')}</span>}
      {saveState === 'idle' && <span className="t2sb-save" style={{ color: 'var(--text-muted)' }}><Save size={12} /> {t('gameplay:tactics.panels.summaryBar.autosave')}</span>}
    </div>
  );
}
