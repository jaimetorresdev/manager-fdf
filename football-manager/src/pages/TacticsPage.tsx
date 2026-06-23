// ─── Táctica · identidad v2 (E17 LOTE B) ───────────────────────────────────────
// Rediseño de LAYOUT y presentación: la pizarra es la protagonista, los paneles
// de instrucciones se agrupan por tema en una columna lateral con Tabs y hay un
// resumen vivo de la táctica + estado de guardado siempre visibles.
// LÓGICA INTACTA: drag&drop con umbral clic-vs-drag de 5px (abre PlayerDossier),
// autosave con debounce 700ms a PUT /api/tactics/:id, caché localStorage
// `fdf_tactic_adv`, hidratación con flag advHydrated, normalización de zonas a
// 100%, refuerzo defensivo limitado por formación, sustituciones programadas
// (máx 3) y tope de 8 jugadas entrenadas (TrainedPlaysPanel).
import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ClipboardList, LayoutGrid, SlidersHorizontal, Sparkles, Star, UsersRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { getExperiencePenalty, getPositionCategory } from '../lib/gameUtils';
import { playersApi, tacticsApi, marketApi } from '../api/client';
import { Modal, Button, EmptyState } from '../components/ui';
import { PlayerDossier, type DossierPlayer } from '../components/player/PlayerDossier';
import { OfferPanel } from '../components/market/OfferPanel';

import { cn } from '../lib/cn';
import { asArray } from '../lib/normalize';
import { TrainedPlaysPanel } from '../components/tactics/TrainedPlaysPanel';
import { TacticsSummaryBar, type SaveState } from '../components/tactics2/TacticsSummaryBar';
import { SquadListPanel } from '../components/tactics2/SquadListPanel';
import {
  MidfieldPanel, AdvancedPanel, StylePanel, ZonesPanel, SubsPanel,
} from '../components/tactics2/TacticsPanels';
import { FormationInsightPanel, type PositionalAlert } from '../components/tactics2/FormationInsightPanel';
import { MatchPlanPanel, AppliedTacticalChangesPanel, type TacticalRuleView } from '../components/tactics2/MatchPlanPanel';
import { Pitch2D } from '../components/tactics/Pitch2D';
import { SportingWorkspaceHeader } from '../components/sporting/SportingWorkspaceHeader';

// ─── Estilos de juego FDF (manual §2.9) — el motor ya los entiende ────────────
const OFFENSIVE_STYLES = [
  { id: 'abrir_campo', label: 'Abrir el campo' },
  { id: 'pases_cortos', label: 'Pases cortos' },
  { id: 'buscar_espalda', label: 'Buscar la espalda' },
  { id: 'moverse_entre_lineas', label: 'Entre líneas' },
  { id: 'pases_largos', label: 'Pases largos' },
] as const;
const DEFENSIVE_STYLES = [
  { id: 'presion_bandas', label: 'Presión en bandas' },
  { id: 'presion_centro', label: 'Presión en centro' },
  { id: 'fuera_de_juego', label: 'Fuera de juego' },
  { id: 'defensa_adelantada', label: 'Defensa adelantada' },
  { id: 'presion_mediocentro', label: 'Presión mediocentro' },
] as const;

const ZONE_LABELS: Record<string, string> = { left: 'Izquierda', center: 'Centro', right: 'Derecha' };

/** Puntos de refuerzo defensivo según nº de defensas del dibujo (manual §2.6). */
function reinforcementPoints(formation: string): number {
  const defs = parseInt(formation.split('-')[0] ?? '4', 10);
  return defs >= 5 ? 3 : defs === 4 ? 2 : 1;
}

// ─── Sustituciones programadas (manual §2.8): minuto + condición de marcador ──
interface SubRule { fromMin: number; toMin: number; condition: string; outId: number | null; inId: number | null }
const SUB_CONDITIONS = [
  { id: 'any', label: 'Siempre' },
  { id: 'winning', label: 'Ganando' },
  { id: 'drawing', label: 'Empatando' },
  { id: 'losing', label: 'Perdiendo' },
] as const;
const MINUTE_WINDOWS: [number, number][] = [[30, 37], [45, 52], [60, 67], [75, 82], [82, 90]];

const formationLayouts: Record<string, [number, number][]> = {
  '4-4-2': [[50, 85], [15, 68],[38, 68],[62, 68],[85, 68], [15, 48],[38, 48],[62, 48],[85, 48], [35, 22],[65, 22]],
  '4-3-3': [[50, 85], [15, 68],[38, 68],[62, 68],[85, 68], [25, 48],[50, 48],[75, 48], [20, 22],[50, 18],[80, 22]],
  '4-2-3-1': [[50, 85], [15, 70],[38, 70],[62, 70],[85, 70], [32, 55],[68, 55], [15, 38],[50, 35],[85, 38], [50, 18]],
  '3-5-2': [[50, 85], [25, 68],[50, 70],[75, 68], [10, 50],[30, 48],[50, 45],[70, 48],[90, 50], [35, 22],[65, 22]],
  '3-2-3-2': [[50, 85], [25, 70],[50, 72],[75, 70], [30, 55],[70, 55], [20, 38],[50, 35],[80, 38], [35, 20],[65, 20]],
  '5-3-2': [[50, 85], [10, 68],[28, 68],[50, 70],[72, 68],[90, 68], [25, 48],[50, 45],[75, 48], [35, 22],[65, 22]],
  '5-4-1': [[50, 85], [10, 68],[28, 68],[50, 70],[72, 68],[90, 68], [15, 48],[38, 48],[62, 48],[85, 48], [50, 20]],
  '4-5-1': [[50, 85], [15, 68],[38, 68],[62, 68],[85, 68], [10, 48],[28, 48],[50, 45],[72, 48],[90, 48], [50, 20]],
  '4-1-4-1': [[50, 85], [15, 70],[38, 70],[62, 70],[85, 70], [50, 58], [15, 42],[38, 42],[62, 42],[85, 42], [50, 20]],
  '4-3-2-1': [[50, 85], [15, 70],[38, 70],[62, 70],[85, 70], [25, 52],[50, 52],[75, 52], [32, 35],[68, 35], [50, 18]],
  '4-4-1-1': [[50, 85], [15, 68],[38, 68],[62, 68],[85, 68], [15, 48],[38, 48],[62, 48],[85, 48], [50, 35], [50, 18]],
  '3-4-3': [[50, 85], [25, 68],[50, 70],[75, 68], [15, 48],[38, 48],[62, 48],[85, 48], [20, 22],[50, 18],[80, 22]],
  '3-4-2-1': [[50, 85], [25, 70],[50, 72],[75, 70], [15, 52],[38, 52],[62, 52],[85, 52], [32, 35],[68, 35], [50, 18]],
  '3-4-1-2': [[50, 85], [25, 70],[50, 72],[75, 70], [15, 52],[38, 52],[62, 52],[85, 52], [50, 35], [35, 18],[65, 18]],
  '4-2-4': [[50, 85], [15, 68],[38, 68],[62, 68],[85, 68], [35, 48],[65, 48], [15, 22],[38, 18],[62, 18],[85, 22]],
  '4-1-3-2': [[50, 85], [15, 70],[38, 70],[62, 70],[85, 70], [50, 58], [20, 42],[50, 40],[80, 42], [35, 20],[65, 20]],
  '4-1-2-1-2': [[50, 85], [15, 70],[38, 70],[62, 70],[85, 70], [50, 58], [35, 45],[65, 45], [50, 32], [35, 18],[65, 18]],
  '3-2-4-1': [[50, 85], [25, 70],[50, 72],[75, 70], [35, 55],[65, 55], [15, 38],[38, 35],[62, 35],[85, 38], [50, 18]],
  '3-2-5': [[50, 85], [25, 70],[50, 72],[75, 70], [35, 55],[65, 55], [10, 35],[30, 32],[50, 30],[70, 32],[90, 35]],
  '2-3-2-3': [[50, 85], [30, 70],[70, 70], [20, 52],[50, 50],[80, 52], [35, 35],[65, 35], [20, 20],[50, 18],[80, 20]],
};

