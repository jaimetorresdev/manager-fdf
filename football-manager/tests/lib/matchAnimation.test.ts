import { describe, expect, it } from 'vitest';
import {
  buildMatchAnimationScript,
  frameAtTime,
  scoreAtEvent,
  zoneLaneToPoint,
} from '../../src/lib/matchAnimation';
import type { TimelineEntry } from '../../src/types/engine';

const timeline: TimelineEntry[] = [
  { minute: 1, phase: 'saque', team: 'home', zone: 'med', lane: 'center', text: 'Arranca' },
  { minute: 12, phase: 'remate', team: 'home', zone: 'area', lane: 'left', text: 'Remate de Cano', playerId: '10' },
  { minute: 13, phase: 'gol', team: 'home', zone: 'area', lane: 'left', text: 'Gol de Cano', playerId: '10', chain: [] },
  { minute: 80, phase: 'gol', team: 'away', zone: 'area', lane: 'right', text: 'Empate visitante', playerId: '9', chain: [] },
];

describe('matchAnimation', () => {
  it('convierte zone/lane en coordenadas deterministas', () => {
    expect(zoneLaneToPoint(timeline[1]!, 'seed', 1)).toEqual(zoneLaneToPoint(timeline[1]!, 'seed', 1));
    expect(zoneLaneToPoint(timeline[1]!, 'seed', 1)).not.toEqual(zoneLaneToPoint(timeline[1]!, 'other', 1));
  });

  it('genera frames, marcador vivo y marcas de gol', () => {
    const script = buildMatchAnimationScript(timeline, { seed: 42, targetDurationMs: 180000 });
    expect(script.frames).toHaveLength(4);
    expect(script.goalMarkers).toHaveLength(2);
    expect(script.goalMarkers[0]?.label).toContain('1-0');
    expect(script.frames[3]?.liveScore).toEqual({ home: 1, away: 1 });
    expect(script.durationMs).toBeGreaterThanOrEqual(180000);
  });

  it('hace scrub por tiempo sin salirse del guion', () => {
    const script = buildMatchAnimationScript(timeline, { seed: 42, targetDurationMs: 180000 });
    expect(frameAtTime(script, 0)?.index).toBe(0);
    expect(frameAtTime(script, script.durationMs + 999)?.index).toBe(3);
    expect(scoreAtEvent(timeline, 2)).toEqual({ home: 1, away: 0 });
  });
});
