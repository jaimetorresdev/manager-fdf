// ─── playerValuation.ts ─────────────────────────────────────────────────────
// Fórmula canónica de valor de mercado para el motor FDF.
// Inputs: habilidades ponderadas por posición + curva de edad + prima de potencial.
// Se llama en cada turno tras stepPlayerProgression y stepTrainings para que
// los valores siempre reflejen el estado actual del jugador.
//
// Fórmula:
//   baseVal   = 30_000 * exp(0.078 * posOvr)          [exponencial, tramo 0-99]
//   ageMult   = curva de edad (pico 25-27, jóvenes premium, veteranos depreciados)
//   potMult   = 1 + bonus de potencial (más peso cuanto más joven)
//   finalVal  = round5k( baseVal * ageMult * potMult )
//
// Rangos orientativos (posOvr):
//   50 → ~1.5M | 65 → ~4.7M | 75 → ~10M | 80 → ~15M | 90 → ~33M | 99 → ~67M
// ─────────────────────────────────────────────────────────────────────────────

// ── Pesos de habilidades por posición ────────────────────────────────────────
// Atributos disponibles en Player: passing, tackling, shooting, organization,
// unmarking, finishing, dribbling, fouls, goalkeeping (salidas), reflexes (reflejos)
// (speed/defending/physical son legacy y no se usan aquí)

type Attr = 'passing' | 'tackling' | 'shooting' | 'organization' |
            'unmarking' | 'finishing' | 'dribbling' | 'fouls' | 'goalkeeping' | 'reflexes';

const POS_WEIGHTS: Record<string, Partial<Record<Attr, number>>> = {
  // Portero: solo sus dos habilidades exclusivas (salidas + reflejos)
  PO:  { goalkeeping: 3, reflexes: 3 },
  POR: { goalkeeping: 3, reflexes: 3 },

  // Defensas centrales
  DFC: { tackling: 4, organization: 3, fouls: 1, unmarking: 1 },

  // Laterales
  LI:  { tackling: 3, passing: 3, organization: 2, dribbling: 1 },
  LD:  { tackling: 3, passing: 3, organization: 2, dribbling: 1 },

  // Pivote
  PIV: { tackling: 4, organization: 3, passing: 2 },

  // Mediocentros defensivos / caja-a-caja
  MCC: { tackling: 3, passing: 3, organization: 2, unmarking: 1 },
  MC:  { tackling: 3, passing: 3, organization: 2, unmarking: 1 },
  MCTT:{ tackling: 3, organization: 3, passing: 2, unmarking: 1 },

  // Mediocentro ofensivo
  MCO: { passing: 4, organization: 2, dribbling: 2, shooting: 1 },

  // Interiores
  MI:  { dribbling: 3, passing: 3, shooting: 2, unmarking: 1 },
  MD:  { dribbling: 3, passing: 3, shooting: 2, unmarking: 1 },

  // Extremos
  EXTI:         { dribbling: 4, finishing: 3, shooting: 2 },
  EXTD:         { dribbling: 4, finishing: 3, shooting: 2 },
  'EXT IZQ':    { dribbling: 4, finishing: 3, shooting: 2 },
  'EXT DERECHA':{ dribbling: 4, finishing: 3, shooting: 2 },

  // Delanteros
  'S9':     { finishing: 3, dribbling: 3, unmarking: 2, passing: 1 },
  'Falso 9':{ finishing: 3, dribbling: 3, unmarking: 2, passing: 1 },
  DC:  { finishing: 4, shooting: 3, unmarking: 2 },
  DEL: { finishing: 4, shooting: 3, unmarking: 2 },

  // Categorías genéricas (fallback cuando detailedPosition no está disponible)
  DEF: { tackling: 4, organization: 3, passing: 1, unmarking: 1 },
  MED: { passing: 3, tackling: 2, organization: 2, dribbling: 2 },
};

/** Promedio ponderado de habilidades según la posición del jugador (0-99). */
function positionOverall(player: PlayerAttrs, pos: string): number {
  const weights = POS_WEIGHTS[pos] ?? POS_WEIGHTS['MED']!;
  const entries = Object.entries(weights) as [Attr, number][];
  const totalWeight = entries.reduce((s, [, w]) => s + w, 0);
  const weightedSum = entries.reduce((s, [attr, w]) => s + (player[attr] ?? 50) * w, 0);
  // fouls es un atributo negativo: más faltas = peor defensor puro
  // pero en esta fórmula lo dejamos como positivo (agresividad táctica)
  return Math.round(weightedSum / totalWeight);
}

export function calcPlayerSportingOverall(player: PlayerAttrs): number {
  return positionOverall(player, player.detailedPosition ?? player.position);
}

// ── Curva de edad ─────────────────────────────────────────────────────────────
// Pico en 25-27. Jóvenes tienen prima por proyección; veteranos se deprecian.
function ageMultiplier(age: number): number {
  if (age <= 16) return 2.8;
  if (age === 17) return 2.5;
  if (age === 18) return 2.1;
  if (age === 19) return 1.8;
  if (age === 20) return 1.55;
  if (age === 21) return 1.35;
  if (age === 22) return 1.18;
  if (age === 23) return 1.08;
  if (age === 24) return 1.02;
  if (age <= 27) return 1.00;   // pico
  if (age === 28) return 0.94;
  if (age === 29) return 0.86;
  if (age === 30) return 0.75;
  if (age === 31) return 0.62;
  if (age === 32) return 0.50;
  if (age === 33) return 0.38;
  if (age === 34) return 0.27;
  return 0.16;                   // 35+
}

