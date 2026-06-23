-- Bloque Y pre-Z1: escalado 50 ligas y contratos publicos de mundo.
-- Aditivo e idempotente para bases ya vivas.

ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "humanStatus" TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "defaultSimulationTier" TEXT NOT NULL DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS "activityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "humanManagersCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastHumanLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processingShard" TEXT;

ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "simulationTier" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "priorityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "hasTimeline" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "hasAdvancedStats" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "Competition_seasonId_type_country_tier_idx"
  ON "Competition"("seasonId", "type", "country", "tier");

CREATE INDEX IF NOT EXISTS "Competition_humanStatus_type_tier_idx"
  ON "Competition"("humanStatus", "type", "tier");

CREATE INDEX IF NOT EXISTS "Competition_processingShard_idx"
  ON "Competition"("processingShard");

CREATE INDEX IF NOT EXISTS "Match_simulationTier_status_idx"
  ON "Match"("simulationTier", "status");

CREATE INDEX IF NOT EXISTS "Match_priorityScore_idx"
  ON "Match"("priorityScore");
