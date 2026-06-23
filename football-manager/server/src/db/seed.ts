// ─── Seed — Football Manager Online ──────────────────────────────────────────
// Creates: 1 season, 5 competitions, 96 clubs, full 22-player squads, matchdays.
// Run en dev (con ts-node):       npm run db:seed:dev
// Run en runtime (JS compilado):  node dist/db/seed.js

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import { getColorsFromBadge } from './colorHelper';
// WT1: posiciones detalladas (15) + reparto de puntos por pesos (doc diseño §1.1).
import { deriveDetailedPosition, generateSkillsFor, type DetailedPosition } from '../modules/players/detailedPositions';
// AUDIT H-50: misma validación de contraseñas privilegiadas que `db/ensure-roles.ts`
// (fuente única en `lib/privilegedPassword.ts`). El seed principal también rechaza
// contraseñas débiles para master/admin/agente_fifa.
import { resolveStaffPassword } from '../lib/privilegedPassword';

const prisma = new PrismaClient();

type SeedRole = 'master' | 'admin' | 'agente_fifa' | 'manager';

async function seedUserFromEnv(input: {
  label: string;
  envKey: string;
  where: { email?: string; username?: string };
  create: { username: string; email: string; role: SeedRole };
}) {
  const existing = input.where.email
    ? await prisma.user.findUnique({ where: { email: input.where.email } })
    : await prisma.user.findUnique({ where: { username: input.where.username! } });
  if (existing) {
    console.log(`  ✅ ${input.label} ya existe; rol y contraseña preservados`);
    return existing;
  }

  // AUDIT H-50: rechazo de contraseñas débiles para cuentas privilegiadas también en
  // el seed principal (master/admin/agente_fifa). En prod aborta; en dev omite.
  const password = resolveStaffPassword({
    label: input.label,
    envKey: input.envKey,
    role: input.create.role,
  });
  if (!password) return null;

  const created = await prisma.user.create({
    data: {
      ...input.create,
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`  ✅ ${input.label} creado desde ${input.envKey}`);
  return created;
}

function getRandomWeather() {
  const rand = Math.random();
  const weatherCondition = rand < 0.6 ? 'normal' : rand < 0.8 ? 'rain' : rand < 0.85 ? 'snow' : 'hot';
  let temperature = 20;
  if (weatherCondition === 'snow') temperature = Math.floor(Math.random() * 10) - 5;
  else if (weatherCondition === 'hot') temperature = Math.floor(Math.random() * 10) + 30;
  else if (weatherCondition === 'rain') temperature = Math.floor(Math.random() * 15) + 5;
  else temperature = Math.floor(Math.random() * 15) + 15;
  return { weatherCondition, temperature };
}

function generateKnockoutBracket(teamIds: number[]): { home: number; away: number }[] {
  const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
  const matchups: { home: number; away: number }[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      matchups.push({ home: shuffled[i], away: shuffled[i + 1] });
    }
  }
  return matchups;
}

function generateSwissFixtures(teamIds: number[], matchesPerTeam: number): { matchday: number; home: number; away: number }[] {
  // Berger round-robin truncado: ninguna pareja se repite entre rondas (P1 #99).
  const fixtures: { matchday: number; home: number; away: number }[] = [];
  const arr = [...teamIds];
  if (arr.length % 2 === 1) arr.push(-1);
  const n = arr.length;
  if (n < 2) return fixtures;
  const rounds = Math.min(matchesPerTeam, n - 1);
  for (let round = 1; round <= rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === -1 || b === -1) continue;
      if (round % 2 === 1) fixtures.push({ matchday: round, home: a, away: b });
      else fixtures.push({ matchday: round, home: b, away: a });
    }
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }
  return fixtures;
}

const INITIAL_IN_GAME_DATE = new Date('2024-07-01T00:00:00.000Z');

type SeedTeam = {
  name: string;
  shortName: string;
  city: string;
  sofascoreId?: number | null;
  badge: string;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  budget: number;
  reputation: number;
  fans: number;
  isUserClub?: boolean;
};

type SeedLeague = {
  name: string;
  shortName: string;
  country: string;
  countryCode?: string;
  tier: number;
  leagueStrength: number;
  status?: 'OPEN' | 'WAITLIST' | 'CLOSED' | string;
  teams: SeedTeam[];
};

// Y-seed (14 jun 2026): generado desde docs/data/leagues-2026.json.
// Mantener UCL/UEL/UECL intactas: solo sustituye las ligas nacionales base.
// Los equipos con sofascoreId verificado usan https://cdn.sofascore.com/api/v1/team/{id}/image;
  // los null quedan con fallback visual hasta que Cowork complete IDs.
  // NECESITO datos (Claude Cowork): completar sofascoreId/badge para los 227 equipos con ID null.
