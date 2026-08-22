"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUploadAccess } from "@/lib/auth";
import { assertLicenseActive, LicenseInactiveError } from "@/lib/license";
import { executeScheduledPublish } from "@/lib/scheduled-publish";
import { deleteObject, deleteObjects, getSignedImageUrls } from "@/lib/s3";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function scheduleChapter(chapterId: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const date = new Date(scheduledAt);
    if (date <= new Date()) {
      return { success: false, error: "زمان زمان‌بندی باید در آینده باشد" };
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, publishedAt: true, comic: { select: { id: true } } },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };
    if (chapter.publishedAt) return { success: false, error: "چپتر قبلاً منتشر شده است" };

    await requireUploadAccess(chapter.comic.id);
    await assertLicenseActive(chapter.comic.id);

    await prisma.chapter.update({
      where: { id: chapterId },
      data: { status: "SCHEDULED", scheduledAt: date },
    });

    revalidatePath("/admin/comics");
    revalidatePath("/publisher/comics");
    return { success: true };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `Cannot schedule: ${err.reason}` };
    }
    return safeError(err);
  }
}

export async function cancelSchedule(chapterId: string): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    await prisma.chapter.update({
      where: { id: chapterId },
      data: { status: "DRAFT", scheduledAt: null },
    });
    revalidatePath("/admin/comics");
    revalidatePath("/publisher/comics");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function runScheduledPublish(): Promise<ActionResult<{ published: number }>> {
  try {
    await requireAdmin();
    const result = await executeScheduledPublish();
    return { success: true, data: result };
  } catch (err) {
    return safeError(err);
  }
}

export async function reorderChapterPages(chapterId: string, orderedPages: string[]): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    await prisma.chapter.update({ where: { id: chapterId }, data: { pages: orderedPages } });
    revalidatePath("/admin/comics");
    revalidatePath("/publisher/comics");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteChapter(chapterId: string): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { pages: true, comicId: true, comic: { select: { slug: true } } },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    await prisma.$transaction([
      prisma.chapterReadMark.deleteMany({ where: { chapterId } }),
      prisma.chapterReaction.deleteMany({ where: { chapterId } }),
      prisma.chapterUnlock.deleteMany({ where: { chapterId } }),
      prisma.chapterStaff.deleteMany({ where: { chapterId } }),
      prisma.comment.deleteMany({ where: { chapterId } }),
      prisma.chapter.delete({ where: { id: chapterId } }),
    ]);

    const keysToDelete = chapter.pages.filter(
      (key): key is string => Boolean(key) && !key.startsWith("http://") && !key.startsWith("https://")
    );
    await deleteObjects(keysToDelete).catch(() => {});

    revalidatePath("/admin/comics");
    revalidatePath(`/admin/comics/${chapter.comicId}`);
    revalidatePath("/publisher/comics");
    revalidatePath(`/publisher/comics/${chapter.comicId}`);
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}
export async function getChapterPagePreviews(chapterId: string): Promise<ActionResult<{ previewUrls: string[] }>> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { pages: true, comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    const previewUrls = chapter.pages.length ? await getSignedImageUrls(chapter.pages, 900, { width: 300 }) : [];    return { success: true, data: { previewUrls } };
  } catch (err) {
    return safeError(err);
  }
}