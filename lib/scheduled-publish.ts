import "server-only";
import { after } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "./prisma";
import { notifyNewChapter } from "./telegram-bot";
import { redis, isRedisConfigured } from "./redis";

const THROTTLE_KEY = "scheduled-publish:lock";
const THROTTLE_SECONDS = 90;

export interface ScheduledPublishResult {
  published: number;
}

export async function executeScheduledPublish(): Promise<ScheduledPublishResult> {
  const due = await prisma.chapter.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: {
      id: true,
      chapterNumber: true,
      comic: { select: { id: true, slug: true, title: true, license: { select: { status: true } } } },
    },
  });

  const eligible = due.filter((chapter) => chapter.comic.license.status === "ACTIVE");
  if (eligible.length === 0) {
    return { published: 0 };
  }

  const publishTime = new Date();
  const eligibleIds = eligible.map((c) => c.id);

  await prisma.chapter.updateMany({
    where: { id: { in: eligibleIds }, publishedAt: null },
    data: { status: "PUBLISHED", publishedAt: publishTime, scheduledAt: null },
  });

  const justPublished = await prisma.chapter.findMany({
    where: { id: { in: eligibleIds }, publishedAt: publishTime },
    select: { id: true },
  });
  const justPublishedIds = new Set(justPublished.map((c) => c.id));

  const publishedChapters = eligible.filter((chapter) => justPublishedIds.has(chapter.id));

  if (publishedChapters.length > 0) {
    const comicIds = [...new Set(publishedChapters.map((c) => c.comic.id))];
    const bookmarks = await prisma.bookmark.findMany({
      where: { comicId: { in: comicIds }, notifyOnNewChapter: true },
      select: { comicId: true, user: { select: { telegramId: true } } },
    });

    const telegramIdsByComicId = new Map<string, bigint[]>();
    for (const b of bookmarks) {
      const list = telegramIdsByComicId.get(b.comicId) ?? [];
      list.push(b.user.telegramId);
      telegramIdsByComicId.set(b.comicId, list);
    }

    for (const chapter of publishedChapters) {
      const telegramIds = telegramIdsByComicId.get(chapter.comic.id);
      if (telegramIds?.length) {
        await notifyNewChapter({
          telegramIds,
          comicTitle: chapter.comic.title,
          comicSlug: chapter.comic.slug,
          chapterNumber: chapter.chapterNumber,
          chapterId: chapter.id,
        }).catch(() => {});
      }
      revalidatePath(`/app/comic/${chapter.comic.slug}`);
      revalidatePath(`/app/read/${chapter.id}`);
    }

    revalidateTag("home-feed", "max");
    revalidatePath("/app");
    revalidatePath("/app/explore");
  }

  return { published: publishedChapters.length };
}

export function maybeTriggerScheduledPublish(): void {
  if (!isRedisConfigured) return;

  after(async () => {
    try {
      const acquired = await redis.set(THROTTLE_KEY, "1", { nx: true, ex: THROTTLE_SECONDS });
      if (!acquired) return;
      await executeScheduledPublish();
    } catch (err) {
      console.error("[scheduled-publish] auto-trigger failed", err);
    }
  });
}