const leagues: SeedLeague[] = [
  {
    "name": "Primera División",
    "shortName": "LaLiga",
    "country": "España",
    "countryCode": "ES",
    "tier": 1,
    "leagueStrength": 97,
    "teams": [
      {
        "name": "Real Madrid",
        "shortName": "RMA",
        "city": "Madrid",
        "sofascoreId": 2829,
        "badge": "https://cdn.sofascore.com/api/v1/team/2829/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#00529F",
        "isUserClub": false,
        "budget": 129500000,
        "reputation": 94,
        "fans": 89000
      },
      {
        "name": "FC Barcelona",
        "shortName": "BAR",
        "city": "Barcelona",
        "sofascoreId": 2817,
        "badge": "https://cdn.sofascore.com/api/v1/team/2817/image",
        "primaryColor": "#004D98",
        "secondaryColor": "#A50044",
        "isUserClub": true,
        "budget": 122000000,
        "reputation": 93,
        "fans": 85500
      },
      {
        "name": "Atlético de Madrid",
        "shortName": "ATM",
        "city": "Madrid",
        "sofascoreId": 2836,
        "badge": "https://cdn.sofascore.com/api/v1/team/2836/image",
        "primaryColor": "#CB3524",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 114750000,
        "reputation": 92,
        "fans": 81500
      },
      {
        "name": "Sevilla FC",
        "shortName": "SEV",
        "city": "Sevilla",
        "sofascoreId": 2833,
        "badge": "https://cdn.sofascore.com/api/v1/team/2833/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#CB0000",
        "isUserClub": false,
        "budget": 107750000,
        "reputation": 91,
        "fans": 78000
      },
      {
        "name": "Real Sociedad",
        "shortName": "RSO",
        "city": "San Sebastián",
        "sofascoreId": 2824,
        "badge": "https://cdn.sofascore.com/api/v1/team/2824/image",
        "primaryColor": "#0067B1",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 100750000,
        "reputation": 90,
        "fans": 74500
      },
      {
        "name": "Athletic Club",
        "shortName": "ATH",
        "city": "Bilbao",
        "sofascoreId": 2825,
        "badge": "https://cdn.sofascore.com/api/v1/team/2825/image",
        "primaryColor": "#EE2523",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 93750000,
        "reputation": 89,
        "fans": 71000
      },
      {
        "name": "Real Betis",
        "shortName": "BET",
        "city": "Sevilla",
        "sofascoreId": 2838,
        "badge": "https://cdn.sofascore.com/api/v1/team/2838/image",
        "primaryColor": "#00954C",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 87250000,
        "reputation": 88,
        "fans": 67500
      },
      {
        "name": "Villarreal CF",
        "shortName": "VIL",
        "city": "Villarreal",
        "sofascoreId": 2828,
        "badge": "https://cdn.sofascore.com/api/v1/team/2828/image",
        "primaryColor": "#FFD200",
        "secondaryColor": "#004B87",
        "isUserClub": false,
        "budget": 80750000,
        "reputation": 87,
        "fans": 64000
      },
      {
        "name": "Valencia CF",
        "shortName": "VAL",
        "city": "Valencia",
        "sofascoreId": 2821,
        "badge": "https://cdn.sofascore.com/api/v1/team/2821/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#EE3524",
        "isUserClub": false,
        "budget": 74250000,
        "reputation": 86,
        "fans": 60500
      },
      {
        "name": "CA Osasuna",
        "shortName": "OSA",
        "city": "Pamplona",
        "sofascoreId": 2826,
        "badge": "https://cdn.sofascore.com/api/v1/team/2826/image",
        "primaryColor": "#D91A21",
        "secondaryColor": "#0A346F",
        "isUserClub": false,
        "budget": 68250000,
        "reputation": 85,
        "fans": 57000
      },
      {
        "name": "Girona FC",
        "shortName": "GIR",
        "city": "Girona",
        "sofascoreId": 11066,
        "badge": "https://cdn.sofascore.com/api/v1/team/11066/image",
        "primaryColor": "#CD2534",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 62250000,
        "reputation": 84,
        "fans": 54000
      },
      {
        "name": "Getafe CF",
        "shortName": "GET",
        "city": "Getafe",
        "sofascoreId": 2859,
        "badge": "https://cdn.sofascore.com/api/v1/team/2859/image",
        "primaryColor": "#005999",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 56750000,
        "reputation": 82,
        "fans": 51000
      },
      {
        "name": "Celta de Vigo",
        "shortName": "CEL",
        "city": "Vigo",
        "sofascoreId": 2842,
        "badge": "https://cdn.sofascore.com/api/v1/team/2842/image",
        "primaryColor": "#6FB0E8",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 51250000,
        "reputation": 81,
        "fans": 48000
      },
      {
        "name": "Rayo Vallecano",
        "shortName": "RAY",
        "city": "Madrid",
        "sofascoreId": 2853,
        "badge": "https://cdn.sofascore.com/api/v1/team/2853/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#E53027",
        "isUserClub": false,
        "budget": 46000000,
        "reputation": 80,
        "fans": 45000
      },
      {
        "name": "RCD Espanyol",
        "shortName": "ESP",
        "city": "Barcelona",
        "sofascoreId": 2820,
        "badge": "https://cdn.sofascore.com/api/v1/team/2820/image",
        "primaryColor": "#007FC8",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41250000,
        "reputation": 79,
        "fans": 42000
      },
      {
        "name": "RCD Mallorca",
        "shortName": "MAL",
        "city": "Palma",
        "sofascoreId": 2843,
        "badge": "https://cdn.sofascore.com/api/v1/team/2843/image",
        "primaryColor": "#E20613",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 36750000,
        "reputation": 78,
        "fans": 39500
      },
      {
        "name": "Deportivo Alavés",
        "shortName": "ALA",
        "city": "Vitoria-Gasteiz",
        "sofascoreId": 2862,
        "badge": "https://cdn.sofascore.com/api/v1/team/2862/image",
        "primaryColor": "#0761AF",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 32500000,
        "reputation": 77,
        "fans": 37000
      },
      {
        "name": "UD Las Palmas",
        "shortName": "LPA",
        "city": "Las Palmas",
        "sofascoreId": 2858,
        "badge": "https://cdn.sofascore.com/api/v1/team/2858/image",
        "primaryColor": "#FEE000",
        "secondaryColor": "#004F9F",
        "isUserClub": false,
        "budget": 28750000,
        "reputation": 75,
        "fans": 34500
      },
      {
        "name": "CD Leganés",
        "shortName": "LEG",
        "city": "Leganés",
        "sofascoreId": 2932,
        "badge": "https://cdn.sofascore.com/api/v1/team/2932/image",
        "primaryColor": "#005BAC",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 25750000,
        "reputation": 74,
        "fans": 32500
      },
      {
        "name": "Real Valladolid",
        "shortName": "VLL",
        "city": "Valladolid",
        "sofascoreId": 2832,
        "badge": "https://cdn.sofascore.com/api/v1/team/2832/image",
        "primaryColor": "#5A1A8B",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 23750000,
        "reputation": 72,
        "fans": 31000
      }
    ]
  },
  {
    "name": "Premier League",
    "shortName": "Premier",
    "country": "Inglaterra",
    "countryCode": "GB",
    "tier": 1,
    "leagueStrength": 98,
    "teams": [
      {
        "name": "Manchester City",
        "shortName": "MCI",
        "city": "Manchester",
        "sofascoreId": 17,
        "badge": "https://cdn.sofascore.com/api/v1/team/17/image",
        "primaryColor": "#6CABDD",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 132250000,
        "reputation": 94,
        "fans": 89500
      },
      {
        "name": "Arsenal",
        "shortName": "ARS",
        "city": "Londres",
        "sofascoreId": 42,
        "badge": "https://cdn.sofascore.com/api/v1/team/42/image",
        "primaryColor": "#EF0107",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 124750000,
        "reputation": 93,
        "fans": 85500
      },
      {
        "name": "Liverpool",
        "shortName": "LIV",
        "city": "Liverpool",
        "sofascoreId": 44,
        "badge": "https://cdn.sofascore.com/api/v1/team/44/image",
        "primaryColor": "#C8102E",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 117250000,
        "reputation": 92,
        "fans": 82000
      },
      {
        "name": "Manchester United",
        "shortName": "MUN",
        "city": "Manchester",
        "sofascoreId": 35,
        "badge": "https://cdn.sofascore.com/api/v1/team/35/image",
        "primaryColor": "#DA291C",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 110000000,
        "reputation": 91,
        "fans": 78500
      },
      {
        "name": "Chelsea",
        "shortName": "CHE",
        "city": "Londres",
        "sofascoreId": 38,
        "badge": "https://cdn.sofascore.com/api/v1/team/38/image",
        "primaryColor": "#034694",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 102750000,
        "reputation": 90,
        "fans": 74500
      },
      {
        "name": "Tottenham Hotspur",
        "shortName": "TOT",
        "city": "Londres",
        "sofascoreId": 33,
        "badge": "https://cdn.sofascore.com/api/v1/team/33/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#132257",
        "isUserClub": false,
        "budget": 95750000,
        "reputation": 89,
        "fans": 71000
      },
      {
        "name": "Newcastle United",
        "shortName": "NEW",
        "city": "Newcastle",
        "sofascoreId": 39,
        "badge": "https://cdn.sofascore.com/api/v1/team/39/image",
        "primaryColor": "#241F20",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 89000000,
        "reputation": 88,
        "fans": 67500
      },
      {
        "name": "Aston Villa",
        "shortName": "AVL",
        "city": "Birmingham",
        "sofascoreId": 40,
        "badge": "https://cdn.sofascore.com/api/v1/team/40/image",
        "primaryColor": "#670E36",
        "secondaryColor": "#95BFE5",
        "isUserClub": false,
        "budget": 82250000,
        "reputation": 87,
        "fans": 64000
      },
      {
        "name": "West Ham United",
        "shortName": "WHU",
        "city": "Londres",
        "sofascoreId": 37,
        "badge": "https://cdn.sofascore.com/api/v1/team/37/image",
        "primaryColor": "#7A263A",
        "secondaryColor": "#1BB1E7",
        "isUserClub": false,
        "budget": 75750000,
        "reputation": 86,
        "fans": 61000
      },
      {
        "name": "Brighton & Hove Albion",
        "shortName": "BHA",
        "city": "Brighton",
        "sofascoreId": 30,
        "badge": "https://cdn.sofascore.com/api/v1/team/30/image",
        "primaryColor": "#0057B8",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 69750000,
        "reputation": 85,
        "fans": 57500
      },
      {
        "name": "Wolverhampton",
        "shortName": "WOL",
        "city": "Wolverhampton",
        "sofascoreId": 3,
        "badge": "https://cdn.sofascore.com/api/v1/team/3/image",
        "primaryColor": "#FDB913",
        "secondaryColor": "#231F20",
        "isUserClub": false,
        "budget": 63500000,
        "reputation": 84,
        "fans": 54500
      },
      {
        "name": "Fulham",
        "shortName": "FUL",
        "city": "Londres",
        "sofascoreId": 5765,
        "badge": "https://cdn.sofascore.com/api/v1/team/5765/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 57750000,
        "reputation": 83,
        "fans": 51000
      },
      {
        "name": "AFC Bournemouth",
        "shortName": "BOU",
        "city": "Bournemouth",
        "sofascoreId": 8,
        "badge": "https://cdn.sofascore.com/api/v1/team/8/image",
        "primaryColor": "#DA291C",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 52250000,
        "reputation": 82,
        "fans": 48000
      },
      {
        "name": "Crystal Palace",
        "shortName": "CRY",
        "city": "Londres",
        "sofascoreId": 7,
        "badge": "https://cdn.sofascore.com/api/v1/team/7/image",
        "primaryColor": "#1B458F",
        "secondaryColor": "#C4122E",
        "isUserClub": false,
        "budget": 47000000,
        "reputation": 81,
        "fans": 45000
      },
      {
        "name": "Brentford",
        "shortName": "BRE",
        "city": "Londres",
        "sofascoreId": 9737,
        "badge": "https://cdn.sofascore.com/api/v1/team/9737/image",
        "primaryColor": "#E30613",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 42000000,
        "reputation": 79,
        "fans": 42500
      },
      {
        "name": "Everton",
        "shortName": "EVE",
        "city": "Liverpool",
        "sofascoreId": 48,
        "badge": "https://cdn.sofascore.com/api/v1/team/48/image",
        "primaryColor": "#003399",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 37500000,
        "reputation": 78,
        "fans": 40000
      },
      {
        "name": "Nottingham Forest",
        "shortName": "NFO",
        "city": "Nottingham",
        "sofascoreId": 14,
        "badge": "https://cdn.sofascore.com/api/v1/team/14/image",
        "primaryColor": "#DD0000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 33250000,
        "reputation": 77,
        "fans": 37500
      },
      {
        "name": "Southampton",
        "shortName": "SOU",
        "city": "Southampton",
        "sofascoreId": 45,
        "badge": "https://cdn.sofascore.com/api/v1/team/45/image",
        "primaryColor": "#D71920",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 29250000,
        "reputation": 76,
        "fans": 35000
      },
      {
        "name": "Leicester City",
        "shortName": "LEI",
        "city": "Leicester",
        "sofascoreId": 31,
        "badge": "https://cdn.sofascore.com/api/v1/team/31/image",
        "primaryColor": "#003090",
        "secondaryColor": "#FDBE11",
        "isUserClub": false,
        "budget": 26250000,
        "reputation": 74,
        "fans": 33000
      },
      {
        "name": "Ipswich Town",
        "shortName": "IPS",
        "city": "Ipswich",
        "sofascoreId": 32,
        "badge": "https://cdn.sofascore.com/api/v1/team/32/image",
        "primaryColor": "#0044A9",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 24250000,
        "reputation": 72,
        "fans": 31500
      }
    ]
  },
  {
    "name": "Bundesliga",
    "shortName": "Bundesliga",
    "country": "Alemania",
    "countryCode": "DE",
    "tier": 1,
    "leagueStrength": 94,
    "teams": [
      {
        "name": "Bayern de Múnich",
        "shortName": "BAY",
        "city": "Múnich",
        "sofascoreId": 2672,
        "badge": "https://cdn.sofascore.com/api/v1/team/2672/image",
        "primaryColor": "#DC052D",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 121750000,
        "reputation": 93,
        "fans": 88500
      },
      {
        "name": "Bayer Leverkusen",
        "shortName": "B04",
        "city": "Leverkusen",
        "sofascoreId": 10239,
        "badge": "https://cdn.sofascore.com/api/v1/team/10239/image",
        "primaryColor": "#E32221",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 113750000,
        "reputation": 92,
        "fans": 84000
      },
      {
        "name": "Borussia Dortmund",
        "shortName": "BVB",
        "city": "Dortmund",
        "sofascoreId": 2673,
        "badge": "https://cdn.sofascore.com/api/v1/team/2673/image",
        "primaryColor": "#FDE100",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 106250000,
        "reputation": 91,
        "fans": 80000
      },
      {
        "name": "RB Leipzig",
        "shortName": "RBL",
        "city": "Leipzig",
        "sofascoreId": 23826,
        "badge": "https://cdn.sofascore.com/api/v1/team/23826/image",
        "primaryColor": "#DD0741",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 98750000,
        "reputation": 90,
        "fans": 76000
      },
      {
        "name": "Eintracht Fráncfort",
        "shortName": "SGE",
        "city": "Fráncfort",
        "sofascoreId": 2671,
        "badge": "https://cdn.sofascore.com/api/v1/team/2671/image",
        "primaryColor": "#E1000F",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 91500000,
        "reputation": 88,
        "fans": 72000
      },
      {
        "name": "VfB Stuttgart",
        "shortName": "VFB",
        "city": "Stuttgart",
        "sofascoreId": 2597,
        "badge": "https://cdn.sofascore.com/api/v1/team/2597/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#E32219",
        "isUserClub": false,
        "budget": 84500000,
        "reputation": 87,
        "fans": 68000
      },
      {
        "name": "VfL Wolfsburg",
        "shortName": "WOB",
        "city": "Wolfsburgo",
        "sofascoreId": 2678,
        "badge": "https://cdn.sofascore.com/api/v1/team/2678/image",
        "primaryColor": "#65B32E",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 77500000,
        "reputation": 86,
        "fans": 64000
      },
      {
        "name": "Borussia Mönchengladbach",
        "shortName": "BMG",
        "city": "Mönchengladbach",
        "sofascoreId": 2675,
        "badge": "https://cdn.sofascore.com/api/v1/team/2675/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#009933",
        "isUserClub": false,
        "budget": 70750000,
        "reputation": 85,
        "fans": 60500
      },
      {
        "name": "Union Berlín",
        "shortName": "FCU",
        "city": "Berlín",
        "sofascoreId": 20360,
        "badge": "https://cdn.sofascore.com/api/v1/team/20360/image",
        "primaryColor": "#EB1923",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 64500000,
        "reputation": 84,
        "fans": 56500
      },
      {
        "name": "SC Freiburg",
        "shortName": "SCF",
        "city": "Friburgo",
        "sofascoreId": 2670,
        "badge": "https://cdn.sofascore.com/api/v1/team/2670/image",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 58250000,
        "reputation": 82,
        "fans": 53000
      },
      {
        "name": "1. FSV Mainz 05",
        "shortName": "M05",
        "city": "Maguncia",
        "sofascoreId": 2676,
        "badge": "https://cdn.sofascore.com/api/v1/team/2676/image",
        "primaryColor": "#C3141E",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52250000,
        "reputation": 81,
        "fans": 49500
      },
      {
        "name": "TSG Hoffenheim",
        "shortName": "TSG",
        "city": "Sinsheim",
        "sofascoreId": 2669,
        "badge": "https://cdn.sofascore.com/api/v1/team/2669/image",
        "primaryColor": "#1C63B7",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 46750000,
        "reputation": 80,
        "fans": 46000
      },
      {
        "name": "Werder Bremen",
        "shortName": "SVW",
        "city": "Bremen",
        "sofascoreId": 2668,
        "badge": "https://cdn.sofascore.com/api/v1/team/2668/image",
        "primaryColor": "#1D9053",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41250000,
        "reputation": 79,
        "fans": 43000
      },
      {
        "name": "FC Augsburg",
        "shortName": "FCA",
        "city": "Augsburgo",
        "sofascoreId": 2667,
        "badge": "https://cdn.sofascore.com/api/v1/team/2667/image",
        "primaryColor": "#BA3733",
        "secondaryColor": "#46714D",
        "isUserClub": false,
        "budget": 36250000,
        "reputation": 77,
        "fans": 40000
      },
      {
        "name": "VfL Bochum",
        "shortName": "BOC",
        "city": "Bochum",
        "sofascoreId": 2674,
        "badge": "https://cdn.sofascore.com/api/v1/team/2674/image",
        "primaryColor": "#005CA9",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 31750000,
        "reputation": 76,
        "fans": 37000
      },
      {
        "name": "FC St. Pauli",
        "shortName": "STP",
        "city": "Hamburgo",
        "sofascoreId": 2660,
        "badge": "https://cdn.sofascore.com/api/v1/team/2660/image",
        "primaryColor": "#614E37",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 27750000,
        "reputation": 74,
        "fans": 34500
      },
      {
        "name": "1. FC Heidenheim",
        "shortName": "FCH",
        "city": "Heidenheim",
        "sofascoreId": 35016,
        "badge": "https://cdn.sofascore.com/api/v1/team/35016/image",
        "primaryColor": "#E20613",
        "secondaryColor": "#003F87",
        "isUserClub": false,
        "budget": 24500000,
        "reputation": 73,
        "fans": 32000
      },
      {
        "name": "Holstein Kiel",
        "shortName": "KIE",
        "city": "Kiel",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#005CA9",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 22250000,
        "reputation": 71,
        "fans": 30500
      }
    ]
  },
  {
    "name": "Serie A",
    "shortName": "Serie A",
    "country": "Italia",
    "countryCode": "IT",
    "tier": 1,
    "leagueStrength": 93,
    "teams": [
      {
        "name": "Inter de Milán",
        "shortName": "INT",
        "city": "Milán",
        "sofascoreId": 2697,
        "badge": "https://cdn.sofascore.com/api/v1/team/2697/image",
        "primaryColor": "#0068A8",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 119000000,
        "reputation": 93,
        "fans": 88000
      },
      {
        "name": "AC Milan",
        "shortName": "MIL",
        "city": "Milán",
        "sofascoreId": 2692,
        "badge": "https://cdn.sofascore.com/api/v1/team/2692/image",
        "primaryColor": "#FB090B",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 112250000,
        "reputation": 92,
        "fans": 84500
      },
      {
        "name": "Juventus",
        "shortName": "JUV",
        "city": "Turín",
        "sofascoreId": 2686,
        "badge": "https://cdn.sofascore.com/api/v1/team/2686/image",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 105500000,
        "reputation": 91,
        "fans": 80500
      },
      {
        "name": "Napoli",
        "shortName": "NAP",
        "city": "Nápoles",
        "sofascoreId": 2714,
        "badge": "https://cdn.sofascore.com/api/v1/team/2714/image",
        "primaryColor": "#12A0D7",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 99000000,
        "reputation": 90,
        "fans": 77000
      },
      {
        "name": "Atalanta",
        "shortName": "ATA",
        "city": "Bérgamo",
        "sofascoreId": 2681,
        "badge": "https://cdn.sofascore.com/api/v1/team/2681/image",
        "primaryColor": "#1E71B8",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 92500000,
        "reputation": 89,
        "fans": 73500
      },
      {
        "name": "AS Roma",
        "shortName": "ROM",
        "city": "Roma",
        "sofascoreId": 2699,
        "badge": "https://cdn.sofascore.com/api/v1/team/2699/image",
        "primaryColor": "#8E1F2F",
        "secondaryColor": "#F0BC42",
        "isUserClub": false,
        "budget": 86250000,
        "reputation": 88,
        "fans": 70000
      },
      {
        "name": "Lazio",
        "shortName": "LAZ",
        "city": "Roma",
        "sofascoreId": 2687,
        "badge": "https://cdn.sofascore.com/api/v1/team/2687/image",
        "primaryColor": "#87D8F7",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 80000000,
        "reputation": 86,
        "fans": 66500
      },
      {
        "name": "Fiorentina",
        "shortName": "FIO",
        "city": "Florencia",
        "sofascoreId": 2684,
        "badge": "https://cdn.sofascore.com/api/v1/team/2684/image",
        "primaryColor": "#592C82",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 74000000,
        "reputation": 85,
        "fans": 63000
      },
      {
        "name": "Torino",
        "shortName": "TOR",
        "city": "Turín",
        "sofascoreId": 2703,
        "badge": "https://cdn.sofascore.com/api/v1/team/2703/image",
        "primaryColor": "#881C24",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 68250000,
        "reputation": 84,
        "fans": 59500
      },
      {
        "name": "Bologna",
        "shortName": "BOL",
        "city": "Bolonia",
        "sofascoreId": 2682,
        "badge": "https://cdn.sofascore.com/api/v1/team/2682/image",
        "primaryColor": "#1A2F48",
        "secondaryColor": "#A21C26",
        "isUserClub": false,
        "budget": 62750000,
        "reputation": 83,
        "fans": 56000
      },
      {
        "name": "Genoa",
        "shortName": "GEN",
        "city": "Génova",
        "sofascoreId": 2685,
        "badge": "https://cdn.sofascore.com/api/v1/team/2685/image",
        "primaryColor": "#C20E2A",
        "secondaryColor": "#002B5C",
        "isUserClub": false,
        "budget": 57250000,
        "reputation": 82,
        "fans": 53000
      },
      {
        "name": "Udinese",
        "shortName": "UDI",
        "city": "Údine",
        "sofascoreId": 2704,
        "badge": "https://cdn.sofascore.com/api/v1/team/2704/image",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52000000,
        "reputation": 81,
        "fans": 50000
      },
      {
        "name": "Hellas Verona",
        "shortName": "VER",
        "city": "Verona",
        "sofascoreId": 2689,
        "badge": "https://cdn.sofascore.com/api/v1/team/2689/image",
        "primaryColor": "#FFD400",
        "secondaryColor": "#002E5B",
        "isUserClub": false,
        "budget": 47000000,
        "reputation": 80,
        "fans": 47000
      },
      {
        "name": "Cagliari",
        "shortName": "CAG",
        "city": "Cagliari",
        "sofascoreId": 2683,
        "badge": "https://cdn.sofascore.com/api/v1/team/2683/image",
        "primaryColor": "#AD1F23",
        "secondaryColor": "#00295B",
        "isUserClub": false,
        "budget": 42250000,
        "reputation": 79,
        "fans": 44000
      },
      {
        "name": "AC Monza",
        "shortName": "MON",
        "city": "Monza",
        "sofascoreId": 2691,
        "badge": "https://cdn.sofascore.com/api/v1/team/2691/image",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 37750000,
        "reputation": 78,
        "fans": 41000
      },
      {
        "name": "Empoli",
        "shortName": "EMP",
        "city": "Empoli",
        "sofascoreId": 14931,
        "badge": "https://cdn.sofascore.com/api/v1/team/14931/image",
        "primaryColor": "#00579C",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 33750000,
        "reputation": 76,
        "fans": 38500
      },
      {
        "name": "US Lecce",
        "shortName": "LEC",
        "city": "Lecce",
        "sofascoreId": 2688,
        "badge": "https://cdn.sofascore.com/api/v1/team/2688/image",
        "primaryColor": "#F2C500",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 29750000,
        "reputation": 75,
        "fans": 36000
      },
      {
        "name": "Parma",
        "shortName": "PAR",
        "city": "Parma",
        "sofascoreId": 2695,
        "badge": "https://cdn.sofascore.com/api/v1/team/2695/image",
        "primaryColor": "#FFD200",
        "secondaryColor": "#003B7F",
        "isUserClub": false,
        "budget": 26500000,
        "reputation": 74,
        "fans": 33500
      },
      {
        "name": "Como 1907",
        "shortName": "COM",
        "city": "Como",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#0067B2",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 23500000,
        "reputation": 72,
        "fans": 31500
      },
      {
        "name": "Venezia",
        "shortName": "VEN",
        "city": "Venecia",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#F58220",
        "isUserClub": false,
        "budget": 21750000,
        "reputation": 71,
        "fans": 30000
      }
    ]
  },
  {
    "name": "Ligue 1",
    "shortName": "Ligue 1",
    "country": "Francia",
    "countryCode": "FR",
    "tier": 1,
    "leagueStrength": 89,
    "teams": [
      {
        "name": "Paris Saint-Germain",
        "shortName": "PSG",
        "city": "París",
        "sofascoreId": 1644,
        "badge": "https://cdn.sofascore.com/api/v1/team/1644/image",
        "primaryColor": "#004170",
        "secondaryColor": "#DA291C",
        "isUserClub": false,
        "budget": 109000000,
        "reputation": 91,
        "fans": 87000
      },
      {
        "name": "AS Monaco",
        "shortName": "MON",
        "city": "Mónaco",
        "sofascoreId": 1648,
        "badge": "https://cdn.sofascore.com/api/v1/team/1648/image",
        "primaryColor": "#E63329",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 102000000,
        "reputation": 90,
        "fans": 83000
      },
      {
        "name": "Olympique de Marsella",
        "shortName": "OM",
        "city": "Marsella",
        "sofascoreId": 1641,
        "badge": "https://cdn.sofascore.com/api/v1/team/1641/image",
        "primaryColor": "#2FAEE0",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 95250000,
        "reputation": 89,
        "fans": 78500
      },
      {
        "name": "Olympique de Lyon",
        "shortName": "OL",
        "city": "Lyon",
        "sofascoreId": 1645,
        "badge": "https://cdn.sofascore.com/api/v1/team/1645/image",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#1D2D5C",
        "isUserClub": false,
        "budget": 88500000,
        "reputation": 88,
        "fans": 74500
      },
      {
        "name": "LOSC Lille",
        "shortName": "LIL",
        "city": "Lille",
        "sofascoreId": 1643,
        "badge": "https://cdn.sofascore.com/api/v1/team/1643/image",
        "primaryColor": "#E01E13",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 82000000,
        "reputation": 87,
        "fans": 70500
      },
      {
        "name": "OGC Nice",
        "shortName": "NIC",
        "city": "Niza",
        "sofascoreId": 1647,
        "badge": "https://cdn.sofascore.com/api/v1/team/1647/image",
        "primaryColor": "#C8102E",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 75750000,
        "reputation": 86,
        "fans": 66500
      },
      {
        "name": "RC Lens",
        "shortName": "RCL",
        "city": "Lens",
        "sofascoreId": 1642,
        "badge": "https://cdn.sofascore.com/api/v1/team/1642/image",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 69500000,
        "reputation": 84,
        "fans": 63000
      },
      {
        "name": "Stade Rennais",
        "shortName": "REN",
        "city": "Rennes",
        "sofascoreId": 1640,
        "badge": "https://cdn.sofascore.com/api/v1/team/1640/image",
        "primaryColor": "#E23226",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 63500000,
        "reputation": 83,
        "fans": 59000
      },
      {
        "name": "Stade Brestois",
        "shortName": "BRE",
        "city": "Brest",
        "sofascoreId": 1677,
        "badge": "https://cdn.sofascore.com/api/v1/team/1677/image",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 57750000,
        "reputation": 82,
        "fans": 55500
      },
      {
        "name": "Toulouse FC",
        "shortName": "TFC",
        "city": "Toulouse",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#642B8F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52250000,
        "reputation": 81,
        "fans": 51500
      },
      {
        "name": "Stade de Reims",
        "shortName": "REI",
        "city": "Reims",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 46750000,
        "reputation": 79,
        "fans": 48500
      },
      {
        "name": "RC Strasbourg",
        "shortName": "STR",
        "city": "Estrasburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#009FE3",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41750000,
        "reputation": 78,
        "fans": 45000
      },
      {
        "name": "FC Nantes",
        "shortName": "NAN",
        "city": "Nantes",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FCD405",
        "secondaryColor": "#008D36",
        "isUserClub": false,
        "budget": 37000000,
        "reputation": 77,
        "fans": 41500
      },
      {
        "name": "Montpellier HSC",
        "shortName": "MTP",
        "city": "Montpellier",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#F77F00",
        "secondaryColor": "#002F87",
        "isUserClub": false,
        "budget": 32500000,
        "reputation": 76,
        "fans": 38500
      },
      {
        "name": "Le Havre AC",
        "shortName": "HAC",
        "city": "Le Havre",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#00529F",
        "secondaryColor": "#87CEEB",
        "isUserClub": false,
        "budget": 28500000,
        "reputation": 74,
        "fans": 36000
      },
      {
        "name": "AJ Auxerre",
        "shortName": "AJA",
        "city": "Auxerre",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#006BB6",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 25000000,
        "reputation": 73,
        "fans": 33000
      },
      {
        "name": "Angers SCO",
        "shortName": "ANG",
        "city": "Angers",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 22000000,
        "reputation": 71,
        "fans": 31000
      },
      {
        "name": "AS Saint-Étienne",
        "shortName": "ASSE",
        "city": "Saint-Étienne",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#009639",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 20000000,
        "reputation": 69,
        "fans": 29000
      }
    ]
  },
  {
    "name": "Eredivisie",
    "shortName": "Eredivisie",
    "country": "Países Bajos",
    "countryCode": "NL",
    "tier": 1,
    "leagueStrength": 85,
    "teams": [
      {
        "name": "PSV Eindhoven",
        "shortName": "PSV",
        "city": "Eindhoven",
        "sofascoreId": 2608,
        "badge": "https://cdn.sofascore.com/api/v1/team/2608/image",
        "primaryColor": "#ED1C24",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 99500000,
        "reputation": 90,
        "fans": 86000
      },
      {
        "name": "Feyenoord",
        "shortName": "FEY",
        "city": "Róterdam",
        "sofascoreId": 2603,
        "badge": "https://cdn.sofascore.com/api/v1/team/2603/image",
        "primaryColor": "#E30613",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 93000000,
        "reputation": 89,
        "fans": 82000
      },
      {
        "name": "Ajax",
        "shortName": "AJA",
        "city": "Ámsterdam",
        "sofascoreId": 2604,
        "badge": "https://cdn.sofascore.com/api/v1/team/2604/image",
        "primaryColor": "#D2122E",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 86750000,
        "reputation": 88,
        "fans": 77500
      },
      {
        "name": "AZ Alkmaar",
        "shortName": "AZ",
        "city": "Alkmaar",
        "sofascoreId": 2600,
        "badge": "https://cdn.sofascore.com/api/v1/team/2600/image",
        "primaryColor": "#ED1C24",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 80750000,
        "reputation": 86,
        "fans": 73500
      },
      {
        "name": "FC Twente",
        "shortName": "TWE",
        "city": "Enschede",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 74750000,
        "reputation": 85,
        "fans": 69500
      },
      {
        "name": "FC Utrecht",
        "shortName": "UTR",
        "city": "Utrecht",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 69000000,
        "reputation": 84,
        "fans": 65500
      },
      {
        "name": "SC Heerenveen",
        "shortName": "HEE",
        "city": "Heerenveen",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 63250000,
        "reputation": 83,
        "fans": 62000
      },
      {
        "name": "Go Ahead Eagles",
        "shortName": "GAE",
        "city": "Deventer",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFEE00",
        "isUserClub": false,
        "budget": 58000000,
        "reputation": 82,
        "fans": 58000
      },
      {
        "name": "Sparta Róterdam",
        "shortName": "SPA",
        "city": "Róterdam",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52750000,
        "reputation": 81,
        "fans": 54500
      },
      {
        "name": "NEC Nijmegen",
        "shortName": "NEC",
        "city": "Nimega",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 47500000,
        "reputation": 79,
        "fans": 50500
      },
      {
        "name": "Fortuna Sittard",
        "shortName": "FOR",
        "city": "Sittard",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#008542",
        "isUserClub": false,
        "budget": 42750000,
        "reputation": 78,
        "fans": 47000
      },
      {
        "name": "PEC Zwolle",
        "shortName": "PEC",
        "city": "Zwolle",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 38250000,
        "reputation": 77,
        "fans": 44000
      },
      {
        "name": "Heracles Almelo",
        "shortName": "HER",
        "city": "Almelo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 33750000,
        "reputation": 76,
        "fans": 40500
      },
      {
        "name": "Almere City",
        "shortName": "ALM",
        "city": "Almere",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 29750000,
        "reputation": 74,
        "fans": 37500
      },
      {
        "name": "RKC Waalwijk",
        "shortName": "RKC",
        "city": "Waalwijk",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#0033A0",
        "isUserClub": false,
        "budget": 26000000,
        "reputation": 73,
        "fans": 34500
      },
      {
        "name": "Willem II",
        "shortName": "WIL",
        "city": "Tilburg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#0033A0",
        "isUserClub": false,
        "budget": 22750000,
        "reputation": 71,
        "fans": 32000
      },
      {
        "name": "NAC Breda",
        "shortName": "NAC",
        "city": "Breda",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 20000000,
        "reputation": 70,
        "fans": 30000
      },
      {
        "name": "FC Groningen",
        "shortName": "GRO",
        "city": "Groninga",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#00A94F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 18250000,
        "reputation": 68,
        "fans": 28000
      }
    ]
  },
  {
    "name": "Primeira Liga",
    "shortName": "Primeira",
    "country": "Portugal",
    "countryCode": "PT",
    "tier": 1,
    "leagueStrength": 84,
    "teams": [
      {
        "name": "SL Benfica",
        "shortName": "BEN",
        "city": "Lisboa",
        "sofascoreId": 1714,
        "badge": "https://cdn.sofascore.com/api/v1/team/1714/image",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 97250000,
        "reputation": 89,
        "fans": 86000
      },
      {
        "name": "Sporting CP",
        "shortName": "SCP",
        "city": "Lisboa",
        "sofascoreId": 1713,
        "badge": "https://cdn.sofascore.com/api/v1/team/1713/image",
        "primaryColor": "#008057",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 91000000,
        "reputation": 88,
        "fans": 81500
      },
      {
        "name": "FC Porto",
        "shortName": "POR",
        "city": "Oporto",
        "sofascoreId": 1715,
        "badge": "https://cdn.sofascore.com/api/v1/team/1715/image",
        "primaryColor": "#00428C",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 84750000,
        "reputation": 87,
        "fans": 77500
      },
      {
        "name": "SC Braga",
        "shortName": "BRA",
        "city": "Braga",
        "sofascoreId": 1716,
        "badge": "https://cdn.sofascore.com/api/v1/team/1716/image",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 78750000,
        "reputation": 86,
        "fans": 73500
      },
      {
        "name": "Vitória de Guimarães",
        "shortName": "VSC",
        "city": "Guimarães",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 73000000,
        "reputation": 85,
        "fans": 69500
      },
      {
        "name": "Moreirense",
        "shortName": "MOR",
        "city": "Moreira de Cónegos",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#00A859",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 67500000,
        "reputation": 84,
        "fans": 65500
      },
      {
        "name": "FC Famalicão",
        "shortName": "FAM",
        "city": "Famalicão",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#009FE3",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 62000000,
        "reputation": 83,
        "fans": 61500
      },
      {
        "name": "Gil Vicente",
        "shortName": "GIL",
        "city": "Barcelos",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 56500000,
        "reputation": 81,
        "fans": 57500
      },
      {
        "name": "Estoril Praia",
        "shortName": "EST",
        "city": "Estoril",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 51500000,
        "reputation": 80,
        "fans": 54000
      },
      {
        "name": "Casa Pia",
        "shortName": "CAS",
        "city": "Lisboa",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 46500000,
        "reputation": 79,
        "fans": 50500
      },
      {
        "name": "Boavista",
        "shortName": "BOA",
        "city": "Oporto",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41750000,
        "reputation": 78,
        "fans": 47000
      },
      {
        "name": "Rio Ave",
        "shortName": "RIO",
        "city": "Vila do Conde",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 37250000,
        "reputation": 76,
        "fans": 43500
      },
      {
        "name": "FC Arouca",
        "shortName": "ARO",
        "city": "Arouca",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 33000000,
        "reputation": 75,
        "fans": 40500
      },
      {
        "name": "Estrela da Amadora",
        "shortName": "AMA",
        "city": "Amadora",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 29000000,
        "reputation": 74,
        "fans": 37500
      },
      {
        "name": "SC Farense",
        "shortName": "FAR",
        "city": "Faro",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 25500000,
        "reputation": 72,
        "fans": 34500
      },
      {
        "name": "AVS Futebol SAD",
        "shortName": "AVS",
        "city": "Vila das Aves",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 22250000,
        "reputation": 71,
        "fans": 32000
      },
      {
        "name": "CD Nacional",
        "shortName": "NAC",
        "city": "Funchal",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 19500000,
        "reputation": 69,
        "fans": 29500
      },
      {
        "name": "Santa Clara",
        "shortName": "SCL",
        "city": "Ponta Delgada",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17750000,
        "reputation": 67,
        "fans": 28000
      }
    ]
  },
  {
    "name": "Süper Lig",
    "shortName": "Süper Lig",
    "country": "Turquía",
    "countryCode": "TR",
    "tier": 1,
    "leagueStrength": 82,
    "teams": [
      {
        "name": "Galatasaray",
        "shortName": "GS",
        "city": "Estambul",
        "sofascoreId": 2637,
        "badge": "https://cdn.sofascore.com/api/v1/team/2637/image",
        "primaryColor": "#FCB904",
        "secondaryColor": "#A90432",
        "isUserClub": false,
        "budget": 92500000,
        "reputation": 89,
        "fans": 85500
      },
      {
        "name": "Fenerbahçe",
        "shortName": "FB",
        "city": "Estambul",
        "sofascoreId": 2636,
        "badge": "https://cdn.sofascore.com/api/v1/team/2636/image",
        "primaryColor": "#FFED00",
        "secondaryColor": "#00296B",
        "isUserClub": false,
        "budget": 87250000,
        "reputation": 88,
        "fans": 81500
      },
      {
        "name": "Beşiktaş",
        "shortName": "BJK",
        "city": "Estambul",
        "sofascoreId": 2635,
        "badge": "https://cdn.sofascore.com/api/v1/team/2635/image",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 82000000,
        "reputation": 87,
        "fans": 78000
      },
      {
        "name": "Trabzonspor",
        "shortName": "TS",
        "city": "Trebisonda",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#6E1129",
        "secondaryColor": "#41B6E6",
        "isUserClub": false,
        "budget": 77000000,
        "reputation": 86,
        "fans": 74000
      },
      {
        "name": "İstanbul Başakşehir",
        "shortName": "IBFK",
        "city": "Estambul",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#F37021",
        "secondaryColor": "#1A2D5A",
        "isUserClub": false,
        "budget": 72000000,
        "reputation": 85,
        "fans": 70500
      },
      {
        "name": "Adana Demirspor",
        "shortName": "ADS",
        "city": "Adana",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#002D72",
        "secondaryColor": "#0093D0",
        "isUserClub": false,
        "budget": 67000000,
        "reputation": 84,
        "fans": 67000
      },
      {
        "name": "Konyaspor",
        "shortName": "KON",
        "city": "Konya",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 62250000,
        "reputation": 83,
        "fans": 63500
      },
      {
        "name": "Antalyaspor",
        "shortName": "ANT",
        "city": "Antalya",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 57500000,
        "reputation": 82,
        "fans": 60000
      },
      {
        "name": "Alanyaspor",
        "shortName": "ALA",
        "city": "Alanya",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2541E",
        "secondaryColor": "#008542",
        "isUserClub": false,
        "budget": 53000000,
        "reputation": 81,
        "fans": 56500
      },
      {
        "name": "Kasımpaşa",
        "shortName": "KAS",
        "city": "Estambul",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#00205B",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 48750000,
        "reputation": 79,
        "fans": 53500
      },
      {
        "name": "Sivasspor",
        "shortName": "SIV",
        "city": "Sivas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 44500000,
        "reputation": 78,
        "fans": 50000
      },
      {
        "name": "Kayserispor",
        "shortName": "KAY",
        "city": "Kayseri",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 40500000,
        "reputation": 77,
        "fans": 47000
      },
      {
        "name": "Çaykur Rizespor",
        "shortName": "RIZ",
        "city": "Rize",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 36500000,
        "reputation": 76,
        "fans": 44000
      },
      {
        "name": "Gaziantep FK",
        "shortName": "GFK",
        "city": "Gaziantep",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 33000000,
        "reputation": 75,
        "fans": 41000
      },
      {
        "name": "Samsunspor",
        "shortName": "SAM",
        "city": "Samsun",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 29500000,
        "reputation": 74,
        "fans": 38500
      },
      {
        "name": "Hatayspor",
        "shortName": "HAT",
        "city": "Antioquía",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#6E1129",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 26250000,
        "reputation": 73,
        "fans": 35500
      },
      {
        "name": "Bodrum FK",
        "shortName": "BOD",
        "city": "Bodrum",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 23250000,
        "reputation": 71,
        "fans": 33000
      },
      {
        "name": "Eyüpspor",
        "shortName": "EYP",
        "city": "Estambul",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#4B0082",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 20500000,
        "reputation": 70,
        "fans": 31000
      },
      {
        "name": "Göztepe",
        "shortName": "GOZ",
        "city": "Esmirna",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 18250000,
        "reputation": 69,
        "fans": 29000
      },
      {
        "name": "MKE Ankaragücü",
        "shortName": "ANK",
        "city": "Ankara",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#00205B",
        "isUserClub": false,
        "budget": 17000000,
        "reputation": 67,
        "fans": 27500
      }
    ]
  },
  {
    "name": "Scottish Premiership",
    "shortName": "Scottish",
    "country": "Escocia",
    "countryCode": "GB-SCT",
    "tier": 1,
    "leagueStrength": 74,
    "teams": [
      {
        "name": "Celtic",
        "shortName": "CEL",
        "city": "Glasgow",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#018749",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 75500000,
        "reputation": 86,
        "fans": 83000
      },
      {
        "name": "Rangers",
        "shortName": "RAN",
        "city": "Glasgow",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#1B458F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 68000000,
        "reputation": 84,
        "fans": 76500
      },
      {
        "name": "Aberdeen",
        "shortName": "ABE",
        "city": "Aberdeen",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 60750000,
        "reputation": 82,
        "fans": 70500
      },
      {
        "name": "Heart of Midlothian",
        "shortName": "HEA",
        "city": "Edimburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#6C1D45",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 54000000,
        "reputation": 81,
        "fans": 64000
      },
      {
        "name": "Hibernian",
        "shortName": "HIB",
        "city": "Edimburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 47250000,
        "reputation": 79,
        "fans": 58000
      },
      {
        "name": "Dundee United",
        "shortName": "DUU",
        "city": "Dundee",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FF6600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 41000000,
        "reputation": 77,
        "fans": 52500
      },
      {
        "name": "Dundee FC",
        "shortName": "DUN",
        "city": "Dundee",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#001B4E",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 35000000,
        "reputation": 75,
        "fans": 47000
      },
      {
        "name": "Motherwell",
        "shortName": "MOT",
        "city": "Motherwell",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFD100",
        "secondaryColor": "#8B0000",
        "isUserClub": false,
        "budget": 29500000,
        "reputation": 73,
        "fans": 41500
      },
      {
        "name": "St Mirren",
        "shortName": "STM",
        "city": "Paisley",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 24500000,
        "reputation": 71,
        "fans": 36500
      },
      {
        "name": "Kilmarnock",
        "shortName": "KIL",
        "city": "Kilmarnock",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 20000000,
        "reputation": 69,
        "fans": 32000
      },
      {
        "name": "Ross County",
        "shortName": "ROS",
        "city": "Dingwall",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#002D72",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 16250000,
        "reputation": 67,
        "fans": 28000
      },
      {
        "name": "St Johnstone",
        "shortName": "STJ",
        "city": "Perth",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 13750000,
        "reputation": 64,
        "fans": 25000
      }
    ]
  },
  {
    "name": "Jupiler Pro League",
    "shortName": "Pro League",
    "country": "Bélgica",
    "countryCode": "BE",
    "tier": 1,
    "leagueStrength": 80,
    "teams": [
      {
        "name": "Club Brugge",
        "shortName": "CLB",
        "city": "Brujas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#0066B3",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 88250000,
        "reputation": 88,
        "fans": 85000
      },
      {
        "name": "RSC Anderlecht",
        "shortName": "AND",
        "city": "Bruselas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#4F2D7F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 81750000,
        "reputation": 87,
        "fans": 80000
      },
      {
        "name": "KRC Genk",
        "shortName": "GEN",
        "city": "Genk",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 75500000,
        "reputation": 85,
        "fans": 75500
      },
      {
        "name": "Royal Antwerp",
        "shortName": "ANT",
        "city": "Amberes",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 69500000,
        "reputation": 84,
        "fans": 70500
      },
      {
        "name": "Union Saint-Gilloise",
        "shortName": "USG",
        "city": "Bruselas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#0033A0",
        "isUserClub": false,
        "budget": 63500000,
        "reputation": 83,
        "fans": 66000
      },
      {
        "name": "KAA Gent",
        "shortName": "GNT",
        "city": "Gante",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 57750000,
        "reputation": 82,
        "fans": 61500
      },
      {
        "name": "Standard de Lieja",
        "shortName": "STA",
        "city": "Lieja",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52250000,
        "reputation": 80,
        "fans": 57500
      },
      {
        "name": "Cercle Brugge",
        "shortName": "CER",
        "city": "Brujas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 47000000,
        "reputation": 79,
        "fans": 53000
      },
      {
        "name": "Sporting Charleroi",
        "shortName": "CHA",
        "city": "Charleroi",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41750000,
        "reputation": 78,
        "fans": 49000
      },
      {
        "name": "KV Mechelen",
        "shortName": "MEC",
        "city": "Malinas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 37000000,
        "reputation": 76,
        "fans": 45500
      },
      {
        "name": "OH Leuven",
        "shortName": "OHL",
        "city": "Lovaina",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 32500000,
        "reputation": 75,
        "fans": 41500
      },
      {
        "name": "KVC Westerlo",
        "shortName": "WES",
        "city": "Westerlo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 28250000,
        "reputation": 73,
        "fans": 38000
      },
      {
        "name": "Sint-Truiden",
        "shortName": "STV",
        "city": "Sint-Truiden",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 24250000,
        "reputation": 72,
        "fans": 34500
      },
      {
        "name": "KV Kortrijk",
        "shortName": "KOR",
        "city": "Cortrique",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 20750000,
        "reputation": 70,
        "fans": 31500
      },
      {
        "name": "FCV Dender",
        "shortName": "DEN",
        "city": "Denderleeuw",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 18000000,
        "reputation": 68,
        "fans": 29000
      },
      {
        "name": "Beerschot",
        "shortName": "BEE",
        "city": "Amberes",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#4B0082",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 16250000,
        "reputation": 66,
        "fans": 27000
      }
    ]
  },
  {
    "name": "Austrian Bundesliga",
    "shortName": "Austria",
    "country": "Austria",
    "countryCode": "AT",
    "tier": 1,
    "leagueStrength": 76,
    "teams": [
      {
        "name": "Red Bull Salzburg",
        "shortName": "RBS",
        "city": "Salzburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 79500000,
        "reputation": 87,
        "fans": 84000
      },
      {
        "name": "SK Sturm Graz",
        "shortName": "STU",
        "city": "Graz",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 71750000,
        "reputation": 85,
        "fans": 77000
      },
      {
        "name": "LASK",
        "shortName": "LASK",
        "city": "Linz",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 64000000,
        "reputation": 83,
        "fans": 71000
      },
      {
        "name": "FK Austria Viena",
        "shortName": "AUS",
        "city": "Viena",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#4F2D7F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 56750000,
        "reputation": 81,
        "fans": 64500
      },
      {
        "name": "SK Rapid Viena",
        "shortName": "RAP",
        "city": "Viena",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 49750000,
        "reputation": 80,
        "fans": 58500
      },
      {
        "name": "Wolfsberger AC",
        "shortName": "WAC",
        "city": "Wolfsberg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 43250000,
        "reputation": 78,
        "fans": 53000
      },
      {
        "name": "TSV Hartberg",
        "shortName": "HAR",
        "city": "Hartberg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 37000000,
        "reputation": 76,
        "fans": 47500
      },
      {
        "name": "Austria Klagenfurt",
        "shortName": "KLA",
        "city": "Klagenfurt",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#4F2D7F",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 31250000,
        "reputation": 74,
        "fans": 42000
      },
      {
        "name": "Blau-Weiß Linz",
        "shortName": "BWL",
        "city": "Linz",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 25750000,
        "reputation": 72,
        "fans": 37000
      },
      {
        "name": "SCR Altach",
        "shortName": "ALT",
        "city": "Altach",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 21000000,
        "reputation": 70,
        "fans": 32500
      },
      {
        "name": "Grazer AK",
        "shortName": "GAK",
        "city": "Graz",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17000000,
        "reputation": 67,
        "fans": 28500
      },
      {
        "name": "WSG Tirol",
        "shortName": "WSG",
        "city": "Innsbruck",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 14500000,
        "reputation": 65,
        "fans": 26000
      }
    ]
  },
  {
    "name": "Chance Liga",
    "shortName": "Czech Liga",
    "country": "Chequia",
    "countryCode": "CZ",
    "tier": 1,
    "leagueStrength": 74,
    "teams": [
      {
        "name": "SK Slavia Praga",
        "shortName": "SLA",
        "city": "Praga",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 75500000,
        "reputation": 86,
        "fans": 83000
      },
      {
        "name": "AC Sparta Praga",
        "shortName": "SPP",
        "city": "Praga",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#8B0000",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 70000000,
        "reputation": 85,
        "fans": 78500
      },
      {
        "name": "Viktoria Plzeň",
        "shortName": "PLZ",
        "city": "Pilsen",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 64500000,
        "reputation": 83,
        "fans": 73500
      },
      {
        "name": "Baník Ostrava",
        "shortName": "BAN",
        "city": "Ostrava",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 59500000,
        "reputation": 82,
        "fans": 69000
      },
      {
        "name": "Slovan Liberec",
        "shortName": "LIB",
        "city": "Liberec",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 54250000,
        "reputation": 81,
        "fans": 64500
      },
      {
        "name": "Sigma Olomouc",
        "shortName": "SIG",
        "city": "Olomouc",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 49500000,
        "reputation": 79,
        "fans": 60000
      },
      {
        "name": "Bohemians 1905",
        "shortName": "BOH",
        "city": "Praga",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 44750000,
        "reputation": 78,
        "fans": 56000
      },
      {
        "name": "Mladá Boleslav",
        "shortName": "MBL",
        "city": "Mladá Boleslav",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 40250000,
        "reputation": 77,
        "fans": 51500
      },
      {
        "name": "Hradec Králové",
        "shortName": "HKR",
        "city": "Hradec Králové",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 35750000,
        "reputation": 75,
        "fans": 47500
      },
      {
        "name": "FK Teplice",
        "shortName": "TEP",
        "city": "Teplice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 31750000,
        "reputation": 74,
        "fans": 43500
      },
      {
        "name": "FK Jablonec",
        "shortName": "JAB",
        "city": "Jablonec",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 27750000,
        "reputation": 73,
        "fans": 40000
      },
      {
        "name": "Dukla Praga",
        "shortName": "DUK",
        "city": "Praga",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#6E1129",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 24250000,
        "reputation": 71,
        "fans": 36500
      },
      {
        "name": "MFK Karviná",
        "shortName": "KAR",
        "city": "Karviná",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 20750000,
        "reputation": 70,
        "fans": 33000
      },
      {
        "name": "Dynamo Č. Budějovice",
        "shortName": "DCB",
        "city": "České Budějovice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17750000,
        "reputation": 68,
        "fans": 30000
      },
      {
        "name": "FK Pardubice",
        "shortName": "PCE",
        "city": "Pardubice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 15500000,
        "reputation": 66,
        "fans": 27000
      },
      {
        "name": "1. FC Slovácko",
        "shortName": "SLO",
        "city": "Uherské Hradiště",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 13750000,
        "reputation": 64,
        "fans": 25000
      }
    ]
  },
  {
    "name": "Super League Greece",
    "shortName": "Greece",
    "country": "Grecia",
    "countryCode": "GR",
    "tier": 1,
    "leagueStrength": 75,
    "teams": [
      {
        "name": "Olympiacos",
        "shortName": "OLY",
        "city": "El Pireo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 77500000,
        "reputation": 86,
        "fans": 83500
      },
      {
        "name": "PAOK",
        "shortName": "PAOK",
        "city": "Salónica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 71000000,
        "reputation": 85,
        "fans": 78000
      },
      {
        "name": "AEK Atenas",
        "shortName": "AEK",
        "city": "Atenas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 64750000,
        "reputation": 83,
        "fans": 72500
      },
      {
        "name": "Panathinaikos",
        "shortName": "PAN",
        "city": "Atenas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 58500000,
        "reputation": 82,
        "fans": 67500
      },
      {
        "name": "Aris Salónica",
        "shortName": "ARI",
        "city": "Salónica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 52750000,
        "reputation": 80,
        "fans": 62000
      },
      {
        "name": "Atromitos",
        "shortName": "ATR",
        "city": "Atenas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 47000000,
        "reputation": 79,
        "fans": 57000
      },
      {
        "name": "PAS Lamia",
        "shortName": "LAM",
        "city": "Lamia",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 41500000,
        "reputation": 77,
        "fans": 52500
      },
      {
        "name": "OFI Creta",
        "shortName": "OFI",
        "city": "Heraclión",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 36500000,
        "reputation": 76,
        "fans": 47500
      },
      {
        "name": "Volos NFC",
        "shortName": "VOL",
        "city": "Volos",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 31500000,
        "reputation": 74,
        "fans": 43000
      },
      {
        "name": "Panetolikos",
        "shortName": "PAE",
        "city": "Agrinio",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 27000000,
        "reputation": 72,
        "fans": 39000
      },
      {
        "name": "Asteras Tripolis",
        "shortName": "AST",
        "city": "Trípoli",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 23000000,
        "reputation": 71,
        "fans": 35000
      },
      {
        "name": "Kallithea",
        "shortName": "KAL",
        "city": "Atenas",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 19250000,
        "reputation": 69,
        "fans": 31000
      },
      {
        "name": "Levadiakos",
        "shortName": "LEV",
        "city": "Livadiá",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 16250000,
        "reputation": 67,
        "fans": 28000
      },
      {
        "name": "Panserraikos",
        "shortName": "PAS",
        "city": "Serres",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 14250000,
        "reputation": 64,
        "fans": 25500
      }
    ]
  },
  {
    "name": "Swiss Super League",
    "shortName": "Swiss SL",
    "country": "Suiza",
    "countryCode": "CH",
    "tier": 1,
    "leagueStrength": 77,
    "teams": [
      {
        "name": "BSC Young Boys",
        "shortName": "YB",
        "city": "Berna",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 81750000,
        "reputation": 87,
        "fans": 84000
      },
      {
        "name": "Servette FC",
        "shortName": "SER",
        "city": "Ginebra",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#6E1129",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 73500000,
        "reputation": 85,
        "fans": 77500
      },
      {
        "name": "FC Basel",
        "shortName": "BAS",
        "city": "Basilea",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 65750000,
        "reputation": 84,
        "fans": 71000
      },
      {
        "name": "FC Lugano",
        "shortName": "LUG",
        "city": "Lugano",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 58250000,
        "reputation": 82,
        "fans": 65000
      },
      {
        "name": "FC Lausanne-Sport",
        "shortName": "LAU",
        "city": "Lausana",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 51250000,
        "reputation": 80,
        "fans": 59000
      },
      {
        "name": "FC St. Gallen",
        "shortName": "STG",
        "city": "San Galo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 44250000,
        "reputation": 78,
        "fans": 53000
      },
      {
        "name": "FC Luzern",
        "shortName": "LUZ",
        "city": "Lucerna",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 38000000,
        "reputation": 76,
        "fans": 47500
      },
      {
        "name": "FC Zürich",
        "shortName": "FCZ",
        "city": "Zúrich",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 32000000,
        "reputation": 74,
        "fans": 42500
      },
      {
        "name": "Grasshopper",
        "shortName": "GC",
        "city": "Zúrich",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 26500000,
        "reputation": 72,
        "fans": 37500
      },
      {
        "name": "FC Sion",
        "shortName": "SIO",
        "city": "Sión",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 21500000,
        "reputation": 70,
        "fans": 33000
      },
      {
        "name": "Yverdon-Sport",
        "shortName": "YS",
        "city": "Yverdon",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17500000,
        "reputation": 68,
        "fans": 29000
      },
      {
        "name": "FC Winterthur",
        "shortName": "WIN",
        "city": "Winterthur",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 15000000,
        "reputation": 65,
        "fans": 26000
      }
    ]
  },
  {
    "name": "Superliga",
    "shortName": "Denmark",
    "country": "Dinamarca",
    "countryCode": "DK",
    "tier": 1,
    "leagueStrength": 76,
    "teams": [
      {
        "name": "FC Copenhague",
        "shortName": "FCK",
        "city": "Copenhague",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 79500000,
        "reputation": 87,
        "fans": 84000
      },
      {
        "name": "FC Midtjylland",
        "shortName": "FCM",
        "city": "Herning",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 71750000,
        "reputation": 85,
        "fans": 77000
      },
      {
        "name": "Brøndby IF",
        "shortName": "BIF",
        "city": "Brøndby",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 64000000,
        "reputation": 83,
        "fans": 71000
      },
      {
        "name": "FC Nordsjælland",
        "shortName": "FCN",
        "city": "Farum",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 56750000,
        "reputation": 81,
        "fans": 64500
      },
      {
        "name": "AGF Aarhus",
        "shortName": "AGF",
        "city": "Aarhus",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#6E1129",
        "isUserClub": false,
        "budget": 49750000,
        "reputation": 80,
        "fans": 58500
      },
      {
        "name": "Silkeborg IF",
        "shortName": "SIF",
        "city": "Silkeborg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 43250000,
        "reputation": 78,
        "fans": 53000
      },
      {
        "name": "Viborg FF",
        "shortName": "VFF",
        "city": "Viborg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 37000000,
        "reputation": 76,
        "fans": 47500
      },
      {
        "name": "Randers FC",
        "shortName": "RFC",
        "city": "Randers",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 31250000,
        "reputation": 74,
        "fans": 42000
      },
      {
        "name": "Lyngby BK",
        "shortName": "LBK",
        "city": "Lyngby",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 25750000,
        "reputation": 72,
        "fans": 37000
      },
      {
        "name": "Vejle BK",
        "shortName": "VBK",
        "city": "Vejle",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 21000000,
        "reputation": 70,
        "fans": 32500
      },
      {
        "name": "SønderjyskE",
        "shortName": "SJE",
        "city": "Haderslev",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17000000,
        "reputation": 67,
        "fans": 28500
      },
      {
        "name": "AaB",
        "shortName": "AAB",
        "city": "Aalborg",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 14500000,
        "reputation": 65,
        "fans": 26000
      }
    ]
  },
  {
    "name": "HNL",
    "shortName": "Croatia",
    "country": "Croacia",
    "countryCode": "HR",
    "tier": 1,
    "leagueStrength": 73,
    "teams": [
      {
        "name": "Dinamo Zagreb",
        "shortName": "DIN",
        "city": "Zagreb",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 73500000,
        "reputation": 86,
        "fans": 83000
      },
      {
        "name": "Hajduk Split",
        "shortName": "HAJ",
        "city": "Split",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 64500000,
        "reputation": 83,
        "fans": 75000
      },
      {
        "name": "HNK Rijeka",
        "shortName": "RIJ",
        "city": "Rijeka",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 56250000,
        "reputation": 81,
        "fans": 67500
      },
      {
        "name": "NK Osijek",
        "shortName": "OSI",
        "city": "Osijek",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 48000000,
        "reputation": 79,
        "fans": 60000
      },
      {
        "name": "Lokomotiva Zagreb",
        "shortName": "LOK",
        "city": "Zagreb",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 40500000,
        "reputation": 77,
        "fans": 53000
      },
      {
        "name": "HNK Gorica",
        "shortName": "GOR",
        "city": "Velika Gorica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 33500000,
        "reputation": 75,
        "fans": 46000
      },
      {
        "name": "Slaven Belupo",
        "shortName": "SLB",
        "city": "Koprivnica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 27000000,
        "reputation": 72,
        "fans": 39500
      },
      {
        "name": "NK Varaždin",
        "shortName": "VAR",
        "city": "Varaždin",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 21250000,
        "reputation": 70,
        "fans": 34000
      },
      {
        "name": "Istra 1961",
        "shortName": "IST",
        "city": "Pula",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 16500000,
        "reputation": 67,
        "fans": 28500
      },
      {
        "name": "HNK Šibenik",
        "shortName": "SIB",
        "city": "Šibenik",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 13500000,
        "reputation": 64,
        "fans": 25000
      }
    ]
  },
  {
    "name": "Ukrainian Premier League",
    "shortName": "Ukraine",
    "country": "Ucrania",
    "countryCode": "UA",
    "tier": 1,
    "leagueStrength": 75,
    "teams": [
      {
        "name": "Shakhtar Donetsk",
        "shortName": "SHK",
        "city": "Donetsk",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FF6600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 77500000,
        "reputation": 86,
        "fans": 83500
      },
      {
        "name": "Dynamo Kyiv",
        "shortName": "DYK",
        "city": "Kiev",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 71750000,
        "reputation": 85,
        "fans": 78500
      },
      {
        "name": "SC Dnipro-1",
        "shortName": "DNI",
        "city": "Dnipró",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 66250000,
        "reputation": 84,
        "fans": 74000
      },
      {
        "name": "Zorya Luhansk",
        "shortName": "ZOR",
        "city": "Lugansk",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 61000000,
        "reputation": 82,
        "fans": 69500
      },
      {
        "name": "Vorskla Poltava",
        "shortName": "VOR",
        "city": "Poltava",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 55750000,
        "reputation": 81,
        "fans": 65000
      },
      {
        "name": "Kryvbas",
        "shortName": "KRY",
        "city": "Krivói Rog",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 50750000,
        "reputation": 80,
        "fans": 60500
      },
      {
        "name": "Oleksandriya",
        "shortName": "OLE",
        "city": "Oleksandría",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 46000000,
        "reputation": 79,
        "fans": 56000
      },
      {
        "name": "Polissya Zhytomyr",
        "shortName": "POL",
        "city": "Zhytómyr",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 41250000,
        "reputation": 77,
        "fans": 52000
      },
      {
        "name": "Kolos Kovalivka",
        "shortName": "KOL",
        "city": "Kovalivka",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 36750000,
        "reputation": 76,
        "fans": 48000
      },
      {
        "name": "Rukh Lviv",
        "shortName": "RUK",
        "city": "Leópolis",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 32500000,
        "reputation": 74,
        "fans": 44000
      },
      {
        "name": "Veres Rivne",
        "shortName": "VER",
        "city": "Rivne",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 28500000,
        "reputation": 73,
        "fans": 40000
      },
      {
        "name": "Chornomorets Odesa",
        "shortName": "CHO",
        "city": "Odesa",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 24750000,
        "reputation": 71,
        "fans": 36500
      },
      {
        "name": "Obolon Kyiv",
        "shortName": "OBO",
        "city": "Kiev",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 21500000,
        "reputation": 70,
        "fans": 33500
      },
      {
        "name": "LNZ Cherkasy",
        "shortName": "LNZ",
        "city": "Cherkasy",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 18250000,
        "reputation": 68,
        "fans": 30000
      },
      {
        "name": "Inhulets",
        "shortName": "INH",
        "city": "Petrove",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 15750000,
        "reputation": 66,
        "fans": 27500
      },
      {
        "name": "Livyi Bereh",
        "shortName": "LIV",
        "city": "Kiev",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 14250000,
        "reputation": 64,
        "fans": 25500
      }
    ]
  },
  {
    "name": "Allsvenskan",
    "shortName": "Sweden",
    "country": "Suecia",
    "countryCode": "SE",
    "tier": 1,
    "leagueStrength": 74,
    "teams": [
      {
        "name": "Malmö FF",
        "shortName": "MFF",
        "city": "Malmö",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#009CDB",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 75500000,
        "reputation": 86,
        "fans": 83000
      },
      {
        "name": "AIK",
        "shortName": "AIK",
        "city": "Estocolmo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 70000000,
        "reputation": 85,
        "fans": 78500
      },
      {
        "name": "Djurgårdens IF",
        "shortName": "DIF",
        "city": "Estocolmo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 64500000,
        "reputation": 83,
        "fans": 73500
      },
      {
        "name": "Hammarby IF",
        "shortName": "HIF",
        "city": "Estocolmo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 59500000,
        "reputation": 82,
        "fans": 69000
      },
      {
        "name": "IFK Göteborg",
        "shortName": "IFG",
        "city": "Gotemburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 54250000,
        "reputation": 81,
        "fans": 64500
      },
      {
        "name": "IF Elfsborg",
        "shortName": "ELF",
        "city": "Borås",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 49500000,
        "reputation": 79,
        "fans": 60000
      },
      {
        "name": "BK Häcken",
        "shortName": "HAC",
        "city": "Gotemburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 44750000,
        "reputation": 78,
        "fans": 56000
      },
      {
        "name": "IFK Norrköping",
        "shortName": "IFN",
        "city": "Norrköping",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 40250000,
        "reputation": 77,
        "fans": 51500
      },
      {
        "name": "Kalmar FF",
        "shortName": "KFF",
        "city": "Kalmar",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 35750000,
        "reputation": 75,
        "fans": 47500
      },
      {
        "name": "Mjällby AIF",
        "shortName": "MAI",
        "city": "Hällevik",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 31750000,
        "reputation": 74,
        "fans": 43500
      },
      {
        "name": "Halmstads BK",
        "shortName": "HBK",
        "city": "Halmstad",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 27750000,
        "reputation": 73,
        "fans": 40000
      },
      {
        "name": "IFK Värnamo",
        "shortName": "VNM",
        "city": "Värnamo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 24250000,
        "reputation": 71,
        "fans": 36500
      },
      {
        "name": "GAIS",
        "shortName": "GAIS",
        "city": "Gotemburgo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 20750000,
        "reputation": 70,
        "fans": 33000
      },
      {
        "name": "IF Brommapojkarna",
        "shortName": "BP",
        "city": "Estocolmo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 17750000,
        "reputation": 68,
        "fans": 30000
      },
      {
        "name": "IK Sirius",
        "shortName": "SIR",
        "city": "Uppsala",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 15500000,
        "reputation": 66,
        "fans": 27000
      },
      {
        "name": "Västerås SK",
        "shortName": "VSK",
        "city": "Västerås",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 13750000,
        "reputation": 64,
        "fans": 25000
      }
    ]
  },
  {
    "name": "Serbian SuperLiga",
    "shortName": "Serbia",
    "country": "Serbia",
    "countryCode": "RS",
    "tier": 1,
    "leagueStrength": 72,
    "teams": [
      {
        "name": "Crvena zvezda",
        "shortName": "CZV",
        "city": "Belgrado",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 71500000,
        "reputation": 85,
        "fans": 82500
      },
      {
        "name": "Partizan",
        "shortName": "PAR",
        "city": "Belgrado",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#000000",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 66250000,
        "reputation": 84,
        "fans": 78000
      },
      {
        "name": "FK Vojvodina",
        "shortName": "VOJ",
        "city": "Novi Sad",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 61250000,
        "reputation": 83,
        "fans": 73000
      },
      {
        "name": "TSC Bačka Topola",
        "shortName": "TSC",
        "city": "Bačka Topola",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 56250000,
        "reputation": 81,
        "fans": 68500
      },
      {
        "name": "FK Čukarički",
        "shortName": "CUK",
        "city": "Belgrado",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 51500000,
        "reputation": 80,
        "fans": 64000
      },
      {
        "name": "Radnički 1923",
        "shortName": "R23",
        "city": "Kragujevac",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 46750000,
        "reputation": 79,
        "fans": 59500
      },
      {
        "name": "FK Napredak",
        "shortName": "NAP",
        "city": "Kruševac",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 42250000,
        "reputation": 77,
        "fans": 55500
      },
      {
        "name": "Spartak Subotica",
        "shortName": "SPK",
        "city": "Subotica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 38000000,
        "reputation": 76,
        "fans": 51000
      },
      {
        "name": "Mladost Lučani",
        "shortName": "MLA",
        "city": "Lučani",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 34000000,
        "reputation": 75,
        "fans": 47000
      },
      {
        "name": "Radnik Surdulica",
        "shortName": "RAD",
        "city": "Surdulica",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#000000",
        "isUserClub": false,
        "budget": 30000000,
        "reputation": 73,
        "fans": 43000
      },
      {
        "name": "FK IMT",
        "shortName": "IMT",
        "city": "Belgrado",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 26250000,
        "reputation": 72,
        "fans": 39500
      },
      {
        "name": "Železničar Pančevo",
        "shortName": "ZEL",
        "city": "Pančevo",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 22750000,
        "reputation": 70,
        "fans": 36000
      },
      {
        "name": "OFK Beograd",
        "shortName": "OFK",
        "city": "Belgrado",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 19750000,
        "reputation": 69,
        "fans": 32500
      },
      {
        "name": "Novi Pazar",
        "shortName": "NPZ",
        "city": "Novi Pazar",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17000000,
        "reputation": 67,
        "fans": 29500
      },
      {
        "name": "Tekstilac",
        "shortName": "TEK",
        "city": "Odžaci",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 14500000,
        "reputation": 65,
        "fans": 26500
      },
      {
        "name": "FK Jedinstvo",
        "shortName": "JED",
        "city": "Ub",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 13000000,
        "reputation": 63,
        "fans": 24500
      }
    ]
  },
  {
    "name": "Ekstraklasa",
    "shortName": "Poland",
    "country": "Polonia",
    "countryCode": "PL",
    "tier": 1,
    "leagueStrength": 74,
    "teams": [
      {
        "name": "Lech Poznań",
        "shortName": "LEC",
        "city": "Poznań",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 75500000,
        "reputation": 86,
        "fans": 83000
      },
      {
        "name": "Legia Warszawa",
        "shortName": "LEG",
        "city": "Varsovia",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 70500000,
        "reputation": 85,
        "fans": 79000
      },
      {
        "name": "Jagiellonia Białystok",
        "shortName": "JAG",
        "city": "Białystok",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFE600",
        "isUserClub": false,
        "budget": 65750000,
        "reputation": 84,
        "fans": 75000
      },
      {
        "name": "Raków Częstochowa",
        "shortName": "RAK",
        "city": "Częstochowa",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 61250000,
        "reputation": 83,
        "fans": 70500
      },
      {
        "name": "Pogoń Szczecin",
        "shortName": "POG",
        "city": "Szczecin",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 56750000,
        "reputation": 81,
        "fans": 66500
      },
      {
        "name": "Górnik Zabrze",
        "shortName": "GOR",
        "city": "Zabrze",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 52250000,
        "reputation": 80,
        "fans": 63000
      },
      {
        "name": "Cracovia",
        "shortName": "CRA",
        "city": "Cracovia",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 48000000,
        "reputation": 79,
        "fans": 59000
      },
      {
        "name": "Widzew Łódź",
        "shortName": "WID",
        "city": "Łódź",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 44000000,
        "reputation": 78,
        "fans": 55000
      },
      {
        "name": "Śląsk Wrocław",
        "shortName": "SLA",
        "city": "Breslavia",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 40000000,
        "reputation": 77,
        "fans": 51500
      },
      {
        "name": "Piast Gliwice",
        "shortName": "PIA",
        "city": "Gliwice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#E2001A",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 36000000,
        "reputation": 75,
        "fans": 48000
      },
      {
        "name": "Korona Kielce",
        "shortName": "KOR",
        "city": "Kielce",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 32500000,
        "reputation": 74,
        "fans": 44500
      },
      {
        "name": "Radomiak Radom",
        "shortName": "RAD",
        "city": "Radom",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 29000000,
        "reputation": 73,
        "fans": 41000
      },
      {
        "name": "Zagłębie Lubin",
        "shortName": "ZAG",
        "city": "Lubin",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#E2001A",
        "isUserClub": false,
        "budget": 25500000,
        "reputation": 72,
        "fans": 38000
      },
      {
        "name": "GKS Katowice",
        "shortName": "GKS",
        "city": "Katowice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFE600",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 22500000,
        "reputation": 70,
        "fans": 34500
      },
      {
        "name": "Motor Lublin",
        "shortName": "MOT",
        "city": "Lublin",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#FFFFFF",
        "secondaryColor": "#003DA5",
        "isUserClub": false,
        "budget": 19750000,
        "reputation": 69,
        "fans": 32000
      },
      {
        "name": "Stal Mielec",
        "shortName": "STA",
        "city": "Mielec",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#003DA5",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 17250000,
        "reputation": 67,
        "fans": 29000
      },
      {
        "name": "Lechia Gdańsk",
        "shortName": "LGD",
        "city": "Gdańsk",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 15250000,
        "reputation": 66,
        "fans": 27000
      },
      {
        "name": "Puszcza Niepołomice",
        "shortName": "PUS",
        "city": "Niepołomice",
        "sofascoreId": null,
        "badge": "⚽",
        "primaryColor": "#008542",
        "secondaryColor": "#FFFFFF",
        "isUserClub": false,
        "budget": 13750000,
        "reputation": 64,
        "fans": 25000
      }
    ]
  }
];


