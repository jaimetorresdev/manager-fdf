// ─── WT3 · Efectos de las formaciones en la simulación ────────────────────────
// Tres palancas (doc de diseño §3-§4), TODAS neutras por defecto (patrón R7):
//
//  1) COUNTERS piedra-papel-tijera SUAVES entre formaciones del catálogo WT2
//     → bonus/malus de perfil (attack/defense/midfield) acotados, nunca
//     deterministas. Formación fuera de catálogo o mismo sistema = neutro.
//  2) Penalización por jugar FUERA de la posición detallada (WT1): un CT de
//     lateral pierde un % de sus atributos de juego. Sin posición detallada en
//     el XI o formación fuera de catálogo = roster intacto bit a bit.
//  3) Demanda física de la formación → fatiga POST-partido (decayFitness):
//     demanda 3 = neutro exacto (misma fórmula de siempre); los carrileros del
//     3-4-3/3-5-2 y el BOX se vacían más.
//
// ⚠️ RECALIBRACIÓN CONSCIENTE: con datos antiguos (jugadores sin
// detailedPosition, formaciones fuera de catálogo) los resultados son bit a bit
// idénticos. Con el catálogo activo, los counters mueven como máximo ±2 puntos
// de ataque (≈ media ventaja de campo): se NOTAN en stats agregadas sin volverse
// deterministas. Documentado en DOCUMENTACION §9 (WT3).

import { findFormation, slotMacro, type FormationDef, type FormationSlot } from '../tactics/formations.catalog';
import { isDetailedPosition, normalizeMacro, type MacroPosition } from '../players/detailedPositions';
import type { EnginePlayer } from './engineClient';

// ─── 1 · Counters suaves por matchup de formaciones ──────────────────────────

export interface ProfileBonus {
  attack: number;
  defense: number;
  midfield: number;
}

// Escala del counter: el lado favorecido gana +2/+1/+1.5 y el desfavorecido lo
// pierde (swing total ≈ 4 puntos de ataque ≈ la ventaja de campo, 3.5). Menor
// que el duelo de estilos §2.9 (hasta 7.2 unilateral): el counter ACOMPAÑA, no
// decide.
const COUNTER_ATTACK = 2.0;
const COUNTER_DEFENSE = 1.0;
const COUNTER_MIDFIELD = 1.5;

/**
 * Bonus de perfil por matchup de formaciones (counters del catálogo WT2).
 * null = neutro: alguna formación fuera de catálogo, mismo sistema o matchup
 * sin dominancia (p. ej. cualquier cosa contra el 4-2-3-1).
 */
export function formationMatchupBonus(
  homeFormation: string | null | undefined,
  awayFormation: string | null | undefined,
): { home: ProfileBonus; away: ProfileBonus } | null {
  const home = findFormation(homeFormation);
  const away = findFormation(awayFormation);
  if (!home || !away || home.key === away.key) return null;

  const adv = (a: FormationDef, b: FormationDef): number =>
    (a.counters.strongVs.includes(b.key) ? 1 : 0) - (a.counters.weakVs.includes(b.key) ? 1 : 0);
  // Neto −1..1 (capado): si ambas listas coinciden, la ventaja no se duplica.
  const net = Math.max(-1, Math.min(1, adv(home, away) - adv(away, home)));
  if (net === 0) return null;

  const side = (sign: number): ProfileBonus => ({
    attack: COUNTER_ATTACK * sign,
    defense: COUNTER_DEFENSE * sign,
    midfield: COUNTER_MIDFIELD * sign,
  });
  return { home: side(net), away: side(-net) };
}

// ─── 2 · Penalización por jugar fuera de la posición detallada ───────────────

// −6% en atributos de JUEGO del jugador mal colocado + N3-1 rompe cadena ofensiva.
const OUT_OF_POSITION_MULT = 0.94;
const SCALED_ATTRS = [
  'passing', 'tackling', 'shooting', 'organization',
  'unmarking', 'finishing', 'dribbling',
] as const;

/**
 * Ajusta el roster ANTES de enviarlo al motor: asigna el XI a los slots de la
 * formación (greedy determinista por línea macro) y aplica la penalización a
 * los titulares cuya posición detallada NO encaja en ningún hueco libre de su
 * línea. Neutro absoluto (mismo array, bit a bit) si:
 *   - la formación no está en el catálogo WT2, o
 *   - ningún titular tiene posición detallada (datos antiguos), o
 *   - todo el mundo encaja donde le toca.
 */
