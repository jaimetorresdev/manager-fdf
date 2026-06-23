// Contrato publico (Y8/Y5):
// - adaptPlayerProfile(raw) -> view-model de ficha premium de jugador.
// - adaptClubProfile(raw) -> view-model de ficha premium de club.
// - adaptManagerProfile(raw) -> view-model de ficha premium de manager.
// - adaptWorldMap(raw) -> view-model del mapa/arbol mundial.
//
// Modulo puro defensivo: acepta payloads nuevos de /api/public/* y legacy de
// /players/public, /club/public, /manager/public. Nunca lanza por huecos.

import { asArray } from './normalize';

export interface EntityLinkVm {
  id: string | null;
  label: string;
  route: string | null;
  badge?: string | null;
}

export interface PlayerProfileVm {
  id: string;
  name: string;
  headline: string;
  position: string;
  nationality: string;
  status: string;
  club: EntityLinkVm | null;
  form: { fitness: number; morale: number; rhythm: number; lastRatings: number[]; averageLastFive: number };
  radar: { technical: number; tactical: number; physical: number; mentality: number };
  tags: string[];
  value: { marketValue: number; wage: number; clause: number };
  availability: { injured: boolean; suspended: boolean; label: string };
}

export interface ClubProfileVm {
  id: string;
  name: string;
  shortName: string;
  badge: string | null;
  country: string;
  colors: { primary: string | null; secondary: string | null };
  league: EntityLinkVm | null;
  manager: EntityLinkVm | null;
  stadium: { name: string; capacity: number; city: string };
  story: { culture: string; rivalryCount: number; trophies: number };
  publicFinances: { band: string; wageRatio: number | null; valuation: number | null };
}

export interface ManagerProfileVm {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: string;
  nationality: string;
  style: string;
  level: number;
  prestige: number;
  club: EntityLinkVm | null;
  stage: string;
  form: { result: string; label: string }[];
  achievements: string[];
}

export interface WorldCountryVm {
  country: string;
  continent: string;
  coords: { lat: number; lng: number; zoom: number };
  status: 'OPEN' | 'WAITLIST' | 'CLOSED';
  tone: string;
  label: string;
  summary: string;
  metrics: { leagues: number; clubs: number; humanManagers: number; freeClubs: number; activityScore: number };
  featuredLeague: EntityLinkVm | null;
}

export interface WorldMapVm {
  seasonLabel: string;
  totals: { countries: number; leagues: number; clubs: number; humanManagers: number; freeClubs: number };
  countries: WorldCountryVm[];
  featuredLeagues: EntityLinkVm[];
  hotMatches: unknown[];
  availableClubs: EntityLinkVm[];
  ticker: unknown[];
}

type Obj = Record<string, unknown>;

