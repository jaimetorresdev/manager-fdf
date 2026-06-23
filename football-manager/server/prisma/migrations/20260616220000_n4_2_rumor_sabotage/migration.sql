-- N4-2 · Sabotaje informativo en rumorómetro
CREATE TABLE IF NOT EXISTS "RumorSabotage" (
    "id" SERIAL NOT NULL,
    "attackerManagerId" INTEGER NOT NULL,
    "targetClubId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "seasonWeek" INTEGER NOT NULL,
    "prestigeSpent" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "debunked" BOOLEAN NOT NULL DEFAULT false,
    "debunkedAt" TIMESTAMP(3),
    "debunkManagerId" INTEGER,
    "moodPenalty" INTEGER NOT NULL DEFAULT 8,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RumorSabotage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RumorSabotage_attackerManagerId_targetClubId_seasonId_seasonWeek_key"
  ON "RumorSabotage"("attackerManagerId", "targetClubId", "seasonId", "seasonWeek");
CREATE INDEX IF NOT EXISTS "RumorSabotage_targetClubId_seasonId_seasonWeek_idx"
  ON "RumorSabotage"("targetClubId", "seasonId", "seasonWeek");

ALTER TABLE "RumorSabotage" DROP CONSTRAINT IF EXISTS "RumorSabotage_attackerManagerId_fkey";
ALTER TABLE "RumorSabotage" ADD CONSTRAINT "RumorSabotage_attackerManagerId_fkey"
  FOREIGN KEY ("attackerManagerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RumorSabotage" DROP CONSTRAINT IF EXISTS "RumorSabotage_targetClubId_fkey";
ALTER TABLE "RumorSabotage" ADD CONSTRAINT "RumorSabotage_targetClubId_fkey"
  FOREIGN KEY ("targetClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
