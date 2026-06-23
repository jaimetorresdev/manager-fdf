// ─── QW-10 · Luces de la Ciudad / menú vivo ──────────────────────────────────
// GET /api/dashboard/zone-badges — novedades por ZONA del juego para que la
// Ciudad FDF encienda luces y el menú muestre badges. Contrato en
// server/API_UI.md §BloqueQ (11 jun, tarde). Reglas deterministas sobre datos
// existentes; reaprovecha resolveSince (while-away) y getPromotableYouth
// (advisor) para que el criterio sea ÚNICO en todo el juego.
import { FastifyInstance } from 'fastify';
import prisma from '../../db/prisma';
import { authenticate } from '../../middleware/auth';
import { resolveSince } from './whileaway.routes';
import { shouldHideResult } from '../matches/matchEventVisibility';
import { getPromotableYouth, advisorService } from '../club/advisor.service';
import { publicService } from '../public/public.service';
import { fansService } from '../fans/fans.service';
import { managerService } from '../manager/manager.service';
import { getMatchPreview } from '../matches/matchExperience.service';

type ZoneBadge = { count: number; reasons: string[] };
type ShellMode = 'normal' | 'matchday' | 'crisis' | 'euphoria';
type MatchPreviewPayload = Awaited<ReturnType<typeof getMatchPreview>>;

type ChecklistItem = {
  key: string;
  urgent: boolean;
  title: string;
  detail: string;
  cta: { label: string; route: string };
};

