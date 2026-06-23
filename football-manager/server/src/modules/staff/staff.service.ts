import prisma from '../../db/prisma';
import { computeStaffEffects } from './staffEffects';

type StaffRole =
  | 'manager'
  | 'sportingDirector'
  | 'fitnessCoach'
  | 'doctor'
  | 'tacticalAnalyst'
  | 'scout'
  | 'nutritionist'
  | 'goalkeepingCoach';

interface HireStaffInput {
  role: StaffRole;
  level: number;
  name?: string;
  salary?: number;
  specialty?: string;
}

interface StaffAttributes {
  name: string;
  level: number;
  specialty: string;
  effectiveness: number;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  manager: 'Segundo entrenador',
  sportingDirector: 'Secretaría técnica',
  fitnessCoach: 'Fisio',
  doctor: 'Médico',
  tacticalAnalyst: 'Analista táctico',
  scout: 'Ojeador',
  nutritionist: 'Nutricionista',
  goalkeepingCoach: 'Preparador de porteros',
};

const BASE_SALARY: Record<StaffRole, number> = {
  manager: 25000,
  sportingDirector: 18000,
  fitnessCoach: 12000,
  doctor: 14500,
  tacticalAnalyst: 11000,
  scout: 9000,
  nutritionist: 8000,
  goalkeepingCoach: 9500,
};

const CANDIDATE_NAMES = [
  'Javier Silva',
  'Isabel Fernandez',
  'Miguel Torres',
  'Roberto Sanchez',
  'Antonio Vargas',
  'Laura Medina',
  'Pablo Vidal',
  'Claudia Rojas',
];

function parseAttributes(raw: string): StaffAttributes {
  try {
    const value = JSON.parse(raw) as Partial<StaffAttributes>;
    return {
      name: String(value.name ?? 'Staff member'),
      level: Number(value.level ?? 1),
      specialty: String(value.specialty ?? 'General'),
      effectiveness: Number(value.effectiveness ?? value.level ?? 1),
    };
  } catch {
    return { name: 'Staff member', level: 1, specialty: 'General', effectiveness: 1 };
  }
}

function encodeAttributes(input: StaffAttributes): string {
  return JSON.stringify(input);
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(5, Math.floor(level)));
}

function candidateFor(role: StaffRole, seed: number, levelOffset = 0) {
  const level = clampLevel(((seed + role.length + levelOffset) % 5) + 1);
  const name = CANDIDATE_NAMES[(seed + role.length * 3 + levelOffset) % CANDIDATE_NAMES.length];
  return {
    role,
    roleLabel: ROLE_LABELS[role],
    name,
    level,
    specialty: role === 'scout' ? 'Regional scouting' : ROLE_LABELS[role],
    salary: BASE_SALARY[role] + level * 2200,
    signingFee: (BASE_SALARY[role] + level * 2200) * 2,
  };
}

const STAFF_ROLES = Object.keys(ROLE_LABELS) as StaffRole[];

export const staffService = {
  async getStaff(clubId: number) {
    const [club, staff] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { budget: true } }),
      prisma.staff.upsert({
        where: { clubId },
        update: {},
        create: { clubId },
        include: { members: true },
      }),
    ]);
    if (!club) throw new Error('Club not found');

    const members = staff.members.map((member) => {
      const attrs = parseAttributes(member.attributes);
      return {
        id: member.id,
        role: member.role,
        roleLabel: ROLE_LABELS[member.role as StaffRole] ?? member.role,
        salary: member.salary,
        ...attrs,
      };
    });

    const totalSalary = members.reduce((sum, member) => sum + member.salary, 0);
    const averageLevel = members.length
      ? Math.round((members.reduce((sum, member) => sum + member.level, 0) / members.length) * 10) / 10
      : 0;

    return {
      staffId: staff.id,
      budget: club.budget,
      members,
      summary: {
        totalMembers: members.length,
        totalSalary,
        averageLevel,
        rolesCovered: new Set(members.map((member) => member.role)).size,
      },
      effects: computeStaffEffects(staff.members),
      candidates: this.getCandidates(clubId, members.map((member) => member.role as StaffRole)),
      uiNeed: '// NECESITO: Antigravity debe mostrar en StaffPage los efectos activos por rol con estos numeros.',
    };
  },

  getCandidates(clubId: number, coveredRoles: StaffRole[] = []) {
    return STAFF_ROLES
      .filter((role) => role !== 'manager')
      .map((role, index) => candidateFor(role, clubId + coveredRoles.length, index));
  },

  async hireStaff(clubId: number, input: HireStaffInput) {
    if (!STAFF_ROLES.includes(input.role)) throw new Error('Rol de staff inválido');
    const level = clampLevel(input.level);
    const salary = Math.max(1000, Math.round(input.salary ?? BASE_SALARY[input.role] + level * 2200));
    const signingFee = salary * 2;

    const staff = await prisma.staff.upsert({
      where: { clubId },
      update: {},
      create: { clubId },
      include: { members: true },
    });

    if (staff.members.length >= 16) throw new Error('Límite de staff alcanzado');

    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { budget: true } });
    if (!club) throw new Error('Club no encontrado');
    if (club.budget < signingFee) throw new Error('Presupuesto insuficiente');

    const candidate = candidateFor(input.role, clubId, level);
    await prisma.$transaction(async (tx) => {
      // AUDIT 3.6 (TOCTOU): el cargo condicional bloquea la fila del club y serializa
      // las altas concurrentes del MISMO club; por eso el tope de 16 se reevalúa
      // DENTRO de la tx (conteo ya comprometido) — el chequeo de L164, fuera de la
      // tx, permitía a dos altas simultáneas superar el límite.
      const charged = await tx.club.updateMany({
        where: { id: clubId, budget: { gte: signingFee } },
        data: { budget: { decrement: signingFee }, cash: { decrement: signingFee } },
      });
      if (charged.count === 0) throw new Error('Presupuesto insuficiente');
      const memberCount = await tx.staffMember.count({ where: { staffId: staff.id } });
      if (memberCount >= 16) throw new Error('Límite de staff alcanzado');
      await tx.staffMember.create({
        data: {
          staffId: staff.id,
          role: input.role,
          salary,
          attributes: encodeAttributes({
            name: input.name ?? candidate.name,
            level,
            specialty: input.specialty ?? candidate.specialty,
            effectiveness: level,
          }),
        },
      });
    });

    return this.getStaff(clubId);
  },

  async fireStaff(clubId: number, memberId: number) {
    try {
      await prisma.$transaction(async (tx) => {
        const member = await tx.staffMember.findFirst({
          where: { id: memberId, staff: { clubId } },
          select: { salary: true },
        });
        if (!member) throw new Error(`Staff member not found or does not belong to club (id: ${memberId}, club: ${clubId})`);
        
        const removed = await tx.staffMember.delete({
          where: { id: memberId },
        });
        if (!removed) throw new Error('Staff member delete returned null');
        
        const severance = Math.round(member.salary);
        await tx.club.update({
          where: { id: clubId },
          data: { budget: { decrement: severance }, cash: { decrement: severance } },
        });
      });
      return this.getStaff(clubId);
    } catch (err: any) {
      console.error('fireStaff service error:', err);
      throw new Error(`fireStaff failed: ${err.message}`);
    }
  },
};
