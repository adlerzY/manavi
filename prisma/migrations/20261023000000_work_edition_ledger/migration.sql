CREATE TYPE "EditionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "EntitlementType" AS ENUM ('PURCHASE', 'CROSS_UNLOCK', 'LEGACY_UNLOCK', 'ADMIN_GRANT');
CREATE TYPE "SaleKind" AS ENUM ('SINGLE', 'BULK');
CREATE TYPE "BeneficiaryType" AS ENUM ('PLATFORM', 'PUBLISHER', 'USER');
CREATE TYPE "LedgerAccount" AS ENUM ('USER_COIN_WALLET', 'PLATFORM_REVENUE', 'BENEFICIARY_PAYABLE', 'BENEFICIARY_PAID');
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE "LedgerOwnerType" AS ENUM ('USER', 'PUBLISHER', 'PLATFORM');
CREATE TYPE "LedgerCurrency" AS ENUM ('COIN_UNIT', 'USDT_MICRO');
CREATE TYPE "ReportTargetType" AS ENUM ('EDITION_CHAPTER', 'COMMENT', 'EDITION', 'WORK');
CREATE TYPE "ReportCategory" AS ENUM ('TRANSLATION_ERROR', 'BROKEN_IMAGES', 'UNLABELED_SPOILER', 'INAPPROPRIATE', 'RIGHTS_VIOLATION', 'MISLEADING_CREDIT', 'BILLING_ACCESS');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'ACTION_TAKEN', 'REJECTED', 'RESOLVED');
CREATE TYPE "EditionRequestStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'FULFILLED');
CREATE TYPE "SettlementPeriodStatus" AS ENUM ('OPEN', 'LOCKED');
CREATE TYPE "SettlementLineStatus" AS ENUM ('CALCULATED', 'APPROVED_FOR_PAYMENT', 'PAID_BY_ADMIN', 'CONFIRMED_BY_RECIPIENT', 'ON_HOLD', 'PARTIALLY_PAID', 'DISPUTED', 'CANCELLED');
CREATE TYPE "PayoutConfirmationStatus" AS ENUM ('CONFIRMED', 'DISPUTED');

ALTER TABLE "Comic" ADD COLUMN "ratingCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "ratingTotal" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Chapter" ADD COLUMN "editionId" TEXT, ADD COLUMN "episodeId" TEXT;
ALTER TABLE "ComicStaff" ADD COLUMN "editionId" TEXT, ADD COLUMN "shareBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChapterStaff" ADD COLUMN "shareBps" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LicenseTerm" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "royaltyPercentage" DECIMAL(5,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LicenseTerm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LicenseTerm_licenseId_validFrom_key" ON "LicenseTerm"("licenseId", "validFrom");

CREATE TABLE "Edition" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'fa',
    "format" TEXT NOT NULL DEFAULT 'COMIC',
    "title" TEXT,
    "status" "EditionStatus" NOT NULL DEFAULT 'ACTIVE',
    "priceCoinsOverride" INTEGER,
    "crossUnlockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "ratingTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Edition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Edition_workId_publisherId_language_key" ON "Edition"("workId", "publisherId", "language");
CREATE INDEX "Edition_workId_status_idx" ON "Edition"("workId", "status");
CREATE INDEX "Edition_publisherId_idx" ON "Edition"("publisherId");
CREATE INDEX "Edition_licenseId_idx" ON "Edition"("licenseId");

CREATE TABLE "WorkEpisode" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "canonicalIndex" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkEpisode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkEpisode_workId_canonicalIndex_key" ON "WorkEpisode"("workId", "canonicalIndex");

CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "type" "EntitlementType" NOT NULL,
    "saleLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Entitlement_saleLineId_key" ON "Entitlement"("saleLineId");
CREATE UNIQUE INDEX "Entitlement_userId_chapterId_key" ON "Entitlement"("userId", "chapterId");
CREATE INDEX "Entitlement_chapterId_idx" ON "Entitlement"("chapterId");

CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "kind" "SaleKind" NOT NULL,
    "totalCoins" INTEGER NOT NULL,
    "coinPriceUsdt" DECIMAL(20,6) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "licenseTermId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Sale_idempotencyKey_key" ON "Sale"("idempotencyKey");
