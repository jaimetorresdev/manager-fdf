// ─── Lógica pura del tick (sin BD, testeable) ─────────────────────────────────
// Aquí viven los cálculos del procesado de turno como funciones puras, para
// poder testearlos sin Postgres y mantener el tick determinista. game.service.ts
// solo orquesta: lee de la BD, llama a estas funciones y escribe el resultado.
import { moneyToNumber, type DecimalLike } from '../../lib/roundMoney';

type MoneyValue = number | DecimalLike;

/** PRNG determinista (mulberry32). Misma semilla ⇒ misma secuencia. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── Entrenamiento FDF ────────────────────────────────────────────────────────
// Tipos de entrenamiento disponibles (5 tipos + rehabilitación).
export type TrainingType = 'táctica' | 'portero' | 'defensa' | 'medio' | 'delantero' | 'rehabilitación';

// Qué atributos entrena cada tipo de entrenamiento.
export const TRAINING_TYPE_STATS: Record<TrainingType, string[]> = {
  'táctica':        ['organization', 'passing', 'fouls'],
  'portero':        ['goalkeeping', 'reflexes'],
  'defensa':        ['tackling', 'organization'],
  'medio':          ['organization', 'passing', 'dribbling'],
  'delantero':      ['finishing', 'shooting', 'unmarking'],
  'rehabilitación': [], // especial: solo recupera fitness
};

// Qué atributos entrena cada categoría de entrenador (FDF: GK/DEF/MID/ATT + TAC).
export const COACH_CATEGORY_STATS: Record<string, string[]> = {
  GK:  ['goalkeeping', 'reflexes'],
  DEF: ['tackling', 'organization'],
  MID: ['organization', 'passing', 'dribbling'],
  ATT: ['finishing', 'shooting', 'unmarking'],
  TAC: ['organization', 'passing', 'fouls'],
};

// ─── Parámetros FDF de jugadas entrenadas ─────────────────────────────────────
/** Turnos para desarrollar una jugada nueva */
export const PLAY_DEVELOP_TURNS = 20;
/** Turnos para entrenar (refinar) una jugada */
export const PLAY_TRAIN_TURNS = 15;
/** Nivel máximo de jugada */
export const PLAY_MAX_LEVEL = 15;
/** Máximo de jugadas por entrenador */
export const PLAYS_PER_COACH_MAX = 50;

// ─── Forma (fitness) objetivo FDF ─────────────────────────────────────────────
/** Rango de forma objetivo en porcentaje (86–90). */
export const FORM_TARGET_MIN = 86;
export const FORM_TARGET_MAX = 90;
/** Caída de forma por turno sin entrenar (puntos, sobre 100). */
export const FORM_DECAY_PER_TURN = 2;
/** Recuperación de forma por turno entrenando (puntos, sobre 100). */
export const FORM_GAIN_PER_TURN = 4;
/** Recuperación de forma con rehabilitación (puntos, sobre 100). */
export const FORM_REHAB_GAIN = 8;

/**
 * Calcula la forma del jugador al siguiente turno.
 * Sin entrenamiento baja; con entrenamiento sube hasta el objetivo (86-90).
 */
export function nextPlayerForm(
  currentFitness: number,
  isTraining: boolean,
  isRehab: boolean,
  rand: number = 0.5, // aleatorio en [0,1) pasado por el llamador; semillado en el tick
): number {
  if (isRehab) {
    return clamp(currentFitness + FORM_REHAB_GAIN, 0, FORM_TARGET_MAX);
  }
  if (isTraining) {
    const target = FORM_TARGET_MIN + Math.floor(rand * (FORM_TARGET_MAX - FORM_TARGET_MIN + 1));
    if (currentFitness < target) return clamp(currentFitness + FORM_GAIN_PER_TURN, 0, target);
    return clamp(currentFitness - 1, 0, 100); // muy buena forma baja levemente
  }
  // Sin entrenamiento, baja hacia el mínimo de forma
  return clamp(currentFitness - FORM_DECAY_PER_TURN, 40, 100);
}

/**
 * Probabilidad (0–45%) de que un jugador asignado mejore un atributo este turno.
 * Sube con el nivel del entrenador, la juventud y el talento del jugador.
 * Fórmula FDF: rand(1..100) < (nivelTécnico − penalizaciones).
 */
