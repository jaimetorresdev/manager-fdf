import { describe, expect, it } from 'vitest';
import { playbookProfileBonus } from './playbook.rules';

describe('playbookProfileBonus', () => {
  it('convierte niveles activos en un bonus acotado y determinista', () => {
    expect(playbookProfileBonus([
      { type: 'field_attack', level: 15, isActive: true, status: 'trainable' },
      { type: 'setpiece_attack', level: 10, isActive: true, status: 'maxed' },
      { type: 'field_defense', level: 5, isActive: true, status: 'trainable' },
    ])).toEqual({ attack: 4, defense: 1, midfield: 1.5 });
  });

  it('ignora jugadas inactivas o aún en desarrollo y limita datos corruptos', () => {
    expect(playbookProfileBonus([
      { type: 'attack', level: 99, isActive: false },
      { type: 'defense', level: 15, isActive: true, status: 'developing' },
      { type: 'freekick', level: 99, isActive: true, status: 'maxed' },
    ])).toEqual({ attack: 1, defense: 0, midfield: 0.5 });
  });

  it('prorratea el nivel por los ejecutores presentes en el XI', () => {
    expect(playbookProfileBonus([
      {
        type: 'field_attack',
        level: 15,
        isActive: true,
        status: 'maxed',
        executorPlayerIds: '[7,8,9]',
      },
    ], [7])).toEqual({ attack: 1, defense: 0, midfield: 0.5 });

    expect(playbookProfileBonus([
      {
        type: 'field_attack',
        level: 15,
        isActive: true,
        status: 'maxed',
        executorPlayerIds: '[7,8,9]',
      },
    ], [7, 8, 9])).toEqual({ attack: 3, defense: 0, midfield: 1.5 });
  });
});
