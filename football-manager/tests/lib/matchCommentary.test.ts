import { describe, it, expect } from 'vitest';
import { commentaryFor, buildCommentary } from '../../src/lib/matchCommentary';
import type { TimelineEntry } from '../../src/types/engine';

const ctx = {
  homeName: 'Rojos FC', awayName: 'Azules CF',
  carrierName: 'Iniesta', defenderName: 'Casillas',
  homeGoals: 2, awayGoals: 1,
};

const gol: TimelineEntry = { minute: 70, phase: 'gol', team: 'home', zone: 'area', lane: 'left', text: 'Iniesta · gol' };
const parada: TimelineEntry = { minute: 55, phase: 'parada', team: 'away', zone: 'area', lane: 'center', text: 'paradón' };
const prog: TimelineEntry = { minute: 30, phase: 'progresion', team: 'home', zone: 'med', lane: 'right', text: 'conduce' };

describe('matchCommentary · commentaryFor', () => {
  it('es determinista: misma entrada → mismo texto', () => {
    const a = commentaryFor(gol, undefined, 3, ctx);
    const b = commentaryFor(gol, undefined, 3, ctx);
    expect(a?.text).toEqual(b?.text);
  });

  it('NO reescribe ni reutiliza step.text (es un campo aparte)', () => {
    for (const [s, i] of [[gol, 3], [parada, 4], [prog, 2]] as const) {
      const line = commentaryFor(s, undefined, i, ctx);
      expect(line).not.toBeNull();
      expect(line!.text.length).toBeGreaterThan(0);
      expect(line!.text).not.toEqual(s.text); // prosa distinta de la narración del motor
    }
  });

  it('no muta el evento de entrada (pureza: step.text intacto)', () => {
    const original = { ...gol };
    commentaryFor(gol, undefined, 3, ctx);
    expect(gol).toEqual(original);
  });

  it('el GOL menciona al goleador y el marcador', () => {
    const line = commentaryFor(gol, undefined, 3, ctx);
    expect(line?.tone).toBe('goal');
    expect(line?.text).toContain('Iniesta');
    expect(line?.text).toContain('2-1');
  });

  it('la PARADA menciona al portero', () => {
    const line = commentaryFor(parada, undefined, 4, ctx);
    expect(line?.tone).toBe('save');
    expect(line?.text).toContain('Casillas'); // el portero es el protagonista de la parada
  });

  it('cae a nombre de equipo si no hay portador', () => {
    const line = commentaryFor(prog, undefined, 2, { ...ctx, carrierName: null });
    expect(line?.text).toContain('Rojos FC');
  });

  it('buildCommentary cubre todo el timeline sin huecos', () => {
    const tl = [gol, parada, prog];
    const lines = buildCommentary(tl, () => ctx);
    expect(lines).toHaveLength(3);
    expect(lines.every(l => l.text.length > 0)).toBe(true);
  });

  it('step indefinido → null', () => {
    expect(commentaryFor(undefined, undefined, 0, ctx)).toBeNull();
  });
});