const COMPETITION_INCOME_PREFIX = 'compincome';

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`;
}

function seasonMatchWhere(seasonId?: number | null) {
  return seasonId ? { matchday: { competition: { seasonId } } } : {};
}

async function filterTickerForE15<T extends { id: string }>(
  items: T[],
  clubId: number | null,
  userId: number,
): Promise<T[]> {
  if (!clubId) return items;
  const resultIds = [...new Set(items
    .map((item) => /^tk-result-(\d+)$/.exec(item.id)?.[1])
    .filter((id): id is string => Boolean(id))
    .map(Number)
    .filter(Number.isSafeInteger))];
  if (resultIds.length === 0) return items;

  const [matches, seenRows] = await Promise.all([
    prisma.match.findMany({
      where: { id: { in: resultIds } },
      select: {
        id: true,
        status: true,
        homeClubId: true,
        awayClubId: true,
        homeStatsJson: true,
      },
    }),
    prisma.matchSeen.findMany({
      where: { userId, matchId: { in: resultIds } },
      select: { matchId: true },
    }),
  ]);
  const seenIds = new Set(seenRows.map((row) => row.matchId));
  const hiddenIds = new Set(matches
    .filter((match) => shouldHideResult(match, clubId, userId, seenIds.has(match.id)))
    .map((match) => match.id));
  return items.filter((item) => {
    const matchId = Number(/^tk-result-(\d+)$/.exec(item.id)?.[1]);
    return !Number.isSafeInteger(matchId) || !hiddenIds.has(matchId);
  });
}

function momentTitle(kind: string, minute?: number | null) {
  if (kind === 'comeback') return 'Remontada de la jornada';
  if (kind === 'late_goal') return `Gol tardío${minute ? ` en el ${minute}'` : ''}`;
  if (kind === 'penalty_save') return `Penalti parado${minute ? ` en el ${minute}'` : ''}`;
  if (kind === 'debut') return 'Debut de la jornada';
  if (kind === 'save') return 'Parada decisiva';
  return 'Momento de la jornada';
}

async function buildCoverMoment(matchIds: number[]) {
  if (matchIds.length === 0) return null;
  type Candidate = {
    priority: number;
    matchId: number;
    minute: number | null;
    kind: string;
    title: string;
    text: string;
    route: string;
  };
  const candidates: Candidate[] = [];
  const matches = await prisma.match.findMany({
    where: { id: { in: matchIds } },
    include: {
      homeClub: { select: { shortName: true } },
      awayClub: { select: { shortName: true } },
      events: {
        orderBy: { minute: 'asc' },
        include: { player: { select: { id: true, name: true } } },
      },
    },
  });

  const push = (entry: Omit<Candidate, 'title' | 'route'>) => {
    candidates.push({
      ...entry,
      title: momentTitle(entry.kind, entry.minute),
      route: `/matches/${entry.matchId}`,
    });
  };

  for (const match of matches) {
    const goals = match.events.filter((event) => ['goal', 'gol'].includes(event.type));
    let home = 0;
    let away = 0;
    let homeTrailed = false;
    let awayTrailed = false;
    for (const goal of goals) {
      if (home < away) homeTrailed = true;
      if (away < home) awayTrailed = true;
      if (goal.team === 'home') home += 1;
      else away += 1;
    }
    const finalHome = match.homeGoals ?? home;
    const finalAway = match.awayGoals ?? away;
    if (finalHome !== finalAway) {
      const winnerTeam = finalHome > finalAway ? 'home' : 'away';
      const winnerTrailed = winnerTeam === 'home' ? homeTrailed : awayTrailed;
      const winnerClub = winnerTeam === 'home' ? match.homeClub : match.awayClub;
      const comebackGoal = [...goals].reverse().find((event) => event.team === winnerTeam);
      if (winnerTrailed) {
        push({
          priority: 100,
          matchId: match.id,
          minute: comebackGoal?.minute ?? null,
          kind: 'comeback',
          text: `El ${winnerClub.shortName} levantó un partido que se le había puesto cuesta arriba.`,
        });
      }
    }

    for (const goal of goals.filter((event) => event.minute >= 85)) {
      const scorer = goal.player?.name ?? 'un protagonista inesperado';
      push({
        priority: 90,
        matchId: match.id,
        minute: goal.minute,
        kind: 'late_goal',
        text: `${scorer} decidió el partido cuando ya se miraba el reloj.`,
      });
    }

    for (const event of match.events) {
      const description = event.description.toLowerCase();
      if (['save', 'parada'].includes(event.type) && /penal|penalty/.test(description)) {
        push({
          priority: 80,
          matchId: match.id,
          minute: event.minute,
          kind: 'penalty_save',
          text: event.description,
        });
      } else if (['save', 'parada'].includes(event.type)) {
        push({
          priority: 30,
          matchId: match.id,
          minute: event.minute,
          kind: 'save',
          text: event.description,
        });
      } else if (['goal', 'gol'].includes(event.type)) {
        push({
          priority: 25,
          matchId: match.id,
          minute: event.minute,
          kind: 'goal',
          text: event.description,
        });
      }
    }
  }

  const debutStats = await prisma.playerMatchStat.findMany({
    where: { matchId: { in: matchIds }, minutes: { gt: 0 } },
    orderBy: { id: 'asc' },
    take: 20,
    include: { player: { select: { id: true, name: true, age: true } } },
  });
  const debuts = await Promise.all(debutStats.map(async (stat) => ({
    stat,
    previous: await prisma.playerMatchStat.count({
      where: { playerId: stat.playerId, id: { lt: stat.id } },
    }),
  })));
  const debut = debuts.find((row) => row.previous === 0);
  if (debut) {
    push({
      priority: 60,
      matchId: debut.stat.matchId,
      minute: null,
      kind: 'debut',
      text: `${debut.stat.player.name} jugó sus primeros minutos oficiales.`,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority || (b.minute ?? 0) - (a.minute ?? 0) || b.matchId - a.matchId);
  const best = candidates[0];
  if (!best) return null;
  const payload = { ...best } as Partial<Candidate>;
  delete payload.priority;
  return payload;
}

async function buildZoneBadges(input: {
  userId: number;
  managerId: number;
  clubId: number;
  since: Date;
}): Promise<Record<string, ZoneBadge>> {
  const { userId, managerId, clubId, since } = input;
  const [
    pendingOffers,
    newInjuries,
    newSuspensions,
    promotableYouth,
    stadiumNews,
    endingWorks,
    pendingPress,
    unreadNews,
    pendingWeeklyMissions,
    newCompetitionIncomes,
    unreadDms,
  ] = await Promise.all([
    prisma.transferOffer.count({ where: { toClubId: clubId, status: 'pending' } }),
    prisma.injury.count({
      where: { createdAt: { gte: since }, weeksLeft: { gt: 0 }, player: { clubId } },
    }),
    prisma.suspension.count({ where: { createdAt: { gte: since }, player: { clubId } } }),
    getPromotableYouth(clubId),
    prisma.news.count({
      where: { recipientId: managerId, type: 'stadium', createdAt: { gte: since } },
    }),
    prisma.stadiumWork.count({
      where: { monthsRemaining: { lte: 1 }, stadium: { clubId } },
    }),
    prisma.pressQuestion.count({ where: { managerId, answeredAt: null } }),
    prisma.news.count({
      where: { recipientId: managerId, isRead: false, type: { not: 'press_question' } },
    }),
    ((prisma as typeof prisma & { weeklyMission?: { count: (args: unknown) => Promise<number> } }).weeklyMission
      ?.count({ where: { managerId, status: 'pending' } }) ?? Promise.resolve(0)),
    prisma.financeSnapshot.count({
      where: { clubId, season: { startsWith: COMPETITION_INCOME_PREFIX }, createdAt: { gte: since } },
    }),
    prisma.privateMessage.count({ where: { toId: userId, read: false } }),
  ]);

  const zone = (count: number, reasons: string[]): ZoneBadge => ({
    count,
    reasons: count > 0 ? reasons.filter(Boolean) : [],
  });

  return {
    market: zone(pendingOffers, [
      pendingOffers > 0 ? plural(pendingOffers, 'oferta por responder', 'ofertas por responder') : '',
    ]),
    squad: zone(newInjuries + newSuspensions, [
      newInjuries > 0 ? plural(newInjuries, 'lesión nueva', 'lesiones nuevas') : '',
      newSuspensions > 0 ? plural(newSuspensions, 'sanción nueva', 'sanciones nuevas') : '',
    ]),
    academy: zone(promotableYouth.length, [
      promotableYouth.length > 0
        ? plural(promotableYouth.length, 'juvenil listo para subir', 'juveniles listos para subir')
        : '',
    ]),
    stadium: zone(stadiumNews + endingWorks, [
      stadiumNews > 0 ? plural(stadiumNews, 'obra terminada', 'obras terminadas') : '',
      endingWorks > 0 ? plural(endingWorks, 'obra termina este mes', 'obras terminan este mes') : '',
    ]),
    press: zone(pendingPress + unreadNews, [
      pendingPress > 0
        ? plural(pendingPress, 'rueda de prensa sin responder', 'ruedas de prensa sin responder')
        : '',
      unreadNews > 0 ? plural(unreadNews, 'noticia sin leer', 'noticias sin leer') : '',
    ]),
    missions: zone(pendingWeeklyMissions, [
      pendingWeeklyMissions > 0
        ? plural(pendingWeeklyMissions, 'misión semanal en juego', 'misiones semanales en juego')
        : '',
    ]),
    economy: zone(newCompetitionIncomes, [
      newCompetitionIncomes > 0
        ? plural(newCompetitionIncomes, 'premio de competición cobrado', 'premios de competición cobrados')
        : '',
    ]),
    chat: zone(unreadDms, [
      unreadDms > 0 ? plural(unreadDms, 'mensaje sin leer', 'mensajes sin leer') : '',
    ]),
  };
}

function compactBadges(zones: Record<string, ZoneBadge>) {
  return Object.entries(zones)
    .filter(([, badge]) => badge.count > 0)
    .map(([key, badge]) => ({
      key,
      count: badge.count,
      reasons: badge.reasons,
      route: zoneRoute(key),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function zoneRoute(key: string): string {
  const routes: Record<string, string> = {
    market: '/market',
    squad: '/squad',
    academy: '/academy',
    stadium: '/stadium',
    press: '/press',
    missions: '/missions',
    economy: '/economy',
    chat: '/messages',
  };
  return routes[key] ?? '/club';
}

function weatherLabel(condition?: string | null, temperature?: number | null): string {
  const label = condition === 'rain' ? 'lluvia'
    : condition === 'snow' ? 'nieve'
      : condition === 'hot' ? 'calor'
        : 'cielo limpio';
  return typeof temperature === 'number' ? `${label}, ${temperature}º` : label;
}

function shellModeFor(input: {
  hasMatch: boolean;
  pressureLevel?: string | null;
  mood?: 'green' | 'yellow' | 'red' | null;
  moodScore?: number | null;
  urgentCount: number;
}): ShellMode {
  if (input.hasMatch) return 'matchday';
  if (input.pressureLevel === 'crisis' || input.pressureLevel === 'tense' || input.mood === 'red') return 'crisis';
  if ((input.moodScore ?? 0) >= 75 && input.urgentCount === 0) return 'euphoria';
  return 'normal';
}

function matchImportance(preview: MatchPreviewPayload, pressure: { score?: number; level?: string } | null, moodScore: number | null) {
  if (!preview) {
    return { score: 0, label: 'Sin partido inmediato', reasons: [] as string[] };
  }

  const reasons: string[] = [];
  const base = preview.matchCenter?.priorityScore ?? 0;
  let score = base;
  if (preview.rivalry) {
    score += Math.round((preview.rivalry.intensity ?? 50) / 4);
    reasons.push(`${preview.rivalry.name} (${preview.rivalry.intensity}/100)`);
  }
  if (preview.positions?.sameLeague && typeof preview.positions.pointsGap === 'number' && preview.positions.pointsGap <= 3) {
    score += 12;
    reasons.push(preview.positions.pointsGap === 0 ? 'Empatados a puntos' : `${preview.positions.pointsGap} puntos de margen`);
  }
  if (pressure && (pressure.score ?? 0) >= 55) {
    score += 8;
    reasons.push(`Entorno: ${pressure.level ?? 'presión alta'}`);
  }
  if ((moodScore ?? 50) >= 70) {
    score += 5;
    reasons.push('La grada llega encendida');
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 85 ? 'Final emocional'
    : score >= 70 ? 'Partido grande'
      : score >= 50 ? 'Jornada importante'
        : 'Ritmo de liga';
  return { score, label, reasons: reasons.slice(0, 4) };
}

function broadcastPhrase(preview: MatchPreviewPayload, pressure: { level?: string } | null, mood?: { mood: string; score: number } | null): string {
  if (!preview) return 'La redacción de FDF Today espera el próximo foco de la jornada.';
  const home = preview.homeClub.shortName;
  const away = preview.awayClub.shortName;
  if (preview.rivalry) return `${preview.rivalry.name}: ${home} y ${away} llegan con la ciudad mirando cada balón.`;
  if (pressure?.level === 'crisis' || pressure?.level === 'tense') return `${home}-${away}: partido de respuesta obligatoria para calmar el palco.`;
  if (mood?.mood === 'green' && mood.score >= 70) return `${home}-${away}: la grada huele una noche de las que cambian el ánimo.`;
  return preview.tagline;
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  app.get<{ Querystring: { since?: string } }>('/zone-badges', async (request, reply) => {
    const { clubId, userId, managerId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    try {
      const since = await resolveSince(userId, request.query.since);
      const zones = await buildZoneBadges({ clubId, userId, managerId, since });

      return reply.send({ since, zones });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudieron calcular las novedades';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── Y4/Y5 · GET /api/dashboard/shell-context ─────────────────────────────
  // Contexto único para AppLayout/Sidebar/TopBar: modo visual global, día de
  // partido, Sala de Prensa, badges vivos y ticker. No reemplaza pantallas.
  app.get('/shell-context', async (request, reply) => {
    const { clubId, userId, managerId, username } = request.user;

    try {
      const [state, ticker, nextTick] = await Promise.all([
        prisma.gameState.findFirst({
          where: { isActive: true },
          select: { turn: true, inGameDate: true, seasonId: true, seasonWeek: true },
        }),
        publicService.getTicker(),
        publicService.getNextTick(),
      ]);
      const visibleTicker = await filterTickerForE15(ticker.items, clubId ?? null, userId);

      if (!clubId || managerId <= 0) {
        return reply.send({
          manager: { id: managerId > 0 ? managerId : null, username, club: null },
          season: state ? { id: state.seasonId, turn: state.turn, inGameDate: state.inGameDate, seasonWeek: state.seasonWeek } : null,
          visual: { mode: 'normal' as ShellMode, matchdayMode: false, labels: { press: 'Sala de Prensa', chat: 'Taberna' } },
          matchday: {
            active: false,
            phase: 'onboarding',
            match: null,
            opponent: null,
            derby: { active: false, name: null, intensity: null },
            importance: { score: 0, label: 'Escoge club para entrar en competición', reasons: [] },
            broadcastPhrase: 'El mundo FDF ya está abierto: falta elegir banquillo.',
          },
          navigation: {
            zones: {},
            badges: [],
            primaryCta: { label: 'Elegir club', route: '/onboarding', kind: 'onboarding' },
          },
          press: { label: 'Sala de Prensa', unread: 0, pendingQuestions: 0, latest: [], route: '/news' },
          live: { ticker: visibleTicker.slice(0, 6), nextTick },
          onboarding: { recommendedRoute: '/onboarding', publicWorld: '/api/public/world/map' },
          contracts: ['/api/public/world/map', '/api/onboarding/guide'],
          uiNeed: '// NECESITO: AppLayout debe permitir continuar sin club y mandar al onboarding/mapa mundial.',
        });
      }

      const since = await resolveSince(userId);
      const seasonFilter = seasonMatchWhere(state?.seasonId);
      const [
        manager,
        nextMatch,
        zones,
        mood,
        pressure,
        latestNews,
        pendingPress,
        defaultTactic,
      ] = await Promise.all([
        prisma.manager.findUnique({
          where: { id: managerId },
          select: {
            id: true,
            name: true,
            level: true,
            prestige: true,
            club: {
              select: {
                id: true,
                name: true,
                shortName: true,
                badge: true,
                city: true,
                country: true,
                stadiumName: true,
                stadiumCapacity: true,
              },
            },
          },
        }),
        prisma.match.findFirst({
          where: {
            status: 'scheduled',
            OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
            ...seasonFilter,
          },
          orderBy: [{ playedAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        }),
        buildZoneBadges({ clubId, userId, managerId, since }),
        fansService.getMood(clubId).catch(() => ({ mood: 'yellow' as const, score: 50, reasons: [] })),
        managerService.getPressure(managerId).catch(() => null),
        prisma.news.findMany({
          where: { recipientId: managerId, type: { not: 'press_question' } },
          orderBy: { createdAt: 'desc' },
          take: 3,
          select: { id: true, type: true, subject: true, body: true, isRead: true, createdAt: true },
        }),
        prisma.pressQuestion.count({ where: { managerId, answeredAt: null } }),
        prisma.tactic.findFirst({ where: { managerId, isDefault: true }, select: { id: true, formation: true } }),
      ]);

      const preview = nextMatch ? await getMatchPreview(nextMatch.id) : null;
      const badges = compactBadges(zones);
      const urgentCount = badges
        .filter((badge) => ['squad', 'market', 'press', 'missions', 'stadium'].includes(badge.key))
        .reduce((sum, badge) => sum + badge.count, 0);
      const mode = shellModeFor({
        hasMatch: Boolean(preview),
        pressureLevel: pressure?.level ?? null,
        mood: mood.mood,
        moodScore: mood.score,
        urgentCount,
      });
      const importance = matchImportance(preview, pressure, mood.score);
      const opponent = preview
        ? (preview.homeClub.id === clubId ? preview.awayClub : preview.homeClub)
        : null;
      const home = preview ? preview.homeClub.id === clubId : null;
      const firstBadge = badges[0] ?? null;
      const primaryCta = preview
        ? { label: defaultTactic ? 'Entrar en día de partido' : 'Preparar táctica', route: defaultTactic ? `/matches/${preview.matchId}` : '/tactics', kind: 'matchday' }
        : firstBadge
          ? { label: firstBadge.reasons[0] ?? 'Revisar pendiente', route: firstBadge.route, kind: firstBadge.key }
          : { label: 'Entrar al club', route: '/club', kind: 'club' };

      return reply.send({
        manager: manager
          ? { id: manager.id, name: manager.name, level: manager.level, prestige: manager.prestige, club: manager.club }
          : { id: managerId, name: username, club: null },
        season: state ? { id: state.seasonId, turn: state.turn, inGameDate: state.inGameDate, seasonWeek: state.seasonWeek } : null,
        visual: {
          mode,
          matchdayMode: Boolean(preview),
          labels: { press: 'Sala de Prensa', chat: 'Taberna', notifications: 'Sala de Prensa' },
          skinHints: {
            topBar: mode === 'matchday' ? 'matchday-glow' : mode,
            sidebar: urgentCount > 0 ? 'alive-badges' : 'calm',
          },
        },
        matchday: {
          active: Boolean(preview),
          phase: preview ? 'pre_match' : 'idle',
          home,
          opponent,
          match: preview
            ? {
                id: preview.matchId,
                status: preview.status,
                playedAt: preview.playedAt,
                competition: preview.competition,
                matchdayNum: preview.matchdayNum,
                homeClub: preview.homeClub,
                awayClub: preview.awayClub,
                matchCenter: preview.matchCenter,
                route: `/matches/${preview.matchId}`,
                previewRoute: `/matches/${preview.matchId}?tab=preview`,
              }
            : null,
          derby: preview?.rivalry
            ? { active: true, name: preview.rivalry.name, intensity: preview.rivalry.intensity }
            : { active: false, name: null, intensity: null },
          importance,
          venue: preview
            ? {
                ...preview.venue,
                weatherLabel: weatherLabel(preview.venue.weatherCondition, preview.venue.temperature),
              }
            : null,
          broadcastPhrase: broadcastPhrase(preview, pressure, mood),
          tacticalReadiness: {
            hasDefaultTactic: Boolean(defaultTactic),
            formation: defaultTactic?.formation ?? null,
            route: '/tactics',
          },
        },
        navigation: {
          zones,
          badges,
          urgentCount,
          primaryCta,
          quickLinks: [
            { key: 'press', label: 'Sala de Prensa', route: '/news', badge: zones.press?.count ?? 0 },
            { key: 'tavern', label: 'Taberna', route: '/messages', badge: zones.chat?.count ?? 0 },
            { key: 'world', label: 'Mundo FDF', route: '/world', badge: 0 },
          ],
        },
        press: {
          label: 'Sala de Prensa',
          unread: zones.press?.count ?? 0,
          pendingQuestions: pendingPress,
          latest: latestNews.map((news) => ({
            id: news.id,
            type: news.type,
            title: news.subject,
            excerpt: news.body,
            isRead: news.isRead,
            createdAt: news.createdAt,
            route: '/news',
          })),
          route: '/news',
          pendingRoute: '/press',
        },
        live: {
          ticker: visibleTicker.slice(0, 6),
          nextTick,
        },
        mood,
        pressure,
        contracts: [
          '/api/dashboard/zone-badges',
          '/api/dashboard/daily-cover',
          '/api/dashboard/turn-checklist',
          preview ? `/api/matches/${preview.matchId}/preview` : null,
          '/api/public/ticker',
        ].filter(Boolean),
        uiNeed: '// NECESITO: AppLayout/Sidebar/TopBar deben consumir shell-context para modo Día de Partido, Sala de Prensa, Taberna y badges vivos.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el contexto del shell';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── W1 · GET /api/dashboard/daily-cover ───────────────────────────────────
  // Portada deportiva diaria. Reusa el ticker como fuente de top stories y de
  // resultado destacado, evitando volver a ejecutar el scoring de featured.
  app.get('/daily-cover', async (request, reply) => {
    const { clubId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    try {
      const [state, ticker, nextTick] = await Promise.all([
        prisma.gameState.findFirst({
          where: { isActive: true },
          select: { turn: true, inGameDate: true, seasonId: true },
        }),
        publicService.getTicker(),
        publicService.getNextTick(),
      ]);
      const visibleTicker = await filterTickerForE15(ticker.items, clubId, request.user.userId);

      const resultStory = visibleTicker.find((item) => item.id.startsWith('tk-result-'));
      const resultStoryMatchId = resultStory ? Number.parseInt(resultStory.id.replace('tk-result-', ''), 10) : null;

      const [featuredResultMatch, latestPlayedMatch, nextMatch] = await Promise.all([
        Number.isSafeInteger(resultStoryMatchId)
          ? prisma.match.findUnique({
              where: { id: resultStoryMatchId as number },
              include: {
                homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
                awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
                matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
              },
            })
          : prisma.match.findFirst({
              where: { status: 'played', ...seasonMatchWhere(state?.seasonId) },
              orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
              include: {
                homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
                awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
                matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
              },
            }),
        prisma.match.findFirst({
          where: { status: 'played', ...seasonMatchWhere(state?.seasonId) },
          orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            playedAt: true,
            status: true,
            homeClubId: true,
            awayClubId: true,
            homeStatsJson: true,
          },
        }),
        prisma.match.findFirst({
          where: {
            status: 'scheduled',
            OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
            ...seasonMatchWhere(state?.seasonId),
          },
          orderBy: [{ playedAt: 'asc' }, { id: 'asc' }],
          include: {
            homeClub: { select: { id: true, name: true, shortName: true, badge: true } },
            awayClub: { select: { id: true, name: true, shortName: true, badge: true } },
            matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
          },
        }),
      ]);

      const recentMatches = latestPlayedMatch?.playedAt
        ? await prisma.match.findMany({
            where: { status: 'played', playedAt: latestPlayedMatch.playedAt, ...seasonMatchWhere(state?.seasonId) },
            orderBy: { id: 'asc' },
            select: {
              id: true,
              status: true,
              homeClubId: true,
              awayClubId: true,
              homeStatsJson: true,
            },
          })
        : latestPlayedMatch
          ? [latestPlayedMatch]
          : [];
      const recentCandidateMatches = recentMatches.length > 0
        ? recentMatches
        : featuredResultMatch
          ? [featuredResultMatch]
          : [];
      const visibilityCandidates = [
        ...recentCandidateMatches,
        ...(featuredResultMatch ? [featuredResultMatch] : []),
      ].filter((match, index, matches) => matches.findIndex((candidate) => candidate.id === match.id) === index);
      const seenRecentRows = visibilityCandidates.length > 0
        ? await prisma.matchSeen.findMany({
            where: { userId: request.user.userId, matchId: { in: visibilityCandidates.map((match) => match.id) } },
            select: { matchId: true },
          })
        : [];
      const seenRecentMatchIds = new Set(seenRecentRows.map((row) => row.matchId));
      const visibleRecentMatchIds = recentCandidateMatches
        .filter((match) => !shouldHideResult(
          {
            status: match.status,
            homeClubId: match.homeClubId,
            awayClubId: match.awayClubId,
            homeStatsJson: match.homeStatsJson,
          },
          clubId,
          request.user.userId,
          seenRecentMatchIds.has(match.id),
        ))
        .map((match) => match.id);

      const [heroStat, moment] = await Promise.all([
        visibleRecentMatchIds.length > 0
          ? prisma.playerMatchStat.findFirst({
              where: { matchId: { in: visibleRecentMatchIds } },
              orderBy: [{ rating: 'desc' }, { id: 'asc' }],
              include: {
                player: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    club: { select: { id: true, name: true, shortName: true, badge: true } },
                  },
                },
              },
            })
          : null,
        buildCoverMoment(visibleRecentMatchIds),
      ]);

      const hero = heroStat
        ? {
            playerId: heroStat.playerId,
            name: heroStat.player.name,
            club: heroStat.player.club,
            rating: Number(heroStat.rating.toFixed(1)),
            summary: heroStat.goals > 0
              ? `MVP de la jornada con ${heroStat.goals} gol${heroStat.goals === 1 ? '' : 'es'}`
              : `MVP de la jornada con ${heroStat.rating.toFixed(1)} de nota`,
          }
        : null;

      const featuredResultHidden = featuredResultMatch
        ? shouldHideResult(
            { status: featuredResultMatch.status, homeClubId: featuredResultMatch.homeClubId, awayClubId: featuredResultMatch.awayClubId, homeStatsJson: featuredResultMatch.homeStatsJson },
            clubId,
            request.user.userId,
            seenRecentMatchIds.has(featuredResultMatch.id),
          )
        : false;
      const featuredResult = featuredResultMatch && featuredResultMatch.homeGoals != null && featuredResultMatch.awayGoals != null && !featuredResultHidden
        ? {
            matchId: featuredResultMatch.id,
            homeClub: featuredResultMatch.homeClub,
            awayClub: featuredResultMatch.awayClub,
            homeGoals: featuredResultMatch.homeGoals,
            awayGoals: featuredResultMatch.awayGoals,
            competition: featuredResultMatch.matchday?.competition
              ? {
                  id: featuredResultMatch.matchday.competition.id,
                  name: featuredResultMatch.matchday.competition.name,
                  shortName: featuredResultMatch.matchday.competition.shortName,
                }
              : null,
            route: `/matches/${featuredResultMatch.id}`,
          }
        : null;

      const rumorStory = visibleTicker.find((item) => item.id.startsWith('tk-rumor-'));
      const rumor = rumorStory
        ? {
            id: rumorStory.id.replace('tk-rumor-', ''),
            icon: rumorStory.icon,
            headline: rumorStory.text.replace(/^Rumor del día:\s*/i, ''),
            route: rumorStory.route ?? '/market',
          }
        : null;

      const myNextMatch = nextMatch
        ? {
            matchId: nextMatch.id,
            playedAt: nextMatch.playedAt,
            home: nextMatch.homeClubId === clubId,
            opponent: nextMatch.homeClubId === clubId ? nextMatch.awayClub : nextMatch.homeClub,
            competition: nextMatch.matchday?.competition
              ? {
                  id: nextMatch.matchday.competition.id,
                  name: nextMatch.matchday.competition.name,
                  shortName: nextMatch.matchday.competition.shortName,
                }
              : null,
            countdown: nextTick,
          }
        : null;

      const headlineTemplates = [
        hero ? `${hero.name} firma la portada de la jornada` : null,
        featuredResult ? `${featuredResult.homeClub.shortName} y ${featuredResult.awayClub.shortName} acaparan la jornada` : null,
        moment ? moment.title : null,
        'FDF Today abre con una jornada cargada de señales',
      ].filter(Boolean) as string[];
      const headline = headlineTemplates[(state?.turn ?? 0) % headlineTemplates.length];

      return reply.send({
        turn: state?.turn ?? null,
        inGameDate: state?.inGameDate ?? null,
        headline,
        hero,
        moment,
        featuredResult,
        stories: visibleTicker.slice(0, 5),
        rumor,
        nextMatch: myNextMatch,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar la portada diaria';
      return reply.code(500).send({ error: msg });
    }
  });

  // ─── QW-30 · GET /api/dashboard/turn-checklist ──────────────────────────────
  // Tareas urgentes ANTES del próximo tick. Contrato en API_UI.md §BloqueQ
  // (11 jun, tarde). Reusa el advisor QW-9 donde solapa (ofertas, renovaciones:
  // misma detección y textos, urgent = severity high).
  app.get('/turn-checklist', async (request, reply) => {
    const { clubId, managerId } = request.user;
    if (!clubId) return reply.code(400).send({ error: 'No tienes club asignado' });

    try {
      const [nextTick, state, starters, nextMatch, defaultTactic, advisor, pendingPress, pendingMissions] =
        await Promise.all([
          publicService.getNextTick(),
          prisma.gameState.findFirst({ where: { isActive: true }, select: { inGameDate: true } }),
          prisma.player.findMany({
            where: { clubId, isStarter: true },
            select: {
              id: true,
              name: true,
              injuries: { where: { weeksLeft: { gt: 0 } }, select: { id: true } },
              suspensions: { where: { matches: { gt: 0 } }, select: { id: true } },
            },
          }),
          prisma.match.findFirst({
            where: {
              status: 'scheduled',
              OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
            },
            orderBy: { id: 'asc' },
            include: {
              homeClub: { select: { id: true, shortName: true } },
              awayClub: { select: { id: true, shortName: true } },
            },
          }),
          prisma.tactic.findFirst({ where: { managerId, isDefault: true }, select: { id: true } }),
          advisorService.getRecommendations(clubId),
          prisma.pressQuestion.count({ where: { managerId, answeredAt: null } }),
          ((prisma as typeof prisma & { weeklyMission?: { count: (args: unknown) => Promise<number> } }).weeklyMission
            ?.count({ where: { managerId, status: 'pending' } }) ?? Promise.resolve(0)),
        ]);

      const items: ChecklistItem[] = [];

      // 1 · Titulares que no pueden jugar (lesión activa o sanción pendiente)
      const unavailable = starters.filter((p) => p.injuries.length > 0 || p.suspensions.length > 0);
      if (unavailable.length > 0) {
        const label = (p: (typeof unavailable)[number]) =>
          `${p.name} (${p.injuries.length > 0 ? 'lesión' : 'sanción'})`;
        items.push({
          key: 'lineup_unavailable',
          urgent: true,
          title: unavailable.length === 1
            ? 'Tienes 1 titular que no puede jugar'
            : `Tienes ${unavailable.length} titulares que no pueden jugar`,
          detail: `${unavailable.slice(0, 3).map(label).join(' y ')}${unavailable.length > 3 ? '…' : ''} está${unavailable.length > 1 ? 'n' : ''} entre tus titulares. Ajusta el once.`,
          cta: { label: 'Ajustar alineación', route: '/squad' },
        });
      }

      // 2 · Once incompleto
      if (starters.length < 11) {
        items.push({
          key: 'lineup_incomplete',
          urgent: true,
          title: 'Once incompleto',
          detail: `Solo tienes ${starters.length} titular${starters.length === 1 ? '' : 'es'} marcado${starters.length === 1 ? '' : 's'}. El tick alineará suplentes automáticamente.`,
          cta: { label: 'Completar el once', route: '/squad' },
        });
      }

      // 3 · Próximo partido sin táctica por defecto (R3: la default se sincroniza
      // a los partidos programados; sin default → se juega con la estándar)
      if (nextMatch && !defaultTactic) {
        const rival = nextMatch.homeClub.id === clubId ? nextMatch.awayClub : nextMatch.homeClub;
        items.push({
          key: 'tactic_missing',
          urgent: true,
          title: 'Próximo partido sin táctica',
          detail: `No tienes táctica por defecto: el partido contra el ${rival.shortName} se jugará con la táctica estándar.`,
          cta: { label: 'Preparar táctica', route: '/tactics' },
        });
      }

      // 4-5 · Reuso del advisor QW-9: ofertas sin responder y renovaciones críticas
      const offersRec = advisor.recommendations.find((r) => r.key === 'offers_pending');
      if (offersRec) {
        items.push({
          key: 'offers_pending',
          urgent: offersRec.severity === 'high',
          title: offersRec.title,
          detail: offersRec.detail,
          cta: offersRec.cta,
        });
      }
      const renewalsRec = advisor.recommendations.find((r) => r.key === 'contracts_expiring');
      if (renewalsRec) {
        items.push({
          key: 'renewals_critical',
          urgent: renewalsRec.severity === 'high',
          title: renewalsRec.title,
          detail: renewalsRec.detail,
          cta: renewalsRec.cta,
        });
      }

      // 6 · Misiones semanales sin completar. Urgente si la semana está a punto
      // de cerrar: la fecha in-game es viernes → el próximo turno simula la
      // jornada de liga del domingo (que cambia la semana).
      if (pendingMissions > 0) {
        const weekClosing = state?.inGameDate?.getUTCDay() === 5;
        items.push({
          key: 'weekly_missions',
          urgent: weekClosing,
          title: `${pendingMissions} misión${pendingMissions === 1 ? '' : 'es'} semanal${pendingMissions === 1 ? '' : 'es'} sin completar`,
          detail: weekClosing
            ? 'La semana se cierra en el próximo turno. Última oportunidad.'
            : 'Aún tienes margen esta semana para completarlas.',
          cta: { label: 'Ver misiones', route: '/missions' },
        });
      }

      // 7 · Ruedas de prensa pendientes
      if (pendingPress > 0) {
        items.push({
          key: 'press_pending',
          urgent: false,
          title: `${pendingPress} rueda${pendingPress === 1 ? '' : 's'} de prensa pendiente${pendingPress === 1 ? '' : 's'}`,
          detail: 'La prensa espera tus declaraciones.',
          cta: { label: 'Responder', route: '/press' },
        });
      }

      // Urgentes primero, manteniendo el orden de reglas dentro de cada grupo.
      items.sort((a, b) => Number(b.urgent) - Number(a.urgent));

      return reply.send({ nextTickAt: nextTick.nextTickAt, items });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo generar el checklist';
      return reply.code(500).send({ error: msg });
    }
  });
}
