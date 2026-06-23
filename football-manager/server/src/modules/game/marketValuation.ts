import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import {
  calcPlayerMarketValue,
  calcPlayerSalaryDemand,
  nextSalaryTowardsDemand,
} from '../../lib/playerValuation';

type MarketValueRow = {
  id: number;
  marketValue: number;
  salary: number;
  salaryAdjusted: boolean;
};

export type MarketRecalcResult = {
  players: number;
  salariesAdjusted: number;
};

async function bulkUpdateMarketValues(rows: MarketValueRow[]): Promise<MarketRecalcResult> {
  if (rows.length === 0) return { players: 0, salariesAdjusted: 0 };

  let updated = 0;
  let salariesAdjusted = 0;
  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valueWhens = chunk.map((row) => Prisma.sql`WHEN ${row.id} THEN ${row.marketValue}`);
    const salaryWhens = chunk.map((row) => Prisma.sql`WHEN ${row.id} THEN ${row.salary}`);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Player"
      SET
        "marketValue" = CASE "id" ${Prisma.join(valueWhens, ' ')} ELSE "marketValue" END,
        "wage" = CASE "id" ${Prisma.join(salaryWhens, ' ')} ELSE "wage" END
      WHERE "id" IN (${Prisma.join(chunk.map((row) => row.id))})
    `);
    updated += chunk.length;
    salariesAdjusted += chunk.filter((row) => row.salaryAdjusted).length;
  }

  return { players: updated, salariesAdjusted };
}

/** Recalcula marketValue y acerca salarios a demanda realista segun valor/overall. */
export async function recalcAllMarketValues(): Promise<MarketRecalcResult> {
  const players = await prisma.player.findMany({
    where: { clubId: { not: null } },
    select: {
      id: true,
      age: true,
      potential: true,
      position: true,
      detailedPosition: true,
      passing: true,
      tackling: true,
      shooting: true,
      organization: true,
      unmarking: true,
      finishing: true,
      dribbling: true,
      fouls: true,
      goalkeeping: true,
      reflexes: true,
      marketValue: true,
      wage: true,
      club: { select: { reputation: true } },
    },
  });

  const values = players.map((player) => {
    const marketValue = calcPlayerMarketValue(player);
    const currentSalary = Math.round(Number(player.wage) || 500);
    const targetSalary = calcPlayerSalaryDemand(
      { ...player, marketValue },
      { clubReputation: player.club?.reputation },
    );
    const salary = nextSalaryTowardsDemand(currentSalary, targetSalary);
    return {
      id: player.id,
      marketValue,
      salary,
      salaryAdjusted: salary > currentSalary,
    };
  });

  return bulkUpdateMarketValues(values);
}
