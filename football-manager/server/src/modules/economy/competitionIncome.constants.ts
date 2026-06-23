export type CompetitionPrizeTier = 'ucl' | 'uel' | 'uecl' | 'domestic_cup' | 'super_cup' | 'none';

export interface ContinentalPrizeTable {
  participation: number;
  leagueWin: number;
  leagueDraw: number;
  rounds: Record<string, number>;
}

export const COMPETITION_PRIZES: {
  ucl: ContinentalPrizeTable;
  uel: ContinentalPrizeTable;
  uecl: ContinentalPrizeTable;
  domesticCup: {
    rounds: Record<string, number>;
    defaultRound: number;
  };
  superCup: {
    participation: number;
    winnerBonus: number;
  };
} = {
  ucl: {
    participation: 18_600_000,
    leagueWin: 2_100_000,
    leagueDraw: 700_000,
    rounds: {
      playoff: 1_000_000,
      round_of_16: 11_000_000,
      quarter_final: 12_500_000,
      semi_final: 15_000_000,
      final: 18_500_000,
      champion: 25_000_000,
    },
  },
  uel: {
    participation: 9_300_000,
    leagueWin: 1_050_000,
    leagueDraw: 350_000,
    rounds: {
      playoff: 500_000,
      round_of_16: 5_500_000,
      quarter_final: 6_250_000,
      semi_final: 7_500_000,
      final: 9_250_000,
      champion: 12_500_000,
    },
  },
  uecl: {
    participation: 4_650_000,
    leagueWin: 525_000,
    leagueDraw: 175_000,
    rounds: {
      playoff: 250_000,
      round_of_16: 2_750_000,
      quarter_final: 3_125_000,
      semi_final: 3_750_000,
      final: 4_625_000,
      champion: 6_250_000,
    },
  },
  domesticCup: {
    defaultRound: 150_000,
    rounds: {
      round_1: 75_000,
      round_2: 100_000,
      round_3: 150_000,
      round_4: 250_000,
      round_of_32: 300_000,
      round_of_16: 500_000,
      quarter_final: 900_000,
      semi_final: 1_500_000,
      final: 2_500_000,
      champion: 3_500_000,
    },
  },
  superCup: {
    participation: 1_500_000,
    winnerBonus: 1_000_000,
  },
};

// AUDIT H-10 / 1.3: `gateIncome()` (game/tick.logic) devuelve la taquilla MENSUAL,
// asumiendo `MATCHES_PER_MONTH` partidos en casa. La taquilla de una eliminatoria de
// copa es de UN solo partido, así que hay que dividir el ingreso mensual entre el nº
// de partidos/mes. Se replica la constante de tick.logic (no exportada) para no
// invadir el territorio del módulo `game`.
export const GATE_MATCHES_PER_MONTH = 2;

/** Ingreso de taquilla de UN partido a partir del ingreso mensual (`gateIncome`). */
export function gatePerMatch(monthlyGate: number): number {
  return Math.round(monthlyGate / GATE_MATCHES_PER_MONTH);
}

export function competitionPrizeTier(input: {
  name: string;
  shortName: string;
  type: string;
  isContinental: boolean;
}): CompetitionPrizeTier {
  const text = `${input.name} ${input.shortName}`.toLowerCase();
  if (text.includes('champions') || text.includes('ucl')) return 'ucl';
  if (text.includes('europa league') || text.includes('uel')) return 'uel';
  if (text.includes('conference') || text.includes('uecl')) return 'uecl';
  if (text.includes('supercopa') || text.includes('super cup') || text.includes('supercup')) return 'super_cup';
  if (input.type === 'cup') return 'domestic_cup';
  if (input.isContinental) return 'uel';
  return 'none';
}
