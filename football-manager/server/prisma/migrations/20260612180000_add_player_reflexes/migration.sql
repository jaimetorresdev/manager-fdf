-- 12 jun 2026: añade campo reflexes (REF) a Player.
-- salidas = goalkeeping (ya existente). reflexes es el segundo atributo exclusivo de porteros.
-- Para porteros existentes se inicializa igual que goalkeeping; para el resto queda en 50.

ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "reflexes" INTEGER NOT NULL DEFAULT 50;

-- Igualar reflexes al valor de goalkeeping en porteros ya existentes
UPDATE "Player"
SET "reflexes" = "goalkeeping"
WHERE "position" IN ('POR', 'PO', 'GK');