export function trainingChance(coachLevel: number, age: number, talent: number): number {
  const coach = coachLevel * 3;
  const youth = Math.max(0, 30 - age) * 0.6;
  const tal   = talent * 0.12;
  return clamp(coach + youth + tal, 2, 45);
}

/**
 * Penalización al entrenamiento si el jugador está lesionado o cansado.
 * Devuelve el factor multiplicador (0.0–1.0).
 */
export function trainingPenalty(fitness: number, isInjured: boolean): number {
  if (isInjured) return 0;
  if (fitness < 60) return 0.4;
  if (fitness < 75) return 0.7;
  return 1.0;
}

/** ¿Mejora el jugador? dado un aleatorio en [0,1). */
export function playerImproves(coachLevel: number, age: number, talent: number, rand: number): boolean {
  return rand * 100 < trainingChance(coachLevel, age, talent);
}

/**
 * Determina qué atributo mejora según el tipo de entrenamiento y la categoría del entrenador.
 * Si coinciden, el atributo entrenado es el de intersección; si no, el del tipo de entrenamiento.
 */
export function selectStatToImprove(
  trainingType: TrainingType,
  coachCategory: string,
  rand: number,
): string {
  const typeStats = TRAINING_TYPE_STATS[trainingType] ?? [];
  const coachStats = COACH_CATEGORY_STATS[coachCategory] ?? [];

  // Intersección: atributos que el tipo Y el entrenador pueden entrenar
  const intersection = typeStats.filter(s => coachStats.includes(s));
  const pool = intersection.length > 0 ? intersection : typeStats;

  if (pool.length === 0) {
    // Fallback: usar stats del entrenador
    const fallback = coachStats.length > 0 ? coachStats : ['organization'];
    return fallback[Math.floor(rand * fallback.length)];
  }
  return pool[Math.floor(rand * pool.length)];
}

// ─── Jugadas Entrenadas FDF ───────────────────────────────────────────────────
export interface TrainedPlayState {
  level: number;       // 1–15
  progress: number;    // turnos invertidos en el nivel actual
  status: 'developing' | 'trainable' | 'maxed';
}

/**
 * Avanza el progreso de una jugada entrenada un turno.
 * Devuelve el nuevo estado.
 */
export function advanceTrainedPlay(play: TrainedPlayState, coachLevel: number, rand: number): TrainedPlayState {
  if (play.status === 'maxed') return play;

  const turnsNeeded = play.status === 'developing' ? PLAY_DEVELOP_TURNS : PLAY_TRAIN_TURNS;
  // Probabilidad de avanzar basada en nivel del entrenador
  const progressChance = clamp(30 + coachLevel * 5, 10, 90);
  if (rand * 100 >= progressChance) return play; // sin progreso este turno

  const newProgress = play.progress + 1;
  if (newProgress >= turnsNeeded) {
    const newLevel = play.level + 1;
    if (newLevel >= PLAY_MAX_LEVEL) {
      return { level: PLAY_MAX_LEVEL, progress: 0, status: 'maxed' };
    }
    return { level: newLevel, progress: 0, status: 'trainable' };
  }
  return { ...play, progress: newProgress };
}

/**
 * Resultado de aplicar un turno de entrenamiento a un jugador.
 */
export interface TrainingResult {
  playerId: number;
  improved: boolean;
  statImproved?: string;
  newFitness: number;
  isRehab: boolean;
}

/**
 * Aplica un turno de entrenamiento a un jugador. Función pura, testeable.
 */
export function applyTrainingTurn(
  player: {
    id: number;
    age: number;
    talent: number;
    fitness: number;
    isInjured: boolean;
    [stat: string]: unknown;
  },
  trainingType: TrainingType,
  coachLevel: number,
  rand1: number, // para decidir si mejora
  rand2: number, // para seleccionar stat
  rand3: number = 0.5, // para el target de forma (nextPlayerForm)
  coachCategory: string = '',
): TrainingResult {
  const isRehab = trainingType === 'rehabilitación';
  const newFitness = player.isInjured && !isRehab
    ? clamp(player.fitness, 0, 100)
    : nextPlayerForm(player.fitness, !isRehab, isRehab, rand3);

  if (isRehab) {
    return { playerId: player.id, improved: false, newFitness, isRehab: true };
  }

  const penalty = trainingPenalty(player.fitness, player.isInjured);
  const effectiveChance = trainingChance(coachLevel, player.age, player.talent) * penalty;
  const improved = rand1 * 100 < effectiveChance;

  if (!improved) {
    return { playerId: player.id, improved: false, newFitness, isRehab: false };
  }

  const stat = selectStatToImprove(trainingType, coachCategory, rand2);
  return { playerId: player.id, improved: true, statImproved: stat, newFitness, isRehab: false };
}

