// ─── Fechas IN-GAME del calendario (LOTE C · E17) ──────────────────────────────
// El backend no guarda fecha por jornada: el reloj del juego (gameState.inGameDate)
// avanza por ticks que caen en Mié/Vie/Dom y `week` es el contador de jornada.
// Derivamos una fecha in-game DETERMINISTA por partido:
//   · Semana de calendario (lunes-domingo, en UTC) que contiene inGameDate
//     ⇒ es la semana de la jornada `currentWeek`.
//   · La jornada w vive en esa semana desplazada (w − currentWeek) × 7 días.
//   · Dentro de la semana: liga/amistoso → DOMINGO, copa/europa → MIÉRCOLES
//     (mismo reparto que usa el motor en advanceWeek()).
// TODO en UTC y a partir de la parte de fecha del ISO (YYYY-MM-DD) para que el
// timezone local del navegador no desplace los días.

export type CompetitionKind = 'league' | 'cup' | 'european' | 'friendly';

const DAY_MS = 86_400_000;

/** Clasifica la competición por nombre (el payload de /matches solo trae name/shortName). */
export function competitionKind(name?: string, shortName?: string): CompetitionKind {
  const s = `${name ?? ''} ${shortName ?? ''}`.toLowerCase();
  if (/amist|friendly/.test(s)) return 'friendly';
  if (/champions|europa|uefa|ucl|uel|uecl|supercopa de europa|continental/.test(s)) return 'european';
  if (/copa|cup|cdr|pokal|fa cup|coppa/.test(s)) return 'cup';
  return 'league';
}

/** Colores por competición vía tokens (liga=verde, copa=dorado, Europa=violeta, amistoso=azul). */
export const KIND_COLOR: Record<CompetitionKind, string> = {
  league: 'var(--green-primary)',
  cup: 'var(--gold-accent)',
  european: 'var(--violet-accent)',
  friendly: 'var(--blue-info)',
};

export const KIND_LABEL: Record<CompetitionKind, string> = {
  league: 'Liga',
  cup: 'Copa',
  european: 'Europa',
  friendly: 'Amistoso',
};

/** Hora "de transmisión" por tipo (puro sabor de UI, no existe hora real en BD). */
export const KIND_HOUR: Record<CompetitionKind, string> = {
  league: '17:00',
  cup: '21:00',
  european: '21:00',
  friendly: '12:00',
};

/** Parte de fecha (YYYY-MM-DD) de un ISO, sin pasar por el timezone local. */
export function isoDatePart(iso: string): string {
  return iso.slice(0, 10);
}

/** ms UTC de medianoche de una clave YYYY-MM-DD. */
export function keyToUTC(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Clave YYYY-MM-DD a partir de ms UTC. */
export function utcToKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lunes (UTC) de la semana que contiene la clave dada. */
export function mondayOfWeek(key: string): number {
  const ms = keyToUTC(key);
  const dow = new Date(ms).getUTCDay(); // 0=Dom … 6=Sáb
  const sinceMonday = (dow + 6) % 7;    // 0 si lunes, 6 si domingo
  return ms - sinceMonday * DAY_MS;
}

/**
 * Fecha in-game (clave YYYY-MM-DD) de la jornada `week` para una competición.
 * `anchorIso` = gameState.inGameDate (ISO), `anchorWeek` = gameState.week.
 */
export function matchdayDateKey(
  week: number,
  anchorIso: string,
  anchorWeek: number,
  kind: CompetitionKind,
): string {
  const weekMonday = mondayOfWeek(isoDatePart(anchorIso)) + (week - anchorWeek) * 7 * DAY_MS;
  // Liga/amistoso → domingo (+6 desde lunes); copa/europa → miércoles (+2).
  const offsetDays = kind === 'cup' || kind === 'european' ? 2 : 6;
  return utcToKey(weekMonday + offsetDays * DAY_MS);
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function monthLabel(year: number, monthIdx0: number): string {
  return `${MONTHS_ES[monthIdx0]} ${year}`;
}

export type MonthCell = { key: string; day: number; inMonth: boolean };

/**
 * Celdas del grid mensual (semanas completas lunes→domingo), incluyendo los
 * días "fantasma" de los meses contiguos para cuadrar 7 columnas.
 */
export function buildMonthCells(year: number, monthIdx0: number): MonthCell[] {
  const first = Date.UTC(year, monthIdx0, 1);
  const start = mondayOfWeek(utcToKey(first));
  const lastDay = new Date(Date.UTC(year, monthIdx0 + 1, 0)).getUTCDate();
  const end = mondayOfWeek(utcToKey(Date.UTC(year, monthIdx0, lastDay))) + 6 * DAY_MS;

  const cells: MonthCell[] = [];
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const d = new Date(ms);
    cells.push({
      key: utcToKey(ms),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === monthIdx0 && d.getUTCFullYear() === year,
    });
  }
  return cells;
}
