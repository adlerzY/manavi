"use server";

import { unstable_cache } from "next/cache";
import type { AgeRating, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAllowedAgeRatings } from "@/lib/content-filter";

export interface HomeFeedComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  latestChapter: number | null;
  completed: boolean;
}

const HOME_FEED_LIST_REVALIDATE_SECONDS = 120;
const HOME_FEED_SIZE = 18;
const NEWEST_WINDOW = 300;

const COMIC_CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  coverImage: true,
  status: true,
} satisfies Prisma.ComicSelect;

interface LatestEntry {
  comicId: string;
  latestChapter: number | null;
}

function buildComicFilter(allowedRatings: AgeRating[], genreId: string | null): Prisma.ComicWhereInput {
  return {
    ageRating: { in: allowedRatings },
    approvalStatus: "APPROVED",
    ...(genreId ? { genres: { some: { genreId } } } : {}),
  };
}

async function loadLatestEntries(comicFilter: Prisma.ComicWhereInput): Promise<LatestEntry[]> {
  const where: Prisma.ChapterWhereInput = { publishedAt: { not: null }, comic: comicFilter };

  const recent = await prisma.chapter.findMany({
    where,
    orderBy: { publishedAt: "desc" },
    take: NEWEST_WINDOW,
    select: { comicId: true, chapterNumber: true },
  });

  const seen = new Map<string, number | null>();
  for (const row of recent) {
    if (!seen.has(row.comicId)) seen.set(row.comicId, row.chapterNumber);
    if (seen.size >= HOME_FEED_SIZE) break;
  }

  if (seen.size >= HOME_FEED_SIZE || recent.length < NEWEST_WINDOW) {
    return [...seen.entries()].map(([comicId, latestChapter]) => ({ comicId, latestChapter }));
  }

  const groups = await prisma.chapter.groupBy({
    by: ["comicId"],
    where,
    _max: { publishedAt: true, chapterNumber: true },
    orderBy: { _max: { publishedAt: "desc" } },
    take: HOME_FEED_SIZE,
  });
  return groups.map((group) => ({ comicId: group.comicId, latestChapter: group._max.chapterNumber }));
}

const fetchHomeFeedComics = unstable_cache(
  async (mode: "newest" | "popular", allowedRatings: AgeRating[], genreId: string | null): Promise<HomeFeedComic[]> => {
    const comicFilter = buildComicFilter(allowedRatings, genreId);

    if (mode === "newest") {
      const latest = await loadLatestEntries(comicFilter);
      if (latest.length === 0) return [];

      const rows = await prisma.comic.findMany({
        where: { id: { in: latest.map((entry) => entry.comicId) } },
        select: COMIC_CARD_SELECT,
      });
      const byId = new Map(rows.map((row) => [row.id, row]));

      const result: HomeFeedComic[] = [];
      for (const entry of latest) {
        const comic = byId.get(entry.comicId);
        if (!comic) continue;
        result.push({
          id: comic.id,
          title: comic.title,
          slug: comic.slug,
          coverImage: comic.coverImage,
          latestChapter: entry.latestChapter,
          completed: comic.status === "COMPLETED",
        });
      }
      return result;
    }

    const comics = await prisma.comic.findMany({
      where: comicFilter,
      orderBy: { viewCount: "desc" },
      take: HOME_FEED_SIZE,
      select: {
        ...COMIC_CARD_SELECT,
        chapters: {
          where: { publishedAt: { not: null } },
          orderBy: { chapterNumber: "desc" },
          take: 1,
          select: { chapterNumber: true },
        },
      },
    });

    return comics.map((comic) => ({
      id: comic.id,
      title: comic.title,
      slug: comic.slug,
      coverImage: comic.coverImage,
      latestChapter: comic.chapters[0]?.chapterNumber ?? null,
      completed: comic.status === "COMPLETED",
    }));
  },
  ["home-feed:list:v2"],
  { revalidate: HOME_FEED_LIST_REVALIDATE_SECONDS, tags: ["home-feed"] }
);

export async function getHomeFeedComics(mode: "newest" | "popular", genreId?: string | null): Promise<HomeFeedComic[]> {
  const allowedRatings = await getAllowedAgeRatings();
  return fetchHomeFeedComics(mode, allowedRatings, genreId ?? null);
}