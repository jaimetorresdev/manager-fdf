// S9 (Claude, 5 jun): SOLO VISUALIZACIÓN. La fuente de verdad vive en el server
// (getExperiencePenalty en server/src/modules/simulation/engineClient.ts), que
// aplica esta penalización a construcción/destrucción en TODOS los partidos
// simulados (simulateGame). Mantener ambas tablas idénticas.
export function getExperiencePenalty(experience: number): number {
  if (experience >= 91) return 0;
  if (experience >= 81) return 1;
  if (experience >= 71) return 3;
  if (experience >= 61) return 4;
  if (experience >= 51) return 5;
  if (experience >= 41) return 7;
  if (experience >= 31) return 8;
  if (experience >= 21) return 9;
  return 12;
}

export function getPositionCategory(pos: string): 'POR' | 'DEF' | 'MED' | 'DEL' {
  if (pos === 'PO' || pos === 'POR') return 'POR';
  if (['LI', 'DFC', 'LD', 'DEF'].includes(pos)) return 'DEF';
  if (['MD', 'MI', 'PIV', 'MC', 'MCC', 'MCO', 'MCTT', 'MED'].includes(pos)) return 'MED';
  if (['EXT IZQ', 'EXT DERECHA', 'EXTI', 'EXTD', 'DC', 'DEL', 'S9', 'Falso 9'].includes(pos)) return 'DEL';
  return 'MED';
}

// Orden canónico FDF para ordenar listas de plantilla (pizarra táctica, etc.)
export const POSITION_ORDER: Record<string, number> = {
  PO: 0, POR: 0,
  LI: 1,
  DFC: 2,
  LD: 3,
  PIV: 4,
  MCC: 5, MC: 5,
  MCO: 6,
  MCTT: 7,
  MI: 8,
  MD: 9,
  EXTI: 10, 'EXT IZQ': 10,
  EXTD: 11, 'EXT DERECHA': 11,
  'S9': 12, 'Falso 9': 12,
  DC: 13, DEL: 13,
};

export function getPositionOrder(pos: string): number {
  return POSITION_ORDER[pos] ?? 99;
}

