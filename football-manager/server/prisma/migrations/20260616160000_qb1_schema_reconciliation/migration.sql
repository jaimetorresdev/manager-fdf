-- QB1 (16 jun 2026) · Reconcile schema.prisma with versioned migrations.
-- Production uses `prisma migrate deploy`, so every schema object used by
-- Prisma Client must exist in migration SQL. This file is additive and safe for
-- databases that were previously synchronized with `prisma db push`.

-- Club identity fields added after the baseline migration.
ALTER TABLE "Club"
  ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#000000',
  ADD COLUMN IF NOT EXISTS "secondaryColor" TEXT NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN IF NOT EXISTS "vacancyOpenedAt" TIMESTAMP(3);

-- Competition phase metadata used by European/cup scheduling.
ALTER TABLE "Competition"
  ADD COLUMN IF NOT EXISTS "format" TEXT DEFAULT 'round_robin',
  ADD COLUMN IF NOT EXISTS "isContinental" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "parentId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Competition_parentId_fkey'
  ) THEN
    ALTER TABLE "Competition"
      ADD CONSTRAINT "Competition_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Competition"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Matchday knockout metadata.
ALTER TABLE "Matchday"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'league',
  ADD COLUMN IF NOT EXISTS "isKnockout" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "leg" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "dateLabel" TEXT;

-- Match knockout/bracket metadata.
ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "winner" TEXT,
  ADD COLUMN IF NOT EXISTS "decidedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "penaltiesHome" INTEGER,
  ADD COLUMN IF NOT EXISTS "penaltiesAway" INTEGER,
  ADD COLUMN IF NOT EXISTS "round" TEXT,
  ADD COLUMN IF NOT EXISTS "leg" INTEGER,
  ADD COLUMN IF NOT EXISTS "isKnockout" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nextMatchId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Match_nextMatchId_fkey'
  ) THEN
    ALTER TABLE "Match"
      ADD CONSTRAINT "Match_nextMatchId_fkey"
      FOREIGN KEY ("nextMatchId") REFERENCES "Match"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Transfer turn marker used by the window/tick pipeline.
ALTER TABLE "TransferOffer"
  ADD COLUMN IF NOT EXISTS "turn" INTEGER NOT NULL DEFAULT 0;

-- Prestige logs.
CREATE TABLE IF NOT EXISTS "ManagerPrestigeLog" (
  "id" SERIAL NOT NULL,
  "managerId" INTEGER NOT NULL,
  "seasonId" INTEGER,
  "description" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManagerPrestigeLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ManagerPrestigeLog_managerId_fkey'
  ) THEN
    ALTER TABLE "ManagerPrestigeLog"
      ADD CONSTRAINT "ManagerPrestigeLog_managerId_fkey"
      FOREIGN KEY ("managerId") REFERENCES "Manager"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Match comments.
CREATE TABLE IF NOT EXISTS "MatchComment" (
  "id" SERIAL NOT NULL,
  "matchId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "minute" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatchComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MatchComment_matchId_idx" ON "MatchComment"("matchId");
CREATE INDEX IF NOT EXISTS "MatchComment_userId_idx" ON "MatchComment"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MatchComment_matchId_fkey'
  ) THEN
    ALTER TABLE "MatchComment"
      ADD CONSTRAINT "MatchComment_matchId_fkey"
      FOREIGN KEY ("matchId") REFERENCES "Match"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MatchComment_userId_fkey'
  ) THEN
    ALTER TABLE "MatchComment"
      ADD CONSTRAINT "MatchComment_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- European coefficients and slot allocation.
CREATE TABLE IF NOT EXISTS "ClubCoefficient" (
  "id" SERIAL NOT NULL,
  "clubId" INTEGER NOT NULL,
  "seasonId" INTEGER NOT NULL,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  CONSTRAINT "ClubCoefficient_pkey" PRIMARY KEY ("id")
);

DELETE FROM "ClubCoefficient" s USING "ClubCoefficient" d
  WHERE s."clubId" = d."clubId"
    AND s."seasonId" = d."seasonId"
    AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "ClubCoefficient_clubId_seasonId_key"
  ON "ClubCoefficient"("clubId", "seasonId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClubCoefficient_clubId_fkey'
  ) THEN
    ALTER TABLE "ClubCoefficient"
      ADD CONSTRAINT "ClubCoefficient_clubId_fkey"
      FOREIGN KEY ("clubId") REFERENCES "Club"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClubCoefficient_seasonId_fkey'
  ) THEN
    ALTER TABLE "ClubCoefficient"
      ADD CONSTRAINT "ClubCoefficient_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LeagueCoefficient" (
  "id" SERIAL NOT NULL,
  "country" TEXT NOT NULL,
  "seasonId" INTEGER NOT NULL,
  "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "numClubs" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "LeagueCoefficient_pkey" PRIMARY KEY ("id")
);

DELETE FROM "LeagueCoefficient" s USING "LeagueCoefficient" d
  WHERE s."country" = d."country"
    AND s."seasonId" = d."seasonId"
    AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "LeagueCoefficient_country_seasonId_key"
  ON "LeagueCoefficient"("country", "seasonId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LeagueCoefficient_seasonId_fkey'
  ) THEN
    ALTER TABLE "LeagueCoefficient"
      ADD CONSTRAINT "LeagueCoefficient_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "EuropeanSlotAllocation" (
  "id" SERIAL NOT NULL,
  "country" TEXT NOT NULL,
  "seasonId" INTEGER NOT NULL,
  "ucl" INTEGER NOT NULL DEFAULT 0,
  "uel" INTEGER NOT NULL DEFAULT 0,
  "uecl" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EuropeanSlotAllocation_pkey" PRIMARY KEY ("id")
);

DELETE FROM "EuropeanSlotAllocation" s USING "EuropeanSlotAllocation" d
  WHERE s."country" = d."country"
    AND s."seasonId" = d."seasonId"
    AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "EuropeanSlotAllocation_country_seasonId_key"
  ON "EuropeanSlotAllocation"("country", "seasonId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EuropeanSlotAllocation_seasonId_fkey'
  ) THEN
    ALTER TABLE "EuropeanSlotAllocation"
      ADD CONSTRAINT "EuropeanSlotAllocation_seasonId_fkey"
      FOREIGN KEY ("seasonId") REFERENCES "Season"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Club legends.
CREATE TABLE IF NOT EXISTS "ClubLegend" (
  "id" SERIAL NOT NULL,
  "clubId" INTEGER NOT NULL,
  "playerId" INTEGER,
  "name" TEXT NOT NULL,
  "position" TEXT NOT NULL,
  "nationality" TEXT NOT NULL,
  "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
  "goals" INTEGER NOT NULL DEFAULT 0,
  "assists" INTEGER NOT NULL DEFAULT 0,
  "legendScore" INTEGER NOT NULL DEFAULT 0,
  "retiredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubLegend_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ClubLegend_clubId_fkey'
  ) THEN
    ALTER TABLE "ClubLegend"
      ADD CONSTRAINT "ClubLegend_clubId_fkey"
      FOREIGN KEY ("clubId") REFERENCES "Club"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