// ── Prima de potencial ────────────────────────────────────────────────────────
// Un jugador joven con mucho techo vale más que su OVR actual sugiere.
function potentialMultiplier(age: number, posOvr: number, potential: number): number {
  const ceiling = Math.max(0, potential - posOvr);   // cuánto puede crecer (0-99)
  const bonus   = ceiling / 100;                      // 0.0 – ~0.99
  if (age <= 20) return 1 + bonus * 1.5;
  if (age <= 23) return 1 + bonus * 0.9;
  if (age <= 26) return 1 + bonus * 0.4;
  if (age <= 30) return 1 + bonus * 0.15;
  return 1 + bonus * 0.05;
}

// ── Función principal ─────────────────────────────────────────────────────────
export interface PlayerAttrs {
  passing: number;
  tackling: number;
  shooting: number;
  organization: number;
  unmarking: number;
  finishing: number;
  dribbling: number;
  fouls: number;
  goalkeeping: number; // salidas
  reflexes?: number;   // reflejos (portero)
  age: number;
  potential: number;
  // Posición: se usa detailedPosition si existe, si no la categoría amplia
  position: string;
  detailedPosition?: string | null;
}

/** Redondea al múltiplo de 5.000 € más cercano (mínimo 100.000 €). */
function round5k(v: number): number {
  return Math.max(100_000, Math.round(v / 5_000) * 5_000);
}

function round100(v: number): number {
  return Math.max(500, Math.round(v / 100) * 100);
}

function clampFloat(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function calcPlayerMarketValue(player: PlayerAttrs): number {
  const posOvr = calcPlayerSportingOverall(player);
  const base   = 30_000 * Math.exp(0.078 * posOvr);
  const ageMul = ageMultiplier(player.age);
  const potMul = potentialMultiplier(player.age, posOvr, player.potential);
  return round5k(base * ageMul * potMul);
}

export interface PlayerSalaryDemandInput extends PlayerAttrs {
  marketValue?: number | null;
}

export interface PlayerSalaryDemandOptions {
  clubReputation?: number | null;
}

/**
 * Demanda salarial mensual realista (QA6).
 *
 * La liga FDF guarda salarios mensuales. Para que la economia no infle caja sin
 * coste, el salario objetivo se deriva del valor de mercado como porcentaje
 * anual: aprox. 3%-9.5% del valor segun overall, edad, potencial y reputacion
 * del club. Se aplica gradualmente en el tick con nextSalaryTowardsDemand().
 */
export function calcPlayerSalaryDemand(
  player: PlayerSalaryDemandInput,
  options: PlayerSalaryDemandOptions = {},
): number {
  const overall = calcPlayerSportingOverall(player);
  const marketValue = Math.max(100_000, Math.round(player.marketValue ?? calcPlayerMarketValue(player)));

  const quality = clampFloat((overall - 45) / 50, 0, 1);
  const elite = clampFloat((marketValue - 25_000_000) / 75_000_000, 0, 1);
  const potentialGap = clampFloat((player.potential - overall) / 35, 0, 1);
  const potentialPremium = player.age <= 23 ? potentialGap * 0.008 : player.age <= 26 ? potentialGap * 0.003 : 0;

  const baseAnnualRate = 0.030 + quality * 0.038 + elite * 0.014 + potentialPremium;
  const reputation = options.clubReputation ?? 50;
  const clubMultiplier = 1 + clampFloat((reputation - 70) / 30, 0, 1) * 0.16;
  const ageMultiplierForSalary = player.age <= 18 ? 0.82
    : player.age <= 21 ? 0.92
    : player.age <= 29 ? 1.00
    : player.age === 30 ? 0.96
    : player.age === 31 ? 0.90
    : player.age === 32 ? 0.82
    : player.age === 33 ? 0.72
    : player.age === 34 ? 0.60
    : 0.50;

  const annualRate = clampFloat(baseAnnualRate * ageMultiplierForSalary * clubMultiplier, 0.025, 0.095);
  const valueDrivenMonthly = (marketValue * annualRate) / 12;
  const sportingFloor = 800 + Math.pow(overall, 2) * 1.25 + (overall >= 82 ? Math.pow(overall - 81, 2) * 450 : 0);

  return round100(Math.min(1_250_000, Math.max(valueDrivenMonthly, sportingFloor)));
}

export function nextSalaryTowardsDemand(currentSalary: number, targetSalary: number): number {
  const current = round100(Math.max(500, currentSalary || 0));
  const target = round100(Math.max(500, targetSalary || 0));
  if (target <= current) return current;

  const raise = Math.min(
    target - current,
    Math.max(2_500, current * 0.35, target * 0.12),
  );
  return round100(current + raise);
}