// ─── Finanzas mensuales ────────────────────────────────────────────────────────
const MATCHES_PER_MONTH = 2;

export interface ClubFinanceInput {
  stadiumCapacity: number;
  fans: number;
  socialMass?: number;       // masa social FDF (default: 10000)
  highClass?: number;        // aficionados de alta clase (default: 500)
  reputation: number;        // 0–100
  countryLevel: number;      // 1–3
  ticketPriceLevel: string;  // low | medium | high
  valuation?: number;        // valoración calculada del club (default: derivada)
}

// ─── Valoración del club ──────────────────────────────────────────────────────

/**
 * Valoración del club en unidades FDF.
 * Integra: masa social, nivel competitivo (reputación/10), país y clase alta.
 */
export function clubValuation(
  socialMass: number,
  highClass: number,
  countryLevel: number,
  reputation: number,
): number {
  const competitionLevel = clamp(reputation / 10, 0, 10);
  return Math.round(
    socialMass * 6 +
    competitionLevel * 15 +
    countryLevel * 5 +
    highClass * 4 +
    100
  );
}

// ─── Ingresos por taquilla ────────────────────────────────────────────────────

/**
 * Ingreso mensual por taquilla.
 * Precios: 5/10/15 x nivel país, -5/división.
 * Asistencia = masa/5*2 con -25%/-50% por precio.
 */
/**
 * Asistencia por partido según la MISMA fórmula que la taquilla (gateIncome):
 * masa social /5*2, penalización por precio, tope de aforo. Es la fuente única
 * que consume tanto la economía como el motor (attendancePct del /simulate).
 */
export function gateAttendance(c: ClubFinanceInput): { attendance: number; pct: number } {
  const pricePenalty = c.ticketPriceLevel === 'medium' ? 0.25 : c.ticketPriceLevel === 'high' ? 0.50 : 0;
  const socialMass = c.socialMass ?? 10000;
  let attendance = Math.round((socialMass / 5) * 2 * (1 - pricePenalty));
  attendance = Math.min(attendance, c.stadiumCapacity);
  const pct = c.stadiumCapacity > 0 ? Math.round((attendance / c.stadiumCapacity) * 100) : 75;
  return { attendance, pct: clamp(pct, 0, 100) };
}

export function gateIncome(c: ClubFinanceInput): number {
  // c.countryLevel es 1, 2 o 3. ticketPriceLevel es low, medium, high.
  // c.reputation / 10 nos da aproximadamente la división o el nivel competitivo.
  const tier = c.reputation > 80 ? 1 : (c.reputation > 50 ? 2 : 3);

  let basePriceMultiplier = 5;

  if (c.ticketPriceLevel === 'medium') {
    basePriceMultiplier = 10;
  } else if (c.ticketPriceLevel === 'high') {
    basePriceMultiplier = 15;
  }

  // Precio base según nivel país y división
  const divisionPenalty = (tier - 1) * 5;
  const basePrice = Math.max(1, (basePriceMultiplier * c.countryLevel) - divisionPenalty);

  // Asistencia: fuente única compartida con el motor (gateAttendance)
  const massAttend = gateAttendance(c).attendance;
  const massRevenue = massAttend * basePrice;
  
  // Asumiendo que juegan 2 partidos en casa por mes
  return Math.round(massRevenue * MATCHES_PER_MONTH);
}

// ─── Ingresos comerciales ─────────────────────────────────────────────────────

export interface CommercialBreakdown {
  tv: number;
  sponsorship: number;
  merch: number;
  total: number;
}

/**
 * Desglose mensual de ingresos comerciales.
 * Derechos de imagen basados en valoración.
 * TV: 82/72/62%
 * vallas: 66/56/46%
 * merch: 48/38/28%
 */
