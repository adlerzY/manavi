import "server-only";
import type { AgeRating } from "@prisma/client";
import { prisma } from "./prisma";

export interface ContinueReadingItem {
  comicId: string;
  slug: string;
  title: string;
  coverImage: string;
  dominantColor: string | null;
  chapterId: string;
  chapterNumber: number;
  page: number;
  totalPages: number;
  progress: number;
}

export async function getContinueReading(
  userId: string,
  allowedRatings: AgeRating[],
  limit = 8
): Promise<ContinueReadingItem[]> {
  const history = await prisma.readHistory.findMany({
    where: { userId, comic: { ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" } },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      lastChapterId: true,
      lastPage: true,
      comic: { select: { id: true, slug: true, title: true, coverImage: true, dominantColor: true } },
    },
  });
  if (history.length === 0) return [];

  const chapters = await prisma.chapter.findMany({
    where: { id: { in: history.map((entry) => entry.lastChapterId) }, publishedAt: { not: null } },
    select: { id: true, chapterNumber: true, pages: true },
  });
  const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]));

  const items: ContinueReadingItem[] = [];
  for (const entry of history) {
    const chapter = chapterById.get(entry.lastChapterId);
    if (!chapter) continue;
    const totalPages = Math.max(1, chapter.pages.length);
    const page = Math.min(totalPages, Math.max(1, entry.lastPage));
    items.push({
      comicId: entry.comic.id,
      slug: entry.comic.slug,
      title: entry.comic.title,
      coverImage: entry.comic.coverImage,
      dominantColor: entry.comic.dominantColor,
      chapterId: chapter.id,
      chapterNumber: chapter.chapterNumber,
      page,
      totalPages,
      progress: Math.min(1, page / totalPages),
    });
  }
  return items;
}