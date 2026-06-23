// ─── QA7 · Mercado vivo de la IA — lógica PURA, testeable sin BD ──────────────
// Los clubes NPC (sin mánager humano) estaban inertes en el mercado: en la
// simulación de 5 temporadas hubo 0 ofertas/traspasos de la IA. Aquí vive la
// DECISIÓN pura (qué posición reforzar, a quién pujar, con qué términos, qué
// excedente poner a la venta). La RESOLUCIÓN la hace el núcleo YA existente:
// la subasta a 3 turnos de `stepTransfers` adjudica las ofertas pendientes con
// `executePlayerTransfer`, aplicando TODAS las guardas FDF (ventana, límites de
// plantilla 16/30, tope salarial, anti-reventa, protección de estrellas).
//
// Principios respetados:
//   · Determinista por semilla: toda aleatoriedad usa makeRng(turn·primo+clubId).
//   · Términos que PASAN evaluateOffer (manual §4.2/§4.3): salario ≥ demanda,
//     cláusula ≤ límite legal por años, años 1-5, edad < 33, moral ≥ 11.
//   · Aditivo: solo crea TransferOffer 'pending' y marca isForSale; no toca
//     firmas existentes ni ejecuta traspasos por su cuenta.

import { makeRng, salaryCap } from '../game/tick.logic';
import {
  calcPlayerSalaryDemand,
  calcPlayerSportingOverall,
  type PlayerAttrs,
} from '../../lib/playerValuation';

// ── Constantes de diseño FDF ──────────────────────────────────────────────────
/** Plantilla ideal por macroposición (POR/DEF/MED/DEL). Total ideal ~24. */
export const IDEAL_SQUAD: Record<Macro, number> = { POR: 3, DEF: 8, MED: 8, DEL: 5 };
/** No rellenar HUECO si la plantilla ya alcanza este tamaño (margen al límite 30). */
export const SQUAD_BUY_CAP = 28;
/** Tope para fichar un UPGRADE (desplaza a un débil, que se lista a la vez). */
export const SQUAD_UPGRADE_CAP = 29;
/** El objetivo debe valer al menos ×este factor que el más débil para ser upgrade. */
export const UPGRADE_FACTOR = 1.2;
/** Listar excedente solo con plantilla razonablemente poblada. */
export const SQUAD_SELL_MIN = 20;
/** Multiplicador de cláusula legal FDF por años de contrato (manual §4.2). */
export const CLAUSE_MULT: Record<number, number> = { 1: 600, 2: 500, 3: 400, 4: 300, 5: 200 };
/** Umbral de "estrella" que la IA no intenta arrebatar (espejo de stepTransfers). */
export const STAR_TALENT = 85;
export const STAR_VALUE = 30_000_000;
/** Años de contrato por defecto en una compra de la IA. */
export const AI_CONTRACT_YEARS = 3;
/** Reserva mínima de caja que la IA conserva tras un fichaje. */
export const BUDGET_RESERVE = 2_000_000;
/** Fracción máxima de la caja que la IA gasta en un único traspaso. */
export const BUDGET_SPEND_FRACTION = 0.55;

export type Macro = 'POR' | 'DEF' | 'MED' | 'DEL';

// Tabla exhaustiva etiqueta → macro. Cubre las macro FDF, las 15 detalladas
// canónicas (detailedPositions.ts) y las etiquetas LEGACY que la BD usa en el
// campo `position` (DFC, MC, MD, MI, PO, EXT DERECHA…). La fuente fiable es
// `detailedPosition`; `position` legacy es el respaldo.
const MACRO_BY_POS: Record<string, Macro> = {
  // Portero
  POR: 'POR', PO: 'POR', GK: 'POR',
  // Defensa: centrales, laterales
  DEF: 'DEF', DFC: 'DEF', CT: 'DEF', CB: 'DEF', LD: 'DEF', LI: 'DEF', LB: 'DEF', RB: 'DEF',
  // Medio: pivotes, mediocentros, interiores, media punta
  MED: 'MED', PIV: 'MED', ORG: 'MED', MCO: 'MED', BOX: 'MED', INTD: 'MED', INTI: 'MED',
  MP: 'MED', MC: 'MED', MCC: 'MED', MCD: 'MED', MCTT: 'MED', MI: 'MED', MD: 'MED',
  // Delantera: extremos, delanteros, falsos 9
  DEL: 'DEL', DC: 'DEL', F9: 'DEL', S9: 'DEL', 'FALSO 9': 'DEL',
  EXTD: 'DEL', EXTI: 'DEL', 'EXT DERECHA': 'DEL', 'EXT IZQ': 'DEL',
};

