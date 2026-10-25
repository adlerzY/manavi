"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { invalidateChapterUnlockCache } from "@/lib/chapters";
import { checkRateLimit } from "@/lib/moderation";
import { purchaseChapters, type PurchaseResult } from "@/lib/sales";
import { ChapterAccessType } from "@prisma/client";

interface UnlockResult {
  success: boolean;
  error?: string;
}

function scopedKey(userId: string, key?: string): string {
  return `${userId}:${(key && key.trim() ? key.trim() : randomUUID()).slice(0, 80)}`;
}

async function finalizePurchase(userId: string, result: PurchaseResult): Promise<void> {
  const chapterIds = [...result.purchasedChapterIds, ...result.crossUnlockedChapterIds];
  await Promise.all([
    invalidateSessionUserCache(userId),
    ...chapterIds.map((chapterId) => invalidateChapterUnlockCache(userId, chapterId)),
  ]);
  if (result.comicSlug) revalidatePath(`/app/comic/${result.comicSlug}`);
  chapterIds.forEach((chapterId) => revalidatePath(`/app/read/${chapterId}`));
}

export async function unlockChapterWithCoins(chapterId: string, idempotencyKey?: string): Promise<UnlockResult> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

  const allowed = await checkRateLimit(`unlock-chapter:${user.id}`, 30);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, editionId: true, accessType: true, isLocked: true },
  });
  if (!chapter) return { success: false, error: "Chapter not found" };
  if (chapter.isLocked) return { success: false, error: "این چپتر موقتاً در دسترس نیست" };
  if (chapter.accessType !== ChapterAccessType.COIN) {
    return { success: false, error: "این چپتر با سکه قابل باز شدن نیست" };
  }

  const owned = await prisma.entitlement.findUnique({
    where: { userId_chapterId: { userId: user.id, chapterId } },
    select: { id: true },
  });
  if (owned) return { success: true };

  const result = await purchaseChapters({
    buyerId: user.id,
    editionId: chapter.editionId,
    chapterIds: [chapterId],
    kind: "SINGLE",
    idempotencyKey: scopedKey(user.id, idempotencyKey),
  });
  if (!result.success) return { success: false, error: result.error };

  await finalizePurchase(user.id, result);
  return { success: true };
}

export async function unlockComicWithCoins(editionId: string, idempotencyKey?: string): Promise<UnlockResult> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "Not authenticated" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

  const allowed = await checkRateLimit(`unlock-comic:${user.id}`, 5);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

  const result = await purchaseChapters({
    buyerId: user.id,
    editionId,
    kind: "BULK",
    idempotencyKey: scopedKey(user.id, idempotencyKey),
  });
  if (!result.success) return { success: false, error: result.error };

  await finalizePurchase(user.id, result);
  return { success: true };
}