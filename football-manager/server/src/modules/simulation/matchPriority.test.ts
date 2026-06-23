import { describe, expect, it } from 'vitest';
import { computeMatchPriority } from './matchPriority';

describe('computeMatchPriority', () => {
  it('promotes human finals to tier A with advanced stats', () => {
    const result = computeMatchPriority({
      homeHasHumanManager: true,
      awayHasHumanManager: true,
      competitionType: 'cup',
      competitionTier: 1,
      isKnockout: true,
      round: 'final',
    });

    expect(result.tier).toBe('A');
    expect(result.hasTimeline).toBe(true);
    expect(result.hasAdvancedStats).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.reasons).toContain('human_vs_human');
  });

  it('keeps low-activity deep pyramid matches in tier C', () => {
    const result = computeMatchPriority({
      competitionType: 'league',
      competitionTier: 4,
      humanManagersCount: 0,
      activityScore: 0,
    });

    expect(result.tier).toBe('C');
    expect(result.hasTimeline).toBe(false);
    expect(result.hasAdvancedStats).toBe(false);
  });

  it('keeps second-tier active leagues watchable without full advanced stats', () => {
    const result = computeMatchPriority({
      competitionType: 'league',
      competitionTier: 2,
      humanManagersCount: 4,
      activityScore: 40,
    });

    expect(result.tier).toBe('B');
    expect(result.hasTimeline).toBe(true);
    expect(result.hasAdvancedStats).toBe(false);
  });
});
