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

  const existing = await prisma.chapterReaction.findUnique({ where: { chapterId_userId: { chapterId, userId: user.id } } });

  let userReaction: string | null;

  if (existing && existing.emoji === emoji) {
    await prisma.chapterReaction.delete({ where: { chapterId_userId: { chapterId, userId: user.id } } });
    userReaction = null;
  } else if (existing) {
    await prisma.chapterReaction.update({ where: { chapterId_userId: { chapterId, userId: user.id } }, data: { emoji } });
    userReaction = emoji;
  } else {
    await prisma.chapterReaction.create({ data: { chapterId, userId: user.id, emoji } });
    userReaction = emoji;
  }

  const grouped = await prisma.chapterReaction.groupBy({ by: ["emoji"], where: { chapterId }, _count: { _all: true } });

  return { success: true, summary: grouped.map((g) => ({ emoji: g.emoji, count: g._count._all })), userReaction };
}

export async function getChapterReactionSummary(chapterId: string, userId: string | null): Promise<{ summary: ReactionSummary[]; userReaction: string | null }> {
  const [grouped, mine] = await Promise.all([
    prisma.chapterReaction.groupBy({ by: ["emoji"], where: { chapterId }, _count: { _all: true } }),
    userId ? prisma.chapterReaction.findUnique({ where: { chapterId_userId: { chapterId, userId } } }) : Promise.resolve(null),
  ]);

  return { summary: grouped.map((g) => ({ emoji: g.emoji, count: g._count._all })), userReaction: mine?.emoji ?? null };
}