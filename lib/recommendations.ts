import "server-only";
import { unstable_cache } from "next/cache";
import type { AgeRating, ComicStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { redis, isRedisConfigured } from "./redis";
import { adjustedScore } from "./rating";
import type { RecommendedComic } from "./home-feed";

const RECENT_VIEWS_MAX = 30;
const RECENT_VIEWS_TTL_SECONDS = 30 * 24 * 60 * 60;
const CANDIDATE_LIMIT = 150;
const SIMILAR_CANDIDATE_LIMIT = 80;
const DAY_MS = 86_400_000;
const RECOMMENDATIONS_TAG = "home-feed-recommendations";

const recentViewsKey = (userId: string) => `recent-views:${userId}`;

export async function recordComicView(userId: string, comicId: string): Promise<void> {
  if (!isRedisConfigured) return;
  try {
    const key = recentViewsKey(userId);
    const pipeline = redis.pipeline();
    pipeline.zadd(key, { score: Date.now(), member: comicId });
    pipeline.zremrangebyrank(key, 0, -(RECENT_VIEWS_MAX + 1));
    pipeline.expire(key, RECENT_VIEWS_TTL_SECONDS);
    await pipeline.exec();
  } catch {}
}

async function getRecentViewedIds(userId: string): Promise<string[]> {
  if (!isRedisConfigured) return [];
  try {
    const ids = await redis.zrange<string[]>(recentViewsKey(userId), 0, RECENT_VIEWS_MAX - 1, { rev: true });
    return Array.isArray(ids) ? ids.map(String) : [];
  } catch {
    return [];
  }
}

const COMIC_CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  coverImage: true,
  dominantColor: true,
  status: true,
  categoryId: true,
  viewCount: true,
  ratingCount: true,
  ratingTotal: true,
  createdAt: true,
  genres: { select: { genreId: true } },
  chapters: {
    where: { publishedAt: { not: null } },
    orderBy: { chapterNumber: "desc" },
    take: 1,
    select: { chapterNumber: true },
  },
} satisfies Prisma.ComicSelect;

type CandidateRow = Prisma.ComicGetPayload<{ select: typeof COMIC_CARD_SELECT }>;

export interface ComicCardData {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  dominantColor: string | null;
  status: ComicStatus;
  ratingCount: number;
  ratingTotal: number;
  latestChapter: number | null;
}

function toCardData(row: CandidateRow): ComicCardData {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    coverImage: row.coverImage,
    dominantColor: row.dominantColor,
    status: row.status,
    ratingCount: row.ratingCount,
    ratingTotal: row.ratingTotal,
    latestChapter: row.chapters[0]?.chapterNumber ?? null,
  };
}

function toRecommended(card: ComicCardData): RecommendedComic {
  return {
    id: card.id,
    title: card.title,
    slug: card.slug,
    coverImage: card.coverImage,
    latestChapter: card.latestChapter,
    latestChapterPublishedAt: null,
    completed: card.status === "COMPLETED",
  };
}

interface Scored {
  row: CandidateRow;
  score: number;
  genreIds: Set<string>;
}

function pickDiverse(scored: Scored[], limit: number): Scored[] {
  const positive = scored.filter((item) => item.score > 0);
  if (positive.length === 0) return [];

  const maxScore = Math.max(...positive.map((item) => item.score));
  const pool = positive.map((item) => ({ ...item, score: item.score / maxScore }));
  const picked: Scored[] = [];

  while (picked.length < limit && pool.length > 0) {
    let bestIndex = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      let penalty = 0;
      for (const chosen of picked) {
        if (chosen.row.categoryId === pool[i].row.categoryId) penalty += 0.06;
        for (const genreId of pool[i].genreIds) {
          if (chosen.genreIds.has(genreId)) penalty += 0.03;
        }
      }
      const value = pool[i].score - penalty;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    picked.push(pool.splice(bestIndex, 1)[0]);
  }

  return picked;
}

function qualityOf(row: CandidateRow): number {
  return adjustedScore(row.ratingTotal, row.ratingCount) / 5;
}

function popularityOf(row: CandidateRow, maxViews: number): number {
  return maxViews > 0 ? Math.log10(1 + row.viewCount) / Math.log10(1 + maxViews) : 0;
}

