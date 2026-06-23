import prisma from '../../db/prisma';
import { calcPlayerSalaryDemand } from '../../lib/playerValuation';
import { getInGameDate } from '../../lib/inGameDate';

export interface OfferEvaluationResult {
  blocks: { entorno: number; sentimental: number; expectativas: number; economico: number };
  keys: { id: string; label: string; ok: boolean; detail: string }[];
  total: number;
}

const CLAUSE_MULT: Record<number, number> = { 1: 600, 2: 500, 3: 400, 4: 300, 5: 200 };

function minSalaryFactor(yearsLeft: number | undefined): number {
  if (yearsLeft === undefined) return 0.9;
  return 1 - Math.max(0, Math.min(0.2, 0.2 - 0.05 * yearsLeft));
}

const clamp = (v: number, lo = 0, hi = 99) => Math.max(lo, Math.min(hi, v));

export async function evaluateOffer(
  buyerClubId: number,
  playerId: number,
  salary: number,
  years: number,
  clause: number
): Promise<OfferEvaluationResult> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    include: { club: { select: { country: true, city: true } } }
  });
  if (!player) throw new Error('Player not found');

  const buyerClub = await prisma.club.findUnique({
    where: { id: buyerClubId },
    include: {
      manager: { select: { mentality: true, affinityGroup: true, prestige: true } },
      players: { select: { mentality: true, nationality: true, affinityGroup: true } }
    }
  });
  if (!buyerClub) throw new Error('Buyer club not found');

  // Basic numeric estimates: QA6 vincula salario minimo a valor+overall.
  const demandSalary = calcPlayerSalaryDemand(player, { clubReputation: buyerClub.reputation });
  const estSalary = Math.max(player.salary > 0 ? player.salary : 0, demandSalary);
  
  // Calculate years left to determine minimum salary — usa fecha in-game para determinismo
  const now = await getInGameDate();
  let contractYearsLeft = 0;
  if (player.contractEndAt) {
    const endAt = new Date(player.contractEndAt);
    const msLeft = endAt.getTime() - now.getTime();
    contractYearsLeft = Math.max(0, Math.ceil(msLeft / (365 * 24 * 60 * 60 * 1000)));
  }

  const minSalary = Math.round(estSalary * minSalaryFactor(contractYearsLeft > 0 ? contractYearsLeft : undefined));
  const clauseLimit = salary * (CLAUSE_MULT[Math.max(1, Math.min(5, years))] ?? 400);

  const keys = [
    { id: 'salary', label: 'Salario ≥ mínimo del jugador', ok: salary >= minSalary,
      detail: `mínimo ${minSalary.toLocaleString()} €/mes` },
    { id: 'clause', label: 'Cláusula dentro del límite legal', ok: clause <= clauseLimit,
      detail: `límite ${Math.round(clauseLimit).toLocaleString()} € (salario × ${CLAUSE_MULT[Math.max(1, Math.min(5, years))] ?? 400})` },
    { id: 'years', label: 'Años de contrato aceptables', ok: years >= 1 && years <= 5 && player.age < 33,
      detail: player.age >= 33 ? 'con 33+ años no renueva (piensa en la retirada)' : 'máx. 5 temporadas acumuladas' },
    { id: 'morale', label: 'Moral suficiente', ok: player.morale >= 11,
      detail: `moral ${player.morale}% (mín. 11%)` },
  ];

  // 1. Económico
  const sueldoVal = salary < minSalary ? 0 : clamp(50 + ((salary / Math.max(1, minSalary)) - 1) * 120);
  const clausulaVal = clause > clauseLimit ? 0 : clamp((1 - clause / Math.max(1, clauseLimit)) * 99);
  const aniosVal = !keys[2].ok ? 0 : clamp(99 - Math.abs(3 - years) * 12);
  const economico = Math.round((sueldoVal + clausulaVal + aniosVal) / 3);

  // 2. Entorno
  // mentalidad del manager (igual 99% / grupo afín 50% / nada 0%)
  // mentalidad de la plantilla (+15% por cada compañero del mismo grupo)
  // misma nacionalidad (+10% por compañero)
  let managerMentalityScore = 0;
  if (buyerClub.manager) {
    if (buyerClub.manager.mentality === player.mentality) {
      managerMentalityScore = 99;
    } else if (buyerClub.manager.affinityGroup === player.affinityGroup && player.affinityGroup) {
      managerMentalityScore = 50;
    }
  }

  let squadMentalityScore = 0;
  let squadNationalityScore = 0;
  for (const teammate of buyerClub.players) {
    if (teammate.affinityGroup === player.affinityGroup && player.affinityGroup) {
      squadMentalityScore += 15;
    }
    if (teammate.nationality === player.nationality) {
      squadNationalityScore += 10;
    }
  }
  const entorno = clamp(managerMentalityScore + squadMentalityScore + squadNationalityScore);

  // 3. Sentimental
  // ciudad (misma ciudad 99% / mismo país 50%)
  // moral
  let cityScore = 0;
  if (player.club) {
    if (buyerClub.city === player.club.city) {
      cityScore = 99;
    } else if (buyerClub.country === player.club.country) {
      cityScore = 50;
    }
  } else {
    // If free agent and same nationality as club country
    if (buyerClub.country === player.nationality) {
      cityScore = 50;
    }
  }

  // pasado en el equipo (+1% por partido jugado antes en el club comprador)
  // We don't have past matches played strictly saved per club in DB directly unless we query PlayerSeasonStat.
  // We will assume 0 for now or fetch it if needed.
  const pastMatchesScore = 0;

  const sentimental = clamp(Math.round(((player.morale ?? 75) + cityScore + pastMatchesScore) / 2));

  // 4. Expectativas
  // nivel competitivo (1ª 40%, 2ª 30%, resto 20%; +45% Champions/Libertadores, +25% UEFA, +14% copa)
  // nivel del país (99% el 1º del ranking continental, −5% por puesto) -> Simplified to 80 for now if unknown.
  // Actually we can check club division.
  let competitiveScore = 20;
  // Competiciones en las que participa el club (Standing ↔ Competition.type/tier)
  const standings = await prisma.standing.findMany({
    where: { clubId: buyerClubId },
    include: { competition: { select: { type: true, tier: true, name: true } } },
  });

  for (const standing of standings) {
    const comp = standing.competition;
    if (!comp) continue;
    if (comp.type === 'league') {
      if (comp.tier === 1) competitiveScore = Math.max(competitiveScore, 40);
      else if (comp.tier === 2) competitiveScore = Math.max(competitiveScore, 30);
    } else if (comp.type === 'cup') {
      // Continental vs copa nacional (manual §4.3: +45 Champions / +25 UEFA / +14 copa)
      const n = (comp.name ?? '').toLowerCase();
      if (n.includes('champions') || n.includes('libertadores')) competitiveScore += 45;
      else if (n.includes('uefa') || n.includes('sudamericana')) competitiveScore += 25;
      else competitiveScore += 14;
    }
  }

  // Prestigio del manager FDF 2.0 (tabla prestigio §4.4)
  // +20 puntos si el manager tiene 100% de prestigio.
  if (buyerClub.manager?.prestige) {
    const prestigeBonus = Math.round((buyerClub.manager.prestige / 100) * 20);
    competitiveScore += prestigeBonus;
  }

  const expectativas = clamp(competitiveScore + 50); // Baseline 50 + competitive

  const anyKeyFail = keys.some(k => !k.ok);
  const total = anyKeyFail ? 0 : Math.round((entorno + sentimental + expectativas + economico) / 4);

  return { blocks: { entorno, sentimental, expectativas, economico }, keys, total };
}
