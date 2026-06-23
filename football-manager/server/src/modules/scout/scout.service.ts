import prisma from '../../db/prisma';

function parseStaffAttributes(member: any) {
  try {
    const value = JSON.parse(member.attributes) as Record<string, unknown>;
    return {
      name: String(value.name ?? 'Scout'),
      level: Number(value.level ?? 1),
      specialty: String(member.zone ?? value.specialty ?? 'General'),
      effectiveness: Number(value.effectiveness ?? value.level ?? 1),
      zone: member.zone ?? (typeof value.zone === 'string' ? value.zone : null),
    };
  } catch {
    return { name: 'Scout', level: 1, specialty: member.zone ?? 'General', effectiveness: 1, zone: member.zone ?? null };
  }
}

function overallOf(player: any) {
  return Math.round((
    player.passing +
    player.tackling +
    player.shooting +
    player.organization +
    player.unmarking +
    player.finishing +
    player.dribbling +
    player.goalkeeping
  ) / 8);
}

function visiblePlayer(player: any, analysisPoints: number) {
  const base = {
    id: player.id,
    name: player.name,
    position: player.position,
    age: player.age,
  };
  if (analysisPoints < 40) return base;
  const overall = overallOf(player);
  if (analysisPoints < 75) return { ...base, overall };
  return {
    ...base,
    overall,
    attributes: {
      passing: player.passing,
      tackling: player.tackling,
      shooting: player.shooting,
      organization: player.organization,
      unmarking: player.unmarking,
      finishing: player.finishing,
      dribbling: player.dribbling,
      goalkeeping: player.goalkeeping,
    },
  };
}

function scoutCandidate(clubId: number, index: number, zone = 'Europa') {
  const names = ['Mateo Rivas', 'Hugo Molina', 'Nora Paredes', 'Ivan Duarte', 'Clara Valls', 'Sergio Navas'];
  const level = ((clubId + index * 2) % 5) + 1;
  return {
    name: names[(clubId + index) % names.length],
    level,
    zone,
    specialty: zone,
    effectiveness: level,
    salary: 8_000 + level * 2_200,
    signingFee: 16_000 + level * 4_400,
  };
}

function encodeScoutAttributes(input: { name: string; level: number; specialty: string; effectiveness: number; zone?: string | null }) {
  return JSON.stringify(input);
}

