// ─── Onboarding Routes ───────────────────────────────────────────────────────
// Tras registrarse, el manager elige un club libre. En el FDF original esto
// depende del prestigio (prestige 0 = clubes modestos). Exponemos clubes
// libres filtrables por mapa/liga y devolvemos los bloqueados con su motivo.

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import prisma from '../../db/prisma';
import { managerService } from '../manager/manager.service';

const chooseSchema = z.object({
  clubId: z.number().int().positive(),
  nationality: z.string().min(2).max(50),
  personality: z.string().min(2).max(50),
});

const emptyToUndefined = (value: unknown) => value === '' ? undefined : value;
const freeClubsQuerySchema = z.object({
  league: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  country: z.preprocess(emptyToUndefined, z.string().trim().min(2).max(60).optional()),
  take: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(80).optional()),
  includeLocked: z.string().optional(),
});

function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value == null) return fallback;
  return ['1', 'true', 'yes', 'si', 'sí'].includes(value.toLowerCase());
}

function onboardingAccess(club: { reputation: number }, prestige: number) {
  const requiredPrestige = Math.max(0, Math.ceil(club.reputation - 70));
  const canChoose = prestige >= requiredPrestige;
  return {
    canChoose,
    locked: !canChoose,
    requiredPrestige,
    prestigeGap: Math.max(0, requiredPrestige - prestige),
    chooseEndpoint: '/api/onboarding/choose-club',
    requiredFields: ['clubId', 'nationality', 'personality'],
  };
}

function onboardingVacancyView<T extends { status: string; reason: string }>(
  vacancy: T,
  access: { canChoose: boolean; requiredPrestige: number },
) {
  if (!access.canChoose) {
    return {
      ...vacancy,
      status: 'locked',
      reason: `Necesitas ${access.requiredPrestige} de prestigio para elegir este club.`,
    };
  }
  return {
    ...vacancy,
    status: 'onboarding_open',
    reason: 'Disponible para empezar carrera desde el onboarding.',
  };
}

