import "server-only";
import { getAllowedAgeRatings } from "./content-filter";
import { getCategoryBySlug } from "./categories";
import { prisma } from "./prisma";
import { adjustedScore } from "./rating";
import type { ComicStatus, Prisma } from "@prisma/client";

export type ExploreSort = "newest" | "popular" | "rating" | "updated";
export type ExploreAccess = "FREE" | "COIN";

const EXPLORE_SORTS: ExploreSort[] = ["newest", "popular", "rating", "updated"];

export function parseExploreSort(value?: string): ExploreSort {
  return EXPLORE_SORTS.includes(value as ExploreSort) ? (value as ExploreSort) : "newest";
}

export interface ExploreFilters {
  q?: string;
  categorySlug?: string;
  genreIds?: string[];
  status?: ComicStatus;
  access?: ExploreAccess;
  language?: string;
}

export async function resolveExploreWhere(filters: ExploreFilters): Promise<Prisma.ComicWhereInput> {
  const allowedRatings = await getAllowedAgeRatings();
  const category = filters.categorySlug ? await getCategoryBySlug(filters.categorySlug) : null;
  const trimmedQuery = filters.q?.trim();

  return {
    approvalStatus: "APPROVED",
    ageRating: { in: allowedRatings },
    ...(trimmedQuery ? { title: { contains: trimmedQuery, mode: "insensitive" as const } } : {}),
    ...(category ? { categoryId: category.id } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.genreIds?.length ? { genres: { some: { genreId: { in: filters.genreIds } } } } : {}),
    ...(filters.access
      ? { chapters: { some: { publishedAt: { not: null }, accessType: filters.access } } }
      : {}),
    ...(filters.language
      ? { editions: { some: { language: filters.language, status: "ACTIVE" as const } } }
      : {}),
  };
}

const COMIC_CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  coverImage: true,
  dominantColor: true,
  status: true,
  ratingCount: true,
  ratingTotal: true,
  chapters: {
    where: { publishedAt: { not: null } },
    orderBy: { chapterNumber: "desc" },
    take: 1,
    select: { chapterNumber: true },
  },
} satisfies Prisma.ComicSelect;

export type ExploreComic = Prisma.ComicGetPayload<{ select: typeof COMIC_CARD_SELECT }>;

async function loadByIds(ids: string[]): Promise<ExploreComic[]> {
  if (ids.length === 0) return [];
  const rows = await prisma.comic.findMany({ where: { id: { in: ids } }, select: COMIC_CARD_SELECT });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is ExploreComic => Boolean(row));
}

export async function fetchExploreComics(
  where: Prisma.ComicWhereInput,
  sort: ExploreSort,
  page: number,
  pageSize: number
): Promise<ExploreComic[]> {
  const skip = (page - 1) * pageSize;

  if (sort === "rating") {
    const rows = await prisma.comic.findMany({
      where,
      select: { id: true, ratingTotal: true, ratingCount: true },
    });
    const ids = rows
      .sort((a, b) => adjustedScore(b.ratingTotal, b.ratingCount) - adjustedScore(a.ratingTotal, a.ratingCount))
      .slice(skip, skip + pageSize)
      .map((row) => row.id);
    return loadByIds(ids);
  }

  if (sort === "updated") {
    const groups = await prisma.chapter.groupBy({
      by: ["comicId"],
      where: { publishedAt: { not: null }, comic: where },
      _max: { publishedAt: true },
      orderBy: { _max: { publishedAt: "desc" } },
      skip,
      take: pageSize,
    });
    return loadByIds(groups.map((group) => group.comicId));
  }

  return prisma.comic.findMany({
    where,
    orderBy: sort === "popular" ? { viewCount: "desc" as const } : { createdAt: "desc" as const },
    skip,
    take: pageSize,
    select: COMIC_CARD_SELECT,
  });
}