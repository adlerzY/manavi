CREATE INDEX IF NOT EXISTS "ChapterReadMark_readAt_idx" ON "ChapterReadMark"("readAt");
CREATE INDEX IF NOT EXISTS "ChapterReaction_createdAt_idx" ON "ChapterReaction"("createdAt");
CREATE INDEX IF NOT EXISTS "ChapterStaff_userId_idx" ON "ChapterStaff"("userId");
CREATE INDEX IF NOT EXISTS "ComicStaff_userId_idx" ON "ComicStaff"("userId");
CREATE INDEX IF NOT EXISTS "PublisherStaff_userId_idx" ON "PublisherStaff"("userId");
CREATE INDEX IF NOT EXISTS "Comic_approvalStatus_ageRating_createdAt_idx" ON "Comic"("approvalStatus", "ageRating", "createdAt" DESC);