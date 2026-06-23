// ─── WT1 · Tests de posiciones detalladas (npm test en el Mac de Jaime) ──────
import { describe, it, expect } from 'vitest';
import {
  DETAILED_POSITIONS, DETAILED_POSITION_CODES,
  deriveDetailedPosition, detailedOverall, generateSkillsFor,
  macroOf, labelOf, normalizeMacro, stableSide,
} from './detailedPositions';

describe('WT1 · catálogo de 15 posiciones', () => {
  it('hay exactamente 15 con label y dorsal en español', () => {
    expect(DETAILED_POSITION_CODES).toHaveLength(15);
    for (const code of DETAILED_POSITION_CODES) {
      const def = DETAILED_POSITIONS[code];
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.dorsal.length).toBeGreaterThan(0);
      expect(['POR', 'DEF', 'MED', 'DEL']).toContain(def.macro);
    }
  });

  it('el mapeo a macro es el del diseño (doc §1)', () => {
    expect(['LI', 'CT', 'LD'].map(macroOf)).toEqual(['DEF', 'DEF', 'DEF']);
    expect(['PIV', 'ORG', 'MCO', 'BOX', 'INTD', 'INTI', 'MP'].map(macroOf)).toEqual(Array(7).fill('MED'));
    expect(['EXTI', 'EXTD', 'DC', 'F9'].map(macroOf)).toEqual(Array(4).fill('DEL'));
    expect(macroOf('POR')).toBe('POR');
  });
});

describe('WT1 · derivación determinista (backfill)', () => {
  it('mapeo directo de strings legacy del seed', () => {
    expect(deriveDetailedPosition({ position: 'PO' })).toBe('POR');
    expect(deriveDetailedPosition({ position: 'DFC' })).toBe('CT');
    expect(deriveDetailedPosition({ position: 'EXT IZQ' })).toBe('EXTI');
    expect(deriveDetailedPosition({ position: 'MD' })).toBe('INTD');
    expect(deriveDetailedPosition({ position: 'MC' })).toBe('ORG');
  });

  it('macros derivan por perfil de atributos (reglas doc §1)', () => {
    // DEF destructor puro → CT; DEF con regate/pase → lateral del lado estable.
    expect(deriveDetailedPosition({ position: 'DEF', tackling: 85, organization: 70, passing: 60, dribbling: 40, squadNumber: 4 })).toBe('CT');
    expect(deriveDetailedPosition({ position: 'DEF', tackling: 70, passing: 72, dribbling: 75, unmarking: 60, organization: 50, squadNumber: 2 })).toBe('LD');
    // MED destructor → PIV.
    expect(deriveDetailedPosition({ position: 'MED', tackling: 85, organization: 75, passing: 65, dribbling: 40, shooting: 30, unmarking: 30, finishing: 20, squadNumber: 6 })).toBe('PIV');
    // DEL rematador puro → DC.
    expect(deriveDetailedPosition({ position: 'DEL', finishing: 90, unmarking: 80, shooting: 75, dribbling: 50, passing: 40, squadNumber: 9 })).toBe('DC');
  });

  it('es estable: mismos atributos ⇒ misma posición', () => {
    const p = { position: 'MED', passing: 77, organization: 74, tackling: 55, dribbling: 60, shooting: 50, unmarking: 58, finishing: 45, fouls: 50, squadNumber: 8 };
    expect(deriveDetailedPosition(p)).toBe(deriveDetailedPosition({ ...p }));
  });

  it('lado estable por paridad de squadNumber (fallback id)', () => {
    expect(stableSide({ squadNumber: 2 })).toBe('right');
    expect(stableSide({ squadNumber: 3 })).toBe('left');
    expect(stableSide({ squadNumber: null, id: 7 })).toBe('left');
  });
});

describe('WT1 · Media por posición (pesos 3+2)', () => {
  it('un DC matador puntúa más como DC que un DC romo', () => {
    const killer = { finishing: 90, unmarking: 85, shooting: 80, dribbling: 70, passing: 40, tackling: 20, organization: 20, fouls: 50, goalkeeping: 5 };
    const blunt = { ...killer, finishing: 55, unmarking: 50 };
    expect(detailedOverall('DC', killer)).toBeGreaterThan(detailedOverall('DC', blunt));
  });

  it('para POR manda la portería', () => {
    const gk = { goalkeeping: 88, passing: 40, tackling: 20, shooting: 10, organization: 50, unmarking: 20, finishing: 10, dribbling: 20, fouls: 30 };
    expect(detailedOverall('POR', gk)).toBe(88);
  });

  it('para POR combina portería y reflejos cuando ambos existen', () => {
    expect(detailedOverall('POR', { goalkeeping: 88, reflexes: 60 })).toBe(74);
  });

  it('la Media siempre queda acotada a [0,100]', () => {
    expect(detailedOverall('POR', { goalkeeping: 150, reflexes: 120 })).toBe(100);
    expect(detailedOverall('DC', { finishing: -50, unmarking: -20, shooting: -10, dribbling: -5 })).toBe(0);
  });

  it('posición desconocida devuelve 0 (el caller cae a la media macro)', () => {
    expect(detailedOverall('XX', { passing: 70 } as any)).toBe(0);
    expect(labelOf('XX')).toBeNull();
    expect(labelOf(null)).toBeNull();
  });
});

describe('WT1 · generación por pesos', () => {
  it('reparte más puntos en las habilidades clave (peso 3) que en las irrelevantes', () => {
    // rng fijo para que el test sea determinista.
    const sk = generateSkillsFor('CT', 70, () => 0.5);
    expect(sk.tackling).toBeGreaterThan(sk.dribbling);   // peso 3 vs —
    expect(sk.passing).toBeGreaterThan(sk.unmarking);    // peso 2 vs —
    expect(sk.goalkeeping).toBeLessThan(30);             // jugador de campo
  });

  it('el portero nace con portería alta y campo residual', () => {
    const sk = generateSkillsFor('POR', 70, () => 0.5);
    expect(sk.goalkeeping).toBeGreaterThan(60);
    expect(sk.finishing).toBeLessThan(sk.goalkeeping);
  });

  it('el portero genera reflejos con varianza propia, no como espejo de portería', () => {
    const sequence = [0.31, 0.17, 0.73, 0.29, 0.61, 0.43, 0.83, 0.11];
    let index = 0;
    const sk = generateSkillsFor('POR', 70, () => sequence[index++ % sequence.length]);

    expect(sk.reflexes).toBeGreaterThanOrEqual(5);
    expect(sk.reflexes).toBeLessThanOrEqual(95);
    expect(sk.reflexes).not.toBe(sk.goalkeeping);
  });
});

describe('WT1 · normalizeMacro', () => {
  it('normaliza strings históricos y modernos', () => {
    expect(normalizeMacro('PO')).toBe('POR');
    expect(normalizeMacro('EXT DERECHA')).toBe('DEL');
    expect(normalizeMacro('dfc')).toBe('DEF');
    expect(normalizeMacro(undefined)).toBe('MED');
  });
});