function freshnessOf(row: CandidateRow, now: number): number {
  return Math.exp(-((now - row.createdAt.getTime()) / DAY_MS) / 120);
}

interface Affinity {
  genres: Map<string, number>;
  categories: Map<string, number>;
  exclude: Set<string>;
}

interface SignalComic {
  id: string;
  categoryId: string;
  genres: { genreId: string }[];
}

const SIGNAL_SELECT = { id: true, categoryId: true, genres: { select: { genreId: true } } } as const;

function addSignal(affinity: Affinity, comic: SignalComic, weight: number): void {
  affinity.categories.set(comic.categoryId, (affinity.categories.get(comic.categoryId) ?? 0) + weight);
  for (const genre of comic.genres) {
    affinity.genres.set(genre.genreId, (affinity.genres.get(genre.genreId) ?? 0) + weight);
  }
}

function topKeys(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

async function buildAffinity(userId: string): Promise<Affinity> {
  const viewedIds = await getRecentViewedIds(userId);

  const [history, bookmarks, ratings, viewed] = await Promise.all([
    prisma.readHistory.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: { comic: { select: SIGNAL_SELECT } },
    }),
    prisma.bookmark.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { comic: { select: SIGNAL_SELECT } },
    }),
    prisma.workRating.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 60,
      select: { score: true, work: { select: SIGNAL_SELECT } },
    }),
    viewedIds.length > 0
      ? prisma.comic.findMany({ where: { id: { in: viewedIds } }, select: SIGNAL_SELECT })
      : Promise.resolve([]),
  ]);

  const affinity: Affinity = { genres: new Map(), categories: new Map(), exclude: new Set() };

  history.forEach((entry, index) => {
    addSignal(affinity, entry.comic, Math.pow(0.93, index));
    affinity.exclude.add(entry.comic.id);
  });

  bookmarks.forEach((entry, index) => {
    addSignal(affinity, entry.comic, 1.2 * Math.pow(0.97, index));
    affinity.exclude.add(entry.comic.id);
  });

  for (const rating of ratings) {
    const weight = rating.score >= 4 ? 0.9 * (rating.score - 3) : rating.score <= 2 ? -0.6 * (3 - rating.score) : 0;
    if (weight !== 0) addSignal(affinity, rating.work, weight);
    affinity.exclude.add(rating.work.id);
  }

  const viewedById = new Map(viewed.map((comic) => [comic.id, comic]));
  viewedIds.forEach((id, index) => {
    const comic = viewedById.get(id);
    if (!comic) return;
    addSignal(affinity, comic, 0.6 * Math.pow(0.9, index));
    affinity.exclude.add(comic.id);
  });

  return affinity;
}

export const getPersonalizedRecommendations = unstable_cache(
  async (userId: string, allowedRatings: AgeRating[], limit: number): Promise<RecommendedComic[]> => {
    const affinity = await buildAffinity(userId);
    const genreIds = topKeys(affinity.genres, 8);
    const categoryIds = topKeys(affinity.categories, 3);
    if (genreIds.length === 0 && categoryIds.length === 0) return [];

    const clauses: Prisma.ComicWhereInput[] = [];
    if (genreIds.length > 0) clauses.push({ genres: { some: { genreId: { in: genreIds } } } });
    if (categoryIds.length > 0) clauses.push({ categoryId: { in: categoryIds } });

    const rows = await prisma.comic.findMany({
      where: {
        id: { notIn: [...affinity.exclude] },
        approvalStatus: "APPROVED",
        ageRating: { in: allowedRatings },
        chapters: { some: { publishedAt: { not: null } } },
        OR: clauses,
      },
      orderBy: { viewCount: "desc" },
      take: CANDIDATE_LIMIT,
      select: COMIC_CARD_SELECT,
    });

    const maxViews = rows.reduce((max, row) => Math.max(max, row.viewCount), 0);
    const now = Date.now();

    const scored: Scored[] = rows.map((row) => {
      const ids = row.genres.map((genre) => genre.genreId);
      const genreScore =
        ids.reduce((sum, id) => sum + (affinity.genres.get(id) ?? 0), 0) / Math.sqrt(Math.max(1, ids.length));
      const categoryScore = (affinity.categories.get(row.categoryId) ?? 0) * 0.8;
      const affinityScore = genreScore + categoryScore;
      const score =
        affinityScore * (0.65 + 0.35 * qualityOf(row)) + 0.5 * popularityOf(row, maxViews) + 0.35 * freshnessOf(row, now);
      return { row, score, genreIds: new Set(ids) };
    });

    return pickDiverse(scored, limit).map((item) => toRecommended(toCardData(item.row)));
  },
  ["recs:personal:v2"],
  { revalidate: 300, tags: [RECOMMENDATIONS_TAG] }
);