export function applyDetailedPositionEffects(
  roster: EnginePlayer[],
  formation: string | null | undefined,
): EnginePlayer[] {
  const def = findFormation(formation);
  if (!def) return roster;

  const xi = roster.filter((p) => p.isStarter);
  if (xi.length < 11) return roster;
  if (!xi.some((p) => isDetailedPosition(p.detailedPosition))) return roster;

  // Slots por línea macro (POR fuera: el portero no se penaliza por slot).
  const slotsByMacro = new Map<MacroPosition, FormationSlot[]>();
  for (const slot of def.slots) {
    const macro = slotMacro(slot);
    if (macro === 'POR') continue;
    const list = slotsByMacro.get(macro) ?? [];
    list.push(slot);
    slotsByMacro.set(macro, list);
  }

  const penalizedIds = new Set<EnginePlayer>();
  for (const [macro, slots] of slotsByMacro) {
    const players = xi
      .filter((p) => normalizeMacro(p.position) === macro)
      .sort((a, b) => String(a.id ?? a.name).localeCompare(String(b.id ?? b.name)));
    if (!players.length) continue;

    // 1ª pasada: encajar especialistas exactos (consume slots).
    const freeSlots = [...slots];
    const unmatched: EnginePlayer[] = [];
    for (const player of players) {
      const detailed = player.detailedPosition;
      const idx = isDetailedPosition(detailed)
        ? freeSlots.findIndex((s) => s.positions.includes(detailed))
        : -1;
      if (idx >= 0) freeSlots.splice(idx, 1);
      else unmatched.push(player);
    }
    // 2ª pasada: los no encajados OCUPAN los huecos restantes fuera de posición
    // (solo se penaliza a tantos como huecos había; el resto de la línea no
    // tiene slot que desocupar y queda neutro). Sin posición detallada = neutro
    // (comodín: datos antiguos no empeoran).
    let remaining = freeSlots.length;
    for (const player of unmatched) {
      if (remaining <= 0) break;
      remaining--;
      if (!isDetailedPosition(player.detailedPosition)) continue;
      penalizedIds.add(player);
    }
  }

  if (penalizedIds.size === 0) return roster;
  return roster.map((p) => {
    if (!penalizedIds.has(p)) return p;
    const scaled: EnginePlayer = { ...p, outOfPositionChainBreak: true };
    for (const attrKey of SCALED_ATTRS) {
      scaled[attrKey] = Math.round(p[attrKey] * OUT_OF_POSITION_MULT * 10) / 10;
    }
    return scaled;
  });
}

export type PositionalAlert = {
  playerId: number | string;
  playerName: string;
  slotLabel?: string;
  detailedPosition?: string | null;
  severity: 'warn' | 'critical';
  message: string;
};

/** N3-1 · Avisos server-side para pizarra/asesor (rompe cadena ofensiva). */
export function buildPositionalAlerts(
  xi: Array<{
    playerId: number;
    name: string;
    slotLabel?: string;
    detailedPosition?: string | null;
    outOfPosition?: boolean;
    emergency?: boolean;
  }>,
): PositionalAlert[] {
  return xi
    .filter((slot) => slot.outOfPosition)
    .map((slot) => ({
      playerId: slot.playerId,
      playerName: slot.name,
      slotLabel: slot.slotLabel,
      detailedPosition: slot.detailedPosition ?? null,
      severity: slot.emergency ? 'critical' : 'warn',
      message: slot.emergency
        ? `${slot.name} está fuera de su demarcación en ${slot.slotLabel ?? 'el hueco'}: la cadena de pase y remate queda anulada (N3-1).`
        : `${slot.name} no encaja en ${slot.slotLabel ?? 'su hueco'}: sin pases clave ni remates decisivos en ataque.`,
    }));
}

// ─── 3 · Demanda física → fatiga post-partido ─────────────────────────────────

/** Demanda física 1-5 de la formación; null = fuera de catálogo (neutro = 3). */
export function physicalDemandOf(formation: string | null | undefined): number | null {
  return findFormation(formation)?.physicalDemand ?? null;
}

/** ¿La formación usa carrileros (LD/LI a banda completa en líneas de 3/5)? */
export function hasWingBacks(formation: string | null | undefined): boolean {
  const def = findFormation(formation);
  if (!def) return false;
  return def.slots.some((slot) => (slot.roles ?? []).includes('carrilero'));
}