/** Reduce una posición FDF (detallada, legacy o macro) a una de las 4 macros. */
export function macroOf(position: string): Macro {
  const p = (position || '').trim().toUpperCase();
  const hit = MACRO_BY_POS[p];
  if (hit) return hit;
  if (p.startsWith('EXT') || p.startsWith('DC') || p.startsWith('DEL')) return 'DEL';
  if (p.startsWith('PO') || p === 'GK') return 'POR';
  if (p.startsWith('DF') || p.startsWith('CB') || p.startsWith('LAT')) return 'DEF';
  return 'MED';
}

/** Macro de un jugador priorizando la posición detallada (fiable) sobre la legacy. */
export function macroOfPlayer(p: { position: string; detailedPosition?: string | null }): Macro {
  return macroOf(p.detailedPosition ?? p.position);
}

// ── Vistas mínimas (lo que necesita la decisión, no el modelo Prisma entero) ───
export interface AiSquadPlayer {
  id: number;
  position: string;
  detailedPosition?: string | null;
  marketValue: number;
  talent: number;
  potential: number;
  isForSale: boolean;
}

export interface AiClubView {
  id: number;
  country?: string | null;
  reputation: number;
  budget: number;
  /** Gasto salarial mensual actual (jugadores + cuerpo técnico). */
  usedSalaryMonthly: number;
  squad: AiSquadPlayer[];
}

export interface AiTargetView extends PlayerAttrs {
  id: number;
  clubId: number | null;        // dueño actual (null = agente libre)
  ownerIsHuman: boolean;        // el club dueño tiene mánager humano
  nationality: string;
  country?: string | null;      // país del club dueño (afinidad sentimental)
  talent: number;
  marketValue: number;
  salary: number;
  morale: number;
  isForSale: boolean;
  loaned: boolean;
  lastTransferAt?: Date | null;
  lastTransferValue?: number | null;
}

// ── Análisis de necesidades de plantilla ──────────────────────────────────────
export interface SquadNeeds {
  total: number;
  byPos: Record<Macro, number>;
  /** Macroposiciones por debajo del ideal, mayor déficit primero. */
  needed: Macro[];
}

export function analyzeSquadNeeds(squad: AiSquadPlayer[]): SquadNeeds {
  const byPos: Record<Macro, number> = { POR: 0, DEF: 0, MED: 0, DEL: 0 };
  for (const p of squad) byPos[macroOfPlayer(p)]++;
  const macros: Macro[] = ['POR', 'DEF', 'MED', 'DEL'];
  const needed = macros
    .filter((m) => byPos[m] < IDEAL_SQUAD[m])
    .sort((a, b) => (byPos[a] - IDEAL_SQUAD[a]) - (byPos[b] - IDEAL_SQUAD[b]));
  return { total: squad.length, byPos, needed };
}

// ── Elegibilidad de objetivos (espejo de las guardas del tick) ────────────────
export function isStarTarget(t: AiTargetView): boolean {
  return (t.talent >= STAR_TALENT || t.potential >= STAR_TALENT || t.marketValue >= STAR_VALUE) && !t.isForSale;
}

/** ¿Puede la IA pujar por este jugador sin desperdiciar la oferta? */
export function isEligibleTarget(t: AiTargetView): boolean {
  if (t.loaned) return false;        // cedido: el cesionario no lo vende
  if (t.age >= 33) return false;     // 33+ no firma contrato nuevo (evaluateOffer)
  if (t.morale < 11) return false;   // moral mínima FDF
  if (isStarTarget(t)) return false; // la IA no arrebata estrellas
  return true;
}

