import { FORMATIONS } from '../tactics/formations.catalog';

type ClubLike = {
  id: number;
  name: string;
  shortName?: string | null;
  city?: string | null;
  country?: string | null;
  reputation?: number | null;
  budget?: number | null;
};

const FIRST_NAMES: Record<string, string[]> = {
  espana: ['Miguel', 'Rafa', 'Iker', 'Luis', 'Javi', 'Ander'],
  inglaterra: ['Graham', 'Steve', 'Eddie', 'Frank', 'Gareth', 'Sean'],
  francia: ['Laurent', 'Didier', 'Bruno', 'Julien', 'Patrick', 'Remy'],
  italia: ['Marco', 'Antonio', 'Roberto', 'Luciano', 'Claudio', 'Fabio'],
  alemania: ['Dieter', 'Julian', 'Ralf', 'Thomas', 'Hannes', 'Matthias'],
  default: ['Bruno', 'Victor', 'Adrian', 'Leo', 'Nico', 'Hector'],
};

const LAST_NAMES: Record<string, string[]> = {
  espana: ['Alonso', 'Torres', 'Valverde', 'Soler', 'Molina', 'Herrera'],
  inglaterra: ['Barker', 'Cole', 'Hughes', 'Potter', 'Walker', 'Morris'],
  francia: ['Martin', 'Garnier', 'Moreau', 'Leroy', 'Bernard', 'Fontaine'],
  italia: ['Ricci', 'Conti', 'Ferrari', 'Mancini', 'Rinaldi', 'Greco'],
  alemania: ['Keller', 'Vogel', 'Weber', 'Schmidt', 'Brandt', 'Kraus'],
  default: ['Costa', 'Silva', 'Novak', 'Marin', 'Kovac', 'Rossi'],
};

function key(value?: string | null): string {
  return String(value ?? 'default')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(pool: T[], seed: number): T {
  return pool[seed % pool.length];
}

function styleDefaults(style: string, reputation: number) {
  if (style === 'posesion') {
    return { objective: 'equilibrado', construction: 64, destruction: 46, pressing: 58, tempo: 48, width: 56, mentality: 56, marking: 'zonal' };
  }
  if (style === 'contraataque') {
    return { objective: 'defensivo', construction: 44, destruction: 62, pressing: 46, tempo: 60, width: 54, mentality: 42, marking: 'zonal' };
  }
  if (style === 'defensiva') {
    return { objective: 'defensivo', construction: 38, destruction: 68, pressing: 50, tempo: 42, width: 46, mentality: 32, marking: 'individual' };
  }
  if (style === 'ofensiva') {
    return { objective: 'ofensivo', construction: 62, destruction: 42, pressing: 64, tempo: 66, width: 62, mentality: 72, marking: 'zonal' };
  }
  return reputation >= 72
    ? { objective: 'ofensivo', construction: 58, destruction: 50, pressing: 58, tempo: 58, width: 54, mentality: 62, marking: 'zonal' }
    : { objective: 'equilibrado', construction: 50, destruction: 54, pressing: 52, tempo: 50, width: 50, mentality: 50, marking: 'zonal' };
}

export function buildNpcCoachProfile(club: ClubLike) {
  const seed = hash(`${club.id}:${club.name}:${club.country ?? ''}`);
  const country = key(club.country);
  const firstPool = FIRST_NAMES[country] ?? FIRST_NAMES.default;
  const lastPool = LAST_NAMES[country] ?? LAST_NAMES.default;
  const reputation = Math.max(1, Math.min(100, Math.round(club.reputation ?? 50)));
  const formation = FORMATIONS[seed % FORMATIONS.length];
  const defaults = styleDefaults(formation.style, reputation);
  const previousClubs = seed % 5;
  const tenureMonths = 6 + (seed % 55);
  const sackRisk = reputation < 45 ? 'alto' : reputation < 65 ? 'medio' : 'bajo';

  return {
    id: `npc-${club.id}`,
    isNpc: true,
    name: `${pick(firstPool, seed)} ${pick(lastPool, seed >>> 8)}`,
    nationality: club.country ?? 'Internacional',
    avatarSeed: `npc:${club.id}:${seed}`,
    clubId: club.id,
    clubName: club.name,
    status: 'npc_active',
    tacticalStyle: {
      favoriteFormation: formation.key,
      formationName: formation.name,
      formationStyle: formation.style,
      physicalDemand: formation.physicalDemand,
      strengths: formation.strengths.slice(0, 2),
      weaknesses: formation.weaknesses.slice(0, 2),
      objective: defaults.objective,
      tacticDefaults: {
        construction: defaults.construction,
        destruction: defaults.destruction,
        pressing: defaults.pressing,
        tempo: defaults.tempo,
        width: defaults.width,
        mentality: defaults.mentality,
        marking: defaults.marking,
      },
    },
    career: {
      stage: reputation >= 78 ? 'consagrado' : reputation >= 58 ? 'competitivo' : 'emergente',
      currentTenureMonths: tenureMonths,
      previousClubs,
      promotions: Math.floor(previousClubs / 2),
      sackRisk,
      canBeHiredAway: reputation >= 55,
      canBeSacked: true,
      nextCareerCheck: 'season_rollover',
    },
    pressLine: `${club.shortName ?? club.name} tiene una idea clara: ${formation.description}`,
  };
}
