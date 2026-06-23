-- CreateTable
CREATE TABLE "PressQuestion" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "matchId" INTEGER,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "answeredTone" TEXT,
    "effectsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "PressQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PressConference" (
    "id" SERIAL NOT NULL,
    "managerId" INTEGER NOT NULL,
    "topic" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "effectsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PressConference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PressQuestion_managerId_matchId_key" ON "PressQuestion"("managerId", "matchId");

-- AddForeignKey
ALTER TABLE "PressQuestion" ADD CONSTRAINT "PressQuestion_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressQuestion" ADD CONSTRAINT "PressQuestion_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PressConference" ADD CONSTRAINT "PressConference_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Manager"("id") ON DELETE CASCADE ON UPDATE CASCADE;
