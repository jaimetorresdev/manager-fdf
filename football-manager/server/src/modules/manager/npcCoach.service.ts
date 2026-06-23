import prisma from '../../db/prisma';
import { buildNpcCoachProfile } from './npcCoach';

type ClubLike = {
  id: number;
  name: string;
  shortName?: string | null;
  city?: string | null;
  country?: string | null;
  reputation?: number | null;
  budget?: number | null;
};

type StoredProfile = ReturnType<typeof buildNpcCoachProfile>;

function monthsBetween(from: Date, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

function parseProfileJson(raw: string): StoredProfile['tacticalStyle'] & { pressLine?: string } {
  try {
    return JSON.parse(raw) as StoredProfile['tacticalStyle'] & { pressLine?: string };
  } catch {
    return {} as StoredProfile['tacticalStyle'] & { pressLine?: string };
  }
}

function serializeCoach(row: {
  id: string;
  name: string;
  nationality: string;
  avatarSeed: string;
  profileJson: string;
  tenureStartedAt: Date;
  previousClubs: number;
  promotions: number;
  careerStage: string;
  currentClubId: number | null;
  currentClub?: { id: number; name: string } | null;
  careerEntries?: { id: number; clubId: number; clubName: string; season: string | null; event: string; note: string | null; createdAt: Date }[];
}, club?: ClubLike) {
  const stored = parseProfileJson(row.profileJson);
  const monthsInCharge = monthsBetween(row.tenureStartedAt);
  return {
    id: row.id,
    isNpc: true as const,
    name: row.name,
    nationality: row.nationality,
    avatarSeed: row.avatarSeed,
    clubId: row.currentClubId ?? club?.id,
    clubName: row.currentClub?.name ?? club?.name,
    status: 'npc_active',
    tacticalStyle: {
      favoriteFormation: stored.favoriteFormation ?? '4-4-2',
      formationName: stored.formationName,
      formationStyle: stored.formationStyle,
      physicalDemand: stored.physicalDemand,
      strengths: stored.strengths,
      weaknesses: stored.weaknesses,
      objective: stored.objective ?? 'equilibrado',
      tacticDefaults: stored.tacticDefaults ?? {
        construction: 50,
        destruction: 50,
        pressing: 50,
        tempo: 50,
        width: 50,
        mentality: 50,
        marking: 'zonal',
      },
    },
    career: {
      stage: row.careerStage,
      currentTenureMonths: monthsInCharge,
      monthsInCharge,
      previousClubs: row.previousClubs,
      promotions: row.promotions,
      sackRisk: row.careerStage === 'emergente' ? 'alto' : row.careerStage === 'competitivo' ? 'medio' : 'bajo',
      dismissalRisk: row.careerStage === 'emergente' ? 'alto' : row.careerStage === 'competitivo' ? 'medio' : 'bajo',
      canBeHiredAway: row.careerStage !== 'emergente',
      canBeSacked: true,
      nextCareerCheck: 'season_rollover',
      history: (row.careerEntries ?? []).map((entry) => ({
        id: entry.id,
        clubId: entry.clubId,
        clubName: entry.clubName,
        season: entry.season,
        event: entry.event,
        note: entry.note,
        at: entry.createdAt,
      })),
    },
    pressLine: stored.pressLine ?? `${row.name} dirige con pragmatismo.`,
  };
}

async function recordCareerEntry(npcCoachId: string, data: {
  clubId: number;
  clubName: string;
  season?: string;
  event: string;
  note?: string;
}) {
  return prisma.npcCoachCareerEntry.create({
    data: {
      npcCoachId,
      clubId: data.clubId,
      clubName: data.clubName,
      season: data.season,
      event: data.event,
      note: data.note,
    },
  });
}

async function createPressHeadline(headline: string, content: string) {
  const exists = await prisma.pressItem.findFirst({ where: { headline }, select: { id: true } });
  if (exists) return;
  await prisma.pressItem.create({ data: { headline, content } });
}

export const npcCoachService = {
  serializeCoach,

  async ensureForClub(club: ClubLike) {
    const existing = await prisma.npcCoach.findUnique({
      where: { currentClubId: club.id },
      include: {
        currentClub: { select: { id: true, name: true } },
        careerEntries: { orderBy: { createdAt: 'desc' }, take: 8 },
      },
    });
    if (existing) return serializeCoach(existing, club);

    const generated = buildNpcCoachProfile(club);
    const row = await prisma.npcCoach.create({
      data: {
        id: generated.id,
        currentClubId: club.id,
        name: generated.name,
        nationality: generated.nationality,
        avatarSeed: generated.avatarSeed,
        profileJson: JSON.stringify({
          ...generated.tacticalStyle,
          pressLine: generated.pressLine,
        }),
        careerStage: generated.career.stage,
        previousClubs: generated.career.previousClubs,
        promotions: generated.career.promotions,
      },
      include: {
        currentClub: { select: { id: true, name: true } },
        careerEntries: true,
      },
    });
    const season = await prisma.season.findFirst({ where: { isActive: true }, select: { name: true } });
    await recordCareerEntry(row.id, {
      clubId: club.id,
      clubName: club.name,
      season: season?.name,
      event: 'appointed',
      note: `Fichado por ${club.shortName ?? club.name}`,
    });
    const refreshed = await prisma.npcCoach.findUniqueOrThrow({
      where: { id: row.id },
      include: {
        currentClub: { select: { id: true, name: true } },
        careerEntries: { orderBy: { createdAt: 'desc' }, take: 8 },
      },
    });
    return serializeCoach(refreshed, club);
  },

  async resolveForClub(club: ClubLike & { manager?: { id: number } | null }) {
    if (club.manager) return null;
    return this.ensureForClub(club);
  },

  /** Listas públicas: perfil persistido si existe; si no, determinista en memoria. */
  async resolveForClubLite(club: ClubLike & { manager?: { id: number } | null }) {
    if (club.manager) return null;
    const existing = await prisma.npcCoach.findUnique({
      where: { currentClubId: club.id },
      include: {
        currentClub: { select: { id: true, name: true } },
        careerEntries: { orderBy: { createdAt: 'desc' }, take: 4 },
      },
    });
    if (existing) return serializeCoach(existing, club);
    return buildNpcCoachProfile(club);
  },

  async resolveManyForClubs(clubs: Array<ClubLike & { manager?: { id: number } | null }>) {
    const vacant = clubs.filter((c) => !c.manager);
    const ids = vacant.map((c) => c.id);
    const rows = ids.length
      ? await prisma.npcCoach.findMany({
          where: { currentClubId: { in: ids } },
          include: {
            currentClub: { select: { id: true, name: true } },
            careerEntries: { orderBy: { createdAt: 'desc' }, take: 4 },
          },
        })
      : [];
    const byClub = new Map(rows.map((r) => [r.currentClubId!, r]));
    const out = new Map<number, ReturnType<typeof serializeCoach> | ReturnType<typeof buildNpcCoachProfile> | null>();
    for (const club of clubs) {
      if (club.manager) {
        out.set(club.id, null);
        continue;
      }
      const row = byClub.get(club.id);
      out.set(club.id, row ? serializeCoach(row, club) : buildNpcCoachProfile(club));
    }
    return out;
  },

  async getPublicProfile(npcCoachId: string) {
    const row = await prisma.npcCoach.findUnique({
      where: { id: npcCoachId },
      include: {
        currentClub: { select: { id: true, name: true, shortName: true, badge: true, country: true, reputation: true } },
        careerEntries: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!row) throw new Error('Entrenador NPC no encontrado');
    return serializeCoach(row, row.currentClub ?? undefined);
  },

  async releaseOnHumanHire(clubId: number, clubName: string) {
    const coach = await prisma.npcCoach.findUnique({ where: { currentClubId: clubId } });
    if (!coach) return;
    const season = await prisma.season.findFirst({ where: { isActive: true }, select: { name: true } });
    await prisma.$transaction([
      prisma.npcCoach.update({
        where: { id: coach.id },
        data: { currentClubId: null, status: 'replaced', previousClubs: { increment: 1 } },
      }),
      prisma.npcCoachCareerEntry.create({
        data: {
          npcCoachId: coach.id,
          clubId,
          clubName,
          season: season?.name,
          event: 'replaced',
          note: 'La directiva contrató a un mánager humano',
        },
      }),
    ]);
    await createPressHeadline(
      `${coach.name} deja el banquillo de ${clubName}`,
      'La junta ha optado por un perfil humano en el cargo técnico.',
    );
  },

  async runSeasonCareerReview(seasonId: number, seasonName: string) {
    const vacantClubs = await prisma.club.findMany({
      where: { manager: null },
      select: { id: true, name: true, shortName: true, city: true, country: true, reputation: true, budget: true },
    });
    let sacks = 0;
    for (const club of vacantClubs) {
      const coach = await prisma.npcCoach.findUnique({ where: { currentClubId: club.id } });
      if (!coach) {
        await this.ensureForClub(club);
        continue;
      }
      const standing = await prisma.standing.findFirst({
        where: { clubId: club.id, competition: { seasonId, type: 'league' } },
        include: { competition: { select: { id: true } } },
      });
      if (!standing) continue;

      const standings = await prisma.standing.findMany({
        where: { competitionId: standing.competitionId },
        orderBy: [{ points: 'desc' }, { goalsFor: 'desc' }],
        select: { clubId: true, points: true, goalsFor: true, goalsAgainst: true },
      });
      const position = standings.findIndex((s) => s.clubId === club.id) + 1;
      const total = standings.length || 20;
      const inRelegation = position > total - 3;
      const wonLeague = position === 1;
      const tenureMonths = monthsBetween(coach.tenureStartedAt);
      const sackRoll = (club.id * 31 + seasonId) % 100;
      const shouldSack = inRelegation && sackRoll < 55 && tenureMonths >= 6;

      if (wonLeague) {
        await prisma.npcCoach.update({
          where: { id: coach.id },
          data: { careerStage: 'consagrado', promotions: { increment: 1 } },
        });
        await recordCareerEntry(coach.id, {
          clubId: club.id,
          clubName: club.name,
          season: seasonName,
          event: 'title',
          note: 'Campeón de liga',
        });
        await createPressHeadline(
          `${coach.name}, héroe en ${club.shortName ?? club.name}`,
          'La prensa sitúa al técnico NPC como figura del curso.',
        );
        continue;
      }

      if (shouldSack) {
        await prisma.$transaction([
          prisma.npcCoach.update({
            where: { id: coach.id },
            data: { currentClubId: null, status: 'sacked', previousClubs: { increment: 1 } },
          }),
          prisma.npcCoachCareerEntry.create({
            data: {
              npcCoachId: coach.id,
              clubId: club.id,
              clubName: club.name,
              season: seasonName,
              event: 'sacked',
              note: `Despedido tras quedar ${position}º`,
            },
          }),
        ]);
        await createPressHeadline(
          `${club.shortName ?? club.name} despide a ${coach.name}`,
          `La junta ha cortado el ciclo del entrenador tras la ${position}ª posición.`,
        );
        await this.ensureForClub(club);
        sacks++;
      }
    }
    return { sacks };
  },

  /** N4-4 · Plan condicional por defecto para NPC en eliminatorias */
  knockoutConditionalSubs(matchId: number, clubId: number) {
    const seed = (matchId * 17 + clubId) % 100;
    return [{
      condition: 'losing' as const,
      fromMin: 75,
      changes: {
        mentality: 78 + (seed % 12),
        pressing: 62 + (seed % 18),
        construction: 56,
        destruction: 42,
        offensiveStyle: 'direct',
      },
    }];
  },

  async recentCareerEvents(take = 6) {
    const rows = await prisma.npcCoachCareerEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take,
      include: { npcCoach: { select: { id: true, name: true } } },
    });
    return rows.map((row) => ({
      id: `npc-career-${row.id}`,
      type: 'npc_coach' as const,
      createdAt: row.createdAt,
      headline: row.event === 'sacked'
        ? `${row.npcCoach.name} sale de ${row.clubName}`
        : row.event === 'appointed'
          ? `${row.npcCoach.name} firma por ${row.clubName}`
          : row.event === 'title'
            ? `${row.npcCoach.name} celebra título en ${row.clubName}`
            : `${row.npcCoach.name} · ${row.clubName}`,
      detail: row.note ?? 'Movimiento en el mercado de banquillos',
      route: `/npc-coach/${row.npcCoach.id}`,
      payload: { npcCoachId: row.npcCoach.id, clubId: row.clubId, event: row.event },
    }));
  },
};
