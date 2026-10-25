"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUploadAccess, getUploaderVerification } from "@/lib/auth";
import { assertLicenseActive, LicenseInactiveError } from "@/lib/license";
import { executeScheduledPublish } from "@/lib/scheduled-publish";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { deleteObjects, getSignedImageUrls } from "@/lib/s3";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function scheduleChapter(chapterId: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      return { success: false, error: "زمان زمان‌بندی باید در آینده باشد" };
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, publishedAt: true, status: true, comic: { select: { id: true } } },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };
    if (chapter.publishedAt) return { success: false, error: "چپتر قبلاً منتشر شده است" };
    if (chapter.status !== "DRAFT") return { success: false, error: "فقط چپتر پیش‌نویس قابل زمان‌بندی است" };

    const user = await requireUploadAccess(chapter.comic.id);
    await assertLicenseActive(chapter.comic.id);

    const verified = await getUploaderVerification(user.id, chapter.comic.id);
    if (!verified) {
      return { success: false, error: "زمان‌بندی فقط برای حساب‌های دارای تیک آبی ممکن است — چپتر را برای تایید ادمین ارسال کنید" };
    }

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, status: "DRAFT", publishedAt: null },
      data: { status: "SCHEDULED", scheduledAt: date },
    });
    if (updated.count === 0) return { success: false, error: "وضعیت چپتر تغییر کرده است — دوباره تلاش کنید" };

    revalidatePath("/admin/comics");
    revalidatePath("/publisher/comics");
    return { success: true };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `زمان‌بندی ممکن نیست: ${err.reasonFa}` };
    }
    return safeError(err);
  }
}

export async function cancelSchedule(chapterId: string): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, status: "SCHEDULED", publishedAt: null },
      data: { status: "DRAFT", scheduledAt: null },
    });
    if (updated.count === 0) return { success: false, error: "این چپتر در وضعیت زمان‌بندی‌شده نیست" };

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

export async function getChapterPagePreviews(
  chapterId: string
): Promise<ActionResult<{ pageKeys: string[]; previewUrls: string[] }>> {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { pages: true, comicId: true },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    const previewUrls = await getSignedImageUrls(chapter.pages, undefined, { width: 320, quality: 70 });
    return { success: true, data: { pageKeys: chapter.pages, previewUrls } };
  } catch (err) {
    return safeError(err);
  }
}

export async function reorderChapterPages(chapterId: string, orderedPages: string[]): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { comicId: true, pages: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    if (!Array.isArray(orderedPages) || orderedPages.length !== chapter.pages.length) {
      return { success: false, error: "لیست صفحات نامعتبر است" };
    }
    const expected = [...chapter.pages].sort();
    const received = [...orderedPages].sort();
    if (!expected.every((key, index) => key === received[index])) {
      return { success: false, error: "لیست صفحات نامعتبر است" };
    }

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
      select: {
        pages: true,
        comicId: true,
        comic: { select: { slug: true } },
        _count: { select: { saleLines: true } },
      },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    if (chapter._count.saleLines > 0) {
      return {
        success: false,
        error: "این چپتر سابقه‌ی فروش دارد و حذف نمی‌شود — برای مخفی‌کردن آن از «قفل دستی» استفاده کنید",
      };
    }

    await prisma.$transaction([
      prisma.chapterReadMark.deleteMany({ where: { chapterId } }),
      prisma.chapterReaction.deleteMany({ where: { chapterId } }),
      prisma.chapterUnlock.deleteMany({ where: { chapterId } }),
      prisma.entitlement.deleteMany({ where: { chapterId } }),
      prisma.chapterStaff.deleteMany({ where: { chapterId } }),
      prisma.comment.deleteMany({ where: { chapterId } }),
      prisma.chapter.delete({ where: { id: chapterId } }),
    ]);

    const keysToDelete = chapter.pages.filter(
      (key): key is string => Boolean(key) && !key.startsWith("http://") && !key.startsWith("https://")
    );
    await deleteObjects(keysToDelete).catch(() => {});

    invalidateChapterAccessList(chapter.comicId);

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