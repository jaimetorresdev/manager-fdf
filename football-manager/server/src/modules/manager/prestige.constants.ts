export const PRESTIGE_ACHIEVEMENT_POINTS: Record<string, number> = {
  UCL_WIN: 25,
  CHAMPIONS_LEAGUE_WIN: 25,
  EUROPEAN_TITLE: 22,
  LEAGUE_WIN: 18,
  TOP_LEAGUE_WIN: 20,
  CUP_WIN: 10,
  SUPERCUP_WIN: 7,
  PROMOTION: 8,
  EUROPE_QUALIFICATION: 5,
  DERBY_WIN: 2,
  UNBEATEN_5: 3,
  ACADEMY_DEBUT: 2,
  RELEGATION: -12,
  SACKED: -10,
  CUP_UPSET_LOSS: -6,
};

export const PRESTIGE_LIMITS = {
  achievementCap: 75,
  experienceCap: 15,
  wealthCap: 5,
  objectiveCap: 5,
  max: 100,
};
