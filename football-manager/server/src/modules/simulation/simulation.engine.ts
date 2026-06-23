// ─── Match Simulation Engine ──────────────────────────────────────────────────
// Runs entirely on the backend. Frontend never decides results.
// Inputs: two squads + tactics. Outputs: deterministic-ish match result.

export interface SquadStats {
  overall:      number;  // avg of starters
  defense:      number;
  attack:       number;
  midfield:     number;
  fitness:      number;  // 0-100
  morale:       number;  // 0-100
  experience:   number;  // 0-99
}

export interface TacticInput {
  formation:    string;  // "4-4-2", "4-3-3" etc
  construction: number;  // 0-100 (offensive pressure)
  destruction:  number;  // 0-100 (defensive pressure)
  homeAdvantage?: number; // Calculated from fans & stadium
  pressing?: number;
  marking?: 'zonal' | 'man' | 'mixed' | string;
  tempo?: number;
  width?: number;
  mentality?: 'defensive' | 'balanced' | 'attacking' | string | number;
  offensiveStyle?: string;
  defensiveStyle?: string;
  attackZones?: any;
  defenseReinforcement?: any;
  subsLogic?: any;
  // WT3 (aditivo): bonus/malus de perfil por counter de formaciones del
  // catálogo WT2. Lo calcula el server (formationEffects) y lo aplican ambos
  // motores. Ausente/0 = neutro absoluto.
  profileBonus?: { attack?: number; defense?: number; midfield?: number };
  penaltyTaker?: number;
  freeKickTaker?: number;
  cornerTaker?: number;
  setPieceTakers?: {
    corners?: number;
    freeKicks?: number;
    penalties?: number;
    captain?: number;
  };
}

export interface MatchStats {
  possession:    number;
  shots:         number;
  shotsOnTarget: number;
  corners:       number;
  fouls:         number;
  yellowCards:   number;
  redCards:      number;
}

export interface MatchEventResult {
  minute:      number;
  type:        'goal' | 'yellow' | 'red' | 'save' | 'corner' | 'foul' | 'injury' | 'substitution' | 'penalty' | string;
  team:        'home' | 'away';
  description: string;
  playerId?:   number;
  playerName?: string;
  assistPlayerId?: number;
  assistName?: string;
}

export interface SimulationResult {
  homeGoals:  number;
  awayGoals:  number;
  homeStats:  MatchStats;
  awayStats:  MatchStats;
  events:     MatchEventResult[];
  motm:       string;
  homeRatings?: any[];
  awayRatings?: any[];
  timeline?:  any[];
  injuries?:  any[];
  substitutions?: any[];
  tacticalChanges?: any[];
  replay?: any[];
}

/** Bonus de localía cuando la táctica no define homeAdvantage */
const HOME_ADVANTAGE = 3;

