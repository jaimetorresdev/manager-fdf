// ─── Game Service ─────────────────────────────────────────────────────────────
// Owns the game clock, week advance, and match simulation triggering.
import prisma from '../../db/prisma';
import { beginOrResumeTick, completeTickRun, runTickStep } from '../../lib/tickIdempotency';
import { moneyToNumber } from '../../lib/roundMoney';
import { Prisma } from '@prisma/client';
import { simulateMatch, buildSquadStats, TacticInput, type MatchEventResult } from '../simulation/simulation.engine';
import { simulateGame, simulateGamesBatch, buildRoster, developPlayers, requestLineup, type EngineInjury, type EngineResult, type PlayerRating } from '../simulation/engineClient';
import {
  makeRng,
  crossedIntoNewMonth,
  inGameMonthKey,
  gateIncome,
  gateAttendance,
  commercialBreakdown,
  outsourcingMonthlyCost,
  sponsorMonthlyIncome,
  monthlySalaries,
  eliteLiquidityMaintenance,
  prestigeAfterRedMonth,
  isTransferWindowOpen,
  isLoanWindowOpen,
  rescissionClause,
  salaryCap,
  canClubOperate,
  nextTickClaim,
  moraleDeltaForResult,
  shouldDecayMorale,
} from './tick.logic';
import { generateNewSeason, byeWalkoverMatchData } from './season.service';
import { coefficientService } from '../world/competitions/coefficient.service';
import { economyService, deriveSponsorMonthsRemaining } from '../economy/economy.service';
import { trainingService } from '../training/training.service';
import { academyService } from '../academy/academy.service';
import { stadiumService } from '../stadium/stadium.service';
import { fansService } from '../fans/fans.service';
import { sharesService } from '../shares/shares.service';
import { electionsService } from '../elections/elections.service';
import { ideologyService } from '../ideology/ideology.service';
import { worldEconomyService, rankingService } from '../world/world.service';
import { masterService } from '../master/master.service';
import { vacationService } from '../vacation/vacation.service';
import { missionsService } from '../missions/missions.service';
import { weeklyMissionsService } from '../missions/weeklyMissions.service';
import { broadcastLeagueMatchTimeline } from '../matches/matchdayRealtime.service';
import { pushLiveGoal, pushTurnProcessed } from '../push/push.service';
import { careerLevelFromXp } from '../manager/careerCurve';
import { npcCoachService } from '../manager/npcCoach.service';
import { getStaffEffectsForClubs } from '../staff/staffEffects';
import { assertFDFBuyerCounts, executePlayerTransfer } from '../market/transfer.core';
import { executePendingWindowOffers } from '../market/market.service';
import { runAiMarketPass } from '../market/aiMarket.service';
import { realtimeHub } from '../realtime/realtime.hub';
// WT1: promociones de cantera nacen con posición detallada.
import { deriveDetailedPosition } from '../players/detailedPositions';
// WT3: demanda física de la formación → fatiga post-partido.
import { physicalDemandOf, hasWingBacks } from '../simulation/formationEffects';
import { computeMatchPriority } from '../simulation/matchPriority';
import { officialMatchSeed } from '../simulation/previewSeed';
import {
  aggregateSuspensionMatches,
  buildRedSuspensionCandidates,
  buildYellowSuspensionCandidates,
} from './suspensions.logic';
import { applyPlayerDeltas } from './playerProgression';
import { recalcAllMarketValues } from './marketValuation';
import { finalizeSeasonIfComplete } from './seasonRollover';
import { sortStandings, withHeadToHeadPoints } from './standings';
import { shouldRetirePlayer } from './playerLifecycle';
import { friendliesService } from '../friendlies/friendlies.service';
import { evaluateOffer } from '../market/market-evaluation.logic';
import { playbookProfileBonus } from '../training/playbook.rules';
import {
  FATIGUE_COLLAPSE_THRESHOLD,
  LOW_FITNESS_SKILLS,
  motivationAffinityMatches,
} from './playerCondition.rules';
import { returnWindowAllows } from '../manager/returnWindow';

// Cada turno avanza ~3 días dentro del juego (modelo FDF: 2 turnos/día).
const DAYS_PER_TURN = 3;
const DEFAULT_TICK_LOCK_STALE_MS = 30 * 60 * 1000;

type TickCompletedDelta = {
  turn: number;
  inGameDate: string;
  seasonId: number;
  matchesSimulated: number;
  matchIds: number[];
  matchdaysSimulated: number[];
  competitionIncomesSettled: number;
  processingShards: string[];
  invalidates: string[];
  steps: string[];
};

function tickLockStaleMs(): number {
  const parsed = Number(process.env.TICK_LOCK_STALE_MS);
  return Number.isFinite(parsed) && parsed >= 60_000 ? parsed : DEFAULT_TICK_LOCK_STALE_MS;
}

function broadcastTickCompleted(delta: TickCompletedDelta) {
  try {
    realtimeHub.broadcast('system:world', 'tick:completed', delta);
  } catch (err) {
    console.error('[tick] no se pudo emitir delta WS tick:completed:', err);
  }
}

/**
 * Fecha in-game del turno ANTERIOR (auditoría P0 #2/#5): usa la columna persistida
 * `GameState.prevInGameDate` en vez de reconstruir "−3 días" (los saltos reales
 * Mié→Vie y Vie→Dom son de 2 días, lo que detectaba cruces de mes/año DOS veces).
 * Fallback −DAYS_PER_TURN solo para el primer tick tras la migración (columna null).
 */
function resolvePrevInGameDate(prev: Date | null | undefined, current: Date): Date {
  if (prev) return new Date(prev);
  const fallback = new Date(current);
  fallback.setUTCDate(fallback.getUTCDate() - DAYS_PER_TURN);
  return fallback;
}

/**
 * Próximo instante de tick a partir de los crones diarios TICK_CRON_T1/T2
 * (por defecto 11:00 y 23:00). Devuelve el más cercano en el futuro, en la
 * hora local del proceso (el contenedor corre con TZ=Europe/Madrid).
 */
/** Lee effectiveness/level del staff para pasos automáticos del tick. */
function parseStaffEffectiveness(raw: string): number {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    return Math.max(1, Number(value.effectiveness ?? value.level ?? 1) || 1);
  } catch {
    return 1;
  }
}

