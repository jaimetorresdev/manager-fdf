import { describe, expect, it } from 'vitest';
import { revealablePlayerAttributes } from './playerInspection';

describe('lupa de jugador', () => {
  it('revela únicamente habilidades que todavía no están en su máximo', () => {
    const revealed = revealablePlayerAttributes({
      age: 24,
      potential: 70,
      passing: 70,
      tackling: 69,
      shooting: 50,
      organization: 70,
      unmarking: 70,
      finishing: 70,
      dribbling: 70,
      fouls: 70,
      goalkeeping: 70,
      reflexes: 70,
    });
    expect(revealed).toEqual(['tackling', 'shooting']);
  });
});
