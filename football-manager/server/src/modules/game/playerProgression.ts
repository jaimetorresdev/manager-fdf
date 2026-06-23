import { Prisma } from '@prisma/client';
import prisma from '../../db/prisma';
import type { DevelopDelta } from '../simulation/engineClient';
import {
  isProgressionSkill,
  progressionAttributeCeiling,
  resolveProgressionValue,
} from './playerProgression.rules';

const PLAYER_DELTA_FIELDS = [
  'passing',
  'tackling',
  'shooting',
  'organization',
  'unmarking',
  'finishing',
  'dribbling',
  'fouls',
  'goalkeeping',
  'fitness',
  'muscularFitness',
  'mentalSharpness',
  'matchRhythm',
  'morale',
  'experience',
] as const;

type PlayerDeltaField = typeof PLAYER_DELTA_FIELDS[number];

type PlayerDeltaUpdate = {
  id: number;
  data: Partial<Record<PlayerDeltaField, number>>;
};

function numericDelta(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.round(raw) : 0;
}

function column(field: PlayerDeltaField) {
  return Prisma.raw(`"${field}"`);
}

async function bulkUpdatePlayerDeltas(rows: PlayerDeltaUpdate[]): Promise<number> {
  const updates = rows.filter((row) => Object.keys(row.data).length > 0);
  if (updates.length === 0) return 0;

  let updated = 0;
  const chunkSize = 500;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const setFragments = PLAYER_DELTA_FIELDS.flatMap((field) => {
      const whens = chunk
        .filter((row) => row.data[field] !== undefined)
        .map((row) => Prisma.sql`WHEN ${row.id} THEN ${row.data[field]}`);
      if (whens.length === 0) return [];
      return [Prisma.sql`${column(field)} = CASE "id" ${Prisma.join(whens, ' ')} ELSE ${column(field)} END`];
    });

    if (setFragments.length === 0) continue;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Player"
      SET ${Prisma.join(setFragments, ', ')}
      WHERE "id" IN (${Prisma.join(chunk.map((row) => row.id))})
    `);
    updated += chunk.length;
  }

  return updated;
}

export async function applyPlayerDeltas(deltas: DevelopDelta[]): Promise<number> {
  const playerDeltas = deltas.filter((delta) => typeof delta.playerId === 'number');
  if (playerDeltas.length === 0) return 0;

  const players = await prisma.player.findMany({
    where: { id: { in: playerDeltas.map((delta) => delta.playerId as number) } },
  });
  const byId = new Map(players.map((player) => [player.id, player]));

  const updates: PlayerDeltaUpdate[] = [];
  for (const delta of playerDeltas) {
    const player = byId.get(delta.playerId as number);
    if (!player) continue;
    const data: Partial<Record<PlayerDeltaField, number>> = {};

    for (const field of PLAYER_DELTA_FIELDS) {
      const change = numericDelta(delta.deltas[field]);
      const current = typeof player[field] === 'number' ? player[field] : 50;
      const needsCeilingCorrection = isProgressionSkill(field)
        && player.age >= 30
        && current > progressionAttributeCeiling(player);
      if (!change && !needsCeilingCorrection) continue;
      data[field] = resolveProgressionValue(current, change, field, player);
    }

    if (Object.keys(data).length > 0) updates.push({ id: player.id, data });
  }

  return bulkUpdatePlayerDeltas(updates);
}
