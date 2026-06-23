import prisma from '../../db/prisma';

export type StaffRole =
  | 'manager'
  | 'sportingDirector'
  | 'fitnessCoach'
  | 'doctor'
  | 'tacticalAnalyst'
  | 'scout'
  | 'nutritionist'
  | 'goalkeepingCoach';

export interface StaffAttributes {
  name: string;
  level: number;
  specialty: string;
  effectiveness: number;
}

type StaffMemberShape = {
  role: string;
  attributes: string;
};

export function parseStaffAttributes(raw: string): StaffAttributes {
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

function clampLevel(level: number): number {
  return Math.max(0, Math.min(5, Math.floor(level)));
}

function bestRoleLevels(members: StaffMemberShape[]): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const member of members) {
    const attrs = parseStaffAttributes(member.attributes);
    const level = clampLevel(Number(attrs.effectiveness ?? attrs.level ?? 0));
    levels[member.role] = Math.max(levels[member.role] ?? 0, level);
  }
  return levels;
}

export function computeStaffEffects(members: StaffMemberShape[]) {
  const levels = bestRoleLevels(members);
  const doctorLevel = levels.doctor ?? 0;
  const fitnessLevel = levels.fitnessCoach ?? 0;
  const nutritionLevel = levels.nutritionist ?? 0;
  const analystLevel = levels.tacticalAnalyst ?? 0;
  const directorLevel = levels.sportingDirector ?? 0;

  return {
    roleLevels: levels,
    doctor: {
      level: doctorLevel,
      injuryChanceReductionPct: doctorLevel * 7,
      injuryDurationReductionPct: doctorLevel * 5,
      extraRecoveryWeeks: doctorLevel >= 4 ? 1 : 0,
      description: doctorLevel > 0
        ? `Reduce lesiones nuevas un ${doctorLevel * 7}% y recorta duracion un ${doctorLevel * 5}%.`
        : 'Sin efecto medico activo.',
    },
    fitnessCoach: {
      level: fitnessLevel,
      fitnessRecoveryBonus: fitnessLevel,
      description: fitnessLevel > 0
        ? `+${fitnessLevel} fitness por turno tras la recuperacion base.`
        : 'Sin efecto de fisio activo.',
    },
    nutritionist: {
      level: nutritionLevel,
      conditionRecoveryBonus: Math.ceil(nutritionLevel / 2),
      description: nutritionLevel > 0
        ? `+${Math.ceil(nutritionLevel / 2)} forma muscular y mental por turno.`
        : 'Sin efecto de nutricion activo.',
    },
    tacticalAnalyst: {
      level: analystLevel,
      scoutProgressBonus: analystLevel,
      description: analystLevel > 0
        ? `+${analystLevel} puntos por turno a informes de rival.`
        : 'Sin efecto de analista activo.',
    },
    sportingDirector: {
      level: directorLevel,
      rhythmMoraleBonus: Math.ceil(directorLevel / 2),
      description: directorLevel > 0
        ? `+${Math.ceil(directorLevel / 2)} ritmo y moral baja por turno.`
        : 'Sin efecto de segundo/secretaria activo.',
    },
  };
}

export async function getStaffEffectsForClubs(): Promise<Map<number, ReturnType<typeof computeStaffEffects>>> {
  const staffRows = await prisma.staff.findMany({
    include: { members: true },
  });
  const result = new Map<number, ReturnType<typeof computeStaffEffects>>();
  for (const staff of staffRows) {
    result.set(staff.clubId, computeStaffEffects(staff.members));
  }
  return result;
}
