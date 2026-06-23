export const CAREER_XP_BASE = 900;
export const CAREER_XP_GROWTH = 1.16;
export const CAREER_MAX_LEVEL = 100;

type CareerBranch = 'mot' | 'tac' | 'fin';

export interface CareerNodeDef {
  nodeId: string;
  branch: CareerBranch;
  tier: number;
  cost: number;
  label: string;
}

const NODE_ALIASES: Record<string, string> = {
  motivation_1: 'mot_1',
  motivation_2: 'mot_2',
  motivation_3: 'mot_3',
  tactics_1: 'tac_1',
  tactics_2: 'tac_2',
  tactics_3: 'tac_3',
  finance_1: 'fin_1',
  finance_2: 'fin_2',
  finance_3: 'fin_3',
};

export const CAREER_NODE_DEFS: CareerNodeDef[] = [
  { nodeId: 'mot_1', branch: 'mot', tier: 1, cost: 1, label: 'Discurso motivador I' },
  { nodeId: 'mot_2', branch: 'mot', tier: 2, cost: 2, label: 'Discurso motivador II' },
  { nodeId: 'mot_3', branch: 'mot', tier: 3, cost: 3, label: 'Discurso motivador III' },
  { nodeId: 'tac_1', branch: 'tac', tier: 1, cost: 1, label: 'Laboratorio tactico I' },
  { nodeId: 'tac_2', branch: 'tac', tier: 2, cost: 2, label: 'Laboratorio tactico II' },
  { nodeId: 'tac_3', branch: 'tac', tier: 3, cost: 3, label: 'Laboratorio tactico III' },
  { nodeId: 'fin_1', branch: 'fin', tier: 1, cost: 1, label: 'Negociador financiero I' },
  { nodeId: 'fin_2', branch: 'fin', tier: 2, cost: 2, label: 'Negociador financiero II' },
  { nodeId: 'fin_3', branch: 'fin', tier: 3, cost: 3, label: 'Negociador financiero III' },
];

const NODE_DEF_BY_ID = new Map(CAREER_NODE_DEFS.map(node => [node.nodeId, node]));

export function canonicalCareerNodeId(nodeId: string): string {
  const normalized = nodeId.trim();
  return NODE_ALIASES[normalized] ?? normalized;
}

export function careerStepXpCost(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(CAREER_XP_BASE * safeLevel * Math.pow(CAREER_XP_GROWTH, safeLevel - 1));
}

export function careerXpForLevel(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  let xp = 0;
  for (let current = 1; current < safeLevel; current++) {
    xp += careerStepXpCost(current);
  }
  return xp;
}

export function careerLevelFromXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < CAREER_MAX_LEVEL && safeXp >= careerXpForLevel(level + 1)) {
    level++;
  }
  return level;
}

export function careerXpProgress(level: number, xp: number) {
  const currentLevelXp = careerXpForLevel(level);
  const nextLevelXp = careerXpForLevel(level + 1);
  return {
    type: 'exponential' as const,
    base: CAREER_XP_BASE,
    growth: CAREER_XP_GROWTH,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel: Math.max(0, Math.floor(xp) - currentLevelXp),
    xpNeededForNext: Math.max(0, nextLevelXp - Math.floor(xp)),
  };
}

export function canonicalUnlockedSkillSet(nodeIds: string[]): Set<string> {
  return new Set(nodeIds.map(canonicalCareerNodeId));
}

export function spentCareerSkillPoints(nodeIds: string[]): number {
  const unlocked = canonicalUnlockedSkillSet(nodeIds);
  let spent = 0;
  for (const nodeId of unlocked) {
    spent += NODE_DEF_BY_ID.get(nodeId)?.cost ?? 1;
  }
  return spent;
}

export function earnedCareerSkillPoints(level: number): number {
  return Math.max(0, Math.floor(level) - 1);
}

export function careerSkillPointState(level: number, nodeIds: string[]) {
  const earned = earnedCareerSkillPoints(level);
  const spent = spentCareerSkillPoints(nodeIds);
  return {
    earned,
    spent,
    available: Math.max(0, earned - spent),
  };
}

export function careerSkillTreeState(level: number, nodeIds: string[]) {
  const unlocked = canonicalUnlockedSkillSet(nodeIds);
  const points = careerSkillPointState(level, nodeIds);
  return CAREER_NODE_DEFS.map((node) => {
    const previous = node.tier === 1
      ? null
      : `${node.branch}_${node.tier - 1}`;
    const sequenceOk = !previous || unlocked.has(previous);
    const isUnlocked = unlocked.has(node.nodeId);
    return {
      ...node,
      unlocked: isUnlocked,
      unlockable: !isUnlocked && sequenceOk && points.available >= node.cost,
      sequenceOk,
    };
  });
}

export function validateCareerNodeUnlock(level: number, currentNodeIds: string[], requestedNodeId: string) {
  const nodeId = canonicalCareerNodeId(requestedNodeId);
  const node = NODE_DEF_BY_ID.get(nodeId);
  if (!node) throw new Error('Nodo de carrera desconocido.');

  const unlocked = canonicalUnlockedSkillSet(currentNodeIds);
  if (unlocked.has(nodeId)) throw new Error('Skill already unlocked');

  if (node.tier > 1 && !unlocked.has(`${node.branch}_${node.tier - 1}`)) {
    throw new Error('Debes desbloquear el nodo anterior de esta rama.');
  }

  const points = careerSkillPointState(level, currentNodeIds);
  if (points.available < node.cost) {
    throw new Error(`No tienes puntos suficientes: ${node.label} cuesta ${node.cost}.`);
  }

  return { nodeId, node, points };
}