// ─── E4: Generación y desarrollo de jugadores 2.0 ──────────────────────────────────────────

function gaussianRand(mean: number, stdev: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
  return z * stdev + mean;
}

const FIRST_NAMES: Record<string, string[]> = {
  'España': ['Antonio', 'Manuel', 'Jose', 'Francisco', 'David', 'Juan', 'Javier', 'Carlos', 'Alejandro', 'Daniel', 'Pedro', 'Pablo'],
  'Brasil': ['Lucas', 'Mateus', 'Gabriel', 'Rafael', 'Pedro', 'Marcos', 'Thiago', 'Felipe', 'Joao', 'Marcelo'],
  'Argentina': ['Juan', 'Jose', 'Diego', 'Carlos', 'Luis', 'Facundo', 'Matias', 'Lautaro', 'Julian', 'Enzo'],
  'Francia': ['Jean', 'Pierre', 'Michel', 'Alain', 'Claude', 'Nicolas', 'Kylian', 'Antoine', 'Olivier', 'Hugo'],
  'Alemania': ['Thomas', 'Michael', 'Andreas', 'Peter', 'Daniel', 'Lukas', 'Leon', 'Joshua', 'Manuel', 'Florian'],
  'Portugal': ['Joao', 'Antonio', 'Francisco', 'Manuel', 'Jose', 'Cristiano', 'Bruno', 'Bernardo', 'Ruben', 'Diogo'],
  'Italia': ['Giuseppe', 'Giovanni', 'Antonio', 'Mario', 'Luigi', 'Francesco', 'Alessandro', 'Lorenzo', 'Federico', 'Marco'],
  'Inglaterra': ['John', 'David', 'Michael', 'James', 'William', 'Harry', 'Jack', 'Phil', 'Bukayo', 'Jude'],
  'Países Bajos': ['Johannes', 'Jan', 'Cornelis', 'Dirk', 'Hendrik', 'Frenkie', 'Virgil', 'Memphis', 'Cody', 'Matthijs'],
  'Uruguay': ['Jose', 'Luis', 'Juan', 'Carlos', 'Luis', 'Federico', 'Darwin', 'Ronald', 'Manuel', 'Facundo']
};