export function commercialBreakdown(c: ClubFinanceInput, activeSponsorMonthlyIncome: number): CommercialBreakdown {
  const socialMass = c.socialMass ?? 10000;
  const valuation = c.valuation
    ?? clubValuation(socialMass, c.highClass ?? 500, c.countryLevel, c.reputation);
  
  // Porcentajes según nivel de país o club
  const tvPercent = c.countryLevel === 3 ? 0.82 : (c.countryLevel === 2 ? 0.72 : 0.62);
  const adsPercent = c.countryLevel === 3 ? 0.66 : (c.countryLevel === 2 ? 0.56 : 0.46);
  const merchPercent = c.countryLevel === 3 ? 0.48 : (c.countryLevel === 2 ? 0.38 : 0.28);

  // Valoración total influye en los ingresos
  const tv = Math.round(valuation * tvPercent * 10); // Escalado FDF
  const vallas = Math.round(valuation * adsPercent * 10);
  const merch = Math.round(valuation * merchPercent * 10);
  
  const sponsorship = activeSponsorMonthlyIncome + vallas; // Vallas es parte de sponsorship en backend actual
  return { tv, sponsorship, merch, total: tv + sponsorship + merch };
}

/** Ingreso mensual comercial (compatibilidad con callers anteriores sin sponsorship). */
export function commercialIncome(c: ClubFinanceInput): number {
  return commercialBreakdown(c, 0).total;
}

// ─── Costes de subcontrataciones ──────────────────────────────────────────────

export interface OutsourcingCosts {
  travel: number;
  maintenance: number;
  cleaning: number;
  security: number;
  food: number;
  medical: number;
  media: number;
  total: number;
}

const OUTSOURCING_BASE_COST: Record<string, number> = {
  travelAgency: 4000,
  maintenance:  3000,
  cleaning:     1500,
  security:     2500,
  food:         2000,
  medical:      5000,
  media:        3500,
  lawyers:      4500, // Servicio 8 (FDF)
};

export function outsourcingMonthlyCost(activeTypes: string[], countryLevel: number, stadiumCapacity: number = 0): OutsourcingCosts {
  const scale = 0.8 + countryLevel * 0.2;
  // FDF topes aforo 2k/5k/10k
  const stadiumScale = stadiumCapacity > 10000 ? 1.5 : (stadiumCapacity > 5000 ? 1.2 : (stadiumCapacity > 2000 ? 1.0 : 0.8));
  const finalScale = scale * stadiumScale;

  const costs = {
    travel:      activeTypes.includes('travelAgency') ? Math.round(OUTSOURCING_BASE_COST['travelAgency'] * finalScale) : 0,
    maintenance: activeTypes.includes('maintenance')  ? Math.round(OUTSOURCING_BASE_COST['maintenance']  * finalScale) : 0,
    cleaning:    activeTypes.includes('cleaning')     ? Math.round(OUTSOURCING_BASE_COST['cleaning']     * finalScale) : 0,
    security:    activeTypes.includes('security')     ? Math.round(OUTSOURCING_BASE_COST['security']     * finalScale) : 0,
    food:        activeTypes.includes('food')         ? Math.round(OUTSOURCING_BASE_COST['food']         * finalScale) : 0,
    medical:     activeTypes.includes('medical')      ? Math.round(OUTSOURCING_BASE_COST['medical']      * finalScale) : 0,
    media:       activeTypes.includes('media')        ? Math.round(OUTSOURCING_BASE_COST['media']        * finalScale) : 0,
    lawyers:     activeTypes.includes('lawyers')      ? Math.round(OUTSOURCING_BASE_COST['lawyers']      * finalScale) : 0,
  };
  const total = Object.values(costs).reduce((s, v) => s + v, 0);
  return { ...costs, total };
}

// ─── Contratos de patrocinio (SponsorContract) ────────────────────────────────

/** Ingreso mensual de un contrato (yearlyIncome / 12). */
export function sponsorMonthlyIncome(yearlyIncome: MoneyValue): number {
  return Math.round(moneyToNumber(yearlyIncome) / 12);
}

/**
 * Penalización por romper contrato anticipadamente: 50% del ingreso pendiente.
 * `monthsRemaining` ya contiene toda la duración restante; `contractYears` se
 * conserva en la firma por compatibilidad, pero no vuelve a multiplicar años.
 */
export function sponsorBreakPenalty(
  yearlyIncome: MoneyValue,
  monthsRemaining: number,
  contractYears = Math.ceil(Math.max(0, monthsRemaining) / 12),
): number {
  const boundedMonths = Math.min(
    Math.max(0, monthsRemaining),
    Math.max(0, contractYears) * 12,
  );
  const remainingIncome = Math.max(0, moneyToNumber(yearlyIncome)) / 12 * boundedMonths;
  return Math.round(Math.min(remainingIncome, remainingIncome * 0.5));
}