function focusedPlayerId(zone?: string | null): number | null {
  const match = /^player:(\d+)$/.exec(zone ?? '');
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function reportConfidence(points: number): 'low' | 'medium' | 'high' | 'complete' {
  if (points >= 100) return 'complete';
  if (points >= 75) return 'high';
  if (points >= 40) return 'medium';
  return 'low';
}

export const scoutService = {
  async getOverview(clubId: number) {
    const staff = await prisma.staff.findUnique({
      where: { clubId },
      include: { members: true },
    });
    const scouts = (staff?.members ?? [])
      .filter((member) => member.role === 'scout')
      .map((member) => ({
        id: member.id,
        salary: member.salary,
        ...parseStaffAttributes(member),
      }));
    const scoutIds = scouts.map((scout) => scout.id);

    const [assignments, targets] = await Promise.all([
      scoutIds.length
        ? prisma.scoutAssignment.findMany({
            where: { scoutStaffId: { in: scoutIds } },
            orderBy: { id: 'desc' },
          })
        : Promise.resolve([]),
      prisma.club.findMany({
        where: { id: { not: clubId } },
        select: {
          id: true,
          name: true,
          shortName: true,
          country: true,
          reputation: true,
          budget: true,
        },
        orderBy: [{ reputation: 'desc' }, { budget: 'desc' }],
        take: 24,
      }),
    ]);
    const targetIds = [...new Set(assignments.map((assignment) => assignment.clubTargetId))];
    const focusPlayerIds = [...new Set(assignments.map((assignment) => focusedPlayerId(assignment.zone)).filter((id): id is number => id != null))];
    const [assignmentTargets, focusPlayers] = await Promise.all([
      targetIds.length
        ? prisma.club.findMany({
            where: { id: { in: targetIds } },
            include: {
              players: {
                orderBy: { marketValue: 'desc' },
                take: 8,
              },
            },
          })
        : Promise.resolve([]),
      focusPlayerIds.length
        ? prisma.player.findMany({
            where: { id: { in: focusPlayerIds } },
            select: {
              id: true,
              name: true,
              position: true,
              age: true,
              clubId: true,
              passing: true,
              tackling: true,
              shooting: true,
              organization: true,
              unmarking: true,
              finishing: true,
              dribbling: true,
              goalkeeping: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const targetById = new Map(assignmentTargets.map((target) => [target.id, target]));
    const focusPlayerById = new Map(focusPlayers.map((player) => [player.id, player]));

    return {
      scouts,
      targets,
      assignments: assignments.map((assignment) => {
        const target = targetById.get(assignment.clubTargetId);
        const focusId = focusedPlayerId(assignment.zone);
        const focusPlayer = focusId ? focusPlayerById.get(focusId) : null;
        return {
          id: assignment.id,
          scoutStaffId: assignment.scoutStaffId,
          analysisPoints: assignment.analysisPoints,
          confidence: reportConfidence(assignment.analysisPoints),
          focus: focusPlayer
            ? {
                type: 'player',
                player: focusPlayer,
                reportEta: assignment.analysisPoints >= 100 ? 'complete' : 'next_turn',
              }
            : { type: 'club', reportEta: assignment.analysisPoints >= 100 ? 'complete' : 'progressive' },
          target: target
            ? {
                id: target.id,
                name: target.name,
                shortName: target.shortName,
                reputation: target.reputation,
                country: target.country,
              }
            : { id: assignment.clubTargetId, name: 'Unknown club', shortName: 'UNK', reputation: 0, country: '-' },
          players: (focusPlayer ? [focusPlayer] : (target?.players ?? [])).map((player) => visiblePlayer(player, assignment.analysisPoints)),
        };
      }),
    };
  },

  async assignScout(clubId: number, scoutStaffId: number, clubTargetId: number) {
    if (clubId === clubTargetId) throw new Error('Cannot scout your own club');

    const scout = await prisma.staffMember.findUnique({
      where: { id: scoutStaffId },
      include: { staff: true },
    });
    if (!scout || scout.staff.clubId !== clubId || scout.role !== 'scout') {
      throw new Error('Scout not found');
    }

    const target = await prisma.club.findUnique({ where: { id: clubTargetId } });
    if (!target) throw new Error('Target club not found');

    const existing = await prisma.scoutAssignment.findFirst({
      where: { scoutStaffId, clubTargetId },
    });
    if (existing) return this.getOverview(clubId);

    const attrs = parseStaffAttributes(scout);
    try {
      await prisma.scoutAssignment.create({
        data: {
          scoutStaffId,
          clubTargetId,
          analysisPoints: Math.min(35, 10 + attrs.effectiveness * 5),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') return this.getOverview(clubId);
      throw err;
    }
    return this.getOverview(clubId);
  },

  async progressAssignment(clubId: number, assignmentId: number) {
    const assignment = await prisma.scoutAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new Error('Assignment not found');

    const scout = await prisma.staffMember.findUnique({
      where: { id: assignment.scoutStaffId },
      include: { staff: true },
    });
    if (!scout || scout.staff.clubId !== clubId) throw new Error('Assignment not found');

    // AUDIT H-25: el ojeo no puede ser gratis e instantáneo. Se limita a UN paso por
    // TURNO in-game por informe; antes se podía spamear el endpoint hasta 100 al
    // instante, anulando el "fog of war" (searchPlayers exige analysisPoints>=40) y la
    // economía del ojeo. El updateMany condicional por turno es atómico (anti-spam
    // concurrente). [Cross-request a C: idealmente el tick auto-avanza 1 paso/turno.]
    if (assignment.analysisPoints >= 100) throw new Error('El informe ya está completo.');
    const state = await prisma.gameState.findFirst({ where: { isActive: true }, select: { turn: true } });
    const currentTurn = state?.turn ?? 0;
    const attrs = parseStaffAttributes(scout);
    const step = 12 + attrs.effectiveness * 4;
    const advanced = await prisma.scoutAssignment.updateMany({
      where: { id: assignmentId, lastProgressTurn: { lt: currentTurn } },
      data: {
        analysisPoints: Math.min(100, assignment.analysisPoints + step),
        lastProgressTurn: currentTurn,
      },
    });
    if (advanced.count === 0) {
      throw new Error('Este informe ya avanzó este turno; espera al siguiente.');
    }
    return this.getOverview(clubId);
  },

  async cancelAssignment(clubId: number, assignmentId: number) {
    const assignment = await prisma.scoutAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment) throw new Error('Assignment not found');

    const scout = await prisma.staffMember.findUnique({
      where: { id: assignment.scoutStaffId },
      include: { staff: true },
    });
    if (!scout || scout.staff.clubId !== clubId) throw new Error('Assignment not found');

    await prisma.scoutAssignment.delete({ where: { id: assignmentId } });
    return this.getOverview(clubId);
  },

  async getScoutedPlayers(clubId: number) {
    const staff = await prisma.staff.findUnique({
      where: { clubId },
      include: { members: true },
    });
    const scoutIds = (staff?.members ?? [])
      .filter((member) => member.role === 'scout')
      .map((member) => member.id);
    if (scoutIds.length === 0) return [];

    const assignments = await prisma.scoutAssignment.findMany({
      where: { scoutStaffId: { in: scoutIds } },
      orderBy: [{ analysisPoints: 'desc' }, { id: 'desc' }],
      include: {
        clubTarget: {
          include: {
            players: {
              orderBy: [{ marketValue: 'desc' }, { age: 'asc' }],
              take: 40,
            },
          },
        },
      },
    });

    return assignments.flatMap((assignment) => {
      const focusId = focusedPlayerId(assignment.zone);
      const players = focusId
        ? assignment.clubTarget.players.filter((player) => player.id === focusId)
        : assignment.clubTarget.players;
      return players.map((player) => ({
        ...visiblePlayer(player, assignment.analysisPoints),
        club: {
          id: assignment.clubTarget.id,
          name: assignment.clubTarget.name,
          shortName: assignment.clubTarget.shortName,
          country: assignment.clubTarget.country,
        },
        report: {
          assignmentId: assignment.id,
          analysisPoints: assignment.analysisPoints,
          confidence: reportConfidence(assignment.analysisPoints),
          focus: focusId ? 'player' : 'club',
          tracked: true,
          marketValue: assignment.analysisPoints >= 75 ? player.marketValue : undefined,
          salary: assignment.analysisPoints >= 90 ? player.salary : undefined,
        },
      }));
    });
  },

  async trackPlayer(clubId: number, playerId: number) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, clubId: true },
    });
    if (!player || !player.clubId) throw new Error('Player not found');
    if (player.clubId === clubId) throw new Error('No puedes ojear a tus propios jugadores.');

    const staff = await prisma.staff.findUnique({
      where: { clubId },
      include: { members: true },
    });
    const scouts = (staff?.members ?? []).filter((member) => member.role === 'scout');
    if (scouts.length === 0) throw new Error('Necesitas contratar al menos un scout.');

    const assignments = await prisma.scoutAssignment.findMany({
      where: { scoutStaffId: { in: scouts.map((scout) => scout.id) } },
    });
    const current = assignments.find((assignment) => assignment.clubTargetId === player.clubId);
    if (current) {
      return { ok: true, playerId, assignmentId: current.id, alreadyTracked: true };
    }

    const loadByScout = new Map<number, number>();
    for (const assignment of assignments) {
      loadByScout.set(assignment.scoutStaffId, (loadByScout.get(assignment.scoutStaffId) ?? 0) + 1);
    }
    // F6: parseStaffAttributes espera el MIEMBRO entero, no el string attributes
    const selected = [...scouts].sort((a, b) =>
      (loadByScout.get(a.id) ?? 0) - (loadByScout.get(b.id) ?? 0) ||
      parseStaffAttributes(b).effectiveness - parseStaffAttributes(a).effectiveness
    )[0];
    const attrs = parseStaffAttributes(selected);
    let created;
    try {
      created = await prisma.scoutAssignment.create({
        data: {
          scoutStaffId: selected.id,
          clubTargetId: player.clubId,
          analysisPoints: Math.min(35, 10 + attrs.effectiveness * 5),
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        const existing = await prisma.scoutAssignment.findFirst({
          where: { scoutStaffId: selected.id, clubTargetId: player.clubId },
        });
        if (existing) {
          return { ok: true, playerId, assignmentId: existing.id, alreadyTracked: true };
        }
      }
      throw err;
    }

    return { ok: true, playerId, playerName: player.name, assignmentId: created.id, scoutStaffId: selected.id };
  },

  async assignScoutToFollowedPlayer(clubId: number, playerId: number, scoutStaffId?: number) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, position: true, clubId: true },
    });
    if (!player || !player.clubId) throw new Error('Jugador no encontrado.');
    if (player.clubId === clubId) throw new Error('No puedes asignar ojeo a tus propios jugadores.');

    const staff = await prisma.staff.findUnique({
      where: { clubId },
      include: { members: true },
    });
    const scouts = (staff?.members ?? []).filter((member) => member.role === 'scout');
    if (scouts.length === 0) throw new Error('Necesitas contratar al menos un ojeador.');

    const assignments = await prisma.scoutAssignment.findMany({
      where: { scoutStaffId: { in: scouts.map((scout) => scout.id) } },
    });
    const selected = scoutStaffId
      ? scouts.find((scout) => scout.id === scoutStaffId)
      : [...scouts].sort((a, b) =>
          (assignments.filter((assignment) => assignment.scoutStaffId === a.id).length)
          - (assignments.filter((assignment) => assignment.scoutStaffId === b.id).length)
          || parseStaffAttributes(b).effectiveness - parseStaffAttributes(a).effectiveness
        )[0];
    if (!selected) throw new Error('Ojeador no encontrado.');

    const existing = assignments.find((assignment) =>
      assignment.scoutStaffId === selected.id && assignment.clubTargetId === player.clubId);
    const attrs = parseStaffAttributes(selected);
    const startingPoints = Math.max(88, Math.min(95, 70 + attrs.effectiveness * 5));
    const zone = `player:${player.id}`;

    // AUDIT 3.6 (TOCTOU): upsert atómico por @@unique([scoutStaffId, clubTargetId]).
    // El find+create podía lanzar P2002 si dos asignaciones concurrentes al mismo
    // (ojeador, club objetivo) intentaban crear la fila a la vez.
    const nextPoints = existing ? Math.max(existing.analysisPoints, startingPoints) : startingPoints;
    const assignment = await prisma.scoutAssignment.upsert({
      where: { scoutStaffId_clubTargetId: { scoutStaffId: selected.id, clubTargetId: player.clubId } },
      update: { zone, analysisPoints: nextPoints },
      create: {
        scoutStaffId: selected.id,
        clubTargetId: player.clubId,
        zone,
        analysisPoints: startingPoints,
      },
    });

    return {
      ok: true,
      playerId: player.id,
      playerName: player.name,
      scoutStaffId: selected.id,
      assignmentId: assignment.id,
      analysisPoints: assignment.analysisPoints,
      confidence: reportConfidence(assignment.analysisPoints),
      reportEta: assignment.analysisPoints >= 100 ? 'complete' : 'next_turn',
      message: `Ojeador asignado a ${player.name}. El informe completo llegará en el siguiente turno.`,
    };
  },

  async getScoutStaff(clubId: number) {
    const staff = await prisma.staff.upsert({
      where: { clubId },
      update: {},
      create: { clubId },
      include: { members: true },
    });
    const scouts = staff.members
      .filter((member) => member.role === 'scout')
      .map((member) => ({
        id: member.id,
        salary: member.salary,
        ...parseStaffAttributes(member),
      }));

    return {
      scouts,
      candidates: [0, 1, 2].map((index) => scoutCandidate(clubId, index)),
    };
  },

  async hireScout(clubId: number, input: { name?: string; candidateIndex?: number; level?: number; zone?: string }) {
    const index = input.candidateIndex ?? 0;
    if (!Number.isInteger(index) || index < 0 || index > 2) {
      throw new Error('Índice de candidato no válido');
    }
    const candidate = scoutCandidate(clubId, index, input.zone ?? 'Europa');
    const level = candidate.level;
    const salary = candidate.salary;
    const signingFee = candidate.signingFee;

    const [club, staff] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { budget: true } }),
      prisma.staff.upsert({ where: { clubId }, update: {}, create: { clubId } }),
    ]);
    if (!club) throw new Error('Club not found');
    if (club.budget < signingFee) throw new Error('Presupuesto insuficiente.');

    await prisma.$transaction(async (tx) => {
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: signingFee } },
        data: { budget: { decrement: signingFee }, cash: { decrement: signingFee } },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente.');
      await tx.staffMember.create({
        data: {
          staffId: staff.id,
          role: 'scout',
          salary,
          attributes: encodeScoutAttributes({
            name: input.name ?? candidate.name,
            level,
            specialty: input.zone ?? candidate.specialty,
            effectiveness: level,
          }),
          zone: input.zone ?? candidate.zone,
        },
      });
    });

    return this.getScoutStaff(clubId);
  },

  async assignScoutZone(clubId: number, scoutStaffId: number, zone: string) {
    const scout = await prisma.staffMember.findUnique({
      where: { id: scoutStaffId },
      include: { staff: true },
    });
    if (!scout || scout.staff.clubId !== clubId || scout.role !== 'scout') throw new Error('Scout not found');

    await prisma.staffMember.update({
      where: { id: scoutStaffId },
      data: { zone },
    });
    return this.getScoutStaff(clubId);
  },
};
