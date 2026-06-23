-- QB6 (16 jun 2026) · Unique constraints for check-then-create flows.
-- Deduplicate first so `prisma migrate deploy` can run on databases that may
-- already contain duplicate rows from concurrent requests.

DELETE FROM "TrainingSession" s USING "TrainingSession" d
  WHERE s."turnId" = d."turnId"
    AND s."clubId" = d."clubId"
    AND s."type" = d."type"
    AND s."id" > d."id";

CREATE UNIQUE INDEX IF NOT EXISTS "TrainingSession_turnId_clubId_type_key"
  ON "TrainingSession"("turnId", "clubId", "type");

DELETE FROM "SelectorCall" s USING "SelectorCall" d
  WHERE s."nationalTeamId" = d."nationalTeamId"
    AND s."playerId" = d."playerId"
    AND s."id" > d."id";

CREATE UNIQUE INDEX IF NOT EXISTS "SelectorCall_nationalTeamId_playerId_key"
  ON "SelectorCall"("nationalTeamId", "playerId");

DELETE FROM "Vote" s USING "Vote" d
  WHERE s."electionId" = d."electionId"
    AND s."voterManagerId" = d."voterManagerId"
    AND s."id" > d."id";

CREATE UNIQUE INDEX IF NOT EXISTS "Vote_electionId_voterManagerId_key"
  ON "Vote"("electionId", "voterManagerId");
