export interface StyleContinuityResult {
  continuity: number;
  confidencePenalty: number;
  changed: boolean;
}

function normalizedStyle(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function nextStyleContinuity(
  previousStyle: string | null | undefined,
  currentStyle: string | null | undefined,
  currentContinuity: number,
): StyleContinuityResult {
  const previous = normalizedStyle(previousStyle);
  const current = normalizedStyle(currentStyle);
  const continuity = Math.max(0, Math.min(4, Math.trunc(currentContinuity) || 0));

  if (!previous && !current) {
    return { continuity: 0, confidencePenalty: 0, changed: false };
  }
  if (previous === current) {
    return {
      continuity: Math.min(4, continuity + 1),
      confidencePenalty: 0,
      changed: false,
    };
  }
  return {
    continuity: 0,
    confidencePenalty: 4 - continuity,
    changed: true,
  };
}
