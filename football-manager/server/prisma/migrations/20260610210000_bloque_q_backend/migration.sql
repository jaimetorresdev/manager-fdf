-- BLOQUE Q (10 jun 2026) · Backend del QA de Jaime — migración ADITIVA escrita a mano.
-- Mismo patrón que 20260610090000: el despliegue actual usa `prisma db push`;
-- este SQL existe para entornos con `migrate deploy` y como documentación.

-- Q2 · Jornada relativa a la temporada (week sigue siendo acumulada, NO se toca)
ALTER TABLE "GameState" ADD COLUMN IF NOT EXISTS "seasonWeek" INTEGER NOT NULL DEFAULT 1;

-- Q25 · Último login real para "mánagers activos" (<30 días)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

-- Q22 · Foto de perfil subida (≤512KB, validada por magic bytes)
ALTER TABLE "Manager" ADD COLUMN IF NOT EXISTS "avatarImage" BYTEA;
ALTER TABLE "Manager" ADD COLUMN IF NOT EXISTS "avatarImageMime" TEXT;

-- Q7 · Desbloqueos reales de ideología (puntos por temporada, manual §8.2)
CREATE TABLE IF NOT EXISTS "IdeologyUnlock" (
    "id"         SERIAL PRIMARY KEY,
    "clubId"     INTEGER NOT NULL,
    "seasonId"   INTEGER NOT NULL,
    "upgradeKey" TEXT NOT NULL,
    "cost"       INTEGER NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "IdeologyUnlock_clubId_seasonId_idx"
  ON "IdeologyUnlock"("clubId", "seasonId");
