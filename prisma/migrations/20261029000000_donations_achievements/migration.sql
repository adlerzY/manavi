ALTER TABLE "User" ADD COLUMN "activeTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "leaderboardHidden" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "platformUnits" INTEGER NOT NULL DEFAULT 0,
    "receiverUnits" INTEGER NOT NULL,
    "receiverUsdtMicro" INTEGER NOT NULL,
    "coinPriceUsdt" DECIMAL(20,6) NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Donation_idempotencyKey_key" ON "Donation"("idempotencyKey");
CREATE INDEX "Donation_donorId_createdAt_idx" ON "Donation"("donorId", "createdAt");
CREATE INDEX "Donation_receiverId_createdAt_idx" ON "Donation"("receiverId", "createdAt");
CREATE INDEX "Donation_createdAt_idx" ON "Donation"("createdAt");

ALTER TABLE "Donation" ADD CONSTRAINT "Donation_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Donation" ADD CONSTRAINT "Donation_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RevenueAllocation" ALTER COLUMN "saleLineId" DROP NOT NULL;
ALTER TABLE "RevenueAllocation" ADD COLUMN "donationId" TEXT;
CREATE INDEX "RevenueAllocation_donationId_idx" ON "RevenueAllocation"("donationId");
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "Donation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_single_source_check" CHECK (("saleLineId" IS NOT NULL) <> ("donationId" IS NOT NULL));

CREATE TABLE "UserAchievement" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("userId","key")
);

CREATE INDEX "UserAchievement_key_idx" ON "UserAchievement"("key");
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;