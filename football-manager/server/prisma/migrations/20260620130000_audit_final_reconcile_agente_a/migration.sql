-- AUDIT FINAL — Agente A (Manager FDF) — 2026-06-20
-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRACIÓN RECONCILIADORA (instrucción P0 #4).
-- `schema.prisma` declara relaciones / índices únicos que NINGUNA migración previa
-- creaba (se editaron en el modelo pero las migraciones nunca se generaron porque
-- la BD estaba inalcanzable). `prisma migrate diff --from-url <db> --to-schema`
-- reportaba drift. Esta migración cierra ese drift de forma IDEMPOTENTE y con
-- preámbulo de deduplicación seguro (no-op sobre BD vacía) para los nuevos uniques.
-- Cubre H-28 (FKs lógicas → relaciones reales): Club.mainShareholderClubId,
-- Player.loanOwnerClubId, NationalTeam.managerSelectorId, ScoutAssignment.scoutStaffId,
-- SeasonHistory.topScorerId; + unique canónico Share(clubId, ownerId).
-- ─────────────────────────────────────────────────────────────────────────────

-- PREÁMBULO DE DEDUPLICACIÓN (idempotente; no toca nada si no hay duplicados).
-- Share: a lo sumo una fila por (club, propietario). Conserva el id más bajo.
DELETE FROM "Share" a USING "Share" b
  WHERE a.id > b.id AND a."clubId" = b."clubId" AND a."ownerId" = b."ownerId";

-- NationalTeam.managerSelectorId es nullable (onDelete SET NULL). Si un mánager
-- figura como seleccionador en >1 selección, se conserva la de id más bajo y se
-- libera el resto (no destruye selecciones, solo vacía el puntero duplicado).
UPDATE "NationalTeam" nt SET "managerSelectorId" = NULL
  WHERE nt."managerSelectorId" IS NOT NULL
    AND nt.id > (
      SELECT MIN(nt2.id) FROM "NationalTeam" nt2
      WHERE nt2."managerSelectorId" = nt."managerSelectorId"
    );

-- CreateIndex (uniques nuevos).
CREATE UNIQUE INDEX IF NOT EXISTS "NationalTeam_managerSelectorId_key" ON "NationalTeam"("managerSelectorId");
CREATE UNIQUE INDEX IF NOT EXISTS "Share_clubId_ownerId_key" ON "Share"("clubId", "ownerId");

-- AddForeignKey (relaciones reales por FKs lógicas — H-28).
ALTER TABLE "Club" DROP CONSTRAINT IF EXISTS "Club_mainShareholderClubId_fkey";
ALTER TABLE "Club" ADD CONSTRAINT "Club_mainShareholderClubId_fkey" FOREIGN KEY ("mainShareholderClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Player" DROP CONSTRAINT IF EXISTS "Player_loanOwnerClubId_fkey";
ALTER TABLE "Player" ADD CONSTRAINT "Player_loanOwnerClubId_fkey" FOREIGN KEY ("loanOwnerClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NationalTeam" DROP CONSTRAINT IF EXISTS "NationalTeam_managerSelectorId_fkey";
ALTER TABLE "NationalTeam" ADD CONSTRAINT "NationalTeam_managerSelectorId_fkey" FOREIGN KEY ("managerSelectorId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScoutAssignment" DROP CONSTRAINT IF EXISTS "ScoutAssignment_scoutStaffId_fkey";
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_scoutStaffId_fkey" FOREIGN KEY ("scoutStaffId") REFERENCES "StaffMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SeasonHistory" DROP CONSTRAINT IF EXISTS "SeasonHistory_topScorerId_fkey";
ALTER TABLE "SeasonHistory" ADD CONSTRAINT "SeasonHistory_topScorerId_fkey" FOREIGN KEY ("topScorerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex (alineación de nombre con el truncado canónico de Prisma).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'RumorSabotage_attackerManagerId_targetClubId_seasonId_seasonWee')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'RumorSabotage_attackerManagerId_targetClubId_seasonId_seaso_key') THEN
    ALTER INDEX "RumorSabotage_attackerManagerId_targetClubId_seasonId_seasonWee"
      RENAME TO "RumorSabotage_attackerManagerId_targetClubId_seasonId_seaso_key";
  END IF;
END $$;