function focusedScoutPlayerId(zone?: string | null): number | null {
  const match = /^player:(\d+)$/.exec(zone ?? '');
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function crossesUtcDate(prev: Date, next: Date, month: number, day: number): boolean {
  for (let year = prev.getUTCFullYear(); year <= next.getUTCFullYear(); year++) {
    const target = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
    if (target.getTime() > prev.getTime() && target.getTime() <= next.getTime()) return true;
  }
  return false;
}

function envTurnHours(): number[] {
  const pick = (expr: string | undefined, hourFallback: number) => {
    const [m, h] = (expr ?? '').trim().split(/\s+/);
    const hour = Number.parseInt(h, 10);
    const min = Number.parseInt(m, 10);
    return {
      hour: Number.isFinite(hour) ? hour : hourFallback,
      min: Number.isFinite(min) ? min : 0,
    };
  };
  const t1 = pick(process.env.TICK_CRON_T1, 11);
  const t2 = pick(process.env.TICK_CRON_T2, 23);
  return [t1.hour + (t1.min / 60), t2.hour + (t2.min / 60)];
}

export function computeNextTick(from: Date = new Date(), turnHours: number[] = envTurnHours()): Date {
  const candidates: Date[] = [];
  for (const offset of [0, 1]) {
    for (const rawHour of turnHours.length ? turnHours : [11, 23]) {
      const hour = Math.max(0, Math.min(23, Math.floor(rawHour)));
      const min = Math.max(0, Math.min(59, Math.round((rawHour - hour) * 60)));
      const d = new Date(from);
      d.setDate(from.getDate() + offset);
      d.setHours(hour, min, 0, 0);
      candidates.push(d);
    }
  }
  const next = candidates
    .filter(d => d.getTime() > from.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return next ?? new Date(from.getTime() + 12 * 60 * 60 * 1000);
}

type PlayerIdentity = { id: number; name: string };
type EngineEvent = MatchEventResult & {
  cardCount?: number;
  playerName?: string;
  assistName?: string;
};

type SimulateMatchOptions = {
  allowPlayed?: boolean;
  auditOnly?: boolean;
};

type StoredMatchInjury = {
  matchId: number;
  playerId: number;
  playerName: string;
  team: 'home' | 'away';
  type: string;
  severity: number;
  weeksLeft: number;
};

function normalizeName(name: string | undefined | null): string {
  return String(name ?? '').trim().toLocaleLowerCase('es-ES');
}

/** R7 · playerId del motor → id válido o undefined (rechaza NaN/0/strings raros).
 * El motor ya emite playerId en sus eventos; este guard evita que un Number()
 * sobre un valor corrupto (NaN sigue siendo typeof 'number') pase como id real. */
function validPlayerId(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : (typeof value === 'string' && value !== '' ? Number(value) : NaN);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** R7 · Mapa nombre→id como ÚLTIMO recurso: los homónimos del mismo club se
 * EXCLUYEN del mapa (antes colapsaban al último insertado, atribuyendo
 * goles/lesiones al jugador equivocado). Mejor sin id que con id incorrecto. */
function idByName(players: PlayerIdentity[]): Map<string, number> {
  const map = new Map<string, number>();
  const ambiguous = new Set<string>();
  for (const player of players) {
    const key = normalizeName(player.name);
    if (map.has(key) && map.get(key) !== player.id) ambiguous.add(key);
    else map.set(key, player.id);
  }
  for (const key of ambiguous) map.delete(key);
  return map;
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function toInt(v: any, fallback?: number): number | undefined {
  if (v == null) return fallback;
  const parsed = parseInt(String(v), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function eventPlayerId(
  event: EngineEvent,
  homeIds: Map<string, number>,
  awayIds: Map<string, number>,
): number | undefined {
  // R7: SIEMPRE el playerId que emite el motor; el nombre es solo último recurso.
  const direct = validPlayerId(event.playerId);
  if (direct) return direct;
  const lookup = event.team === 'home' ? homeIds : awayIds;
  return lookup.get(normalizeName(event.playerName));
}

function eventCardCount(event: EngineEvent): number {
  if (event.type !== 'yellow' && event.type !== 'red') return 0;
  const count = Number(event.cardCount);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : 1;
}

function injuryWeeks(raw: EngineInjury | EngineEvent): number {
  const explicit = 'matchesOut' in raw ? raw.matchesOut : undefined;
  const weeks = 'weeksOut' in raw ? raw.weeksOut : undefined;
  const severity = 'severity' in raw ? raw.severity : undefined;
  return Math.max(1, Math.min(12, Math.round(safeNumber(explicit ?? weeks ?? severity, 1))));
}

function normalizeEngineInjuries(
  matchId: number,
  injuries: EngineInjury[] | undefined,
  events: EngineEvent[],
  homePlayers: PlayerIdentity[],
  awayPlayers: PlayerIdentity[],
  homeIds: Map<string, number>,
  awayIds: Map<string, number>,
): StoredMatchInjury[] {
  const allPlayers = new Map<number, PlayerIdentity>([...homePlayers, ...awayPlayers].map(player => [player.id, player]));
  const normalized: StoredMatchInjury[] = [];

  const push = (
    input: EngineInjury | EngineEvent,
    team: 'home' | 'away',
    playerId: number | undefined,
    playerName: string | undefined,
  ) => {
    if (!playerId) return;
    const weeksLeft = injuryWeeks(input);
    const type = String(('type' in input ? input.type : undefined) || 'Lesión de partido');
    normalized.push({
      matchId,
      playerId,
      playerName: playerName || allPlayers.get(playerId)?.name || `Jugador ${playerId}`,
      team,
      type: type === 'injury' ? 'Lesión de partido' : type,
      severity: weeksLeft,
      weeksLeft,
    });
  };

  if (Array.isArray(injuries) && injuries.length > 0) {
    for (const injury of injuries) {
      const team = injury.team === 'away' ? 'away' : 'home';
      const lookup = team === 'home' ? homeIds : awayIds;
      const playerId = validPlayerId(injury.playerId) ?? lookup.get(normalizeName(injury.playerName));
      push(injury, team, playerId, injury.playerName);
    }
  }

  for (const event of events) {
    if (event.type !== 'injury') continue;
    const playerId = eventPlayerId(event, homeIds, awayIds);
    push(event, event.team, playerId, event.playerName);
  }

  const seen = new Set<string>();
  return normalized.filter((injury) => {
    const key = `${injury.matchId}:${injury.playerId}:${injury.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type KnockoutMeta = {
  knockout: boolean;
  winnerTeam?: 'home' | 'away';
  winnerClubId?: number;
  penalties?: { home: number; away: number };
};

function penaltyShootout(seed: number): { home: number; away: number } {
  const rng = makeRng(seed * 48271 + 97);
  let home = 0;
  let away = 0;
  for (let i = 0; i < 5; i++) {
    if (rng() < 0.74) home++;
    if (rng() < 0.74) away++;
  }
  while (home === away) {
    if (rng() < 0.74) home++;
    if (rng() < 0.74) away++;
  }
  return { home, away };
}

function resolveKnockout(
  result: { homeGoals: number; awayGoals: number; winner?: string | null; winnerClubId?: number; penalties?: { home: number; away: number } },
  homeClubId: number,
  awayClubId: number,
  seed: number,
  knockout: boolean,
): KnockoutMeta {
  if (!knockout) return { knockout: false };

  if (typeof result.winnerClubId === 'number') {
    return {
      knockout: true,
      winnerClubId: result.winnerClubId,
      winnerTeam: result.winnerClubId === homeClubId ? 'home' : 'away',
      penalties: result.penalties,
    };
  }
  if (result.winner === 'home' || result.winner === 'away') {
    return {
      knockout: true,
      winnerTeam: result.winner,
      winnerClubId: result.winner === 'home' ? homeClubId : awayClubId,
      penalties: result.penalties,
    };
  }
  if (result.homeGoals > result.awayGoals) {
    return { knockout: true, winnerTeam: 'home', winnerClubId: homeClubId };
  }
  if (result.awayGoals > result.homeGoals) {
    return { knockout: true, winnerTeam: 'away', winnerClubId: awayClubId };
  }

  const penalties = result.penalties ?? penaltyShootout(seed);
  const winnerTeam = penalties.home > penalties.away ? 'home' : 'away';
  return {
    knockout: true,
    winnerTeam,
    winnerClubId: winnerTeam === 'home' ? homeClubId : awayClubId,
    penalties,
  };
}

export function persistedDecision(
  result: { decidedBy?: 'regular' | 'extra_time' | 'penalties' },
  knockoutMeta: KnockoutMeta,
): 'regular' | 'extra_time' | 'penalties' | null {
  if (knockoutMeta.penalties) return 'penalties';
  if (result.decidedBy === 'extra_time') return 'extra_time';
  if (knockoutMeta.winnerTeam || result.decidedBy === 'regular') return 'regular';
  return null;
}

export const gameService = {
  async getState() {
    const state = await prisma.gameState.findFirst({
      where:   { isActive: true },
      include: { season: true },
    });
    if (!state) throw new Error('No active game state');
    return {
      id:         state.id,
      week:       state.week,
      // Q2 (aditivo): jornada RELATIVA a la temporada activa — es la que debe
      // mostrar la UI. `week` queda como contador acumulado legacy. Cast
      // defensivo hasta regenerar el cliente Prisma (--build backend).
      seasonWeek: (state as { seasonWeek?: number }).seasonWeek ?? state.week,
      phase:      state.phase,
      season:     state.season.name,
      seasonId:   state.seasonId,
      turn:       state.turn,
      inGameDate: state.inGameDate,
      nextTickAt: state.nextTickAt,
      isLocked:   state.isLocked,
    };
  },

  async testTactic(clubId: number, tactic: TacticInput) {
    const homePlayers = await prisma.player.findMany({ where: { clubId } });
    const homeSquad = buildSquadStats(homePlayers);
    const homeNames = homePlayers.map(p => p.name);

    const awaySquad = {
      overall: 65, defense: 65, attack: 65, midfield: 65,
      fitness: 85, morale: 50, experience: 50,
    };
    const awayTactic = { formation: '4-4-2', construction: 50, destruction: 50 };
    const awayNames = ['García', 'López', 'Martínez', 'Sánchez'];

    return simulateMatch(homeSquad, awaySquad, tactic, awayTactic, homeNames, awayNames, 42);
  },

  /** Calcula y persiste el timestamp del próximo turno (siguiente cron T1/T2). */
  async updateNextTickTime() {
    const settings = await masterService.getSettings();
    await prisma.gameState.updateMany({
      where: { isActive: true },
      data: { nextTickAt: computeNextTick(new Date(), settings.turnHours) },
    });
  },

  /**
   * Procesa un turno del mundo como un pipeline ordenado. Usa bloqueo optimista
   * (`isLocked`) para que dos disparos del cron no se solapen. Los pasos que
   * todavía no existen quedan como stubs explícitos para enchufarse en hitos
   * posteriores (H4–H6) sin tocar esta orquestación.
   */
  async processTick() {
    const state = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!state) throw new Error('No active game state');

    if (state.isLocked) {
      const lockedAt = state.lockUpdatedAt ?? state.updatedAt;
      const lockAgeMs = new Date().getTime() - lockedAt.getTime();
      const staleMs = tickLockStaleMs();
      if (lockAgeMs > staleMs) {
        console.warn(`[tick] isLocked was stale (>${Math.round(staleMs / 60_000)} min), releasing automatically.`);
        await prisma.gameState.update({
          where: { id: state.id },
          data: { isLocked: false, lockUpdatedAt: null },
        });
        state.isLocked = false;
      }
    }

    // Bloqueo atómico: si ya hay un tick en curso, no ejecutamos otro.
    const lock = await prisma.gameState.updateMany({
      where: { id: state.id, isLocked: false },
      data: { isLocked: true, lockUpdatedAt: new Date() },
    });
    if (lock.count === 0) {
      console.warn('[tick] processTick invocado con el estado ya bloqueado; se omite.');
      return { skipped: true as const };
    }

    const steps: string[] = [];
    console.log('[tick] isLocked set to true, starting steps');

    try {
      const tickBegin = await beginOrResumeTick(state);
      if ('skipped' in tickBegin) {
        console.warn(`[tick] turn ${tickBegin.turn} ya completado (TickRun); omitiendo.`);
        return { skipped: true as const };
      }

      const { runId: tickRunId, nextTurn, nextDate, skipCalendar } = tickBegin;
      const prevInGameDate = tickBegin.prevInGameDate;

      if (!skipCalendar) {
        // 1. Calendario: Miércoles > Viernes > Domingo.
        const isNewSeason = nextDate.getUTCMonth() === 6 && state.inGameDate.getUTCMonth() !== 6;
        const retryNewSeason = !isNewSeason
          && state.phase === 'end'
          && [6, 7].includes(nextDate.getUTCMonth());
        if (isNewSeason || retryNewSeason) {
          await runTickStep(tickRunId, 'newSeason', async () => {
            try {
              const newSeason = await generateNewSeason(state.seasonId);
              steps.push(`calendario:nueva-temporada:${newSeason.name}${retryNewSeason ? ':reintento' : ''}`);
            } catch (e) {
              console.error('Error generating new season:', e);
              steps.push('calendario:nueva-temporada:ERROR');
            }
          });
        }

        await prisma.gameState.update({
          where: { id: state.id },
          data: {
            turn: nextTurn,
            inGameDate: nextDate,
            prevInGameDate: prevInGameDate!,
          },
        });
        steps.push(`calendario:${nextDate.toISOString().split('T')[0]}`);
        state.turn = nextTurn;
        state.inGameDate = nextDate;
      }

      // 2. Entrenamientos (mejora de habilidades por entrenador). Stub → H4.
      await runTickStep(tickRunId, 'trainings', async () => { await stepTrainings(steps); });
      await runTickStep(tickRunId, 'styleContinuity', async () => { await stepStyleContinuity(steps); });
      await runTickStep(tickRunId, 'moraleDecay', async () => { await stepMoraleDecay(steps, nextDate, nextTurn); });

      // 3. Forma / cansancio: recuperación por turno.
      await runTickStep(tickRunId, 'healFitness', async () => {
        await healFitness();
        steps.push('forma:ok');
      });
      await runTickStep(tickRunId, 'staffEffects', async () => { await stepStaffEffects(steps); });

      // 4. Jornadas programadas (N1-2: `TICK_PARALLEL_SHARDS=1` → simulateShardPhase por continente).
      let adv: AdvanceWeekResult = {
        week: state.week,
        matchesSimulated: 0,
        matchIds: [],
        matchdaysSimulated: [],
        competitionIncomesSettled: 0,
        processingShards: [],
      };
      await runTickStep(tickRunId, 'matches', async () => {
        const parallelShards = process.env.TICK_PARALLEL_SHARDS === '1';
        if (parallelShards) {
          const distinct = await listDistinctProcessingShards(state.seasonId);
          if (distinct.length > 1) {
            const tickSettings = await masterService.getSettings();
            const day = nextDate.getUTCDay();
            const phases = await Promise.all(
              distinct.map((shard) => simulateShardPhase({
                seasonId: state.seasonId,
                inGameDay: day,
                shardWhere: processingShardWhere([shard]),
                shardKeys: [shard],
                settings: tickSettings,
              })),
            );
            adv = await consolidateShardResults(state, state.week + 1, phases, distinct);
          } else {
            adv = await this.advanceWeek();
          }
        } else {
          adv = await this.advanceWeek();
        }
        steps.push(`partidos:${adv.matchesSimulated}`);
        const friendlies = await friendliesService.processDue(nextDate);
        steps.push(`amistosos:${friendlies.played}:ingresos:${friendlies.incomePaid}`);
        if (adv.processingShards.length > 0) steps.push(`shards:${adv.processingShards.join(',')}`);
        steps.push(`premios-competicion:${adv.competitionIncomesSettled ?? 0}`);
      });

      await runTickStep(tickRunId, 'playerProgression', async () => {
        await stepPlayerProgression(steps, adv.matchesSimulated > 0, nextDate, nextTurn, state.inGameDate);
      });
      if (adv.matchIds.length > 0) {
        await runTickStep(tickRunId, 'narrative', async () => { await stepNarrative(steps, adv.matchIds); });
      }
      await runTickStep(tickRunId, 'missions', async () => {
        const missions = await missionsService.evaluateTick(adv.matchIds);
        steps.push(`misiones:${missions.completed}`);
      });
      await runTickStep(tickRunId, 'weeklyMissions', async () => {
        try {
          const weekly = await weeklyMissionsService.processTick(adv.matchIds);
          steps.push(`misiones-semanales:${weekly.completed}:${weekly.generated}`);
        } catch (err) {
          console.error('[tick] misiones semanales fallaron (no bloquea el tick):', err);
          steps.push('misiones-semanales:ERROR');
        }
      });

      // 5. Mercado: resolver ofertas vencidas. Stub → H4.
      await runTickStep(tickRunId, 'transfers', async () => { await stepTransfers(steps); });
      await runTickStep(tickRunId, 'vacation', async () => {
        const vacation = await vacationService.processVacationTick(nextTurn, nextDate);
        steps.push(`vacaciones:${vacation.managers}:renovaciones:${vacation.renewed}`);
      });
      await runTickStep(tickRunId, 'managerApplications', async () => { await stepResolveManagerApplications(steps); });
      await runTickStep(tickRunId, 'jobMarket', async () => { await stepJobMarket(steps); });
      await runTickStep(tickRunId, 'finances', async () => { await stepFinances(steps); });
      await runTickStep(tickRunId, 'academy', async () => { await stepAcademy(steps); });
      await runTickStep(tickRunId, 'stadium', async () => { await stepStadium(steps, state.inGameDate, nextDate); });
      await runTickStep(tickRunId, 'fans', async () => { await stepFans(steps, state.inGameDate, nextDate); });
      await runTickStep(tickRunId, 'februaryMotivation', async () => {
        await stepFebruaryMotivation(steps, state.inGameDate, nextDate, nextTurn);
      });
      await runTickStep(tickRunId, 'injuriesSanctions', async () => {
        await stepInjuriesSanctions(steps, adv.matchesSimulated > 0, adv.matchIds);
      });
      await runTickStep(tickRunId, 'scouting', async () => { await stepScouting(steps); });
      await runTickStep(tickRunId, 'shareValues', async () => { await stepShareValues(steps, nextDate, nextTurn); });
      await runTickStep(tickRunId, 'notifications', async () => { await stepNotifications(steps); });
      await runTickStep(tickRunId, 'records', async () => { await stepRecords(steps, nextTurn, state.inGameDate); });
      await runTickStep(tickRunId, 'dbCleanup', async () => { await stepDbCleanup(steps, nextDate); });
      await runTickStep(tickRunId, 'milestones', async () => {
        try {
          const milestones = await missionsService.evaluateMilestonesTick(adv.matchIds);
          steps.push(`hitos:${milestones.completed}`);
        } catch (err) {
          console.error('[tick] hitos pequeños fallaron (no bloquea el tick):', err);
          steps.push('hitos:ERROR');
        }
      });

      steps.push(`turno:${nextTurn}`);
      await runTickStep(tickRunId, 'tickZeroCache', async () => { await stepTickZeroCache(steps); });
      await completeTickRun(tickRunId);

      const finalState = await prisma.gameState.findUnique({
        where: { id: state.id },
        select: { seasonId: true },
      });
      broadcastTickCompleted({
        turn: nextTurn,
        inGameDate: nextDate.toISOString(),
        seasonId: finalState?.seasonId ?? state.seasonId,
        matchesSimulated: adv.matchesSimulated,
        matchIds: adv.matchIds,
        matchdaysSimulated: adv.matchdaysSimulated,
        competitionIncomesSettled: adv.competitionIncomesSettled ?? 0,
        processingShards: adv.processingShards,
        invalidates: ['dashboard', 'matches', 'club', 'market', 'news', 'world', 'notifications'],
        steps: [...steps],
      });

      return { turn: nextTurn, inGameDate: nextDate, steps };
    } finally {
      // P2 #120: liberar el lock LO PRIMERO — si getSettings lanzara, antes el
      // lock quedaba cogido hasta el auto-release de 30 min.
      await prisma.gameState.update({ where: { id: state.id }, data: { isLocked: false, lockUpdatedAt: null } });
      try {
        const settings = await masterService.getSettings();
        await prisma.gameState.update({
          where: { id: state.id },
          data: { nextTickAt: computeNextTick(new Date(), settings.turnHours) },
        });
      } catch (err) {
        console.error('[tick] no se pudo fijar nextTickAt (lock ya liberado):', err);
      }
    }
  },

  /** Advance to the next calendar round: simulate one pending matchday per competition. */
  async advanceWeek(options?: { onlyShards?: string[]; skipWeekAdvance?: boolean }): Promise<AdvanceWeekResult> {
    console.log('[advanceWeek] start');
    const state = await prisma.gameState.findFirst({ where: { isActive: true } });
    if (!state) throw new Error('No active game state');

    const newWeek = state.week + 1;
    console.log(`[advanceWeek] newWeek: ${newWeek}`);
    const settings = await masterService.getSettings();
    const processingShards = options?.onlyShards?.length ? options.onlyShards : configuredProcessingShards();
    const shardWhere = processingShardWhere(options?.onlyShards);
    const day = state.inGameDate.getUTCDay(); // P1 #101: mismo reloj UTC que el avance

    // ── N1-2 · FASE SHARD-ONLY (paralelizable) ────────────────────────────────
    // Simula los partidos de las competiciones del/los shard(s) y NADA global
    // (no avanza el contador de turno ni finaliza la temporada). En single-process
    // se ejecuta UNA vez cubriendo todos los shards configurados (o el mundo
    // entero si `TICK_PROCESSING_SHARDS` está vacío) → comportamiento y
    // determinismo idénticos al bucle anterior. Para workers paralelos por
    // continente (Codex): cada worker llama `simulateShardPhase` con SU
    // `shardWhere` y Node fusiona los `ShardSimulationResult` con
    // `consolidateShardResults`. Contrato en `server/API_UI.md` §N1-2.
    const phase = await simulateShardPhase({
      seasonId: state.seasonId,
      inGameDay: day,
      shardWhere,
      shardKeys: processingShards,
      settings,
    });

    if (options?.skipWeekAdvance) {
      return {
        week: state.week,
        matchesSimulated: phase.matchIds.length,
        matchIds: phase.matchIds,
        matchdaysSimulated: phase.matchdaysSimulated,
        competitionIncomesSettled: phase.competitionIncomesSettled,
        processingShards,
      };
    }

    // ── Consolidación GLOBAL (una sola vez, tras fusionar TODOS los shards) ────
    return consolidateShardResults(state, newWeek, [phase], processingShards);
  },

  /** Simulate a single match (admin or scheduled job) */
  async simulateMatch(matchId: number) {
    return simulateAndSave(matchId);
  },

  /** Re-run deterministic simulation without mutating match/standings/stats. */
  async resimulateMatchAudit(matchId: number) {
    return simulateAndSave(matchId, { allowPlayed: true, auditOnly: true });
  },

  /** X1: regenera timeline/replay por semilla sin mutar marcador ni tablas. */
  async regenerateTimelineFromSeed(matchId: number) {
    const audit = await simulateAndSave(matchId, { allowPlayed: true, auditOnly: true });
    return {
      ...audit,
      mode: 'timeline-from-seed',
      source: 'seed-regenerated',
      regeneratedAt: new Date().toISOString(),
    };
  },

  async getNotifications(userId: number) {
    return prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    20,
    });
  },

  async markNotificationRead(notificationId: number, userId: number) {
    return prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data:  { isRead: true },
    });
  },
};

// ─── Internal: simulate a match and persist result ────────────────────────────
// C8 · partido en dos mitades: prepareMatchSimulation (rosters/tácticas/semilla,
// SIN simular) + persistMatchResult (persistencia, INTACTA). simulateAndSave los
// compone para el caso individual; el tick usa el lote (simulateGamesBatch) con
// los mismos jobs → resultados bit a bit idénticos (misma semilla, mismo motor).

export async function prepareMatchSimulation(matchId: number, options: SimulateMatchOptions = {}) {
  const auditOnly = options.auditOnly === true;
  const match = await prisma.match.findUnique({
    where:   { id: matchId },
    include: {
      homeClub: {
        include: {
          players: {
            include: {
              injuries: { where: { weeksLeft: { gt: 0 } } },
              suspensions: { where: { matches: { gt: 0 } } },
            },
          },
          manager: true,
        },
      },
      awayClub: {
        include: {
          players: {
            include: {
              injuries: { where: { weeksLeft: { gt: 0 } } },
              suspensions: { where: { matches: { gt: 0 } } },
            },
          },
          manager: true,
        },
      },
      matchday: { include: { competition: true } },
    },
  });
  if (!match) throw new Error(`Match ${matchId} not found`);
  if (match.status === 'played' && !options.allowPlayed) throw new Error(`Match ${matchId} already played`);
  const activeState = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { turn: true, inGameDate: true },
  });
  if (!activeState) throw new Error('No active game state');

  type StoredSimInputs = {
    attendancePct?: number;
    homeStimulated?: boolean;
    homeStarterIds?: number[];
    awayStarterIds?: number[];
    coachConfidenceHome?: number;
    coachConfidenceAway?: number;
    homePlaybookBonus?: { attack: number; defense: number; midfield: number };
    awayPlaybookBonus?: { attack: number; defense: number; midfield: number };
  };
  const persistedStats = safeParse<Record<string, unknown>>(match.homeStatsJson, {});
  const storedInputs = (persistedStats.simulationInputs ?? null) as StoredSimInputs | null;
  const [homeConfidenceRow, awayConfidenceRow, homeActivePlays, awayActivePlays] = await Promise.all([
    prisma.boardConfidence.findFirst({
      where: { clubId: match.homeClubId },
      orderBy: { updatedAt: 'desc' },
      select: { level: true },
    }),
    prisma.boardConfidence.findFirst({
      where: { clubId: match.awayClubId },
      orderBy: { updatedAt: 'desc' },
      select: { level: true },
    }),
    prisma.trainedPlay.findMany({
      where: { clubId: match.homeClubId, isActive: true, status: { not: 'developing' } },
      select: { type: true, level: true, isActive: true, status: true, executorPlayerIds: true },
      orderBy: { id: 'asc' },
    }),
    prisma.trainedPlay.findMany({
      where: { clubId: match.awayClubId, isActive: true, status: { not: 'developing' } },
      select: { type: true, level: true, isActive: true, status: true, executorPlayerIds: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  // P2 #113: el "factor campo dinámico" calculado aquí nunca llegaba al motor
  // (código muerto eliminado). El motor modela la ventaja de campo con
  // attendancePct + homeStimulated, que SÍ se pasan en engineOptions.

  // Autogestión de NPCs: si no tienen manager humano, pedir alineación y táctica
  let finalHomeFormation = match.homeFormation;
  let finalHomeConst = match.homeConstruction;
  let finalHomeDest = match.homeDestruction;
  let finalHomePressing = match.homePressing;
  let finalHomeTempo = match.homeTempo;
  let finalHomeWidth = match.homeWidth;
  let finalHomeMentality = match.homeMentality;
  let finalHomeMarking = match.homeMarking;
  let finalHomeSetPieces: { corners?: number; freeKicks?: number; penalties?: number; captain?: number } | undefined;
  let homeStarterIds: number[] | undefined = Array.isArray(storedInputs?.homeStarterIds)
    ? storedInputs!.homeStarterIds
    : undefined;
  const homeOnVacation = await vacationService.isManagerOnVacation(match.homeClub.manager?.id);
  if (!match.homeClub.manager || homeOnVacation) {
    const npcCoach = !match.homeClub.manager
      ? await npcCoachService.ensureForClub({
          ...match.homeClub,
          budget: moneyToNumber(match.homeClub.budget),
        })
      : null;
    const lineup = await requestLineup(match.homeClub.players as Array<Record<string, unknown>>, {
      objective: npcCoach?.tacticalStyle.objective,
      seed: match.id * 17 + match.homeClubId,
    });
    homeStarterIds = lineup.starterIds; // P1 #106: el XI de la IA se aplica al roster
    finalHomeFormation = npcCoach?.tacticalStyle.favoriteFormation ?? lineup.tactic.formation;
    finalHomeConst = npcCoach?.tacticalStyle.tacticDefaults.construction ?? lineup.tactic.construction;
    finalHomeDest = npcCoach?.tacticalStyle.tacticDefaults.destruction ?? lineup.tactic.destruction;
    finalHomePressing = npcCoach?.tacticalStyle.tacticDefaults.pressing ?? lineup.tactic.pressing ?? finalHomePressing;
    finalHomeTempo = npcCoach?.tacticalStyle.tacticDefaults.tempo ?? lineup.tactic.tempo ?? finalHomeTempo;
    finalHomeWidth = npcCoach?.tacticalStyle.tacticDefaults.width ?? lineup.tactic.width ?? finalHomeWidth;
    finalHomeMentality = String(npcCoach?.tacticalStyle.tacticDefaults.mentality ?? lineup.tactic.mentality ?? finalHomeMentality);
    finalHomeMarking = npcCoach?.tacticalStyle.tacticDefaults.marking ?? (lineup.tactic.marking as string | undefined) ?? finalHomeMarking;
    finalHomeSetPieces = lineup.tactic.setPieceTakers ?? lineup.setPieceTakers;
    if (!auditOnly && homeOnVacation && match.homeClub.manager) {
      await vacationService.logLineupDecision(match.homeClub.manager.id, match.id, match.homeClub.name, lineup.starterIds);
    }
  }

  let finalAwayFormation = match.awayFormation;
  let finalAwayConst = match.awayConstruction;
  let finalAwayDest = match.awayDestruction;
  let finalAwayPressing = match.awayPressing;
  let finalAwayTempo = match.awayTempo;
  let finalAwayWidth = match.awayWidth;
  let finalAwayMentality = match.awayMentality;
  let finalAwayMarking = match.awayMarking;
  let finalAwaySetPieces: { corners?: number; freeKicks?: number; penalties?: number; captain?: number } | undefined;
  let awayStarterIds: number[] | undefined = Array.isArray(storedInputs?.awayStarterIds)
    ? storedInputs!.awayStarterIds
    : undefined;
  const awayOnVacation = await vacationService.isManagerOnVacation(match.awayClub.manager?.id);
  if (!match.awayClub.manager || awayOnVacation) {
    const npcCoach = !match.awayClub.manager
      ? await npcCoachService.ensureForClub({
          ...match.awayClub,
          budget: moneyToNumber(match.awayClub.budget),
        })
      : null;
    const lineup = await requestLineup(match.awayClub.players as Array<Record<string, unknown>>, {
      objective: npcCoach?.tacticalStyle.objective,
      seed: match.id * 19 + match.awayClubId,
    });
    awayStarterIds = lineup.starterIds; // P1 #106
    finalAwayFormation = npcCoach?.tacticalStyle.favoriteFormation ?? lineup.tactic.formation;
    finalAwayConst = npcCoach?.tacticalStyle.tacticDefaults.construction ?? lineup.tactic.construction;
    finalAwayDest = npcCoach?.tacticalStyle.tacticDefaults.destruction ?? lineup.tactic.destruction;
    finalAwayPressing = npcCoach?.tacticalStyle.tacticDefaults.pressing ?? lineup.tactic.pressing ?? finalAwayPressing;
    finalAwayTempo = npcCoach?.tacticalStyle.tacticDefaults.tempo ?? lineup.tactic.tempo ?? finalAwayTempo;
    finalAwayWidth = npcCoach?.tacticalStyle.tacticDefaults.width ?? lineup.tactic.width ?? finalAwayWidth;
    finalAwayMentality = String(npcCoach?.tacticalStyle.tacticDefaults.mentality ?? lineup.tactic.mentality ?? finalAwayMentality);
    finalAwayMarking = npcCoach?.tacticalStyle.tacticDefaults.marking ?? (lineup.tactic.marking as string | undefined) ?? finalAwayMarking;
    finalAwaySetPieces = lineup.tactic.setPieceTakers ?? lineup.setPieceTakers;
    if (!auditOnly && awayOnVacation && match.awayClub.manager) {
      await vacationService.logLineupDecision(match.awayClub.manager.id, match.id, match.awayClub.name, lineup.starterIds);
    }
  }

  // Mentalidad unificada a 0-100 numérico (R3): acepta número serializado ("65"),
  // los strings legacy ('defensive'/'balanced'/'attacking') y valores raros → 50.
  const parseMentality = (m: string | number): number => {
    if (typeof m === 'number' && Number.isFinite(m)) return Math.max(0, Math.min(100, m));
    const n = Number(m);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    if (m === 'attacking') return 75;
    if (m === 'defensive') return 25;
    return 50;
  };

  const competitionType = match.matchday?.competition.type;
  const knockout = Boolean(
    match.matchday?.isKnockout
    || match.isKnockout
    || competitionType === 'cup'
    || competitionType === 'supercup',
  );

  let homeSubsLogic = safeParse(match.homeSubsLogic, undefined) as Record<string, unknown>[] | undefined;
  let awaySubsLogic = safeParse(match.awaySubsLogic, undefined) as Record<string, unknown>[] | undefined;
  if (knockout) {
    if ((!match.homeClub.manager || homeOnVacation) && (!homeSubsLogic || homeSubsLogic.length === 0)) {
      homeSubsLogic = npcCoachService.knockoutConditionalSubs(matchId, match.homeClubId);
    }
    if ((!match.awayClub.manager || awayOnVacation) && (!awaySubsLogic || awaySubsLogic.length === 0)) {
      awaySubsLogic = npcCoachService.knockoutConditionalSubs(matchId, match.awayClubId);
    }
  }

  const homeRoster = buildRoster(match.homeClub.players, homeStarterIds, activeState?.inGameDate);
  const awayRoster = buildRoster(match.awayClub.players, awayStarterIds, activeState?.inGameDate);
  const homePlaybookBonus = storedInputs?.homePlaybookBonus ?? playbookProfileBonus(
    homeActivePlays,
    homeRoster.filter((player) => player.isStarter).flatMap((player) => player.id ?? []),
  );
  const awayPlaybookBonus = storedInputs?.awayPlaybookBonus ?? playbookProfileBonus(
    awayActivePlays,
    awayRoster.filter((player) => player.isStarter).flatMap((player) => player.id ?? []),
  );

  const homeTactic: TacticInput = {
    formation:    finalHomeFormation,
    construction: finalHomeConst,
    destruction:  finalHomeDest,
    pressing:     finalHomePressing,
    tempo:        finalHomeTempo,
    width:        finalHomeWidth,
    mentality:    parseMentality(finalHomeMentality),
    marking:      finalHomeMarking,
    offensiveStyle: match.homeOffensiveStyle || undefined,
    defensiveStyle: match.homeDefensiveStyle || undefined,
    attackZones: safeParse(match.homeAttackZones, undefined),
    defenseReinforcement: safeParse(match.homeDefenseReinforcement, undefined),
    subsLogic: homeSubsLogic,
    setPieceTakers: finalHomeSetPieces,
    profileBonus: homePlaybookBonus,
  };
  const awayTactic: TacticInput = {
    formation:    finalAwayFormation,
    construction: finalAwayConst,
    destruction:  finalAwayDest,
    pressing:     finalAwayPressing,
    tempo:        finalAwayTempo,
    width:        finalAwayWidth,
    mentality:    parseMentality(finalAwayMentality),
    marking:      finalAwayMarking,
    offensiveStyle: match.awayOffensiveStyle || undefined,
    defensiveStyle: match.awayDefensiveStyle || undefined,
    attackZones: safeParse(match.awayAttackZones, undefined),
    defenseReinforcement: safeParse(match.awayDefenseReinforcement, undefined),
    subsLogic: awaySubsLogic,
    setPieceTakers: finalAwaySetPieces,
    profileBonus: awayPlaybookBonus,
  };

  // Semilla determinista: matchId × 1337. Fija para reproducibilidad y auditoría.
  const seed = officialMatchSeed(matchId);
  // P1 #97: eliminatoria real = jornada/partido marcado KO (octavos europeos…)
  // o competición de eliminación directa (copa/supercopa) → prórroga/penaltis.

  // Asistencia para el motor (R3): MISMA fórmula que la taquilla de economy
  // (gateAttendance en tick.logic.ts) — masa social, precio de entradas y aforo.
  const attendancePct = typeof storedInputs?.attendancePct === 'number'
    ? storedInputs.attendancePct
    : gateAttendance({
      stadiumCapacity: match.homeClub.stadiumCapacity,
      fans: match.homeClub.fans,
      socialMass: match.homeClub.socialMass,
      highClass: match.homeClub.highClass,
      reputation: match.homeClub.reputation,
      countryLevel: match.homeClub.countryLevel,
      ticketPriceLevel: match.homeClub.ticketPriceLevel,
    }).pct;

  const engineOptions = {
    knockout,
    weatherCondition: match.weatherCondition,
    temperature: match.temperature,
    attendancePct,
    homeStimulated: typeof storedInputs?.homeStimulated === 'boolean'
      ? storedInputs.homeStimulated
      : (match.homeClub.homeStimulatedUntilTurn ?? 0) >= (activeState?.turn ?? 0),
    coachConfidenceHome: storedInputs?.coachConfidenceHome ?? homeConfidenceRow?.level ?? 50,
    coachConfidenceAway: storedInputs?.coachConfidenceAway ?? awayConfidenceRow?.level ?? 50,
  };

  return { match, matchId, auditOnly, seed, knockout, homeRoster, awayRoster, homeTactic, awayTactic, engineOptions, homeStarterIds, awayStarterIds };
}

type PreparedSimulation = Awaited<ReturnType<typeof prepareMatchSimulation>>;

type ScalingCompetition = {
  id: number;
  type: string;
  tier: number;
  country: string;
  humanManagersCount: number;
  activityScore: number;
  defaultSimulationTier: string;
};

type ScalingMatchday = {
  id: number;
  type: string;
  isKnockout: boolean;
  matches: Array<{
    id: number;
    homeClubId: number;
    awayClubId: number;
    isKnockout: boolean;
    round: string | null;
    homeClub: { manager: { id: number } | null };
    awayClub: { manager: { id: number } | null };
  }>;
};

function scalingShardFor(country: string, tier: number): string {
  return `${country || 'world'}:${Math.max(1, tier)}`.toLowerCase().slice(0, 80);
}

function configuredProcessingShards(): string[] {
  const raw = process.env.TICK_PROCESSING_SHARDS ?? process.env.TICK_PROCESSING_SHARD ?? '';
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

function processingShardWhere(onlyShards?: string[]): Prisma.CompetitionWhereInput {
  const shards = onlyShards?.length ? onlyShards : configuredProcessingShards();
  if (shards.length === 0) return {};
  return {
    OR: shards.map((shard) => shard.endsWith('*')
      ? { processingShard: { startsWith: shard.slice(0, -1) } }
      : { processingShard: shard }),
  };
}

async function listDistinctProcessingShards(seasonId: number): Promise<string[]> {
  const rows = await prisma.competition.findMany({
    where: { seasonId, processingShard: { not: null } },
    select: { processingShard: true },
    distinct: ['processingShard'],
  });
  return rows.map((r) => r.processingShard).filter((s): s is string => Boolean(s));
}

type AdvanceWeekResult = {
  week: number;
  matchesSimulated: number;
  matchIds: number[];
  matchdaysSimulated: number[];
  competitionIncomesSettled: number;
  processingShards: string[];
};

// ─── N1-2 · Contrato de fase shard-only + consolidación ───────────────────────
// La simulación de partidos de un turno es paralelizable por shard
// (`processingShard` = continente·país·tier): las competiciones de shards
// distintos son DISJUNTAS (clubes, standings, brackets y finanzas no se cruzan
// entre continentes), así que cada una puede simularse en un worker independiente.
// Lo que NO es paralelizable y debe correr UNA sola vez tras fusionar todos los
// shards (consolidación): el avance del contador `week`/`seasonWeek` y
// `finalizeSeasonIfComplete` (premios, coeficientes, carrera NPC). Y, fuera de
// `advanceWeek`, los pasos globales de `processTick` (finanzas, entrenos, mercado,
// lesiones, caché…). Determinismo: cada partido usa semilla `matchId × 1337`,
// independiente del orden → el resultado es idéntico procese quien procese cada
// shard, siempre que la consolidación global la ejecute UN único orquestador.
export interface ShardSimulationResult {
  /** Claves de shard cubiertas por esta fase (vacío = mundo entero, single-process). */
  shardKeys: string[];
  /** IDs de partidos simulados y persistidos en esta fase. */
  matchIds: number[];
  /** IDs de jornadas que quedaron completas en esta fase. */
  matchdaysSimulated: number[];
  /** Premios de competición devengados en esta fase (sumables entre shards). */
  competitionIncomesSettled: number;
  /** Competiciones del shard que tenían jornada pendiente este turno. */
  competitionsProcessed: number;
}

type TickSettings = Awaited<ReturnType<typeof masterService.getSettings>>;

/**
 * N1-2 · FASE SHARD-ONLY. Simula la jornada pendiente de cada competición que
 * caiga en `shardWhere` para este turno. Muta SOLO filas locales al shard
 * (matches/standings/matchdays/brackets/finance-snapshots de esas competiciones);
 * NO avanza `week`/`seasonWeek` ni llama a `finalizeSeasonIfComplete` (eso es
 * consolidación global). Reproducible por semilla. Pensada para llamarse:
 *  - una vez (single-process: `shardWhere` cubre todos los shards configurados), o
 *  - una vez por continente desde un worker paralelo (Codex), fusionando luego
 *    los `ShardSimulationResult` con `consolidateShardResults`.
 */
async function simulateShardPhase(params: {
  seasonId: number;
  inGameDay: number;
  shardWhere: Prisma.CompetitionWhereInput;
  shardKeys: string[];
  settings: TickSettings;
}): Promise<ShardSimulationResult> {
  const { seasonId, inGameDay, shardWhere, shardKeys, settings } = params;

  const competitions = await prisma.competition.findMany({
    where: { seasonId, ...shardWhere },
    select: {
      id: true,
      type: true,
      tier: true,
      country: true,
      humanManagersCount: true,
      activityScore: true,
      defaultSimulationTier: true,
    },
    orderBy: [{ type: 'asc' }, { tier: 'asc' }, { country: 'asc' }, { id: 'asc' }],
  });

  const simulated: number[] = [];
  const simulatedMatchdays: number[] = [];
  let competitionIncomesSettled = 0;
  let competitionsProcessed = 0;

  let allowedTypes: string[] = [];
  if (inGameDay === 0) allowedTypes = ['league', 'friendly'];
  // 'european' defensivo: competiciones legacy creadas antes de la migración
  // 'european'→'league_phase' (P0 #4) siguen simulándose en miércoles.
  else if (inGameDay === 3) allowedTypes = ['cup', 'league_phase', 'supercup', 'friendly', 'european'];
  // Viernes (inGameDay === 5) -> descanso absoluto, allowedTypes = []

  for (const competition of competitions) {
    if (!allowedTypes.includes(competition.type)) continue;
    if (competition.type === 'cup' && settings.featureFlags.cup === false) continue;

    const currentMatchday = await prisma.matchday.findFirst({
      where: {
        competitionId: competition.id,
        status: 'pending',
        matches: { some: { status: 'scheduled' } },
      },
      orderBy: { number: 'asc' },
      include: {
        matches: {
          where: { status: 'scheduled' },
          orderBy: { id: 'asc' },
          include: {
            homeClub: { select: { manager: { select: { id: true } } } },
            awayClub: { select: { manager: { select: { id: true } } } },
          },
        },
      },
    });

    if (!currentMatchday) continue;
    competitionsProcessed++;
    await refreshMatchdayScalingMetadata(competition, currentMatchday);

    // C8 · BATCH: preparar todos los partidos de la jornada y simularlos en UNA
    // llamada HTTP al motor (simulateGamesBatch tiene fallback a partido-a-partido
    // y a motor TS: nunca pierde partidos). Misma semilla por partido (id×1337)
    // ⇒ resultados bit a bit idénticos al bucle anterior; la persistencia se
    // ejecuta en el MISMO orden secuencial de siempre.
    // P1 #104: captura POR PARTIDO — un partido corrupto (datos rotos, fallo de
    // preparación o de persistencia) ya no aborta el turno entero; se loguea y
    // queda 'scheduled' para reintentarse (misma semilla → mismo resultado).
    // P1 #105: preparación EN PARALELO — con el motor caído, los timeouts de
    // requestLineup de los NPC se solapan en vez de sumarse en serie (antes
    // ~17 min con 100 partidos, rozando el auto-release del lock).
    const prepResults = await Promise.all(currentMatchday.matches.map(async (match) => {
      try {
        return await prepareMatchSimulation(match.id);
      } catch (err) {
        console.error(`[tick] error preparando el partido ${match.id} (continúa la jornada):`, err);
        return null;
      }
    }));
    const preps: PreparedSimulation[] = prepResults.filter((p): p is PreparedSimulation => p != null);
    const batchResults = await simulateGamesBatch(preps.map(p => ({
      id: String(p.matchId),
      homeRoster: p.homeRoster,
      awayRoster: p.awayRoster,
      homeTactic: p.homeTactic,
      awayTactic: p.awayTactic,
      seed: p.seed,
      options: p.engineOptions,
    })));
    for (const prep of preps) {
      try {
        const result = batchResults.get(String(prep.matchId));
        if (!result) throw new Error(`Batch sin resultado para el partido ${prep.matchId}`);
        await persistMatchResult(prep, result);
        simulated.push(prep.matchId);
      } catch (err) {
        console.error(`[tick] error persistiendo el partido ${prep.matchId} (continúa la jornada):`, err);
      }
    }

    if (await isMatchdayFullyPlayed(currentMatchday.id)) {
      await prisma.matchday.update({
        where: { id: currentMatchday.id },
        data:  { status: 'simulated' },
      });
      simulatedMatchdays.push(currentMatchday.id);
      // §EconomíaEuropea: barrido de premios POR RONDA al cerrar la jornada de
      // copa/europea/supercopa. Complementa el settle por-partido de
      // persistMatchResult (cuyo catch no aborta el turno): si algún partido se
      // quedó sin devengar, aquí se recupera. Idempotente por clave única
      // compincome:<matchId>:<concepto> en FinanceSnapshot.season → repetir
      // la llamada nunca paga dos veces.
      if (['cup', 'supercup', 'league_phase', 'european'].includes(competition.type)) {
        try {
          const settled = await economyService.settleCompetitionIncome({ roundId: currentMatchday.id });
          competitionIncomesSettled += settled.settled;
        } catch (err) {
          console.error(`[tick] error devengando premios de la ronda ${currentMatchday.id} (continúa la jornada):`, err);
        }
      }
      if (competition.type === 'cup' || competition.type === 'supercup') {
        const groupMatchday = await matchdayHasGroupMatches(currentMatchday.id);
        if (groupMatchday) {
          if (settings.featureFlags.groups !== false) {
            await advanceGroupsToKnockout(competition.id);
          }
        } else {
          // P1 #97: también las supercopas avanzan su cuadro (antes solo 'cup').
          await advanceCupBracket(currentMatchday.id);
        }
      } else if (competition.type === 'league_phase' || competition.type === 'european') {
        if (currentMatchday.isKnockout) {
          // P1 #97: rondas KO europeas (octavos en adelante) avanzan el cuadro.
          await advanceCupBracket(currentMatchday.id);
        } else {
          // Si termina la fase liga, sembrar los octavos.
          const allLeaguePhaseDone = await prisma.matchday.count({
            where: { competitionId: competition.id, type: 'league_phase', status: 'pending' }
          });
          if (allLeaguePhaseDone === 0) {
            await advanceLeaguePhaseToKnockout(competition.id);
          }
        }
      }
    }
  }

  return {
    shardKeys,
    matchIds: simulated,
    matchdaysSimulated: simulatedMatchdays,
    competitionIncomesSettled,
    competitionsProcessed,
  };
}

/**
 * N1-2 · CONSOLIDACIÓN GLOBAL. Fusiona los resultados de una o varias fases
 * shard-only y aplica los efectos que deben correr UNA sola vez por turno:
 * avance de `week`/`seasonWeek` (solo si hubo jornada) y `finalizeSeasonIfComplete`.
 * Debe ejecutarla un ÚNICO orquestador (Node), nunca cada worker. Devuelve el
 * mismo shape que el antiguo `advanceWeek`.
 */
async function consolidateShardResults(
  state: { id: number; week: number; seasonId: number; seasonWeek?: number },
  newWeek: number,
  results: ShardSimulationResult[],
  processingShards: string[],
) {
  const matchIds = results.flatMap((r) => r.matchIds);
  const matchdaysSimulated = results.flatMap((r) => r.matchdaysSimulated);
  const competitionIncomesSettled = results.reduce((sum, r) => sum + r.competitionIncomesSettled, 0);

  // P3 #126: week solo avanza si HUBO jornada simulada (los viernes de descanso
  // y turnos sin partidos derivaban el contador frente a la jornada real).
  const weekAdvanced = matchIds.length > 0;
  if (weekAdvanced) {
    await prisma.gameState.update({
      where: { id: state.id },
      // Q2: seasonWeek avanza en paralelo a week y se resetea a 1 en el
      // rollover de temporada (generateNewSeason). Cast defensivo hasta
      // regenerar el cliente Prisma.
      data:  { week: newWeek, seasonWeek: (state.seasonWeek ?? 1) + 1 } as Record<string, unknown>,
    });
  }
  await finalizeSeasonIfComplete(state.seasonId);

  return {
    week: weekAdvanced ? newWeek : state.week,
    matchesSimulated: matchIds.length,
    matchIds,
    matchdaysSimulated,
    competitionIncomesSettled,
    processingShards,
  };
}

async function refreshMatchdayScalingMetadata(competition: ScalingCompetition, matchday: ScalingMatchday) {
  if (matchday.matches.length === 0) return;

  const clubIds = [...new Set(matchday.matches.flatMap((match) => [match.homeClubId, match.awayClubId]))];
  const [rivalries, standings, playedMatches] = await Promise.all([
    prisma.rivalry.findMany({
      where: { clubAId: { in: clubIds }, clubBId: { in: clubIds } },
      select: { clubAId: true, clubBId: true },
    }),
    prisma.standing.findMany({
      where: { competitionId: competition.id },
      select: {
        clubId: true,
        points: true,
        goalsFor: true,
        goalsAgainst: true,
        club: {
          select: {
            manager: { select: { user: { select: { lastLoginAt: true } } } },
          },
        },
      },
    }),
    prisma.match.findMany({
      where: { matchday: { competitionId: competition.id }, status: 'played' },
      select: {
        homeClubId: true,
        awayClubId: true,
        homeGoals: true,
        awayGoals: true,
        status: true,
      },
    }),
  ]);

  const rivalryKeys = new Set(
    rivalries.map((r) => `${Math.min(r.clubAId, r.clubBId)}-${Math.max(r.clubAId, r.clubBId)}`),
  );
  const sortedTable = sortStandings(withHeadToHeadPoints(standings, playedMatches));
  const rankByClub = new Map(sortedTable.map((row, index) => [row.clubId, index + 1]));
  const humanRows = standings.filter((row) => row.club.manager != null);
  const lastHumanLoginAt = humanRows
    .map((row) => row.club.manager?.user.lastLoginAt ?? null)
    .filter((date): date is Date => date instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const activeSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentlyActive = humanRows.filter((row) => {
    const lastLogin = row.club.manager?.user.lastLoginAt;
    return lastLogin instanceof Date && lastLogin.getTime() >= activeSince.getTime();
  }).length;
  const tableSize = Math.max(standings.length, matchday.matches.length * 2, 1);
  const humanManagersCount = humanRows.length;
  const activityScore = Math.min(100, Math.round(
    humanManagersCount * 9
    + recentlyActive * 8
    + Math.max(0, 4 - competition.tier) * 6,
  ));
  const humanStatus = humanManagersCount >= tableSize
    ? 'CLOSED'
    : humanManagersCount >= Math.max(6, Math.floor(tableSize * 0.65))
      ? 'WAITLIST'
      : 'OPEN';
  const defaultPriority = computeMatchPriority({
    competitionType: competition.type,
    competitionTier: competition.tier,
    humanManagersCount,
    activityScore,
    isKnockout: matchday.isKnockout,
  });

  await prisma.competition.update({
    where: { id: competition.id },
    data: {
      humanManagersCount,
      activityScore,
      humanStatus,
      defaultSimulationTier: defaultPriority.tier,
      lastHumanLoginAt,
      processingShard: scalingShardFor(competition.country, competition.tier),
    },
  });

  await Promise.all(matchday.matches.map((match) => {
    const homeRank = rankByClub.get(match.homeClubId) ?? tableSize;
    const awayRank = rankByClub.get(match.awayClubId) ?? tableSize;
    const promotionOrTitleRace = competition.type === 'league'
      && (Math.min(homeRank, awayRank) <= 3 || Math.max(homeRank, awayRank) >= Math.max(1, tableSize - 2));
    const pairKey = `${Math.min(match.homeClubId, match.awayClubId)}-${Math.max(match.homeClubId, match.awayClubId)}`;
    const priority = computeMatchPriority({
      homeHasHumanManager: match.homeClub.manager != null,
      awayHasHumanManager: match.awayClub.manager != null,
      competitionType: competition.type,
      competitionTier: competition.tier,
      humanManagersCount,
      activityScore,
      isKnockout: matchday.isKnockout || match.isKnockout,
      round: match.round,
      isRivalry: rivalryKeys.has(pairKey),
      isPromotionOrTitleRace: promotionOrTitleRace,
    });

    return prisma.match.updateMany({
      where: { id: match.id, status: 'scheduled' },
      data: {
        priorityScore: priority.score,
        simulationTier: priority.tier,
        hasTimeline: priority.hasTimeline,
        hasAdvancedStats: priority.hasAdvancedStats,
      },
    });
  }));
}

/** Simula y persiste UN partido (compone prepare + simulate + persist). */
async function simulateAndSave(matchId: number, options: SimulateMatchOptions = {}) {
  const prep = await prepareMatchSimulation(matchId, options);
  // Motor Python por jugador (ENGINE_URL) con fallback automático al motor TS.
  const result = await simulateGame(
    prep.homeRoster, prep.awayRoster,
    prep.homeTactic, prep.awayTactic,
    prep.seed,
    prep.engineOptions,
  );
  return persistMatchResult(prep, result);
}

type MatchPersistencePolicy = {
  tier: 'A' | 'B' | 'C';
  priorityScore: number;
  storeTimeline: boolean;
  storeAdvancedStats: boolean;
  seedRegenerable: boolean;
};

function matchPersistencePolicy(match: PreparedSimulation['match']): MatchPersistencePolicy {
  const rawTier = String(match.simulationTier ?? 'A').toUpperCase();
  const tier = rawTier === 'B' || rawTier === 'C' ? rawTier : 'A';
  const hasTimeline = match.hasTimeline !== false;
  const hasAdvancedStats = match.hasAdvancedStats !== false;
  return {
    tier,
    priorityScore: match.priorityScore ?? 0,
    storeTimeline: tier !== 'C' && hasTimeline,
    storeAdvancedStats: tier === 'A' && hasAdvancedStats,
    seedRegenerable: true,
  };
}

function timelineForPersistence(timeline: unknown[], policy: MatchPersistencePolicy): unknown[] {
  if (!policy.storeTimeline) return [];
  if (policy.storeAdvancedStats) return timeline;
  // Tier B conserva relato jugable, pero retira duelos/cadenas pesadas.
  return timeline.map((entry) => {
    if (!entry || typeof entry !== 'object') return entry;
    const basic = { ...entry } as Record<string, unknown>;
    delete basic.duel;
    delete basic.chain;
    return basic;
  });
}

function statsForJson(stats: Array<Record<string, unknown>>, policy: MatchPersistencePolicy): Array<Record<string, unknown>> {
  if (policy.tier === 'C') return [];
  if (policy.storeAdvancedStats) return stats;
  return stats.map((stat) => {
    const basic = { ...stat };
    delete basic.xG;
    delete basic.keyPasses;
    delete basic.interceptions;
    delete basic.tackles;
    return basic;
  });
}

/** 2.ª mitad del antiguo simulateAndSave (persistencia) — lógica INTACTA. */
async function persistMatchResult(prep: PreparedSimulation, result: EngineResult) {
  const { match, matchId, auditOnly, seed, knockout } = prep;
  const events = result.events as EngineEvent[];
  const homePlayers = match.homeClub.players.map(player => ({ id: player.id, name: player.name }));
  const awayPlayers = match.awayClub.players.map(player => ({ id: player.id, name: player.name }));
  const homePlayerStats = (result.homeRatings ?? []).map((r: PlayerRating) => ({
    matchId,
    playerId: r.playerId ? toInt(r.playerId) : undefined,
    name: r.name,
    position: r.position,
    rating: r.rating,
    goals: r.goals,
    assists: r.assists ?? 0,
    minutes: r.minutes ?? 90,
    shots: r.shots ?? 0,
    shotsOnTarget: r.shotsOnTarget ?? 0,
    passes: r.passes ?? 0,
    passesCompleted: r.passesCompleted ?? 0,
    passAccuracy: r.passAccuracy ?? 0,
    tackles: r.tackles ?? 0,
    interceptions: r.interceptions ?? 0,
    keyPasses: r.keyPasses ?? 0,
    xG: r.xG ?? r.xg ?? 0.0,
  }));
  const awayPlayerStats = (result.awayRatings ?? []).map((r: PlayerRating) => ({
    matchId,
    playerId: r.playerId ? toInt(r.playerId) : undefined,
    name: r.name,
    position: r.position,
    rating: r.rating,
    goals: r.goals,
    assists: r.assists ?? 0,
    minutes: r.minutes ?? 90,
    shots: r.shots ?? 0,
    shotsOnTarget: r.shotsOnTarget ?? 0,
    passes: r.passes ?? 0,
    passesCompleted: r.passesCompleted ?? 0,
    passAccuracy: r.passAccuracy ?? 0,
    tackles: r.tackles ?? 0,
    interceptions: r.interceptions ?? 0,
    keyPasses: r.keyPasses ?? 0,
    xG: r.xG ?? r.xg ?? 0.0,
  }));
  const homeIds = idByName(homePlayers);
  const awayIds = idByName(awayPlayers);
  const matchInjuries = normalizeEngineInjuries(
    matchId,
    result.injuries,
    events,
    homePlayers,
    awayPlayers,
    homeIds,
    awayIds,
  );
  const timeline = result.timeline ?? result.replay ?? [];
  const persistence = matchPersistencePolicy(match);
  const storedTimeline = timelineForPersistence(timeline as unknown[], persistence);
  const homeJsonPlayerStats = statsForJson(homePlayerStats, persistence);
  const awayJsonPlayerStats = statsForJson(awayPlayerStats, persistence);
  const knockoutMeta = resolveKnockout(
    result,
    match.homeClubId,
    match.awayClubId,
    seed,
    knockout,
  );
  const persistedStats = safeParse<Record<string, unknown>>(match.homeStatsJson, {});
  const persistedSeedRaw = Number(persistedStats.seed);
  const persistedSeed = Number.isFinite(persistedSeedRaw) ? persistedSeedRaw : null;

  if (auditOnly) {
    return {
      mode: 'audit',
      matchId,
      seed,
      persisted: {
        status: match.status,
        homeGoals: match.homeGoals,
        awayGoals: match.awayGoals,
        seed: persistedSeed,
        playedAt: match.playedAt,
      },
      resimulated: {
        homeGoals: result.homeGoals,
        awayGoals: result.awayGoals,
        motm: result.motm,
        winnerClubId: knockoutMeta.winnerClubId,
        penalties: knockoutMeta.penalties,
      },
      reproducesPersistedScore: match.homeGoals === result.homeGoals
        && match.awayGoals === result.awayGoals
        && (persistedSeed == null || persistedSeed === seed),
      events: result.events,
      timeline,
      tacticalChanges: result.tacticalChanges ?? [],
      homeRatings: result.homeRatings ?? [],
      awayRatings: result.awayRatings ?? [],
      persistence,
      uiNeed: '// NECESITO: Antigravity debe conectar AdminPage con re-sim semilla audit-only sin mutar standings/XP/finanzas.',
    };
  }

  // ─── Persistencia ATÓMICA (auditoría P0 #3 + P1 #95) ───────────────────────
  // Todo lo crítico (partido + stats + eventos + standings) va en UNA transacción
  // con claim atómico `updateMany({ id, status:'scheduled' })`: si otro proceso ya
  // persistió este partido (doble tick, simulateMatch admin concurrente), count=0
  // y retornamos idempotentes sin tocar nada. Un crash a mitad revierte TODO: el
  // partido sigue 'scheduled' y el siguiente tick lo re-simula con la misma
  // semilla (matchId×1337) → mismo resultado. Fuera de la transacción quedan los
  // pasos idempotentes o no críticos: coeficientes, decay/XP, broadcast e ingresos
  // (settleCompetitionIncome, protegido por unique propio).
  const matchUpdateData = {
      homeGoals:     result.homeGoals,
      awayGoals:     result.awayGoals,
      status:        'played',
      playedAt:      new Date(),
      winner:        knockoutMeta.winnerTeam ?? null,
      decidedBy:     persistedDecision(result, knockoutMeta),
      penaltiesHome: knockoutMeta.penalties?.home ?? null,
      penaltiesAway: knockoutMeta.penalties?.away ?? null,
      homeStatsJson: JSON.stringify({
        ...result.homeStats,
        ratings: homeJsonPlayerStats,
        playerStats: homeJsonPlayerStats,
        injuries: matchInjuries.filter(injury => injury.team === 'home'),
        allInjuries: matchInjuries,
        tacticalChanges: result.tacticalChanges ?? [],
        replay: storedTimeline,
        timeline: storedTimeline,
        seed,
        pruned: !persistence.storeTimeline,
        compact: persistence.tier === 'C',
        tierPersistence: {
          tier: persistence.tier,
          priorityScore: persistence.priorityScore,
          timelineStored: persistence.storeTimeline,
          advancedStatsStored: persistence.storeAdvancedStats,
          seedRegenerable: persistence.seedRegenerable,
        },
        knockout: knockoutMeta.knockout,
        winnerClubId: knockoutMeta.winnerClubId,
        winnerTeam: knockoutMeta.winnerTeam,
        penalties: knockoutMeta.penalties,
        competitionId: match.matchday?.competitionId ?? null,
        matchdayId: match.matchdayId,
        weatherCondition: match.weatherCondition,
        temperature: match.temperature,
        simulationInputs: {
          attendancePct: prep.engineOptions.attendancePct,
          homeStimulated: prep.engineOptions.homeStimulated,
          coachConfidenceHome: prep.engineOptions.coachConfidenceHome,
          coachConfidenceAway: prep.engineOptions.coachConfidenceAway,
          homePlaybookBonus: prep.homeTactic.profileBonus,
          awayPlaybookBonus: prep.awayTactic.profileBonus,
          homeStarterIds: prep.homeStarterIds ?? prep.homeRoster.map((p) => Number(p.id)).filter((id) => Number.isFinite(id)),
          awayStarterIds: prep.awayStarterIds ?? prep.awayRoster.map((p) => Number(p.id)).filter((id) => Number.isFinite(id)),
        },
      }),
      awayStatsJson: JSON.stringify({
        ...result.awayStats,
        ratings: awayJsonPlayerStats,
        playerStats: awayJsonPlayerStats,
        injuries: matchInjuries.filter(injury => injury.team === 'away'),
        compact: persistence.tier === 'C',
        tierPersistence: {
          tier: persistence.tier,
          priorityScore: persistence.priorityScore,
          advancedStatsStored: persistence.storeAdvancedStats,
        },
        knockout: knockoutMeta.knockout,
        winnerClubId: knockoutMeta.winnerClubId,
        winnerTeam: knockoutMeta.winnerTeam,
        penalties: knockoutMeta.penalties,
        competitionId: match.matchday?.competitionId ?? null,
        matchdayId: match.matchdayId,
        weatherCondition: match.weatherCondition,
        temperature: match.temperature,
      }),
      motm:          result.motm,
  };

  const persistedOk = await prisma.$transaction(async (tx) => {
  // Claim atómico: solo UN proceso puede pasar el partido de scheduled→played.
  const claim = await tx.match.updateMany({
    where: { id: matchId, status: 'scheduled' },
    data: matchUpdateData,
  });
  if (claim.count === 0) return false;

  // Persist PlayerMatchStat
  const allStats = [...homePlayerStats, ...awayPlayerStats];
  const validStats = allStats.filter(s => s.playerId !== undefined && s.playerId !== null);
  if (validStats.length > 0) {
    await tx.playerMatchStat.createMany({
      data: validStats.map(s => ({
        matchId,
        playerId: s.playerId!,
        name: s.name ?? null,
        position: s.position ?? null,
        rating: s.rating,
        goals: s.goals,
        assists: s.assists,
        minutes: s.minutes,
        shots: s.shots || 0,
        passes: s.passes || 0,
        xG: s.xG || 0,
        shotsOnTarget: s.shotsOnTarget || 0,
        passesCompleted: s.passesCompleted || 0,
        passAccuracy: s.passAccuracy || 0,
        tackles: s.tackles || 0,
        interceptions: s.interceptions || 0,
        keyPasses: s.keyPasses || 0,
        shotmap: JSON.stringify({
          shotsOnTarget: s.shotsOnTarget || 0,
          passesCompleted: s.passesCompleted || 0,
          passAccuracy: s.passAccuracy || 0,
          tackles: s.tackles || 0,
          interceptions: s.interceptions || 0,
          keyPasses: s.keyPasses || 0,
        }),
      })),
      skipDuplicates: true,
    });

    const seasonId = match.matchday?.competition?.seasonId;
    if (seasonId) {
      await Promise.all(validStats.map(async (s) => {
        if (!s.playerId) return;
        const rating = s.rating || 0;
        const ratingCount = rating > 0 ? 1 : 0;
        await tx.playerSeasonStat.upsert({
          where: { playerId_seasonId: { playerId: s.playerId, seasonId } },
          create: {
            playerId: s.playerId,
            seasonId,
            matchesPlayed: 1,
            minutes: s.minutes || 0,
            goals: s.goals || 0,
            assists: s.assists || 0,
            shots: s.shots || 0,
            shotsOnTarget: 0,
            keyPasses: 0,
            interceptions: 0,
            xG: s.xG || 0,
            ratingCount,
            ratingTotal: rating,
            averageRating: rating,
          },
          update: {
            matchesPlayed: { increment: 1 },
            minutes: { increment: s.minutes || 0 },
            goals: { increment: s.goals || 0 },
            assists: { increment: s.assists || 0 },
            shots: { increment: s.shots || 0 },
            xG: { increment: s.xG || 0 },
            ratingCount: { increment: ratingCount },
            ratingTotal: { increment: rating },
          },
        });
      }));
      
      // Recalcular averageRating tras el upsert (Prisma no divide en update;
      // sin esto el campo se quedaba con la PRIMERA nota para siempre — A4).
      // Acotado a los jugadores DEL PARTIDO, no a toda la temporada (P2 #109).
      const statPlayerIds = validStats.map(s => s.playerId!).filter(Boolean);
      await tx.$executeRaw`
        UPDATE "PlayerSeasonStat"
        SET "averageRating" = CASE WHEN "ratingCount" > 0
          THEN "ratingTotal" / "ratingCount" ELSE 0 END
        WHERE "seasonId" = ${seasonId}
          AND "playerId" IN (${Prisma.join(statPlayerIds)});`;
    }
  }

  // Persist events
  if (events.length > 0) {
    await tx.matchEvent.createMany({
      data: events.map((event) => {
        const playerId = eventPlayerId(event, homeIds, awayIds);
        return {
          matchId,
          playerId,
          type:        event.type,
          minute:      event.minute,
          team:        event.team,
          description: event.description,
          cardCount:   eventCardCount(event),
        };
      }),
    });
  }

  // Update standings (dentro de la transacción: partido y clasificación o TODO o NADA)
  await updateStandings(tx, match.matchdayId, match.homeClubId, match.awayClubId, result.homeGoals, result.awayGoals);

  return true;
  }, { timeout: 20000 });

  if (!persistedOk) {
    // Otro proceso ya persistió este partido: retorno idempotente, sin duplicar
    // standings/stats/XP (P1 #95: simulateMatch admin concurrente con el tick).
    return {
      matchId,
      homeGoals: result.homeGoals,
      awayGoals: result.awayGoals,
      motm:      result.motm,
      events:    result.events,
      winnerClubId: knockoutMeta.winnerClubId,
      penalties: knockoutMeta.penalties,
      alreadyPersisted: true,
    };
  }

  // E2: Update Coefficients if it's a continental competition (idempotente por partido)
  if (match.matchday?.competition?.isContinental) {
    const fresh = await prisma.match.findUnique({ where: { id: matchId }, select: { homeStatsJson: true } });
    let stats: Record<string, unknown> = {};
    try {
      stats = fresh?.homeStatsJson ? JSON.parse(fresh.homeStatsJson as string) : {};
    } catch {
      stats = {};
    }
    if (!stats.coefficientAwarded) {
      const seasonId = match.matchday.competition.seasonId;
      let homePts = 0;
      let awayPts = 0;

      if (result.homeGoals > result.awayGoals) { homePts = 2; awayPts = 0; }
      else if (result.awayGoals > result.homeGoals) { homePts = 0; awayPts = 2; }
      else { homePts = 1; awayPts = 1; }

      const competitionCode = match.matchday.competition.shortName || match.matchday.competition.name;
      await coefficientService.awardMatchPoints(match.homeClubId, seasonId, competitionCode, homePts === 2, homePts === 1);
      await coefficientService.awardMatchPoints(match.awayClubId, seasonId, competitionCode, awayPts === 2, awayPts === 1);
      stats.coefficientAwarded = true;
      await prisma.match.update({
        where: { id: matchId },
        data: { homeStatsJson: JSON.stringify(stats) },
      });
    }
  }

  // Fitness decay and experience gain for starters
  // WT3: la formación con la que se jugó modula el desgaste (demanda física).
  await decayFitness(match.homeClubId, seed, prep.homeTactic.formation);
  await decayFitness(match.awayClubId, seed + 1, prep.awayTactic.formation);
  await grantExperience(match.homeClubId, seed);
  await grantExperience(match.awayClubId, seed + 1);
  await applyMatchMorale(
    match.homeClubId,
    match.awayClubId,
    result.homeGoals,
    result.awayGoals,
    knockoutMeta.winnerClubId ?? null,
  );
  
  // Grant manager XP and update stats based on match result
  await grantManagerExperience(
    match.homeClubId,
    match.awayClubId,
    result.homeGoals,
    result.awayGoals,
    match.matchday?.competitionId ?? null,
    (knockoutMeta.knockout ? knockoutMeta.winnerClubId : null) ?? null
  );

  // Broadcast events and settle match income
  if (match.matchday?.competition?.type === 'league') {
    const goalManagers = await prisma.manager.findMany({
      where: { clubId: { in: [match.homeClubId, match.awayClubId] } },
      select: { clubId: true, userId: true },
    });
    const userIdByClubId = new Map(goalManagers.map(manager => [manager.clubId, manager.userId]));
    broadcastLeagueMatchTimeline({
      leagueId: match.matchday.competition.id,
      matchId: match.id,
      homeClubId: match.homeClubId,
      awayClubId: match.awayClubId,
      events: result.events.map((e: any) => ({
        minute: e.minute,
        type: e.type,
        team: e.team,
        description: e.detail || '',
      })),
      onGoal: (event) => {
        const homeUserId = userIdByClubId.get(match.homeClubId);
        const awayUserId = userIdByClubId.get(match.awayClubId);
        if (homeUserId) void pushLiveGoal(homeUserId, match.id, event.description);
        if (awayUserId && awayUserId !== homeUserId) void pushLiveGoal(awayUserId, match.id, event.description);
      },
    });
  }

  try {
    await economyService.settleCompetitionIncome({ matchId });
  } catch (err) {
    console.error(`Error settling income for match ${matchId}:`, err);
  }

  return {
    matchId,
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    motm:      result.motm,
    events:    result.events,
    winnerClubId: knockoutMeta.winnerClubId,
    penalties: knockoutMeta.penalties,
  };
}

async function updateStandings(
  db: Prisma.TransactionClient,
  matchdayId: number | null,
  homeClubId: number,
  awayClubId: number,
  homeGoals: number,
  awayGoals: number
) {
  if (!matchdayId) return;

  const matchday = await db.matchday.findUnique({
    where: { id: matchdayId },
    select: { competitionId: true, competition: { select: { type: true } } },
  });
  if (!matchday) return;
  // P1 #96: las fases liga europeas (league_phase) TAMBIÉN puntúan en Standing;
  // sin esto los octavos se sembraban con standings a 0 (orden de id).
  if (matchday.competition.type !== 'league' && matchday.competition.type !== 'league_phase') return;

  const competitionId = matchday.competitionId;
  const homeWon  = homeGoals > awayGoals;
  const awayWon  = awayGoals > homeGoals;
  const isDraw   = homeGoals === awayGoals;

  const homeDelta = {
    won: homeWon ? 1 : 0,
    drawn: isDraw ? 1 : 0,
    lost: awayWon ? 1 : 0,
    goalsFor: homeGoals,
    goalsAgainst: awayGoals,
    points: homeWon ? 3 : isDraw ? 1 : 0,
  };
  const awayDelta = {
    won: awayWon ? 1 : 0,
    drawn: isDraw ? 1 : 0,
    lost: homeWon ? 1 : 0,
    goalsFor: awayGoals,
    goalsAgainst: homeGoals,
    points: awayWon ? 3 : isDraw ? 1 : 0,
  };

  await db.$executeRaw`
    INSERT INTO "Standing"
      ("competitionId", "clubId", "played", "won", "drawn", "lost", "goalsFor", "goalsAgainst", "points")
    VALUES
      (${competitionId}, ${homeClubId}, 1, ${homeDelta.won}, ${homeDelta.drawn}, ${homeDelta.lost}, ${homeDelta.goalsFor}, ${homeDelta.goalsAgainst}, ${homeDelta.points}),
      (${competitionId}, ${awayClubId}, 1, ${awayDelta.won}, ${awayDelta.drawn}, ${awayDelta.lost}, ${awayDelta.goalsFor}, ${awayDelta.goalsAgainst}, ${awayDelta.points})
    ON CONFLICT ("competitionId", "clubId") DO UPDATE SET
      "played" = "Standing"."played" + EXCLUDED."played",
      "won" = "Standing"."won" + EXCLUDED."won",
      "drawn" = "Standing"."drawn" + EXCLUDED."drawn",
      "lost" = "Standing"."lost" + EXCLUDED."lost",
      "goalsFor" = "Standing"."goalsFor" + EXCLUDED."goalsFor",
      "goalsAgainst" = "Standing"."goalsAgainst" + EXCLUDED."goalsAgainst",
      "points" = "Standing"."points" + EXCLUDED."points";
  `;
}

async function isMatchdayFullyPlayed(matchdayId: number): Promise<boolean> {
  const scheduled = await prisma.match.count({
    where: { matchdayId, status: 'scheduled' },
  });
  return scheduled === 0;
}

async function matchdayHasGroupMatches(matchdayId: number): Promise<boolean> {
  const count = await prisma.match.count({
    where: { matchdayId, groupName: { not: null } },
  });
  return count > 0;
}

function winnerFromStoredStats(match: {
  id: number;
  homeClubId: number;
  awayClubId: number;
  homeGoals: number | null;
  awayGoals: number | null;
  homeStatsJson: string | null;
}): number | null {
  const stats = parseStatsPayload(match.homeStatsJson);
  const storedWinner = safeNumber(stats.winnerClubId, 0);
  if (storedWinner) return Math.round(storedWinner);
  if (match.homeGoals == null || match.awayGoals == null) return null;
  if (match.homeGoals > match.awayGoals) return match.homeClubId;
  if (match.awayGoals > match.homeGoals) return match.awayClubId;
  return null;
}

type GroupTableRow = {
  groupName: string;
  clubId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
};

async function groupTablesForCompetition(competitionId: number): Promise<Map<string, GroupTableRow[]>> {
  const matches = await prisma.match.findMany({
    where: { matchday: { competitionId }, OR: [{ groupName: { not: null } }, { matchday: { groupId: { not: null } } }] },
    select: {
      groupName: true,
      homeClubId: true,
      awayClubId: true,
      homeGoals: true,
      awayGoals: true,
      status: true,
      matchday: { select: { group: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  });

  const rows = new Map<string, GroupTableRow>();
  const ensure = (groupName: string, clubId: number) => {
    const key = `${groupName}:${clubId}`;
    const row = rows.get(key) ?? {
      groupName,
      clubId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    };
    rows.set(key, row);
    return row;
  };

  for (const match of matches) {
    const groupName = match.matchday?.group?.name ?? match.groupName ?? 'Grupo';
    const home = ensure(groupName, match.homeClubId);
    const away = ensure(groupName, match.awayClubId);
    if (match.status !== 'played' || match.homeGoals == null || match.awayGoals == null) continue;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeGoals;
    home.goalsAgainst += match.awayGoals;
    away.goalsFor += match.awayGoals;
    away.goalsAgainst += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (match.awayGoals > match.homeGoals) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  const grouped = new Map<string, GroupTableRow[]>();
  for (const row of rows.values()) {
    grouped.set(row.groupName, [...(grouped.get(row.groupName) ?? []), row]);
  }
  for (const [groupName, table] of grouped) {
    const groupMatches = matches.filter((match) =>
      (match.matchday?.group?.name ?? match.groupName ?? 'Grupo') === groupName);
    grouped.set(groupName, sortStandings(withHeadToHeadPoints(table, groupMatches)));
  }
  return grouped;
}

async function advanceGroupsToKnockout(competitionId: number): Promise<void> {
  const pendingGroupMatches = await prisma.match.count({
    where: {
      matchday: { competitionId },
      groupName: { not: null },
      status: 'scheduled',
    },
  });
  if (pendingGroupMatches > 0) return;

  const existingKnockouts = await prisma.match.count({
    where: {
      matchday: { competitionId },
      groupName: null,
    },
  });
  if (existingKnockouts > 0) return;

  const tables = await groupTablesForCompetition(competitionId);
  const groups = [...tables.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (groups.length === 0) return;

  const winners = groups.map(([, rows]) => rows[0]?.clubId).filter((id): id is number => id != null);
  const runners = groups.map(([, rows]) => rows[1]?.clubId).filter((id): id is number => id != null);
  const qualifiers = runners.length === winners.length && runners.length > 0
    ? winners.flatMap((winner, index) => [winner, runners[(index + 1) % runners.length]])
    : groups.flatMap(([, rows]) => rows.slice(0, 2).map(row => row.clubId));

  const uniqueQualifiers = [...new Set(qualifiers)];
  if (uniqueQualifiers.length < 2) return;

  const lastMatchday = await prisma.matchday.findFirst({
    where: { competitionId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  const nextMatchday = await prisma.matchday.create({
    data: {
      competitionId,
      number: (lastMatchday?.number ?? 0) + 1,
      status: 'pending',
    },
  });

  const fixtures: Array<{ homeClubId: number; awayClubId: number }> = [];
  for (let i = 0; i + 1 < uniqueQualifiers.length; i += 2) {
    fixtures.push({ homeClubId: uniqueQualifiers[i], awayClubId: uniqueQualifiers[i + 1] });
  }

  if (fixtures.length > 0) {
    await prisma.match.createMany({
      data: fixtures.map(fixture => ({
        matchdayId: nextMatchday.id,
        homeClubId: fixture.homeClubId,
        awayClubId: fixture.awayClubId,
        status: 'scheduled',
      })),
    });

    // E2: Bonus points for advancing from groups
    const comp = await prisma.competition.findUnique({ where: { id: competitionId }, select: { isContinental: true, seasonId: true } });
    if (comp?.isContinental) {
      for (const clubId of uniqueQualifiers) {
        await coefficientService.awardBonusPoints(clubId, comp.seasonId, 'european', 4); // 4 points for qualifying from groups
      }
    }
  }
}

async function advanceLeaguePhaseToKnockout(competitionId: number): Promise<void> {
  const existingKnockouts = await prisma.match.count({
    where: {
      matchday: { competitionId, type: { notIn: ['league_phase'] } },
    },
  });
  if (existingKnockouts > 0) return;

  const standings = await prisma.standing.findMany({
    where: { competitionId },
    orderBy: [
      { points: 'desc' },
      { goalsFor: 'desc' },
      { won: 'desc' }
    ],
    take: 16
  });
  
  if (standings.length < 16) return; // Need at least 16 teams

  const lastMatchday = await prisma.matchday.findFirst({
    where: { competitionId },
    orderBy: { number: 'desc' },
  });

  const nextMatchday = await prisma.matchday.create({
    data: {
      competitionId,
      number: (lastMatchday?.number ?? 0) + 1,
      status: 'pending',
      type: 'round_of_16',
      isKnockout: true,
    },
  });

  const fixtures: Array<{ homeClubId: number; awayClubId: number }> = [];
  for (let i = 0; i < 8; i++) {
    // 1st vs 16th, 2nd vs 15th, etc.
    fixtures.push({
      homeClubId: standings[i].clubId,
      awayClubId: standings[15 - i].clubId,
    });
  }

  await prisma.match.createMany({
    data: fixtures.map(fixture => ({
      matchdayId: nextMatchday.id,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      status: 'scheduled',
      isKnockout: true,
      round: 'round_of_16',
      leg: 1
    })),
  });

  // E2: Bonus points for advancing from league phase to knockouts
  const comp = await prisma.competition.findUnique({ where: { id: competitionId }, select: { isContinental: true, seasonId: true } });
  if (comp?.isContinental) {
    for (let i = 0; i < 16; i++) {
      await coefficientService.awardBonusPoints(standings[i].clubId, comp.seasonId, 'european', 4);
    }
  }
}

async function advanceCupBracket(matchdayId: number): Promise<void> {
  const current = await prisma.matchday.findUnique({
    where: { id: matchdayId },
    include: {
      competition: true,
      matches: {
        where: { status: 'played' },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          homeClubId: true,
          awayClubId: true,
          homeGoals: true,
          awayGoals: true,
          homeStatsJson: true,
        },
      },
    },
  });
  // P1 #97: el cuadro avanza también para supercopas y rondas KO europeas
  // (league_phase con jornada isKnockout; 'european' = legacy premigración).
  const bracketTypes = ['cup', 'supercup', 'league_phase', 'european'];
  if (!current || !bracketTypes.includes(current.competition.type)) return;

  const winners = current.matches
    .map(winnerFromStoredStats)
    .filter((clubId): clubId is number => clubId != null);

  if (winners.length <= 1) return;

  const nextExisting = await prisma.matchday.findFirst({
    where: {
      competitionId: current.competitionId,
      number: { gt: current.number },
    },
    orderBy: { number: 'asc' },
    include: { matches: { select: { id: true }, take: 1 } },
  });

  if (nextExisting?.matches.length) return;

  const nextMatchday = nextExisting ?? await prisma.matchday.create({
    data: {
      competitionId: current.competitionId,
      number: current.number + 1,
      status: 'pending',
      type: 'knockout',
      isKnockout: true,
    },
  });

  const fixtures: Array<{ homeClubId: number; awayClubId: number }> = [];
  for (let i = 0; i + 1 < winners.length; i += 2) {
    fixtures.push({ homeClubId: winners[i], awayClubId: winners[i + 1] });
  }
  // P1 #98: con ganadores impares, el sobrante recibe un BYE (walkover persistido
  // como jugado) y avanza a la siguiente ronda en vez de desaparecer del torneo.
  const byeClubId = winners.length % 2 === 1 ? winners[winners.length - 1] : null;

  if (fixtures.length === 0 && byeClubId == null) return;

  await prisma.match.createMany({
    data: fixtures.map(fixture => ({
      matchdayId: nextMatchday.id,
      homeClubId: fixture.homeClubId,
      awayClubId: fixture.awayClubId,
      status: 'scheduled',
      isKnockout: true,
      leg: 1,
    })),
  });
  if (byeClubId != null) {
    await prisma.match.create({ data: byeWalkoverMatchData(nextMatchday.id, byeClubId) });
  }

  // E2: Bonus points for advancing knockout round
  if (current.competition.isContinental) {
    for (const clubId of winners) {
      await coefficientService.awardBonusPoints(clubId, current.competition.seasonId, current.competition.shortName, 1);
    }
  }
}



// P2 #110: UN update en lote por club (antes ~22 updates secuenciales por
// partido). P3 #123: determinista — la variación por jugador sale de su id y la
// semilla del partido, no de Math.random.
// WT3: la DEMANDA FÍSICA de la formación (catálogo WT2) modula la fatiga
// post-partido. Demanda 3 (o formación fuera de catálogo) = fórmula de siempre,
// bit a bit; un 5-4-1 (demanda 2) desgasta menos, un 3-4-3/3-5-2 (demanda 5)
// más, y sus carrileros (LD/LI) y el BOX se vacían un extra.
async function decayFitness(clubId: number, seed: number, formation?: string | null) {
  const demand = physicalDemandOf(formation) ?? 3;
  const base = 8 + (demand - 3) * 2;   // demanda 2 → 6-10 · 3 → 8-12 · 5 → 12-16
  const wingBackExtra = hasWingBacks(formation) ? 2 : 0;
  const boxExtra = demand >= 4 ? 1 : 0;
  // Titulares pierden fatiga en un único UPDATE masivo por club: base variable,
  // extra de carrileros y extra BOX, con el mismo suelo 40 que los pasos previos.
  await prisma.$executeRaw`
    UPDATE "Player"
    SET fitness = GREATEST(40, fitness - (
      ${base}
      + MOD(ABS(id * 31 + ${seed % 1000003}), 5)
      + CASE WHEN ${wingBackExtra} > 0 AND "detailedPosition" IN ('LD', 'LI') THEN ${wingBackExtra} ELSE 0 END
      + CASE WHEN ${boxExtra} > 0 AND "detailedPosition" = 'BOX' THEN ${boxExtra} ELSE 0 END
    ))
    WHERE "clubId" = ${clubId} AND "isStarter" = true;`;
}

async function grantExperience(clubId: number, seed: number) {
  // Titulares ganan 1-3 de experiencia por partido (techo 99).
  await prisma.$executeRaw`
    UPDATE "Player"
    SET experience = LEAST(99, experience + (1 + MOD(ABS(id * 17 + ${seed % 1000003}), 3)))
    WHERE "clubId" = ${clubId} AND "isStarter" = true;`;
}

async function applyMatchMorale(
  homeClubId: number,
  awayClubId: number,
  homeGoals: number,
  awayGoals: number,
  knockoutWinnerClubId: number | null,
) {
  const homeResult = knockoutWinnerClubId
    ? (knockoutWinnerClubId === homeClubId ? 'win' : 'loss')
    : homeGoals > awayGoals ? 'win' : homeGoals < awayGoals ? 'loss' : 'draw';
  const awayResult = homeResult === 'win' ? 'loss' : homeResult === 'loss' ? 'win' : 'draw';
  await prisma.$transaction([
    prisma.player.updateMany({
      where: { clubId: homeClubId, isStarter: true },
      data: { morale: { increment: moraleDeltaForResult(homeResult) } },
    }),
    prisma.player.updateMany({
      where: { clubId: awayClubId, isStarter: true },
      data: { morale: { increment: moraleDeltaForResult(awayResult) } },
    }),
  ]);
  await prisma.$executeRaw`
    UPDATE "Player" SET morale = LEAST(100, morale)
    WHERE "clubId" IN (${homeClubId}, ${awayClubId}) AND morale > 100
  `;
}

function youthAttrs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

async function applyYouthProgression(
  inGameDate: Date,
  turn: number,
  prevInGameDate: Date,
): Promise<{ promoted: number; aged: number; retired: number; releasedYouth: number }> {
  let promoted = 0;
  let aged = 0;
  let retired = 0;
  let releasedYouth = 0;

  // ─── Cumpleaños FDF: TODOS cumplen años el 1 de enero (manual §3.2) ───
  // Cruce de año detectado con la fecha REAL del turno anterior (no "−3 días",
  // que con saltos de 2 días duplicaba cumpleaños/declive — auditoría P0 #2).
  const isNewYear = prevInGameDate.getUTCFullYear() !== inGameDate.getUTCFullYear();

  if (isNewYear) {
    // Cumpleaños de jugadores activos (club o contrato vigente) y juveniles.
    // Los retirados quedan con contractYears=0 y no siguen envejeciendo como
    // agentes libres fantasma en el mercado/QA.
    const ageRes = await prisma.player.updateMany({
      where: { OR: [{ clubId: { not: null } }, { contractYears: { gt: 0 } }] },
      data: { age: { increment: 1 } },
    });
    await prisma.youthPlayer.updateMany({ data: { age: { increment: 1 } } });
    aged += ageRes.count;

    // Declive de veteranos (§3.2): desde los 31, −2 al TECHO de cada habilidad
    // por año (baja talent/potential, no el valor actual). Se repite cada año.
    await prisma.$executeRaw`
      UPDATE "Player"
      SET talent = GREATEST(1, talent - 2),
          potential = GREATEST(1, potential - 2)
      WHERE age >= 31;`;
  }

  const academies = await prisma.youthAcademy.findMany({
    include: { youthPlayers: true, club: { include: { players: { select: { id: true } } } } },
  });
  for (const academy of academies) {
    let squadSize = academy.club.players.length;
    const [loanedOut, pendingIncoming] = await Promise.all([
      prisma.player.count({ where: { loanOwnerClubId: academy.clubId } }),
      prisma.transferOffer.count({
        where: { fromClubId: academy.clubId, status: 'accepted_pending_window' },
      }),
    ]);
    const candidates = academy.youthPlayers
      .filter(youth => youth.age >= 19)
      .sort((a, b) => b.talent - a.talent);

    for (const youth of candidates) {
      let squadLimitReached = false;
      try {
        assertFDFBuyerCounts(squadSize, loanedOut, pendingIncoming);
      } catch {
        squadLimitReached = true;
      }
      if (youth.talent < 55 || squadLimitReached) {
        if (youth.age > 19) {
          await prisma.youthPlayer.delete({ where: { id: youth.id } });
          releasedYouth++;
        }
        continue;
      }
      const attrs = youthAttrs(youth.attributes);
      const overall = Math.round(25 + youth.talent * 0.5);
      const wage = 1000 + youth.talent * 50;
      await prisma.$transaction([
        prisma.player.create({
          data: {
            clubId: academy.clubId,
            name: String(attrs.name ?? 'Canterano'),
            age: youth.age,
            nationality: String(attrs.nationality ?? 'España'),
            flag: String(attrs.flag ?? '🇪🇸'),
            position: String(attrs.position ?? 'MED'),
            // WT1: hereda la posición detallada del juvenil; si es antiguo, se deriva.
            detailedPosition: typeof attrs.detailedPosition === 'string'
              ? attrs.detailedPosition
              : deriveDetailedPosition({ ...(attrs as Record<string, any>), position: String(attrs.position ?? 'MED') }),
            passing: Number(attrs.passing) || overall,
            tackling: Number(attrs.tackling) || overall,
            shooting: Number(attrs.shooting) || overall,
            organization: Number(attrs.organization) || overall,
            unmarking: Number(attrs.unmarking) || overall,
            finishing: Number(attrs.finishing) || overall,
            dribbling: Number(attrs.dribbling) || overall,
            fouls: Number(attrs.fouls) || overall,
            goalkeeping: Number(attrs.goalkeeping) || Math.round(overall * 0.6),
            reflexes: Number(attrs.reflexes) || Number(attrs.goalkeeping) || Math.round(overall * 0.6),
            talent: youth.talent,
            potential: Math.min(99, youth.talent + 15),
            wage,
            marketValue: youth.talent * 5000,
            contractYears: 3,
            contractStartAt: inGameDate,
            contractEndAt: new Date(Date.UTC(inGameDate.getUTCFullYear() + 3, inGameDate.getUTCMonth(), inGameDate.getUTCDate())),
            homegrown: true,
          },
        }),
        prisma.youthPlayer.delete({ where: { id: youth.id } }),
      ]);
      squadSize++;
      promoted++;
    }
  }

  // ─── Retiradas (§3.2 + QA3): 34-37 probables, 38 forzosa ───
  if (isNewYear) {
    const squadSizes = new Map<number, number>();
    const grouped = await prisma.player.groupBy({
      by: ['clubId'],
      where: { clubId: { not: null } },
      _count: { _all: true },
    });
    for (const row of grouped) {
      if (row.clubId != null) squadSizes.set(row.clubId, row._count._all);
    }

    const veterans = await prisma.player.findMany({
      where: { clubId: { not: null }, age: { gte: 34 } },
      include: {
        seasonStats: { select: { matchesPlayed: true, goals: true, assists: true, averageRating: true } }
      }
    });
    for (const veteran of veterans) {
      const currentSquadSize = veteran.clubId ? (squadSizes.get(veteran.clubId) ?? 0) : 0;
      const forcedByAge = veteran.age >= 38;
      if (!forcedByAge && (!shouldRetirePlayer(veteran.id, veteran.age, inGameDate.getUTCFullYear()) || currentSquadSize <= 18)) {
        continue;
      }

      const clubManager = veteran.clubId
        ? await prisma.manager.findFirst({ where: { clubId: veteran.clubId }, select: { userId: true } })
        : null;
      if (veteran.clubId) {
        const honoursCount = await prisma.honour.count({ where: { clubId: veteran.clubId } });
        const clubHonourScore = honoursCount * 2;
        const totals = veteran.seasonStats.reduce((acc, stat) => ({
          matches: acc.matches + stat.matchesPlayed,
          goals: acc.goals + stat.goals,
          assists: acc.assists + stat.assists,
          ratingTotal: acc.ratingTotal + stat.averageRating,
          ratingCount: acc.ratingCount + (stat.averageRating > 0 ? 1 : 0),
        }), { matches: 0, goals: 0, assists: 0, ratingTotal: 0, ratingCount: 0 });
        
        const averageRating = totals.ratingCount ? totals.ratingTotal / totals.ratingCount : 0;
        const legendScore = Math.round(
          totals.matches * 0.25 + totals.goals * 1.5 + totals.assists + averageRating * 4 + clubHonourScore
        );

        if (legendScore > 50) {
          await prisma.clubLegend.create({
            data: {
              clubId: veteran.clubId,
              playerId: veteran.id,
              name: veteran.name,
              position: (veteran as any).position || 'Desconocida',
              nationality: (veteran as any).nationality || 'Desconocida',
              matchesPlayed: totals.matches,
              goals: totals.goals,
              assists: totals.assists,
              legendScore,
              retiredAt: new Date()
            }
          });
        }

        // N4-3 · Legado de leyenda: si ≥450 PJ, guarda los 3 mejores atributos
        // en la cantera del club para que influyan en juveniles futuros (+5 pts).
        if (totals.matches >= 450 && veteran.clubId) {
          try {
            const legendSkills = await prisma.player.findUnique({
              where: { id: veteran.id },
              select: {
                passing: true, tackling: true, shooting: true, organization: true,
                unmarking: true, finishing: true, dribbling: true, goalkeeping: true,
              },
            });
            if (legendSkills) {
              const SKILL_ATTRS = ['passing', 'tackling', 'shooting', 'organization', 'unmarking', 'finishing', 'dribbling', 'goalkeeping'] as const;
              type SkillAttr = typeof SKILL_ATTRS[number];
              const top3 = (SKILL_ATTRS as readonly SkillAttr[])
                .map((k) => ({ k, v: legendSkills[k] as number }))
                .sort((a, b) => b.v - a.v)
                .slice(0, 3)
                .map((x) => x.k);
              await prisma.youthAcademy.updateMany({
                where: { clubId: veteran.clubId },
                data: { legacyAttributes: JSON.stringify(top3) },
              });
            }
          } catch { /* legado opcional: nunca rompe la retirada */ }
        }

        // C2 · Emblemáticos estrictos (manual §8.2): al retirarse, si acumula
        // ≥450 PJ EN ESTE club (su último club), entra automáticamente en el
        // pool de emblemáticos del club (máx. 5). La elegibilidad se evalúa
        // DESPUÉS de soltar al jugador (clubId null) — ver más abajo.
      }

      const retirementClubId = veteran.clubId;
      await prisma.player.update({
        where: { id: veteran.id },
        data: {
          clubId: null,
          isStarter: false,
          isForSale: false,
          salePrice: null,
          contractYears: 0,
          wage: 0,
          releaseClause: null,
          loanOwnerClubId: null,
          loanEndDate: null,
        },
      });
      if (retirementClubId) squadSizes.set(retirementClubId, Math.max(0, (squadSizes.get(retirementClubId) ?? 1) - 1));
      if (retirementClubId) {
        try {
          const enrolled = await ideologyService.autoEnrollEmblematicOnRetirement(
            retirementClubId,
            veteran.id,
            new Date().getFullYear(),
          );
          if (enrolled && clubManager) {
            await prisma.notification.create({
              data: {
                userId: clubManager.userId,
                type: 'club',
                title: 'Nuevo emblemático',
                message: `${veteran.name} se retira tras ≥450 partidos con el club y pasa a ser jugador EMBLEMÁTICO.`,
              },
            });
          }
        } catch { /* emblemático opcional: nunca rompe la retirada */ }
      }
      if (clubManager) {
        try {
          await prisma.notification.create({
            data: {
              userId: clubManager.userId,
              type: 'squad',
              title: 'Retirada',
              message: `${veteran.name} cuelga las botas: se retira del fútbol profesional (límite FDF: 38 años).`,
            },
          });
        } catch { /* notificación opcional */ }
      }
      retired++;
    }
  }

  return { promoted, aged, retired, releasedYouth };
}

async function stepPlayerProgression(
  steps: string[],
  matchesPlayed: boolean,
  inGameDate: Date,
  turn: number,
  prevInGameDate: Date,
) {
  // El turno que cruza el 1 de enero SIEMPRE se procesa (cumpleaños/declive/retiradas).
  // Cruce detectado con la fecha REAL del turno anterior (auditoría P0 #2).
  const crossesNewYear = prevInGameDate.getUTCFullYear() !== inGameDate.getUTCFullYear();

  if (!matchesPlayed && turn % 28 !== 0 && !crossesNewYear) {
    steps.push('progresion:skip');
    return;
  }

  const [players, youthPlayers] = await Promise.all([
    prisma.player.findMany({ where: { clubId: { not: null } } }),
    prisma.youthPlayer.findMany(),
  ]);
  const deltas = await developPlayers(players, youthPlayers, {
    inGameDate: inGameDate.toISOString(),
    turn,
    matchesPlayed,
    seed: turn * 104729 + players.length,
  });
  const updated = await applyPlayerDeltas(deltas);
  const lowFitnessLosses = await applyLowFitnessSkillLoss(turn);
  const youth = await applyYouthProgression(inGameDate, turn, prevInGameDate);
  const revalued = await recalcAllMarketValues();
  steps.push(`progresion:jugadores:${updated}:forma-baja:${lowFitnessLosses}:cantera:${youth.promoted}:liberados:${youth.releasedYouth}:edad:${youth.aged}:veteranos:${youth.retired}:revaluados:${revalued.players}:salarios:${revalued.salariesAdjusted}`);
}

async function healFitness() {
  await prisma.$executeRaw`
    UPDATE "Player"
    SET
      fitness = CASE
        WHEN LEAST(100, fitness + 5) > 90
          AND "accumulatedFatigue" + 1 >= ${FATIGUE_COLLAPSE_THRESHOLD}
          THEN 40
        ELSE LEAST(100, fitness + 5)
      END,
      "accumulatedFatigue" = CASE
        WHEN LEAST(100, fitness + 5) > 90
          AND "accumulatedFatigue" + 1 >= ${FATIGUE_COLLAPSE_THRESHOLD}
          THEN 0
        WHEN LEAST(100, fitness + 5) > 90
          THEN "accumulatedFatigue" + 1
        ELSE GREATEST(0, "accumulatedFatigue" - 1)
      END
    WHERE fitness < 100 OR "accumulatedFatigue" > 0
  `;
}

async function applyLowFitnessSkillLoss(turn: number): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "Player"
    SET
      passing = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 0 THEN GREATEST(1, passing - 1) ELSE passing END,
      tackling = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 1 THEN GREATEST(1, tackling - 1) ELSE tackling END,
      shooting = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 2 THEN GREATEST(1, shooting - 1) ELSE shooting END,
      organization = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 3 THEN GREATEST(1, organization - 1) ELSE organization END,
      unmarking = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 4 THEN GREATEST(1, unmarking - 1) ELSE unmarking END,
      finishing = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 5 THEN GREATEST(1, finishing - 1) ELSE finishing END,
      dribbling = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 6 THEN GREATEST(1, dribbling - 1) ELSE dribbling END,
      fouls = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 7 THEN GREATEST(1, fouls - 1) ELSE fouls END,
      goalkeeping = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 8 THEN GREATEST(1, goalkeeping - 1) ELSE goalkeeping END,
      reflexes = CASE WHEN MOD(ABS(id * 31 + ${turn} * 17), ${LOW_FITNESS_SKILLS.length}) = 9 THEN GREATEST(1, reflexes - 1) ELSE reflexes END
    WHERE "clubId" IS NOT NULL AND fitness < 45
  `;
}

async function stepMoraleDecay(steps: string[], inGameDate: Date, currentTurn: number) {
  if (!shouldDecayMorale(inGameDate)) {
    steps.push('moral:pausa-estacional');
    return;
  }
  const affected = await prisma.$executeRaw`
    UPDATE "Player" SET morale = GREATEST(0, morale - 1)
    WHERE "clubId" IS NOT NULL
      AND morale > 0
      AND "isPermanentlyMotivated" = false
      AND ("motivatedUntilTurn" IS NULL OR "motivatedUntilTurn" < ${currentTurn})
  `;
  steps.push(`moral:decay:${affected}`);
}

async function stepStyleContinuity(steps: string[]) {
  const affected = await prisma.$executeRaw`
    UPDATE "Club" AS c
    SET
      "offensiveStyleContinuity" = CASE
        WHEN EXISTS (
          SELECT 1 FROM "Manager" m
          JOIN "Tactic" t ON t."managerId" = m.id AND t."isDefault" = true
          WHERE m."clubId" = c.id AND NULLIF(TRIM(t."offensiveStyle"), '') IS NOT NULL
        ) THEN LEAST(4, c."offensiveStyleContinuity" + 1)
        ELSE 0
      END,
      "defensiveStyleContinuity" = CASE
        WHEN EXISTS (
          SELECT 1 FROM "Manager" m
          JOIN "Tactic" t ON t."managerId" = m.id AND t."isDefault" = true
          WHERE m."clubId" = c.id AND NULLIF(TRIM(t."defensiveStyle"), '') IS NOT NULL
        ) THEN LEAST(4, c."defensiveStyleContinuity" + 1)
        ELSE 0
      END
    WHERE EXISTS (SELECT 1 FROM "Manager" m WHERE m."clubId" = c.id)
  `;
  steps.push(`estilo:continuidad:${affected}`);
}

async function stepStaffEffects(steps: string[]) {
  const effectsByClub = await getStaffEffectsForClubs();
  let fitnessRows = 0;
  let conditionRows = 0;
  let rhythmRows = 0;
  let moraleRows = 0;

  for (const [clubId, effects] of effectsByClub) {
    const fitnessBonus = effects.fitnessCoach.fitnessRecoveryBonus;
    if (fitnessBonus > 0) {
      fitnessRows += await prisma.$executeRaw`
        UPDATE "Player"
        SET fitness = LEAST(100, fitness + ${fitnessBonus})
        WHERE "clubId" = ${clubId} AND fitness < 100
      `;
    }

    const conditionBonus = effects.nutritionist.conditionRecoveryBonus;
    if (conditionBonus > 0) {
      conditionRows += await prisma.$executeRaw`
        UPDATE "Player"
        SET
          "muscularFitness" = LEAST(100, "muscularFitness" + ${conditionBonus}),
          "mentalSharpness" = LEAST(100, "mentalSharpness" + ${conditionBonus})
        WHERE "clubId" = ${clubId}
          AND ("muscularFitness" < 100 OR "mentalSharpness" < 100)
      `;
    }

    const rhythmBonus = effects.sportingDirector.rhythmMoraleBonus;
    if (rhythmBonus > 0) {
      rhythmRows += await prisma.$executeRaw`
        UPDATE "Player"
        SET "matchRhythm" = LEAST(100, "matchRhythm" + ${rhythmBonus})
        WHERE "clubId" = ${clubId} AND "matchRhythm" < 100
      `;
      moraleRows += await prisma.$executeRaw`
        UPDATE "Player"
        SET morale = LEAST(100, morale + ${rhythmBonus})
        WHERE "clubId" = ${clubId} AND morale < 65
      `;
    }
  }

  if (fitnessRows || conditionRows || rhythmRows || moraleRows) {
    steps.push(`staff:fitness:${fitnessRows}:condicion:${conditionRows}:ritmo:${rhythmRows}:moral:${moraleRows}`);
  } else {
    steps.push('staff:sin_efectos');
  }
}

// ─── Pasos del pipeline pendientes de hito (scaffolding para H4–H6) ───────────
// Cada uno recibe el log de pasos del turno y, por ahora, no muta el mundo.
// Cuando llegue su hito se rellena el cuerpo aquí, sin tocar processTick().
async function stepTrainings(steps: string[]) {
  // Fase 1 (real): delega en trainingService (6 jugadores/entrenador, 5 tipos +
  // rehabilitación, forma objetivo 86-90, jugadas 15-20 turnos). Determinista.
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  const turn = state?.turn ?? 0;
  const clubs = await prisma.club.findMany({ select: { id: true }, orderBy: { id: 'asc' } });

  let trainedCount = 0;
  let youthTrainedCount = 0;
  let playsAdvanced = 0;

  const chunkSize = 20;
  for (let i = 0; i < clubs.length; i += chunkSize) {
    const chunk = clubs.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (club) => {
        // RNG independiente por club: misma semilla+turno → mismo resultado aunque
        // las promesas se resuelvan en orden no determinista (TOCTOU de PRNG compartido).
        const clubRng = makeRng(turn * 7919 + club.id);
        const trained = await trainingService.processTickTrainings(club.id, clubRng);
        const youthTrained = await trainingService.processYouthTrainings(club.id, clubRng);
        const plays = await trainingService.advanceTrainedPlays(club.id, clubRng);
        return { trained, youthTrained, plays };
      })
    );
    for (const res of results) {
      trainedCount += res.trained;
      youthTrainedCount += res.youthTrained;
      playsAdvanced += res.plays;
    }
  }

  steps.push(`entrenos:${trainedCount},juveniles:${youthTrainedCount},jugadas:${playsAdvanced}`);
}


async function stepResolveManagerApplications(steps: string[]) {
  // 1. Encontrar clubes sin mánager con candidaturas VIVAS.
  // Q6 (BUG RAÍZ #2): applyToVacancy crea las candidaturas con score >= 0 como
  // SHORTLISTED, pero aquí solo se resolvían las PENDING → la mayoría de
  // solicitudes se quedaba viva para siempre ("Vacantes no funcionan").
  const LIVE_APP_STATUSES = ['PENDING', 'SHORTLISTED'];
  const clubsWithApps = await prisma.club.findMany({
    where: {
      manager: null,
      managerApplications: { some: { status: { in: LIVE_APP_STATUSES } } }
    },
    include: {
      managerApplications: {
        where: { status: { in: LIVE_APP_STATUSES } },
        include: { manager: true }
      }
    }
  });
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true, season: { select: { name: true } } },
  });
  const applicationManagerIds = [...new Set(
    clubsWithApps.flatMap((club) => club.managerApplications.map((application) => application.managerId)),
  )];
  const managerContracts = applicationManagerIds.length > 0
    ? await prisma.managerContract.findMany({
        where: { managerId: { in: applicationManagerIds } },
        select: { managerId: true, clubId: true, season: true },
      })
    : [];
  const contractsByManager = new Map<number, typeof managerContracts>();
  for (const contract of managerContracts) {
    const rows = contractsByManager.get(contract.managerId) ?? [];
    rows.push(contract);
    contractsByManager.set(contract.managerId, rows);
  }

  let resolved = 0;
  for (const club of clubsWithApps) {
    if (club.managerApplications.length === 0) continue;
    const eligibleApplications = club.managerApplications.filter((application) => {
      const contracts = contractsByManager.get(application.managerId) ?? [];
      const isReturn = contracts.some((contract) => contract.clubId === club.id);
      if (!isReturn || !state) return true;
      const directedThisSeason = contracts.some((contract) => contract.season === state.season.name);
      return returnWindowAllows(state.inGameDate, directedThisSeason).allowed;
    });
    const blockedApplicationIds = club.managerApplications
      .filter((application) => !eligibleApplications.includes(application))
      .map((application) => application.id);
    if (blockedApplicationIds.length > 0) {
      await prisma.managerApplication.updateMany({
        where: { id: { in: blockedApplicationIds } },
        data: { status: 'REJECTED' },
      });
    }
    if (eligibleApplications.length === 0) continue;

    // Ordenar aplicantes por prestigio (descendente).
    // P3 #123: desempate DETERMINISTA por id (no Math.random en el pipeline).
    const sortedApps = eligibleApplications.sort((a, b) => {
      if (b.manager.prestige === a.manager.prestige) return a.managerId - b.managerId;
      return b.manager.prestige - a.manager.prestige;
    });

    const winnerApp = sortedApps[0];

    // Asignar el club al manager ganador y mantener vacancyOpenedAt coherente.
    await prisma.$transaction(async (tx) => {
      if (winnerApp.manager.clubId) {
        await tx.club.update({
          where: { id: winnerApp.manager.clubId },
          data: { isUserClub: false, vacancyOpenedAt: new Date() },
        });
      }
      await tx.manager.update({
        where: { id: winnerApp.managerId },
        data: { clubId: club.id },
      });
      await tx.club.update({
        where: { id: club.id },
        data: { isUserClub: true, vacancyOpenedAt: null },
      });
    });

    // Marcar la app como ACCEPTED
    await prisma.managerApplication.update({
      where: { id: winnerApp.id },
      data: { status: 'ACCEPTED' }
    });

    // Notificar al ganador
    await prisma.notification.create({
      data: {
        userId: winnerApp.manager.userId,
        title: '¡Solicitud aceptada!',
        message: `El club ${club.name} ha aceptado tu solicitud. ¡Eres su nuevo mánager!`,
        type: 'inbox',
      }
    });

    // Rechazar las demás
    const loserIds = sortedApps.slice(1).map(a => a.id);
    if (loserIds.length > 0) {
      await prisma.managerApplication.updateMany({
        where: { id: { in: loserIds } },
        data: { status: 'REJECTED' }
      });

      for (const loserApp of sortedApps.slice(1)) {
        await prisma.notification.create({
          data: {
            userId: loserApp.manager.userId,
            title: 'Solicitud rechazada',
            message: `El club ${club.name} ha elegido a otro candidato con mayor prestigio.`,
            type: 'inbox',
          }
        });
      }
    }

    resolved++;
  }

  if (resolved > 0) steps.push(`managerAppsResolved:${resolved}`);
}

async function stepJobMarket(steps: string[]) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) return;
  // P3 #123: RNG determinista por turno (nada de Math.random en el pipeline).
  const rng = makeRng(state.turn * 2654435761 + 29);

  const expirationDate = new Date(state.inGameDate);
  expirationDate.setDate(expirationDate.getDate() - 7);

  const expired = await prisma.managerOffer.updateMany({
    where: { 
      status: 'PENDING',
      createdAt: { lt: expirationDate }
    },
    data: { status: 'EXPIRED' }
  });
  if (expired.count > 0) steps.push(`managerOffersExpired:${expired.count}`);

  // 2. Identify managers without a club
  const joblessManagers = await prisma.manager.findMany({
    where: { clubId: null },
    select: { id: true, prestige: true, userId: true }
  });

  if (joblessManagers.length === 0) return;

  // 3. Identify clubs without a manager
  const managerlessClubs = await prisma.club.findMany({
    where: { manager: null },
    select: { id: true, reputation: true, budget: true, name: true, isUserClub: true }
  });

  if (managerlessClubs.length === 0) return;

  // R7: los clubes libres tampoco cambian dentro del bucle — una sola lista,
  // ordenada de forma DETERMINISTA (reputación desc, id asc) para que la
  // elección por rng sea auditable por semilla.
  const freeClubs = [...managerlessClubs].sort((a, b) => b.reputation - a.reputation || a.id - b.id);

  // 4. Generate offers probabilistically
  let newOffers = 0;
  for (const manager of joblessManagers) {
    if (rng() < 0.2) {
      const currentPrestige = Math.max(0, manager.prestige);

      const suitableClubs = freeClubs.filter(c => {
        const financialPull = Math.min(18, Math.floor(moneyToNumber(c.budget) / 5_000_000));
        const score = currentPrestige + financialPull - c.reputation;
        return score >= 8;
      });

      if (suitableClubs.length > 0) {
        const club = suitableClubs[Math.floor(rng() * suitableClubs.length)];
        const wage = Math.round(
          8_000 + club.reputation * 360 + Math.min(moneyToNumber(club.budget), 80_000_000) * 0.00045,
        );
        
        await prisma.managerOffer.create({
          data: {
            managerId: manager.id,
            clubId: club.id,
            wage,
            status: 'PENDING',
            createdAt: state.inGameDate
          }
        });
        
        await prisma.notification.create({
          data: {
            userId: manager.userId,
            title: 'Nueva oferta de trabajo',
            message: `El ${club.name} te ha ofrecido el puesto de mánager.`,
            type: 'inbox',
          }
        });
        newOffers++;
      }
    }
  }

  if (newOffers > 0) steps.push(`managerOffersGenerated:${newOffers}`);
}

function parseAgreementLegacyTerms(raw: string | null | undefined) {
  if (!raw) return { optionToBuyAmount: null };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.optionToBuyAmount === 'number') {
      return { optionToBuyAmount: Math.round(parsed.optionToBuyAmount) };
    }
  } catch {
    // Mensaje antiguo de texto plano: no contiene importes.
  }
  return { optionToBuyAmount: null };
}