function obj(value: unknown): Obj {
  return value && typeof value === 'object' ? value as Obj : {};
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function id(value: unknown): string {
  return value == null ? '' : String(value);
}

function avg(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function link(value: unknown, kind: 'club' | 'player' | 'manager' | 'competition'): EntityLinkVm | null {
  const source = obj(value);
  const entityId = source.id ?? source.managerId ?? source.clubId;
  if (entityId == null) return null;
  const label = str(source.shortName, str(source.name, str(source.username, kind)));
  const base = kind === 'competition' ? 'competition' : kind;
  return {
    id: String(entityId),
    label,
    route: `/${base}/${entityId}`,
    badge: typeof source.badge === 'string' ? source.badge : null,
  };
}

export function adaptPlayerProfile(raw: unknown): PlayerProfileVm {
  const source = obj(raw);
  const visual = obj(source.visualProfile);
  const form = obj(source.form);
  const radar = obj(source.radar);
  const lastRatings = asArray<unknown>(form.lastRatings)
    .map((value) => num(value, Number.NaN))
    .filter(Number.isFinite);
  const injuries = asArray(source.injuries);
  const suspendedMatches = num(source.suspendedMatches);
  const status = str(visual.status, injuries.length ? 'Lesionado' : suspendedMatches > 0 ? 'Sancionado' : 'Disponible');
  return {
    id: id(source.id ?? source.playerId),
    name: str(source.name, 'Jugador'),
    headline: str(visual.headline, `${str(source.name, 'Jugador')} - ${str(source.detailedPosition ?? source.position, 'MED')}`),
    position: str(source.detailedPosition ?? source.position, 'MED'),
    nationality: str(visual.nationality, str(source.nationality, '')),
    status,
    club: link(visual.club ?? source.club, 'club'),
    form: {
      fitness: num(form.fitness, num(source.fitness, 0)),
      morale: num(form.morale, num(source.morale, 0)),
      rhythm: num(form.rhythm, num(source.matchRhythm, 0)),
      lastRatings,
      averageLastFive: num(form.averageLastFive, avg(lastRatings)),
    },
    radar: {
      technical: num(radar.technical, avg([num(source.passing), num(source.dribbling), num(source.finishing)])),
      tactical: num(radar.tactical, avg([num(source.organization), num(source.tackling)])),
      physical: num(radar.physical, avg([num(source.fitness), num(source.muscularFitness), num(source.matchRhythm)])),
      mentality: num(radar.mentality, avg([num(source.morale), num(source.experience)])),
    },
    tags: asArray<string>(source.tags),
    value: {
      marketValue: num(source.marketValue),
      wage: num(source.wage),
      clause: num(source.releaseClause ?? source.clause),
    },
    availability: {
      injured: injuries.length > 0 || Boolean(source.isInjured),
      suspended: suspendedMatches > 0 || Boolean(source.isSuspended),
      label: status,
    },
  };
}

export function adaptClubProfile(raw: unknown): ClubProfileVm {
  const source = obj(raw);
  const identity = obj(source.identity);
  const stadium = obj(source.stadium);
  const finances = obj(source.publicFinances);
  const history = obj(source.history);
  const rivalries = asArray(source.rivalries);
  const honours = asArray(source.honours ?? history.honours);
  return {
    id: id(source.id ?? source.clubId),
    name: str(source.name, str(identity.name, 'Club')),
    shortName: str(source.shortName, str(identity.shortName, str(source.name, 'Club'))),
    badge: typeof source.badge === 'string' ? source.badge : typeof identity.badge === 'string' ? identity.badge : null,
    country: str(source.country, str(identity.country, '')),
    colors: {
      primary: typeof source.primaryColor === 'string' ? source.primaryColor : null,
      secondary: typeof source.secondaryColor === 'string' ? source.secondaryColor : null,
    },
    league: link(source.league ?? source.competition, 'competition'),
    manager: link(source.manager, 'manager'),
    stadium: {
      name: str(stadium.name, str(source.stadiumName, 'Estadio')),
      capacity: num(stadium.capacity, num(source.stadiumCapacity)),
      city: str(stadium.city, str(source.city, '')),
    },
    story: {
      culture: str(source.culture, str(history.summary, '')),
      rivalryCount: rivalries.length,
      trophies: honours.length,
    },
    publicFinances: {
      band: str(finances.band, str(finances.label, 'Sin datos publicos')),
      wageRatio: finances.wageRatio == null ? null : num(finances.wageRatio),
      valuation: finances.valuation == null ? null : num(finances.valuation),
    },
  };
}

export function adaptManagerProfile(raw: unknown): ManagerProfileVm {
  const source = obj(raw);
  const visual = obj(source.visualProfile);
  const career = obj(source.careerSummary);
  const formRows = asArray<Obj>(source.form);
  return {
    id: id(source.managerId ?? source.id),
    name: str(source.name, str(source.username, 'Manager')),
    avatarUrl: typeof source.avatarUrl === 'string' ? source.avatarUrl : null,
    headline: str(visual.headline, str(source.name, 'Manager')),
    nationality: str(visual.nationality, str(source.nationality, '')),
    style: str(visual.style, str(source.style, 'Equilibrado')),
    level: num(visual.level, num(career.level)),
    prestige: num(career.prestige, num(source.prestige)),
    club: link(visual.club ?? source.club, 'club'),
    stage: str(career.stage, 'promesa'),
    form: formRows.map((row) => ({
      result: str(row.result, ''),
      label: str(row.label, str(row.score, '')),
    })),
    achievements: asArray<unknown>(source.achievements ?? source.honours).map((item) => str(obj(item).name ?? item, '')).filter(Boolean),
  };
}

export function adaptWorldMap(raw: unknown): WorldMapVm {
  const source = obj(raw);
  const season = obj(source.season);
  const totals = obj(source.totals);
  const countries = asArray<Obj>(source.countries).map((country) => {
    const coords = obj(country.coords);
    const pulse = obj(country.pulse);
    return {
      country: str(country.country, 'Pais'),
      continent: str(country.continent, 'Mundo'),
      coords: {
        lat: num(coords.lat),
        lng: num(coords.lng),
        zoom: num(coords.zoom, 4),
      },
      status: country.status === 'WAITLIST' || country.status === 'CLOSED' ? country.status : 'OPEN',
      tone: str(pulse.tone, 'open'),
      label: str(pulse.label, 'Mundo abierto'),
      summary: str(pulse.summary, ''),
      metrics: {
        leagues: num(country.leagues),
        clubs: num(country.clubs),
        humanManagers: num(country.humanManagers),
        freeClubs: num(country.freeClubs),
        activityScore: num(country.activityScore),
      },
      featuredLeague: link(country.featuredLeague, 'competition'),
    } satisfies WorldCountryVm;
  });
  return {
    seasonLabel: str(season.name, 'Temporada activa'),
    totals: {
      countries: num(totals.countries, countries.length),
      leagues: num(totals.leagues),
      clubs: num(totals.clubs),
      humanManagers: num(totals.humanManagers),
      freeClubs: num(totals.freeClubs),
    },
    countries,
    featuredLeagues: asArray(source.featuredLeagues).map((item) => link(item, 'competition')).filter((item): item is EntityLinkVm => item != null),
    hotMatches: asArray(source.hotMatches),
    availableClubs: asArray(source.availableClubs).map((item) => link(item, 'club')).filter((item): item is EntityLinkVm => item != null),
    ticker: asArray(source.ticker),
  };
}
