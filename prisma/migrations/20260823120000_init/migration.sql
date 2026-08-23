CREATE TYPE "Role" AS ENUM ('USER', 'VIP', 'STAFF', 'PUBLISHER', 'ADMIN');
CREATE TYPE "LicenseStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED');
CREATE TYPE "ReadingDirection" AS ENUM ('LTR', 'RTL');
CREATE TYPE "ReadingMode" AS ENUM ('VERTICAL', 'HORIZONTAL', 'DOUBLE_PAGE');
CREATE TYPE "AgeRating" AS ENUM ('NORMAL', 'EIGHTEEN_PLUS', 'NSFW');
CREATE TYPE "ComicStatus" AS ENUM ('ONGOING', 'COMPLETED', 'HIATUS');
CREATE TYPE "ComicApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'NEEDS_CHANGES');
CREATE TYPE "StaffRole" AS ENUM ('LOCALIZATION_SPECIALIST', 'EDITOR', 'CLEANER', 'TYPIST');
CREATE TYPE "ChapterStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PENDING_APPROVAL', 'PUBLISHED');
CREATE TYPE "ChapterAccessType" AS ENUM ('FREE', 'COIN');
CREATE TYPE "CommentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "TransactionType" AS ENUM ('SUBSCRIPTION', 'DONATION', 'COIN_PURCHASE', 'CHAPTER_UNLOCK', 'ADMIN_GRANT', 'ADMIN_REVOKE', 'PUBLISHER_PAYOUT');
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID', 'DISPUTED');
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
CREATE TYPE "CreatorApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "coinsBalance" INTEGER NOT NULL DEFAULT 0,
    "contentPreference" "AgeRating" NOT NULL DEFAULT 'NORMAL',
    "isAgeVerified" BOOLEAN NOT NULL DEFAULT false,
    "referralCode" TEXT NOT NULL,
    "referredById" TEXT,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "referralRewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "bannedAt" TIMESTAMP(3),
    "banReason" TEXT,
    "deletedAt" TIMESTAMP(3),
    "bio" TEXT,
    "avatarUrl" TEXT,
    "telegramPhotoUrl" TEXT,
    "donationLink" TEXT,
    "cryptoWalletLabel" TEXT,
    "cryptoWalletAddress" TEXT,
    "customLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "User_referredById_idx" ON "User"("referredById");
CREATE INDEX "User_isBanned_idx" ON "User"("isBanned");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Publisher" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalEntity" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contractUserId" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "avatarUrl" TEXT,
    "telegramUrl" TEXT,
    "instagramUrl" TEXT,
    "websiteUrl" TEXT,
    "donationLink" TEXT,
    "cryptoWalletLabel" TEXT,
    "cryptoWalletAddress" TEXT,
    "customLinks" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Publisher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Publisher_contractUserId_key" ON "Publisher"("contractUserId");
