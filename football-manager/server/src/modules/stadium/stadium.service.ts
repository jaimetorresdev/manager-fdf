import prisma from '../../db/prisma';
import { crossedIntoNewMonth } from '../game/tick.logic';

// ─── Types ────────────────────────────────────────────────────────────────────

type SectorType = 'north' | 'south' | 'east' | 'west';
type FacilityType = 'seats' | 'boxes' | 'parking' | 'sportsCity' | SectorType;
type UpgradeType = FacilityType;

interface UpgradeRequest {
  type: UpgradeType;
  slot?: number; // 0-4 for seats/boxes/parking
}

interface UpgradeSpec {
  type: UpgradeType;
  slot?: number;
  workKey: string;
  label: string;
  cost: number;
  months: number;
  capacityDelta?: number;
  nextValue?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ARRAY_LENGTH = 5;
const DEFAULT_ARRAY = Array<number>(ARRAY_LENGTH).fill(0);

const MAX_LEVELS: Record<'seats' | 'boxes' | 'parking', number> = {
  seats: 5,
  boxes: 5,
  parking: 5,
};

/** Capacity added by amphitheater sector (north/south +2k, east/west +4k) */
const SECTOR_CAPACITY: Record<SectorType, number> = {
  north: 2000,
  south: 2000,
  east: 4000,
  west: 4000,
};

/** Parking attendance boost per average level (4% each) */
const PARKING_BOOST_PER_LEVEL = 0.04;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseLevels(raw: string | null | undefined): number[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [...DEFAULT_ARRAY];
    return DEFAULT_ARRAY.map((_, i) => Number(value[i] ?? 0));
  } catch {
    return [...DEFAULT_ARRAY];
  }
}

/** Texto en español de un workKey ("sector:north", "seats:2", "sportsCity") para News/UI. */
export function workLabel(workKey: string): string {
  if (workKey === 'sportsCity') return 'ciudad deportiva';
  const SECTOR_LABEL: Record<string, string> = {
    'sector:north': 'grada norte', 'sector:south': 'grada sur',
    'sector:east': 'grada este', 'sector:west': 'grada oeste',
  };
  if (workKey in SECTOR_LABEL) return SECTOR_LABEL[workKey];
  const FACILITY_LABEL: Record<string, string> = { seats: 'asientos', boxes: 'palcos', parking: 'aparcamiento' };
  const colonIndex = workKey.lastIndexOf(':');
  if (colonIndex !== -1) {
    const facility = FACILITY_LABEL[workKey.substring(0, colonIndex)];
    if (facility) return `${facility} (sector ${Number(workKey.substring(colonIndex + 1)) + 1})`;
  }
  return workKey;
}

function encodeLevels(levels: number[]): string {
  return JSON.stringify(DEFAULT_ARRAY.map((_, i) => Number(levels[i] ?? 0)));
}

