-- AUDIT-2026 (10 jun 2026) · Remedios estructurales de la auditoría multi-capa
-- Migración ADITIVA escrita a mano (prisma migrate no corre en el sandbox).
-- Nota: el despliegue actual usa `prisma db push`; este SQL existe para entornos
-- con `migrate deploy` y como documentación del cambio.

-- (a) Fecha in-game anterior REAL persistida en GameState
ALTER TABLE "GameState" ADD COLUMN IF NOT EXISTS "prevInGameDate" TIMESTAMP(3);

-- (e) Sincronizar el doble libro budget/cash UNA vez: budget pasa a ser la
-- fuente única de verdad y cash queda como espejo sincronizado en todos los módulos.
UPDATE "Club" SET "cash" = "budget" WHERE "cash" IS DISTINCT FROM "budget";

-- (e) Uniques de idempotencia (dedupe defensivo previo: conservar la fila más antigua)

-- Suspension(playerId, reason)
DELETE FROM "Suspension" s USING "Suspension" d
  WHERE s."playerId" = d."playerId" AND s."reason" = d."reason" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "Suspension_playerId_reason_key"
  ON "Suspension"("playerId", "reason");

-- FinanceSnapshot(clubId, season, week) — premios por matchId+concepto y snapshot mensual
DELETE FROM "FinanceSnapshot" s USING "FinanceSnapshot" d
  WHERE s."clubId" = d."clubId" AND s."season" = d."season" AND s."week" = d."week" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceSnapshot_clubId_season_week_key"
  ON "FinanceSnapshot"("clubId", "season", "week");

-- Outsourcing(clubId, type)
DELETE FROM "Outsourcing" s USING "Outsourcing" d
  WHERE s."clubId" = d."clubId" AND s."type" = d."type" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "Outsourcing_clubId_type_key"
  ON "Outsourcing"("clubId", "type");

-- SeasonHistory(clubId, competitionId, season)
DELETE FROM "SeasonHistory" s USING "SeasonHistory" d
  WHERE s."clubId" = d."clubId" AND s."competitionId" = d."competitionId"
    AND s."season" = d."season" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonHistory_clubId_competitionId_season_key"
  ON "SeasonHistory"("clubId", "competitionId", "season");

-- Award(name, season)
DELETE FROM "Award" s USING "Award" d
  WHERE s."name" = d."name" AND s."season" = d."season" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "Award_name_season_key"
  ON "Award"("name", "season");

-- Season(name)
DELETE FROM "Season" s USING "Season" d
  WHERE s."name" = d."name" AND s."id" > d."id";
CREATE UNIQUE INDEX IF NOT EXISTS "Season_name_key" ON "Season"("name");

-- (c) Unificar el type de competiciones europeas: el seed usa 'league_phase';
-- season.service creaba 'european' que advanceWeek nunca simulaba.
UPDATE "Competition" SET "type" = 'league_phase' WHERE "type" = 'european';

-- Índices de apoyo para queries calientes del tick (auditoría schema/DB)
CREATE INDEX IF NOT EXISTS "Match_matchdayId_status_idx" ON "Match"("matchdayId", "status");
CREATE INDEX IF NOT EXISTS "Match_homeClubId_status_idx" ON "Match"("homeClubId", "status");
CREATE INDEX IF NOT EXISTS "Match_awayClubId_status_idx" ON "Match"("awayClubId", "status");
CREATE INDEX IF NOT EXISTS "MatchEvent_matchId_idx" ON "MatchEvent"("matchId");
CREATE INDEX IF NOT EXISTS "MatchEvent_type_playerId_idx" ON "MatchEvent"("type", "playerId");
CREATE INDEX IF NOT EXISTS "PlayerMatchStat_playerId_idx" ON "PlayerMatchStat"("playerId");
CREATE INDEX IF NOT EXISTS "News_recipientId_createdAt_idx" ON "News"("recipientId", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