/** Normaliza claves del catálogo (p. ej. wm-3-2-5 → 3-2-5) para el dibujo. */
function resolveFormationShape(formation: string): string {
  if (formationLayouts[formation]) return formation;
  const segs = formation.split('-');
  if (segs.length > 3 && (segs[0] === 'wm' || segs[0] === 'metodo')) {
    const shape = segs.slice(1).join('-');
    return formationLayouts[shape] ? shape : shape;
  }
  return formation;
}

/** Genera posiciones por líneas cuando no hay dibujo predefinido (H-37). */
function generateFormationLayout(formation: string): [number, number][] {
  const segs = formation.split('-').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
  if (segs.length === 0) return formationLayouts['4-4-2'];
  const positions: [number, number][] = [[50, 85]];
  const lineCount = segs.length;
  const yStart = 70;
  const yEnd = 18;
  segs.forEach((count, lineIdx) => {
    const y = lineCount === 1 ? 45 : Math.round(yStart - (lineIdx * (yStart - yEnd)) / Math.max(1, lineCount - 1));
    for (let i = 0; i < count; i++) {
      const x = count === 1 ? 50 : Math.round(15 + (i * 70) / Math.max(1, count - 1));
      positions.push([x, y]);
    }
  });
  return positions;
}

function formationLayoutFor(formation: string): [number, number][] {
  const shape = resolveFormationShape(formation);
  return formationLayouts[formation] ?? formationLayouts[shape] ?? generateFormationLayout(shape);
}

/** Demarcación de cada slot del dibujo: slot 0 = POR, primer segmento = DEF,
 *  último = DEL y los intermedios = MED (vale para dibujos de 3 y 4 líneas). */
function slotRoles(formation: string): ('POR' | 'DEF' | 'MED' | 'DEL')[] {
  const segs = formation.split('-').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n) && n > 0);
  const roles: ('POR' | 'DEF' | 'MED' | 'DEL')[] = ['POR'];
  segs.forEach((count, i) => {
    const role = i === 0 ? 'DEF' : i === segs.length - 1 ? 'DEL' : 'MED';
    for (let k = 0; k < count; k++) roles.push(role);
  });
  return roles;
}



/** F2: asigna cada slot del dibujo a un titular de SU demarcación REAL y lateralidad.
 *  Soporta caché en localStorage para persistir drag&drop manual. */
