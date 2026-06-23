import { describe, it, expect } from 'vitest';
import {
  macroOf,
  macroOfPlayer,
  analyzeSquadNeeds,
  isStarTarget,
  isEligibleTarget,
  plannedClause,
  buildOffer,
  weakestNonStarInMacro,
  chooseOfferForClub,
  chooseListingsForClub,
  planAiMarketPass,
  CLAUSE_MULT,
  UPGRADE_FACTOR,
  type AiClubView,
  type AiSquadPlayer,
  type AiTargetView,
} from './aiMarket.logic';
import { calcPlayerSalaryDemand } from '../../lib/playerValuation';

// ── Fixtures ──────────────────────────────────────────────────────────────────
function sq(position: string, n: number, base = 0, marketValue = 3_000_000): AiSquadPlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: base + i + 1,
    position,
    detailedPosition: null,
    marketValue,
    talent: 60,
    potential: 72,
    isForSale: false,
  }));
}

function makeSquad(por: number, def: number, med: number, del: number, mv = 3_000_000): AiSquadPlayer[] {
  return [
    ...sq('POR', por, 0, mv),
    ...sq('DEF', def, 100, mv),
    ...sq('MED', med, 200, mv),
    ...sq('DEL', del, 300, mv),
  ];
}

function club(over: Partial<AiClubView> = {}): AiClubView {
  return {
    id: 1,
    country: 'España',
    reputation: 60,
    budget: 50_000_000,
    usedSalaryMonthly: 120_000,
    squad: makeSquad(2, 3, 3, 2), // 10 jugadores, deficitario en todo
    ...over,
  };
}

function target(over: Partial<AiTargetView> = {}): AiTargetView {
  return {
    id: 5000,
    clubId: null,
    ownerIsHuman: false,
    nationality: 'España',
    country: 'España',
    position: 'DEF',
    detailedPosition: 'CT',
    age: 24,
    potential: 76,
    talent: 60,
    marketValue: 5_000_000,
    salary: 8_000,
    morale: 75,
    isForSale: false,
    loaned: false,
    lastTransferAt: null,
    lastTransferValue: null,
    passing: 66, tackling: 70, shooting: 55, organization: 68,
    unmarking: 60, finishing: 50, dribbling: 58, fouls: 50,
    goalkeeping: 40, reflexes: 40,
    ...over,
  };
}

const fixedRng = () => 0.5;

// ── macroOf ─────────────────────────────────────────────────────────────────
describe('aiMarket — macroOf', () => {
  it('mapea las macroposiciones FDF', () => {
    expect(macroOf('POR')).toBe('POR');
    expect(macroOf('DEF')).toBe('DEF');
    expect(macroOf('MED')).toBe('MED');
    expect(macroOf('DEL')).toBe('DEL');
  });
  it('mapea las 15 posiciones detalladas canónicas', () => {
    expect(macroOf('CT')).toBe('DEF');
    expect(macroOf('LD')).toBe('DEF');
    expect(macroOf('PIV')).toBe('MED');
    expect(macroOf('BOX')).toBe('MED');
    expect(macroOf('MCO')).toBe('MED');
    expect(macroOf('EXTD')).toBe('DEL');
    expect(macroOf('DC')).toBe('DEL');
    expect(macroOf('F9')).toBe('DEL');
  });
  it('mapea las etiquetas LEGACY de la BD', () => {
    expect(macroOf('PO')).toBe('POR');
    expect(macroOf('DFC')).toBe('DEF');
    expect(macroOf('MC')).toBe('MED');
    expect(macroOf('MD')).toBe('MED');
    expect(macroOf('MI')).toBe('MED');
    expect(macroOf('EXT DERECHA')).toBe('DEL');
    expect(macroOf('EXT IZQ')).toBe('DEL');
  });
  it('macroOfPlayer prioriza detailedPosition sobre la legacy', () => {
    expect(macroOfPlayer({ position: 'MED', detailedPosition: 'DC' })).toBe('DEL');
    expect(macroOfPlayer({ position: 'DFC', detailedPosition: null })).toBe('DEF');
  });
});

// ── analyzeSquadNeeds ─────────────────────────────────────────────────────────
describe('aiMarket — analyzeSquadNeeds', () => {
  it('una plantilla vacía necesita las 4 posiciones', () => {
    const n = analyzeSquadNeeds([]);
    expect(n.total).toBe(0);
    expect(n.needed.sort()).toEqual(['DEF', 'DEL', 'MED', 'POR']);
  });
  it('una plantilla ideal (3/8/8/5) no necesita nada', () => {
    const n = analyzeSquadNeeds(makeSquad(3, 8, 8, 5));
    expect(n.total).toBe(24);
    expect(n.needed).toEqual([]);
  });
  it('prioriza la posición con mayor déficit', () => {
    const n = analyzeSquadNeeds(makeSquad(3, 1, 8, 5));
    expect(n.needed[0]).toBe('DEF');
  });
});

