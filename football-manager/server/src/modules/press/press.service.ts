import prisma from '../../db/prisma';
import { serverT } from '../i18n/serverStrings';
import { effectsForManager } from '../manager/skillEffects';

type PressChoice = 'humble' | 'neutral' | 'aggressive';

const choiceEffects: Record<PressChoice, { morale: number; fans: number; label: string }> = {
  humble: { morale: 1, fans: 2, label: 'Humilde' },
  neutral: { morale: 0, fans: 0, label: 'Neutral' },
  aggressive: { morale: -1, fans: -2, label: 'Agresiva' },
};

function parseBody(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as any : null;
  } catch {
    return null;
  }
}

function resultFor(match: { homeClubId: number; homeGoals: number | null; awayGoals: number | null }, clubId: number) {
  const own = match.homeClubId === clubId ? match.homeGoals ?? 0 : match.awayGoals ?? 0;
  const other = match.homeClubId === clubId ? match.awayGoals ?? 0 : match.homeGoals ?? 0;
  if (own > other) return 'victory';
  if (own < other) return 'defeat';
  return 'draw';
}

function questionFor(context: string) {
  if (context === 'victory') return 'El equipo ganó. ¿Cómo explicas el rendimiento?';
  if (context === 'defeat') return 'El equipo perdió. ¿Qué mensaje mandas al vestuario y a la afición?';
  return 'El partido terminó empatado. ¿Te parece justo el resultado?';
}

function answers() {
  return [
    { id: 'humble', label: 'Humilde', text: serverT('press.answer.humble'), effects: choiceEffects.humble },
    { id: 'neutral', label: 'Neutral', text: serverT('press.answer.neutral'), effects: choiceEffects.neutral },
    { id: 'aggressive', label: 'Agresiva', text: serverT('press.answer.aggressive'), effects: choiceEffects.aggressive },
  ];
}

function questionPayload(row: {
  id: number;
  matchId: number | null;
  question: string;
  options: unknown;
  createdAt: Date;
  match?: any;
}, clubId: number) {
  const match = row.match;
  // AUDIT 5.8: el contexto (victory/defeat/draw) debe calcularse desde el club del
  // mánager, no desde el equipo local. Antes usaba `match.homeClubId`, por lo que el
  // visitante veía el resultado invertido. `pending()` ya genera la pregunta con
  // `resultFor(match, clubId)`; aquí se alinea el payload con ese mismo punto de vista.
  const matchContext = match ? resultFor(match, clubId) : undefined;
  return {
    questionId: row.id,
    matchId: row.matchId,
    context: matchContext,
    question: row.question,
    homeClub: match?.homeClub ?? null,
    awayClub: match?.awayClub ?? null,
    score: match ? { home: match.homeGoals, away: match.awayGoals } : null,
    competition: match?.matchday?.competition ?? null,
    answered: false,
    createdAt: row.createdAt,
    choices: Array.isArray(row.options) ? row.options : answers(),
  };
}

