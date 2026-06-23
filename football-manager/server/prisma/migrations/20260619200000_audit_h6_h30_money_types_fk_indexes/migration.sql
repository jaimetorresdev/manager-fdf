-- AUDIT H-6/H-30/H-25/H-28 + 5.1-8. Schema-to-schema diff, no aplicado (BD inalcanzable, dedup/orphans en deploy).
-- DropForeignKey
ALTER TABLE "MatchEvent" DROP CONSTRAINT "MatchEvent_matchId_fkey";

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "wage" SET DEFAULT 2000,
ALTER COLUMN "wage" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Auction" ALTER COLUMN "startPrice" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "AuctionBid" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "TransferAgreement" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "ScoutAssignment" ADD COLUMN     "lastProgressTurn" INTEGER NOT NULL DEFAULT -1;

-- CreateIndex
CREATE INDEX "TransferOffer_playerId_idx" ON "TransferOffer"("playerId");

-- CreateIndex
CREATE INDEX "TransferOffer_fromClubId_idx" ON "TransferOffer"("fromClubId");

-- CreateIndex
CREATE INDEX "AuctionBid_auctionId_idx" ON "AuctionBid"("auctionId");

-- CreateIndex
CREATE INDEX "TransferAgreement_playerId_idx" ON "TransferAgreement"("playerId");

-- CreateIndex
CREATE INDEX "TransferAgreement_fromClubId_idx" ON "TransferAgreement"("fromClubId");

-- CreateIndex
CREATE INDEX "PlayerDevelopment_playerId_idx" ON "PlayerDevelopment"("playerId");

-- CreateIndex
CREATE INDEX "Injury_playerId_idx" ON "Injury"("playerId");

-- CreateIndex
CREATE INDEX "Tactic_managerId_idx" ON "Tactic"("managerId");

-- CreateIndex
CREATE INDEX "TrainedPlay_clubId_idx" ON "TrainedPlay"("clubId");

-- CreateIndex
CREATE INDEX "SponsorContract_clubId_idx" ON "SponsorContract"("clubId");

-- CreateIndex
CREATE INDEX "Coach_clubId_idx" ON "Coach"("clubId");

-- CreateIndex
CREATE INDEX "StadiumWork_stadiumId_idx" ON "StadiumWork"("stadiumId");

-- CreateIndex
CREATE INDEX "YouthPlayer_youthAcademyId_idx" ON "YouthPlayer"("youthAcademyId");

-- CreateIndex
CREATE INDEX "FanCampaign_fanBaseId_idx" ON "FanCampaign"("fanBaseId");

-- CreateIndex
CREATE INDEX "EmblematicPlayer_ideologyId_idx" ON "EmblematicPlayer"("ideologyId");

-- CreateIndex
CREATE INDEX "EmblematicPlayer_playerId_idx" ON "EmblematicPlayer"("playerId");

-- CreateIndex
CREATE INDEX "StaffMember_staffId_idx" ON "StaffMember"("staffId");

-- CreateIndex
CREATE INDEX "Sponsorship_clubId_idx" ON "Sponsorship"("clubId");

-- CreateIndex
CREATE INDEX "Prestige_managerId_idx" ON "Prestige"("managerId");

-- CreateIndex
CREATE INDEX "ManagerContract_managerId_idx" ON "ManagerContract"("managerId");

-- CreateIndex
CREATE INDEX "ManagerContract_clubId_idx" ON "ManagerContract"("clubId");

-- CreateIndex
CREATE INDEX "Sanction_playerId_idx" ON "Sanction"("playerId");

-- CreateIndex
CREATE INDEX "AgentRepresentation_agentId_idx" ON "AgentRepresentation"("agentId");

-- CreateIndex
CREATE INDEX "ClubRecord_clubId_idx" ON "ClubRecord"("clubId");

-- CreateIndex
CREATE INDEX "PlayerRecord_playerId_idx" ON "PlayerRecord"("playerId");

-- CreateIndex
CREATE INDEX "BoardObjective_clubId_idx" ON "BoardObjective"("clubId");

-- CreateIndex
CREATE INDEX "BoardConfidence_clubId_idx" ON "BoardConfidence"("clubId");

-- CreateIndex
CREATE INDEX "ManagerOffer_managerId_idx" ON "ManagerOffer"("managerId");

-- CreateIndex
CREATE INDEX "ManagerOffer_clubId_idx" ON "ManagerOffer"("clubId");

-- CreateIndex
CREATE INDEX "ManagerApplication_managerId_idx" ON "ManagerApplication"("managerId");

-- CreateIndex
CREATE INDEX "ManagerApplication_clubId_idx" ON "ManagerApplication"("clubId");

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareTransaction" ADD CONSTRAINT "ShareTransaction_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

