import prisma from '../../db/prisma';
import { canonicalCareerNodeId } from './careerCurve';

export interface ManagerSkillEffects {
  moraleSpeechBonus: number;
  trainedPlayLimitBonus: number;
  commissionDiscountPct: number;
  notes: string[];
}

export const MANAGER_SKILL_EFFECTS: Record<string, Partial<ManagerSkillEffects> & { label: string }> = {
  mot_1: { label: 'Discurso motivador I', moraleSpeechBonus: 2 },
  mot_2: { label: 'Discurso motivador II', moraleSpeechBonus: 4 },
  mot_3: { label: 'Discurso motivador III', moraleSpeechBonus: 6 },
  tac_1: { label: 'Laboratorio táctico I', trainedPlayLimitBonus: 1 },
  tac_2: { label: 'Laboratorio táctico II', trainedPlayLimitBonus: 2 },
  tac_3: { label: 'Laboratorio táctico III', trainedPlayLimitBonus: 3 },
  fin_1: { label: 'Negociador financiero I', commissionDiscountPct: 10 },
  fin_2: { label: 'Negociador financiero II', commissionDiscountPct: 20 },
  fin_3: { label: 'Negociador financiero III', commissionDiscountPct: 30 },
};

export function aggregateSkillEffects(nodeIds: string[]): ManagerSkillEffects {
  const effects: ManagerSkillEffects = {
    moraleSpeechBonus: 0,
    trainedPlayLimitBonus: 0,
    commissionDiscountPct: 0,
    notes: [],
  };
  for (const nodeId of nodeIds) {
    const effect = MANAGER_SKILL_EFFECTS[canonicalCareerNodeId(nodeId)];
    if (!effect) continue;
    effects.moraleSpeechBonus += effect.moraleSpeechBonus ?? 0;
    effects.trainedPlayLimitBonus += effect.trainedPlayLimitBonus ?? 0;
    effects.commissionDiscountPct += effect.commissionDiscountPct ?? 0;
    effects.notes.push(effect.label);
  }
  return effects;
}

export async function effectsForManager(managerId: number): Promise<ManagerSkillEffects> {
  const skills = await prisma.managerSkill.findMany({
    where: { managerId },
    select: { nodeId: true },
  });
  return aggregateSkillEffects(skills.map(skill => skill.nodeId));
}

export async function effectsForClub(clubId: number): Promise<ManagerSkillEffects> {
  const manager = await prisma.manager.findFirst({
    where: { clubId },
    select: { id: true },
  });
  if (!manager) return aggregateSkillEffects([]);
  return effectsForManager(manager.id);
}