export const pressService = {
  async pending(managerId: number, clubId: number) {
    const matches = await prisma.match.findMany({
      where: {
        status: 'played',
        OR: [{ homeClubId: clubId }, { awayClubId: clubId }],
      },
      include: {
        homeClub: { select: { id: true, name: true, shortName: true } },
        awayClub: { select: { id: true, name: true, shortName: true } },
        matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
      },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: 5,
    });

    for (const match of matches) {
      const existing = await prisma.pressQuestion.findUnique({
        where: { managerId_matchId: { managerId, matchId: match.id } },
      });
      if (existing) continue;
      const context = resultFor(match, clubId);
      await prisma.pressQuestion.create({
        data: {
          managerId,
          matchId: match.id,
          question: questionFor(context),
          options: answers(),
        },
      });
      break;
    }

    const questions = await prisma.pressQuestion.findMany({
      where: { managerId, answeredAt: null },
      include: {
        match: {
          include: {
            homeClub: { select: { id: true, name: true, shortName: true } },
            awayClub: { select: { id: true, name: true, shortName: true } },
            matchday: { include: { competition: { select: { id: true, name: true, shortName: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const legacyQuestions = await prisma.news.findMany({
      where: { recipientId: managerId, type: 'press_question', isRead: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return [
      ...questions.map(q => questionPayload(q, clubId)),
      ...legacyQuestions
        .map(question => ({ row: question, body: parseBody(question.body) }))
      .filter(item => item.body && !item.body.answered)
      .map(item => ({
        questionId: item.row.id,
        ...item.body,
        choices: answers(),
        legacySource: 'news',
      })),
    ];
  },

  async answer(managerId: number, clubId: number, questionId: number, choice: PressChoice) {
    const question = await prisma.pressQuestion.findFirst({
      where: { id: questionId, managerId },
      include: { match: true },
    });
    if (!question) return this.answerLegacy(managerId, clubId, questionId, choice);
    if (question.answeredAt) throw new Error('Press question already answered');
    const skillEffects = await effectsForManager(managerId);
    const effects = { ...choiceEffects[choice], morale: choiceEffects[choice].morale + skillEffects.moraleSpeechBonus };
    const selected = answers().find(answer => answer.id === choice)!;
    const headline = `Rueda de prensa: ${selected.text}`;

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.pressQuestion.updateMany({
        where: { id: questionId, managerId, answeredAt: null },
        data: {
          answeredTone: choice,
          effectsJson: effects,
          answeredAt: new Date(),
        },
      });
      if (claimed.count === 0) throw new Error('La pregunta de prensa ya fue respondida.');
      const pressItem = await tx.pressItem.create({
        data: {
          matchdayId: null,
          headline,
          content: JSON.stringify({ questionId, matchId: question.matchId, choice, answer: selected.text, effects }),
        },
      });
      await tx.player.updateMany({ where: { clubId }, data: { morale: { increment: effects.morale } } });
      await tx.club.update({
        where: { id: clubId },
        data: {
          fans: { increment: effects.fans },
          socialMass: { increment: effects.fans },
        },
      });
      const updatedQuestion = await tx.pressQuestion.findUnique({ where: { id: questionId } });
      const news = await tx.news.create({
        data: {
          recipientId: managerId,
          type: 'media',
          subject: serverT('press.answer.published.subject'),
          body: `Respuesta ${effects.label}: moral ${effects.morale >= 0 ? '+' : ''}${effects.morale}, afición ${effects.fans >= 0 ? '+' : ''}${effects.fans}.`,
        },
      });
      return { pressItem, question: updatedQuestion, news };
    });

    return { ok: true, ...result, effects };
  },

  async answerLegacy(managerId: number, clubId: number, questionId: number, choice: PressChoice) {
    const question = await prisma.news.findFirst({
      where: { id: questionId, recipientId: managerId, type: 'press_question' },
    });
    if (!question) throw new Error('Press question not found');
    const payload = parseBody(question.body);
    if (!payload || payload.answered) throw new Error('Press question already answered');
    const effects = choiceEffects[choice];
    const skillEffects = await effectsForManager(managerId);
    const appliedEffects = { ...effects, morale: effects.morale + skillEffects.moraleSpeechBonus };
    const selected = answers().find(answer => answer.id === choice)!;
    const headline = `Rueda de prensa: ${selected.text}`;

    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.news.updateMany({
        where: { id: questionId, recipientId: managerId, type: 'press_question', isRead: false },
        data: { isRead: true },
      });
      if (claimed.count === 0) throw new Error('La pregunta de prensa ya fue respondida.');
      const pressItem = await tx.pressItem.create({
        data: {
          matchdayId: null,
          headline,
          content: JSON.stringify({ ...payload, choice, answer: selected.text, effects: appliedEffects }),
        },
      });
      await tx.player.updateMany({ where: { clubId }, data: { morale: { increment: appliedEffects.morale } } });
      await tx.club.update({
        where: { id: clubId },
        data: {
          fans: { increment: appliedEffects.fans },
          socialMass: { increment: appliedEffects.fans },
        },
      });
      const updatedQuestion = await tx.news.update({
        where: { id: questionId },
        data: {
          isRead: true,
          body: JSON.stringify({ ...payload, answered: true, choice, answer: selected.text, effects: appliedEffects, pressItemId: pressItem.id }),
        },
      });
      const news = await tx.news.create({
        data: {
          recipientId: managerId,
          type: 'media',
          subject: serverT('press.answer.published.subject'),
          body: `Respuesta ${appliedEffects.label}: moral ${appliedEffects.morale >= 0 ? '+' : ''}${appliedEffects.morale}, afición ${appliedEffects.fans >= 0 ? '+' : ''}${appliedEffects.fans}.`,
        },
      });
      return { pressItem, question: updatedQuestion, news };
    });

    return { ok: true, ...result, effects: appliedEffects };
  },
};