const LAST_NAMES: Record<string, string[]> = {
  'España': ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín'],
  'Brasil': ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes'],
  'Argentina': ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Álvarez'],
  'Francia': ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau'],
  'Alemania': ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann'],
  'Portugal': ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Jesus', 'Sousa'],
  'Italia': ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco'],
  'Inglaterra': ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies', 'Robinson', 'Wright'],
  'Países Bajos': ['De Jong', 'Jansen', 'De Vries', 'Van den Berg', 'Van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'De Boer'],
  'Uruguay': ['Rodríguez', 'Gómez', 'González', 'Martínez', 'García', 'Fernández', 'López', 'Pérez', 'Silva', 'Díaz']
};

function generateSquad(reputation: number, clubCountry: string) {
  // Max 30 players
  const size = Math.floor(Math.random() * 11) + 20; // 20 to 30
  
  const basePositions = [
    'PO', 'PO', 'PO', 'LD', 'LD', 'LI', 'LI', 'DFC', 'DFC', 'DFC', 'DFC',
    'PIV', 'PIV', 'MC', 'MC', 'MC', 'MCO', 'MCO', 'MD', 'MD', 'MI', 'MI',
    'EXT DERECHA', 'EXT IZQ', 'DC', 'DC', 'DC', 'DC', 'DFC', 'MC'
  ];
  
  // Pick `size` positions, guaranteeing at least 2 PO and diverse squad
  const positions = basePositions.slice(0, size);
  
  const defaultNationalities = Object.keys(FIRST_NAMES);
  const defaultFlags = ['🇪🇸','🇧🇷','🇦🇷','🇫🇷','🇩🇪','🇵🇹','🇮🇹','🏴','🇳🇱','🇺🇾'];
  
  // Adjusted baseline: rep 95 -> base ~82
  const base = Math.round(reputation * 0.86);

  return positions.map((pos, i) => {
    // 1. Edades estrictamente 17 a 30
    let age = Math.round(gaussianRand(23.5, 3.5));
    if (age < 17) age = 17;
    if (age > 30) age = 30;

    let ageFactor = 0;
    if (age < 21) ageFactor = - (21 - age); 
    else if (age >= 25 && age <= 28) ageFactor = 2; // Prime

    const attrBaseRaw = gaussianRand(base + ageFactor, 4);
    const attrBase = Math.min(95, Math.max(30, Math.round(attrBaseRaw)));

    const isGK = pos === 'PO';
    
    // 4. Nacionalidad y Nombre (70% nativos)
    const isNative = Math.random() < 0.7;
    let nationality = clubCountry;
    let flag = '🌍';
    let countryKey = clubCountry;
    
    const natIdx = defaultNationalities.indexOf(clubCountry);
    if (natIdx >= 0) flag = defaultFlags[natIdx];
    
    if (!isNative) {
       const ri = Math.floor(Math.random() * defaultNationalities.length);
       nationality = defaultNationalities[ri];
       flag = defaultFlags[ri];
       countryKey = nationality;
    }

    const firstNamesList = FIRST_NAMES[countryKey] || FIRST_NAMES['Inglaterra'];
    const lastNamesList = LAST_NAMES[countryKey] || LAST_NAMES['Inglaterra'];
    
    const fName = firstNamesList[Math.floor(Math.random() * firstNamesList.length)];
    const lName = lastNamesList[Math.floor(Math.random() * lastNamesList.length)];
    const fullName = `${fName} ${lName}`;
    
    const isStarter = i < 11;

    const contractYears = 1 + Math.floor(Math.random() * 4);
    const contractEndAt = new Date(INITIAL_IN_GAME_DATE);
    contractEndAt.setUTCFullYear(contractEndAt.getUTCFullYear() + contractYears);

    const lastTransferYears = Math.floor(Math.random() * 3);
    const lastTransferAt = new Date(INITIAL_IN_GAME_DATE);
    lastTransferAt.setUTCFullYear(lastTransferAt.getUTCFullYear() - lastTransferYears);

    // 5. WT1 · Posición detallada + atributos repartidos por PESOS (§1.1):
    //    más puntos en habilidades de peso 3, menos en 2, residual en 1/—, con
    //    varianza para híbridos. El string legacy `pos` se conserva en position.
    const detailed: DetailedPosition = pos === 'MC'
      ? (i % 2 === 0 ? 'ORG' : 'BOX')                      // variedad: organizadores y box-to-box
      : pos === 'DC' && i % 2 === 1
        ? 'F9'                                             // variedad: algún falso 9/segundo punta
        : deriveDetailedPosition({ position: pos, squadNumber: i + 1 });
    const sk = generateSkillsFor(detailed, attrBase, Math.random);
    const tkl = sk.tackling;
    const pas = sk.passing;
    const org = sk.organization;
    const sht = sk.shooting;
    const fin = sk.finishing;
    const drb = sk.dribbling;
    const unm = sk.unmarking;

    const phys = Math.min(95, Math.max(20, attrBase + (25 - Math.abs(age - 25))*0.2)); // Más joven y prime = más físico
    const gk = isGK ? Math.min(95, Math.max(30, attrBase + 10)) : sk.goalkeeping;

    // Potencial decrece con la edad
    const rawPotential = attrBase + Math.max(0, (28 - age) * gaussianRand(1.2, 0.5));
    const potential = Math.min(99, Math.max(attrBase, Math.round(rawPotential)));

    return {
      name:         fullName,
      age,
      nationality,
      flag,
      position:     pos,
      detailedPosition: detailed,   // WT1: nace ya con posición detallada
      squadNumber:  i + 1,

      passing:      Math.round(pas),
      tackling:     Math.round(tkl),
      shooting:     Math.round(sht),
      organization: Math.round(org),
      unmarking:    Math.round(unm),
      finishing:    Math.round(fin),
      dribbling:    Math.round(drb),
      fouls:        sk.fouls,       // WT1: peso bajo generalizado + outliers especialistas
      goalkeeping:  Math.round(gk),
      reflexes:     isGK ? Math.max(40, Math.min(99, Math.round(gk * 0.92 + gaussianRand(0, 4)))) : 50,
      
      speed:        isGK ? 40 : Math.round(phys),
      defending:    Math.round(tkl),
      physical:     Math.round(phys),
      
      fitness:      85 + Math.floor(Math.random() * 15),
      morale:       70 + Math.floor(Math.random() * 25),
      experience:   Math.min(99, 10 + Math.max(0, (age - 16) * 3) + Math.floor(Math.random() * 10)),
      talent:       Math.min(5, Math.max(1, Math.round(gaussianRand(3, 1)))),
      potential:    potential,
      
      salary:       Math.round(attrBase * 100 * (1 + Math.random())),
      contractYears,
      contractStartAt: INITIAL_IN_GAME_DATE,
      contractEndAt,
      marketValue:  Math.round(attrBase * 20000 * (0.5 + Math.random())),
      lastTransferAt,
      lastTransferValue: Math.round(attrBase * 15000 * (0.5 + Math.random())),
      
      mentality:    ['Ofensiva', 'Defensiva', 'Equilibrada', 'Competitiva', 'Relajada'][Math.floor(Math.random() * 5)],
      personality:  ['Profesional', 'Ambicioso', 'Temperamental', 'Líder', 'Normal'][Math.floor(Math.random() * 5)],
      affinityGroup: ['Líderes', 'Jóvenes', 'Veteranos', 'Extranjeros', 'Locales'][Math.floor(Math.random() * 5)],
      preferredFoot: Math.random() > 0.2 ? 'Right' : 'Left',
      injuryProneness: Math.max(0, Math.min(100, Math.floor(gaussianRand(30, 20)))),
      consistency:  Math.max(1, Math.min(99, Math.floor(gaussianRand(60, 15)))),
      preferredPosition: pos,
      wage:         Math.round(attrBase * 100 * (1 + Math.random())),
      releaseClause: Math.round(attrBase * 100 * (1 + Math.random())) * 100,
      isStarter,
    };
  });
}

// ─── Generate league fixtures (round-robin) ───────────────────────────────────
function generateFixtures(clubIds: number[]): Array<{ home: number; away: number; matchday: number }> {
  const n       = clubIds.length;
  const fixtures: Array<{ home: number; away: number; matchday: number }> = [];
  const ids     = [...clubIds];

  for (let round = 0; round < (n - 1) * 2; round++) {
    const matchday = round + 1;
    const half     = n / 2;
    for (let i = 0; i < half; i++) {
      const homeIdx = i;
      const awayIdx = n - 1 - i;
      const isSecondHalf = round >= n - 1;
      fixtures.push({
        home:     isSecondHalf ? ids[awayIdx] : ids[homeIdx],
        away:     isSecondHalf ? ids[homeIdx] : ids[awayIdx],
        matchday,
      });
    }
    const last = ids.pop()!;
    ids.splice(1, 0, last);
  }
  return fixtures;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function deriveTeamEconomy(leagueStrength: number, index: number, teamCount: number) {
  const rankFactor = teamCount <= 1 ? 1 : 1 - index / Math.max(1, teamCount - 1);
  const reputation = clampInt(leagueStrength - 12 + rankFactor * 10, 45, 96);
  const budget = Math.round((leagueStrength * 650000 + rankFactor * leagueStrength * 700000) / 500000) * 500000;
  const fans = clampInt(22000 + leagueStrength * 350 + rankFactor * leagueStrength * 450, 18000, 95000);
  return { reputation, budget, fans };
}

function normalizeSeedLeague(raw: any): SeedLeague | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.teams)) return null;
  const leagueStrength = clampInt(Number(raw.leagueStrength ?? 70), 1, 100);
  const teams = raw.teams.map((team: any, index: number) => {
    const derived = deriveTeamEconomy(leagueStrength, index, raw.teams.length);
    const sofascoreId = Number.isSafeInteger(Number(team.sofascoreId)) ? Number(team.sofascoreId) : null;
    const badge = typeof team.badge === 'string' && team.badge
      ? team.badge
      : (sofascoreId ? `https://cdn.sofascore.com/api/v1/team/${sofascoreId}/image` : '');
    return {
      name: String(team.name ?? `Club ${index + 1}`),
      shortName: String(team.shortName ?? team.name ?? `C${index + 1}`).slice(0, 12),
      city: String(team.city ?? raw.country ?? 'Ciudad FDF'),
      sofascoreId,
      badge,
      primaryColor: typeof team.primaryColor === 'string' ? team.primaryColor : null,
      secondaryColor: typeof team.secondaryColor === 'string' ? team.secondaryColor : null,
      isUserClub: Boolean(team.isUserClub),
      budget: Number.isFinite(Number(team.budget)) ? Number(team.budget) : derived.budget,
      reputation: Number.isFinite(Number(team.reputation)) ? Number(team.reputation) : derived.reputation,
      fans: Number.isFinite(Number(team.fans)) ? Number(team.fans) : derived.fans,
    } satisfies SeedTeam;
  });
  return {
    name: String(raw.name ?? 'Liga FDF'),
    shortName: String(raw.shortName ?? raw.name ?? 'Liga').slice(0, 24),
    country: String(raw.country ?? 'FDF'),
    countryCode: typeof raw.countryCode === 'string' ? raw.countryCode : undefined,
    tier: Number.isFinite(Number(raw.tier)) ? Number(raw.tier) : 1,
    leagueStrength,
    status: typeof raw.status === 'string' ? raw.status : 'OPEN',
    teams,
  };
}

