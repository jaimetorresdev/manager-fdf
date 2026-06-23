/** Zonas de clasificación canónicas (espejo de server/world/standingsZones + continental/fase suiza). */

export type MovementZone = 'promotion' | 'relegation' | 'safe';

export interface MovementSlots {
  promotionSlots: number;
  relegationSlots: number;
}

export type DisplayZone = 'champion' | 'europa' | 'relegated' | 'normal';

export interface LeagueZoneMeta {
  tier: number;
  maxTier: number;
  totalRows: number;
  matchdayCount?: number;
  movementZone?: MovementZone;
}

export interface LegendItem {
  key: DisplayZone;
  color: string;
}

const CONTINENTAL = { ucl: 4, uel: 2 } as const;
const SWISS_DIRECT = 8;
const SWISS_PLAYOFF = 24;

export function competitionMovementSlots(
  tier: number,
  maxTier: number,
  totalRows: number,
): MovementSlots {
  const boundedRows = Math.max(0, Math.trunc(totalRows));
  const promotionSlots = tier > 1 ? Math.min(3, boundedRows) : 0;
  const relegationSlots = tier < maxTier
    ? Math.min(3, Math.max(0, boundedRows - promotionSlots))
    : 0;
  return { promotionSlots, relegationSlots };
}

export function movementZoneForIndex(
  index: number,
  totalRows: number,
  slots: MovementSlots,
): MovementZone {
  if (index < slots.promotionSlots) return 'promotion';
  if (slots.relegationSlots > 0 && index >= totalRows - slots.relegationSlots) {
    return 'relegation';
  }
  return 'safe';
}

function isSwissLeaguePhase(meta: LeagueZoneMeta): boolean {
  return meta.totalRows >= 36 && (meta.matchdayCount ?? 0) <= 12;
}

/** Resuelve la zona visual de una fila (posición 1-based). */
export function leagueDisplayZone(position: number, meta: LeagueZoneMeta): DisplayZone {
  if (meta.movementZone === 'promotion') return 'champion';
  if (meta.movementZone === 'relegation') return 'relegated';

  if (isSwissLeaguePhase(meta)) {
    if (position <= SWISS_DIRECT) return 'champion';
    if (position <= SWISS_PLAYOFF) return 'europa';
    return 'normal';
  }

  const slots = competitionMovementSlots(meta.tier, meta.maxTier, meta.totalRows);

  if (meta.tier === 1 && meta.maxTier > 1) {
    if (position <= CONTINENTAL.ucl) return 'champion';
    if (position <= CONTINENTAL.ucl + CONTINENTAL.uel) return 'europa';
    if (slots.relegationSlots > 0 && position > meta.totalRows - slots.relegationSlots) {
      return 'relegated';
    }
    return 'normal';
  }

  const index = position - 1;
  const zone = meta.movementZone ?? movementZoneForIndex(index, meta.totalRows, slots);
  if (zone === 'promotion') return 'champion';
  if (zone === 'relegation') return 'relegated';
  return 'normal';
}

export function standingsLegend(meta: LeagueZoneMeta): LegendItem[] {
  if (isSwissLeaguePhase(meta)) {
    return [
      { key: 'champion', color: 'var(--green-primary)' },
      { key: 'europa', color: 'var(--gold-accent)' },
    ];
  }
  const slots = competitionMovementSlots(meta.tier, meta.maxTier, meta.totalRows);
  const items: LegendItem[] = [];
  if (meta.tier === 1 && meta.maxTier > 1) {
    items.push(
      { key: 'champion', color: 'var(--green-primary)' },
      { key: 'europa', color: 'var(--violet-accent)' },
    );
  } else if (slots.promotionSlots > 0) {
    items.push({ key: 'champion', color: 'var(--green-primary)' });
  }
  if (slots.relegationSlots > 0) {
    items.push({ key: 'relegated', color: 'var(--red-danger)' });
  }
  return items;
}

export const DISPLAY_ZONE_COLOR: Record<DisplayZone, string> = {
  champion: 'var(--green-primary)',
  europa: 'var(--violet-accent)',
  relegated: 'var(--red-danger)',
  normal: 'transparent',
};