export async function onboardingRoutes(app: FastifyInstance) {
  // GET /api/onboarding/guide
  // Contrato para cuentas nuevas: estado, siguiente ruta y endpoints necesarios.
  app.get('/guide', { preHandler: [authenticate] }, async (request, reply) => {
    const manager = await prisma.manager.findUnique({
      where: { userId: request.user.userId },
      select: {
        id: true,
        name: true,
        clubId: true,
        tutorialStep: true,
        tutorialCompleted: true,
        tutorialSkipped: true,
        prestige: true,
        club: { select: { id: true, name: true, shortName: true, badge: true } },
        contracts: {
          orderBy: { id: 'desc' },
          take: 1,
          select: { objective: true, season: true },
        },
      },
    });
    if (!manager) return reply.code(404).send({ error: 'Perfil de mánager no encontrado' });

    const tutorial = await managerService.getTutorial(manager.id);
    const tutorialClosed = manager.tutorialCompleted || manager.tutorialSkipped;
    const nextStep = tutorialClosed ? null : tutorial.steps.find((step) => step.step > manager.tutorialStep) ?? null;
    return reply.send({
      manager: {
        id: manager.id,
        name: manager.name,
        prestige: manager.prestige,
        club: manager.club,
        hasClub: manager.clubId != null,
        seasonObjective: manager.contracts[0]?.objective ?? null,
        objectiveSeason: manager.contracts[0]?.season ?? null,
      },
      state: {
        needsClubChoice: manager.clubId == null,
        tutorialStep: manager.tutorialStep,
        tutorialCompleted: manager.tutorialCompleted,
        tutorialSkipped: manager.tutorialSkipped,
      },
      recommendedRoute: manager.clubId == null ? '/onboarding' : nextStep?.route ?? '/home',
      nextStep,
      tutorial,
      clubChoice: {
        source: 'world_map_and_leagues',
        explanation: 'El prestigio abre clubes de mayor reputación; los bloqueados se devuelven con requiredPrestige/prestigeGap.',
        filters: ['league', 'country', 'take'],
      },
      checklist: [
        { key: 'choose_club', done: manager.clubId != null, route: '/onboarding' },
        { key: 'review_squad', done: manager.tutorialStep >= 3 || manager.tutorialCompleted, route: '/squad' },
        { key: 'set_tactics', done: manager.tutorialStep >= 4 || manager.tutorialCompleted, route: '/tactics' },
        { key: 'start_training', done: manager.tutorialStep >= 5 || manager.tutorialCompleted, route: '/training' },
        { key: 'open_match_center', done: manager.tutorialStep >= 6 || manager.tutorialCompleted, route: '/matches' },
      ],
      endpoints: {
        freeClubs: '/api/onboarding/free-clubs?league=&country=&take=',
        chooseClub: '/api/onboarding/choose-club',
        tutorial: '/api/manager/tutorial',
        publicWorld: '/api/public/world/continents',
      },
      uiNeed: '// NECESITO: Antigravity debe abrir ruta guiada para cuentas nuevas usando recommendedRoute/checklist.',
    });
  });

  // GET /api/onboarding/free-clubs
  // Devuelve clubes libres desde mapa/ligas: elegibles en `clubs` y cerrados
  // por prestigio en `blockedClubs`, sin mezclar ambos flujos.
  app.get<{
    Querystring: { league?: string; country?: string; take?: string; includeLocked?: string };
  }>('/free-clubs', { preHandler: [authenticate] }, async (request, reply) => {
    const query = freeClubsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.issues[0]?.message ?? 'Parámetros no válidos' });
    }

    // Solo los managers sin club acceden a esta lista.
    const manager = await prisma.manager.findUnique({
      where:  { userId: request.user.userId },
      select: { id: true, clubId: true, prestige: true },
    });

    if (!manager) {
      return reply.code(404).send({ error: 'Perfil de mánager no encontrado' });
    }
    if (manager.clubId != null) {
      return reply.code(409).send({ error: 'Ya diriges un club' });
    }

    const activeSeason = await prisma.season.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    if (!activeSeason) {
      return reply.send({
        clubs: [],
        blockedClubs: [],
        summary: { managerPrestige: manager.prestige, eligible: 0, locked: 0, explanation: 'No hay temporada activa.' },
        pagination: { take: 0, returned: 0 },
      });
    }

    const take = query.data.take ?? 24;
    const includeLocked = parseBooleanFlag(query.data.includeLocked, true);
    const rows = await prisma.standing.findMany({
      where: {
        competition: {
          seasonId: activeSeason.id,
          type: 'league',
          ...(query.data.league ? { id: query.data.league } : {}),
          ...(query.data.country ? { country: query.data.country } : {}),
        },
        club: { manager: null, isUserClub: false },
      },
      orderBy: [{ club: { reputation: 'asc' } }, { clubId: 'asc' }],
      take: Math.min(120, take * 3),
      include: {
        competition: { select: { id: true, name: true, shortName: true, country: true, tier: true } },
        club: {
          select: {
            id: true,
            name: true,
            shortName: true,
            badge: true,
            city: true,
            country: true,
            budget: true,
            stadiumName: true,
            stadiumCapacity: true,
            reputation: true,
            fans: true,
            primaryColor: true,
            secondaryColor: true,
          },
        },
      },
    });

    const vacancyByClub = await managerService.evaluateVacanciesForClubs(manager.id, rows.map((row) => row.clubId));
    const decorated = rows
      .map((row) => {
        const vacancy = vacancyByClub.get(row.clubId);
        if (!vacancy) return null;
        const onboarding = onboardingAccess(row.club, manager.prestige);
        return {
          ...row.club,
          league: row.competition,
          vacancy: onboardingVacancyView(vacancy, onboarding),
          onboarding,
        };
      })
      .filter((club): club is NonNullable<typeof club> => club != null);

    const eligible = decorated.filter((club) => club.onboarding.canChoose).slice(0, take);
    const blocked = includeLocked ? decorated.filter((club) => club.onboarding.locked).slice(0, take) : [];

    return reply.send({
      clubs: eligible,
      blockedClubs: blocked,
      summary: {
        managerPrestige: manager.prestige,
        eligible: eligible.length,
        locked: blocked.length,
        filters: {
          league: query.data.league ?? null,
          country: query.data.country ?? null,
        },
        explanation: 'clubs contiene solo equipos elegibles; blockedClubs explica los equipos cerrados por prestigio.',
      },
      pagination: { take, scanned: rows.length, returned: eligible.length },
    });
  });

  // POST /api/onboarding/choose-club { clubId }
  app.post('/choose-club', { preHandler: [authenticate] }, async (request, reply) => {
    const body = chooseSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'Validation failed' });
    }

    const manager = await prisma.manager.findUnique({
      where: { userId: request.user.userId },
      select: {
        id: true,
        clubId: true,
        prestige: true,
        tutorialStep: true,
        tutorialCompleted: true,
        tutorialSkipped: true,
      },
    });
    if (!manager) return reply.code(404).send({ error: 'Mánager no encontrado' });
    if (manager.clubId != null) {
      return reply.code(409).send({ error: 'Ya diriges un club' });
    }

    // Verificar que el club está libre.
    const club = await prisma.club.findUnique({
      where:   { id: body.data.clubId },
      include: { manager: true },
    });
    if (!club)           return reply.code(404).send({ error: 'Club no encontrado' });
    if (club.manager)    return reply.code(409).send({ error: 'El club ya tiene mánager' });
    if (club.isUserClub) return reply.code(409).send({ error: 'El club ya tiene mánager' });

    const vacancy = await managerService.getVacancyForClub(manager.id, club.id);
    const onboarding = onboardingAccess(club, manager.prestige);
    if (onboarding.locked) {
      return reply.code(403).send({
        error: `Necesitas ${onboarding.requiredPrestige} de prestigio para elegir este club.`,
        code: 'prestige_locked',
        vacancy: onboardingVacancyView(vacancy, onboarding),
        onboarding,
      });
    }

    // Asignar club reutilizando la contratación transaccional común: crea contrato
    // y mantiene consistentes club anterior, vacantes y candidaturas.
    const hiring = await managerService.hireManagerAtClub(manager.id, club.id);
    await prisma.manager.update({
      where: { id: manager.id },
      data: {
        nationality: body.data.nationality,
        personality: body.data.personality,
      },
    });
    const tutorial = await managerService.updateTutorial(manager.id, {
      tutorialStep: Math.max(manager.tutorialStep, 1),
    });

    const updatedClub = await prisma.club.findUnique({
      where: { id: club.id },
      select: { id: true, name: true, shortName: true, badge: true },
    });
    if (!updatedClub) return reply.code(500).send({ error: 'No se pudo confirmar el club' });

    // Re-emitir token con el nuevo clubId para que las siguientes peticiones
    // pasen las comprobaciones de pertenencia al club.
    const token = app.jwt.sign(
      {
        userId:    request.user.userId,
        managerId: manager.id,
        clubId:    updatedClub.id,
        username:  request.user.username,
        role:      request.user.role,
        // AUDIT 3.3: conserva la tokenVersion vigente (evita re-login auto-infligido).
        tokenVersion: request.user.tokenVersion ?? 0,
      },
      { expiresIn: '30d' },
    );

    return reply.send({
      token,
      manager: { id: manager.id, clubId: updatedClub.id },
      hiring,
      tutorial,
      club:    {
        id:        updatedClub.id,
        name:      updatedClub.name,
        shortName: updatedClub.shortName,
        badge:     updatedClub.badge,
      },
    });
  });
}