// ── Términos de la oferta ─────────────────────────────────────────────────────
export interface PlannedOffer {
  buyerClubId: number;
  playerId: number;
  sellerClubId: number | null;  // null = agente libre
  amount: number;
  salary: number;
  contractYears: number;
  releaseClause: number;
  targetIsHuman: boolean;       // la resolución la decide el humano, no el tick
}

/** Salario ofertado: por encima del mayor de (salario actual, demanda) para
 *  pasar la llave salarial y elevar el bloque económico de evaluateOffer. */
function plannedSalary(t: AiTargetView, club: AiClubView): number {
  const demand = calcPlayerSalaryDemand(t, { clubReputation: club.reputation });
  const base = Math.max(t.salary || 0, demand);
  return Math.round(base * 1.1);
}

/** Afinidad "sentimental" con el comprador (manual §4.3): para un jugador con
 *  club se compara país del club dueño; para un agente libre, su nacionalidad.
 *  Refuerza el bloque sentimental de evaluateOffer (cityScore 50). */
export function hasCityAffinity(club: AiClubView, t: AiTargetView): boolean {
  if (!club.country) return false;
  const other = t.clubId == null ? t.nationality : t.country;
  return !!other && other === club.country;
}

/** Importe del traspaso: prima sobre el valor para que el vendedor CPU acepte,
 *  respetando anti-reventa y los límites de gasto. Devuelve null si no encaja. */
function plannedAmount(
  t: AiTargetView,
  club: AiClubView,
  rng: () => number,
  inGameYear: number,
): number | null {
  if (t.clubId == null) return 0; // agente libre: el traspaso no cuesta (solo ficha)

  const base = Math.max(t.marketValue || 0, 100_000);
  const premium = 1.08 + rng() * 0.12; // 1.08–1.20
  let amount = Math.round(base * premium);

  // Anti-reventa FDF (manual §4.4): si llegó este año o el anterior, debe SUPERAR
  // su último traspaso; si no, la oferta sería rechazada al adjudicarse.
  if (t.lastTransferAt && t.lastTransferValue && t.lastTransferValue > 0) {
    const arrivalYear = t.lastTransferAt.getUTCFullYear();
    if (inGameYear <= arrivalYear + 1) {
      const floor = Math.round(t.lastTransferValue * 1.05);
      if (amount <= floor) amount = floor;
    }
  }

  const maxSpend = Math.min(club.budget * BUDGET_SPEND_FRACTION, club.budget - BUDGET_RESERVE);
  if (amount > maxSpend) return null;
  return amount;
}

/** Cláusula DENTRO del límite legal (manual §4.2): bastante por debajo del tope
 *  para que la llave de cláusula puntúe positivo en evaluateOffer. */
export function plannedClause(salary: number, years: number): number {
  const mult = CLAUSE_MULT[Math.max(1, Math.min(5, years))] ?? 400;
  return Math.round(salary * mult * 0.5);
}

/** Score de idoneidad de un objetivo: calidad + juventud + recorrido, con un
 *  desempate determinista por semilla y prima por afinidad de país (sentimental). */
function targetScore(t: AiTargetView, club: AiClubView, rng: () => number): number {
  const ovr = calcPlayerSportingOverall(t);
  const youth = Math.max(0, 28 - t.age) * 0.5;
  const upside = Math.max(0, t.potential - ovr) * 0.2;
  const affinity = hasCityAffinity(club, t) ? 4 : 0;
  return ovr + youth + upside + affinity + rng() * 3;
}

/** Construye una oferta completa para (club, objetivo) si todas las guardas
 *  encajan (cap salarial incluido). Devuelve null si no procede. */
