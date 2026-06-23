// ─── QW-6/14/15 · «Jugadores con alma» ───────────────────────────────────────
// Campos ADITIVOS derivados (cero schema): `tags`, `bioSummary` y `legendStatus`
// para los payloads existentes de squad y ficha. Reglas documentadas en
// server/API_UI.md §BloqueQ (11 jun 2026).
import prisma from '../../db/prisma';

type SoulPlayer = {
  id: number;
  name: string;
  position: string;
  age: number;
  potential: number;
  morale: number;
  experience: number;
  consistency: number;
  injuryProneness: number;
  homegrown: boolean;
  isStarter: boolean;
  isForSale: boolean;
  passing: number;
  shooting: number;
  organization: number;
  unmarking: number;
  finishing: number;
  dribbling: number;
  tackling: number;
  goalkeeping: number;
  createdAt: Date;
  lastTransferAt: Date | null;
};

export type LegendLevel = 'util' | 'titular' | 'idolo' | 'leyenda';
export type PlayerSoul = {
  tags: string[];
  bioSummary: string;
  legendStatus: { level: LegendLevel; label: string; progress: number };
};

type CareerStats = {
  matches: number;
  goals: number;
  seasons: number;
  seasonMatches: number; // temporada activa
  seasonGoals: number;
  titles: number;
};

const LEGEND_LABEL: Record<LegendLevel, string> = {
  util: 'Útil',
  titular: 'Titular importante',
  idolo: 'Ídolo',
  leyenda: 'Leyenda',
};

// ─── QW-6 · etiquetas por reglas ─────────────────────────────────────────────
export function computeTags(p: SoulPlayer): string[] {
  const tags: string[] = [];
  if (p.age <= 21 && p.potential >= 78) tags.push('Promesa');
  // I-21 · «revelación tardía»: jugador mayor que aún no acumuló experiencia
  // pero con techo alto y llegado de fuera (eclosión tardía, no de cantera).
  if (p.age >= 27 && !p.homegrown && p.potential >= 80 && p.experience <= 55) tags.push('Revelación tardía');
  if (p.age >= 32) tags.push('Veterano');
  if (p.position === 'DEL' && p.finishing >= 80) tags.push('Matador');
  if (p.organization >= 80 && p.passing >= 75) tags.push('Cerebro');
  if ((p.position === 'POR' && p.goalkeeping >= 80) || (p.position === 'DEF' && p.tackling >= 80)) tags.push('Muralla');
  if (p.morale >= 85 && p.experience >= 60 && p.age >= 27) tags.push('Líder');
  if (p.homegrown) tags.push('Canterano');
  if (p.dribbling >= 80 && p.unmarking >= 75) tags.push('Eléctrico');
  if (p.consistency >= 75 && p.injuryProneness <= 35) tags.push('Incombustible');
  if (p.injuryProneness >= 75) tags.push('De cristal');
  return tags;
}

// ─── QW-15 · leyenda en construcción ─────────────────────────────────────────
export function computeLegendStatus(p: SoulPlayer, stats: CareerStats): PlayerSoul['legendStatus'] {
  const points =
    Math.min(40, stats.matches * 0.08) +
    Math.min(20, stats.goals * 0.3) +
    Math.min(16, stats.seasons * 4) +
    Math.min(18, stats.titles * 6) +
    (p.homegrown ? 10 : 0);
  const progress = Math.max(0, Math.min(100, Math.round(points)));
  const level: LegendLevel = progress >= 85 ? 'leyenda' : progress >= 55 ? 'idolo' : progress >= 25 ? 'titular' : 'util';
  return { level, label: LEGEND_LABEL[level], progress };
}

// ─── QW-14 · mini-historia por plantillas ────────────────────────────────────
export function computeBioSummary(p: SoulPlayer, stats: CareerStats): string {
  const parts: string[] = [];

  const arrival = p.lastTransferAt ?? p.createdAt;
  const arrivalYear = arrival.getFullYear();
  if (p.homegrown) {
    parts.push(`Creció en la cantera del club.`);
  } else if (p.lastTransferAt) {
    parts.push(`Llegó al club en ${arrivalYear}.`);
  } else {
    parts.push(`En el club desde ${arrivalYear}.`);
  }

  if (stats.matches > 0) {
    const goalsBit = p.position !== 'POR' && stats.goals > 0 ? ` y ha marcado ${stats.goals} gol${stats.goals === 1 ? '' : 'es'}` : '';
    parts.push(`Acumula ${stats.matches} partido${stats.matches === 1 ? '' : 's'}${goalsBit}.`);
  } else {
    parts.push('Todavía espera su oportunidad.');
  }

  if (p.isStarter) {
    parts.push('Hoy es pieza clave del once.');
  } else if (stats.seasonMatches >= 5) {
    parts.push('Esta temporada entra en la rotación habitual.');
  } else if (p.age <= 21 && p.potential >= 78) {
    parts.push('El vestuario lo señala como el futuro del equipo.');
  } else if (p.age >= 32) {
    parts.push('Ha perdido protagonismo, pero la afición lo respeta.');
  } else if (p.isForSale) {
    parts.push('Su futuro apunta lejos de aquí: está en el mercado.');
  } else {
    parts.push('Busca ganarse un sitio en el once.');
  }

  return parts.join(' ');
}

// ─── Batch: alma para una lista de jugadores en 3 queries ────────────────────
export async function soulForPlayers(players: SoulPlayer[]): Promise<Map<number, PlayerSoul>> {
  const result = new Map<number, PlayerSoul>();
  if (players.length === 0) return result;
  const ids = players.map((p) => p.id);

  const state = await prisma.gameState.findFirst({
    where: { isActive: true },
    select: { seasonId: true },
  });

  const [career, current, honours] = await Promise.all([
    prisma.playerSeasonStat.groupBy({
      by: ['playerId'],
      where: { playerId: { in: ids } },
      _sum: { matchesPlayed: true, goals: true },
      _count: { seasonId: true },
    }),
    state
      ? prisma.playerSeasonStat.findMany({
          where: { playerId: { in: ids }, seasonId: state.seasonId },
          select: { playerId: true, matchesPlayed: true, goals: true },
        })
      : Promise.resolve([] as Array<{ playerId: number; matchesPlayed: number; goals: number }>),
    prisma.honour.groupBy({
      by: ['playerId'],
      where: { playerId: { in: ids } },
      _count: { id: true },
    }),
  ]);

  const careerById = new Map(career.map((row) => [row.playerId, row]));
  const currentById = new Map(current.map((row) => [row.playerId, row]));
  const titlesById = new Map(honours.map((row) => [row.playerId as number, row._count.id]));

  for (const p of players) {
    const c = careerById.get(p.id);
    const s = currentById.get(p.id);
    const stats: CareerStats = {
      matches: c?._sum.matchesPlayed ?? 0,
      goals: c?._sum.goals ?? 0,
      seasons: c?._count.seasonId ?? 0,
      seasonMatches: s?.matchesPlayed ?? 0,
      seasonGoals: s?.goals ?? 0,
      titles: titlesById.get(p.id) ?? 0,
    };
    result.set(p.id, {
      tags: computeTags(p),
      bioSummary: computeBioSummary(p, stats),
      legendStatus: computeLegendStatus(p, stats),
    });
  }
  return result;
}
