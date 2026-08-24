import "server-only";
import { unstable_cache } from "next/cache";
import type { AgeRating } from "@prisma/client";
import { prisma } from "./prisma";

const HOME_FEED_REVALIDATE_SECONDS = 120;
const HOME_FEED_TAG = "home-feed";
const GENRE_RECOMMENDATIONS_REVALIDATE_SECONDS = 300;

export interface HeroComic {
  id: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  dominantColor: string | null;
  featuredBadge: string | null;
}

async function fetchHeroComics(allowedRatings: AgeRating[]): Promise<HeroComic[]> {
  const featured = await prisma.comic.findMany({
    where: { ageRating: { in: allowedRatings }, isFeaturedOnHome: true, approvalStatus: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, title: true, slug: true, description: true, coverImage: true, dominantColor: true, featuredBadge: true },
  });

  if (featured.length > 0) {
    return featured;
  }

  const fallback = await prisma.comic.findFirst({
    where: { ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" },
    orderBy: { bookmarks: { _count: "desc" } },
    select: { id: true, title: true, slug: true, description: true, coverImage: true, dominantColor: true, featuredBadge: true },
  });

  return fallback ? [fallback] : [];
}

export const getHeroComics = unstable_cache(fetchHeroComics, ["home-feed:hero"], {
  revalidate: HOME_FEED_REVALIDATE_SECONDS,
  tags: [HOME_FEED_TAG],
});

export interface RecommendedComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  latestChapter: number | null;
  latestChapterPublishedAt: Date | null;
  completed: boolean;
}

async function fetchGenreBasedRecommendations(userId: string, allowedRatings: AgeRating[]): Promise<RecommendedComic[]> {
  const viewedGenres = await prisma.readHistory.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { comic: { select: { id: true, genres: { select: { genreId: true } } } } },
  });

  const genreCounts = new Map<string, number>();
  const viewedComicIds = new Set<string>();
  for (const entry of viewedGenres) {
    viewedComicIds.add(entry.comic.id);
    for (const g of entry.comic.genres) {
      genreCounts.set(g.genreId, (genreCounts.get(g.genreId) ?? 0) + 1);
    }
  }

  if (genreCounts.size === 0) return [];

  const topGenreId = [...genreCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const comics = await prisma.comic.findMany({
    where: {
      id: { notIn: [...viewedComicIds] },
      ageRating: { in: allowedRatings },
      approvalStatus: "APPROVED",
      genres: { some: { genreId: topGenreId } },
    },
    orderBy: { viewCount: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      slug: true,
      coverImage: true,
      status: true,
      chapters: { where: { publishedAt: { not: null } }, orderBy: { chapterNumber: "desc" }, take: 1, select: { chapterNumber: true, publishedAt: true } },
    },
  });

  return comics.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    coverImage: c.coverImage,
    latestChapter: c.chapters[0]?.chapterNumber ?? null,
    latestChapterPublishedAt: c.chapters[0]?.publishedAt ?? null,
    completed: c.status === "COMPLETED",
  }));
}

export const getGenreBasedRecommendations = unstable_cache(
  fetchGenreBasedRecommendations,
  ["home-feed:genre-recommendations"],
  { revalidate: GENRE_RECOMMENDATIONS_REVALIDATE_SECONDS, tags: [HOME_FEED_TAG] }
);

export interface LatestCommentItem {
  id: string;
  content: string;
  createdAt: string;
  chapterId: string;
  chapterNumber: number;
  comic: { title: string; slug: string; coverImage: string; dominantColor: string | null };
  user: { firstName: string; username: string | null };
}

async function fetchLatestComments(allowedRatings: AgeRating[], limit = 8): Promise<LatestCommentItem[]> {
  const rows = await prisma.comment.findMany({
    where: { isSpoiler: false, status: "APPROVED", chapter: { comic: { ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      content: true,
      createdAt: true,
      chapter: {
        select: {
          id: true,
          chapterNumber: true,
          comic: { select: { title: true, slug: true, coverImage: true, dominantColor: true } },
        },
      },
      user: { select: { firstName: true, username: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    chapterId: r.chapter.id,
    chapterNumber: r.chapter.chapterNumber,
    comic: r.chapter.comic,
    user: r.user,
  }));
}

export const getLatestComments = unstable_cache(fetchLatestComments, ["home-feed:latest-comments"], {
  revalidate: HOME_FEED_REVALIDATE_SECONDS,
  tags: [HOME_FEED_TAG],
});

export interface CompletedSeriesComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  dominantColor: string | null;
  chapterCount: number;
}

async function fetchCompletedSeries(allowedRatings: AgeRating[], limit = 12): Promise<CompletedSeriesComic[]> {
  const comics = await prisma.comic.findMany({
    where: { ageRating: { in: allowedRatings }, status: "COMPLETED", approvalStatus: "APPROVED" },
    orderBy: { viewCount: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      coverImage: true,
      dominantColor: true,
      _count: { select: { chapters: true } },
    },
  });

  return comics.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    coverImage: c.coverImage,
    dominantColor: c.dominantColor,
    chapterCount: c._count.chapters,
  }));
}

export const getCompletedSeries = unstable_cache(fetchCompletedSeries, ["home-feed:completed-series"], {
  revalidate: HOME_FEED_REVALIDATE_SECONDS,
  tags: [HOME_FEED_TAG],
});

export interface MostBookmarkedComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  dominantColor: string | null;
  bookmarkCount: number;
  completed: boolean;
}

async function fetchMostBookmarkedComics(allowedRatings: AgeRating[], limit = 12): Promise<MostBookmarkedComic[]> {
  const comics = await prisma.comic.findMany({
    where: { ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" },
    orderBy: { bookmarks: { _count: "desc" } },
    take: limit,
    select: {
      id: true,
      title: true,
      slug: true,
      coverImage: true,
      dominantColor: true,
      status: true,
      _count: { select: { bookmarks: true } },
    },
  });

  return comics.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    coverImage: c.coverImage,
    dominantColor: c.dominantColor,
    bookmarkCount: c._count.bookmarks,
    completed: c.status === "COMPLETED",
  }));
}

export const getMostBookmarkedComics = unstable_cache(fetchMostBookmarkedComics, ["home-feed:most-bookmarked"], {
  revalidate: HOME_FEED_REVALIDATE_SECONDS,
  tags: [HOME_FEED_TAG],
});

export interface HomeFeedComic {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  latestChapter: number | null;
  latestChapterPublishedAt: Date | null;
  completed: boolean;
}

export interface CategoryPreview {
  categoryId: string;
  comics: HomeFeedComic[];
}

async function fetchCategoryPreview(categoryId: string, allowedRatings: AgeRating[]): Promise<HomeFeedComic[]> {
  const comics = await prisma.comic.findMany({
    where: { categoryId, ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      slug: true,
      coverImage: true,
      status: true,
      chapters: {
        where: { publishedAt: { not: null } },
        orderBy: { chapterNumber: "desc" },
        take: 1,
        select: { chapterNumber: true, publishedAt: true },
      },
    },
  });

  return comics.map((c) => ({
    id: c.id,
    title: c.title,
    slug: c.slug,
    coverImage: c.coverImage,
    latestChapter: c.chapters[0]?.chapterNumber ?? null,
    latestChapterPublishedAt: c.chapters[0]?.publishedAt ?? null,
    completed: c.status === "COMPLETED",
  }));
}

export const getCategoryPreview = unstable_cache(fetchCategoryPreview, ["home-feed:category-preview"], {
  revalidate: HOME_FEED_REVALIDATE_SECONDS,
  tags: [HOME_FEED_TAG],
});