CREATE INDEX "Sale_buyerId_createdAt_idx" ON "Sale"("buyerId", "createdAt");
CREATE INDEX "Sale_editionId_idx" ON "Sale"("editionId");

CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "coinAmount" INTEGER NOT NULL,
    "unitsAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SaleLine_saleId_idx" ON "SaleLine"("saleId");
CREATE INDEX "SaleLine_chapterId_idx" ON "SaleLine"("chapterId");

CREATE TABLE "SettlementPeriod" (
    "id" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "SettlementPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SettlementPeriod_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SettlementPeriod_periodStart_idx" ON "SettlementPeriod"("periodStart");

CREATE TABLE "SettlementLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "beneficiaryType" "BeneficiaryType" NOT NULL,
    "beneficiaryId" TEXT NOT NULL,
    "owedMicro" BIGINT NOT NULL,
    "paidMicro" BIGINT NOT NULL DEFAULT 0,
    "status" "SettlementLineStatus" NOT NULL DEFAULT 'CALCULATED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SettlementLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SettlementLine_periodId_beneficiaryType_beneficiaryId_key" ON "SettlementLine"("periodId", "beneficiaryType", "beneficiaryId");
CREATE INDEX "SettlementLine_beneficiaryType_beneficiaryId_idx" ON "SettlementLine"("beneficiaryType", "beneficiaryId");
CREATE INDEX "SettlementLine_status_idx" ON "SettlementLine"("status");

CREATE TABLE "RevenueAllocation" (
    "id" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "beneficiaryType" "BeneficiaryType" NOT NULL,
    "beneficiaryId" TEXT,
    "role" "StaffRole",
    "baseUnits" INTEGER NOT NULL,
    "publisherBps" INTEGER NOT NULL,
    "memberShareBps" INTEGER,
    "allocatedUnits" INTEGER NOT NULL,
    "usdtMicro" INTEGER NOT NULL,
    "licenseTermId" TEXT,
    "settlementLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevenueAllocation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RevenueAllocation_saleLineId_idx" ON "RevenueAllocation"("saleLineId");
CREATE INDEX "RevenueAllocation_beneficiaryType_beneficiaryId_settlementLineId_idx" ON "RevenueAllocation"("beneficiaryType", "beneficiaryId", "settlementLineId");
CREATE INDEX "RevenueAllocation_createdAt_idx" ON "RevenueAllocation"("createdAt");

CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "ownerType" "LedgerOwnerType" NOT NULL,
    "ownerId" TEXT,
    "direction" "LedgerDirection" NOT NULL,
    "amountUnits" BIGINT NOT NULL,
    "currency" "LedgerCurrency" NOT NULL DEFAULT 'COIN_UNIT',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LedgerEntry_idempotencyKey_key" ON "LedgerEntry"("idempotencyKey");
CREATE INDEX "LedgerEntry_account_ownerType_ownerId_idx" ON "LedgerEntry"("account", "ownerType", "ownerId");
CREATE INDEX "LedgerEntry_sourceType_sourceId_idx" ON "LedgerEntry"("sourceType", "sourceId");
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

CREATE TABLE "WorkRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkRating_userId_workId_key" ON "WorkRating"("userId", "workId");
CREATE INDEX "WorkRating_workId_idx" ON "WorkRating"("workId");

CREATE TABLE "EditionRating" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditionRating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EditionRating_userId_editionId_key" ON "EditionRating"("userId", "editionId");
CREATE INDEX "EditionRating_editionId_idx" ON "EditionRating"("editionId");

CREATE TABLE "ContentReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "moderatorId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContentReport_status_createdAt_idx" ON "ContentReport"("status", "createdAt");
CREATE INDEX "ContentReport_targetType_targetId_idx" ON "ContentReport"("targetType", "targetId");
CREATE INDEX "ContentReport_reporterId_idx" ON "ContentReport"("reporterId");

CREATE TABLE "EditionRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "reason" TEXT,
    "status" "EditionRequestStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EditionRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EditionRequest_userId_workId_key" ON "EditionRequest"("userId", "workId");
CREATE INDEX "EditionRequest_workId_language_status_idx" ON "EditionRequest"("workId", "language", "status");

CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "settlementLineId" TEXT NOT NULL,
    "amountMicro" BIGINT NOT NULL,
    "reference" TEXT,
    "receiptUrl" TEXT,
    "note" TEXT,
    "paidById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Payout_settlementLineId_idx" ON "Payout"("settlementLineId");

CREATE TABLE "PayoutConfirmation" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "PayoutConfirmationStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayoutConfirmation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayoutConfirmation_payoutId_key" ON "PayoutConfirmation"("payoutId");

INSERT INTO "LicenseTerm" ("id", "licenseId", "royaltyPercentage", "validFrom", "createdAt")
SELECT gen_random_uuid()::text, "id", "royaltyPercentage", "createdAt", CURRENT_TIMESTAMP FROM "License";

INSERT INTO "Edition" ("id", "workId", "publisherId", "licenseId", "language", "format", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", l."publisherId", c."licenseId", 'fa', 'COMIC', 'ACTIVE', c."createdAt", CURRENT_TIMESTAMP
FROM "Comic" c
JOIN "License" l ON l."id" = c."licenseId";

INSERT INTO "WorkEpisode" ("id", "workId", "canonicalIndex", "createdAt")
SELECT "id", "comicId", "chapterNumber", CURRENT_TIMESTAMP FROM "Chapter";

UPDATE "Chapter" ch
SET "editionId" = e."id", "episodeId" = ch."id"
FROM "Edition" e
WHERE e."workId" = ch."comicId";

UPDATE "ComicStaff" cs
SET "editionId" = e."id"
FROM "Edition" e
WHERE e."workId" = cs."comicId";

INSERT INTO "Entitlement" ("id", "userId", "chapterId", "type", "createdAt", "expiresAt")
SELECT gen_random_uuid()::text, "userId", "chapterId", 'LEGACY_UNLOCK', CURRENT_TIMESTAMP, "expiresAt" FROM "ChapterUnlock";

INSERT INTO "LedgerEntry" ("id", "account", "ownerType", "ownerId", "direction", "amountUnits", "currency", "sourceType", "sourceId", "idempotencyKey", "note", "createdAt")
SELECT gen_random_uuid()::text, 'USER_COIN_WALLET', 'USER', "id", 'CREDIT', ("coinsBalance" * 100)::bigint, 'COIN_UNIT', 'OPENING_BALANCE', "id", 'opening:' || "id", 'migration', CURRENT_TIMESTAMP
FROM "User" WHERE "coinsBalance" > 0;

ALTER TABLE "Chapter" ALTER COLUMN "editionId" SET NOT NULL;

DROP INDEX IF EXISTS "Chapter_comicId_chapterNumber_key";
CREATE UNIQUE INDEX "Chapter_editionId_chapterNumber_key" ON "Chapter"("editionId", "chapterNumber");
CREATE INDEX "Chapter_editionId_publishedAt_idx" ON "Chapter"("editionId", "publishedAt");
CREATE INDEX "Chapter_episodeId_idx" ON "Chapter"("episodeId");
CREATE INDEX "ComicStaff_editionId_idx" ON "ComicStaff"("editionId");

ALTER TABLE "LicenseTerm" ADD CONSTRAINT "LicenseTerm_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Edition" ADD CONSTRAINT "Edition_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkEpisode" ADD CONSTRAINT "WorkEpisode_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "WorkEpisode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComicStaff" ADD CONSTRAINT "ComicStaff_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_licenseTermId_fkey" FOREIGN KEY ("licenseTermId") REFERENCES "LicenseTerm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RevenueAllocation" ADD CONSTRAINT "RevenueAllocation_settlementLineId_fkey" FOREIGN KEY ("settlementLineId") REFERENCES "SettlementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SettlementLine" ADD CONSTRAINT "SettlementLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "SettlementPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkRating" ADD CONSTRAINT "WorkRating_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditionRating" ADD CONSTRAINT "EditionRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditionRating" ADD CONSTRAINT "EditionRating_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentReport" ADD CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditionRequest" ADD CONSTRAINT "EditionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EditionRequest" ADD CONSTRAINT "EditionRequest_workId_fkey" FOREIGN KEY ("workId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_settlementLineId_fkey" FOREIGN KEY ("settlementLineId") REFERENCES "SettlementLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutConfirmation" ADD CONSTRAINT "PayoutConfirmation_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutConfirmation" ADD CONSTRAINT "PayoutConfirmation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;