async function stepTransfers(steps: string[]) {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { inGameDate: true, prevInGameDate: true },
  });
  if (!state) return;

  const inGameDate = state.inGameDate;
  const loanWindowOpen = isLoanWindowOpen(inGameDate);
  const prevDate = resolvePrevInGameDate(state.prevInGameDate, inGameDate);

  let loansReturned = 0;
  let loanOptionsExercised = 0;
  if (crossesUtcDate(prevDate, inGameDate, 6, 30)) {
    const activeLoans = await prisma.transferOffer.findMany({
      where: { status: 'loan' },
      include: { player: true },
    });

    for (const loan of activeLoans) {
      if (!loan.player || loan.player.clubId !== loan.toClubId) {
        await prisma.transferOffer.update({ where: { id: loan.id }, data: { status: 'returned' } });
        continue;
      }

      await prisma.$transaction([
        prisma.player.update({
          where: { id: loan.playerId },
          data: { clubId: loan.fromClubId, loanOwnerClubId: null, loanEndDate: null },
        }),
        prisma.transferOffer.update({ where: { id: loan.id }, data: { status: 'returned' } }),
      ]);
      loansReturned++;
    }

    const negotiatedLoans = await prisma.transferAgreement.findMany({
      where: { type: 'loan', status: 'accepted', loanUntil: { lte: inGameDate } },
      include: { player: true },
    });

    for (const loan of negotiatedLoans) {
      if (!loan.player || loan.player.clubId !== loan.toClubId || loan.player.loanOwnerClubId !== loan.fromClubId) {
        await prisma.transferAgreement.update({ where: { id: loan.id }, data: { status: 'returned' } });
        continue;
      }

      const legacyTerms = parseAgreementLegacyTerms(loan.message);
      const optionPrice = loan.optionToBuyAmount ?? legacyTerms.optionToBuyAmount;
      if (optionPrice && optionPrice > 0) {
        // Fondos atómicos (budget fuente única, cash espejo): decremento guardado
        // con { gte } dentro de la transacción — sin pre-check stale.
        const exercised = await prisma.$transaction(async (tx) => {
          const charged = await tx.club.updateMany({
            where: { id: loan.toClubId, budget: { gte: optionPrice } },
            data: { budget: { decrement: optionPrice }, cash: { decrement: optionPrice } },
          });
          if (charged.count === 0) return false;
          await tx.club.update({
            where: { id: loan.fromClubId },
            data: { budget: { increment: optionPrice }, cash: { increment: optionPrice } },
          });
          await tx.player.update({
            where: { id: loan.playerId },
            data: {
              loanOwnerClubId: null,
              loanEndDate: null,
              lastTransferAt: inGameDate,
              lastTransferValue: optionPrice,
              isForSale: false,
              salePrice: null,
            },
          });
          await tx.transferAgreement.update({ where: { id: loan.id }, data: { status: 'option_exercised' } });
          return true;
        });
        if (exercised) {
          loanOptionsExercised++;
          continue;
        }
      }

      await prisma.$transaction([
        prisma.player.update({
          where: { id: loan.playerId },
          data: { clubId: loan.fromClubId, loanOwnerClubId: null, loanEndDate: null },
        }),
        prisma.transferAgreement.update({ where: { id: loan.id }, data: { status: 'returned' } }),
      ]);
      loansReturned++;
    }
  }

  if (!isTransferWindowOpen(inGameDate)) {
    steps.push(`mercado:cerrado:cesiones-${loanWindowOpen ? 'abiertas' : 'cerradas'}:vueltas:${loansReturned}:opciones:${loanOptionsExercised}`);
    return;
  }

  // P1 MS:881: al ABRIR ventana, ejecutar las ofertas aplazadas
  // 'accepted_pending_window' a través del núcleo transaccional (market.service).
  if (!isTransferWindowOpen(prevDate)) {
    try {
      const pendingRes = await executePendingWindowOffers();
      steps.push(`mercado:aplazadas:${pendingRes.processed}:ok:${pendingRes.accepted}:ko:${pendingRes.rejected}`);
    } catch (err) {
      console.error('[tick] error ejecutando ofertas aplazadas de ventana:', err);
      steps.push('mercado:aplazadas:ERROR');
    }
  }

  const gameState = await prisma.gameState.findFirst({ where: { isActive: true } });
  const currentTurn = gameState?.turn ?? 0;

  const pendingOffers = await prisma.transferOffer.findMany({
    where: { status: 'pending' },
    include: { player: true },
  });

  const humanManagers = await prisma.manager.findMany({
    where: { clubId: { not: null } },
    select: { clubId: true },
  });
  const humanClubIds = new Set(humanManagers.map(m => m.clubId).filter((id): id is number => id != null));

  let accepted = 0;
  let rejected = 0;
  let skippedHuman = 0;

  const offersByPlayer = new Map<number, typeof pendingOffers>();
  for (const offer of pendingOffers) {
    if (!offersByPlayer.has(offer.playerId)) offersByPlayer.set(offer.playerId, []);
    offersByPlayer.get(offer.playerId)!.push(offer);
  }

  for (const [playerId, offers] of offersByPlayer.entries()) {
    const oldestTurn = Math.min(...offers.map(o => o.turn ?? currentTurn));
    if (currentTurn - oldestTurn < 3) continue; // pujas a 3 turnos

    const cpuOffers = offers.filter(o => !o.toClubId || !humanClubIds.has(o.toClubId));
    if (cpuOffers.length === 0) {
      skippedHuman += offers.length;
      continue;
    }

    const player = offers[0].player;
    // IA no vende estrellas
    const isStar = (player.talent >= 85 || player.potential >= 85 || player.marketValue >= 30000000) && !player.isForSale;
    if (isStar) {
      for (const o of cpuOffers) {
        await prisma.transferOffer.update({ where: { id: o.id }, data: { status: 'rejected' } });
        rejected++;
      }
      continue;
    }

    const evaluations = await Promise.all(cpuOffers.map(async (offer) => {
      const salary = offer.salary ?? offer.player.wage;
      const years = offer.contractYears ?? 2;
      const clause = offer.releaseClause == null
        ? rescissionClause(salary, years, years)
        : moneyToNumber(offer.releaseClause);

      const evalResult = await evaluateOffer(offer.fromClubId, playerId, salary, years, clause);
      if (evalResult.keys.some((k: { ok: boolean }) => !k.ok) || evalResult.total < 50) {
        return { offer, valid: false, score: evalResult.total };
      }

      const buyer = await prisma.club.findUnique({
        where: { id: offer.fromClubId },
        include: {
          players: { select: { wage: true } },
          coaches: { select: { salary: true } },
          manager: { select: { createdAt: true } },
        },
      });

      const canOperate = !buyer?.manager || canClubOperate(buyer.manager.createdAt, inGameDate);
      const usedSalary = buyer
        ? buyer.players.reduce((sum, p) => sum + p.wage, 0) + buyer.coaches.reduce((sum, c) => sum + c.salary, 0)
        : 0;
      const buyerBudget = buyer ? moneyToNumber(buyer.budget) : 0;
      const cap = buyer ? salaryCap(Math.max(0, buyerBudget - offer.amount)) : 0;

      if (!buyer || buyerBudget < offer.amount || !canOperate || usedSalary + salary > cap) {
        return { offer, valid: false, score: evalResult.total };
      }

      return { offer, valid: true, score: evalResult.total, buyer };
    }));

    const validEvaluations = evaluations.filter(e => e.valid);

    if (validEvaluations.length === 0) {
      for (const o of cpuOffers) {
        await prisma.transferOffer.update({ where: { id: o.id }, data: { status: 'rejected' } });
        rejected++;
      }
      continue;
    }

    validEvaluations.sort((a, b) => b.score - a.score);
    const winner = validEvaluations[0];
    const { offer, buyer } = winner;

    // P0 #8/#9: adjudicación a través del núcleo transaccional executePlayerTransfer.
    // Re-verifica la PROPIEDAD del jugador dentro de la transacción (updateMany
    // guardado por clubId), valida cedido/límites/tope/anti-reventa y mueve
    // budget y cash JUNTOS de forma atómica (antes solo se movía budget).
    const newSalary = offer.salary ?? offer.player.wage;
    const newYears = offer.contractYears ?? 2;
    const newClause = offer.releaseClause == null
      ? rescissionClause(newSalary, newYears, newYears)
      : moneyToNumber(offer.releaseClause);
    try {
      await prisma.$transaction(async (tx) => {
        await executePlayerTransfer({
          playerId: offer.playerId,
          buyerClubId: buyer!.id,
          sellerClubId: offer.toClubId ?? offer.player.clubId ?? null,
          amount: offer.amount,
          terms: {
            salary: newSalary,
            contractYears: newYears,
            releaseClause: newClause,
          },
          source: 'tick',
          inGameDate,
        }, tx);
        // El core deja todas las ofertas pendientes del jugador en 'rejected';
        // la ganadora se marca aceptada al final, dentro de la misma transacción.
        await tx.transferOffer.update({ where: { id: offer.id }, data: { status: 'accepted' } });
      }, { timeout: 15000 });

      accepted++;
      rejected += (cpuOffers.length - 1);
    } catch (err) {
      // La adjudicación falló (carrera, cedido, límites…): rechazar la oferta
      // ganadora FUERA de la transacción revertida; el resto sigue 'pending'
      // y se re-evalúa el próximo turno.
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[tick] adjudicación fallida del jugador ${playerId}: ${message}`);
      await prisma.transferOffer.update({ where: { id: offer.id }, data: { status: 'rejected' } }).catch(() => {});
      rejected++;
    }
  }

  // QA7: pase de mercado de la IA. Los clubes NPC generan ofertas de compra y
  // listan excedente cada tick con ventana abierta; la subasta a 3 turnos de
  // arriba las adjudica con executePlayerTransfer (guardas FDF). Determinista.
  try {
    const ai = await runAiMarketPass(inGameDate, currentTurn);
    steps.push(`mercado:ia:clubes=${ai.npcClubs}:ofertas=${ai.offersCreated}:ventas=${ai.listedForSale}`);
  } catch (err) {
    console.error('[tick] error en pase de mercado IA (QA7):', err);
    steps.push('mercado:ia:ERROR');
  }

  steps.push(`mercado:aceptadas:${accepted}:rechazadas:${rejected}:humanas:${skippedHuman}:cesiones-${loanWindowOpen ? 'abiertas' : 'cerradas'}:vueltas:${loansReturned}:opciones:${loanOptionsExercised}`);
}

async function stepFinances(steps: string[]) {
  // Solo actúa en el primer turno de cada mes in-game (FDF).
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) return;

  // Fecha REAL del turno anterior persistida en GameState (auditoría P0 #2).
  const prevDate = resolvePrevInGameDate(state.prevInGameDate, state.inGameDate);

  if (!crossedIntoNewMonth(prevDate, state.inGameDate)) {
    const settledCount = await prisma.financeSnapshot.count({
      where: { season: String(state.seasonId), week: inGameMonthKey(state.inGameDate) },
    });
    if (settledCount === 0) {
      steps.push('finanzas:ok');
      return;
    }
    const totalClubs = await prisma.club.count();
    if (settledCount >= totalClubs) {
      steps.push('finanzas:ok');
      return;
    }
    // Reanudar barrido mensual interrumpido por crash (clubes sin snapshot).
  }

  // Es el primer turno del mes → aplicamos finanzas reales.
  const monthKey = inGameMonthKey(state.inGameDate);
  const settings = await masterService.getSettings();
  const economyModifier = Math.max(0.1, Math.min(5, settings.economyModifier));
  const clubs = await prisma.club.findMany({
    include: {
      players: true,
      coaches: true,
      staff: { include: { members: true } },
      sponsors: true,
      outsourcings: true,
      manager: true,
    },
  });

  let processed = 0;
  let eliteMaintenanceClubs = 0;
  let eliteMaintenanceTotal = 0;
  for (const club of clubs) {
    // Idempotencia por club (unique clubId+season+week): `week` almacena monthKey
    // (año*12+mes UTC) para que cada mes in-game tenga clave única aunque no haya jornadas.
    const alreadySettled = await prisma.financeSnapshot.findUnique({
      where: { clubId_season_week: { clubId: club.id, season: String(state.seasonId), week: monthKey } },
      select: { id: true },
    });
    if (alreadySettled) {
      processed++;
      continue;
    }

    const finInput = {
      stadiumCapacity: club.stadiumCapacity,
      fans: club.fans,
      socialMass: club.socialMass,
      highClass: club.highClass,
      reputation: club.reputation,
      countryLevel: club.countryLevel,
      ticketPriceLevel: club.ticketPriceLevel,
    };

    // Ingresos de patrocinadores activos (SponsorContract, no Sponsorship legacy)
    // Solo contratos cuya vigencia (years) no ha expirado según la fecha in-game.
    const activeSponsorIncome = club.sponsors
      .filter(sc => deriveSponsorMonthsRemaining(sc.createdAt, sc.years, state.inGameDate) > 0)
      .reduce((sum, sc) => sum + sponsorMonthlyIncome(sc.yearlyIncome), 0);

    // Ingresos
    const gate = gateIncome(finInput);
    const commercial = commercialBreakdown(finInput, activeSponsorIncome).total;
    const totalIncome = Math.round((gate + commercial) * economyModifier);

    // Gastos: salarios jugadores + entrenadores + staff
    const playerSals = club.players.map(p => p.wage);
    const coachSals = club.coaches.map(c => c.salary);
    const totalSalaries = Math.round(monthlySalaries(playerSals, coachSals) * economyModifier);

    // Gastos: subcontrataciones activas (Outsourcing model)
    const activeOutsourcingTypes = club.outsourcings.filter(o => o.active).map(o => o.type);
    const outsourcingCost = Math.round(outsourcingMonthlyCost(activeOutsourcingTypes, club.countryLevel, club.stadiumCapacity).total * economyModifier);

    // P1 GS:2427: los salarios del cuerpo técnico (StaffMember) SE COBRAN — antes
    // staffExpenses era 0 fijo y los efectos del staff salían gratis tras el fee.
    const staffMembers = club.staff?.members ?? [];
    const staffExpenses = Math.round(
      staffMembers.reduce((sum, m) => sum + (Number(m.salary) || 0), 0) * economyModifier,
    );

    const eliteMaintenance = Math.round(eliteLiquidityMaintenance(club) * economyModifier);
    if (eliteMaintenance > 0) {
      eliteMaintenanceClubs++;
      eliteMaintenanceTotal += eliteMaintenance;
    }

    const netChange = totalIncome - totalSalaries - outsourcingCost - staffExpenses - eliteMaintenance;

    // Saldo, penalización de prestigio y snapshot viven en la MISMA transacción.
    // Si el proceso cae antes del snapshot, todo revierte y el reintento no vuelve
    // a reducir prestigio ni a aplicar el neto mensual.
    try {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.financeSnapshot.findUnique({
          where: {
            clubId_season_week: {
              clubId: club.id,
              season: String(state.seasonId),
              week: monthKey,
            },
          },
          select: { id: true },
        });
        if (existing) return;

        const updatedClub = await tx.club.update({
          where: { id: club.id },
          data: {
            budget: { increment: netChange },
            cash: { increment: netChange },
          },
          select: { budget: true },
        });
        const newBudget = moneyToNumber(updatedClub.budget);

        if (newBudget < 0 && club.manager && club.manager.prestige > 0) {
          const newPrestige = prestigeAfterRedMonth(club.manager.prestige);
          await tx.manager.update({
            where: { id: club.manager.id },
            data: { prestige: newPrestige },
          });
          await tx.prestige.create({
            data: {
              managerId: club.manager.id,
              value: newPrestige,
              history: JSON.stringify({
                event: 'red_month',
                from: club.manager.prestige,
                to: newPrestige,
              }),
            },
          });
        }

        await tx.financeSnapshot.create({
          data: {
            clubId: club.id,
            week: monthKey,
            season: String(state.seasonId),
            budget: newBudget,
            income: totalIncome,
            expenses: totalSalaries + outsourcingCost + staffExpenses + eliteMaintenance,
            ticketRevenue: gate,
            tvRevenue: commercialBreakdown(finInput, activeSponsorIncome).tv,
            sponsorRevenue: activeSponsorIncome,
            salaryExpenses: totalSalaries,
            staffExpenses,
            facilityExpenses: outsourcingCost + eliteMaintenance,
          },
        });
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Otro proceso ganó el unique: su transacción ya liquidó el club.
    }

    processed++;
  }

  steps.push(`finanzas:mes:clubs=${processed}:elite=${eliteMaintenanceClubs}:${eliteMaintenanceTotal}`);
}

async function stepAcademy(steps: string[]) {
  // Fase 2 (real): delega en academyService (fórmula de talento FDF, generación
  // cada ~3 meses in-game, envejecimiento y expulsión de >22 por año).
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (!state) return;
  const res = await academyService.advanceTurn(state.inGameDate, state.turn + 1);
  steps.push(`cantera:nuevos:${res.spawned}:expulsados:${res.expelled}`);
}

async function stepStadium(steps: string[], prevDate: Date, inGameDate: Date) {
  // Fase 2 (real): avance de la cola de obras (solo actúa al cruzar un mes UTC).
  const res = await stadiumService.advanceTurn(prevDate, inGameDate);
  steps.push(`estadio:completadas:${res.completed.length}:progreso:${res.progressed.length}`);
}

async function stepFans(steps: string[], prevDate: Date, inGameDate: Date) {
  // Fase 2 (real): masa social mensual + multas por disturbios.
  const res = await fansService.advanceTurn(prevDate, inGameDate);
  steps.push(res.events.length ? `aficion:${res.events.join('|')}` : 'aficion:ok');
}

function parseStatsPayload(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function coerceStoredInjury(raw: unknown, fallbackMatchId: number): StoredMatchInjury | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const playerId = safeNumber(value.playerId, 0);
  if (!playerId) return null;
  const weeksLeft = Math.max(1, Math.min(12, Math.round(safeNumber(value.weeksLeft, safeNumber(value.matchesOut, 1)))));
  return {
    matchId: Math.round(safeNumber(value.matchId, fallbackMatchId)),
    playerId: Math.round(playerId),
    playerName: String(value.playerName ?? `Jugador ${playerId}`),
    team: value.team === 'away' ? 'away' : 'home',
    type: String(value.type ?? 'Lesión de partido'),
    severity: Math.max(1, Math.round(safeNumber(value.severity, weeksLeft))),
    weeksLeft,
  };
}

async function registerEngineInjuriesFromPlayedMatches(
  managerByClub: Map<number, number>,
  inGameDate: Date,
  matchIds: number[],
): Promise<number> {
  // P1 #103: SOLO los partidos del turno actual — antes se cargaban los JSON de
  // TODOS los partidos jugados de la historia en cada tick.
  if (matchIds.length === 0) return 0;
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds }, status: 'played', homeStatsJson: { not: null } },
    select: { id: true, homeStatsJson: true, awayStatsJson: true },
  });

  let registered = 0;
  for (const match of matches) {
    const homeStats = parseStatsPayload(match.homeStatsJson);
    const awayStats = parseStatsPayload(match.awayStatsJson);
    const rawInjuries = asArray(homeStats.allInjuries);
    const injuries = (rawInjuries.length > 0 ? rawInjuries : [
      ...asArray(homeStats.injuries),
      ...asArray(awayStats.injuries),
    ])
      .map(raw => coerceStoredInjury(raw, match.id))
      .filter((injury): injury is StoredMatchInjury => injury != null);

    for (const injury of injuries) {
      const marker = `Match ${injury.matchId}:`;
      const exists = await prisma.injury.findFirst({
        where: { playerId: injury.playerId, type: { startsWith: marker } },
        select: { id: true },
      });
      if (exists) continue;

      const player = await prisma.player.findUnique({
        where: { id: injury.playerId },
        select: { id: true, name: true, clubId: true },
      });
      if (!player) continue;

      const injuredUntil = new Date(inGameDate);
      injuredUntil.setDate(injuredUntil.getDate() + injury.weeksLeft * 7);

      await prisma.$transaction([
        prisma.injury.create({
          data: {
            playerId: injury.playerId,
            type: `${marker} ${injury.type}`,
            severity: injury.severity,
            weeksLeft: injury.weeksLeft,
          },
        }),
        prisma.player.update({
          where: { id: injury.playerId },
          data: { injuredUntil },
        }),
      ]);
      registered++;

      const userId = player.clubId ? managerByClub.get(player.clubId) : undefined;
      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'injury',
            title: `Lesión: ${player.name}`,
            message: `${player.name} estará de baja ${injury.weeksLeft} semana(s) tras el partido.`,
          },
        });
      }
    }
  }

  return registered;
}

// P2 #111: acotado a la TEMPORADA ACTIVA — antes escaneaba los matchEvent de
// toda la historia cada tick y los ciclos de 5 amarillas se acumulaban entre
// temporadas. El `reason` incluye la temporada para que los buckets reinicien.
async function createCardSuspensions(seasonId: number | null): Promise<{ yellow: number; red: number }> {
  const seasonFilter = seasonId
    ? { match: { matchday: { competition: { seasonId } } } }
    : {};
  const yellows = await prisma.matchEvent.findMany({
    where: { type: 'yellow', playerId: { not: null }, ...seasonFilter },
    select: {
      playerId: true,
      cardCount: true,
      match: {
        select: {
          matchday: {
            select: { competition: { select: { id: true, type: true } } },
          },
        },
      },
    },
  });

  const yellowCounts = new Map<string, {
    playerId: number;
    competitionId: number;
    competitionType: string;
    total: number;
  }>();
  for (const event of yellows) {
    if (!event.playerId) continue;
    const competition = event.match.matchday?.competition;
    if (!competition) continue;
    const cards = event.cardCount > 0 ? event.cardCount : 1;
    const key = `${event.playerId}:${competition.id}`;
    const current = yellowCounts.get(key);
    yellowCounts.set(key, {
      playerId: event.playerId,
      competitionId: competition.id,
      competitionType: competition.type,
      total: (current?.total ?? 0) + cards,
    });
  }

  const yellowCandidates = buildYellowSuspensionCandidates(
    [...yellowCounts.values()],
    seasonId,
  );
  const yellow = yellowCandidates.length > 0
    ? (await prisma.suspension.createMany({ data: yellowCandidates, skipDuplicates: true })).count
    : 0;

  const reds = await prisma.matchEvent.findMany({
    where: { type: 'red', playerId: { not: null }, ...seasonFilter },
    select: { id: true, playerId: true, cardCount: true, description: true },
  });

  const redCandidates = buildRedSuspensionCandidates(reds, seasonId);
  const red = redCandidates.length > 0
    ? (await prisma.suspension.createMany({ data: redCandidates, skipDuplicates: true })).count
    : 0;

  return { yellow, red };
}

async function syncSuspendedMatches(): Promise<number> {
  const [suspensions, currentlyMarked] = await Promise.all([
    prisma.suspension.findMany({ select: { playerId: true, matches: true } }),
    prisma.player.findMany({
      where: { suspendedMatches: { gt: 0 } },
      select: { id: true, suspendedMatches: true },
    }),
  ]);

  const nextByPlayer = aggregateSuspensionMatches(suspensions);

  const ids = new Set<number>([
    ...currentlyMarked.map(player => player.id),
    ...nextByPlayer.keys(),
  ]);

  let updated = 0;
  for (const id of ids) {
    const suspendedMatches = nextByPlayer.get(id) ?? 0;
    await prisma.player.update({
      where: { id },
      data: { suspendedMatches },
    });
    updated++;
  }
  return updated;
}

async function stepFebruaryMotivation(
  steps: string[],
  prevDate: Date,
  nextDate: Date,
  currentTurn: number,
) {
  // Solo se ejecuta al cruzar al mes de febrero (mes 1) por primera vez en el año.
  if (prevDate.getUTCMonth() !== 1 && nextDate.getUTCMonth() === 1) {
    const managers = await prisma.manager.findMany({
      where: { clubId: { not: null } },
      select: {
        clubId: true,
        affinityGroup: true,
        club: {
          select: {
            players: { select: { id: true, affinityGroup: true } },
            staff: {
              select: {
                members: {
                  where: { role: { in: ['psychologist', 'Psicologo', 'Psicólogo'] } },
                  select: { attributes: true },
                },
              },
            },
          },
        },
      },
    });
    const permanentlyMotivatedIds: number[] = [];
    for (const manager of managers) {
      const psychologistAffinities = (manager.club?.staff?.members ?? []).flatMap((member) => {
        try {
          const attributes = JSON.parse(member.attributes) as Record<string, unknown>;
          const values = [attributes.affinityGroup, attributes.specialty];
          return values.filter((value): value is string => typeof value === 'string');
        } catch {
          return [];
        }
      });
      for (const player of manager.club?.players ?? []) {
        if (motivationAffinityMatches(player.affinityGroup, manager.affinityGroup, psychologistAffinities)) {
          permanentlyMotivatedIds.push(player.id);
        }
      }
    }
    if (permanentlyMotivatedIds.length > 0) {
      await prisma.player.updateMany({
        where: { id: { in: permanentlyMotivatedIds } },
        data: { isPermanentlyMotivated: true },
      });
    }
    // P3 #127: suelo 0 — el decrement sin guarda podía dejar moral negativa.
    const affected = await prisma.$executeRaw`
      UPDATE "Player" SET morale = GREATEST(0, morale - 5)
      WHERE "isPermanentlyMotivated" = false
        AND ("motivatedUntilTurn" IS NULL OR "motivatedUntilTurn" < ${currentTurn});`;
    steps.push(`febrero:motivados:${permanentlyMotivatedIds.length}:motivacion_drop:${affected}`);
  }
}

async function stepInjuriesSanctions(steps: string[], matchesPlayed: boolean, matchIds: number[]) {
  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { turn: true, inGameDate: true, seasonId: true },
  });
  const rng = makeRng((state?.turn ?? 0) * 15485863 + 71);
  const inGameDate = state?.inGameDate ?? new Date();

  const staffEffectsByClub = await getStaffEffectsForClubs();

  let progressed = 0;
  let healed = 0;
  const activeInjuries = await prisma.injury.findMany({ where: { weeksLeft: { gt: 0 } }, include: { player: true } });
  for (const injury of activeInjuries) {
    const doctorEffects = injury.player.clubId ? staffEffectsByClub.get(injury.player.clubId)?.doctor : undefined;
    const decrement = 1 + (doctorEffects?.extraRecoveryWeeks ?? 0);
    const weeksLeft = Math.max(0, injury.weeksLeft - decrement);

    if (weeksLeft <= 0) {
      await prisma.injury.delete({ where: { id: injury.id } });
      const remaining = await prisma.injury.count({
        where: { playerId: injury.playerId, weeksLeft: { gt: 0 } },
      });
      if (remaining === 0) {
        await prisma.player.update({
          where: { id: injury.playerId },
          data: { injuredUntil: null },
        });
      }
      healed++;
    } else {
      await prisma.injury.update({ where: { id: injury.id }, data: { weeksLeft } });
      progressed++;
    }
  }

  const injuredPlayerIds = new Set(activeInjuries.map(injury => injury.playerId));
  const tiredPlayers = await prisma.player.findMany({
    where: {
      clubId: { not: null },
      fitness: { lt: 55 },
      ...(injuredPlayerIds.size > 0 ? { id: { notIn: [...injuredPlayerIds] } } : {}),
    },
    include: {
      club: { select: { id: true } },
    },
  });

  const managers = await prisma.manager.findMany({
    where: { clubId: { not: null } },
    select: { clubId: true, userId: true },
  });
  const managerByClub = new Map<number, number>();
  for (const manager of managers) {
    if (manager.clubId != null) managerByClub.set(manager.clubId, manager.userId);
  }

  let injuries = 0;
  for (const player of tiredPlayers) {
    if (!player.clubId) continue;
    const doctorEffects = staffEffectsByClub.get(player.clubId)?.doctor;
    const fatigueDeficit = Math.max(0, 55 - player.fitness);
    const starterLoad = player.isStarter ? 0.018 : 0.006;
    const baseChance = Math.max(0.004, Math.min(0.18, 0.018 + fatigueDeficit * 0.006 + starterLoad));
    const injuryChance = Math.max(0.002, baseChance * (1 - (doctorEffects?.injuryChanceReductionPct ?? 0) / 100));

    if (rng() < injuryChance) {
      const severity = rng() < 0.12 ? 3 : rng() < 0.42 ? 2 : 1;
      const rawWeeks = severity + (rng() < 0.25 ? 1 : 0);
      const weeksLeft = Math.max(1, Math.ceil(rawWeeks * (1 - (doctorEffects?.injuryDurationReductionPct ?? 0) / 100)));
      const injuredUntil = new Date(inGameDate);
      injuredUntil.setDate(injuredUntil.getDate() + weeksLeft * 7);
      await prisma.$transaction([
        prisma.injury.create({
          data: {
            playerId: player.id,
            type: severity >= 3 ? 'Rotura muscular' : severity === 2 ? 'Sobrecarga muscular' : 'Molestias físicas',
            severity,
            weeksLeft,
          },
        }),
        prisma.player.update({
          where: { id: player.id },
          data: { injuredUntil },
        }),
      ]);
      injuries++;

      const userId = managerByClub.get(player.clubId);
      if (userId) {
        await prisma.notification.create({
          data: {
            userId,
            type: 'injury',
            title: `Lesión: ${player.name}`,
            message: `${player.name} estará de baja ${weeksLeft} semana(s).`,
          },
        });
      }
    }
  }

  const engineInjuries = await registerEngineInjuriesFromPlayedMatches(managerByClub, inGameDate, matchIds);
  // P3 #124: la sanción solo se descuenta si el EQUIPO del sancionado jugó este
  // turno (antes bastaba con que hubiera habido cualquier partido en el mundo).
  let sanctionsTicked = { count: 0 };
  if (matchesPlayed && matchIds.length > 0) {
    const playedMatches = await prisma.match.findMany({
      where: { id: { in: matchIds } },
      select: { homeClubId: true, awayClubId: true },
    });
    const playedClubIds = [...new Set(playedMatches.flatMap(m => [m.homeClubId, m.awayClubId]))];
    if (playedClubIds.length > 0) {
      sanctionsTicked = await prisma.suspension.updateMany({
        where: { matches: { gt: 0 }, player: { clubId: { in: playedClubIds } } },
        data: { matches: { decrement: 1 } },
      });
    }
  }
  const sanctionsCleared = await prisma.suspension.deleteMany({
    where: {
      matches: { lte: 0 },
      NOT: { reason: { startsWith: 'cards:' } },
    },
  });
  const expiredCardMarkers = await prisma.suspension.findMany({
    where: { matches: { lte: 0 }, reason: { startsWith: 'cards:' } },
    select: { id: true, reason: true },
  });
  const staleCardMarkerIds = expiredCardMarkers
    .filter(marker => {
      const currentSeason = state?.seasonId;
      if (!currentSeason) return false;
      return !marker.reason.startsWith(`cards:yellow:s${currentSeason}:`)
        && !marker.reason.startsWith(`cards:red:s${currentSeason}:`);
    })
    .map(marker => marker.id);
  const staleCardMarkersCleared = staleCardMarkerIds.length > 0
    ? await prisma.suspension.deleteMany({ where: { id: { in: staleCardMarkerIds } } })
    : { count: 0 };
  const cardSanctions = await createCardSuspensions(state?.seasonId ?? null);
  const syncedSuspensions = await syncSuspendedMatches();

  steps.push(
    `lesiones:nuevas:${injuries}:motor:${engineInjuries}:progreso:${progressed}:altas:${healed}`
    + `:sanciones_tick:${sanctionsTicked.count}:tarjetasA:${cardSanctions.yellow}:tarjetasR:${cardSanctions.red}`
    + `:limpias:${sanctionsCleared.count + staleCardMarkersCleared.count}:sync:${syncedSuspensions}`,
  );
}

async function stepScouting(steps: string[]) {
  const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } });
  const rng = makeRng((state?.turn ?? 0) * 32452843 + 19);
  const staffEffectsByClub = await getStaffEffectsForClubs();

  const assignments = await prisma.scoutAssignment.findMany();
  const scoutIds = [...new Set(assignments.map(assignment => assignment.scoutStaffId))];
  const targetIds = [...new Set(assignments.map(assignment => assignment.clubTargetId))];
  const focusedPlayerIds = [...new Set(assignments.map(assignment => focusedScoutPlayerId(assignment.zone)).filter((id): id is number => id != null))];

  const [scouts, targets, managers, focusedPlayers] = await Promise.all([
    scoutIds.length
      ? prisma.staffMember.findMany({ where: { id: { in: scoutIds }, role: 'scout' }, include: { staff: true } })
      : Promise.resolve([]),
    targetIds.length
      ? prisma.club.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true, reputation: true } })
      : Promise.resolve([]),
    prisma.manager.findMany({ where: { clubId: { not: null } }, select: { clubId: true, userId: true, id: true } }),
    focusedPlayerIds.length
      ? prisma.player.findMany({ where: { id: { in: focusedPlayerIds } }, select: { id: true, name: true, position: true, clubId: true } })
      : Promise.resolve([]),
  ]);

  const scoutById = new Map(scouts.map(scout => [scout.id, scout]));
  const targetById = new Map(targets.map(target => [target.id, target]));
  const managerByClub = new Map(managers.map(manager => [manager.clubId, manager]));
  const focusedPlayerById = new Map(focusedPlayers.map(player => [player.id, player]));

  let assignmentsAdvanced = 0;
  let analystBoosted = 0;
  let milestoneReports = 0;
  for (const assignment of assignments) {
    const scout = scoutById.get(assignment.scoutStaffId);
    if (!scout || !scout.staff.clubId) continue;

    const effectiveness = parseStaffEffectiveness(scout.attributes);
    const analystBonus = staffEffectsByClub.get(scout.staff.clubId)?.tacticalAnalyst.scoutProgressBonus ?? 0;
    const progress = 8 + Math.round(effectiveness * 4 + rng() * 5) + analystBonus;
    const previous = assignment.analysisPoints;
    const next = Math.min(100, previous + progress);
    if (next === previous) continue;

    await prisma.scoutAssignment.update({
      where: { id: assignment.id },
      data: { analysisPoints: next },
    });
    assignmentsAdvanced++;
    if (analystBonus > 0) analystBoosted++;

    const reached = [40, 75, 100].filter(threshold => previous < threshold && next >= threshold).pop();
    if (!reached) continue;

    const manager = managerByClub.get(scout.staff.clubId);
    const target = targetById.get(assignment.clubTargetId);
    if (!manager || !target) continue;
    const focusedPlayerId = focusedScoutPlayerId(assignment.zone);
    const focusedPlayer = focusedPlayerId ? focusedPlayerById.get(focusedPlayerId) : null;
    const title = focusedPlayer ? `Informe de ojeo: ${focusedPlayer.name}` : `Ojeo actualizado: ${target.name}`;

    await prisma.notification.create({
      data: {
        userId: manager.userId,
        type: 'scout_report',
        title,
        message: focusedPlayer
          ? reached >= 100
            ? `Informe completo de ${focusedPlayer.name}: atributos, valor y salario desbloqueados.`
            : reached >= 75
              ? `Informe avanzado de ${focusedPlayer.name}: atributos principales visibles.`
              : `Informe básico de ${focusedPlayer.name}: valoración general visible.`
          : reached >= 100
            ? `Informe completo de ${target.name}: plantilla, atributos y puntos débiles desbloqueados.`
            : reached >= 75
              ? `Informe avanzado de ${target.name}: atributos principales visibles.`
              : `Informe básico de ${target.name}: valoración general visible.`,
        data: focusedPlayer ? JSON.stringify({
          playerId: focusedPlayer.id,
          clubId: focusedPlayer.clubId,
          assignmentId: assignment.id,
          analysisPoints: next,
          route: `/player/${focusedPlayer.id}`,
        }) : undefined,
      },
    });
    milestoneReports++;
  }

  let nextOpponentReports = 0;
  const clubsWithAnalyst = [...staffEffectsByClub.entries()]
    .filter(([, effects]) => effects.tacticalAnalyst.scoutProgressBonus > 0)
    .map(([clubId]) => clubId);
  const clubsWithScouts = [...new Set([
    ...scouts.map(scout => scout.staff.clubId).filter((clubId): clubId is number => clubId != null),
    ...clubsWithAnalyst,
  ])];
  for (const clubId of clubsWithScouts) {
    const manager = managerByClub.get(clubId);
    if (!manager) continue;

    const nextMatch = await prisma.match.findFirst({
      where: {
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
        status: 'scheduled',
      },
      include: { matchday: { select: { number: true } } },
      orderBy: [{ matchday: { number: 'asc' } }, { id: 'asc' }],
    });
    if (!nextMatch) continue;

    const opponentId = nextMatch.homeClubId === clubId ? nextMatch.awayClubId : nextMatch.homeClubId;
    const opponent = await prisma.club.findUnique({ where: { id: opponentId }, select: { name: true } });
    if (!opponent) continue;

    const title = `Reporte de Ojeador: ${opponent.name} J${nextMatch.matchday?.number ?? '?'}`;
    const alreadySent = await prisma.notification.findFirst({
      where: { userId: manager.userId, type: 'scout_report', title },
      select: { id: true },
    });
    if (alreadySent) continue;

    const opponentManager = await prisma.manager.findFirst({ where: { clubId: opponentId }, select: { id: true } });
    const tactic = opponentManager
      ? await prisma.tactic.findFirst({ where: { managerId: opponentManager.id, isDefault: true } })
      : null;

    await prisma.notification.create({
      data: {
        userId: manager.userId,
        type: 'scout_report',
        title,
        message: tactic
          ? `${opponent.name} prepara ${tactic.formation} con construcción ${tactic.construction} y destrucción ${tactic.destruction}.`
          : `${opponent.name} no tiene táctica predeterminada visible. Revisa el informe de ojeo del club.`,
      },
    });
    nextOpponentReports++;
  }

  steps.push(`ojeo:asignaciones:${assignmentsAdvanced}:analista:${analystBoosted}:hitos:${milestoneReports}:rival:${nextOpponentReports}`);
}

async function stepShareValues(steps: string[], inGameDate: Date, currentTurn: number) {
  // Fase 4 (real): revaloriza las 1.500 acciones de cada club, recalcula la
  // economía mundial, genera rankings y cierra elecciones vencidas.
  const updatedShares = await sharesService.recalcAllShareValues();
  steps.push(`acciones:${updatedShares}`);

  const econStats = await worldEconomyService.computeIndex(inGameDate, currentTurn);
  await worldEconomyService.record(econStats, inGameDate);
  steps.push(`economia:${econStats.inflationIndex}`);

  // P2 #112: la inflación se aplica SOLO al cruzar de mes in-game (antes era cada
  // turno con ROUND compuesto → deriva acumulativa). El multiplicador es el
  // cociente del índice actual contra el último registro del mes ANTERIOR, y
  // `wage` es la única fuente salarial de Player.
  const inflationState = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { prevInGameDate: true },
  });
  const prevTickDate = resolvePrevInGameDate(inflationState?.prevInGameDate, inGameDate);
  if (crossedIntoNewMonth(prevTickDate, inGameDate)) {
    const monthStart = new Date(Date.UTC(inGameDate.getUTCFullYear(), inGameDate.getUTCMonth(), 1));
    const baseRecord = await prisma.worldEconomy.findFirst({
      where: { inGameDate: { lt: monthStart } },
      orderBy: { inGameDate: 'desc' },
      select: { inflationIndex: true },
    });
    const baseIndex = baseRecord?.inflationIndex ?? 0;
    let multiplier = baseIndex > 0 ? econStats.inflationIndex / baseIndex : 1.0;
    // Acotado: la inflación mensual no puede mover precios más de ±20%.
    multiplier = Math.max(0.8, Math.min(1.2, multiplier));
    if (multiplier !== 1.0) {
      await prisma.$executeRaw`
        UPDATE "Player"
        SET
          "marketValue" = ROUND("marketValue" * ${multiplier}),
          "wage" = ROUND("wage" * ${multiplier}),
          "releaseClause" = ROUND("releaseClause" * ${multiplier})
      `;
      steps.push(`inflacion:mes:${multiplier.toFixed(3)}`);
    }
  }

  const ranks = await rankingService.stepGenerateRankings(inGameDate);
  steps.push(`rankings:${ranks}`);

  const closed = await electionsService.stepCloseExpiredElections(inGameDate);
  if (closed > 0) steps.push(`elecciones-cerradas:${closed}`);
}
async function stepNotifications(steps: string[]) {
  // Enviar una notificación general del turno
  const state = await prisma.gameState.findFirst({ where: { isActive: true } });
  if (state) {
    const managers = await prisma.manager.findMany();
    await Promise.all(managers.map(manager => pushTurnProcessed(manager.userId)));
    steps.push('notif:enviadas');
  }
}


// ─── NARRATIVE & SEASON CLOSE (Etapa 7) ───────────────────────────────────────

async function stepNarrative(steps: string[], matchIds: number[]) {
  let pressCount = 0;
  let newsCount = 0;

  for (const matchId of matchIds) {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        homeClub: true,
        awayClub: true,
        playerStats: {
          include: { player: { select: { id: true, name: true } } },
          orderBy: { rating: 'desc' }
        }
      }
    });

    if (!match || match.homeGoals === null || match.awayGoals === null) continue;

    // 1. Goleadas
    const diff = Math.abs(match.homeGoals - match.awayGoals);
    if (diff >= 3) {
      const winner = match.homeGoals > match.awayGoals ? match.homeClub : match.awayClub;
      const loser = match.homeGoals > match.awayGoals ? match.awayClub : match.homeClub;
      await prisma.pressItem.create({
        data: {
          matchdayId: match.matchdayId,
          headline: `¡Goleada de escándalo! ${winner.shortName} arrasa a ${loser.shortName} (${match.homeGoals}-${match.awayGoals})`,
          content: `El ${winner.name} dominó el encuentro de principio a fin dejando sin opciones al ${loser.name}.`
        }
      });
      pressCount++;
    } else if (match.homeGoals + match.awayGoals >= 5 && diff <= 1) {
      await prisma.pressItem.create({
        data: {
          matchdayId: match.matchdayId,
          headline: `¡Partidazo de infarto! ${match.homeClub.shortName} ${match.homeGoals}-${match.awayGoals} ${match.awayClub.shortName}`,
          content: `Un auténtico espectáculo ofensivo que pasará a la historia de la liga.`
        }
      });
      pressCount++;
    }

    // 2. Derbis (Rivalries)
    const rivalry = await prisma.rivalry.findFirst({
      where: {
        OR: [
          { clubAId: match.homeClubId, clubBId: match.awayClubId },
          { clubAId: match.awayClubId, clubBId: match.homeClubId }
        ]
      }
    });
    if (rivalry) {
      await prisma.pressItem.create({
        data: {
          matchdayId: match.matchdayId,
          headline: `${rivalry.name}: ${match.homeClub.shortName} y ${match.awayClub.shortName} chocaron (${match.homeGoals}-${match.awayGoals})`,
          content: `La máxima tensión del derbi se vivió hoy en el césped.`
        }
      });
      pressCount++;
    }

    // 3. MVP del partido
    if (match.playerStats.length > 0) {
      const mvp = match.playerStats[0];
      if (mvp.rating >= 8.5) {
        await prisma.pressItem.create({
          data: {
            matchdayId: match.matchdayId,
            headline: `${mvp.player.name} firma una actuación estelar (${mvp.rating.toFixed(1)})`,
            content: `El jugador fue el rey indiscutible del encuentro entre ${match.homeClub.shortName} y ${match.awayClub.shortName}.`
          }
        });
        pressCount++;
      }
    }
  }

  // 4. Lesiones graves (generar News para el Manager)
  const recentInjuries = await prisma.injury.findMany({
    where: { weeksLeft: { gte: 4 } },
    orderBy: { id: 'desc' },
    take: 20,
    include: { player: { include: { club: { include: { managerContracts: { include: { manager: true } } } } } } }
  });

  const sentNewsForInjury = new Set<number>();
  for (const inj of recentInjuries) {
    if (sentNewsForInjury.has(inj.playerId)) continue;
    sentNewsForInjury.add(inj.playerId);
    
    if (inj.player.club && inj.player.club.managerContracts.length > 0) {
      const manager = inj.player.club.managerContracts[0].manager;
      
      // Check if we already notified
      const alreadySent = await prisma.news.findFirst({
        where: { recipientId: manager.id, subject: { contains: inj.player.name }, type: 'injury' }
      });
      
      if (!alreadySent) {
        await prisma.news.create({
          data: {
            type: 'board', // Use board or medical
            subject: `Lesión grave: ${inj.player.name}`,
            body: `Los médicos confirman que ${inj.player.name} estará de baja ${inj.weeksLeft} semanas por ${inj.type}.`,
            recipientId: manager.id
          }
        });
        newsCount++;
      }
    }
  }

  steps.push(`prensa:${pressCount}:noticias:${newsCount}`);
}

async function grantManagerExperience(
  homeClubId: number,
  awayClubId: number,
  homeGoals: number,
  awayGoals: number,
  competitionId: number | null,
  winnerClubId: number | null
) {
  let hPts = 0, aPts = 0;
  if (winnerClubId) {
    if (winnerClubId === homeClubId) hPts = 3;
    else if (winnerClubId === awayClubId) aPts = 3;
  } else {
    if (homeGoals > awayGoals) hPts = 3;
    else if (awayGoals > homeGoals) aPts = 3;
    else { hPts = 1; aPts = 1; }
  }

  const baseXp = 10;
  const xpPerPoint = 20;

  const homeXP = baseXp + (hPts * xpPerPoint);
  const awayXP = baseXp + (aPts * xpPerPoint);

  let isContinental = false;
  if (competitionId) {
    const comp = await prisma.competition.findUnique({ where: { id: competitionId }, select: { isContinental: true } });
    if (comp?.isContinental) isContinental = true;
  }

  const getPrestige = (pts: number) => {
    if (pts === 3) return isContinental ? 20 : 10;
    if (pts === 1) return isContinental ? 10 : 5;
    return 0;
  };

  const homePrestige = getPrestige(hPts);
  const awayPrestige = getPrestige(aPts);

  await prisma.$transaction(async (tx) => {
    const homeClub = await tx.club.findUnique({ where: { id: homeClubId }, include: { manager: true } });
    if (homeClub?.manager) {
      await awardManagerXPAndPrestige(tx, homeClub.manager, homeXP, homePrestige, 'Resultado de partido');
    }
    
    const awayClub = await tx.club.findUnique({ where: { id: awayClubId }, include: { manager: true } });
    if (awayClub?.manager) {
      await awardManagerXPAndPrestige(tx, awayClub.manager, awayXP, awayPrestige, 'Resultado de partido');
    }
  });
}

async function awardManagerXPAndPrestige(tx: any, manager: any, xpGained: number, prestigeGained: number, reason: string) {
  const newXp = manager.xp + xpGained;
  const newLevel = careerLevelFromXp(newXp);
  const newPrestige = manager.prestige + prestigeGained;
  
  await tx.manager.update({
    where: { id: manager.id },
    data: {
      xp: newXp,
      level: newLevel > manager.level ? newLevel : manager.level,
      prestige: newPrestige
    }
  });

  if (prestigeGained > 0) {
    await tx.managerPrestigeLog.create({
      data: {
        managerId: manager.id,
        points: prestigeGained,
        description: reason
      }
    });
  }
}

/**
 * Fase 7: Limpieza de base de datos para evitar exceder los 500 MB en Neon.
 * Borra el timeline detallado de los partidos que tengan más de 30 días in-game.
 */

async function stepRecords(steps: string[], turn: number, date: Date) {
  // Snapshot de hemeroteca
  await prisma.turnSnapshot.create({
    data: {
      turn,
      inGameDate: date,
      snapshotData: JSON.stringify({ note: 'Turn processed' })
    }
  });
  steps.push('hemeroteca:snapshot_saved');
  // La acumulación de ClubRecords más fina se derivará o se hará al final de la temporada.
}

async function stepTickZeroCache(steps: string[]) {
  try {
    const { warmPublicWorldTickZeroCache } = await import('../public/public.service');
    const warmed = await warmPublicWorldTickZeroCache();
    steps.push(warmed.enabled ? `tickzero:${warmed.warmed}:${warmed.errors}` : 'tickzero:off');
  } catch (err) {
    console.error('[tick] tick-zero cache warmup failed (non blocking):', err);
    steps.push('tickzero:ERROR');
  }
}

async function stepDbCleanup(steps: string[], nextDate: Date) {
  const thirtyDaysAgo = new Date(nextDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // P2 #117: la poda escribe un OBJETO reducido (no '[]') que PRESERVA seed,
  // knockout, ganador y penaltis — sin esto la auditoría por semilla y el avance
  // de brackets (winnerFromStoredStats) dejaban de funcionar en partidos viejos.
  let result: unknown = 0;
  try {
    result = await prisma.$executeRaw`
      UPDATE "Match"
      SET
        "homeStatsJson" = COALESCE(jsonb_strip_nulls(jsonb_build_object(
          'seed', ("homeStatsJson")::jsonb -> 'seed',
          'knockout', ("homeStatsJson")::jsonb -> 'knockout',
          'winnerClubId', ("homeStatsJson")::jsonb -> 'winnerClubId',
          'winnerTeam', ("homeStatsJson")::jsonb -> 'winnerTeam',
          'penalties', ("homeStatsJson")::jsonb -> 'penalties',
          'competitionId', ("homeStatsJson")::jsonb -> 'competitionId',
          'matchdayId', ("homeStatsJson")::jsonb -> 'matchdayId',
          'bye', ("homeStatsJson")::jsonb -> 'bye',
          'pruned', to_jsonb(true)
        ))::text, '{}'),
        "awayStatsJson" = COALESCE(jsonb_strip_nulls(jsonb_build_object(
          'knockout', ("awayStatsJson")::jsonb -> 'knockout',
          'winnerClubId', ("awayStatsJson")::jsonb -> 'winnerClubId',
          'winnerTeam', ("awayStatsJson")::jsonb -> 'winnerTeam',
          'penalties', ("awayStatsJson")::jsonb -> 'penalties',
          'bye', ("awayStatsJson")::jsonb -> 'bye',
          'pruned', to_jsonb(true)
        ))::text, '{}')
      WHERE "playedAt" < ${thirtyDaysAgo}
        AND "homeStatsJson" IS NOT NULL
        AND "homeStatsJson" NOT LIKE '%"pruned"%'
    `;
  } catch (err) {
    console.error('[tick] limpieza de BD fallida (se reintenta el próximo turno):', err);
  }

  if (typeof result === 'number' && result > 0) {
    steps.push(`limpieza_db:${result}_partidos`);
  }
}
