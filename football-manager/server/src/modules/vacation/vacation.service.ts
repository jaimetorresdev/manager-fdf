import prisma from '../../db/prisma';

// Manager.vacationMode natively handles state.
// VacationDecision(managerId, clubId, turn, type, payload, createdAt) is planned for rich audit logs,
// but for now we use News logs to represent decisions.

const DECISION_TYPE = 'vacation';

async function managerWithUser(managerId: number) {
  const manager = await prisma.manager.findUnique({
    where: { id: managerId },
    select: {
      id: true,
      userId: true,
      clubId: true,
      name: true,
      vacationMode: true,
      club: { select: { id: true, name: true, shortName: true } },
    },
  });
  if (!manager) throw new Error('Manager not found');
  return manager;
}

async function writeVacationNews(
  managerId: number,
  subject: string,
  body: string,
  options?: { dedupe?: boolean },
) {
  const dedupe = options?.dedupe ?? false;
  if (dedupe) {
    const existing = await prisma.news.findFirst({
      where: { recipientId: managerId, type: DECISION_TYPE, subject },
      select: { id: true },
    });
    if (existing) return existing;
  }
  return prisma.news.create({
    data: {
      recipientId: managerId,
      type: DECISION_TYPE,
      subject,
      body,
    },
  });
}

export const vacationService = {
  async getState(managerId: number) {
    const manager = await managerWithUser(managerId);

    return {
      managerId,
      clubId: manager.clubId,
      club: manager.club,
      active: manager.vacationMode,
      updatedAt: new Date().toISOString(), // Fallback since updatedAt of mode isn't explicitly tracked
      storage: 'manager-native',
    };
  },

  async setState(managerId: number, active?: boolean) {
    const manager = await managerWithUser(managerId);
    const nextActive = typeof active === 'boolean' ? active : !manager.vacationMode;

    await prisma.manager.update({
      where: { id: managerId },
      data: { vacationMode: nextActive },
    });

    await writeVacationNews(
      managerId,
      nextActive ? 'Modo vacaciones activado' : 'Modo vacaciones desactivado',
      nextActive
        ? 'La IA gestionará alineaciones y renovaciones básicas hasta que vuelvas.'
        : 'Has recuperado el control completo del club.',
      { dedupe: false },
    );

    return this.getState(managerId);
  },

  async isManagerOnVacation(managerId: number | null | undefined) {
    if (!managerId) return false;
    return (await this.getState(managerId)).active;
  },

  async logLineupDecision(managerId: number, matchId: number, clubName: string, starterIds: number[]) {
    return writeVacationNews(
      managerId,
      `Modo vacaciones - partido ${matchId}`,
      `La IA preparó la alineación de ${clubName}. Titulares: ${starterIds.join(', ') || 'no disponible'}.`,
    );
  },

  async getDecisionLog(managerId: number, take = 20) {
    return prisma.news.findMany({
      where: { recipientId: managerId, type: DECISION_TYPE },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(100, take)),
    });
  },

  async processVacationTick(turn: number, inGameDate: Date) {
    const managersOnVacation = await prisma.manager.findMany({
      where: { vacationMode: true, clubId: { not: null } },
      include: {
        club: {
          include: {
            players: {
              where: { clubId: { not: null } },
              orderBy: [{ marketValue: 'desc' }, { age: 'asc' }],
            },
          },
        },
      },
    });

    let renewed = 0;
    let managersCount = 0;
    for (const manager of managersOnVacation) {
      if (!manager?.clubId || !manager.club) continue;
      managersCount += 1;

      const subject = `Modo vacaciones - turno ${turn}`;
      const alreadyLogged = await prisma.news.findFirst({
        where: { recipientId: manager.id, type: DECISION_TYPE, subject },
        select: { id: true },
      });
      if (alreadyLogged) continue;

      const renewedNames: string[] = [];
      // AUDIT 5.6: la renovación automática "ignoraba presupuesto". Un club en números
      // rojos NO debe auto-extender compromisos salariales: si el presupuesto es ≤0 se
      // omiten las renovaciones (solo se registra la revisión sin compras).
      const canRenew = manager.club.budget > 0;
      const budgetLimit = Math.max(250_000, manager.club.budget * 0.08);
      const soon = new Date(inGameDate);
      soon.setUTCMonth(soon.getUTCMonth() + 6);

      for (const player of (canRenew ? manager.club.players.slice(0, 8) : [])) {
        if (player.marketValue > budgetLimit) continue;
        const endAt = player.contractEndAt ? new Date(player.contractEndAt) : null;
        if (!endAt || endAt > soon) continue;
        const nextEnd = new Date(inGameDate);
        nextEnd.setUTCFullYear(nextEnd.getUTCFullYear() + Math.max(1, player.contractYears));
        // AUDIT 5.6: se mantiene el invariante wage===salary al renovar (mismas
        // condiciones; el AI conservador de vacaciones no aplica subida) en lugar de
        // dejar `wage` sin tocar y desalineado del resto del flujo de fichajes.
        const wage = Math.round(Number(player.wage ?? player.salary) || player.salary);
        await prisma.player.update({
          where: { id: player.id },
          data: {
            contractYears: Math.max(player.contractYears, 1),
            contractStartAt: inGameDate,
            contractEndAt: nextEnd,
            wage,
            salary: wage,
          },
        });
        renewed += 1;
        renewedNames.push(player.name);
      }

      await writeVacationNews(
        manager.id,
        subject,
        renewedNames.length > 0
          ? `La IA renovó contratos básicos: ${renewedNames.join(', ')}. No realizó compras caras.`
          : 'La IA revisó plantilla y contratos. No realizó compras caras ni detectó renovaciones básicas urgentes.',
      );
    }

    return { managers: managersCount, renewed };
  },
};