function buildPositions(formation: string, starterList: any[], tacticId?: number | null): Record<number, { x: number; y: number }> {
  if (tacticId && typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(`fdf_custom_positions_${tacticId}_${formation}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        const result: Record<number, { x: number; y: number }> = {};
        let allAssigned = true;
        starterList.forEach(p => {
          if (parsed[p.id]) result[p.id] = parsed[p.id];
          else allAssigned = false;
        });
        if (allAssigned) return result;
      }
    } catch { /* posiciones guardadas inválidas → se recalculan abajo */ }
  }

  const layout = formationLayoutFor(formation);
  const roles = slotRoles(formation);
  const result: Record<number, { x: number; y: number }> = {};
  const assigned = new Set<number>();

  const unassignedSlots = layout.map((slot, i) => ({ index: i, role: roles[i] ?? 'MED', x: slot[0], y: slot[1] }));
  const getSide = (pos: string) => {
    if (['LI', 'MI', 'EXT IZQ'].includes(pos)) return 'L';
    if (['LD', 'MD', 'EXT DERECHA'].includes(pos)) return 'R';
    return 'C';
  };

  ['POR', 'DEF', 'MED', 'DEL'].forEach(role => {
    const roleSlots = unassignedSlots.filter(s => s.role === role).sort((a, b) => a.x - b.x);
    if (roleSlots.length === 0) return;
    
    const rolePlayers = starterList.filter(p => !assigned.has(p.id) && getPositionCategory(p.position) === role)
                                   .sort((a, b) => getPlayerAverage(b) - getPlayerAverage(a));
    
    const lefts = rolePlayers.filter(p => getSide(p.position) === 'L');
    const rights = rolePlayers.filter(p => getSide(p.position) === 'R');
    const centers = rolePlayers.filter(p => getSide(p.position) === 'C');

    if (roleSlots.length > 1 && lefts.length > 0) {
      const p = lefts.shift()!;
      result[p.id] = { x: roleSlots[0].x, y: roleSlots[0].y };
      assigned.add(p.id);
      roleSlots.shift();
    }
    if (roleSlots.length > 0 && rights.length > 0) {
      const p = rights.shift()!;
      const lastIdx = roleSlots.length - 1;
      result[p.id] = { x: roleSlots[lastIdx].x, y: roleSlots[lastIdx].y };
      assigned.add(p.id);
      roleSlots.splice(lastIdx, 1);
    }
    
    const remainingPlayers = [...centers, ...lefts, ...rights];
    roleSlots.forEach(slot => {
      if (remainingPlayers.length > 0) {
        const p = remainingPlayers.shift()!;
        result[p.id] = { x: slot.x, y: slot.y };
        assigned.add(p.id);
      }
    });
  });

  const remainingSlots = unassignedSlots.filter(s => !Object.values(result).some(pos => pos.x === s.x && pos.y === s.y));
  remainingSlots.forEach(slot => {
    const p = starterList.find(pl => !assigned.has(pl.id));
    if (p) {
      result[p.id] = { x: slot.x, y: slot.y };
      assigned.add(p.id);
    }
  });

  starterList.forEach(p => {
    if (!assigned.has(p.id)) result[p.id] = { x: 50, y: 50 };
  });

  return result;
}

// (Moved Pitch2D to src/components/tactics/Pitch2D.tsx)

// CSS de layout v2 de la página (solo presentación)
const TAC_CSS = `
.tactics-page{width:min(1740px,calc(100vw - 40px));margin-inline:50%;transform:translateX(-50%)}
.tac-head{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:13px;background:linear-gradient(120deg,color-mix(in srgb,var(--green-primary) 5%,var(--bg-surface)),var(--bg-surface));box-shadow:var(--shadow-soft)}
.tac-sim{display:inline-flex;align-items:center;gap:8px;padding:12px 20px;border:none;cursor:pointer;
  border-radius:8px;font-family:var(--font-display);font-weight:700;font-size:.9rem;
  text-transform:uppercase;letter-spacing:.8px;background:var(--green-primary);color: var(--text-primary);
  box-shadow:0 4px 12px color-mix(in srgb,var(--green-primary) 30%,transparent);transition:all 150ms ease}
.tac-sim:hover{filter:brightness(.95)}
.tac-sim:disabled{background:var(--bg-elevated);color:var(--text-muted);box-shadow:none;cursor:not-allowed}
.tac-tabsrow{min-width:0;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.tac-tab{padding:8px 13px;border-radius:8px;font-family:var(--font-sans);font-weight:700;font-size:.72rem;
  cursor:pointer;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-muted);
  transition:all 150ms ease;white-space:nowrap;display:inline-flex;align-items:center;gap:6px}
.tac-tab:hover{color:var(--text-primary);transform:translateY(-1px)}
.tac-tab.on{background:linear-gradient(180deg,color-mix(in srgb,var(--green-primary) 18%,var(--bg-elevated)),color-mix(in srgb,var(--green-primary) 7%,var(--bg-elevated)));color:var(--green-primary);
  border-color:color-mix(in srgb,var(--green-primary) 42%,var(--border-color));box-shadow:0 8px 18px -14px var(--green-primary)}
.tac-tab.new{color:var(--blue-info);border-color:color-mix(in srgb,var(--blue-info) 30%,transparent);border-style:dashed}
.tac-tab.new:hover{background:color-mix(in srgb,var(--blue-info) 10%,transparent)}
.tac-tab.gold{color:var(--gold-accent);border-color:color-mix(in srgb,var(--gold-accent) 30%,transparent)}
.tac-tab.gold:hover{background:color-mix(in srgb,var(--gold-accent) 12%,transparent)}
.tac-hero-action{padding:8px 11px;border:1px solid color-mix(in srgb,var(--green-primary) 42%,var(--border-color));border-radius:8px;color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 9%,var(--bg-elevated));cursor:pointer;font-size:.64rem;font-weight:850;white-space:nowrap}.tac-hero-action:hover{filter:brightness(1.12)}.tac-hero-action:disabled{opacity:.55;cursor:wait}
.tac-grid{display:grid;grid-template-columns:minmax(280px,1fr) minmax(560px,1.45fr) minmax(340px,1fr);grid-template-areas:"roster board controls";gap:18px;align-items:start}
.tac-roster{grid-area:roster;min-width:0;display:flex;flex-direction:column;gap:14px;align-items:stretch}
.tac-roster>.tac-lineup-guide{width:100%}
.tac-board{grid-area:board;display:flex;flex-direction:column;gap:10px}
.tac-side{grid-area:controls;min-width:0;display:flex;flex-direction:column;gap:12px}
.tac-lineup-guide{padding:12px 13px;display:flex;align-items:flex-start;gap:10px;border:1px solid color-mix(in srgb,var(--blue-info) 26%,var(--border-color));border-radius:11px;background:linear-gradient(120deg,color-mix(in srgb,var(--blue-info) 9%,var(--bg-surface)),var(--bg-surface));color:var(--text-muted)}
.tac-lineup-guide>svg{flex:0 0 auto;color:var(--blue-info)}.tac-lineup-guide div{min-width:0;display:flex;flex-direction:column;gap:3px}.tac-lineup-guide strong{color:var(--text-primary);font-size:.72rem}.tac-lineup-guide span{font-size:.62rem;line-height:1.4}.tac-lineup-guide b{color:var(--gold-accent)}
.tac-boardhead{padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border-color);border-radius:11px;background:linear-gradient(120deg,var(--bg-surface),color-mix(in srgb,var(--green-primary) 5%,var(--bg-elevated)))}
.tac-boardhead>span{display:flex;align-items:center;gap:7px;color:var(--text-primary);font-family:var(--font-display);font-size:.8rem;font-weight:850;text-transform:uppercase}.tac-boardhead small{color:var(--text-muted);font-size:.6rem}.tac-boardhead b{padding:5px 8px;border:1px solid color-mix(in srgb,var(--green-primary) 38%,var(--border-color));border-radius:7px;color:var(--green-primary);background:color-mix(in srgb,var(--green-primary) 9%,var(--bg-elevated));font-family:var(--font-scoreboard);font-size:.76rem}
.tac-board-status{display:flex;align-items:center;gap:6px}.tac-board-status em{padding:5px 8px;border:1px solid color-mix(in srgb,var(--blue-info) 30%,var(--border-color));border-radius:7px;color:var(--text-primary);background:var(--bg-elevated);font-family:var(--font-scoreboard);font-size:.7rem;font-style:normal}.tac-board-status em.ok{color:var(--green-primary);border-color:color-mix(in srgb,var(--green-primary) 38%,var(--border-color))}
.tac-pitchwrap{background:linear-gradient(145deg, color-mix(in srgb,var(--green-primary) 8%,var(--bg-surface)) 0%, var(--bg-surface) 40%, color-mix(in srgb,var(--blue-info) 4%,var(--bg-elevated)) 100%);border:1px solid color-mix(in srgb,var(--green-primary) 30%,var(--border-color));
  border-radius:16px;padding:16px;box-shadow:0 24px 58px -40px rgba(0,0,0,.9),inset 0 1px color-mix(in srgb,white 5%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  position:relative;overflow:hidden}
.tac-pitchwrap::before{content:'';position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(ellipse at 50% 0%, color-mix(in srgb,var(--green-primary) 12%,transparent), transparent 60%);opacity:.8}
.tac-form-picker{padding:10px 12px;display:flex;align-items:center;gap:12px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-surface)}
.tac-form-picker label{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:.62rem;font-weight:800;letter-spacing:.07em;text-transform:uppercase}.tac-form-picker label svg{color:var(--green-primary)}
.tac-form-picker select{min-width:0;flex:1;padding:8px 34px 8px 11px;border:1px solid color-mix(in srgb,var(--green-primary) 32%,var(--border-color));border-radius:8px;color:var(--text-primary);background:var(--bg-elevated);font-family:var(--font-display);font-size:.76rem;font-weight:800;cursor:pointer}
.tac-reset{width:100%;margin-top:8px;padding:8px 0;border-radius:8px;font-size:.8rem;font-weight:600;
  background:none;border:none;cursor:pointer;color:var(--text-muted);transition:all 150ms ease}
.tac-reset:hover{color:var(--text-primary);background:var(--bg-elevated)}
.tac-modebar{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.tac-mode{--mode-accent:var(--green-primary);min-width:0;padding:10px 11px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:9px;border:1px solid var(--border-color);border-radius:11px;color:var(--text-muted);background:linear-gradient(145deg,var(--bg-surface),var(--bg-elevated));cursor:pointer;text-align:left;transition:all 160ms ease}
.tac-mode:hover{color:var(--text-primary);border-color:color-mix(in srgb,var(--mode-accent) 30%,var(--border-color));transform:translateY(-1px)}
.tac-mode.on{color:var(--mode-accent);border-color:color-mix(in srgb,var(--mode-accent) 46%,var(--border-color));background:linear-gradient(135deg,color-mix(in srgb,var(--mode-accent) 13%,var(--bg-elevated)),var(--bg-surface));box-shadow:0 12px 28px -23px var(--mode-accent)}
.tac-mode__icon{width:34px;height:34px;display:grid;place-items:center;border:1px solid color-mix(in srgb,var(--mode-accent) 30%,var(--border-color));border-radius:9px;color:var(--mode-accent);background:color-mix(in srgb,var(--mode-accent) 8%,var(--bg-base))}
.tac-mode__copy{min-width:0;display:flex;flex-direction:column;gap:3px}.tac-mode__copy strong{font-family:var(--font-display);font-size:.69rem;letter-spacing:.06em;text-transform:uppercase}.tac-mode__copy small{overflow:hidden;color:var(--text-muted);font-size:.58rem;text-overflow:ellipsis;white-space:nowrap}
.tac-mode__badge{min-width:26px;padding:4px 6px;border:1px solid color-mix(in srgb,var(--mode-accent) 28%,var(--border-color));border-radius:7px;color:var(--mode-accent);background:color-mix(in srgb,var(--mode-accent) 7%,var(--bg-base));font-family:var(--font-scoreboard);font-size:.66rem;text-align:center}
.tac-side-nav{display:flex;flex-direction:column;gap:12px}
.tac-mode-intro{--mode-accent:var(--green-primary);padding:12px 13px;display:flex;align-items:flex-start;gap:10px;border:1px solid color-mix(in srgb,var(--mode-accent) 30%,var(--border-color));border-radius:12px;background:linear-gradient(120deg,color-mix(in srgb,var(--mode-accent) 9%,var(--bg-surface)),var(--bg-surface))}
.tac-mode-intro>span{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border:1px solid color-mix(in srgb,var(--mode-accent) 38%,var(--border-color));border-radius:9px;color:var(--mode-accent);background:color-mix(in srgb,var(--mode-accent) 9%,var(--bg-base))}
.tac-mode-intro div{min-width:0;display:flex;flex-direction:column;gap:3px}.tac-mode-intro strong{font-family:var(--font-display);font-size:.75rem;text-transform:uppercase}.tac-mode-intro small{color:var(--text-muted);font-size:.64rem;line-height:1.4}
.tac-sidebody{display:flex;flex-direction:column;gap:12px}
@media(max-width:1240px){.tac-grid{grid-template-columns:minmax(480px,1.25fr) minmax(340px,1fr);grid-template-areas:"board controls" "roster roster"}.tac-roster{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.tac-roster>.tac-lineup-guide{grid-column:1/-1;width:auto}}
@media(max-width:900px){.tac-grid{grid-template-columns:1fr;grid-template-areas:"controls" "board" "roster"}.tac-roster{display:flex;flex-direction:column}.tac-roster>.tac-lineup-guide{width:100%}.tac-modebar{grid-template-columns:repeat(3,minmax(0,1fr))}.tac-mode{grid-template-columns:28px minmax(0,1fr);padding:8px}.tac-mode__icon{width:28px;height:28px}.tac-mode__copy small,.tac-mode__badge{display:none}.tac-mode__copy strong{font-size:.61rem}}
@media(max-width:820px){.tactics-page{width:calc(100vw - 24px)}.tac-sidebody{display:flex}}
`;

type SideTab = 'ajustes' | 'estilo' | 'partido';

export function TacticsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [tacticsList, setTacticsList] = useState<any[]>([]);
  const [activeTacticIndex, setActiveTacticIndex] = useState(0);
  const [formationsData, setFormationsData] = useState<any[]>([]);
  const [playersList, setPlayersList] = useState<any[]>([]);
  const [serverPositionalAlerts, setServerPositionalAlerts] = useState<PositionalAlert[]>([]);
  const [tacticId, setTacticId] = useState<number | null>(null);
  const [activeFormation, setActiveFormation] = useState('4-4-2');
  const [construction, setConstruction] = useState(50);
  const [destruction, setDestruction] = useState(50);
  // Palancas avanzadas (el motor ya las entiende). El backend persiste TODO en
  // Tactic vía PUT /api/tactics/:id: pressing/tempo/width/mentality/marking +
  // offensiveStyle/defensiveStyle + attackZones/defenseReinforcement/subsLogic,
  // y el server propaga la táctica default a los partidos del tick (R3, Claude
  // 5 jun: zod acepta mentality 0-100 numérico sin degradar; el autosave de abajo
  // las envía todas). localStorage queda como caché/fallback offline.
  const ADV_DEFAULTS = {
    pressing: 50, tempo: 50, width: 50, mentality: 50, marking: 'zonal',
    offensiveStyle: null as string | null, defensiveStyle: null as string | null,
    attackZones: { left: 33, center: 34, right: 33 },
    defenseReinforcement: { left: 0, center: 0, right: 0 },
  };
  const [adv, setAdv] = useState(() => {
    try { return { ...ADV_DEFAULTS, ...JSON.parse(localStorage.getItem('fdf_tactic_adv') || '{}') }; }
    catch { return { ...ADV_DEFAULTS }; }
  });
  const setAdvKey = (k: string, v: unknown) =>
    setAdv((a: any) => { const n = { ...a, [k]: v }; try { localStorage.setItem('fdf_tactic_adv', JSON.stringify(n)); } catch { /* */ } return n; });

  /** JSON.parse defensivo para los campos JSON-string de Tactic. */
  const parseJson = (raw: unknown): any => {
    if (typeof raw !== 'string' || !raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  /** Hidrata `adv` desde una táctica persistida del backend (pisa el localStorage). */
  const hydrateAdvFromTactic = (t: any) => {
    if (!t) return;
    setAdv((a: any) => {
      const n = { ...a };
      // R3: hidratar también las palancas numéricas + marking. mentality puede venir
      // como "65" (numérico serializado) o legacy 'defensive/balanced/attacking'.
      if (typeof t.pressing === 'number') n.pressing = t.pressing;
      if (typeof t.tempo === 'number') n.tempo = t.tempo;
      if (typeof t.width === 'number') n.width = t.width;
      if (t.mentality != null) {
        const m = Number(t.mentality);
        n.mentality = Number.isFinite(m) ? m
          : t.mentality === 'attacking' ? 75
          : t.mentality === 'defensive' ? 25 : 50;
      }
      if (typeof t.marking === 'string' && t.marking) n.marking = t.marking;
      if (typeof t.offensiveStyle === 'string' && t.offensiveStyle) n.offensiveStyle = t.offensiveStyle;
      if (typeof t.defensiveStyle === 'string' && t.defensiveStyle) n.defensiveStyle = t.defensiveStyle;
      const az = parseJson(t.attackZones);
      if (az && typeof az === 'object') n.attackZones = { ...ADV_DEFAULTS.attackZones, ...az };
      const dr = parseJson(t.defenseReinforcement);
      if (dr && typeof dr === 'object') n.defenseReinforcement = { ...ADV_DEFAULTS.defenseReinforcement, ...dr };
      const sl = parseJson(t.subsLogic);
      if (Array.isArray(sl)) {
        // X5: separar sustituciones R4 (outId/inId) de las reglas tácticas
        // condicionales (changes|tactic|set), que comparten el mismo array.
        const isTactical = (r: any) => r && (r.changes || r.tactic || r.set);
        n.subs = sl.filter((r: any) => r && !isTactical(r));
        n.tacticalRules = sl.filter(isTactical).map((r: any) => ({
          fromMin: typeof r.fromMin === 'number' ? r.fromMin : 60,
          toMin: typeof r.toMin === 'number' ? r.toMin : undefined,
          condition: typeof r.condition === 'string' ? r.condition : 'any',
          changes: r.changes && typeof r.changes === 'object' ? r.changes : {},
        }));
      }
      try { localStorage.setItem('fdf_tactic_adv', JSON.stringify(n)); } catch { /* */ }
      return n;
    });
  };

  // Estado visible del autosave (solo presentación: ●guardando / ✓guardado).
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const savedResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistencia en servidor (debounced) de las palancas que la API ya acepta.
  const advSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advHydrated = useRef(false);
  useEffect(() => {
    if (!tacticId) return;
    if (!advHydrated.current) { advHydrated.current = true; return; } // no re-guardar lo recién hidratado
    if (advSaveTimer.current) clearTimeout(advSaveTimer.current);
    setSaveState('saving');
    advSaveTimer.current = setTimeout(() => {
      const az = adv.attackZones ?? ADV_DEFAULTS.attackZones;
      if (Number(az.left) + Number(az.center) + Number(az.right) !== 100) {
        setSaveState('error');
        return;
      }
      tacticsApi.update(tacticId, {
        // R3 (Claude, 5 jun): se envían TODAS las palancas, no solo estilos/zonas.
        pressing: adv.pressing ?? 50,
        tempo: adv.tempo ?? 50,
        width: adv.width ?? 50,
        mentality: adv.mentality ?? 50,
        marking: adv.marking ?? 'zonal',
        offensiveStyle: adv.offensiveStyle ?? '',
        defensiveStyle: adv.defensiveStyle ?? '',
        attackZones: JSON.stringify(adv.attackZones ?? ADV_DEFAULTS.attackZones),
        defenseReinforcement: JSON.stringify(adv.defenseReinforcement ?? ADV_DEFAULTS.defenseReinforcement),
        // X5: `subsLogic[]` lleva las sustituciones R4 (outId/inId) Y las reglas
        // tácticas condicionales (changes) en el mismo array. Se descartan las
        // reglas sin palancas seleccionadas para no enviar ajustes vacíos.
        subsLogic: JSON.stringify([
          ...(adv.subs ?? []),
          ...(adv.tacticalRules ?? []).filter(
            (r: TacticalRuleView) => r && r.changes && Object.keys(r.changes).length > 0,
          ),
        ]),
      }).then(() => {
        setSaveState('saved');
        if (savedResetTimer.current) clearTimeout(savedResetTimer.current);
        savedResetTimer.current = setTimeout(() => setSaveState('idle'), 2500);
      }).catch((e) => {
        console.error(e);
        setSaveState('error');
        toast.error(t('gameplay:tactics.saveError'));
      });
    }, 700);
    return () => { if (advSaveTimer.current) clearTimeout(advSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adv, tacticId]);

  /** % de ataque por carril: ajusta uno y reparte el resto proporcionalmente (suma 100). */
  const setAttackZone = (zone: string, value: number) => {
    const z = { ...adv.attackZones, [zone]: Math.max(0, Math.min(100, value)) };
    const others = Object.keys(z).filter(k => k !== zone);
    const rest = 100 - z[zone as keyof typeof z];
    const otherSum = others.reduce((s, k) => s + (z as any)[k], 0) || 1;
    others.forEach((k, i) => {
      (z as any)[k] = i === others.length - 1
        ? rest - others.slice(0, -1).reduce((s, kk) => s + (z as any)[kk], 0)
        : Math.round(rest * ((z as any)[k] / otherSum));
    });
    setAdvKey('attackZones', z);
  };

  /** Refuerzo defensivo: rota 0→1→…→máx→0 respetando el total de puntos del dibujo. */
  const cycleReinforcement = (zone: string, totalAllowed: number) => {
    const r = { ...adv.defenseReinforcement };
    const used = Object.values(r).reduce<number>((sum, value) => sum + Number(value ?? 0), 0);
    const current = Number((r as any)[zone] ?? 0);
    const free = totalAllowed - (used - current);
    (r as any)[zone] = current >= Math.min(3, free) ? 0 : current + 1;
    setAdvKey('defenseReinforcement', r);
  };

  // Sustituciones programadas (máx. 3, manual §2.8). Se persisten en
  // Tactic.subsLogic (JSON) vía el autosave y el MOTOR las ejecuta en su ventana
  // de minutos si el marcador cumple la condición, con prioridad sobre los
  // cambios automáticos (R4, Claude 5 jun — minutos jugados reflejados en ratings).
  const subRules: SubRule[] = adv.subs ?? [];
  const setSubRules = (rules: SubRule[]) => setAdvKey('subs', rules);
  const addSubRule = () => {
    if (subRules.length >= 3) return;
    setSubRules([...subRules, { fromMin: 60, toMin: 67, condition: 'any', outId: null, inId: null }]);
  };
  const updateSubRule = (i: number, patch: Partial<SubRule>) =>
    setSubRules(subRules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeSubRule = (i: number) => setSubRules(subRules.filter((_, j) => j !== i));

  // X5 · Reglas tácticas condicionales (máx. 5). Se persisten en el MISMO
  // Tactic.subsLogic que las sustituciones (el server propaga la táctica default
  // al partido del tick y el motor las ejecuta desde fromMin si el marcador
  // cumple la condición, devolviendo tacticalChanges[] al Match Center).
  const tacticalRules: TacticalRuleView[] = adv.tacticalRules ?? [];
  const setTacticalRules = (rules: TacticalRuleView[]) => setAdvKey('tacticalRules', rules);
  const addTacticalRule = () => {
    if (tacticalRules.length >= 5) return;
    setTacticalRules([...tacticalRules, { fromMin: 60, condition: 'losing', changes: {} }]);
  };
  const updateTacticalRule = (i: number, patch: Partial<TacticalRuleView>) =>
    setTacticalRules(tacticalRules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeTacticalRule = (i: number) => setTacticalRules(tacticalRules.filter((_, j) => j !== i));

  const [viewPlayer, setViewPlayer] = useState<any | null>(null); // ficha al pinchar en el campo/listas
  const [positions, setPositions] = useState<Record<number, {x: number, y: number}>>({});
  // F2: selección para intercambio (⇄ en las listas): 1er clic marca, 2º ejecuta
  const [swapSel, setSwapSel] = useState<any | null>(null);
  const [sideTab, setSideTab] = useState<SideTab>('ajustes');

  useEffect(() => {
    async function load() {
      setLoadError(null);
      setLoading(true);
      try {
        const [squad, loadedTactics, fData] = await Promise.all([
          playersApi.getSquad(),
          tacticsApi.getAll(),
          tacticsApi.formations(),
        ]);
        
        // El endpoint devuelve { formations: [...], roleLabels: {...} }, no un array directo
        const fArr = fData as any;
        setFormationsData(Array.isArray(fArr) ? fArr : (fArr?.formations ?? []));

        // Mapear isStarter y squadNumber si vienen con camelCase
        const mappedSquad = squad.map(p => ({
          ...p,
          isStarter: p.is_starter !== undefined ? p.is_starter : p.isStarter,
          squadNumber: p.squad_number !== undefined ? p.squad_number : p.squadNumber,
        }));

        setPlayersList(mappedSquad);

        if (loadedTactics && loadedTactics.length > 0) {
          setTacticsList(loadedTactics);
          const defaultIndex = loadedTactics.findIndex((t: any) => t.isDefault);
          setActiveTacticIndex(defaultIndex >= 0 ? defaultIndex : 0);

          const t = defaultIndex >= 0 ? loadedTactics[defaultIndex] : loadedTactics[0];
          setTacticId(t.id);
          setActiveFormation(t.formation || '4-4-2');
          setConstruction(t.construction ?? 50);
          setDestruction(t.destruction ?? 50);
          hydrateAdvFromTactic(t);

          const starts = mappedSquad.filter(p => p.isStarter);
          setPositions(buildPositions(t.formation || '4-4-2', starts, t.id));
        } else {
          const starts = mappedSquad.filter(p => p.isStarter);
          setActiveFormation('4-4-2');
          setPositions(buildPositions('4-4-2', starts, null));
        }
      } catch (err) {
        console.error(err);
        const msg = err instanceof Error ? err.message : t('gameplay:tactics.loadError');
        setLoadError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, t]);

  const starters = useMemo(
    () => playersList.filter(p => p.isStarter),
    [playersList],
  );
  const subs = useMemo(
    () => playersList.filter(p => !p.isStarter),
    [playersList],
  );
  const pitchStarters = useMemo(
    () => [...starters].sort((a, b) => Number(a.slotIndex ?? 99) - Number(b.slotIndex ?? 99)).slice(0, 11),
    [starters],
  );

  const positionalAlerts = useMemo<PositionalAlert[]>(() => {
    if (serverPositionalAlerts.length > 0) return serverPositionalAlerts;
    const t = tacticsList[activeTacticIndex];
    if (!t) return [];
    const raw = t.positionalAlerts ?? t.positionWarnings ?? t.positionalIncompatibilities;
    return asArray<Record<string, unknown>>(raw).map((a) => ({
      message: String(a.message ?? a.detail ?? a.reason ?? 'Incompatibilidad posicional'),
      severity: (a.severity as PositionalAlert['severity']) ?? 'warn',
      playerName: a.playerName ? String(a.playerName) : undefined,
      slotLabel: a.slotLabel ? String(a.slotLabel) : undefined,
    }));
  }, [serverPositionalAlerts, tacticsList, activeTacticIndex]);

  useEffect(() => {
    const ids = [...starters]
      .sort((a, b) => (a.slotIndex ?? 99) - (b.slotIndex ?? 99))
      .map((p) => p.id);
    if (ids.length < 11 || !activeFormation) {
      setServerPositionalAlerts([]);
      return;
    }
    let alive = true;
    tacticsApi.positionalInsights(activeFormation, ids.slice(0, 11))
      .then((r) => {
        if (!alive) return;
        setServerPositionalAlerts(asArray<Record<string, unknown>>(r.positionalAlerts).map((a) => ({
          message: String(a.message ?? 'Fuera de posición'),
          severity: (a.severity === 'critical' ? 'critical' : 'warn') as PositionalAlert['severity'],
          playerName: a.playerName ? String(a.playerName) : undefined,
          slotLabel: a.slotLabel ? String(a.slotLabel) : undefined,
        })));
      })
      .catch(() => { if (alive) setServerPositionalAlerts([]); });
    return () => { alive = false; };
  }, [starters, activeFormation]);

  async function handleFormationChange(f: string) {
    setActiveFormation(f);
    setPositions(buildPositions(f, starters, tacticId));

    if (tacticId) {
      try {
        await tacticsApi.update(tacticId, { formation: f });
        setTacticsList(prev => prev.map(t => t.id === tacticId ? { ...t, formation: f } : t));
      } catch (e) {
        console.error(e);
        toast.error(t('gameplay:tactics.toasts.layoutSaveError'));
      }
    }
  }

  async function handleSetDefault() {
    if (tacticId) {
      try {
        await tacticsApi.setDefault(tacticId);
        setTacticsList(prev => prev.map(t => ({ ...t, isDefault: t.id === tacticId })));
        toast.success(t('gameplay:tactics.toasts.setDefaultSuccess'));
      } catch (e) {
        console.error(e);
        toast.error(t('gameplay:tactics.toasts.setDefaultError'));
      }
    }
  }

  async function handleCreateTactic() {
    if (tacticsList.length >= 5) return;
    try {
      const newTactic = await tacticsApi.create({ name: `Táctica ${tacticsList.length + 1}`, formation: '4-4-2' });
      setTacticsList(prev => [...prev, newTactic]);
      
      const newIndex = tacticsList.length;
      setActiveTacticIndex(newIndex);
      setTacticId(newTactic.id);
      setActiveFormation(newTactic.formation);
      setConstruction(newTactic.construction ?? 50);
      setDestruction(newTactic.destruction ?? 50);
      advHydrated.current = false;
      hydrateAdvFromTactic(newTactic);
      setPositions(buildPositions(newTactic.formation, starters, newTactic.id));
    } catch (e) {
      console.error(e);
      toast.error(t('gameplay:tactics.toasts.createError'));
    }
  }

  function switchTactic(index: number) {
    const t = tacticsList[index];
    if (!t) return;
    setActiveTacticIndex(index);
    setTacticId(t.id);
    setActiveFormation(t.formation);
    setConstruction(t.construction ?? 50);
    setDestruction(t.destruction ?? 50);
    advHydrated.current = false; // la próxima escritura de adv viene de la hidratación
    hydrateAdvFromTactic(t);
    setPositions(buildPositions(t.formation, starters, t.id));
  }

  // Effect to update tactic when construction or destruction change (debounced)
  useEffect(() => {
    if (!tacticId) return;
    const timer = setTimeout(() => {
      tacticsApi.update(tacticId, { construction, destruction }).catch((e) => {
        console.error(e);
        toast.error(t('gameplay:tactics.saveMidfieldError'));
      });
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [construction, destruction, tacticId]);

  const handlePositionsChange = (newPos: Record<number, { x: number; y: number }>) => {
    setPositions(newPos);
    if (tacticId && activeFormation) {
      try {
        localStorage.setItem(`fdf_custom_positions_${tacticId}_${activeFormation}`, JSON.stringify(newPos));
      } catch { /* cuota de localStorage llena → se persiste en el próximo guardado */ }
    }
  };

  const avgExp = starters.length > 0 ? Math.round(starters.reduce((s, p) => s + p.experience, 0) / starters.length) : 50;
  const expPenalty = getExperiencePenalty(avgExp);
  const effectiveConstruction = Math.max(0, construction - expPenalty);
  const effectiveDestruction = Math.max(0, destruction - expPenalty);
  const goalkeeperCount = starters.filter((player) => getPositionCategory(player.position ?? '') === 'POR').length;
  const unavailableStarters = starters.filter((player) =>
    Boolean(player.injuredUntil || (player.injuries?.length ?? 0) > 0 || (player.suspendedMatches ?? 0) > 0 || (player.suspensions?.length ?? 0) > 0),
  );
  const criticalPositionalAlerts = positionalAlerts.filter((alert) => alert.severity === 'critical');
  const averageLineupOverall = starters.length > 0
    ? Math.round(starters.reduce((sum, player) => sum + Number(player.overall ?? 0), 0) / starters.length)
    : null;
  const averageLineupFitness = starters.length > 0
    ? Math.round(starters.reduce((sum, player) => sum + Number(player.fitness ?? 100), 0) / starters.length)
    : null;
  const lineupReady = starters.length === 11
    && goalkeeperCount === 1
    && unavailableStarters.length === 0
    && criticalPositionalAlerts.length === 0;
  const sideModes = [
    {
      id: 'ajustes' as const,
      icon: SlidersHorizontal,
      label: t('gameplay:tactics.sideTabs.settings'),
      hint: t('gameplay:tactics.sideTabs.settingsHint', { defaultValue: 'Dibujo, encaje y palancas del equipo' }),
      badge: criticalPositionalAlerts.length > 0 ? String(criticalPositionalAlerts.length) : 'XI',
      accent: 'var(--green-primary)',
    },
    {
      id: 'estilo' as const,
      icon: Sparkles,
      label: t('gameplay:tactics.sideTabs.style'),
      hint: t('gameplay:tactics.sideTabs.styleHint', { defaultValue: 'Plan ofensivo, defensivo y zonas' }),
      badge: `${Number(Boolean(adv.offensiveStyle)) + Number(Boolean(adv.defensiveStyle))}/2`,
      accent: 'var(--blue-info)',
    },
    {
      id: 'partido' as const,
      icon: ClipboardList,
      label: t('gameplay:tactics.sideTabs.match'),
      hint: t('gameplay:tactics.sideTabs.matchHint', { defaultValue: 'Jugadas, sustituciones y reacción' }),
      badge: String(subRules.length + tacticalRules.length),
      accent: 'var(--gold-accent)',
    },
  ];
  const activeSideMode = sideModes.find((mode) => mode.id === sideTab) ?? sideModes[0];
  const ActiveSideModeIcon = activeSideMode.icon;

  // ── F2: intercambio vía ⇄ de las listas ──────────────────────────────────────
  // titular+suplente → cambio real (PATCH starter de ambos, optimista con revert);
  // titular+titular → swap de posiciones en la pizarra; suplente+suplente → aviso.
  async function performSwap(a: any, b: any) {
    if (a.isStarter && b.isStarter) {
      setPositions(prev => {
        const pa = prev[a.id] ?? { x: 50, y: 50 };
        const pb = prev[b.id] ?? { x: 50, y: 50 };
        return { ...prev, [a.id]: pb, [b.id]: pa };
      });
      return;
    }
    if (!a.isStarter && !b.isStarter) {
      toast('Elige un titular y un suplente para hacer el cambio', { icon: '⇄' });
      return;
    }

    const starter = a.isStarter ? a : b;
    const bench = a.isStarter ? b : a;
    if (bench.injuredUntil || (bench.suspendedMatches ?? 0) > 0) {
      toast.error(t('gameplay:tactics.toasts.benchUnavailable', { name: bench.name }));
      return;
    }

    const prevList = playersList;
    const prevPositions = positions;
    // Optimista: el suplente hereda el slot exacto del titular saliente.
    setPlayersList(list => list.map(pl =>
      pl.id === starter.id ? { ...pl, isStarter: false }
      : pl.id === bench.id ? { ...pl, isStarter: true } : pl));
    setPositions(prev => {
      const slot = prev[starter.id] ?? { x: 50, y: 50 };
      const next = { ...prev, [bench.id]: slot };
      delete next[starter.id];
      return next;
    });
    try {
      await playersApi.setStarter(starter.id, false);
      await playersApi.setStarter(bench.id, true);
      toast.success(t('gameplay:tactics.toasts.subSuccess', { in: bench.name, out: starter.name }));
    } catch (e) {
      console.error(e);
      setPlayersList(prevList);
      setPositions(prevPositions);
      // deshacer el primer PATCH si fue el segundo el que falló
      playersApi.setStarter(starter.id, true).catch(() => { /* mejor esfuerzo */ });
      toast.error(t('gameplay:tactics.toasts.subError'));
    }
  }

  async function handleSwapSelect(p: any) {
    if (!swapSel) { setSwapSel(p); return; }
    if (swapSel.id === p.id) { setSwapSel(null); return; }
    const a = swapSel, b = p;
    setSwapSel(null);
    await performSwap(a, b);
  }

  // Handle HTML5 drop on pitch
  async function handleDropPlayer(draggedId: number, targetId: number) {
    const draggedP = playersList.find(p => p.id === draggedId);
    const targetP = playersList.find(p => p.id === targetId);
    if (!draggedP || !targetP) return;
    if (draggedP.id === targetP.id) return;
    
    await performSwap(draggedP, targetP);
  }

  // F2: Auto-lineup (Alineación automática usando backend WT1)
  async function handleAutoLineup() {
    setLineupLoading(true);
    try {
      const { xi } = await tacticsApi.autoLineup(activeFormation);
      const newStarters = new Set<number>(xi.map((p: any) => p.playerId));
      
      // Update p.slotIndex on playersList so Pitch2D can show the correct role
      const slotIndices: Record<number, number> = {};
      xi.forEach((p: any) => { slotIndices[p.playerId] = p.slotIndex; });
      
      // Evitar race condition de la validación del backend (max 11 titulares)
      // Primero pasamos a suplentes a los que salen del once
      const toBench = playersList.filter(p => p.isStarter && !newStarters.has(p.id));
      await Promise.all(toBench.map(p => playersApi.setStarter(p.id, false)));
      
      // Luego pasamos a titulares a los que entran
      const toStarter = playersList.filter(p => !p.isStarter && newStarters.has(p.id));
      for (const p of toStarter) {
        // En serie para evitar solapamientos en la lectura de otherStarters en el backend
        await playersApi.setStarter(p.id, true);
      }
      
      const newList = playersList.map(p => ({ 
        ...p, 
        isStarter: newStarters.has(p.id),
        slotIndex: slotIndices[p.id] !== undefined ? slotIndices[p.id] : p.slotIndex
      }));
      setPlayersList(newList);
      setPositions(buildPositions(activeFormation, newList.filter(p => p.isStarter), tacticId));
      toast.success(t('gameplay:tactics.autoLineupSuccess'));
    } catch {
      toast.error(t('gameplay:tactics.autoLineupError'));
    } finally {
      setLineupLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-surface tactics-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <style>{TAC_CSS}</style>
        <div className="tac-pitchwrap" style={{ minHeight: 420, display: 'grid', placeItems: 'center' }}>
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
            {t('gameplay:tactics.loading')}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page-surface tactics-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <style>{TAC_CSS}</style>
        <SportingWorkspaceHeader
          eyebrow={t('gameplay:tactics.command.eyebrow')}
          title={t('gameplay:tactics.command.title')}
          description={t('gameplay:tactics.command.description')}
          alert={{ tone: 'risk', title: t('gameplay:tactics.loadError'), detail: loadError }}
          metrics={[
            { label: t('gameplay:tactics.command.metrics.formation'), value: '—', tone: 'neutral' },
            { label: t('gameplay:tactics.command.metrics.xi'), value: '—', tone: 'risk' },
            { label: t('gameplay:tactics.command.metrics.overall'), value: '—', tone: 'neutral' },
            { label: t('gameplay:tactics.command.metrics.fitness'), value: '—', tone: 'neutral' },
          ]}
        />
        <div className="section-panel p-8">
          <EmptyState
            title={t('gameplay:tactics.loadError')}
            hint={loadError}
            action={<Button onClick={() => setRefreshKey(k => k + 1)}>{t('gameplay:tactics.retry')}</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface tactics-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <style>{TAC_CSS}</style>

      <SportingWorkspaceHeader
        eyebrow={t('gameplay:tactics.command.eyebrow')}
        title={t('gameplay:tactics.command.title')}
        description={t('gameplay:tactics.command.description')}
        alert={{
          tone: lineupReady ? 'good' : unavailableStarters.length > 0 || goalkeeperCount !== 1 ? 'risk' : 'watch',
          title: lineupReady ? t('gameplay:tactics.command.ready') : t('gameplay:tactics.command.notReady'),
          detail: lineupReady
            ? t('gameplay:tactics.command.readyHint')
            : t('gameplay:tactics.command.notReadyHint', {
                count: starters.length,
                unavailable: unavailableStarters.length,
                alerts: criticalPositionalAlerts.length,
              }),
        }}
        metrics={[
          { label: t('gameplay:tactics.command.metrics.formation'), value: activeFormation, tone: 'neutral' },
          { label: t('gameplay:tactics.command.metrics.xi'), value: `${starters.length}/11`, tone: starters.length === 11 ? 'good' : 'risk' },
          { label: t('gameplay:tactics.command.metrics.overall'), value: averageLineupOverall ?? '—', tone: 'neutral' },
          { label: t('gameplay:tactics.command.metrics.fitness'), value: averageLineupFitness != null ? `${averageLineupFitness}%` : '—', tone: averageLineupFitness != null && averageLineupFitness < 75 ? 'risk' : 'good' },
        ]}
        actions={(
          <button type="button" className="tac-hero-action" onClick={handleAutoLineup} disabled={lineupLoading}>
            {lineupLoading ? t('gameplay:tactics.autoLineupLoading') : t('gameplay:tactics.command.repairXI')}
          </button>
        )}
      />
      
      <div className="tac-head">
        <div className="tac-tabsrow">
          {tacticsList.map((t, i) => (
            <button key={t.id} className={cn('tac-tab', activeTacticIndex === i && 'on')} onClick={() => switchTactic(i)}>
              {t.isDefault && <Star size={10} />} {t.name}
            </button>
          ))}
          {tacticsList.length < 5 && <button className="tac-tab new" onClick={handleCreateTactic}>{t('gameplay:tactics.newTactic')}</button>}
          {tacticId && !tacticsList[activeTacticIndex]?.isDefault && (
            <button className="tac-tab gold" onClick={handleSetDefault}>{t('gameplay:tactics.setDefault')}</button>
          )}
        </div>
      </div>

      <TacticsSummaryBar
        formation={activeFormation}
        offensiveStyle={adv.offensiveStyle}
        defensiveStyle={adv.defensiveStyle}
        pressing={adv.pressing ?? 50}
        tempo={adv.tempo ?? 50}
        mentality={adv.mentality ?? 50}
        marking={adv.marking ?? 'zonal'}
        construction={construction}
        destruction={destruction}
        saveState={saveState}
      />

      <nav className="tac-modebar" aria-label={t('gameplay:tactics.command.workspaceNav', { defaultValue: 'Navegación de la mesa táctica' })}>
        {sideModes.map((mode) => {
          const ModeIcon = mode.icon;
          const active = sideTab === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              className={cn('tac-mode', active && 'on')}
              style={{ ['--mode-accent' as string]: mode.accent }}
              aria-pressed={active}
              onClick={() => setSideTab(mode.id)}
            >
              <span className="tac-mode__icon"><ModeIcon size={16} /></span>
              <span className="tac-mode__copy"><strong>{mode.label}</strong><small>{mode.hint}</small></span>
              <span className="tac-mode__badge">{mode.badge}</span>
            </button>
          );
        })}
      </nav>

      <div className="tac-grid">
        {/* Left: starters and bench stay visible together so exchanges remain direct. */}
        <div className="tac-roster">
          <div className="tac-lineup-guide">
            <UsersRound size={18} />
            <div>
              <strong>{t('gameplay:tactics.starters')} ⇄ {t('gameplay:tactics.subs')}</strong>
              <span>
                {swapSel
                  ? <><b>{swapSel.name}</b> · {t('gameplay:tactics.panels.squadList.swapStart')}</>
                  : t('gameplay:tactics.panels.squadList.swapStart')}
              </span>
            </div>
          </div>
          <SquadListPanel
            title={t('gameplay:tactics.starters')}
            players={starters}
            tone="starters"
            onPlayerClick={setViewPlayer}
            swapSelectedId={swapSel?.id}
            onSwapSelect={handleSwapSelect}
            onDropPlayer={handleDropPlayer}
          />
          <SquadListPanel
            title={t('gameplay:tactics.subs')}
            players={subs}
            tone="bench"
            dim
            onPlayerClick={setViewPlayer}
            swapSelectedId={swapSel?.id}
            onSwapSelect={handleSwapSelect}
            onDropPlayer={handleDropPlayer}
          />
        </div>

        {/* Center: Pitch & Formations */}
        <div className="tac-board">
          <div className="tac-boardhead">
            <span><LayoutGrid size={15} />{t('gameplay:tactics.command.boardTitle')}</span>
            <small>{t('gameplay:tactics.command.boardHint')}</small>
            <div className="tac-board-status">
              <em className={cn(pitchStarters.length === 11 && 'ok')}>{pitchStarters.length}/11</em>
              <b>{activeFormation}</b>
            </div>
          </div>
          <div className="tac-pitchwrap">
            <Pitch2D
              starters={pitchStarters}
              formation={activeFormation}
              positions={positions}
              onPositionsChange={handlePositionsChange}
              onPlayerClick={setViewPlayer}
              formationsData={formationsData}
              onDropPlayer={handleDropPlayer}
            />
          </div>
          <div className="tac-form-picker">
            <label htmlFor="tactics-formation"><LayoutGrid size={14} />{t('gameplay:tactics.command.metrics.formation')}</label>
            <select id="tactics-formation" value={activeFormation} onChange={(event) => void handleFormationChange(event.target.value)}>
              {formationsData.map((formation: any) => (
                <option key={formation.key} value={formation.key}>{formation.key}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Tactics Panels */}
        <div className="tac-side">
          <div className="tac-side-nav">
            <div className="tac-mode-intro" style={{ ['--mode-accent' as string]: activeSideMode.accent }}>
              <span><ActiveSideModeIcon size={16} /></span>
              <div>
                <strong>{activeSideMode.label}</strong>
                <small>{activeSideMode.hint}</small>
              </div>
            </div>

            {sideTab === 'ajustes' && (
              <div className="tac-sidebody">
              <FormationInsightPanel formation={activeFormation} starters={starters} positionalAlerts={positionalAlerts} />
              <MidfieldPanel
                construction={construction} destruction={destruction} 
                effectiveConstruction={effectiveConstruction} effectiveDestruction={effectiveDestruction} 
                expPenalty={expPenalty} avgExp={avgExp} 
                onConstruction={setConstruction} onDestruction={setDestruction} 
              />
              <AdvancedPanel adv={adv} setAdvKey={setAdvKey} />
              </div>
            )}

            {sideTab === 'estilo' && (
              <div className="tac-sidebody">
              <StylePanel 
                adv={adv} setAdvKey={setAdvKey} 
                offensiveStyles={OFFENSIVE_STYLES} defensiveStyles={DEFENSIVE_STYLES} 
              />
              <ZonesPanel 
                adv={adv} formation={activeFormation} 
                reinforcementPoints={reinforcementPoints(activeFormation)} 
                zoneLabels={ZONE_LABELS} 
                onAttackZone={setAttackZone} onCycleReinforcement={cycleReinforcement} 
              />
              </div>
            )}

            {sideTab === 'partido' && (
              <div className="tac-sidebody">
              <TrainedPlaysPanel />
              <SubsPanel
                subRules={subRules} starters={starters} subs={subs}
                minuteWindows={MINUTE_WINDOWS} conditions={SUB_CONDITIONS}
                onAdd={addSubRule} onUpdate={updateSubRule} onRemove={removeSubRule}
              />
              <MatchPlanPanel
                rules={tacticalRules}
                conditions={SUB_CONDITIONS}
                offensiveStyles={OFFENSIVE_STYLES}
                defensiveStyles={DEFENSIVE_STYLES}
                formations={formationsData.map((f: any) => f.key)}
                onAdd={addTacticalRule}
                onUpdate={updateTacticalRule}
                onRemove={removeTacticalRule}
              />
              <AppliedTacticalChangesPanel />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Dossier */}
      {viewPlayer && (
        <Modal open={true} onClose={() => setViewPlayer(null)} title={t('gameplay:tactics.dossierTitle')} width={1100}>
          <div className="flex flex-col gap-3">
            <PlayerDossier player={tacticsToDossier(viewPlayer)} />
            {viewPlayer.id != null && (
              <div className="flex justify-end">
                <Link to={`/player/${viewPlayer.id}`} className="font-display font-bold text-xs uppercase tracking-wide text-[var(--green-primary)] hover:brightness-125">
                  {t('gameplay:tactics.fullProfile')}
                </Link>
              </div>
            )}
            {viewPlayer.id != null && (
              <details>
                <summary className="cursor-pointer text-xs uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  {t('gameplay:tactics.renewOffer')}
                </summary>
                <div className="mt-2">
                  <OfferPanel
                    mode="renew"
                    player={{
                      id: viewPlayer.id,
                      name: viewPlayer.name ?? 'Jugador',
                      age: viewPlayer.age,
                      morale: viewPlayer.morale,
                      marketValue: viewPlayer.marketValue,
                      currentSalary: viewPlayer.wage,
                    }}
                    onSubmit={async (offer) => {
                      try {
                        const res = await marketApi.renew(viewPlayer.id, offer.salary, offer.years, offer.clause);
                        if (res?.accepted) { toast.success(t('gameplay:tactics.toasts.renewSuccess')); setViewPlayer(null); }
                        else toast.error(res?.message ?? t('gameplay:tactics.toasts.renewReject'));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t('gameplay:tactics.toasts.renewError'));
                      }
                    }}
                  />
                </div>
              </details>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

function getPlayerAverage(p: any): number { return p.overall; }

function tacticsToDossier(p: any): DossierPlayer {
  return {
    id: p.id,
    name: p.name ?? 'Jugador', position: p.position, preferredPosition: p.preferredPosition, age: p.age,
    potential: p.potential ?? p.talent ?? p.overall, nationality: p.nationality,
    marketValue: p.marketValue, wage: p.wage,
    passing: p.passing, tackling: p.tackling, shooting: p.shooting, organization: p.organization,
    unmarking: p.unmarking, finishing: p.finishing, dribbling: p.dribbling, fouls: p.fouls, goalkeeping: p.goalkeeping,
    fitness: p.fitness, muscularFitness: p.muscularFitness, mentalSharpness: p.mentalSharpness, matchRhythm: p.matchRhythm,
    isInjured: !!p.injuredUntil, isSuspended: (p.suspendedMatches ?? 0) > 0,
  };
}
