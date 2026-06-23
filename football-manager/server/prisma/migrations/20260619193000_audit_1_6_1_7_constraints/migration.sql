-- AUDIT Fase 1.6/1.7 — Agente A (Manager FDF)
-- Generado con `prisma migrate diff` (schema-to-schema). NO aplicado contra una BD
-- en esta sesión (host de BD no alcanzable). Aplicar en deploy con `prisma migrate deploy`.
--
-- PREÁMBULO DE DEDUPLICACIÓN: las nuevas restricciones @@unique fallarían si ya hay
-- filas duplicadas. Estas sentencias eliminan duplicados conservando el id más bajo
-- ANTES de crear los índices únicos. Idempotentes (no borran nada si no hay duplicados).
DELETE FROM "PlayerMatchStat" a USING "PlayerMatchStat" b
  WHERE a.id > b.id AND a."matchId" = b."matchId" AND a."playerId" = b."playerId";
DELETE FROM "MissionProgress" a USING "MissionProgress" b
  WHERE a.id > b.id AND a."managerId" = b."managerId" AND a."missionId" = b."missionId";
DELETE FROM "ManagerAchievement" a USING "ManagerAchievement" b
  WHERE a.id > b.id AND a."managerId" = b."managerId" AND a."type" = b."type" AND a."title" = b."title";

-- DropForeignKey
ALTER TABLE "PlayerMatchStat" DROP CONSTRAINT "PlayerMatchStat_matchId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerMatchStat" DROP CONSTRAINT "PlayerMatchStat_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Auction" DROP CONSTRAINT "Auction_sellerClubId_fkey";

-- DropForeignKey
ALTER TABLE "AuctionBid" DROP CONSTRAINT "AuctionBid_auctionId_fkey";

-- DropForeignKey
ALTER TABLE "AuctionBid" DROP CONSTRAINT "AuctionBid_managerId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerDevelopment" DROP CONSTRAINT "PlayerDevelopment_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Injury" DROP CONSTRAINT "Injury_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Suspension" DROP CONSTRAINT "Suspension_playerId_fkey";

-- DropForeignKey
ALTER TABLE "FinanceSnapshot" DROP CONSTRAINT "FinanceSnapshot_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "Tactic" DROP CONSTRAINT "Tactic_managerId_fkey";

-- DropForeignKey
ALTER TABLE "TrainedPlay" DROP CONSTRAINT "TrainedPlay_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Subcontract" DROP CONSTRAINT "Subcontract_clubId_fkey";

-- DropForeignKey
ALTER TABLE "SponsorContract" DROP CONSTRAINT "SponsorContract_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Coach" DROP CONSTRAINT "Coach_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Stadium" DROP CONSTRAINT "Stadium_clubId_fkey";

-- DropForeignKey
ALTER TABLE "StadiumWork" DROP CONSTRAINT "StadiumWork_stadiumId_fkey";

-- DropForeignKey
ALTER TABLE "YouthAcademy" DROP CONSTRAINT "YouthAcademy_clubId_fkey";

-- DropForeignKey
ALTER TABLE "YouthPlayer" DROP CONSTRAINT "YouthPlayer_youthAcademyId_fkey";

-- DropForeignKey
ALTER TABLE "FanBase" DROP CONSTRAINT "FanBase_clubId_fkey";

-- DropForeignKey
ALTER TABLE "FanCampaign" DROP CONSTRAINT "FanCampaign_fanBaseId_fkey";

-- DropForeignKey
ALTER TABLE "Ideology" DROP CONSTRAINT "Ideology_clubId_fkey";

-- DropForeignKey
ALTER TABLE "EmblematicPlayer" DROP CONSTRAINT "EmblematicPlayer_ideologyId_fkey";

-- DropForeignKey
ALTER TABLE "EmblematicPlayer" DROP CONSTRAINT "EmblematicPlayer_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Staff" DROP CONSTRAINT "Staff_clubId_fkey";

