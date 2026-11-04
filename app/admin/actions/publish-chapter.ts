"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUploaderVerification, requireChapterAccess } from "@/lib/auth";
import { assertEditionLicenseActive, LicenseInactiveError } from "@/lib/license";
import { notifyNewChapter } from "@/lib/telegram-bot";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { notifyChapterPublishedInApp } from "@/lib/notifications";
import { grantAutomaticAccessForChapters } from "@/lib/bonus";
import { safeError } from "@/lib/errors";

interface PublishChapterResult {
  success: boolean;
  error?: string;
  data?: { status: "PUBLISHED" | "PENDING_APPROVAL" };
}

export async function publishChapter(chapterId: string): Promise<PublishChapterResult> {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        chapterNumber: true,
        publishedAt: true,
        status: true,
        editionId: true,
        deletedAt: true,
        edition: { select: { publisherId: true } },
        comic: { select: { id: true, slug: true, title: true } },
      },
    });

    if (!chapter || chapter.deletedAt) {
      return { success: false, error: "چپتر یافت نشد" };
    }

    const user = await requireChapterAccess(chapterId, "publish");
    await assertEditionLicenseActive(chapter.editionId);

    if (chapter.status === "PENDING_APPROVAL") {
      return { success: false, error: "این چپتر در انتظار تایید ادمین است" };
    }
    if (chapter.publishedAt) {
      return { success: false, error: "این چپتر قبلاً منتشر شده است" };
    }

    const isVerified = await getUploaderVerification(user.id, chapter.comic.id, chapter.edition.publisherId);

    if (!isVerified) {
      const updated = await prisma.chapter.updateMany({
        where: { id: chapterId, publishedAt: null },
        data: { status: "PENDING_APPROVAL", scheduledAt: null },
      });
      if (updated.count === 0) {
        return { success: false, error: "این چپتر قبلاً منتشر شده است" };
      }
      revalidatePath("/admin/comics");
      revalidatePath("/publisher/comics");
      revalidatePath("/admin/chapter-approvals");
      revalidateTag("home-feed", "default");
      return { success: true, data: { status: "PENDING_APPROVAL" } };
    }

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, publishedAt: null },
      data: { publishedAt: new Date(), status: "PUBLISHED", scheduledAt: null },
    });

    if (updated.count === 0) {
      return { success: false, error: "این چپتر قبلاً منتشر شده است" };
    }

    revalidateTag("home-feed", "default");
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    invalidateChapterAccessList(chapter.comic.id);

    const comicInfo = chapter.comic;
    after(async () => {
      await grantAutomaticAccessForChapters([chapterId]).catch(() => {});

      await notifyChapterPublishedInApp({
        chapterId,
        comicId: comicInfo.id,
        comicTitle: comicInfo.title,
        comicSlug: comicInfo.slug,
        chapterNumber: chapter.chapterNumber,
      }).catch(() => {});

      const bookmarks = await prisma.bookmark.findMany({
        where: { comicId: comicInfo.id, notifyOnNewChapter: true, user: { isBanned: false, deletedAt: null } },
        select: { user: { select: { telegramId: true } } },
      });
      if (bookmarks.length === 0) return;

      await notifyNewChapter({
        telegramIds: bookmarks.map((b) => b.user.telegramId),
        comicTitle: comicInfo.title,
        comicSlug: comicInfo.slug,
        chapterNumber: chapter.chapterNumber,
        chapterId,
      }).catch(() => {});
    });

    return { success: true, data: { status: "PUBLISHED" } };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `انتشار ممکن نیست: ${err.reasonFa}` };
    }
    return safeError(err);
  }
}