function averageLevel(levels: number[]): number {
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

function priceMultiplier(level: string): number {
  if (level === 'low') return 0.82;
  if (level === 'high') return 1.16;
  return 1;
}

/**
 * Ticket price formula:
 *   base(countryLevel) + seatBonus − 5€ per division below top
 * countryLevel: Club.countryLevel (1-3).
 * Division offset: defaulting to 0 (top division) as no direct reference.
 */
function computeTicketPrice(
  countryLevel: number,
  seatLevels: number[],
  ticketPriceLevel: string,
): number {
  const base = 16 + countryLevel * 4; // 20€ lvl1, 24€ lvl2, 28€ lvl3
  const seatBonus = averageLevel(seatLevels) * 3.5;
  return Math.round((base + seatBonus) * priceMultiplier(ticketPriceLevel));
}

function parkingAttendanceBoost(parking: number[]): number {
  return averageLevel(parking) * PARKING_BOOST_PER_LEVEL;
}

function occupancyRate(
  fans: number,
  reputation: number,
  capacity: number,
  parking: number[],
  ticketPriceLevel: string,
): number {
  const fanPressure = Math.min(1, fans / Math.max(1, capacity * 1.15));
  const reputationFactor = 0.5 + reputation / 170;
  const priceDrag = ticketPriceLevel === 'high' ? 0.9 : ticketPriceLevel === 'low' ? 1.08 : 1;
  const parkingBoost = 1 + parkingAttendanceBoost(parking);
  return Math.max(0.18, Math.min(0.96, fanPressure * reputationFactor * priceDrag * parkingBoost));
}

/** Sports city level → academy talent bonus (additive points) */
export function sportsCityTalentBonus(sportsCity: number): number {
  return Math.max(0, Math.min(9, sportsCity));
}

// ─── Upgrade Spec Builder ─────────────────────────────────────────────────────

// AUDIT 5.2-6: tope de aforo del anfiteatro (los sectores north/south/east/west no
// tenían ningún límite, a diferencia de sportsCity y seats/boxes/parking → aforo
// ampliable infinitamente).
const MAX_STADIUM_CAPACITY = 150_000;

function buildUpgradeSpec(
  stadium: {
    capacity: number;
    seats: string;
    boxes: string;
    parking: string;
    sportsCity: number;
  },
  req: UpgradeRequest,
): UpgradeSpec {
  const sectors: SectorType[] = ['north', 'south', 'east', 'west'];
  if (sectors.includes(req.type as SectorType)) {
    const sector = req.type as SectorType;
    const capacityDelta = SECTOR_CAPACITY[sector];
    // AUDIT 5.2-6: no permitir superar el aforo máximo del anfiteatro.
    if (stadium.capacity + capacityDelta > MAX_STADIUM_CAPACITY) {
      throw new Error(`El aforo del estadio ya está en el máximo (${MAX_STADIUM_CAPACITY / 1000}k).`);
    }
    return {
      type: sector,
      workKey: `sector:${sector}`,
      label: `Expand ${sector} amphitheater (+${capacityDelta / 1000}k seats)`,
      cost: sector === 'north' || sector === 'south' ? 800000 : 1400000,
      months: 4,
      capacityDelta,
    };
  }

  if (req.type === 'sportsCity') {
    const next = stadium.sportsCity + 1;
    if (next > 9) throw new Error('Sports city already at max level (9)');
    return {
      type: 'sportsCity',
      workKey: 'sportsCity',
      label: `Upgrade sports city to level ${next}`,
      cost: 900000 + next * 500000,
      months: next >= 6 ? 5 : next >= 4 ? 4 : 3,
      nextValue: next,
    };
  }

  const slot = Number(req.slot ?? 0);
  if (!Number.isInteger(slot) || slot < 0 || slot >= ARRAY_LENGTH) {
    throw new Error('Invalid facility slot (0-4)');
  }

  const field = req.type as 'seats' | 'boxes' | 'parking';
  const levels = parseLevels(stadium[field]);
  const next = levels[slot] + 1;
  const maxLevel = MAX_LEVELS[field];
  if (next > maxLevel) throw new Error(`${req.type} sector ${slot + 1} already at max level`);

  const costs: Record<string, number> = { seats: 600000, boxes: 1800000, parking: 480000 };
  const monthsBase: Record<string, number> = { seats: 2, boxes: 3, parking: 2 };

  return {
    type: req.type,
    slot,
    workKey: `${req.type}:${slot}`,
    label: `Upgrade ${req.type} sector ${slot + 1} to level ${next}`,
    cost: costs[req.type] * next,
    months: monthsBase[req.type] + (next >= 4 ? 1 : 0),
    nextValue: next,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const stadiumService = {
  async getStadium(clubId: number) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        stadium: { include: { works: { orderBy: { id: 'asc' } } } },
      },
    });
    if (!club) throw new Error('Club not found');

    // AUDIT 3.7: este GET DEBE ser de solo-lectura. Antes persistía un `Stadium` por
    // defecto en cada lectura de un club sin estadio. Ahora deriva una vista EFÍMERA
    // (id 0, NO persistida) con los defaults del modelo; la fila real se crea cuando
    // el usuario encola una obra (`enqueueWork`).
    const stadium = club.stadium ?? {
      id: 0,
      clubId,
      capacity: club.stadiumCapacity,
      seats: '[0,0,0,0,0]',
      boxes: '[0,0,0,0,0]',
      parking: '[0,0,0,0,0]',
      sportsCity: 0,
      works: [] as NonNullable<typeof club.stadium>['works'],
    };

    const seats = parseLevels(stadium.seats);
    const boxes = parseLevels(stadium.boxes);
    const parking = parseLevels(stadium.parking);

    const occupancy = occupancyRate(club.fans, club.reputation, stadium.capacity, parking, club.ticketPriceLevel);
    const attendance = Math.round(stadium.capacity * occupancy);
    const ticketPrice = computeTicketPrice(club.countryLevel, seats, club.ticketPriceLevel);
    const matchdayRevenue = attendance * ticketPrice;

    const homeBonus =
      occupancy >= 0.9  ? { construction: 3, destruction: 3, label: '>90%' }
      : occupancy >= 0.75 ? { construction: 2, destruction: 2, label: '75-90%' }
      : occupancy >= 0.5  ? { construction: 1, destruction: 1, label: '50-75%' }
      : occupancy < 0.25  ? { construction: -1, destruction: -1, label: '<25%' }
      : { construction: 0, destruction: 0, label: '25-50%' };

    // Sequential queue: first item = active, rest = pending
    const activeWork = stadium.works[0] ?? null;
    const pendingWorks = stadium.works.slice(1);

    return {
      id: stadium.id,
      name: club.stadiumName,
      city: club.city,
      capacity: stadium.capacity,
      facilities: {
        seats,
        boxes,
        parking,
        sportsCity: stadium.sportsCity,
      },
      works: {
        active: activeWork,
        queue: pendingWorks,
      },
      metrics: {
        occupancyPct: Math.round(occupancy * 100),
        attendance,
        ticketPrice,
        matchdayRevenue,
        parkingAttendanceBonusPct: Math.round(parkingAttendanceBoost(parking) * 100),
        sportsCityTalentBonus: sportsCityTalentBonus(stadium.sportsCity),
        homeBonus,
      },
      budget: club.budget,
      availableUpgrades: this._availableUpgrades(stadium),
    };
  },

  _availableUpgrades(stadium: {
    capacity: number;
    seats: string;
    boxes: string;
    parking: string;
    sportsCity: number;
  }): UpgradeSpec[] {
    const specs: UpgradeSpec[] = [];

    // Amphitheater sectors
    for (const sector of ['north', 'south', 'east', 'west'] as SectorType[]) {
      // AUDIT 5.2-6: excluir sectores que ya superarían el aforo máximo.
      try {
        specs.push(buildUpgradeSpec(stadium, { type: sector }));
      } catch {
        // al máximo — omitir
      }
    }

    // Array facilities
    for (const type of ['seats', 'boxes', 'parking'] as const) {
      const levels = parseLevels(stadium[type]);
      levels.forEach((_lv, slot) => {
        try {
          specs.push(buildUpgradeSpec(stadium, { type, slot }));
        } catch {
          // maxed — skip
        }
      });
    }

    // Sports city
    try {
      specs.push(buildUpgradeSpec(stadium, { type: 'sportsCity' }));
    } catch {
      // maxed
    }

    return specs;
  },

  /**
   * Enqueue a construction work.
   * The queue is sequential: only the FIRST entry (lowest id) is "active";
   * the rest wait. Budget is reserved immediately upon enqueue.
   */
  async enqueueWork(clubId: number, req: UpgradeRequest) {
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      include: {
        stadium: { include: { works: { orderBy: { id: 'asc' } } } },
      },
    });
    if (!club) throw new Error('Club not found');

    const stadium = club.stadium ?? (await prisma.stadium.create({
      data: { clubId, capacity: club.stadiumCapacity },
      include: { works: { orderBy: { id: 'asc' } } },
    }));

    const spec = buildUpgradeSpec(stadium, req);

    const alreadyQueued = stadium.works.some((w) => w.type === spec.workKey);
    if (alreadyQueued) throw new Error('This upgrade is already in the construction queue');

    if (club.budget < spec.cost) throw new Error('Presupuesto insuficiente');

    await prisma.$transaction(async (tx) => {
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: spec.cost } },
        data: { budget: { decrement: spec.cost }, cash: { decrement: spec.cost } },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente');

      // Effects (capacity delta for sectors) are applied when the work COMPLETES (advanceTurn).
      await tx.stadiumWork.create({
        data: {
          stadiumId: stadium.id,
          type: spec.workKey,
          monthsRemaining: spec.months,
        },
      });
    });

    return this.getStadium(clubId);
  },

  /**
   * Tick hook: advance the active construction work.
   * Called by game.service.ts processTick() (wiring documented in INTEGRATION_fase2.md).
   *
   * Strategy: 1 in-game month = 10 turns (DAYS_PER_TURN=3, ~30 days/month).
   * We decrement monthsRemaining by 1 only when the game day crosses a month boundary
   * (inGameDate.getDate() === 1). Works complete when monthsRemaining reaches 0.
   */
  async advanceTurn(prevDate: Date, inGameDate: Date): Promise<{ completed: string[]; progressed: string[] }> {
    const completed: string[] = [];
    const progressed: string[] = [];

    // Only act on month boundary (UTC-safe, TZ-independent)
    if (!crossedIntoNewMonth(prevDate, inGameDate)) return { completed, progressed };

    const stadiums = await prisma.stadium.findMany({
      include: { works: { orderBy: { id: 'asc' } } },
    });

    for (const stadium of stadiums) {
      if (stadium.works.length === 0) continue;

      const activeWork = stadium.works[0];
      const newMonths = activeWork.monthsRemaining - 1;

      if (newMonths <= 0) {
        await this._applyWork(stadium.id, activeWork.type);
        await prisma.stadiumWork.delete({ where: { id: activeWork.id } });
        completed.push(`stadium:${stadium.id}:${activeWork.type}`);
        // QW-10: News de obra terminada (aditivo) — notifica al mánager y da a
        // zone-badges un registro consultable (el StadiumWork completado se borra).
        try {
          const manager = await prisma.manager.findFirst({
            where: { clubId: stadium.clubId },
            select: { id: true },
          });
          if (manager) {
            await prisma.news.create({
              data: {
                recipientId: manager.id,
                type: 'stadium',
                subject: `Obra terminada: ${workLabel(activeWork.type)}`,
                body: 'La junta confirma que la obra ha finalizado y ya está operativa. Pásate por el estadio para verla.',
              },
            });
          }
        } catch (err) {
          console.error(`[stadium] no se pudo crear la News de obra terminada (${activeWork.type}):`, err);
        }
      } else {
        await prisma.stadiumWork.update({
          where: { id: activeWork.id },
          data: { monthsRemaining: newMonths },
        });
        progressed.push(`stadium:${stadium.id}:${activeWork.type}:${newMonths}m`);
      }
    }

    return { completed, progressed };
  },

  /** Apply a completed construction work's structural effect */
  async _applyWork(stadiumId: number, workKey: string): Promise<void> {
    const stadium = await prisma.stadium.findUnique({ where: { id: stadiumId } });
    if (!stadium) return;

    if (workKey === 'sportsCity') {
      await prisma.stadium.update({
        where: { id: stadiumId },
        data: { sportsCity: { increment: 1 } },
      });
      return;
    }

    const sectorCapacity: Record<string, number> = {
      'sector:north': 2000,
      'sector:south': 2000,
      'sector:east': 4000,
      'sector:west': 4000,
    };
    if (workKey in sectorCapacity) {
      await prisma.stadium.update({
        where: { id: stadiumId },
        data: { capacity: { increment: sectorCapacity[workKey] } },
      });
      return;
    }

    // Array facility: "seats:2", "boxes:0", "parking:4"
    const colonIndex = workKey.lastIndexOf(':');
    if (colonIndex !== -1) {
      const facilityType = workKey.substring(0, colonIndex);
      const slot = parseInt(workKey.substring(colonIndex + 1), 10);
      if (['seats', 'boxes', 'parking'].includes(facilityType) && !isNaN(slot)) {
        const field = facilityType as 'seats' | 'boxes' | 'parking';
        const levels = parseLevels(stadium[field]);
        levels[slot] = (levels[slot] ?? 0) + 1;
        await prisma.stadium.update({
          where: { id: stadiumId },
          data: { [field]: encodeLevels(levels) },
        });
      }
    }
  },
};
