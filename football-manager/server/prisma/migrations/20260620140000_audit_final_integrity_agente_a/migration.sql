-- AUDIT FINAL — Integridad referencial Agente A — 2026-06-20
-- ─────────────────────────────────────────────────────────────────────────────
-- PREÁMBULOS DE DEDUPLICACIÓN / NORMALIZACIÓN (idempotentes; no-op sobre BD vacía).
-- Deben correr ANTES de los CREATE UNIQUE INDEX y ADD CONSTRAINT de abajo.
-- ─────────────────────────────────────────────────────────────────────────────

-- Rivalry — H (L-schema-rivalry-unique): par único canónico SIN par invertido.
-- 1) Normaliza el orden para que clubAId < clubBId (los lectores comparan el conjunto).
UPDATE "Rivalry"
   SET "clubAId" = "clubBId", "clubBId" = "clubAId"
 WHERE "clubAId" > "clubBId";
-- 2) Elimina autorrivalidades inválidas (mismo club) que romperían el CHECK.
DELETE FROM "Rivalry" WHERE "clubAId" = "clubBId";
-- 3) Dedup del par exacto, conservando el id más bajo (antes del unique).
DELETE FROM "Rivalry" a USING "Rivalry" b
  WHERE a.id > b.id AND a."clubAId" = b."clubAId" AND a."clubBId" = b."clubBId";

-- DraftPick — dedup de picks duplicados antes de los uniques (idempotencia del draft).
DELETE FROM "DraftPick" a USING "DraftPick" b
  WHERE a.id > b.id AND a."draftId" = b."draftId" AND a."pickNumber" = b."pickNumber";
DELETE FROM "DraftPick" a USING "DraftPick" b
  WHERE a.id > b.id AND a."draftId" = b."draftId"
    AND a."playerId" IS NOT NULL AND a."playerId" = b."playerId";

-- GameState — un único estado activo (L-schema-gamestate-active).
-- Deja activo SOLO el de id más alto (el más reciente) si hubiera varios.
UPDATE "GameState" SET "isActive" = false
 WHERE "isActive" = true
   AND id < (SELECT MAX(id) FROM "GameState" WHERE "isActive" = true);
-- DropForeignKey
ALTER TABLE "Competition" DROP CONSTRAINT "Competition_seasonId_fkey";

-- DropForeignKey
ALTER TABLE "DraftPick" DROP CONSTRAINT "DraftPick_draftId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_awayClubId_fkey";

-- DropForeignKey
ALTER TABLE "Match" DROP CONSTRAINT "Match_homeClubId_fkey";

-- DropForeignKey
ALTER TABLE "Matchday" DROP CONSTRAINT "Matchday_competitionId_fkey";

-- DropForeignKey
ALTER TABLE "Rivalry" DROP CONSTRAINT "Rivalry_clubAId_fkey";

-- DropForeignKey
ALTER TABLE "Rivalry" DROP CONSTRAINT "Rivalry_clubBId_fkey";

-- DropForeignKey
ALTER TABLE "Standing" DROP CONSTRAINT "Standing_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Standing" DROP CONSTRAINT "Standing_competitionId_fkey";

-- CreateIndex
CREATE INDEX "Auction_winningClubId_idx" ON "Auction"("winningClubId");

-- CreateIndex
CREATE INDEX "DraftPick_draftId_idx" ON "DraftPick"("draftId");

-- CreateIndex
CREATE INDEX "DraftPick_clubId_idx" ON "DraftPick"("clubId");

-- CreateIndex
CREATE INDEX "DraftPick_playerId_idx" ON "DraftPick"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_pickNumber_key" ON "DraftPick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_draftId_playerId_key" ON "DraftPick"("draftId", "playerId");

-- CreateIndex
CREATE INDEX "Matchday_competitionId_idx" ON "Matchday"("competitionId");

-- CreateIndex
CREATE INDEX "Matchday_groupId_idx" ON "Matchday"("groupId");

-- CreateIndex
CREATE INDEX "Rivalry_clubBId_idx" ON "Rivalry"("clubBId");

-- CreateIndex
CREATE UNIQUE INDEX "Rivalry_clubAId_clubBId_key" ON "Rivalry"("clubAId", "clubBId");

-- CreateIndex
CREATE INDEX "Standing_clubId_idx" ON "Standing"("clubId");

-- CreateIndex
CREATE INDEX "TransferAgreement_toClubId_idx" ON "TransferAgreement"("toClubId");

-- CreateIndex
CREATE INDEX "TransferAgreement_offeredPlayerId_idx" ON "TransferAgreement"("offeredPlayerId");

-- CreateIndex
CREATE INDEX "TransferAgreement_proposerManagerId_idx" ON "TransferAgreement"("proposerManagerId");

-- CreateIndex
CREATE INDEX "TransferAgreement_counterpartyManagerId_idx" ON "TransferAgreement"("counterpartyManagerId");

-- CreateIndex
CREATE INDEX "TransferAgreement_parentId_idx" ON "TransferAgreement"("parentId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchday" ADD CONSTRAINT "Matchday_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_winningClubId_fkey" FOREIGN KEY ("winningClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_offeredPlayerId_fkey" FOREIGN KEY ("offeredPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_proposerManagerId_fkey" FOREIGN KEY ("proposerManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_counterpartyManagerId_fkey" FOREIGN KEY ("counterpartyManagerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TransferAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_clubAId_fkey" FOREIGN KEY ("clubAId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_clubBId_fkey" FOREIGN KEY ("clubBId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONSTRAINTS ADICIONALES no expresables en el schema Prisma (raw SQL).
-- ─────────────────────────────────────────────────────────────────────────────

-- Rivalry — CHECK que veta el par INVERTIDO a nivel de BD (complementa el @@unique).
-- Con la normalización del preámbulo (clubAId < clubBId) toda fila lo cumple.
ALTER TABLE "Rivalry" DROP CONSTRAINT IF EXISTS "Rivalry_canonical_order";
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_canonical_order" CHECK ("clubAId" < "clubBId");

-- GameState — índice ÚNICO PARCIAL: a lo sumo una fila con isActive = true.
-- Garantía DB de "un único estado activo" (no expresable en el schema Prisma).
CREATE UNIQUE INDEX IF NOT EXISTS "GameState_single_active_key"
  ON "GameState" ("isActive") WHERE "isActive";
