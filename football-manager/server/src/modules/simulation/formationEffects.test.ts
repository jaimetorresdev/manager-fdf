// ─── WT2/WT3 · Tests del catálogo de formaciones y sus efectos ────────────────
// (npm test en el Mac de Jaime; espejo de las garantías de pytest del motor)
import { describe, it, expect } from 'vitest';
import { FORMATIONS, findFormation, slotMacro } from '../tactics/formations.catalog';
import {
  applyDetailedPositionEffects, formationMatchupBonus,
  hasWingBacks, physicalDemandOf,
} from './formationEffects';
import type { EnginePlayer } from './engineClient';

describe('WT2 · integridad del catálogo', () => {
  it('hay 15 formaciones, todas con 11 slots y shape que suma 10', () => {
    expect(FORMATIONS).toHaveLength(15);
    for (const f of FORMATIONS) {
      expect(f.slots).toHaveLength(11);
      expect(f.shape.split('-').reduce((a, b) => a + Number(b), 0)).toBe(10);
      expect(slotMacro(f.slots[0])).toBe('POR');
      expect(f.physicalDemand).toBeGreaterThanOrEqual(1);
      expect(f.physicalDemand).toBeLessThanOrEqual(5);
      expect(f.strengths.length).toBeGreaterThan(0);
      expect(f.weaknesses.length).toBeGreaterThan(0);
    }
  });

  it('todos los counters referencian keys existentes del catálogo', () => {
    for (const f of FORMATIONS) {
      for (const key of [...f.counters.strongVs, ...f.counters.weakVs]) {
        expect(findFormation(key), `${f.key} → ${key}`).not.toBeNull();
      }
    }
  });

  it('se encuentra por key y por shape; los strings libres devuelven null', () => {
    expect(findFormation('wm-3-2-5')?.key).toBe('wm-3-2-5');
    expect(findFormation('3-2-5')?.key).toBe('wm-3-2-5');
    expect(findFormation('4-1-2-1-2')?.slots).toHaveLength(11);
    expect(findFormation('9-1')).toBeNull();
    expect(findFormation(null)).toBeNull();
  });

  it('el 4-2-3-1 es la navaja suiza: counters vacíos', () => {
    const f = findFormation('4-2-3-1')!;
    expect(f.counters.strongVs).toHaveLength(0);
    expect(f.counters.weakVs).toHaveLength(0);
  });
});

describe('WT3 · counters suaves por matchup', () => {
  it('3-5-2 domina al 4-4-2 (doc §3) y el bonus es simétrico y suave', () => {
    const m = formationMatchupBonus('3-5-2', '4-4-2')!;
    expect(m.home.attack).toBeGreaterThan(0);
    expect(m.away.attack).toBeLessThan(0);
    expect(m.home.attack).toBe(-m.away.attack);
    expect(Math.abs(m.home.attack)).toBeLessThanOrEqual(2.5);   // SUAVE
  });

  it('neutro: mismo sistema, fuera de catálogo o matchup sin dominancia', () => {
    expect(formationMatchupBonus('4-4-2', '4-4-2')).toBeNull();
    expect(formationMatchupBonus('9-9-9', '4-4-2')).toBeNull();
    expect(formationMatchupBonus('4-2-3-1', '4-4-2')).toBeNull();
  });
});

function mkXI(detailed: (string | null)[]): EnginePlayer[] {
  return detailed.map((d, i) => ({
    id: String(i + 1), name: `J${i + 1}`, isStarter: true,
    position: i === 0 ? 'POR' : i <= 4 ? 'DEF' : i <= 8 ? 'MED' : 'DEL',
    detailedPosition: d,
    passing: 60, tackling: 60, shooting: 60, organization: 60, unmarking: 60,
    finishing: 60, dribbling: 60, fouls: 60, goalkeeping: i === 0 ? 70 : 10,
    fitness: 100, muscularFitness: 100, mentalSharpness: 100, matchRhythm: 100,
    morale: 75, experience: 60,
  }));
}

describe('WT3 · penalización por jugar fuera de la posición detallada', () => {
  it('NEUTRO absoluto (mismo array) sin detailedPosition o sin catálogo', () => {
    const xi = mkXI(Array(11).fill(null));
    expect(applyDetailedPositionEffects(xi, '4-4-2')).toBe(xi);
    const xi2 = mkXI(['POR', 'CT', 'CT', 'CT', 'LD', 'INTD', 'ORG', 'BOX', 'INTI', 'DC', 'F9']);
    expect(applyDetailedPositionEffects(xi2, '9-1')).toBe(xi2);
  });

  it('un XI perfecto queda intacto bit a bit', () => {
    const xi = mkXI(['POR', 'LD', 'CT', 'CT', 'LI', 'INTD', 'ORG', 'BOX', 'INTI', 'DC', 'F9']);
    expect(applyDetailedPositionEffects(xi, '4-4-2')).toBe(xi);
  });

  it('un CT de lateral pierde ~6% en atributos de juego (faltas y portería intactas)', () => {
    // 4-4-2 pide LD CT CT LI: con 3 CT y 1 LD, un CT ocupa el hueco de LI.
    const xi = mkXI(['POR', 'CT', 'CT', 'CT', 'LD', 'INTD', 'ORG', 'BOX', 'INTI', 'DC', 'F9']);
    const adjusted = applyDetailedPositionEffects(xi, '4-4-2');
    const changed = adjusted.filter((p, i) => p !== xi[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0].detailedPosition).toBe('CT');
    expect(changed[0].passing).toBeCloseTo(60 * 0.94, 1);
    expect(changed[0].fouls).toBe(60);          // balón parado intacto
    expect(changed[0].goalkeeping).toBe(10);    // portería intacta
  });
});

describe('WT3 · demanda física → fatiga post-partido', () => {
  it('demanda del catálogo y neutro fuera de él', () => {
    expect(physicalDemandOf('3-4-3')).toBe(5);
    expect(physicalDemandOf('5-4-1')).toBe(2);
    expect(physicalDemandOf('4-4-2')).toBe(3);   // 3 = fórmula histórica exacta
    expect(physicalDemandOf('9-1')).toBeNull();
  });

  it('los carrileros existen donde el doc los pone', () => {
    expect(hasWingBacks('3-5-2')).toBe(true);
    expect(hasWingBacks('3-4-3')).toBe(true);
    expect(hasWingBacks('4-4-2')).toBe(false);
    expect(hasWingBacks('9-1')).toBe(false);
  });
});
