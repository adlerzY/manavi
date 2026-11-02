import "server-only";
import { prisma } from "./prisma";

export interface SiteStats {
  readerCount: number;
  comicCount: number;
  chapterCount: number;
}

export async function getSiteStats(): Promise<SiteStats> {
  const [readerCount, comicCount, chapterCount] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.comic.count({
      where: { chapters: { some: { publishedAt: { not: null } } } },
    }),
    prisma.chapter.count({ where: { publishedAt: { not: null } } }),
  ]);

  return {
    readerCount,
    comicCount,
    chapterCount,
  };
}