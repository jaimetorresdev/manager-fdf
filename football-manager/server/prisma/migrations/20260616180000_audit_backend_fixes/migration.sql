-- tokenVersion para invalidar JWT tras cambio de contraseña
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Índice para getLatest de rankings por tipo
CREATE INDEX IF NOT EXISTS "RankingSnapshot_type_id_idx" ON "RankingSnapshot"("type", "id");
