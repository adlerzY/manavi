import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { ChapterAccessType } from "@prisma/client";
import type { ChapterAccessInfo } from "./chapter-access";
import { redis } from "./redis";
import { getChapterUnlockCoinCost } from "./platform-settings";

export type { ChapterAccessInfo };

const COIN_UNLOCK_CACHE_TTL_SECONDS = 300;
const CHAPTER_ACCESS_LIST_REVALIDATE_SECONDS = 45;

const coinUnlockCacheKey = (userId: string, chapterId: string) => `chapter-unlock:${userId}:${chapterId}`;

async function hasCoinUnlockCached(userId: string, chapterId: string): Promise<boolean> {
  const key = coinUnlockCacheKey(userId, chapterId);
  try {
    const cached = await redis.get<boolean>(key);
    if (cached !== null) return cached;
  } catch {}

  const unlock = await prisma.chapterUnlock.findUnique({ where: { userId_chapterId: { userId, chapterId } } });
  const hasUnlock = Boolean(unlock && (!unlock.expiresAt || unlock.expiresAt > new Date()));
  redis.set(key, hasUnlock, { ex: COIN_UNLOCK_CACHE_TTL_SECONDS }).catch(() => {});
  return hasUnlock;
}

export async function invalidateChapterUnlockCache(userId: string, chapterId: string): Promise<void> {
  await redis.del(coinUnlockCacheKey(userId, chapterId)).catch(() => {});
}

async function fetchChapterAccessList(comicId: string): Promise<ChapterAccessInfo[]> {
  const chapters = await prisma.chapter.findMany({
    where: { comicId, publishedAt: { not: null } },
    orderBy: { chapterNumber: "desc" },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      publishedAt: true,
      isLocked: true,
      accessType: true,
    },
  });

  return chapters.map((chapter) => {
    const isFree = chapter.accessType === ChapterAccessType.FREE;
    return {
      id: chapter.id,
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      publishedAt: chapter.publishedAt,
      manuallyLocked: chapter.isLocked,
      locked: !isFree,
      accessType: chapter.accessType,
    };
  });
}

export const getChapterAccessList = (comicId: string) =>
  unstable_cache(
    () => fetchChapterAccessList(comicId),
    [`chapters-access-list:${comicId}`],
    { revalidate: CHAPTER_ACCESS_LIST_REVALIDATE_SECONDS }
  )();

export async function userHasChapterAccess(
  userId: string | null,
  chapterId: string,
  role?: string
): Promise<boolean> {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { accessType: true },
  });
  if (!chapter) return false;
  if (chapter.accessType === ChapterAccessType.FREE) return true;

  if (!userId) return false;
  if (role === "ADMIN") return true;

  return hasCoinUnlockCached(userId, chapterId);
}

export interface ComicUnlockPreview {
  lockedCount: number;
  totalCost: number;
  coinCost: number;
}

export async function getComicUnlockPreview(userId: string | null, comicId: string): Promise<ComicUnlockPreview> {
  const cost = await getChapterUnlockCoinCost();

  const chapters = await prisma.chapter.findMany({
    where: { comicId, status: "PUBLISHED", accessType: ChapterAccessType.COIN },
    select: { id: true },
  });

  if (chapters.length === 0) {
    return { lockedCount: 0, totalCost: 0, coinCost: cost };
  }

  const unlockedIds = userId
    ? new Set(
        (
          await prisma.chapterUnlock.findMany({
            where: { userId, chapterId: { in: chapters.map((c) => c.id) }, expiresAt: null },
            select: { chapterId: true },
          })
        ).map((u) => u.chapterId)
      )
    : new Set<string>();

  const lockedCount = chapters.filter((c) => !unlockedIds.has(c.id)).length;
  return { lockedCount, totalCost: lockedCount * cost, coinCost: cost };
}