CREATE INDEX "Publisher_isVerified_idx" ON "Publisher"("isVerified");
ALTER TABLE "Publisher" ADD CONSTRAINT "Publisher_contractUserId_fkey" FOREIGN KEY ("contractUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PublisherStaff" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "canUpload" BOOLEAN NOT NULL DEFAULT true,
    "canManageComics" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PublisherStaff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublisherStaff_publisherId_userId_role_key" ON "PublisherStaff"("publisherId", "userId", "role");
ALTER TABLE "PublisherStaff" ADD CONSTRAINT "PublisherStaff_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherStaff" ADD CONSTRAINT "PublisherStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "territory" TEXT[],
    "royaltyPercentage" DECIMAL(5,2) NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "contractReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "License_publisherId_idx" ON "License"("publisherId");
CREATE INDEX "License_status_idx" ON "License"("status");
ALTER TABLE "License" ADD CONSTRAINT "License_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "readingDirection" "ReadingDirection" NOT NULL DEFAULT 'LTR',
    "defaultReadingMode" "ReadingMode" NOT NULL DEFAULT 'VERTICAL',
    "showOnHomepage" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_showOnHomepage_sortOrder_idx" ON "Category"("showOnHomepage", "sortOrder");
CREATE INDEX "Category_isActive_sortOrder_idx" ON "Category"("isActive", "sortOrder");

CREATE TABLE "Genre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    CONSTRAINT "Genre_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Genre_name_key" ON "Genre"("name");
CREATE UNIQUE INDEX "Genre_slug_key" ON "Genre"("slug");

CREATE TABLE "Comic" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverImage" TEXT NOT NULL,
    "bannerImage" TEXT,
    "dominantColor" TEXT,
    "ageRating" "AgeRating" NOT NULL DEFAULT 'NORMAL',
    "status" "ComicStatus" NOT NULL DEFAULT 'ONGOING',
    "approvalStatus" "ComicApprovalStatus" NOT NULL DEFAULT 'APPROVED',
    "categoryId" TEXT NOT NULL,
    "readingMode" "ReadingMode" NOT NULL DEFAULT 'VERTICAL',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isFeaturedOnHome" BOOLEAN NOT NULL DEFAULT false,
    "featuredBadge" TEXT,
    "licenseId" TEXT NOT NULL,
    CONSTRAINT "Comic_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Comic_slug_key" ON "Comic"("slug");
CREATE INDEX "Comic_categoryId_idx" ON "Comic"("categoryId");
CREATE INDEX "Comic_licenseId_idx" ON "Comic"("licenseId");
CREATE INDEX "Comic_viewCount_idx" ON "Comic"("viewCount");
CREATE INDEX "Comic_createdAt_idx" ON "Comic"("createdAt");
CREATE INDEX "Comic_status_idx" ON "Comic"("status");
CREATE INDEX "Comic_approvalStatus_idx" ON "Comic"("approvalStatus");
CREATE INDEX "Comic_createdById_idx" ON "Comic"("createdById");
ALTER TABLE "Comic" ADD CONSTRAINT "Comic_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comic" ADD CONSTRAINT "Comic_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comic" ADD CONSTRAINT "Comic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ComicGenre" (
    "comicId" TEXT NOT NULL,
    "genreId" TEXT NOT NULL,
    CONSTRAINT "ComicGenre_pkey" PRIMARY KEY ("comicId","genreId")
);
ALTER TABLE "ComicGenre" ADD CONSTRAINT "ComicGenre_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComicGenre" ADD CONSTRAINT "ComicGenre_genreId_fkey" FOREIGN KEY ("genreId") REFERENCES "Genre"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ComicStaff" (
    "id" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleTitle" "StaffRole" NOT NULL,
    CONSTRAINT "ComicStaff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComicStaff_comicId_userId_roleTitle_key" ON "ComicStaff"("comicId", "userId", "roleTitle");
ALTER TABLE "ComicStaff" ADD CONSTRAINT "ComicStaff_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ComicStaff" ADD CONSTRAINT "ComicStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Chapter" (
    "id" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "chapterNumber" DOUBLE PRECISION NOT NULL,
    "title" TEXT,
    "pages" TEXT[],
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "accessType" "ChapterAccessType" NOT NULL DEFAULT 'FREE',
    "status" "ChapterStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Chapter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Chapter_comicId_publishedAt_idx" ON "Chapter"("comicId", "publishedAt");
CREATE INDEX "Chapter_comicId_chapterNumber_idx" ON "Chapter"("comicId", "chapterNumber");
CREATE INDEX "Chapter_status_scheduledAt_idx" ON "Chapter"("status", "scheduledAt");
CREATE INDEX "Chapter_viewCount_idx" ON "Chapter"("viewCount");
CREATE INDEX "Chapter_uploadedById_idx" ON "Chapter"("uploadedById");
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Chapter" ADD CONSTRAINT "Chapter_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ChapterStaff" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleTitle" "StaffRole" NOT NULL,
    CONSTRAINT "ChapterStaff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChapterStaff_chapterId_userId_roleTitle_key" ON "ChapterStaff"("chapterId", "userId", "roleTitle");
ALTER TABLE "ChapterStaff" ADD CONSTRAINT "ChapterStaff_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterStaff" ADD CONSTRAINT "ChapterStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChapterUnlock" (
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    CONSTRAINT "ChapterUnlock_pkey" PRIMARY KEY ("userId","chapterId")
);
ALTER TABLE "ChapterUnlock" ADD CONSTRAINT "ChapterUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterUnlock" ADD CONSTRAINT "ChapterUnlock_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChapterReadMark" (
    "userId" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterReadMark_pkey" PRIMARY KEY ("userId","chapterId")
);
CREATE INDEX "ChapterReadMark_userId_comicId_idx" ON "ChapterReadMark"("userId", "comicId");
ALTER TABLE "ChapterReadMark" ADD CONSTRAINT "ChapterReadMark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterReadMark" ADD CONSTRAINT "ChapterReadMark_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterReadMark" ADD CONSTRAINT "ChapterReadMark_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ChapterReaction" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChapterReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChapterReaction_chapterId_userId_key" ON "ChapterReaction"("chapterId", "userId");
CREATE INDEX "ChapterReaction_chapterId_idx" ON "ChapterReaction"("chapterId");
ALTER TABLE "ChapterReaction" ADD CONSTRAINT "ChapterReaction_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChapterReaction" ADD CONSTRAINT "ChapterReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "chapterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "isStaffReply" BOOLEAN NOT NULL DEFAULT false,
    "status" "CommentStatus" NOT NULL DEFAULT 'APPROVED',
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Comment_chapterId_status_idx" ON "Comment"("chapterId", "status");
CREATE INDEX "Comment_chapterId_createdAt_idx" ON "Comment"("chapterId", "createdAt");
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
CREATE INDEX "Comment_status_idx" ON "Comment"("status");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Bookmark" (
    "userId" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "notifyOnNewChapter" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("userId","comicId")
);
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReadHistory" (
    "userId" TEXT NOT NULL,
    "comicId" TEXT NOT NULL,
    "lastChapterId" TEXT NOT NULL,
    "lastPage" INTEGER NOT NULL DEFAULT 1,
    "scrollFraction" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReadHistory_pkey" PRIMARY KEY ("userId","comicId")
);
ALTER TABLE "ReadHistory" ADD CONSTRAINT "ReadHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReadHistory" ADD CONSTRAINT "ReadHistory_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CoinPackage" (
    "id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "bonusCoins" INTEGER NOT NULL DEFAULT 0,
    "badge" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoinPackage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CoinPackage_isActive_sortOrder_idx" ON "CoinPackage"("isActive", "sortOrder");

CREATE TABLE "RoyaltySettlement" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossRevenue" DECIMAL(12,2) NOT NULL,
    "publisherShare" DECIMAL(12,2) NOT NULL,
    "localizationTeamShare" DECIMAL(12,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoyaltySettlement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RoyaltySettlement_licenseId_periodStart_idx" ON "RoyaltySettlement"("licenseId", "periodStart");
ALTER TABLE "RoyaltySettlement" ADD CONSTRAINT "RoyaltySettlement_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(20,9) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IRT',
    "payerId" TEXT NOT NULL,
    "receiverId" TEXT,
    "message" TEXT,
    "comicId" TEXT,
    "coinPackageId" TEXT,
    "customCoins" INTEGER,
    "payoutPublisherId" TEXT,
    "tonComment" TEXT,
    "tonTxHash" TEXT,
    "settlementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Transaction_tonComment_key" ON "Transaction"("tonComment");
CREATE INDEX "Transaction_comicId_idx" ON "Transaction"("comicId");
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");
CREATE INDEX "Transaction_settlementId_idx" ON "Transaction"("settlementId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_receiverId_idx" ON "Transaction"("receiverId");
CREATE INDEX "Transaction_coinPackageId_idx" ON "Transaction"("coinPackageId");
CREATE INDEX "Transaction_payoutPublisherId_idx" ON "Transaction"("payoutPublisherId");
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_comicId_fkey" FOREIGN KEY ("comicId") REFERENCES "Comic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_coinPackageId_fkey" FOREIGN KEY ("coinPackageId") REFERENCES "CoinPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_payoutPublisherId_fkey" FOREIGN KEY ("payoutPublisherId") REFERENCES "Publisher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "RoyaltySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PayoutRequest" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "amountToman" DECIMAL(12,2),
    "amountTon" DECIMAL(20,9),
    "paidAmountTon" DECIMAL(20,9),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "tonTransactionId" TEXT,
    CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayoutRequest_tonTransactionId_key" ON "PayoutRequest"("tonTransactionId");
CREATE INDEX "PayoutRequest_publisherId_idx" ON "PayoutRequest"("publisherId");
CREATE INDEX "PayoutRequest_status_idx" ON "PayoutRequest"("status");
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "Publisher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_tonTransactionId_fkey" FOREIGN KEY ("tonTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "DevToolsStrike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DevToolsStrike_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DevToolsStrike_userId_createdAt_idx" ON "DevToolsStrike"("userId", "createdAt");
ALTER TABLE "DevToolsStrike" ADD CONSTRAINT "DevToolsStrike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CreatorApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "portfolioUrl" TEXT,
    "message" TEXT NOT NULL,
    "status" "CreatorApplicationStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreatorApplication_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SearchTerm" (
    "id" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SearchTerm_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SearchTerm_term_key" ON "SearchTerm"("term");
CREATE INDEX "SearchTerm_count_idx" ON "SearchTerm"("count");

CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "chapterUnlockCoinCost" INTEGER NOT NULL DEFAULT 15,
    "newReleaseThresholdHours" INTEGER NOT NULL DEFAULT 72,
    "coinPriceUsdt" DECIMAL(20,6) NOT NULL DEFAULT 0.002,
    "tomanPerUsdt" INTEGER NOT NULL DEFAULT 0,
    "referralRewardCoins" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

CREATE TABLE "AdminNotice" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminNotice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminNotice_expiresAt_idx" ON "AdminNotice"("expiresAt");

INSERT INTO "PlatformSettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);