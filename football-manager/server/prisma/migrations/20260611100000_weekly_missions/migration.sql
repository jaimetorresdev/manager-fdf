-- QW-20 (BLOQUE Q · 11 jun 2026): misiones semanales por mánager.
-- 3 misiones/semana in-game generadas en el tick, evaluación automática al
-- cerrar jornada, recompensa en XP/prestigio (cero dinero, cero P2W).

CREATE TABLE "WeeklyMission" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "weekKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rewardXp" INTEGER NOT NULL DEFAULT 50,
    "rewardPrestige" INTEGER NOT NULL DEFAULT 1,
    "baseline" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyMission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyMission_managerId_weekKey_type_key" ON "WeeklyMission"("managerId", "weekKey", "type");

CREATE INDEX "WeeklyMission_managerId_status_idx" ON "WeeklyMission"("managerId", "status");

ALTER TABLE "WeeklyMission" ADD CONSTRAINT "WeeklyMission_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
