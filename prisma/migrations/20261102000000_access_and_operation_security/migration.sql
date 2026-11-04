CREATE TYPE "LicenseScope" AS ENUM ('STANDARD', 'GLOBAL', 'PERSONAL');
CREATE TYPE "ComicAccessMode" AS ENUM ('OPEN', 'PERSONAL');
CREATE TYPE "AccessSource" AS ENUM ('MIGRATION', 'LICENSE', 'GLOBAL', 'ADMIN', 'RECOVERY');
CREATE TYPE "PublisherStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CONSUMED');

ALTER TABLE "License" ADD COLUMN "scope" "LicenseScope" NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "Publisher"
  ADD COLUMN "status" "PublisherStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedById" TEXT,
  ADD COLUMN "suspensionReason" TEXT;
CREATE INDEX "Publisher_status_idx" ON "Publisher"("status");

ALTER TABLE "PublisherStaff"
  ADD COLUMN "canPublish" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canEdit" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "canDelete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageEditions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canSensitive" BOOLEAN NOT NULL DEFAULT false;
UPDATE "PublisherStaff" SET "canManageEditions" = "canManageComics", "canDelete" = "canManageComics";

ALTER TABLE "Comic"
  ADD COLUMN "accessMode" "ComicAccessMode" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "emergencyLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedState" JSONB;
CREATE INDEX "Comic_deletedAt_idx" ON "Comic"("deletedAt");

ALTER TABLE "Edition"
  ADD COLUMN "emergencyLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedState" JSONB;

ALTER TABLE "Chapter"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deletedState" JSONB;
CREATE INDEX "Chapter_deletedAt_idx" ON "Chapter"("deletedAt");

CREATE TABLE "ComicAccess" (
    "id" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "source" "AccessSource" NOT NULL DEFAULT 'ADMIN',
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "grantedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ComicAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComicAccess_comicId_publisherId_key" ON "ComicAccess"("comicId", "publisherId");
CREATE INDEX "ComicAccess_publisherId_idx" ON "ComicAccess"("publisherId");
ALTER TABLE "ComicAccess" ADD CONSTRAINT "ComicAccess_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComicAccess" ADD CONSTRAINT "ComicAccess_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OperationPolicy" (
    "operation" TEXT NOT NULL,
    "maxUnits" INTEGER NOT NULL,
    "windowHours" INTEGER NOT NULL DEFAULT 24,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationPolicy_pkey" PRIMARY KEY ("operation")
);

CREATE TABLE "OperationLog" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "publisherId" TEXT,
    "comicId" TEXT,
    "units" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationLog_operation_actorId_createdAt_idx" ON "OperationLog"("operation", "actorId", "createdAt");
CREATE INDEX "OperationLog_operation_publisherId_createdAt_idx" ON "OperationLog"("operation", "publisherId", "createdAt");
CREATE INDEX "OperationLog_operation_comicId_createdAt_idx" ON "OperationLog"("operation", "comicId", "createdAt");

CREATE TABLE "OperationApproval" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "publisherId" TEXT,
    "comicId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "status" "ApprovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationApproval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OperationApproval_status_createdAt_idx" ON "OperationApproval"("status", "createdAt");
CREATE INDEX "OperationApproval_actorId_operation_targetId_status_idx" ON "OperationApproval"("actorId", "operation", "targetId", "status");

INSERT INTO "ComicAccess" ("id", "comicId", "publisherId", "isOwner", "readOnly", "source", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", l."publisherId", true, false, 'MIGRATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Comic" c
JOIN "License" l ON l."id" = c."licenseId"
WHERE l."publisherId" <> 'platform-internal-publisher'
ON CONFLICT ("comicId", "publisherId") DO NOTHING;

INSERT INTO "ComicAccess" ("id", "comicId", "publisherId", "isOwner", "readOnly", "source", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."workId", e."publisherId", false, false, 'MIGRATION', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Edition" e
WHERE e."publisherId" <> 'platform-internal-publisher'
ON CONFLICT ("comicId", "publisherId") DO NOTHING;