export function buildOffer(
  club: AiClubView,
  t: AiTargetView,
  rng: () => number,
  inGameYear: number,
): PlannedOffer | null {
  const amount = plannedAmount(t, club, rng, inGameYear);
  if (amount == null) return null;

  const salary = plannedSalary(t, club);
  const years = AI_CONTRACT_YEARS;

  // Tope salarial del comprador con el salario ofertado y el gasto del traspaso.
  const cap = salaryCap(club.budget, amount);
  if (club.usedSalaryMonthly + salary > cap) return null;

  return {
    buyerClubId: club.id,
    playerId: t.id,
    sellerClubId: t.clubId,
    amount,
    salary,
    contractYears: years,
    releaseClause: plannedClause(salary, years),
    targetIsHuman: t.ownerIsHuman,
  };
}

// ── Decisión por club ─────────────────────────────────────────────────────────
export interface ClubDecisionOptions {
  inGameYear: number;
  actProb: number;
  usedPlayerIds: Set<number>; // jugadores ya con oferta este pase (no duplicar puja)
}

export interface ClubDecision {
  offer: PlannedOffer;
  /** Jugador propio desplazado por un upgrade, que se pone a la venta. */
  displacedPlayerId: number | null;
}

function isSquadStar(p: AiSquadPlayer): boolean {
  return p.talent >= STAR_TALENT || p.potential >= STAR_TALENT || p.marketValue >= STAR_VALUE;
}

/** Jugador propio MÁS DÉBIL (menor valor, no estrella, no ya listado) de la macro. */
export function weakestNonStarInMacro(club: AiClubView, macro: Macro): AiSquadPlayer | null {
  let weakest: AiSquadPlayer | null = null;
  for (const p of club.squad) {
    if (macroOfPlayer(p) !== macro) continue;
    if (p.isForSale) continue;
    if (isSquadStar(p)) continue;
    if (!weakest || p.marketValue < weakest.marketValue) weakest = p;
  }
  return weakest;
}

/**
 * Elige (como máximo) UNA compra para el club. La IA ficha por dos motivos:
 *   · HUECO: una macroposición por debajo del ideal (y plantilla con sitio).
 *   · UPGRADE: un objetivo claramente mejor (×UPGRADE_FACTOR en valor) que su
 *     jugador más débil de esa macro → ficha y DESPLAZA al débil (se pone en
 *     venta). Esto da vida al mercado aun con plantillas llenas y uniformes.
 */
export function chooseOfferForClub(
  club: AiClubView,
  pool: AiTargetView[],
  rng: () => number,
  opts: ClubDecisionOptions,
): ClubDecision | null {
  if (club.budget - BUDGET_RESERVE < 250_000) return null;
  // Reparte la actividad entre ticks para no inundar el mercado.
  if (rng() >= opts.actProb) return null;

  const needs = analyzeSquadNeeds(club.squad);
  const candidates: {
    offer: PlannedOffer; score: number; affinity: boolean; displaced: number | null;
  }[] = [];

  for (const t of pool) {
    if (t.clubId === club.id) continue;
    if (opts.usedPlayerIds.has(t.id)) continue;
    if (!isEligibleTarget(t)) continue;

    const macro = macroOfPlayer(t);
    const isNeed = needs.byPos[macro] < IDEAL_SQUAD[macro] && needs.total < SQUAD_BUY_CAP;
    const weakest = weakestNonStarInMacro(club, macro);
    const isUpgrade = !isNeed
      && needs.total < SQUAD_UPGRADE_CAP
      && weakest != null
      && t.marketValue >= weakest.marketValue * UPGRADE_FACTOR;
    if (!isNeed && !isUpgrade) continue;

    const offer = buildOffer(club, t, rng, opts.inGameYear);
    if (!offer) continue;

    // El upgrade puntúa por margen de mejora; el hueco, por idoneidad base.
    const margin = isUpgrade && weakest ? (t.marketValue / Math.max(1, weakest.marketValue)) : 1;
    const score = targetScore(t, club, rng) + (margin - 1) * 10;
    candidates.push({
      offer, score, affinity: hasCityAffinity(club, t),
      displaced: isUpgrade && weakest ? weakest.id : null,
    });
  }
  if (candidates.length === 0) return null;

  // Preferencia DURA por afinidad de país: garantiza el bloque sentimental de
  // evaluateOffer (cityScore 50) y así una alta tasa de adjudicación. Solo se
  // cae a objetivos foráneos si no hay ninguno afín.
  const affine = candidates.filter((c) => c.affinity);
  const pickFrom = affine.length > 0 ? affine : candidates;
  pickFrom.sort((a, b) => b.score - a.score);
  const best = pickFrom[0];
  return { offer: best.offer, displacedPlayerId: best.displaced };
}

