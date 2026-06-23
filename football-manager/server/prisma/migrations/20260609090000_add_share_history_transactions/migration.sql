-- C5: cartera multipropiedad e historico de precios de acciones.
-- Cambios aditivos: conserva Share y solo anade historico/transacciones.

CREATE TABLE "SharePriceHistory" (
  "id" SERIAL NOT NULL,
  "clubId" INTEGER NOT NULL,
  "shareValue" DOUBLE PRECISION NOT NULL,
  "totalShares" INTEGER NOT NULL DEFAULT 1500,
  "totalAssets" DOUBLE PRECISION NOT NULL,
  "cash" DOUBLE PRECISION NOT NULL,
  "fixedAssets" DOUBLE PRECISION NOT NULL,
  "squadValue" DOUBLE PRECISION NOT NULL,
  "inGameDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SharePriceHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShareTransaction" (
  "id" SERIAL NOT NULL,
  "clubId" INTEGER NOT NULL,
  "ownerId" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "shares" INTEGER NOT NULL,
  "pct" DOUBLE PRECISION NOT NULL,
  "pricePerShare" DOUBLE PRECISION NOT NULL,
  "grossAmount" DOUBLE PRECISION NOT NULL,
  "inGameDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Share_clubId_idx" ON "Share"("clubId");
CREATE INDEX "Share_ownerId_idx" ON "Share"("ownerId");
CREATE INDEX "SharePriceHistory_clubId_createdAt_idx" ON "SharePriceHistory"("clubId", "createdAt");
CREATE INDEX "SharePriceHistory_clubId_inGameDate_idx" ON "SharePriceHistory"("clubId", "inGameDate");
CREATE INDEX "ShareTransaction_ownerId_createdAt_idx" ON "ShareTransaction"("ownerId", "createdAt");
CREATE INDEX "ShareTransaction_clubId_createdAt_idx" ON "ShareTransaction"("clubId", "createdAt");

ALTER TABLE "SharePriceHistory"
  ADD CONSTRAINT "SharePriceHistory_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareTransaction"
  ADD CONSTRAINT "ShareTransaction_clubId_fkey"
  FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;
