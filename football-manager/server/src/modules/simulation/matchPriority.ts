export type SimulationTier = 'A' | 'B' | 'C';

export type MatchPriorityInput = {
  homeHasHumanManager?: boolean | null;
  awayHasHumanManager?: boolean | null;
  competitionType?: string | null;
  competitionTier?: number | null;
  humanManagersCount?: number | null;
  activityScore?: number | null;
  isKnockout?: boolean | null;
  round?: string | null;
  isRivalry?: boolean | null;
  isPromotionOrTitleRace?: boolean | null;
  isFollowed?: boolean | null;
};

export type MatchPriorityResult = {
  score: number;
  tier: SimulationTier;
  hasTimeline: boolean;
  hasAdvancedStats: boolean;
  reasons: string[];
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeRound(round?: string | null): string {
  return String(round ?? '').toLowerCase().replace(/\s+/g, '_');
}

export function computeMatchPriority(input: MatchPriorityInput): MatchPriorityResult {
  const reasons: string[] = [];
  const homeHuman = input.homeHasHumanManager === true;
  const awayHuman = input.awayHasHumanManager === true;
  const anyHuman = homeHuman || awayHuman;
  const humanVsHuman = homeHuman && awayHuman;
  const competitionType = String(input.competitionType ?? '').toLowerCase();
  const round = normalizeRound(input.round);
  const tier = Math.max(1, input.competitionTier ?? 3);
  const humanManagersCount = Math.max(0, input.humanManagersCount ?? 0);
  const activityScore = Math.max(0, input.activityScore ?? 0);

  let score = 8;

  if (anyHuman) {
    score += 42;
    reasons.push('human_manager');
  }
  if (humanVsHuman) {
    score += 25;
    reasons.push('human_vs_human');
  }
  if (input.isKnockout || ['cup', 'supercup', 'league_phase', 'european'].includes(competitionType)) {
    score += 18;
    reasons.push('knockout_context');
  }
  if (round.includes('final')) {
    score += round === 'final' ? 28 : 20;
    reasons.push('decisive_round');
  }
  if (input.isPromotionOrTitleRace) {
    score += 24;
    reasons.push('table_pressure');
  }
  if (input.isRivalry) {
    score += 22;
    reasons.push('rivalry');
  }
  if (input.isFollowed) {
    score += 18;
    reasons.push('followed');
  }
  if (tier === 1) {
    score += 14;
    reasons.push('top_tier');
  } else if (tier === 2) {
    score += 8;
    reasons.push('second_tier');
  }

  score += Math.min(18, Math.floor(activityScore / 7));
  score += Math.min(10, humanManagersCount * 2);

  if (!anyHuman && tier >= 3 && humanManagersCount === 0) {
    score -= 18;
    reasons.push('low_human_activity');
  }

  const finalScore = clampScore(score);
  const simulationTier: SimulationTier = finalScore >= 70 || humanVsHuman
    ? 'A'
    : finalScore >= 35 || anyHuman || tier <= 2
      ? 'B'
      : 'C';

  return {
    score: finalScore,
    tier: simulationTier,
    hasTimeline: simulationTier !== 'C',
    hasAdvancedStats: simulationTier === 'A',
    reasons,
  };
}