// Formation modifiers: [attackBonus, defenseBonus]
const FORMATION_MODIFIERS: Record<string, [number, number]> = {
  '4-4-2':   [0,  0],
  '4-3-3':   [8, -5],
  '4-2-3-1': [4,  2],
  '3-5-2':   [2,  0],
  '5-3-2':   [-3, 8],
  '5-4-1':   [-6, 12],
  '3-2-3-2': [6, -4],
  '4-5-1':   [-4, 6],
};

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function rng(seed: number): () => number {
  // Simple seeded PRNG (xorshift32) — not truly seeded per match, but deterministic enough
  let s = seed ^ 0xdeadbeef;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Calculate effective attack and defense power for a team */
function getEffectiveStrength(s: SquadStats, t: TacticInput, isHome: boolean): SquadStats {
  const [fAtt, fDef] = FORMATION_MODIFIERS[t.formation] ?? [0, 0];
  const fitMult      = s.fitness >= 70 ? 1 : 0.7 + (s.fitness / 70) * 0.3;
  const moraleFactor = (s.morale - 50) / 100;

  // Usa homeAdvantage de la táctica si existe, sino el default HOME_ADVANTAGE
  const homeAdv = isHome ? (t.homeAdvantage ?? HOME_ADVANTAGE) : 0;

  const baseAtt = s.attack + fAtt + (t.construction / 10) + (moraleFactor * 5);
  const baseDef = s.defense + fDef + (t.destruction / 10) + (moraleFactor * 3);
  const baseMid = s.midfield + (moraleFactor * 4);

  return {
    overall:    s.overall,
    attack:     clamp(clamp(baseAtt) * fitMult + homeAdv),
    defense:    clamp(clamp(baseDef) * fitMult + homeAdv / 2),
    midfield:   clamp(clamp(baseMid) * fitMult),
    fitness:    s.fitness,
    morale:     s.morale,
    experience: s.experience,
  };
}

function generateGoalDescription(team: 'home' | 'away', playerNames: string[], r: () => number): string {
  const player = playerNames[Math.floor(r() * playerNames.length)] ?? 'Jugador desconocido';
  const types = [
    `⚽ Gol de ${player}`,
    `⚽ ${player} anota`,
    `⚽ ${player} de cabeza`,
    `⚽ Remate de ${player}`,
    `⚽ ${player} de penalti`,
  ];
  return types[Math.floor(r() * types.length)];
}

export function simulateMatch(
  homeSquad: SquadStats,
  awaySquad: SquadStats,
  homeTactic: TacticInput,
  awayTactic: TacticInput,
  homePlayerNames: string[],
  awayPlayerNames: string[],
  seed: number,
): SimulationResult {
  if (!Number.isFinite(seed)) {
    throw new Error('simulateMatch requiere una semilla numérica determinista');
  }
  const r = rng(seed);

  const homePower = getEffectiveStrength(homeSquad, homeTactic, true);
  const awayPower = getEffectiveStrength(awaySquad, awayTactic, false);

  // Expected goals model (rough Poisson-like approach)
  const attackRatio  = homePower.attack / (homePower.attack + awayPower.defense + 1);
  const defenseRatio = awayPower.attack / (awayPower.attack + homePower.defense + 1);

  const homeExpected = clamp(attackRatio * 4, 0, 6);   // max 6 expected goals
  const awayExpected = clamp(defenseRatio * 3.5, 0, 6);

  // Simulate goals via "shot opportunities"
  let homeGoals = 0;
  let awayGoals = 0;
  const events: MatchEventResult[] = [];

  const homeShots = Math.round(homeExpected * 3 + r() * 4);
  const awayShots = Math.round(awayExpected * 3 + r() * 4);

  const homeShotAccuracy = clamp(0.35 + (homeSquad.attack / 200));
  const awayShotAccuracy = clamp(0.35 + (awaySquad.attack / 200));

  const homeShotsOnTarget = Math.round(homeShots * homeShotAccuracy);
  const awayShotsOnTarget = Math.round(awayShots * awayShotAccuracy);

  // Generate goal minutes
  for (let i = 0; i < homeShotsOnTarget; i++) {
    if (r() < homeExpected / homeShotsOnTarget) {
      homeGoals++;
      const minute = Math.floor(r() * 90) + 1;
      events.push({
        minute,
        type:        'goal',
        team:        'home',
        description: generateGoalDescription('home', homePlayerNames, r),
        playerName:  homePlayerNames[Math.floor(r() * homePlayerNames.length)],
      });
    }
  }

  for (let i = 0; i < awayShotsOnTarget; i++) {
    if (r() < awayExpected / (awayShotsOnTarget || 1)) {
      awayGoals++;
      const minute = Math.floor(r() * 90) + 1;
      events.push({
        minute,
        type:        'goal',
        team:        'away',
        description: generateGoalDescription('away', awayPlayerNames, r),
        playerName:  awayPlayerNames[Math.floor(r() * awayPlayerNames.length)],
      });
    }
  }

  // Yellow cards
  const homeYellows = Math.floor(r() * 3);
  const awayYellows = Math.floor(r() * 3);
  for (let i = 0; i < homeYellows; i++) {
    const player = homePlayerNames[Math.floor(r() * homePlayerNames.length)] ?? 'Jugador';
    events.push({ minute: Math.floor(r() * 90) + 1, type: 'yellow', team: 'home', description: `🟨 Amarilla a ${player}`, playerName: player });
  }
  for (let i = 0; i < awayYellows; i++) {
    const player = awayPlayerNames[Math.floor(r() * awayPlayerNames.length)] ?? 'Jugador';
    events.push({ minute: Math.floor(r() * 90) + 1, type: 'yellow', team: 'away', description: `🟨 Amarilla a ${player}`, playerName: player });
  }

  // Red card (rare: ~8% chance)
  if (r() < 0.08) {
    const team    = r() < 0.5 ? 'home' : 'away';
    const players = team === 'home' ? homePlayerNames : awayPlayerNames;
    const player  = players[Math.floor(r() * players.length)] ?? 'Jugador';
    events.push({ minute: Math.floor(r() * 70) + 20, type: 'red', team, description: `🟥 Expulsado ${player}`, playerName: player });
  }

  // Sort events by minute
  events.sort((a, b) => a.minute - b.minute);

  // Possession: weighted by midfield + construction
  const homeMidStrength = homePower.attack * 0.6 + homeSquad.midfield * 0.4;
  const awayMidStrength = awayPower.attack * 0.6 + awaySquad.midfield * 0.4;
  const totalMid        = homeMidStrength + awayMidStrength || 1;
  const homePossession  = Math.round(clamp((homeMidStrength / totalMid) * 100, 30, 70));

  const homeStats: MatchStats = {
    possession:    homePossession,
    shots:         homeShots,
    shotsOnTarget: homeShotsOnTarget,
    corners:       Math.floor(r() * 8) + 2,
    fouls:         Math.floor(r() * 12) + 4,
    yellowCards:   homeYellows,
    redCards:      events.filter(e => e.type === 'red' && e.team === 'home').length,
  };

  const awayStats: MatchStats = {
    possession:    100 - homePossession,
    shots:         awayShots,
    shotsOnTarget: awayShotsOnTarget,
    corners:       Math.floor(r() * 7) + 1,
    fouls:         Math.floor(r() * 12) + 4,
    yellowCards:   awayYellows,
    redCards:      events.filter(e => e.type === 'red' && e.team === 'away').length,
  };

  // Man of the match: pick from goal scorers, or best player overall
  const goalScorers = events.filter(e => e.type === 'goal' && e.playerName).map(e => e.playerName!);
  const motm = goalScorers.length > 0
    ? goalScorers[Math.floor(r() * goalScorers.length)]
    : [...homePlayerNames, ...awayPlayerNames][Math.floor(r() * (homePlayerNames.length + awayPlayerNames.length))] ?? 'Desconocido';

  return {
    homeGoals,
    awayGoals,
    homeStats,
    awayStats,
    events,
    motm,
  };
}

/** Build SquadStats (medias de equipo) a partir de la plantilla usando los
 *  atributos FDF. Es el agregador del motor TS de respaldo. */
export function buildSquadStats(players: {
  position: string;
  passing: number; tackling: number; shooting: number; organization: number;
  unmarking: number; finishing: number; dribbling: number; fouls: number; goalkeeping: number;
  fitness: number; morale: number; experience: number;
  isStarter: boolean;
}[]): SquadStats {
  const overallOf = (p: {
    passing: number; tackling: number; shooting: number; organization: number;
    unmarking: number; finishing: number; dribbling: number; goalkeeping: number;
  }) => (p.passing + p.tackling + p.shooting + p.organization +
         p.unmarking + p.finishing + p.dribbling + p.goalkeeping) / 8;

  let starters = players.filter(p => p.isStarter).slice(0, 11);
  if (starters.length === 0) {
    starters = [...players].sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 11);
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1);

  const defenders = starters.filter(p => p.position === 'DEF');
  const mids      = starters.filter(p => p.position === 'MED');
  const forwards  = starters.filter(p => p.position === 'DEL');

  return {
    overall:    Math.round(avg(starters.map(overallOf))),
    defense:    Math.round(defenders.length > 0
      ? avg(defenders.map(p => p.tackling))
      : avg(starters.map(p => p.tackling))),
    attack:     Math.round(forwards.length > 0
      ? avg(forwards.map(p => (p.finishing + p.shooting + p.unmarking) / 3))
      : avg(starters.map(p => p.finishing))),
    midfield:   Math.round(mids.length > 0
      ? avg(mids.map(p => (p.organization + p.passing) / 2))
      : avg(starters.map(p => p.organization))),
    fitness:    Math.round(avg(starters.map(p => p.fitness))),
    morale:     Math.round(avg(starters.map(p => p.morale))),
    experience: Math.round(avg(starters.map(p => p.experience))),
  };
}