/** Próximo estado de reloj que se reclama de forma atómica antes de los pasos aditivos. */
export function nextTickClaim(state: { turn: number; inGameDate: Date }) {
  const nextDate = new Date(state.inGameDate);
  do {
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  } while (![0, 3, 5].includes(nextDate.getUTCDay()));
  return {
    turn: state.turn + 1,
    inGameDate: nextDate,
    prevInGameDate: new Date(state.inGameDate),
  };
}

export function shouldDecayMorale(inGameDate: Date): boolean {
  return ![4, 5].includes(inGameDate.getUTCMonth());
}

export function moraleDeltaForResult(result: 'win' | 'draw' | 'loss'): number {
  if (result === 'win') return 9;
  if (result === 'draw') return 5;
  return 4;
}

/** Cálculo de yearlyIncome de un contrato nuevo según tipo y tier. */
const SPONSOR_TYPE_PCT: Record<string, number> = { tv: 0.04, ads: 0.03, merch: 0.03 };
const SPONSOR_TIER_MULT: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4 };

export function calcSponsorYearlyIncome(valuation: number, type: string, tier: string): number {
  const base = (SPONSOR_TYPE_PCT[type] ?? 0.03) * valuation;
  return Math.round(base * (SPONSOR_TIER_MULT[tier] ?? 1.0));
}

// ─── Cláusula de rescisión ────────────────────────────────────────────────────

/**
 * Cláusula de rescisión FDF (manual §4.2): a MÁS años restantes, multiplicador
 * MENOR — >5 años ×200; 4–5 ×300; 3–4 ×400; 2–3 ×500; 0–2 ×600.
 * (La fórmula anterior estaba INVERTIDA: daba ×600 al recién renovado — A3.
 * Ahora coincide con legalReleaseClauseMultiplier de market.service.)
 */
export function rescissionClause(salary: number, _contractYears: number, yearsLeft: number): number {
  const mult = yearsLeft > 5 ? 200
    : yearsLeft > 4 ? 300
    : yearsLeft > 3 ? 400
    : yearsLeft > 2 ? 500
    : 600;
  return Math.round(salary * mult);
}

// ─── Tope salarial ────────────────────────────────────────────────────────────

/** Tope salarial mensual = 15% de caja / 12, permitiendo descontar gastos previstos (traspasos). */
export function salaryCap(clubBudget: number, expectedDiscount: number = 0): number {
  return Math.round(Math.max(0, clubBudget - expectedDiscount) * 0.15 / 12);
}

// ─── Salarios ────────────────────────────────────────────────────────────────

const sum = (a: number[]): number => a.reduce((s, v) => s + v, 0);

/** Gasto mensual en salarios (plantilla + cuerpo técnico). */
export function monthlySalaries(playerSalaries: number[], coachSalaries: number[]): number {
  return sum(playerSalaries) + sum(coachSalaries);
}

export type EliteLiquidityInput = {
  budget: MoneyValue;
  reputation: number;
};

/**
 * QA2: mantenimiento de elite sobre caja excedente.
 *
 * Los clubes con reputacion alta no pueden acumular cientos de millones sin
 * coste: primas, staff premium, agentes, instalaciones y presion social crecen
 * con la liquidez disponible. Es un gasto mensual progresivo y acotado.
 */
export function eliteLiquidityMaintenance(club: EliteLiquidityInput): number {
  const budget = Math.max(0, moneyToNumber(club.budget));
  const reputation = Math.max(0, Math.min(100, Math.round(Number(club.reputation) || 0)));
  const protectedReserve = 140_000_000 + reputation * 1_900_000;
  const excess = budget - protectedReserve;
  if (excess <= 0) return 0;

  const pressure = Math.max(0, Math.min(1, (reputation - 75) / 25));
  const monthlyRate = 0.018 + pressure * 0.014;
  return Math.round(Math.min(25_000_000, excess * monthlyRate));
}

/** Resultado mensual neto = ingresos − salarios − subcontrataciones. */
export function monthlyNet(
  c: ClubFinanceInput,
  playerSalaries: number[],
  coachSalaries: number[],
  activeSponsorMonthlyIncome = 0,
  outsourcingCost = 0,
): number {
  const income   = gateIncome(c) + commercialBreakdown(c, activeSponsorMonthlyIncome).total;
  const expenses = monthlySalaries(playerSalaries, coachSalaries) + outsourcingCost;
  return income - expenses;
}

