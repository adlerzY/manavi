"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isValidReactionEmoji } from "@/lib/gamification";
import { checkRateLimit } from "@/lib/moderation";

interface ReactionSummary {
  emoji: string;
  count: number;
}

interface ToggleReactionResult {
  success: boolean;
  error?: string;
  summary?: ReactionSummary[];
  userReaction?: string | null;
}

export async function toggleChapterReaction(chapterId: string, emoji: string): Promise<ToggleReactionResult> {
  const user = await getSessionUser();
  if (!user) return { success: false, error: "برای ثبت واکنش باید وارد شوید" };
  if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
  if (!isValidReactionEmoji(emoji)) return { success: false, error: "واکنش نامعتبر است" };

  const allowed = await checkRateLimit(`reaction:${user.id}`, 30);
  if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است" };

  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { publishedAt: true, isLocked: true },
    });
    if (!chapter || !chapter.publishedAt || chapter.isLocked) return { success: false, error: "چپتر یافت نشد" };

    const removed = await prisma.chapterReaction.deleteMany({ where: { chapterId, userId: user.id, emoji } });
    let userReaction: string | null = null;
    if (removed.count === 0) {
      await prisma.chapterReaction.upsert({
        where: { chapterId_userId: { chapterId, userId: user.id } },
        update: { emoji },
        create: { chapterId, userId: user.id, emoji },
      });
      userReaction = emoji;
    }

    const grouped = await prisma.chapterReaction.groupBy({ by: ["emoji"], where: { chapterId }, _count: { _all: true } });
    return { success: true, summary: grouped.map((g) => ({ emoji: g.emoji, count: g._count._all })), userReaction };
  } catch {
    return { success: false, error: "ثبت واکنش ناموفق بود" };
  }
}
export async function getChapterReactionSummary(chapterId: string, userId: string | null): Promise<{ summary: ReactionSummary[]; userReaction: string | null }> {
  const [grouped, mine] = await Promise.all([
    prisma.chapterReaction.groupBy({ by: ["emoji"], where: { chapterId }, _count: { _all: true } }),
    userId ? prisma.chapterReaction.findUnique({ where: { chapterId_userId: { chapterId, userId } } }) : Promise.resolve(null),
  ]);

  return { summary: grouped.map((g) => ({ emoji: g.emoji, count: g._count._all })), userReaction: mine?.emoji ?? null };
}