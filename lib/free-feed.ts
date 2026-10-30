import "server-only";
import { unstable_cache } from "next/cache";
import type { AgeRating, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const FREE_FEED_REVALIDATE_SECONDS = 120;
const FREE_FEED_TAG = "home-feed";

export interface FullyFreeComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  latestChapter: number | null;
  completed: boolean;
  chapterCount: number;
}

const COMIC_SELECT = {
  id: true,
  title: true,
  slug: true,
  coverImage: true,
  status: true,
  chapters: {
    where: { publishedAt: { not: null } },
    orderBy: { chapterNumber: "desc" },
    take: 1,
    select: { chapterNumber: true },
  },
  _count: { select: { chapters: { where: { publishedAt: { not: null } } } } },
} satisfies Prisma.ComicSelect;

type FreeRow = Prisma.ComicGetPayload<{ select: typeof COMIC_SELECT }>;

function fullyFreeWhere(allowedRatings: AgeRating[]): Prisma.ComicWhereInput {
  return {
    ageRating: { in: allowedRatings },
    approvalStatus: "APPROVED",
    editions: { some: { status: "ACTIVE" } },
    chapters: {
      some: { publishedAt: { not: null }, accessType: "FREE" },
      none: { publishedAt: { not: null }, accessType: "COIN" },
    },
  };
}

function toFullyFree(row: FreeRow): FullyFreeComic {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    coverImage: row.coverImage,
    latestChapter: row.chapters[0]?.chapterNumber ?? null,
    completed: row.status === "COMPLETED",
    chapterCount: row._count.chapters,
  };
}

export const getFullyFreeComics = unstable_cache(
  async (allowedRatings: AgeRating[], limit: number): Promise<FullyFreeComic[]> => {
    const rows = await prisma.comic.findMany({
      where: fullyFreeWhere(allowedRatings),
      orderBy: { viewCount: "desc" },
      take: limit,
      select: COMIC_SELECT,
    });
    return rows.map(toFullyFree);
  },
  ["free-feed:list"],
  { revalidate: FREE_FEED_REVALIDATE_SECONDS, tags: [FREE_FEED_TAG] }
);

export const getFullyFreePage = unstable_cache(
  async (
    allowedRatings: AgeRating[],
    page: number,
    pageSize: number
  ): Promise<{ comics: FullyFreeComic[]; total: number }> => {
    const where = fullyFreeWhere(allowedRatings);
    const [rows, total] = await Promise.all([
      prisma.comic.findMany({
        where,
        orderBy: [{ viewCount: "desc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: COMIC_SELECT,
      }),
      prisma.comic.count({ where }),
    ]);
    return { comics: rows.map(toFullyFree), total };
  },
  ["free-feed:page"],
  { revalidate: FREE_FEED_REVALIDATE_SECONDS, tags: [FREE_FEED_TAG] }
);