-- DropForeignKey
ALTER TABLE "StaffMember" DROP CONSTRAINT "StaffMember_staffId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Outsourcing" DROP CONSTRAINT "Outsourcing_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Prestige" DROP CONSTRAINT "Prestige_managerId_fkey";

-- DropForeignKey
ALTER TABLE "ManagerContract" DROP CONSTRAINT "ManagerContract_managerId_fkey";

-- DropForeignKey
ALTER TABLE "ManagerContract" DROP CONSTRAINT "ManagerContract_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Share" DROP CONSTRAINT "Share_clubId_fkey";

-- DropForeignKey
ALTER TABLE "Sanction" DROP CONSTRAINT "Sanction_playerId_fkey";

-- DropForeignKey
ALTER TABLE "Agent" DROP CONSTRAINT "Agent_userId_fkey";

-- DropForeignKey
ALTER TABLE "AgentRepresentation" DROP CONSTRAINT "AgentRepresentation_agentId_fkey";

-- DropForeignKey
ALTER TABLE "AgentRepresentation" DROP CONSTRAINT "AgentRepresentation_playerId_fkey";

-- DropForeignKey
ALTER TABLE "ClubRecord" DROP CONSTRAINT "ClubRecord_clubId_fkey";

-- DropForeignKey
ALTER TABLE "PlayerRecord" DROP CONSTRAINT "PlayerRecord_playerId_fkey";

-- DropForeignKey
ALTER TABLE "BoardObjective" DROP CONSTRAINT "BoardObjective_clubId_fkey";

-- DropForeignKey
ALTER TABLE "BoardConfidence" DROP CONSTRAINT "BoardConfidence_clubId_fkey";

-- DropForeignKey
ALTER TABLE "News" DROP CONSTRAINT "News_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "MissionProgress" DROP CONSTRAINT "MissionProgress_managerId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "PlayerMatchStat_matchId_playerId_key" ON "PlayerMatchStat"("matchId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerAchievement_managerId_type_title_key" ON "ManagerAchievement"("managerId", "type", "title");

-- CreateIndex
CREATE UNIQUE INDEX "MissionProgress_managerId_missionId_key" ON "MissionProgress"("managerId", "missionId");

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerClubId_fkey" FOREIGN KEY ("sellerClubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerDevelopment" ADD CONSTRAINT "PlayerDevelopment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injury" ADD CONSTRAINT "Injury_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSnapshot" ADD CONSTRAINT "FinanceSnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tactic" ADD CONSTRAINT "Tactic_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainedPlay" ADD CONSTRAINT "TrainedPlay_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorContract" ADD CONSTRAINT "SponsorContract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadium" ADD CONSTRAINT "Stadium_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadiumWork" ADD CONSTRAINT "StadiumWork_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouthAcademy" ADD CONSTRAINT "YouthAcademy_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouthPlayer" ADD CONSTRAINT "YouthPlayer_youthAcademyId_fkey" FOREIGN KEY ("youthAcademyId") REFERENCES "YouthAcademy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanBase" ADD CONSTRAINT "FanBase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanCampaign" ADD CONSTRAINT "FanCampaign_fanBaseId_fkey" FOREIGN KEY ("fanBaseId") REFERENCES "FanBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ideology" ADD CONSTRAINT "Ideology_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmblematicPlayer" ADD CONSTRAINT "EmblematicPlayer_ideologyId_fkey" FOREIGN KEY ("ideologyId") REFERENCES "Ideology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmblematicPlayer" ADD CONSTRAINT "EmblematicPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outsourcing" ADD CONSTRAINT "Outsourcing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestige" ADD CONSTRAINT "Prestige_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerContract" ADD CONSTRAINT "ManagerContract_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerContract" ADD CONSTRAINT "ManagerContract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRepresentation" ADD CONSTRAINT "AgentRepresentation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRepresentation" ADD CONSTRAINT "AgentRepresentation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRecord" ADD CONSTRAINT "ClubRecord_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRecord" ADD CONSTRAINT "PlayerRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardObjective" ADD CONSTRAINT "BoardObjective_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardConfidence" ADD CONSTRAINT "BoardConfidence_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

