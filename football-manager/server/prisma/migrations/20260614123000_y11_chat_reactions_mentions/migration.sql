-- Y11 · Taberna viva: menciones persistidas y reacciones por usuario.

ALTER TABLE "ChatMessage"
  ADD COLUMN IF NOT EXISTS "mentionsJson" TEXT;

CREATE TABLE IF NOT EXISTS "ChatReaction" (
  "id" SERIAL PRIMARY KEY,
  "messageId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatReaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatReaction_messageId_userId_emoji_key"
  ON "ChatReaction"("messageId", "userId", "emoji");

CREATE INDEX IF NOT EXISTS "ChatReaction_messageId_idx"
  ON "ChatReaction"("messageId");