/** Elige excedente para poner a la venta (crea SUPPLY para el resto del mundo). */
export function chooseListingsForClub(
  club: AiClubView,
  rng: () => number,
  actProb: number,
  maxPerClub = 1,
): number[] {
  const needs = analyzeSquadNeeds(club.squad);
  if (needs.total < SQUAD_SELL_MIN) return [];
  if (rng() >= actProb) return [];

  const macros: Macro[] = ['POR', 'DEF', 'MED', 'DEL'];
  const surplusMacro = macros
    .map((m) => ({ m, surplus: needs.byPos[m] - IDEAL_SQUAD[m] }))
    .filter((x) => x.surplus >= 1)
    .sort((a, b) => b.surplus - a.surplus)[0];
  if (!surplusMacro) return [];

  // El jugador de MENOR valor (no estrella, no ya listado) de la macro excedente.
  const sellable = club.squad
    .filter((p) => macroOfPlayer(p) === surplusMacro.m)
    .filter((p) => !p.isForSale)
    .filter((p) => !((p.talent >= STAR_TALENT || p.potential >= STAR_TALENT || p.marketValue >= STAR_VALUE)))
    .sort((a, b) => a.marketValue - b.marketValue);
  return sellable.slice(0, maxPerClub).map((p) => p.id);
}

// ── Plan global del pase ──────────────────────────────────────────────────────
export interface PlanOptions {
  turn: number;
  inGameYear: number;
  maxOffers?: number;
  maxListings?: number;
  buyActProb?: number;
  sellActProb?: number;
  existingOfferClubIds?: Set<number>;  // clubes con oferta viva (dedupe)
  existingOfferPlayerIds?: Set<number>; // jugadores ya con oferta (dedupe)
}

export interface AiMarketPlan {
  offers: PlannedOffer[];
  listings: number[];
  clubsConsidered: number;
  clubsActed: number;
}

export function planAiMarketPass(
  clubs: AiClubView[],
  pool: AiTargetView[],
  opts: PlanOptions,
): AiMarketPlan {
  const maxOffers = opts.maxOffers ?? 60;
  const maxListings = opts.maxListings ?? 60;
  const buyActProb = opts.buyActProb ?? 0.2;
  const sellActProb = opts.sellActProb ?? 0.25;
  const existingClub = opts.existingOfferClubIds ?? new Set<number>();
  const usedPlayerIds = new Set<number>(opts.existingOfferPlayerIds ?? []);

  const ordered = [...clubs].sort((a, b) => a.id - b.id);
  const offers: PlannedOffer[] = [];
  const listings: number[] = [];
  let clubsActed = 0;

  for (const club of ordered) {
    // Semilla determinista por (turno, club). Separada para compra y venta.
    const buyRng = makeRng((opts.turn >>> 0) * 2654435761 + club.id * 97 + 53);
    const sellRng = makeRng((opts.turn >>> 0) * 40503 + club.id * 131 + 17);

    if (offers.length < maxOffers && !existingClub.has(club.id)) {
      const decision = chooseOfferForClub(club, pool, buyRng, {
        inGameYear: opts.inGameYear,
        actProb: buyActProb,
        usedPlayerIds,
      });
      if (decision) {
        offers.push(decision.offer);
        usedPlayerIds.add(decision.offer.playerId);
        clubsActed++;
        // El jugador desplazado por el upgrade se pone a la venta.
        if (decision.displacedPlayerId != null && listings.length < maxListings) {
          listings.push(decision.displacedPlayerId);
        }
      }
    }

    if (listings.length < maxListings) {
      for (const id of chooseListingsForClub(club, sellRng, sellActProb)) {
        if (listings.length >= maxListings) break;
        listings.push(id);
      }
    }
  }

  return { offers, listings, clubsConsidered: ordered.length, clubsActed };
}
