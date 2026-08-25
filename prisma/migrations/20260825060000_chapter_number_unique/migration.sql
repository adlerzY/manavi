
DROP INDEX IF EXISTS "Chapter_comicId_chapterNumber_idx";
CREATE UNIQUE INDEX "Chapter_comicId_chapterNumber_key" ON "Chapter"("comicId", "chapterNumber");