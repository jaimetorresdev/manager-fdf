CREATE TABLE "GoalOfWeekVote" (
  "id" SERIAL NOT NULL,
  "weekKey" TEXT NOT NULL,
  "goalKey" TEXT NOT NULL,
  "managerId" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalOfWeekVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoalOfWeekVote_weekKey_managerId_key"
  ON "GoalOfWeekVote"("weekKey", "managerId");

CREATE INDEX "GoalOfWeekVote_weekKey_goalKey_idx"
  ON "GoalOfWeekVote"("weekKey", "goalKey");

ALTER TABLE "GoalOfWeekVote"
  ADD CONSTRAINT "GoalOfWeekVote_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Manager"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
