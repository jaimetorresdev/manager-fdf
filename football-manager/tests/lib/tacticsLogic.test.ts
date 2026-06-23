import { describe, expect, it } from 'vitest';
import {
  FORMATION_CATALOG,
  autoPlaceLineup,
  computeFormationCounter,
  computePhysicalDemand,
  defensiveReinforcementPoints,
  validateFormationLineup,
  type TacticPlayer,
} from '../../src/lib/tacticsLogic';

function player(id: number, detailedPosition: string, overall = 70): TacticPlayer {
  return {
    id,
    name: `J${id}`,
    position: detailedPosition === 'POR' ? 'POR' : detailedPosition === 'DC' || detailedPosition === 'F9' ? 'DEL' : ['LD', 'LI', 'CT'].includes(detailedPosition) ? 'DEF' : 'MED',
    detailedPosition,
    squadNumber: id,
    overall,
    fitness: 90,
    morale: 75,
    passing: overall,
    tackling: overall,
    shooting: overall,
    organization: overall,
    unmarking: overall,
    finishing: overall,
    dribbling: overall,
    fouls: overall,
    goalkeeping: detailedPosition === 'POR' ? overall : 10,
  };
}

describe('tacticsLogic', () => {
  it('expone las 15 formaciones y counters suaves', () => {
    expect(FORMATION_CATALOG).toHaveLength(15);
    const counter = computeFormationCounter('3-5-2', '4-4-2');
    expect(counter?.favored).toBe('home');
    expect(counter?.home.attack).toBe(2);
    expect(counter?.away.midfield).toBe(-1.5);
    expect(computeFormationCounter('4-2-3-1', '4-4-2')).toBeNull();
  });

  it('valida fuera de posicion con penalizaciones FDF 0/-10/-20', () => {
    const xi = ['POR', 'LD', 'CT', 'CT', 'CT', 'INTD', 'ORG', 'BOX', 'INTI', 'DC', 'F9']
      .map((pos, i) => player(i + 1, pos));
    const validation = validateFormationLineup(xi, '4-4-2');
    expect(validation.valid).toBe(true);
    expect(validation.outOfPositionCount).toBe(1);
    expect(validation.assignments.find((item) => item.slotIndex === 5)?.penalty).toBe(-10);
  });

  it('autocoloca por slots y deja portero fuera del campo', () => {
    const squad = [
      player(1, 'POR', 80),
      player(2, 'LD'),
      player(3, 'CT'),
      player(4, 'CT'),
      player(5, 'LI'),
      player(6, 'PIV'),
      player(7, 'ORG'),
      player(8, 'BOX'),
      player(9, 'EXTD'),
      player(10, 'DC'),
      player(11, 'EXTI'),
      player(12, 'POR', 99),
    ];
    const result = autoPlaceLineup(squad, '4-3-3');
    expect(result.xi).toHaveLength(11);
    expect(result.xi.filter((item) => item.assignedLine !== 'POR').some((item) => item.player?.id === 12)).toBe(false);
    expect(result.xi[0]?.player?.id).toBe(12);
    expect(result.bench.some((item) => item.id === 1)).toBe(true);
  });

  it('calcula demanda fisica y puntos de refuerzo defensivo', () => {
    expect(computePhysicalDemand('3-5-2').demand).toBe(5);
    expect(computePhysicalDemand('3-5-2').wingBackSlotIndexes).toEqual([5, 9]);
    expect(defensiveReinforcementPoints('5-4-1')).toBe(3);
    expect(defensiveReinforcementPoints('4-4-2')).toBe(2);
  });
});
