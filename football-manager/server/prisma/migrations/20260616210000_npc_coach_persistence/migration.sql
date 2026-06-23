-- X3 · Entrenadores NPC con carrera persistida
CREATE TABLE IF NOT EXISTS "NpcCoach" (
    "id" TEXT NOT NULL,
    "currentClubId" INTEGER,
    "name" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "avatarSeed" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "tenureStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousClubs" INTEGER NOT NULL DEFAULT 0,
    "promotions" INTEGER NOT NULL DEFAULT 0,
    "careerStage" TEXT NOT NULL DEFAULT 'emergente',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpcCoach_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NpcCoachCareerEntry" (
    "id" SERIAL NOT NULL,
    "npcCoachId" TEXT NOT NULL,
    "clubId" INTEGER NOT NULL,
    "clubName" TEXT NOT NULL,
    "season" TEXT,
    "event" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NpcCoachCareerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NpcCoach_currentClubId_key" ON "NpcCoach"("currentClubId");
CREATE INDEX IF NOT EXISTS "NpcCoachCareerEntry_npcCoachId_idx" ON "NpcCoachCareerEntry"("npcCoachId");

ALTER TABLE "NpcCoach" DROP CONSTRAINT IF EXISTS "NpcCoach_currentClubId_fkey";
ALTER TABLE "NpcCoach" ADD CONSTRAINT "NpcCoach_currentClubId_fkey" FOREIGN KEY ("currentClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NpcCoachCareerEntry" DROP CONSTRAINT IF EXISTS "NpcCoachCareerEntry_npcCoachId_fkey";
ALTER TABLE "NpcCoachCareerEntry" ADD CONSTRAINT "NpcCoachCareerEntry_npcCoachId_fkey" FOREIGN KEY ("npcCoachId") REFERENCES "NpcCoach"("id") ON DELETE CASCADE ON UPDATE CASCADE;
