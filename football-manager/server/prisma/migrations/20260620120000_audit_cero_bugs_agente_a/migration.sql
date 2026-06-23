-- AUDIT "Cero Bugs" — Agente A (2026-06-20)
-- Cambios de esquema en territorio A. Esta migración NO se aplicó en la sesión de
-- desarrollo (host de BD `postgres:5432` inalcanzable); aplicar en deploy con
-- `prisma migrate deploy`. Incluye un preámbulo de deduplicación seguro para el
-- nuevo `@@unique` de `Club.name`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.6 · Manager.clubJoinedAt (aditiva, nullable): acota `currentClubRecord` a los
-- partidos disputados desde que el mánager se incorporó a su club actual.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "Manager" ADD COLUMN "clubJoinedAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 · ChatChannel: separar `type` de `scopeId` y mover la unicidad al par
-- `[type, scopeId]` (antes `type @unique` impedía dos canales del mismo tipo, p. ej.
-- un único chat de liga para todas las ligas). `scopeId` nullable conserva la
-- unicidad de los canales globales existentes como `[type, NULL]`.
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX "ChatChannel_type_key";
ALTER TABLE "ChatChannel" ADD COLUMN "scopeId" INTEGER;
CREATE UNIQUE INDEX "ChatChannel_type_scopeId_key" ON "ChatChannel"("type", "scopeId");

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.1 · Club.name @unique. Preámbulo de deduplicación: a cualquier club cuyo nombre
-- coincida con el de otro club de id MENOR se le añade el sufijo " #<id>", de modo
-- que el índice único pueda crearse sobre datos con posibles duplicados sin fallar.
-- (El primer club —id más bajo— conserva el nombre original.)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE "Club" c
SET "name" = c."name" || ' #' || c."id"
WHERE EXISTS (
  SELECT 1 FROM "Club" d WHERE d."name" = c."name" AND d."id" < c."id"
);
CREATE UNIQUE INDEX "Club_name_key" ON "Club"("name");