function loadSeedLeagues(): SeedLeague[] {
  const candidates = [
    path.resolve(__dirname, '../../../../docs/data/leagues-2026.json'),
    path.resolve(__dirname, '../../../docs/data/leagues-2026.json'),
    path.resolve(process.cwd(), '../docs/data/leagues-2026.json'),
    path.resolve(process.cwd(), '../../docs/data/leagues-2026.json'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const rawLeagues = Array.isArray(parsed) ? parsed : parsed.leagues;
      if (!Array.isArray(rawLeagues)) continue;
      const normalized = rawLeagues
        .map(normalizeSeedLeague)
        .filter((league: SeedLeague | null): league is SeedLeague => !!league && league.teams.length > 0);
      if (normalized.length > 0) {
        console.log(`  ✅ Seed ligas desde ${file}: ${normalized.length} ligas / ${normalized.reduce((sum, l) => sum + l.teams.length, 0)} clubes`);
        return normalized;
      }
    } catch (error) {
      console.warn(`  ⚠️ No se pudo leer ${file}; uso fallback incrustado.`, error);
    }
  }
  console.warn(`  ⚠️ docs/data/leagues-2026.json no disponible; uso fallback incrustado de ${leagues.length} ligas.`);
  return leagues;
}

function continentShard(countryCode?: string, country?: string): string {
  const code = String(countryCode ?? '').toUpperCase();
  if (['AR', 'BR', 'CL', 'CO', 'MX', 'US'].includes(code)) return 'americas';
  if (['JP', 'KR', 'SA', 'CN'].includes(code)) return 'asia';
  if (['EG', 'MA', 'ZA'].includes(code)) return 'africa';
  if (['AU'].includes(code)) return 'oceania';
  const normalized = String(country ?? '').toLowerCase();
  if (/(brasil|argentina|méxico|mexico|chile|colombia|estados unidos)/.test(normalized)) return 'americas';
  if (/(japón|japon|corea|arabia|china)/.test(normalized)) return 'asia';
  if (/(egipto|marruecos|sudáfrica|sudafrica)/.test(normalized)) return 'africa';
  return 'europe';
}