export interface SimilarInput {
  comicId: string;
  categoryId: string;
  genreIds: string[];
  allowedRatings: AgeRating[];
  limit: number;
  excludeIds?: string[];
}

async function rankSimilar(input: SimilarInput): Promise<ComicCardData[]> {
  const clauses: Prisma.ComicWhereInput[] = [{ categoryId: input.categoryId }];
  if (input.genreIds.length > 0) clauses.push({ genres: { some: { genreId: { in: input.genreIds } } } });

  const rows = await prisma.comic.findMany({
    where: {
      id: { notIn: [input.comicId, ...(input.excludeIds ?? [])] },
      approvalStatus: "APPROVED",
      ageRating: { in: input.allowedRatings },
      chapters: { some: { publishedAt: { not: null } } },
      OR: clauses,
    },
    orderBy: { viewCount: "desc" },
    take: SIMILAR_CANDIDATE_LIMIT,
    select: COMIC_CARD_SELECT,
  });

  const base = new Set(input.genreIds);
  const maxViews = rows.reduce((max, row) => Math.max(max, row.viewCount), 0);
  const now = Date.now();

  const scored: Scored[] = rows.map((row) => {
    const ids = row.genres.map((genre) => genre.genreId);
    const shared = ids.filter((id) => base.has(id)).length;
    const union = base.size + ids.length - shared;
    const jaccard = union > 0 ? shared / union : 0;
    const sameCategory = row.categoryId === input.categoryId ? 0.6 : 0;
    const score =
      jaccard * 2 + sameCategory + 0.4 * qualityOf(row) + 0.3 * popularityOf(row, maxViews) + 0.15 * freshnessOf(row, now);
    return { row, score, genreIds: new Set(ids) };
  });

  return pickDiverse(scored, input.limit).map((item) => toCardData(item.row));
}

export const getSimilarComics = unstable_cache(
  async (input: SimilarInput): Promise<ComicCardData[]> => rankSimilar(input),
  ["recs:similar:v1"],
  { revalidate: 600, tags: [RECOMMENDATIONS_TAG] }
);

export interface BecauseYouRead {
  sourceTitle: string;
  sourceSlug: string;
  comics: RecommendedComic[];
}

export const getBecauseYouRead = unstable_cache(
  async (userId: string, allowedRatings: AgeRating[]): Promise<BecauseYouRead | null> => {
    const last = await prisma.readHistory.findFirst({
      where: { userId, comic: { approvalStatus: "APPROVED", ageRating: { in: allowedRatings } } },
      orderBy: { updatedAt: "desc" },
      select: {
        comic: {
          select: { id: true, title: true, slug: true, categoryId: true, genres: { select: { genreId: true } } },
        },
      },
    });
    if (!last) return null;

    const [history, bookmarks] = await Promise.all([
      prisma.readHistory.findMany({ where: { userId }, select: { comicId: true }, take: 200 }),
      prisma.bookmark.findMany({ where: { userId }, select: { comicId: true }, take: 200 }),
    ]);
    const excludeIds = [...new Set([...history.map((entry) => entry.comicId), ...bookmarks.map((entry) => entry.comicId)])];

    const cards = await rankSimilar({
      comicId: last.comic.id,
      categoryId: last.comic.categoryId,
      genreIds: last.comic.genres.map((genre) => genre.genreId),
      allowedRatings,
      limit: 10,
      excludeIds,
    });
    if (cards.length < 3) return null;

    return { sourceTitle: last.comic.title, sourceSlug: last.comic.slug, comics: cards.map(toRecommended) };
  },
  ["recs:because:v1"],
  { revalidate: 300, tags: [RECOMMENDATIONS_TAG] }
);