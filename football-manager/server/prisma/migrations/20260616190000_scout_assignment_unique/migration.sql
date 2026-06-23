-- Dedupe scout assignments before unique constraint
DELETE FROM "ScoutAssignment" a
USING "ScoutAssignment" b
WHERE a."scoutStaffId" = b."scoutStaffId"
  AND a."clubTargetId" = b."clubTargetId"
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS "ScoutAssignment_scoutStaffId_clubTargetId_key"
  ON "ScoutAssignment"("scoutStaffId", "clubTargetId");