/** Regla FDF: caja negativa el 1.er turno del mes ⇒ el manager pierde el 50% del prestigio. */
export function prestigeAfterRedMonth(prestige: number): number {
  return Math.max(0, Math.floor(prestige * 0.5));
}

/** ¿El turno cruza a un mes in-game nuevo? (= primer turno del mes). */
export function crossedIntoNewMonth(prev: Date, next: Date): boolean {
  return prev.getUTCMonth() !== next.getUTCMonth() || prev.getUTCFullYear() !== next.getUTCFullYear();
}

/** Clave estable por mes natural in-game (para idempotencia de finanzas mensuales). */
export function inGameMonthKey(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

// ─── Ventanas de fichajes ─────────────────────────────────────────────────────

/** Meses (1-based) con ventana de fichajes abierta: enero (1), julio (7), agosto (8). */
export const TRANSFER_WINDOW_MONTHS = new Set([1, 7, 8]);
/** Meses permitidos para cesiones: julio–diciembre (7-12). */
export const LOAN_WINDOW_MONTHS     = new Set([7, 8, 9, 10, 11, 12]);

/** ¿La fecha in-game permite fichajes definitivos? */
export function isTransferWindowOpen(inGameDate: Date): boolean {
  return TRANSFER_WINDOW_MONTHS.has(inGameDate.getUTCMonth() + 1);
}

/** ¿La fecha in-game permite cesiones? */
export function isLoanWindowOpen(inGameDate: Date): boolean {
  return LOAN_WINDOW_MONTHS.has(inGameDate.getUTCMonth() + 1);
}

/**
 * ¿El club puede operar en el mercado?
 * Bloqueo los primeros 7 días in-game tras crear la cuenta (accountCreatedAt real).
 */
export function canClubOperate(accountCreatedAt: Date, inGameDate: Date): boolean {
  const diffMs   = inGameDate.getTime() - accountCreatedAt.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 7;
}

// ─── Previsión financiera ─────────────────────────────────────────────────────

export interface MonthlyForecast {
  month: number;
  year: number;
  gate: number;
  commercial: number;
  salaries: number;
  outsourcing: number;
  sponsorships: number;
  net: number;
  budgetAfter: number;
}

/**
 * Genera previsión mensual para N meses desde la fecha in-game actual.
 * Los contratos de patrocinio se decrementan mes a mes.
 */
export function buildForecast(
  months: number,
  startDate: Date,
  startBudget: MoneyValue,
  financeInput: ClubFinanceInput,
  playerSalaries: number[],
  coachSalaries: number[],
  sponsorContracts: { yearlyIncome: MoneyValue; monthsRemaining: number }[],
  activeOutsourcingTypes: string[],
  stadiumCapacity: number = financeInput.stadiumCapacity ?? 0,
): MonthlyForecast[] {
  const result: MonthlyForecast[] = [];
  let budget    = moneyToNumber(startBudget);
  let contracts = sponsorContracts.map(sc => ({ ...sc }));

  for (let i = 0; i < months; i++) {
    const d = new Date(startDate);
    d.setUTCMonth(d.getUTCMonth() + i);
    const month = d.getUTCMonth() + 1;
    const year  = d.getUTCFullYear();

    const activeSponsor = contracts
      .filter(sc => sc.monthsRemaining > 0)
      .reduce((s, sc) => s + sponsorMonthlyIncome(sc.yearlyIncome), 0);

    const gate        = gateIncome(financeInput);
    const breakdown   = commercialBreakdown(financeInput, activeSponsor);
    const commercial  = breakdown.total;
    const salaries    = monthlySalaries(playerSalaries, coachSalaries);
    const outsourcing = outsourcingMonthlyCost(activeOutsourcingTypes, financeInput.countryLevel, stadiumCapacity).total;
    const net         = gate + commercial - salaries - outsourcing;

    budget += net;
    result.push({
      month, year, gate, commercial, salaries, outsourcing,
      sponsorships: activeSponsor, net, budgetAfter: Math.round(budget),
    });

    contracts = contracts.map(sc => ({ ...sc, monthsRemaining: Math.max(0, sc.monthsRemaining - 1) }));
  }
  return result;
}
