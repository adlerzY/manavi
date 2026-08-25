"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { notifyNewChapter } from "@/lib/telegram-bot";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface PendingChapterRow {
  id: string;
  chapterNumber: number;
  title: string | null;
  createdAt: string;
  comic: { id: string; title: string; slug: string };
  uploaderName: string | null;
}

export async function listPendingChapters(): Promise<PendingChapterRow[]> {
  await requireAdmin();

  const chapters = await prisma.chapter.findMany({
    where: { status: "PENDING_APPROVAL" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      chapterNumber: true,
      title: true,
      createdAt: true,
      comic: { select: { id: true, title: true, slug: true } },
      uploadedBy: { select: { firstName: true, username: true } },
    },
  });

  return chapters.map((c) => ({
    id: c.id,
    chapterNumber: c.chapterNumber,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    comic: c.comic,
    uploaderName: c.uploadedBy ? (c.uploadedBy.username ? `@${c.uploadedBy.username}` : c.uploadedBy.firstName) : null,
  }));
}

export async function approveChapter(chapterId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        chapterNumber: true,
        status: true,
        comic: { select: { id: true, slug: true, title: true } },
      },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };
    if (chapter.status !== "PENDING_APPROVAL") {
      return { success: false, error: "این چپتر در انتظار تایید نیست" };
    }

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, status: "PENDING_APPROVAL" },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    if (updated.count === 0) {
      return { success: false, error: "این چپتر در انتظار تایید نیست" };
    }

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "chapter.approve",
        targetType: "Chapter",
        targetId: chapterId,
      })
    );

    revalidateTag("home-feed", "max");
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    revalidatePath("/admin/comics");
    revalidatePath("/admin/chapter-approvals");
    invalidateChapterAccessList(chapter.comic.id);

    const bookmarks = await prisma.bookmark.findMany({
      where: { comicId: chapter.comic.id, notifyOnNewChapter: true },
      select: { user: { select: { telegramId: true } } },
    });

    if (bookmarks.length > 0) {
      const telegramIds = bookmarks.map((b) => b.user.telegramId);
      after(() =>
        notifyNewChapter({
          telegramIds,
          comicTitle: chapter.comic.title,
          comicSlug: chapter.comic.slug,
          chapterNumber: chapter.chapterNumber,
          chapterId,
        }).catch(() => {})
      );
    }

    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function rejectChapter(chapterId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, status: true, comicId: true },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };
    if (chapter.status !== "PENDING_APPROVAL") {
      return { success: false, error: "این چپتر در انتظار تایید نیست" };
    }

    await prisma.chapter.updateMany({
      where: { id: chapterId, status: "PENDING_APPROVAL" },
      data: { status: "DRAFT" },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "chapter.reject",
        targetType: "Chapter",
        targetId: chapterId,
      })
    );

    revalidatePath(`/admin/comics/${chapter.comicId}`);
    revalidatePath("/admin/chapter-approvals");
    revalidatePath("/publisher/comics");

    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}