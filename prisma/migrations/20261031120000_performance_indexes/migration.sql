CREATE INDEX IF NOT EXISTS "Bookmark_comicId_idx" ON "Bookmark"("comicId");
CREATE INDEX IF NOT EXISTS "Comment_userId_idx" ON "Comment"("userId");
CREATE INDEX IF NOT EXISTS "Comment_status_createdAt_idx" ON "Comment"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ChapterReaction_userId_idx" ON "ChapterReaction"("userId");
CREATE INDEX IF NOT EXISTS "Comic_approvalStatus_ageRating_viewCount_idx" ON "Comic"("approvalStatus", "ageRating", "viewCount" DESC);
CREATE INDEX IF NOT EXISTS "Chapter_publishedAt_idx" ON "Chapter"("publishedAt" DESC);