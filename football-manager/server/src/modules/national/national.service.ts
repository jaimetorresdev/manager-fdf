import prisma from '../../db/prisma';
import { effectiveManagerPrestige, NATIONAL_MANAGER_MIN_PRESTIGE } from './national.logic';

export const nationalService = {
  async getNationalTeams() {
    return prisma.nationalTeam.findMany({
      include: {
        country: true,
      }
    });
  },

  async applyForManager(userId: number, countryId: number) {
    const manager = await prisma.manager.findFirst({ where: { userId } });
    if (!manager) throw new Error('No manager found');

    // Manager.prestige es la fuente canónica; Prestige conserva historial/auditoría.
    const effectivePrestige = effectiveManagerPrestige(manager.prestige);
    if (effectivePrestige < NATIONAL_MANAGER_MIN_PRESTIGE) {
      throw new Error(`No tienes suficiente prestigio para postularte (necesitas al menos ${NATIONAL_MANAGER_MIN_PRESTIGE})`);
    }

    const nt = await prisma.nationalTeam.findUnique({ where: { countryId } });
    if (!nt) throw new Error('National team not found');

    const claimed = await prisma.nationalTeam.updateMany({
      where: { countryId, managerSelectorId: null },
      data: { managerSelectorId: manager.id },
    });
    if (claimed.count === 0) {
      throw new Error('La selección ya tiene un mánager asignado.');
    }

    return prisma.nationalTeam.findUniqueOrThrow({ where: { countryId } });
  },

  async getMyNationalTeam(userId: number) {
    const manager = await prisma.manager.findFirst({ where: { userId } });
    if (!manager) return null;

    return prisma.nationalTeam.findFirst({
      where: { managerSelectorId: manager.id },
      include: {
        country: true,
        selectorCalls: {
          include: {
            player: {
              include: {
                club: true
              }
            }
          }
        }
      }
    });
  },

  async callPlayer(userId: number, playerId: number) {
    const nt = await this.getMyNationalTeam(userId);
    if (!nt) throw new Error('No eres seleccionador de ninguna selección');

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Jugador no encontrado');

    if (player.nationality !== nt.country.name) {
      throw new Error('El jugador no tiene la nacionalidad de tu selección');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const count = await tx.selectorCall.count({ where: { nationalTeamId: nt.id } });
        if (count >= 23) throw new Error('Ya has convocado el máximo de 23 jugadores');
        return tx.selectorCall.create({
          data: {
            nationalTeamId: nt.id,
            playerId,
            match: 'Amistoso',
          },
        });
      });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
        throw new Error('El jugador ya está convocado');
      }
      throw err;
    }
  },

  async uncallPlayer(userId: number, callId: number) {
    const nt = await this.getMyNationalTeam(userId);
    if (!nt) throw new Error('No eres seleccionador');

    const call = await prisma.selectorCall.findFirst({
      where: { id: callId, nationalTeamId: nt.id }
    });
    if (!call) throw new Error('Convocatoria no encontrada');

    return prisma.selectorCall.delete({ where: { id: callId } });
  }
};
