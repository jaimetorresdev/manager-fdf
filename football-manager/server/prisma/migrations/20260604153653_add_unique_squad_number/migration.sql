-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'manager',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastIp" TEXT,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedReason" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manager" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "clubId" INTEGER,
    "name" TEXT NOT NULL,
    "prestige" INTEGER NOT NULL DEFAULT 0,
    "personality" TEXT NOT NULL DEFAULT 'Normal',
    "mentality" TEXT NOT NULL DEFAULT 'Normal',
    "affinityGroup" TEXT,
    "nationality" TEXT NOT NULL DEFAULT 'España',
    "wealth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "objectiveStatus" TEXT NOT NULL DEFAULT 'Pending',
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "reputation" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vacationMode" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Manager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "livingStandard" INTEGER NOT NULL DEFAULT 1,
    "historicCoef" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueDivision" (
    "id" SERIAL NOT NULL,
    "countryId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "slots" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "LeagueDivision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "badge" TEXT NOT NULL DEFAULT '⚽',
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 500000,
    "fdfValuation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "historicCoef" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mainShareholderClubId" INTEGER,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 500000,
    "fixedAssets" DOUBLE PRECISION NOT NULL DEFAULT 5000000,
    "fans" INTEGER NOT NULL DEFAULT 50000,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "isUserClub" BOOLEAN NOT NULL DEFAULT false,
    "stadiumCapacity" INTEGER NOT NULL DEFAULT 20000,
    "stadiumName" TEXT NOT NULL DEFAULT 'Estadio Municipal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "socialMass" INTEGER NOT NULL DEFAULT 10000,
    "highClass" INTEGER NOT NULL DEFAULT 500,
    "countryLevel" INTEGER NOT NULL DEFAULT 2,
    "ticketPriceLevel" TEXT NOT NULL DEFAULT 'medium',
    "transferBanUntil" TIMESTAMP(3),
    "trainingClosedUntilTurn" INTEGER,
    "trainingClosedUses" INTEGER NOT NULL DEFAULT 0,
    "homeStimulatedUntilTurn" INTEGER,
    "homeStimulatedUses" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER,
    "name" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "flag" TEXT NOT NULL DEFAULT '🌍',
    "age" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "squadNumber" INTEGER,
    "passing" INTEGER NOT NULL DEFAULT 50,
    "tackling" INTEGER NOT NULL DEFAULT 50,
    "shooting" INTEGER NOT NULL DEFAULT 50,
    "organization" INTEGER NOT NULL DEFAULT 50,
    "unmarking" INTEGER NOT NULL DEFAULT 50,
    "finishing" INTEGER NOT NULL DEFAULT 50,
    "dribbling" INTEGER NOT NULL DEFAULT 50,
    "fouls" INTEGER NOT NULL DEFAULT 50,
    "goalkeeping" INTEGER NOT NULL DEFAULT 50,
    "speed" INTEGER NOT NULL DEFAULT 50,
    "defending" INTEGER NOT NULL DEFAULT 50,
    "physical" INTEGER NOT NULL DEFAULT 50,
    "fitness" INTEGER NOT NULL DEFAULT 100,
    "muscularFitness" INTEGER NOT NULL DEFAULT 100,
    "mentalSharpness" INTEGER NOT NULL DEFAULT 100,
    "matchRhythm" INTEGER NOT NULL DEFAULT 100,
    "morale" INTEGER NOT NULL DEFAULT 75,
    "experience" INTEGER NOT NULL DEFAULT 0,
    "talent" INTEGER NOT NULL DEFAULT 50,
    "potential" INTEGER NOT NULL DEFAULT 70,
    "originalNationality" TEXT NOT NULL DEFAULT 'España',
    "birthDate" TEXT NOT NULL DEFAULT '1/1',
    "mentality" TEXT NOT NULL DEFAULT 'Normal',
    "personality" TEXT NOT NULL DEFAULT 'Normal',
    "affinityGroup" TEXT,
    "preferredFoot" TEXT NOT NULL DEFAULT 'Right',
    "injuryProneness" INTEGER NOT NULL DEFAULT 50,
    "consistency" INTEGER NOT NULL DEFAULT 50,
    "preferredPosition" TEXT,
    "homegrown" BOOLEAN NOT NULL DEFAULT false,
    "salary" INTEGER NOT NULL DEFAULT 2000,
    "wage" DOUBLE PRECISION NOT NULL DEFAULT 2000,
    "marketValue" INTEGER NOT NULL DEFAULT 500000,
    "releaseClause" DOUBLE PRECISION,
    "contractYears" INTEGER NOT NULL DEFAULT 2,
    "contractStartAt" TIMESTAMP(3),
    "contractEndAt" TIMESTAMP(3),
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "isForSale" BOOLEAN NOT NULL DEFAULT false,
    "salePrice" INTEGER,
    "injuredUntil" TIMESTAMP(3),
    "suspendedMatches" INTEGER NOT NULL DEFAULT 0,
    "lastTransferAt" TIMESTAMP(3),
    "lastTransferValue" DOUBLE PRECISION,
    "loanOwnerClubId" INTEGER,
    "loanEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tier" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matchday" (
    "id" SERIAL NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "Matchday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" SERIAL NOT NULL,
    "matchdayId" INTEGER,
    "homeClubId" INTEGER NOT NULL,
    "awayClubId" INTEGER NOT NULL,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "groupName" TEXT,
    "weatherCondition" TEXT NOT NULL DEFAULT 'normal',
    "temperature" INTEGER NOT NULL DEFAULT 20,
    "homeFormation" TEXT NOT NULL DEFAULT '4-4-2',
    "homeConstruction" INTEGER NOT NULL DEFAULT 50,
    "homeDestruction" INTEGER NOT NULL DEFAULT 50,
    "homePressing" INTEGER NOT NULL DEFAULT 50,
    "homeTempo" INTEGER NOT NULL DEFAULT 50,
    "homeWidth" INTEGER NOT NULL DEFAULT 50,
    "homeMentality" TEXT NOT NULL DEFAULT 'balanced',
    "homeMarking" TEXT NOT NULL DEFAULT 'zonal',
    "homeOffensiveStyle" TEXT,
    "homeDefensiveStyle" TEXT,
    "homeAttackZones" TEXT,
    "homeDefenseReinforcement" TEXT,
    "homeSubsLogic" TEXT,
    "awayFormation" TEXT NOT NULL DEFAULT '4-4-2',
    "awayConstruction" INTEGER NOT NULL DEFAULT 50,
    "awayDestruction" INTEGER NOT NULL DEFAULT 50,
    "awayPressing" INTEGER NOT NULL DEFAULT 50,
    "awayTempo" INTEGER NOT NULL DEFAULT 50,
    "awayWidth" INTEGER NOT NULL DEFAULT 50,
    "awayMentality" TEXT NOT NULL DEFAULT 'balanced',
    "awayMarking" TEXT NOT NULL DEFAULT 'zonal',
    "awayOffensiveStyle" TEXT,
    "awayDefensiveStyle" TEXT,
    "awayAttackZones" TEXT,
    "awayDefenseReinforcement" TEXT,
    "awaySubsLogic" TEXT,
    "homeStatsJson" TEXT,
    "awayStatsJson" TEXT,
    "motm" TEXT,
    "playedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refereeId" INTEGER,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "playerId" INTEGER,
    "type" TEXT NOT NULL,
    "minute" INTEGER NOT NULL,
    "team" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cardCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerMatchStat" (
    "id" SERIAL NOT NULL,
    "matchId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "passes" INTEGER NOT NULL DEFAULT 0,
    "xG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "heatmap" TEXT,
    "shotmap" TEXT,

    CONSTRAINT "PlayerMatchStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Standing" (
    "id" SERIAL NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "groupName" TEXT,
    "played" INTEGER NOT NULL DEFAULT 0,
    "won" INTEGER NOT NULL DEFAULT 0,
    "drawn" INTEGER NOT NULL DEFAULT 0,
    "lost" INTEGER NOT NULL DEFAULT 0,
    "goalsFor" INTEGER NOT NULL DEFAULT 0,
    "goalsAgainst" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Standing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameState" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "week" INTEGER NOT NULL DEFAULT 1,
    "inGameDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "turn" INTEGER NOT NULL DEFAULT 1,
    "nextTickAt" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "phase" TEXT NOT NULL DEFAULT 'regular',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferOffer" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "fromClubId" INTEGER NOT NULL,
    "toClubId" INTEGER,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "effectiveAt" TIMESTAMP(3),
    "salary" INTEGER,
    "contractYears" INTEGER,
    "releaseClause" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "sellerClubId" INTEGER NOT NULL,
    "startPrice" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "endsAt" TIMESTAMP(3) NOT NULL,
    "winningClubId" INTEGER,
    "closedNoSaleReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionBid" (
    "id" SERIAL NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "managerId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionBid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferAgreement" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "fromClubId" INTEGER NOT NULL,
    "toClubId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "offeredPlayerId" INTEGER,
    "proposerManagerId" INTEGER,
    "counterpartyManagerId" INTEGER,
    "parentId" INTEGER,
    "message" TEXT,
    "loanUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerDevelopment" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "speedDelta" INTEGER NOT NULL DEFAULT 0,
    "shootingDelta" INTEGER NOT NULL DEFAULT 0,
    "passingDelta" INTEGER NOT NULL DEFAULT 0,
    "dribblingDelta" INTEGER NOT NULL DEFAULT 0,
    "defendingDelta" INTEGER NOT NULL DEFAULT 0,
    "physicalDelta" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerDevelopment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Injury" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "weeksLeft" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Injury_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suspension" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "matches" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceSnapshot" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "budget" DOUBLE PRECISION NOT NULL,
    "income" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ticketRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tvRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sponsorRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "staffExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "facilityExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "data" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tactic" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "formation" TEXT NOT NULL DEFAULT '4-4-2',
    "construction" INTEGER NOT NULL DEFAULT 50,
    "destruction" INTEGER NOT NULL DEFAULT 50,
    "pressing" INTEGER NOT NULL DEFAULT 50,
    "tempo" INTEGER NOT NULL DEFAULT 50,
    "width" INTEGER NOT NULL DEFAULT 50,
    "mentality" TEXT NOT NULL DEFAULT 'balanced',
    "marking" TEXT NOT NULL DEFAULT 'zonal',
    "zones" TEXT,
    "passingStyle" TEXT,
    "subsLogic" TEXT,
    "offensiveStyle" TEXT,
    "defensiveStyle" TEXT,
    "attackZones" TEXT,
    "defenseReinforcement" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Tactic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainedPlay" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'developing',

    CONSTRAINT "TrainedPlay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcontract" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "travelAgency" INTEGER NOT NULL DEFAULT 0,
    "maintenance" INTEGER NOT NULL DEFAULT 0,
    "cleaning" INTEGER NOT NULL DEFAULT 0,
    "security" INTEGER NOT NULL DEFAULT 0,
    "food" INTEGER NOT NULL DEFAULT 0,
    "medical" INTEGER NOT NULL DEFAULT 0,
    "media" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subcontract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorContract" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "years" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "yearlyIncome" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coach" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "salary" INTEGER NOT NULL DEFAULT 2000,
    "assignedPlayers" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Coach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stadium" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 20000,
    "seats" TEXT NOT NULL DEFAULT '[0,0,0,0,0]',
    "boxes" TEXT NOT NULL DEFAULT '[0,0,0,0,0]',
    "parking" TEXT NOT NULL DEFAULT '[0,0,0,0,0]',
    "sportsCity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Stadium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StadiumWork" (
    "id" SERIAL NOT NULL,
    "stadiumId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "monthsRemaining" INTEGER NOT NULL,

    CONSTRAINT "StadiumWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouthAcademy" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "residences" INTEGER NOT NULL DEFAULT 1,
    "facilities" INTEGER NOT NULL DEFAULT 1,
    "budget" DOUBLE PRECISION NOT NULL DEFAULT 100000,
    "nextPlayerAt" TIMESTAMP(3),

    CONSTRAINT "YouthAcademy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YouthPlayer" (
    "id" SERIAL NOT NULL,
    "youthAcademyId" INTEGER NOT NULL,
    "age" INTEGER NOT NULL DEFAULT 16,
    "talent" INTEGER NOT NULL,
    "potential" INTEGER NOT NULL DEFAULT 70,
    "preferredFoot" TEXT NOT NULL DEFAULT 'Right',
    "attributes" TEXT NOT NULL,

    CONSTRAINT "YouthPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanBase" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "youngLow" INTEGER NOT NULL DEFAULT 1000,
    "youngMid" INTEGER NOT NULL DEFAULT 500,
    "youngHigh" INTEGER NOT NULL DEFAULT 100,
    "adultLow" INTEGER NOT NULL DEFAULT 5000,
    "adultMid" INTEGER NOT NULL DEFAULT 2000,
    "adultHigh" INTEGER NOT NULL DEFAULT 500,

    CONSTRAINT "FanBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FanCampaign" (
    "id" SERIAL NOT NULL,
    "fanBaseId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FanCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ideology" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "values" TEXT NOT NULL,

    CONSTRAINT "Ideology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmblematicPlayer" (
    "id" SERIAL NOT NULL,
    "ideologyId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "retireYear" INTEGER NOT NULL,

    CONSTRAINT "EmblematicPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Staff" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" SERIAL NOT NULL,
    "staffId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "attributes" TEXT NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL,
    "zone" TEXT,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingSession" (
    "id" SERIAL NOT NULL,
    "turnId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "playerIds" TEXT NOT NULL,

    CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsorship" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "monthsRemaining" INTEGER NOT NULL,

    CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outsourcing" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Outsourcing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prestige" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "history" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prestige_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerContract" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "objective" TEXT NOT NULL,
    "season" TEXT NOT NULL,

    CONSTRAINT "ManagerContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NationalTeam" (
    "id" SERIAL NOT NULL,
    "countryId" INTEGER NOT NULL,
    "managerSelectorId" INTEGER,
    "rankingPoints" INTEGER NOT NULL DEFAULT 1000,

    CONSTRAINT "NationalTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectorCall" (
    "id" SERIAL NOT NULL,
    "nationalTeamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "match" TEXT NOT NULL,

    CONSTRAINT "SelectorCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tournament" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Friendly" (
    "id" SERIAL NOT NULL,
    "clubAId" INTEGER NOT NULL,
    "clubBId" INTEGER NOT NULL,
    "dateTurn" TIMESTAMP(3) NOT NULL,
    "incomeA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "incomeB" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "result" TEXT,

    CONSTRAINT "Friendly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "channelId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialClub" (
    "id" SERIAL NOT NULL,
    "captainId" INTEGER NOT NULL,
    "members" TEXT NOT NULL,
    "cash" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "SocialClub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "ownerId" INTEGER NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateMessage" (
    "id" SERIAL NOT NULL,
    "fromId" INTEGER NOT NULL,
    "toId" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PrivateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutAssignment" (
    "id" SERIAL NOT NULL,
    "scoutStaffId" INTEGER NOT NULL,
    "clubTargetId" INTEGER NOT NULL,
    "analysisPoints" INTEGER NOT NULL DEFAULT 0,
    "zone" TEXT,

    CONSTRAINT "ScoutAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sanction" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "matches" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" SERIAL NOT NULL,
    "countryId" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "candidates" TEXT NOT NULL,
    "winnerId" INTEGER,

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vote" (
    "id" SERIAL NOT NULL,
    "electionId" INTEGER NOT NULL,
    "voterManagerId" INTEGER NOT NULL,
    "candidateManagerId" INTEGER NOT NULL,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumThread" (
    "id" SERIAL NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumPost" (
    "id" SERIAL NOT NULL,
    "threadId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "ForumPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" SERIAL NOT NULL,
    "agentFifaId" INTEGER NOT NULL,
    "target" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorldEconomy" (
    "id" SERIAL NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "inflationIndex" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "demandFactor" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "inGameDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorldEconomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RankingSnapshot" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" TEXT NOT NULL,

    CONSTRAINT "RankingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityContribution" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reward" TEXT NOT NULL,

    CONSTRAINT "CommunityContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnticheatAlert" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "clubId" INTEGER,
    "ip" TEXT,
    "type" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" INTEGER,

    CONSTRAINT "AnticheatAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlobalSettings" (
    "id" SERIAL NOT NULL,
    "turnHours" TEXT NOT NULL DEFAULT '[11, 23]',
    "economyModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "featureFlags" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferListing" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'transfer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "reputation" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRepresentation" (
    "id" SERIAL NOT NULL,
    "agentId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRepresentation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonHistory" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "topScorerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Honour" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "clubId" INTEGER,
    "playerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Honour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubRecord" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "recordType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRecord" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "recordType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallUp" (
    "id" SERIAL NOT NULL,
    "nationalTeamId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "season" TEXT NOT NULL DEFAULT '2025/2026',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NationalRanking" (
    "id" SERIAL NOT NULL,
    "nationalTeamId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "dateTurn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NationalRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardObjective" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "season" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "targetPosition" INTEGER,
    "targetAmount" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternationalCompetition" (
    "id" SERIAL NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "hostCountry" TEXT NOT NULL,
    "year" INTEGER NOT NULL,

    CONSTRAINT "InternationalCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardConfidence" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "managerId" INTEGER,
    "level" INTEGER NOT NULL DEFAULT 50,
    "history" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardConfidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "News" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "recipientId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "News_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressItem" (
    "id" SERIAL NOT NULL,
    "matchdayId" INTEGER,
    "headline" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PressItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Award" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "winnerPlayerId" INTEGER,
    "winnerClubId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Award_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rivalry" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL DEFAULT 50,
    "clubAId" INTEGER NOT NULL,
    "clubBId" INTEGER NOT NULL,

    CONSTRAINT "Rivalry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referee" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "strictness" INTEGER NOT NULL DEFAULT 50,
    "reputation" INTEGER NOT NULL DEFAULT 50,

    CONSTRAINT "Referee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketShortlist" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "playerId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketShortlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerSkill" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "nodeId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerAchievement" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerOffer" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "wage" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerApplication" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "clubId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "competitionId" INTEGER NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubKit" (
    "id" SERIAL NOT NULL,
    "clubId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "colors" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "sponsorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClubKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSeasonStat" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "matchesPlayed" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shotsOnTarget" INTEGER NOT NULL DEFAULT 0,
    "keyPasses" INTEGER NOT NULL DEFAULT 0,
    "interceptions" INTEGER NOT NULL DEFAULT 0,
    "xG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "ratingTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerSeasonStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionProgress" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "missionId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3),
    "rewardClaimedAt" TIMESTAMP(3),

    CONSTRAINT "MissionProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" SERIAL NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentPick" INTEGER NOT NULL DEFAULT 1,
    "startsAt" TIMESTAMP(3),

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftPick" (
    "id" SERIAL NOT NULL,
    "draftId" INTEGER NOT NULL,
    "clubId" INTEGER,
    "playerId" INTEGER,
    "round" INTEGER NOT NULL,
    "pickNumber" INTEGER NOT NULL,

    CONSTRAINT "DraftPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnSnapshot" (
    "id" SERIAL NOT NULL,
    "turn" INTEGER NOT NULL,
    "inGameDate" TIMESTAMP(3) NOT NULL,
    "snapshotData" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TurnSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_userId_key" ON "Manager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Manager_clubId_key" ON "Manager"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Country_name_key" ON "Country"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Player_clubId_squadNumber_key" ON "Player"("clubId", "squadNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Standing_competitionId_clubId_key" ON "Standing"("competitionId", "clubId");

-- CreateIndex
CREATE INDEX "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subcontract_clubId_key" ON "Subcontract"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Stadium_clubId_key" ON "Stadium"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "YouthAcademy_clubId_key" ON "YouthAcademy"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "FanBase_clubId_key" ON "FanBase"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Ideology_clubId_key" ON "Ideology"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_clubId_key" ON "Staff"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "NationalTeam_countryId_key" ON "NationalTeam"("countryId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_type_key" ON "ChatChannel"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TransferListing_playerId_key" ON "TransferListing"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_userId_key" ON "Agent"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRepresentation_playerId_key" ON "AgentRepresentation"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "InternationalCompetition_competitionId_key" ON "InternationalCompetition"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketShortlist_managerId_playerId_key" ON "MarketShortlist"("managerId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerSkill_managerId_nodeId_key" ON "ManagerSkill"("managerId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSeasonStat_playerId_seasonId_key" ON "PlayerSeasonStat"("playerId", "seasonId");

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Manager" ADD CONSTRAINT "Manager_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueDivision" ADD CONSTRAINT "LeagueDivision_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchday" ADD CONSTRAINT "Matchday_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matchday" ADD CONSTRAINT "Matchday_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_matchdayId_fkey" FOREIGN KEY ("matchdayId") REFERENCES "Matchday"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchEvent" ADD CONSTRAINT "MatchEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerMatchStat" ADD CONSTRAINT "PlayerMatchStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Standing" ADD CONSTRAINT "Standing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameState" ADD CONSTRAINT "GameState_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_fromClubId_fkey" FOREIGN KEY ("fromClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferOffer" ADD CONSTRAINT "TransferOffer_toClubId_fkey" FOREIGN KEY ("toClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_sellerClubId_fkey" FOREIGN KEY ("sellerClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionBid" ADD CONSTRAINT "AuctionBid_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_fromClubId_fkey" FOREIGN KEY ("fromClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAgreement" ADD CONSTRAINT "TransferAgreement_toClubId_fkey" FOREIGN KEY ("toClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerDevelopment" ADD CONSTRAINT "PlayerDevelopment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Injury" ADD CONSTRAINT "Injury_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceSnapshot" ADD CONSTRAINT "FinanceSnapshot_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tactic" ADD CONSTRAINT "Tactic_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainedPlay" ADD CONSTRAINT "TrainedPlay_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcontract" ADD CONSTRAINT "Subcontract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorContract" ADD CONSTRAINT "SponsorContract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stadium" ADD CONSTRAINT "Stadium_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StadiumWork" ADD CONSTRAINT "StadiumWork_stadiumId_fkey" FOREIGN KEY ("stadiumId") REFERENCES "Stadium"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouthAcademy" ADD CONSTRAINT "YouthAcademy_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YouthPlayer" ADD CONSTRAINT "YouthPlayer_youthAcademyId_fkey" FOREIGN KEY ("youthAcademyId") REFERENCES "YouthAcademy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanBase" ADD CONSTRAINT "FanBase_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FanCampaign" ADD CONSTRAINT "FanCampaign_fanBaseId_fkey" FOREIGN KEY ("fanBaseId") REFERENCES "FanBase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ideology" ADD CONSTRAINT "Ideology_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmblematicPlayer" ADD CONSTRAINT "EmblematicPlayer_ideologyId_fkey" FOREIGN KEY ("ideologyId") REFERENCES "Ideology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmblematicPlayer" ADD CONSTRAINT "EmblematicPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outsourcing" ADD CONSTRAINT "Outsourcing_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prestige" ADD CONSTRAINT "Prestige_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerContract" ADD CONSTRAINT "ManagerContract_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerContract" ADD CONSTRAINT "ManagerContract_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NationalTeam" ADD CONSTRAINT "NationalTeam_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectorCall" ADD CONSTRAINT "SelectorCall_nationalTeamId_fkey" FOREIGN KEY ("nationalTeamId") REFERENCES "NationalTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectorCall" ADD CONSTRAINT "SelectorCall_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutAssignment" ADD CONSTRAINT "ScoutAssignment_clubTargetId_fkey" FOREIGN KEY ("clubTargetId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticheatAlert" ADD CONSTRAINT "AnticheatAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnticheatAlert" ADD CONSTRAINT "AnticheatAlert_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferListing" ADD CONSTRAINT "TransferListing_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRepresentation" ADD CONSTRAINT "AgentRepresentation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRepresentation" ADD CONSTRAINT "AgentRepresentation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonHistory" ADD CONSTRAINT "SeasonHistory_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonHistory" ADD CONSTRAINT "SeasonHistory_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Honour" ADD CONSTRAINT "Honour_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Honour" ADD CONSTRAINT "Honour_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubRecord" ADD CONSTRAINT "ClubRecord_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRecord" ADD CONSTRAINT "PlayerRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallUp" ADD CONSTRAINT "CallUp_nationalTeamId_fkey" FOREIGN KEY ("nationalTeamId") REFERENCES "NationalTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallUp" ADD CONSTRAINT "CallUp_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NationalRanking" ADD CONSTRAINT "NationalRanking_nationalTeamId_fkey" FOREIGN KEY ("nationalTeamId") REFERENCES "NationalTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardObjective" ADD CONSTRAINT "BoardObjective_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternationalCompetition" ADD CONSTRAINT "InternationalCompetition_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardConfidence" ADD CONSTRAINT "BoardConfidence_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardConfidence" ADD CONSTRAINT "BoardConfidence_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "News" ADD CONSTRAINT "News_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_winnerPlayerId_fkey" FOREIGN KEY ("winnerPlayerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Award" ADD CONSTRAINT "Award_winnerClubId_fkey" FOREIGN KEY ("winnerClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_clubAId_fkey" FOREIGN KEY ("clubAId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rivalry" ADD CONSTRAINT "Rivalry_clubBId_fkey" FOREIGN KEY ("clubBId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketShortlist" ADD CONSTRAINT "MarketShortlist_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketShortlist" ADD CONSTRAINT "MarketShortlist_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerSkill" ADD CONSTRAINT "ManagerSkill_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerAchievement" ADD CONSTRAINT "ManagerAchievement_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerOffer" ADD CONSTRAINT "ManagerOffer_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerOffer" ADD CONSTRAINT "ManagerOffer_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerApplication" ADD CONSTRAINT "ManagerApplication_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerApplication" ADD CONSTRAINT "ManagerApplication_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubKit" ADD CONSTRAINT "ClubKit_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeasonStat" ADD CONSTRAINT "PlayerSeasonStat_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionProgress" ADD CONSTRAINT "MissionProgress_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftPick" ADD CONSTRAINT "DraftPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;