// ── elegibilidad ───────────────────────────────────────────────────────────────
describe('aiMarket — elegibilidad de objetivos', () => {
  it('detecta estrellas (no las arrebata salvo listadas)', () => {
    expect(isStarTarget(target({ talent: 90 }))).toBe(true);
    expect(isStarTarget(target({ marketValue: 40_000_000 }))).toBe(true);
    expect(isStarTarget(target({ talent: 90, isForSale: true }))).toBe(false);
    expect(isStarTarget(target())).toBe(false);
  });
  it('rechaza cedidos, 33+, moral baja y estrellas', () => {
    expect(isEligibleTarget(target())).toBe(true);
    expect(isEligibleTarget(target({ loaned: true }))).toBe(false);
    expect(isEligibleTarget(target({ age: 33 }))).toBe(false);
    expect(isEligibleTarget(target({ morale: 5 }))).toBe(false);
    expect(isEligibleTarget(target({ potential: 90 }))).toBe(false);
  });
});

// ── términos de la oferta ──────────────────────────────────────────────────────
describe('aiMarket — términos de la oferta (FDF §4.2/§4.3)', () => {
  it('la cláusula queda dentro del límite legal por años', () => {
    expect(plannedClause(20_000, 3)).toBeLessThanOrEqual(20_000 * CLAUSE_MULT[3]);
  });

  it('buildOffer genera términos que pasan las llaves de evaluateOffer', () => {
    const c = club();
    const t = target();
    const offer = buildOffer(c, t, fixedRng, 2026);
    expect(offer).not.toBeNull();
    if (!offer) return;
    const demand = calcPlayerSalaryDemand(t, { clubReputation: c.reputation });
    expect(offer.salary).toBeGreaterThanOrEqual(demand);
    expect(offer.releaseClause).toBeLessThanOrEqual(offer.salary * CLAUSE_MULT[offer.contractYears]);
    expect(offer.contractYears).toBeGreaterThanOrEqual(1);
    expect(offer.contractYears).toBeLessThanOrEqual(5);
    expect(offer.amount).toBe(0); // agente libre
    expect(offer.sellerClubId).toBeNull();
  });

  it('respeta la anti-reventa: supera el último traspaso si llegó hace ≤1 año', () => {
    const c = club({ budget: 80_000_000 });
    const t = target({
      clubId: 99, marketValue: 6_000_000,
      lastTransferAt: new Date(Date.UTC(2025, 6, 1)), lastTransferValue: 9_000_000,
    });
    const offer = buildOffer(c, t, () => 0, 2026);
    expect(offer).not.toBeNull();
    if (offer) expect(offer.amount).toBeGreaterThan(9_000_000);
  });

  it('no oferta si el importe supera el límite de gasto', () => {
    const c = club({ budget: 3_000_000 });
    expect(buildOffer(c, target({ clubId: 99, marketValue: 5_000_000 }), fixedRng, 2026)).toBeNull();
  });

  it('no oferta si rompe el tope salarial', () => {
    expect(buildOffer(club({ usedSalaryMonthly: 100_000_000 }), target(), fixedRng, 2026)).toBeNull();
  });
});

// ── jugador más débil ──────────────────────────────────────────────────────────
describe('aiMarket — weakestNonStarInMacro', () => {
  it('devuelve el de menor valor de la macro, ignorando estrellas y listados', () => {
    const squad: AiSquadPlayer[] = [
      { id: 1, position: 'DEF', detailedPosition: 'CT', marketValue: 8_000_000, talent: 60, potential: 70, isForSale: false },
      { id: 2, position: 'DEF', detailedPosition: 'CT', marketValue: 2_000_000, talent: 60, potential: 70, isForSale: false },
      { id: 3, position: 'DEF', detailedPosition: 'CT', marketValue: 1_000_000, talent: 90, potential: 95, isForSale: false }, // estrella
      { id: 4, position: 'DEF', detailedPosition: 'CT', marketValue: 500_000, talent: 60, potential: 70, isForSale: true }, // listado
    ];
    const c = club({ squad });
    expect(weakestNonStarInMacro(c, 'DEF')?.id).toBe(2);
    expect(weakestNonStarInMacro(c, 'DEL')).toBeNull();
  });
});

