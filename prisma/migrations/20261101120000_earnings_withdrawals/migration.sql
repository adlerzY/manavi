CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED');
CREATE TYPE "WithdrawalEventType" AS ENUM ('CREATED', 'PROCESSING', 'PAID', 'REJECTED', 'CANCELLED', 'CONFIRMED', 'DISPUTED', 'DISPUTE_RESOLVED');
CREATE TYPE "WithdrawalResponseStatus" AS ENUM ('CONFIRMED', 'DISPUTED');

ALTER TABLE "PlatformSettings"
  ADD COLUMN "payoutCoinValueToman" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "payoutMinCoins" INTEGER NOT NULL DEFAULT 100;

CREATE TABLE "EarningsAccount" (
    "id" TEXT NOT NULL,
    "ownerType" "LedgerOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "balanceUnits" BIGINT NOT NULL DEFAULT 0,
    "lifetimeEarnedUnits" BIGINT NOT NULL DEFAULT 0,
    "lifetimeWithdrawnUnits" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EarningsAccount_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EarningsAccount_balance_nonnegative" CHECK ("balanceUnits" >= 0)
);
CREATE UNIQUE INDEX "EarningsAccount_ownerType_ownerId_key" ON "EarningsAccount"("ownerType", "ownerId");
CREATE INDEX "EarningsAccount_ownerId_idx" ON "EarningsAccount"("ownerId");

CREATE TABLE "PayoutCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "holderName" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "iban" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayoutCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayoutCard_userId_cardNumber_key" ON "PayoutCard"("userId", "cardNumber");
CREATE INDEX "PayoutCard_userId_idx" ON "PayoutCard"("userId");

CREATE TABLE "WithdrawalRequest" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "ownerType" "LedgerOwnerType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "amountUnits" BIGINT NOT NULL,
    "coinValueToman" INTEGER NOT NULL,
    "amountToman" BIGINT NOT NULL,
    "cardHolder" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "iban" TEXT,
    "requesterNote" TEXT,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "processedById" TEXT,
    "processedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "receiptKey" TEXT,
    "response" "WithdrawalResponseStatus",
    "responseNote" TEXT,
    "respondedAt" TIMESTAMP(3),
    "disputeResolvedAt" TIMESTAMP(3),
    "disputeResolution" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WithdrawalRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WithdrawalRequest_amount_positive" CHECK ("amountUnits" > 0 AND "amountToman" > 0)
);
CREATE UNIQUE INDEX "WithdrawalRequest_code_key" ON "WithdrawalRequest"("code");
CREATE UNIQUE INDEX "WithdrawalRequest_idempotencyKey_key" ON "WithdrawalRequest"("idempotencyKey");
CREATE UNIQUE INDEX "WithdrawalRequest_open_account_key" ON "WithdrawalRequest"("accountId") WHERE "status" IN ('PENDING', 'PROCESSING');
CREATE INDEX "WithdrawalRequest_accountId_status_idx" ON "WithdrawalRequest"("accountId", "status");
CREATE INDEX "WithdrawalRequest_requesterId_createdAt_idx" ON "WithdrawalRequest"("requesterId", "createdAt");
CREATE INDEX "WithdrawalRequest_status_createdAt_idx" ON "WithdrawalRequest"("status", "createdAt");
CREATE INDEX "WithdrawalRequest_ownerType_ownerId_idx" ON "WithdrawalRequest"("ownerType", "ownerId");
ALTER TABLE "WithdrawalRequest" ADD CONSTRAINT "WithdrawalRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EarningsAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WithdrawalEvent" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "type" "WithdrawalEventType" NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WithdrawalEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WithdrawalEvent_withdrawalId_createdAt_idx" ON "WithdrawalEvent"("withdrawalId", "createdAt");
ALTER TABLE "WithdrawalEvent" ADD CONSTRAINT "WithdrawalEvent_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "WithdrawalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "EarningsAccount" ("id", "ownerType", "ownerId", "balanceUnits", "lifetimeEarnedUnits", "lifetimeWithdrawnUnits", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, s."ownerType"::"LedgerOwnerType", s."ownerId", s."remaining", s."total", s."total" - s."remaining", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT ra."beneficiaryType"::text AS "ownerType", ra."beneficiaryId" AS "ownerId",
         SUM(ra."allocatedUnits")::bigint AS "total",
         FLOOR(SUM(CASE
           WHEN ra."settlementLineId" IS NULL THEN ra."allocatedUnits"::numeric
           WHEN sl."owedMicro" > 0 THEN ra."allocatedUnits"::numeric * GREATEST(sl."owedMicro" - sl."paidMicro", 0)::numeric / sl."owedMicro"::numeric
           ELSE 0
         END))::bigint AS "remaining"
  FROM "RevenueAllocation" ra
  LEFT JOIN "SettlementLine" sl ON sl."id" = ra."settlementLineId"
  WHERE ra."beneficiaryType" <> 'PLATFORM' AND ra."beneficiaryId" IS NOT NULL
  GROUP BY ra."beneficiaryType", ra."beneficiaryId"
) s
WHERE s."total" > 0;

INSERT INTO "LedgerEntry" ("id", "account", "ownerType", "ownerId", "direction", "amountUnits", "currency", "sourceType", "sourceId", "idempotencyKey", "note", "createdAt")
SELECT gen_random_uuid()::text, 'BENEFICIARY_PAYABLE'::"LedgerAccount", a."ownerType", a."ownerId", 'CREDIT'::"LedgerDirection", a."balanceUnits", 'COIN_UNIT'::"LedgerCurrency", 'EARNINGS_OPENING', a."id", 'earnings-opening:' || a."ownerType"::text || ':' || a."ownerId", 'migration', CURRENT_TIMESTAMP
FROM "EarningsAccount" a
WHERE a."balanceUnits" > 0;