// ─── Main seed ────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding database...');

  // ── Global Settings (Etapa 0) ───────────────────────────────────────────────
  await prisma.globalSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      turnHours: "[11, 23]",
      economyModifier: 1.0,
      maintenanceMode: false,
      featureFlags: "{}"
    }
  });
  console.log('  ✅ Global Settings created');

  // ── Master user (mitoh96@gmail.com) — no reimpone rol/password ────────────
  await seedUserFromEnv({
    label: 'Master',
    envKey: 'MASTER_PASSWORD',
    where: { email: 'mitoh96@gmail.com' },
    create: { username: 'jaime', email: 'mitoh96@gmail.com', role: 'master' },
  });

  // ── Agentes FIFA (Pilar 2) ──────────────────────────────────────────────────
  const agent1User = await seedUserFromEnv({
    label: 'Agente FIFA 1',
    envKey: 'FIFA_PASSWORD',
    where: { email: 'agente1@fdf.com' },
    create: { username: 'agente1', email: 'agente1@fdf.com', role: 'agente_fifa' },
  });
  const agent1 = agent1User
    ? await prisma.agent.upsert({
      where: { userId: agent1User.id },
      update: {},
      create: { userId: agent1User.id, reputation: 80 }
    })
    : null;

  const agent2User = await seedUserFromEnv({
    label: 'Agente FIFA 2',
    envKey: 'FIFA_PASSWORD',
    where: { email: 'agente2@fdf.com' },
    create: { username: 'agente2', email: 'agente2@fdf.com', role: 'agente_fifa' },
  });
  const agent2 = agent2User
    ? await prisma.agent.upsert({
      where: { userId: agent2User.id },
      update: {},
      create: { userId: agent2User.id, reputation: 60 }
    })
    : null;
  const agentIds = [agent1?.id, agent2?.id].filter((id): id is number => Number.isInteger(id));
  console.log(`  ✅ Agentes FIFA disponibles: ${agentIds.length}`);


  // Admin user
  await seedUserFromEnv({
    label: 'Admin',
    envKey: 'ADMIN_PASSWORD',
    where: { username: 'admin' },
    create: { username: 'admin', email: 'admin@footballmanager.local', role: 'admin' },
  });

  // Example FIFA agent
  await seedUserFromEnv({
    label: 'Agente FIFA ejemplo',
    envKey: 'FIFA_PASSWORD',
    where: { username: 'agente_fifa_1' },
    create: { username: 'agente_fifa_1', email: 'fifa1@footballmanager.local', role: 'agente_fifa' },
  });

  // Demo manager
  const demoUser = await seedUserFromEnv({
    label: 'Mánager demo',
    envKey: 'DEMO_PASSWORD',
    where: { username: 'ragnar' },
    create: { username: 'ragnar', email: 'ragnar@footballmanager.local', role: 'manager' },
  });

  // Season
  const season = await prisma.season.upsert({
    where:  { id: 1 },
    update: {},
    create: { name: '2024-25', year: 2024, isActive: true },
  });

  // Game state
  await prisma.gameState.upsert({
    where:  { id: 1 },
    update: {},
    create: { seasonId: season.id, week: 1, phase: 'regular', isActive: true, inGameDate: INITIAL_IN_GAME_DATE },
  });

  // Seed Leagues, Clubs, Squads, Matches
  const seedLeagues = loadSeedLeagues();
  for (const league of seedLeagues) {
    console.log(`\n🏆 Generando ${league.name} (${league.teams.length} equipos)...`);
    
    const existingComp = await prisma.competition.findFirst({
      where: {
        seasonId: season.id,
        name: league.name,
        country: league.country,
        type: 'league',
        tier: league.tier,
      },
    });
    
    if (existingComp) {
      console.log(`    ⚠️  La competición ${league.name} ya existe. Omitiendo...`);
      continue;
    }

    const competition = await prisma.competition.create({
      data: {
        seasonId:  season.id,
        name:      league.name,
        shortName: league.shortName,
        type:      'league',
        country:   league.country,
        tier:      league.tier,
        humanStatus: ['OPEN', 'WAITLIST', 'CLOSED'].includes(String(league.status ?? '').toUpperCase())
          ? String(league.status).toUpperCase()
          : 'OPEN',
        defaultSimulationTier: league.leagueStrength >= 90 ? 'A' : league.leagueStrength >= 74 ? 'B' : 'C',
        activityScore: league.leagueStrength,
        processingShard: `${continentShard(league.countryCode, league.country)}-${league.countryCode ?? league.country}-${league.tier}`,
      },
    });

    const clubIds: number[] = [];

    for (const team of league.teams) {
      const fallbackColors = getColorsFromBadge(team.badge, team.name);
      const primaryColor = team.primaryColor ?? fallbackColors.primaryColor;
      const secondaryColor = team.secondaryColor ?? fallbackColors.secondaryColor;

      const club = await prisma.club.create({
        data: {
          name:            team.name,
          shortName:       team.shortName,
          badge:           team.badge,
          primaryColor,
          secondaryColor,
          city:            team.city,
          country:         league.country,
          budget:          team.budget,
          cash:            team.budget,
          stadiumName:     `Estadio ${team.name}`,
          stadiumCapacity: team.fans > 0 ? Math.round(team.fans * 1.1) : 30000,
          reputation:      team.reputation,
          fans:            team.fans,
          isUserClub:      team.isUserClub ?? false,
          fdfValuation:    team.reputation * 1.5,
          socialMass:      team.fans,
          highClass:       Math.round(team.fans * 0.05),
          countryLevel:    league.leagueStrength >= 85 ? 1 : league.leagueStrength >= 70 ? 2 : 3,
        },
      });
      clubIds.push(club.id);

      // Create ClubKit (Home)
      await prisma.clubKit.create({
        data: {
          clubId: club.id,
          kind: 'HOME',
          colors: JSON.stringify([primaryColor, secondaryColor]),
          pattern: 'solid',
          sponsorName: 'Kelme'
        }
      });

      // Add Stadium
      await prisma.stadium.create({
        data: {
          clubId: club.id,
          capacity: club.stadiumCapacity,
        }
      });
      // Add Staff
      const staff = await prisma.staff.create({
        data: { clubId: club.id }
      });
      await prisma.staffMember.create({
        data: {
          staffId: staff.id,
          role: 'EntrenadorPrincipal',
          attributes: JSON.stringify({tactics: 10, motivation: 10}),
          salary: 50000,
        }
      });

      // If it's Barcelona (user club), assign the manager when DEMO_PASSWORD was provided.
      if (team.isUserClub && demoUser) {
        await prisma.manager.upsert({
          where:  { userId: demoUser.id },
          update: { clubId: club.id },
          create: {
            userId: demoUser.id,
            name:   'Ragnar Lodbrok',
            clubId: club.id,
            mentality: 'Ofensiva',
            affinityGroup: 'Jóvenes'
          },
        });
        console.log(`    👔 Asignado manager a ${team.name}`);
      } else if (team.isUserClub) {
        console.log(`    ⚠️ ${team.name} queda sin manager demo: falta DEMO_PASSWORD`);
      }

      const squad = generateSquad(team.reputation, league.country);
      await prisma.player.createMany({
        data: squad.map(p => ({ ...p, clubId: club.id })),
      });
      
      await prisma.standing.create({
        data: { competitionId: competition.id, clubId: club.id },
      });

      // Pilar 1: Youth Academy & Youth Players
      const academy = await prisma.youthAcademy.create({
        data: {
          clubId: club.id,
          level: Math.max(1, Math.round(team.reputation / 20)),
          facilities: Math.max(1, Math.round(team.reputation / 20)),
          budget: team.budget * 0.05,
        }
      });
      
      const youthPlayers = Array.from({ length: 3 }).map(() => ({
        youthAcademyId: academy.id,
        age: 15 + Math.floor(Math.random() * 3), // 15-17
        talent: 1 + Math.floor(Math.random() * 5),
        potential: 60 + Math.floor(Math.random() * 35),
        preferredFoot: Math.random() > 0.2 ? 'Right' : 'Left',
        attributes: JSON.stringify({ speed: 40, shooting: 40 }),
      }));
      await prisma.youthPlayer.createMany({ data: youthPlayers });

      // Pilar 2: Transfer Listings & Agents
      // Put 1 random player on TransferListing
      const squadForClub = await prisma.player.findMany({ where: { clubId: club.id }, take: 22 });
      if (squadForClub.length > 0) {
        const randomPlayer = squadForClub[Math.floor(Math.random() * squadForClub.length)];
        await prisma.transferListing.create({
          data: {
            playerId: randomPlayer.id,
            price: randomPlayer.marketValue * 1.2,
            type: 'transfer'
          }
        });
        await prisma.player.update({
          where: { id: randomPlayer.id },
          data: { isForSale: true, salePrice: Math.round(randomPlayer.marketValue * 1.2) }
        });
        
        // Randomly assign agents to 5 players in the squad when FIFA env created agents.
        if (agentIds.length > 0) {
          for (let k = 0; k < 5; k++) {
            const p = squadForClub[k];
            const agentId = agentIds[Math.floor(Math.random() * agentIds.length)];
            try {
              await prisma.agentRepresentation.create({
                data: { agentId, playerId: p.id, commission: 0.1 }
              });
            } catch {
              // ignore duplicates
            }
          }
        }
      }

    }

    console.log(`    ✅ ${clubIds.length} equipos y sus plantillas de 22 jugadores generados`);

    // Idempotencia: limpia jornadas/partidos previos de esta competición para no
    // duplicar el calendario si el seed se ejecuta más de una vez.
    const existingMds = await prisma.matchday.findMany({
      where: { competitionId: competition.id }, select: { id: true },
    });
    if (existingMds.length > 0) {
      const mdIds = existingMds.map((m) => m.id);
      await prisma.match.deleteMany({ where: { matchdayId: { in: mdIds } } });
      await prisma.matchday.deleteMany({ where: { id: { in: mdIds } } });
    }

    const fixtures = generateFixtures(clubIds);
    const matchdayCache: Record<number, number> = {};

    for (const fix of fixtures) {
      if (!matchdayCache[fix.matchday]) {
        const md = await prisma.matchday.create({
          data: { competitionId: competition.id, number: fix.matchday, status: 'pending' },
        });
        matchdayCache[fix.matchday] = md.id;
      }

      const weather = getRandomWeather();
      await prisma.match.create({
        data: {
          matchdayId: matchdayCache[fix.matchday],
          homeClubId: fix.home,
          awayClubId: fix.away,
          status:     'scheduled',
          weatherCondition: weather.weatherCondition,
          temperature:      weather.temperature,
        },
      });
    }
    const numMatchdays = Object.keys(matchdayCache).length;
    console.log(`    ✅ Calendario de ${numMatchdays} jornadas (${fixtures.length} partidos) creado`);
  }

  
  // ─── Generate Real Cups & European Competitions ────────────────────────────────
  console.log('\n🏆 Generando Copas Reales y Competiciones Europeas...');

  const cupDefs = [
    { name: 'Copa del Rey', shortName: 'CDR', country: 'España' },
    { name: 'FA Cup', shortName: 'FAC', country: 'Inglaterra' },
    { name: 'Coppa Italia', shortName: 'CITA', country: 'Italia' }
  ];

  for (const def of cupDefs) {
    const existing = await prisma.competition.findFirst({ where: { seasonId: season.id, name: def.name } });
    if (!existing) {
      const cupComp = await prisma.competition.create({
        data: {
          seasonId: season.id,
          name: def.name,
          shortName: def.shortName,
          type: 'cup',
          country: def.country,
          format: 'knockout'
        }
      });

      const leagues = await prisma.competition.findMany({ where: { country: def.country, type: 'league' } });
      const compIds = leagues.map(c => c.id);
      if (compIds.length > 0) {
        const standings = await prisma.standing.findMany({ where: { competitionId: { in: compIds } }, select: { clubId: true } });
        const clubIds = standings.map(s => s.clubId);

        const md = await prisma.matchday.create({
          data: { competitionId: cupComp.id, number: 1, type: 'round_of_16', isKnockout: true, status: 'pending' },
        });

        const matchups = generateKnockoutBracket(clubIds);
        for (const match of matchups) {
          const weather = getRandomWeather();
          await prisma.match.create({
            data: {
              matchdayId: md.id,
              homeClubId: match.home,
              awayClubId: match.away,
              status: 'scheduled',
              weatherCondition: weather.weatherCondition,
              temperature: weather.temperature,
              isKnockout: true,
              round: 'round_of_16',
              leg: 1
            },
          });
        }
        console.log(`    ✅ ${def.name} generada con ${matchups.length} partidos.`);
      }
    }
  }

  // European Competitions
  const euroDefs = [
    { name: 'UEFA Champions League', shortName: 'UCL', tier: 1 },
    { name: 'UEFA Europa League', shortName: 'UEL', tier: 2 },
    { name: 'UEFA Conference League', shortName: 'UECL', tier: 3 }
  ];

  // Get top clubs by reputation
  const allClubs = await prisma.club.findMany({ orderBy: { reputation: 'desc' } });
  
  let clubIndex = 0;
  for (const def of euroDefs) {
    const existing = await prisma.competition.findFirst({ where: { seasonId: season.id, name: def.name } });
    if (!existing) {
      const euroComp = await prisma.competition.create({
        data: {
          seasonId: season.id,
          name: def.name,
          shortName: def.shortName,
          type: 'league_phase',
          country: 'Europa',
          tier: def.tier,
          format: 'swiss_36',
          isContinental: true
        }
      });

      const euroClubs = allClubs.slice(clubIndex, clubIndex + 36);
      clubIndex += 36;
      
      for (const club of euroClubs) {
        await prisma.standing.create({
          data: { competitionId: euroComp.id, clubId: club.id },
        });
      }

      const matchesPerTeam = def.shortName === 'UECL' ? 6 : 8;
      const fixtures = generateSwissFixtures(euroClubs.map(c => c.id), matchesPerTeam);
      
      const matchdayCache: Record<number, number> = {};
      for (const fix of fixtures) {
        if (!matchdayCache[fix.matchday]) {
          const md = await prisma.matchday.create({
            data: { competitionId: euroComp.id, number: fix.matchday, type: 'league_phase', status: 'pending' },
          });
          matchdayCache[fix.matchday] = md.id;
        }

        const weather = getRandomWeather();
        await prisma.match.create({
          data: {
            matchdayId: matchdayCache[fix.matchday],
            homeClubId: fix.home,
            awayClubId: fix.away,
            status: 'scheduled',
            weatherCondition: weather.weatherCondition,
            temperature: weather.temperature,
          },
        });
      }
      console.log(`    ✅ ${def.name} (Swiss-36) generada con ${fixtures.length} partidos.`);
    }
  }

  // Supercopas
  const superCup = await prisma.competition.findFirst({ where: { seasonId: season.id, name: 'Supercopa de Europa' } });
  if (!superCup) {
    const scComp = await prisma.competition.create({
      data: {
        seasonId: season.id,
        name: 'Supercopa de Europa',
        shortName: 'USC',
        type: 'supercup',
        country: 'Europa',
        format: 'knockout',
        isContinental: true
      }
    });
    // Pick the top 2 clubs
    if (allClubs.length >= 2) {
      const md = await prisma.matchday.create({
        data: { competitionId: scComp.id, number: 1, type: 'final', isKnockout: true, status: 'pending' },
      });
      const weather = getRandomWeather();
      await prisma.match.create({
        data: {
          matchdayId: md.id,
          homeClubId: allClubs[0].id,
          awayClubId: allClubs[1].id,
          status: 'scheduled',
          weatherCondition: weather.weatherCondition,
          temperature: weather.temperature,
          isKnockout: true,
          round: 'final',
          leg: 1
        },
      });
      console.log(`    ✅ Supercopa de Europa generada.`);
    }
  }

  // Pilar 2: Free Agents pool
  console.log('🏆 Generando Agentes Libres...');
  const existingFA = await prisma.player.findFirst({ where: { clubId: null } });
  if (existingFA) {
    console.log(`    ⚠️  Agentes libres ya existen. Omitiendo...`);
  } else {
    const freeAgentsCount = 15;
    const freeAgentsSquad = generateSquad(60, 'España').slice(0, freeAgentsCount);
    for (const fa of freeAgentsSquad) {
      const p = await prisma.player.create({
        data: {
          ...fa,
          clubId: null, // Free agent
          marketValue: fa.marketValue * 0.5,
          wage: fa.salary * 0.8,
        }
      });
      // Assign an agent
      if (agentIds.length > 0) {
        const agentId = agentIds[Math.floor(Math.random() * agentIds.length)];
        await prisma.agentRepresentation.create({
          data: { agentId, playerId: p.id, commission: 0.15 }
        });
      }
    }
    console.log(`  ✅ ${freeAgentsCount} agentes libres creados y asignados a agentes`);
  }


  // ── Pilar 1: Historia, Palmarés y Objetivos de Junta ──────────────────────
  console.log('🏆 Generando Historia y Objetivos de Junta...');
  const allClubsForSquads = await prisma.club.findMany();
  const allComps = await prisma.competition.findMany();
  for (const club of allClubsForSquads) {
    // BoardObjective
    const objType = 'liga';
    let targetPos = 10;
    if (club.reputation > 85) targetPos = 1;
    else if (club.reputation > 70) targetPos = 4;
    else if (club.reputation > 50) targetPos = 8;
    else targetPos = 17; // avoid relegation

    await prisma.boardObjective.create({
      data: {
        clubId: club.id,
        season: '2025/2026',
        type: objType,
        targetPosition: targetPos
      }
    });

    await prisma.boardConfidence.create({
      data: { clubId: club.id, level: 50 + Math.round(Math.random() * 30) }
    });

    // SeasonHistory for last season (2024/2025)
    // Find competition for this club tier
    const comp = allComps.find(c => c.country === club.country && c.tier === (club.reputation > 80 ? 1 : 2));
    if (comp) {
       await prisma.seasonHistory.upsert({
         where: {
           clubId_competitionId_season: {
             clubId: club.id,
             competitionId: comp.id,
             season: '2024/2025',
           },
         },
         update: {},
         create: {
           clubId: club.id,
           competitionId: comp.id,
           season: '2024/2025',
           position: Math.max(1, Math.round(Math.random() * 20)),
           points: 40 + Math.round(Math.random() * 50)
         }
       });
    }

    // Records
    await prisma.clubRecord.create({
      data: { clubId: club.id, recordType: 'HighestTransferFee', value: club.budget * 0.1 }
    });
  }

  // Add an Honour to the biggest clubs
  const topClubs = await prisma.club.findMany({ orderBy: { reputation: 'desc' }, take: 5 });
  for (const c of topClubs) {
     await prisma.honour.create({
       data: { name: 'Campeón Liga 24/25', season: '2024/2025', clubId: c.id }
     });
  }
  console.log('  ✅ Historia y Objetivos generados');

  // ── Pilar 2: Selecciones y Ranking ──────────────────────────────────────────
  console.log('🌍 Generando Selecciones y Convocatorias...');
  const defaultNationalities = ['España','Brasil','Argentina','Francia','Alemania','Portugal','Italia','Inglaterra','Países Bajos','Uruguay'];
  
  for (let i = 0; i < defaultNationalities.length; i++) {
    const nat = defaultNationalities[i];
    
    // Ensure Country exists
    const country = await prisma.country.upsert({
      where: { name: nat },
      update: {},
      create: { name: nat, level: 3 }
    });

    // Ensure NationalTeam
    const nt = await prisma.nationalTeam.upsert({
      where: { countryId: country.id },
      update: {},
      create: { countryId: country.id, rankingPoints: 1000 + Math.round(Math.random() * 500) }
    });

    // Ranking Snapshot
    await prisma.nationalRanking.create({
      data: { nationalTeamId: nt.id, points: nt.rankingPoints, position: i + 1 }
    });

    // Call up top 23 players
    const topPlayers = await prisma.player.findMany({
      where: { nationality: nat },
      orderBy: { marketValue: 'desc' },
      take: 23
    });

    if (topPlayers.length > 0) {
      const callUps = topPlayers.map(p => ({
        nationalTeamId: nt.id,
        playerId: p.id,
        season: '2025/2026'
      }));
      await prisma.callUp.createMany({ data: callUps, skipDuplicates: true });
    }
  }
  console.log('  ✅ Selecciones, Ranking y Convocatorias creadas');


  // ── Pilar 1 y 2: Prensa, Árbitros, Premios y Rivalidades ──────────────────
  console.log('🏆 Generando Capa Institucional (Prensa, Árbitros, Premios)...');

  // Árbitros
  const refereeNames = ['Mateu Lahoz', 'Pierluigi Collina', 'Howard Webb', 'Felix Brych', 'Björn Kuipers'];
  for (const rName of refereeNames) {
    await prisma.referee.create({
      data: { name: rName, strictness: 40 + Math.floor(Math.random() * 50) }
    });
  }

  // Rivalidades
  const barca = await prisma.club.findFirst({ where: { name: 'FC Barcelona' } });
  const madrid = await prisma.club.findFirst({ where: { name: 'Real Madrid' } });
  if (barca && madrid) {
    await prisma.rivalry.create({
      data: { name: 'El Clásico', intensity: 100, clubAId: barca.id, clubBId: madrid.id }
    });
  }

  // Premios Históricos
  const bestPlayer = await prisma.player.findFirst({ orderBy: { marketValue: 'desc' } });
  if (bestPlayer) {
    await prisma.award.create({
      data: { name: 'Balón de Oro', type: 'player', season: '2024/2025', winnerPlayerId: bestPlayer.id }
    });
    await prisma.award.create({
      data: { name: 'MVP Temporada', type: 'player', season: '2024/2025', winnerPlayerId: bestPlayer.id }
    });
  }
  
  if (madrid) {
    await prisma.honour.create({
      data: { name: 'Campeón de Liga', season: '2024/2025', clubId: madrid.id }
    });
    const laliga = await prisma.competition.findFirst({ where: { name: 'LaLiga' } });
    if (laliga) {
      await prisma.seasonHistory.create({
        data: { clubId: madrid.id, competitionId: laliga.id, season: '2024/2025', position: 1, points: 95 }
      });
      if (barca) {
        await prisma.seasonHistory.create({
          data: { clubId: barca.id, competitionId: laliga.id, season: '2024/2025', position: 2, points: 85 }
        });
      }
    }
  }

  // Prensa y Noticias para el manager
  
  const firstManager = await prisma.manager.findFirst();
  if (firstManager) {
    await prisma.news.create({
      data: {
        type: 'board',
        subject: 'Bienvenido al club',
        body: 'La directiva confía en usted para lograr los objetivos de la temporada.',
        recipientId: firstManager.id
      }
    });
  }


  await prisma.pressItem.create({
    data: { headline: '¡Arranca una nueva temporada llena de emociones!', content: 'Todos los equipos parten de cero.' }
  });

  console.log('  ✅ Capa institucional generada');

  console.log('\n🎉 Seed complete!');



  console.log('   Demo login: ragnar / demo1234');
  console.log('   Admin login: admin / admin1234');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
