CREATE TYPE "BonusTrigger" AS ENUM ('PER_CHAPTER', 'ANY_PURCHASE', 'FULL_SET');
CREATE TYPE "GiftAudience" AS ENUM ('USERS', 'EDITION_BUYERS', 'COMIC_BOOKMARKS');

CREATE TABLE "EditionBonus" (
    "id" TEXT NOT NULL,
    "sourceEditionId" TEXT NOT NULL,
    "targetEditionId" TEXT NOT NULL,
    "trigger" "BonusTrigger" NOT NULL DEFAULT 'PER_CHAPTER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditionBonus_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EditionBonus_sourceEditionId_isActive_idx" ON "EditionBonus"("sourceEditionId", "isActive");
CREATE INDEX "EditionBonus_targetEditionId_isActive_idx" ON "EditionBonus"("targetEditionId", "isActive");
CREATE UNIQUE INDEX "EditionBonus_permanent_key" ON "EditionBonus"("sourceEditionId", "targetEditionId") WHERE "startsAt" IS NULL AND "endsAt" IS NULL;
ALTER TABLE "EditionBonus" ADD CONSTRAINT "EditionBonus_sourceEditionId_fkey" FOREIGN KEY ("sourceEditionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EditionBonus" ADD CONSTRAINT "EditionBonus_targetEditionId_fkey" FOREIGN KEY ("targetEditionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BonusGrant" (
    "bonusId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BonusGrant_pkey" PRIMARY KEY ("bonusId", "userId")
);
CREATE INDEX "BonusGrant_userId_idx" ON "BonusGrant"("userId");
ALTER TABLE "BonusGrant" ADD CONSTRAINT "BonusGrant_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "EditionBonus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccessGift" (
    "id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "audience" "GiftAudience" NOT NULL,
    "audienceRef" TEXT,
    "includeFuture" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdById" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "grantedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccessGift_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessGift_createdAt_idx" ON "AccessGift"("createdAt");

CREATE TABLE "AccessGiftEdition" (
    "giftId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    CONSTRAINT "AccessGiftEdition_pkey" PRIMARY KEY ("giftId", "editionId")
);
CREATE INDEX "AccessGiftEdition_editionId_idx" ON "AccessGiftEdition"("editionId");
ALTER TABLE "AccessGiftEdition" ADD CONSTRAINT "AccessGiftEdition_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "AccessGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccessGiftEdition" ADD CONSTRAINT "AccessGiftEdition_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccessGiftRecipient" (
    "giftId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AccessGiftRecipient_pkey" PRIMARY KEY ("giftId", "userId")
);
CREATE INDEX "AccessGiftRecipient_userId_idx" ON "AccessGiftRecipient"("userId");
ALTER TABLE "AccessGiftRecipient" ADD CONSTRAINT "AccessGiftRecipient_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "AccessGift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Entitlement" ADD COLUMN "bonusId" TEXT, ADD COLUMN "giftId" TEXT;
CREATE INDEX "Entitlement_bonusId_idx" ON "Entitlement"("bonusId");
CREATE INDEX "Entitlement_giftId_idx" ON "Entitlement"("giftId");
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_bonusId_fkey" FOREIGN KEY ("bonusId") REFERENCES "EditionBonus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "AccessGift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "EditionBonus" ("id", "sourceEditionId", "targetEditionId", "trigger", "isActive", "name", "note", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."id", t."id", 'PER_CHAPTER', true, 'انتقال از بازکردن متقابل قدیمی', 'migration', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Edition" t
JOIN "Edition" s ON s."workId" = t."workId" AND s."id" <> t."id"
WHERE t."crossUnlockEnabled" = true;