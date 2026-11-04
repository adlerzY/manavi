"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireChapterAccess, getUploaderVerification } from "@/lib/auth";
import { assertEditionLicenseActive, LicenseInactiveError } from "@/lib/license";
import { executeScheduledPublish } from "@/lib/scheduled-publish";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { getSignedImageUrls } from "@/lib/s3";
import { checkOperation } from "@/lib/operation-guard";
import { trashChapter } from "@/lib/trash";
import { logAuditEvent } from "@/lib/audit-log";
import { safeError, type ActionResult } from "@/lib/errors";

export async function scheduleChapter(chapterId: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime()) || date <= new Date()) {
      return { success: false, error: "زمان زمان‌بندی باید در آینده باشد" };
    }

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        comicId: true,
        editionId: true,
        publishedAt: true,
        status: true,
        deletedAt: true,
        edition: { select: { publisherId: true } },
      },
    });
    if (!chapter || chapter.deletedAt) return { success: false, error: "چپتر یافت نشد" };
    if (chapter.publishedAt) return { success: false, error: "چپتر قبلاً منتشر شده است" };
    if (chapter.status !== "DRAFT") return { success: false, error: "فقط چپتر پیش‌نویس قابل زمان‌بندی است" };

    const user = await requireChapterAccess(chapterId, "publish");
    await assertEditionLicenseActive(chapter.editionId);

    const verified = await getUploaderVerification(user.id, chapter.comicId, chapter.edition.publisherId);
    if (!verified) {
      return { success: false, error: "زمان‌بندی فقط برای حساب‌های دارای تیک آبی ممکن است — چپتر را برای تایید ادمین ارسال کنید" };
    }

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, status: "DRAFT", publishedAt: null, deletedAt: null },
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
    await requireChapterAccess(chapterId, "publish");

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, status: "SCHEDULED", publishedAt: null, deletedAt: null },
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
      select: { pages: true, deletedAt: true },
    });
    if (!chapter || chapter.deletedAt) return { success: false, error: "چپتر یافت نشد" };

    await requireChapterAccess(chapterId, "view");

    const previewUrls = await getSignedImageUrls(chapter.pages, undefined, { width: 320, quality: 70 });
    return { success: true, data: { pageKeys: chapter.pages, previewUrls } };
  } catch (err) {
    return safeError(err);
  }
}

export async function reorderChapterPages(chapterId: string, orderedPages: string[]): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { comicId: true, pages: true, deletedAt: true },
    });
    if (!chapter || chapter.deletedAt) return { success: false, error: "چپتر یافت نشد" };

    await requireChapterAccess(chapterId, "edit");

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
        comicId: true,
        chapterNumber: true,
        deletedAt: true,
        edition: { select: { publisherId: true } },
        comic: { select: { slug: true } },
      },
    });
    if (!chapter || chapter.deletedAt) return { success: false, error: "چپتر یافت نشد" };

    const user = await requireChapterAccess(chapterId, "delete");

    const gate = await checkOperation({
      actor: user,
      operation: "chapter.delete",
      targetType: "Chapter",
      targetId: chapterId,
      summary: `حذف چپتر ${chapter.chapterNumber}`,
      publisherId: chapter.edition.publisherId,
      comicId: chapter.comicId,
    });
    if (!gate.ok) return { success: false, error: gate.message };

    await trashChapter(chapterId, user.id);

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "trash.delete",
        targetType: "Chapter",
        targetId: chapterId,
        metadata: { chapterNumber: chapter.chapterNumber, comicId: chapter.comicId },
      })
    );

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