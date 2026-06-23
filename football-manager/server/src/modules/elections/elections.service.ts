// ─── Elections Service ─────────────────────────────────────────────────────────
// Manages elections for national team managers and federation presidents.
// Elections occur every 2 in-game years. Managers apply, others vote.
// If nobody applies, the manager with highest prestige is auto-assigned.

import prisma from '../../db/prisma';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentPeriod(inGameDate: Date): string {
  const y = inGameDate.getFullYear();
  // Election period = every 2 years, starting from year 1 (odd years)
  const periodStart = y % 2 === 0 ? y - 1 : y;
  return `${periodStart}-${periodStart + 1}`;
}

function parseCandidates(raw: string): number[] {
  try { return JSON.parse(raw) as number[]; }
  catch { return []; }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const electionsService = {
  // ─── List elections (optionally filter by countryId or period) ─────────────
  async list(filters: { countryId?: number; period?: string } = {}) {
    const elections = await prisma.election.findMany({
      where: {
        ...(filters.countryId ? { countryId: filters.countryId } : {}),
        ...(filters.period ? { period: filters.period } : {}),
      },
      include: {
        country: { select: { id: true, name: true } },
        votes: true,
      },
      orderBy: { id: 'desc' },
      take: 100,
    });

    return Promise.all(
      elections.map(async (el) => {
        const candidateIds = parseCandidates(el.candidates);
        const rawProfiles = candidateIds.length
          ? await prisma.manager.findMany({
              where: { id: { in: candidateIds } },
              select: {
                id: true,
                name: true,
                prestige: true,
                user: { select: { username: true } },
              },
            })
          : [];

        // AUDIT H-42: votos REALES por candidato (antes el frontend solo recibía
        // id/name/prestige y caía a "apoyo por prestigio"). Se cuenta desde la tabla
        // Vote y se expone `votes`/`votePct` por candidato + `voteSource: 'real'`.
        const totalVotes = el.votes.length;
        const votesByCandidate = new Map<number, number>();
        for (const v of el.votes) {
          votesByCandidate.set(v.candidateManagerId, (votesByCandidate.get(v.candidateManagerId) ?? 0) + 1);
        }
        const candidateProfiles = rawProfiles.map((p) => {
          const votes = votesByCandidate.get(p.id) ?? 0;
          return {
            ...p,
            votes,
            votePct: totalVotes > 0 ? Math.round((votes / totalVotes) * 1000) / 10 : 0,
          };
        });
        const winnerProfile = el.winnerId
          ? await prisma.manager.findUnique({
              where: { id: el.winnerId },
              select: { id: true, name: true, user: { select: { username: true } } },
            })
          : null;

        return {
          id: el.id,
          countryId: el.countryId,
          country: el.country,
          period: el.period,
          candidates: candidateProfiles,
          votes: el.votes.length,
          voteSource: 'real' as const,
          winnerId: el.winnerId,
          winner: winnerProfile,
          isOpen: el.winnerId === null,
        };
      })
    );
  },

  // ─── Get or create the open election for a country ─────────────────────────
  async getOrCreateForCountry(countryId: number, inGameDate: Date) {
    const period = currentPeriod(inGameDate);
    const existing = await prisma.election.findFirst({
      where: { countryId, period },
    });
    if (existing) return existing;

    // Verify country exists
    const country = await prisma.country.findUnique({ where: { id: countryId } });
    if (!country) throw new Error('País no encontrado');

    return prisma.election.create({
      data: { countryId, period, candidates: '[]' },
    });
  },

  // ─── Apply as candidate ───────────────────────────────────────────────────
  async apply(userId: number, electionId: number) {
    const manager = await prisma.manager.findFirst({ where: { userId } });
    if (!manager) throw new Error('Mánager no encontrado');

    // AUDIT 3.7: fuente canónica única = columna manager.prestige (la que escriben
    // recalcPrestige y rumorSabotage, y la que lee el ranking). Antes se leía la
    // última fila de la tabla Prestige (historial), que podía divergir de la columna.
    const prestige = manager.prestige;
    if (prestige < 10) {
      throw new Error('Necesitas al menos 10 puntos de prestigio para candidatarte');
    }

    const election = await prisma.election.findUnique({ where: { id: electionId } });
    if (!election) throw new Error('Elección no encontrada');
    if (election.winnerId !== null) throw new Error('Esta elección ya ha concluido');

    const candidates = parseCandidates(election.candidates);
    if (candidates.includes(manager.id)) throw new Error('Ya eres candidato en esta elección');

    candidates.push(manager.id);

    return prisma.election.update({
      where: { id: electionId },
      data: { candidates: JSON.stringify(candidates) },
    });
  },

  // ─── Vote ─────────────────────────────────────────────────────────────────
  async vote(userId: number, electionId: number, candidateManagerId: number) {
    const voter = await prisma.manager.findFirst({ where: { userId }, select: { id: true, nationality: true } });
    if (!voter) throw new Error('Mánager no encontrado');

    // AUDIT 5.7-1: prohibir el autovoto.
    if (candidateManagerId === voter.id) throw new Error('No puedes votarte a ti mismo.');

    const election = await prisma.election.findUnique({
      where: { id: electionId },
      include: { country: { select: { name: true } } },
    });
    if (!election) throw new Error('Elección no encontrada');
    if (election.winnerId !== null) throw new Error('Esta elección ya ha concluido');

    // AUDIT 5.7-1: elegibilidad — solo los mánagers de la nacionalidad del país
    // pueden votar en sus elecciones (antes cualquier mánager votaba en cualquier país).
    if (voter.nationality !== election.country.name) {
      throw new Error('Solo puedes votar en las elecciones de tu país.');
    }

    const candidates = parseCandidates(election.candidates);
    if (!candidates.includes(candidateManagerId)) {
      throw new Error('El candidato no está en esta elección');
    }

    const existingVote = await prisma.vote.findFirst({
      where: { electionId, voterManagerId: voter.id },
    });
    if (existingVote) throw new Error('Ya has votado en esta elección');

    try {
      return await prisma.vote.create({
        data: { electionId, voterManagerId: voter.id, candidateManagerId },
      });
    } catch (e: any) {
      if (e.code === 'P2002') throw new Error('Ya has votado en esta elección');
      throw e;
    }
  },

  // ─── Close election and assign winner ────────────────────────────────────
  // Called from the tick when the period ends (last turn of the period's last year).
  async closeElection(electionId: number) {
    const election = await prisma.election.findUnique({
      where: { id: electionId },
      include: { votes: true },
    });
    if (!election) throw new Error('Elección no encontrada');
    if (election.winnerId !== null) return election; // already closed

    const candidates = parseCandidates(election.candidates);

    let winnerId: number | null = null;

    if (candidates.length === 0) {
      // Nobody applied: auto-assign the highest-prestige manager of this country
      winnerId = await this._highestPrestigeManagerForCountry(election.countryId);
    } else if (election.votes.length === 0) {
      // Candidates but no votes: pick candidate with highest prestige
      winnerId = await this._highestPrestigeAmong(candidates);
    } else {
      // Tally votes
      const tally = new Map<number, number>();
      for (const v of election.votes) {
        tally.set(v.candidateManagerId, (tally.get(v.candidateManagerId) ?? 0) + 1);
      }
      let maxVotes = -1;
      for (const [candidateId, count] of tally) {
        if (count > maxVotes) {
          maxVotes = count;
          winnerId = candidateId;
        }
      }
    }

    const closed = await prisma.election.update({
      where: { id: electionId },
      data: { winnerId },
    });

    // Assign to national team if applicable
    if (winnerId !== null) {
      // AUDIT 5.7-4: managerSelectorId es @unique. (1) Libera cualquier asignación
      // previa del ganador (evita P2002 si ya seleccionaba otra selección). (2) Asigna
      // a UNA sola selección del país (updateMany sobre varias rompería el unique).
      // (3) Tolera fallos sin abortar el cierre (la elección ya quedó cerrada arriba).
      try {
        await prisma.nationalTeam.updateMany({
          where: { managerSelectorId: winnerId },
          data: { managerSelectorId: null },
        });
        const team = await prisma.nationalTeam.findFirst({
          where: { countryId: election.countryId },
          select: { id: true },
        });
        if (team) {
          await prisma.nationalTeam.update({
            where: { id: team.id },
            data: { managerSelectorId: winnerId },
          });
        }
      } catch (err) {
        console.error(`[elections] no se pudo asignar seleccionador de la elección ${electionId}:`, err);
      }
    }

    return closed;
  },

  // ─── Internal helpers ─────────────────────────────────────────────────────
  async _highestPrestigeManagerForCountry(countryId: number): Promise<number | null> {
    const country = await prisma.country.findUnique({
      where: { id: countryId },
      select: { name: true },
    });
    if (!country) return null;

    const manager = await prisma.manager.findFirst({
      where: { nationality: country.name },
      orderBy: { prestige: 'desc' },
      select: { id: true },
    });
    return manager?.id ?? null;
  },

  async _highestPrestigeAmong(managerIds: number[]): Promise<number | null> {
    const manager = await prisma.manager.findFirst({
      where: { id: { in: managerIds } },
      orderBy: { prestige: 'desc' },
      select: { id: true },
    });
    return manager?.id ?? null;
  },

  // ─── Tick step: close elections whose period has ended ────────────────────
  async stepCloseExpiredElections(inGameDate: Date): Promise<number> {
    // AUDIT H-22: un periodo "P-(P+1)" (P impar, p. ej. 2025-2026) está ACTIVO durante
    // sus DOS años y termina al final de P+1; debe cerrarse al entrar en el año
    // siguiente (P+2, impar). Antes cerraba al inicio del año par (P+1) —un año antes—
    // dejando la elección "concluida" toda la 2.ª mitad del periodo (vote()/apply()
    // rechazaban con "ya concluido"). Ahora el cierre dispara en años IMPARES sobre el
    // periodo que acaba de terminar: "(year-2)-(year-1)". Alineado con currentPeriod().
    const year = inGameDate.getFullYear();
    const endedPeriod = year % 2 === 1 ? `${year - 2}-${year - 1}` : null;
    if (!endedPeriod) return 0;

    const openElections = await prisma.election.findMany({
      where: { period: endedPeriod, winnerId: null },
    });

    let closed = 0;
    for (const el of openElections) {
      await this.closeElection(el.id);
      closed++;
    }

    // AUDIT 5.7: las elecciones NUNCA se creaban automáticamente (solo vía POST /open),
    // por lo que sin intervención manual no había ciclo electoral. Al entrar en un año
    // IMPAR comienza un periodo nuevo (`currentPeriod` = `${year}-${year+1}`): se abre de
    // forma idempotente la elección del periodo para cada país (getOrCreateForCountry hace
    // findFirst por [countryId, period], así que repetir el tick no duplica).
    if (year % 2 === 1) {
      const countries = await prisma.country.findMany({ select: { id: true } });
      for (const country of countries) {
        await this.getOrCreateForCountry(country.id, inGameDate);
      }
    }

    return closed;
  },
};
