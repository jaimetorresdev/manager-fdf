-- AUDIT Carril 1 — Agente A (Manager FDF)
-- ─────────────────────────────────────────────────────────────────────────────
-- P0 — RECONCILIACIÓN DE CADENA (2026-06-20).
-- La versión original de esta migración era un `migrate diff` COMPLETO generado
-- contra una baseline previa a `20260619193000` y `20260619200000`, por lo que
-- REPETÍA:
--   • la conversión de FKs a `onDelete: Cascade` y los 3 uniques de 193000;
--   • los retipos money (`wage`/`startPrice`/`amount`→INTEGER), `lastProgressTurn`
--     y los ~35 índices de FK de 200000.
-- Como NUNCA se desplegó (BD inalcanzable hasta esta sesión), se reduce a sus
-- cambios REALMENTE NUEVOS (instrucción P0 #3). Se conservan guardas
-- `IF NOT EXISTS` para que aplique idempotente tanto desde BD vacía como sobre
-- una BD que ya tenga 193000/200000 (instrucción P0 #4).
-- ─────────────────────────────────────────────────────────────────────────────

-- AlterTable: columnas nuevas (estilo de juego, sanción de mánager por turno,
-- fatiga/motivación de jugador, cutover birthDateAt, name/position en stats).
ALTER TABLE "Club"
  ADD COLUMN IF NOT EXISTS "defensiveStyleContinuity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "offensiveStyleContinuity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Coach"
  ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'FIRST_TEAM';

ALTER TABLE "Country"
  ADD COLUMN IF NOT EXISTS "confederation" TEXT;

ALTER TABLE "Manager"
  ADD COLUMN IF NOT EXISTS "suspendedUntilTurn" INTEGER;

ALTER TABLE "Player"
  ADD COLUMN IF NOT EXISTS "accumulatedFatigue" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "birthDateAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isPermanentlyMotivated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "motivatedUntilTurn" INTEGER;

ALTER TABLE "PlayerMatchStat"
  ADD COLUMN IF NOT EXISTS "name" TEXT,
  ADD COLUMN IF NOT EXISTS "position" TEXT;

ALTER TABLE "TrainedPlay"
  ADD COLUMN IF NOT EXISTS "executorPlayerIds" TEXT;

-- CreateTable: idempotencia del tick (TickRun/TickStep, H-20/2.8) y registro de
-- inspecciones especiales de ojeo.
CREATE TABLE IF NOT EXISTS "TickRun" (
    "id" SERIAL NOT NULL,
    "turn" INTEGER NOT NULL,
    "seasonId" INTEGER,
    "inGameDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "TickRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TickStep" (
    "id" SERIAL NOT NULL,
    "tickRunId" INTEGER NOT NULL,
    "step" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'done',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TickStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlayerSpecialInspection" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "turn" INTEGER NOT NULL,
    "revealed" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerSpecialInspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: índices de las tablas nuevas.
CREATE UNIQUE INDEX IF NOT EXISTS "TickRun_turn_key" ON "TickRun"("turn");
CREATE INDEX IF NOT EXISTS "TickRun_status_idx" ON "TickRun"("status");
CREATE INDEX IF NOT EXISTS "TickStep_tickRunId_idx" ON "TickStep"("tickRunId");
CREATE UNIQUE INDEX IF NOT EXISTS "TickStep_tickRunId_step_key" ON "TickStep"("tickRunId", "step");
CREATE INDEX IF NOT EXISTS "PlayerSpecialInspection_playerId_idx" ON "PlayerSpecialInspection"("playerId");
CREATE INDEX IF NOT EXISTS "PlayerSpecialInspection_clubId_turn_idx" ON "PlayerSpecialInspection"("clubId", "turn");

-- AddForeignKey: FKs de las tablas nuevas (no existen en 193000/200000).
ALTER TABLE "TickStep" DROP CONSTRAINT IF EXISTS "TickStep_tickRunId_fkey";
ALTER TABLE "TickStep" ADD CONSTRAINT "TickStep_tickRunId_fkey" FOREIGN KEY ("tickRunId") REFERENCES "TickRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlayerSpecialInspection" DROP CONSTRAINT IF EXISTS "PlayerSpecialInspection_playerId_fkey";
ALTER TABLE "PlayerSpecialInspection" ADD CONSTRAINT "PlayerSpecialInspection_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
