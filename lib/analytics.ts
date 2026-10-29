import "server-only";
import { prisma } from "./prisma";
import { bumpViewCounts } from "./view-counter";
import { maybeEvaluateAchievements } from "./achievement-engine";

export async function recordChapterView(chapterId: string, comicId: string): Promise<void> {
  await bumpViewCounts(chapterId, comicId);
}

export async function recordChapterVisit(chapterId: string, comicId: string, userId: string | null): Promise<void> {
  await Promise.all([
    bumpViewCounts(chapterId, comicId),
    userId
      ? prisma.chapterReadMark.upsert({
          where: { userId_chapterId: { userId, chapterId } },
          update: { readAt: new Date() },
          create: { userId, chapterId, comicId },
        })
      : Promise.resolve(),
  ]);
  if (userId) await maybeEvaluateAchievements(userId);
}