-- QA1 (14 jun 2026) · Lock zombie del tick con reloj propio.
-- Migración ADITIVA escrita a mano: el despliegue actual usa `prisma db push`;
-- este SQL mantiene documentado el cambio para entornos con `migrate deploy`.

ALTER TABLE "GameState" ADD COLUMN IF NOT EXISTS "lockUpdatedAt" TIMESTAMP(3);
