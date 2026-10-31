import "server-only";
import { unstable_cache } from "next/cache";
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

function normalizeSearchText(value: string): string {
  return value
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchClauses(raw: string): Prisma.ComicWhereInput[] {
  const normalized = normalizeSearchText(raw);
  const arabicVariant = normalized.replace(/ی/g, "ي").replace(/ک/g, "ك");
  const titleTerms = [...new Set([raw, normalized, arabicVariant])].filter(Boolean);

  const clauses: Prisma.ComicWhereInput[] = titleTerms.map((term) => ({
    title: { contains: term, mode: "insensitive" },
  }));

  const slugTerm = normalized.toLowerCase().replace(/[\s_]+/g, "-");
  if (/^[a-z0-9-]+$/.test(slugTerm)) {
    clauses.push({ slug: { contains: slugTerm, mode: "insensitive" } });
  }

  return clauses;
}

export async function resolveExploreWhere(filters: ExploreFilters): Promise<Prisma.ComicWhereInput> {
  const allowedRatings = await getAllowedAgeRatings();
  const category = filters.categorySlug ? await getCategoryBySlug(filters.categorySlug) : null;
  const trimmedQuery = filters.q?.trim();

  return {
    approvalStatus: "APPROVED",
    ageRating: { in: allowedRatings },
    ...(trimmedQuery ? { OR: buildSearchClauses(trimmedQuery) } : {}),
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

const RATING_RANK_LIMIT = 5000;
const RANKING_REVALIDATE_SECONDS = 120;

const rankComicIdsByRating = unstable_cache(
  async (where: Prisma.ComicWhereInput): Promise<string[]> => {
    const rows = await prisma.comic.findMany({
      where,
      select: { id: true, ratingTotal: true, ratingCount: true },
    });
    return rows
      .sort(
        (a, b) =>
          adjustedScore(b.ratingTotal, b.ratingCount) - adjustedScore(a.ratingTotal, a.ratingCount) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, RATING_RANK_LIMIT)
      .map((row) => row.id);
  },
  ["explore:rank-rating:v1"],
  { revalidate: RANKING_REVALIDATE_SECONDS, tags: ["explore-ranking"] }
);

const rankComicIdsByUpdate = unstable_cache(
  async (where: Prisma.ComicWhereInput, skip: number, take: number): Promise<string[]> => {
    const groups = await prisma.chapter.groupBy({
      by: ["comicId"],
      where: { publishedAt: { not: null }, comic: where },
      _max: { publishedAt: true },
      orderBy: { _max: { publishedAt: "desc" } },
      skip,
      take,
    });
    return groups.map((group) => group.comicId);
  },
  ["explore:rank-updated:v1"],
  { revalidate: RANKING_REVALIDATE_SECONDS, tags: ["explore-ranking"] }
);

export async function fetchExploreComics(
  where: Prisma.ComicWhereInput,
  sort: ExploreSort,
  page: number,
  pageSize: number
): Promise<ExploreComic[]> {
  const skip = (page - 1) * pageSize;

  if (sort === "rating") {
    const ids = await rankComicIdsByRating(where);
    return loadByIds(ids.slice(skip, skip + pageSize));
  }

  if (sort === "updated") {
    const ids = await rankComicIdsByUpdate(where, skip, pageSize);
    return loadByIds(ids);
  }

  return prisma.comic.findMany({
    where,
    orderBy: sort === "popular" ? { viewCount: "desc" as const } : { createdAt: "desc" as const },
    skip,
    take: pageSize,
    select: COMIC_CARD_SELECT,
  });
}