// ── decisión por club ──────────────────────────────────────────────────────────
describe('aiMarket — chooseOfferForClub', () => {
  it('un club deficitario ficha por HUECO sin desplazar a nadie', () => {
    const d = chooseOfferForClub(club(), [target()], () => 0.1, {
      inGameYear: 2026, actProb: 1, usedPlayerIds: new Set(),
    });
    expect(d).not.toBeNull();
    expect(d?.displacedPlayerId).toBeNull();
  });

  it('un club lleno ficha un UPGRADE y desplaza a su más débil', () => {
    // plantilla ideal (24) con jugadores de 3M; objetivo DEF de 5M = upgrade.
    const c = club({ squad: makeSquad(3, 8, 8, 5, 3_000_000) });
    const d = chooseOfferForClub(c, [target({ marketValue: 5_000_000 })], () => 0.1, {
      inGameYear: 2026, actProb: 1, usedPlayerIds: new Set(),
    });
    expect(d).not.toBeNull();
    expect(d?.displacedPlayerId).not.toBeNull();
  });

  it('un club lleno SIN upgrade disponible no ficha', () => {
    // plantilla cara (8M) y objetivo barato (5M < 8M×factor) → ni hueco ni upgrade.
    const c = club({ squad: makeSquad(3, 8, 8, 5, 8_000_000) });
    expect(8_000_000 * UPGRADE_FACTOR).toBeGreaterThan(5_000_000);
    const d = chooseOfferForClub(c, [target({ marketValue: 5_000_000 })], () => 0.1, {
      inGameYear: 2026, actProb: 1, usedPlayerIds: new Set(),
    });
    expect(d).toBeNull();
  });

  it('no actúa con caja insuficiente', () => {
    expect(chooseOfferForClub(club({ budget: 1_000_000 }), [target()], () => 0.1, {
      inGameYear: 2026, actProb: 1, usedPlayerIds: new Set(),
    })).toBeNull();
  });

  it('no puja por un jugador ya usado este pase', () => {
    expect(chooseOfferForClub(club(), [target()], () => 0.1, {
      inGameYear: 2026, actProb: 1, usedPlayerIds: new Set([target().id]),
    })).toBeNull();
  });
});

// ── venta de excedente ─────────────────────────────────────────────────────────
describe('aiMarket — chooseListingsForClub', () => {
  it('un club con excedente lista a su jugador de menor valor', () => {
    const c = club({ squad: makeSquad(3, 12, 8, 5) });
    expect(chooseListingsForClub(c, () => 0, 1).length).toBe(1);
  });
  it('un club sin excedente no lista a nadie', () => {
    expect(chooseListingsForClub(club({ squad: makeSquad(3, 8, 8, 5) }), () => 0, 1)).toEqual([]);
  });
});

// ── plan global ────────────────────────────────────────────────────────────────
describe('aiMarket — planAiMarketPass', () => {
  const clubs = [club({ id: 1 }), club({ id: 2 }), club({ id: 3 })];
  const pool = [
    target({ id: 5001 }),
    target({ id: 5002, position: 'MED', detailedPosition: 'MCO' }),
    target({ id: 5003, position: 'DEL', detailedPosition: 'DC' }),
  ];

  it('es determinista para los mismos inputs y semilla', () => {
    const a = planAiMarketPass(clubs, pool, { turn: 10, inGameYear: 2026, buyActProb: 1 });
    const b = planAiMarketPass(clubs, pool, { turn: 10, inGameYear: 2026, buyActProb: 1 });
    expect(a.offers).toEqual(b.offers);
    expect(a.listings).toEqual(b.listings);
  });

  it('genera ofertas para clubes con objetivos disponibles', () => {
    const plan = planAiMarketPass(clubs, pool, { turn: 10, inGameYear: 2026, buyActProb: 1 });
    expect(plan.offers.length).toBeGreaterThan(0);
    expect(plan.clubsActed).toBe(plan.offers.length);
  });

  it('no genera ofertas si buyActProb=0', () => {
    const plan = planAiMarketPass(clubs, pool, { turn: 10, inGameYear: 2026, buyActProb: 0, sellActProb: 0 });
    expect(plan.offers).toEqual([]);
  });

  it('no duplica oferta para un club con una pendiente', () => {
    const plan = planAiMarketPass(clubs, pool, {
      turn: 10, inGameYear: 2026, buyActProb: 1, existingOfferClubIds: new Set([1, 2, 3]),
    });
    expect(plan.offers).toEqual([]);
  });

  it('respeta el tope global de ofertas por pase', () => {
    const many = Array.from({ length: 50 }, (_, i) => club({ id: i + 1 }));
    const plan = planAiMarketPass(many, pool, { turn: 7, inGameYear: 2026, buyActProb: 1, maxOffers: 5 });
    expect(plan.offers.length).toBeLessThanOrEqual(5);
  });

  it('dos clubes no pujan por el mismo jugador en el mismo pase', () => {
    const plan = planAiMarketPass(clubs, [target({ id: 5001 })], { turn: 3, inGameYear: 2026, buyActProb: 1 });
    const ids = plan.offers.map((o) => o.playerId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
