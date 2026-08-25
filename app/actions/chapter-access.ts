"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { invalidateChapterUnlockCache } from "@/lib/chapters";
import { getChapterUnlockCoinCost } from "@/lib/platform-settings";
import { ChapterAccessType } from "@prisma/client";

interface UnlockResult {
  success: boolean;
  error?: string;
}

class InsufficientCoinsError extends Error {}

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

export async function unlockChapterWithCoins(chapterId: string): Promise<UnlockResult> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, comicId: true, accessType: true, isLocked: true },
  });
  if (!chapter) return { success: false, error: "Chapter not found" };
  if (chapter.isLocked) {
    return { success: false, error: "این چپتر موقتاً در دسترس نیست" };
  }
  if (chapter.accessType !== ChapterAccessType.COIN) {
    return { success: false, error: "این چپتر با سکه قابل باز شدن نیست" };
  }

  const cost = await getChapterUnlockCoinCost();

  try {
    await prisma.$transaction(async (tx) => {
      try {
        await tx.chapterUnlock.create({ data: { userId: user.id, chapterId, expiresAt: null } });
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return;
        }
        throw err;
      }

      const debited = await tx.user.updateMany({
        where: { id: user.id, coinsBalance: { gte: cost } },
        data: { coinsBalance: { decrement: cost } },
      });
      if (debited.count === 0) throw new InsufficientCoinsError();

      await tx.transaction.create({
        data: { type: "CHAPTER_UNLOCK", status: "PAID", amount: cost, currency: "COIN", payerId: user.id, comicId: chapter.comicId },
      });
    });
  } catch (err) {
    if (err instanceof InsufficientCoinsError) {
      return { success: false, error: "سکه کافی نیست" };
    }
    throw err;
  }

  await Promise.all([
    invalidateSessionUserCache(user.id),
    invalidateChapterUnlockCache(user.id, chapterId),
  ]);

  revalidatePath(`/app/read/${chapterId}`);
  return { success: true };
}

export async function unlockComicWithCoins(comicId: string): Promise<UnlockResult> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

  const comic = await prisma.comic.findUnique({ where: { id: comicId }, select: { slug: true } });
  if (!comic) return { success: false, error: "عنوان یافت نشد" };

  const cost = await getChapterUnlockCoinCost();

  const chapters = await prisma.chapter.findMany({
    where: { comicId, status: "PUBLISHED", accessType: ChapterAccessType.COIN, isLocked: false },
    select: { id: true },
  });
  if (chapters.length === 0) {
    return { success: false, error: "چپتر سکه‌ای برای این عنوان وجود ندارد" };
  }

  const existingUnlocks = await prisma.chapterUnlock.findMany({
    where: { userId: user.id, chapterId: { in: chapters.map((c) => c.id) }, expiresAt: null },
    select: { chapterId: true },
  });
  const alreadyUnlockedIds = new Set(existingUnlocks.map((u) => u.chapterId));
  const candidateChapterIds = chapters.map((c) => c.id).filter((id) => !alreadyUnlockedIds.has(id));

  if (candidateChapterIds.length === 0) {
    return { success: false, error: "همه چپترهای این عنوان قبلاً باز شده‌اند" };
  }

  let unlockedChapterIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.chapterUnlock.createManyAndReturn({
        data: candidateChapterIds.map((chapterId) => ({ userId: user.id, chapterId, expiresAt: null })),
        skipDuplicates: true,
        select: { chapterId: true },
      });

      if (created.length === 0) {
        return;
      }

      unlockedChapterIds = created.map((u) => u.chapterId);

      const totalCost = unlockedChapterIds.length * cost;

      const debited = await tx.user.updateMany({
        where: { id: user.id, coinsBalance: { gte: totalCost } },
        data: { coinsBalance: { decrement: totalCost } },
      });
      if (debited.count === 0) throw new InsufficientCoinsError();

      await tx.transaction.create({
        data: {
          type: "CHAPTER_UNLOCK",
          status: "PAID",
          amount: totalCost,
          currency: "COIN",
          payerId: user.id,
          comicId,
          message: `باز کردن کل عنوان یکجا — ${unlockedChapterIds.length} چپتر`,
        },
      });
    });
  } catch (err) {
    if (err instanceof InsufficientCoinsError) {
      const totalCost = unlockedChapterIds.length * cost;
      return { success: false, error: `سکه کافی نیست — ${totalCost.toLocaleString("fa-IR")} سکه لازم است` };
    }
    throw err;
  }

  if (unlockedChapterIds.length === 0) {
    return { success: false, error: "همه چپترهای این عنوان قبلاً باز شده‌اند" };
  }

  await Promise.all([
    invalidateSessionUserCache(user.id),
    ...unlockedChapterIds.map((chapterId) => invalidateChapterUnlockCache(user.id, chapterId)),
  ]);

  revalidatePath(`/app/comic/${comic.slug}`);
  unlockedChapterIds.forEach((chapterId) => revalidatePath(`/app/read/${chapterId}`));

  return { success: true };
}