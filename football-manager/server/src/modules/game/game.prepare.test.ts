import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMatch: vi.fn(),
  findState: vi.fn(),
  findConfidence: vi.fn(),
  findActivePlays: vi.fn(),
  isManagerOnVacation: vi.fn(),
}));

vi.mock('../../db/prisma', () => ({
  default: {
    match: { findUnique: mocks.findMatch },
    gameState: { findFirst: mocks.findState },
    boardConfidence: { findFirst: mocks.findConfidence },
    trainedPlay: { findMany: mocks.findActivePlays },
  },
}));

vi.mock('../vacation/vacation.service', () => ({
  vacationService: {
    isManagerOnVacation: mocks.isManagerOnVacation,
    logLineupDecision: vi.fn(),
    processVacationTick: vi.fn(),
  },
}));

import { prepareMatchSimulation } from './game.service';

function player(
  id: number,
  position: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: `P${id}`,
    position,
    squadNumber: id,
    isStarter: id <= 11,
    goalkeeping: position === 'POR' ? 90 : 10,
    passing: 60,
    tackling: 60,
    shooting: 60,
    organization: 60,
    unmarking: 60,
    finishing: 60,
    dribbling: 60,
    fouls: 50,
    fitness: 100,
    morale: 75,
    experience: 60,
    ...extra,
  };
}

function club(id: number, players: Array<Record<string, unknown>>) {
  return {
    id,
    name: `Club ${id}`,
    manager: { id },
    players,
    stadiumCapacity: 20_000,
    fans: 15_000,
    socialMass: 25_000,
    highClass: 100,
    reputation: 60,
    countryLevel: 2,
    ticketPriceLevel: 'medium',
    homeStimulatedUntilTurn: 0,
  };
}

function match(homePlayers: Array<Record<string, unknown>>, awayPlayers: Array<Record<string, unknown>>) {
  return {
    id: 77,
    status: 'scheduled',
    homeClubId: 1,
    awayClubId: 2,
    homeClub: club(1, homePlayers),
    awayClub: club(2, awayPlayers),
    matchday: {
      competitionId: 10,
      isKnockout: false,
      competition: { type: 'league' },
    },
    isKnockout: false,
    homeStatsJson: JSON.stringify({
      simulationInputs: {
        homeStarterIds: Array.from({ length: 11 }, (_, i) => i + 1),
        awayStarterIds: Array.from({ length: 11 }, (_, i) => i + 101),
      },
    }),
    homeFormation: '4-4-2',
    homeConstruction: 50,
    homeDestruction: 50,
    homePressing: 50,
    homeTempo: 50,
    homeWidth: 50,
    homeMentality: 'balanced',
    homeMarking: 'zonal',
    homeOffensiveStyle: null,
    homeDefensiveStyle: null,
    homeAttackZones: null,
    homeDefenseReinforcement: null,
    homeSubsLogic: null,
    awayFormation: '4-4-2',
    awayConstruction: 50,
    awayDestruction: 50,
    awayPressing: 50,
    awayTempo: 50,
    awayWidth: 50,
    awayMentality: 'balanced',
    awayMarking: 'zonal',
    awayOffensiveStyle: null,
    awayDefensiveStyle: null,
    awayAttackZones: null,
    awayDefenseReinforcement: null,
    awaySubsLogic: null,
    weatherCondition: 'normal',
    temperature: 20,
  };
}

describe('prepareMatchSimulation — elegibilidad end-to-end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isManagerOnVacation.mockResolvedValue(false);
    mocks.findConfidence.mockResolvedValue({ level: 50 });
    mocks.findActivePlays.mockResolvedValue([]);
    mocks.findState.mockResolvedValue({
      turn: 20,
      inGameDate: new Date('2026-06-19T00:00:00Z'),
    });
  });

  it('elimina titulares sancionados/lesionados y recompone un XI elegible de 11 con POR', async () => {
    const homePlayers = [
      player(1, 'POR'),
      ...Array.from({ length: 13 }, (_, i) => player(i + 2, i < 4 ? 'DEF' : i < 8 ? 'MED' : 'DEL')),
    ];
    homePlayers[5] = { ...homePlayers[5], suspendedMatches: 2 };
    homePlayers[6] = { ...homePlayers[6], injuredUntil: new Date('2026-06-25T00:00:00Z') };

    const awayPlayers = [
      player(101, 'POR'),
      ...Array.from({ length: 13 }, (_, i) => player(i + 102, i < 4 ? 'DEF' : i < 8 ? 'MED' : 'DEL')),
    ];
    mocks.findMatch.mockResolvedValue(match(homePlayers, awayPlayers));

    const prepared = await prepareMatchSimulation(77);
    const homeXi = prepared.homeRoster.filter(p => p.isStarter);

    expect(prepared.homeRoster.some(p => p.id === '6')).toBe(false);
    expect(prepared.homeRoster.some(p => p.id === '7')).toBe(false);
    expect(homeXi).toHaveLength(11);
    expect(homeXi.filter(p => p.position === 'POR')).toHaveLength(1);
    expect(prepared.seed).toBe(77 * 1337);
  });
});
