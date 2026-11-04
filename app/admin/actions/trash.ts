"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { checkOperation } from "@/lib/operation-guard";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { grantAutomaticAccessForChapters } from "@/lib/bonus";
import { deleteObjects } from "@/lib/s3";
import { trashComic as trashComicRow, restoreChapter, restoreComic, restoreEdition } from "@/lib/trash";
import { deleteComic } from "./catalog-actions";

export type TrashType = "COMIC" | "EDITION" | "CHAPTER";

export interface TrashItem {
  type: TrashType;
  id: string;
  title: string;
  subtitle: string | null;
  deletedAt: string;
  deletedByName: string | null;
  hasSales: boolean;
}

export async function listTrash(): Promise<TrashItem[]> {
  await requireAdmin();

  const [comics, editions, chapters] = await Promise.all([
    prisma.comic.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
      select: { id: true, title: true, slug: true, deletedAt: true, deletedById: true },
    }),
    prisma.edition.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 100,
      select: { id: true, language: true, deletedAt: true, deletedById: true, work: { select: { title: true } }, publisher: { select: { name: true } } },
    }),
    prisma.chapter.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      take: 200,
      select: { id: true, chapterNumber: true, deletedAt: true, deletedById: true, comic: { select: { title: true } }, _count: { select: { saleLines: true } } },
    }),
  ]);

  const comicIds = comics.map((comic) => comic.id);
  const [soldComics, actors] = await Promise.all([
    comicIds.length
      ? prisma.chapter.findMany({ where: { comicId: { in: comicIds }, saleLines: { some: {} } }, select: { comicId: true }, distinct: ["comicId"] })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: {
        id: {
          in: [...new Set([...comics, ...editions, ...chapters].map((item) => item.deletedById).filter((id): id is string => Boolean(id)))],
        },
      },
      select: { id: true, firstName: true, username: true },
    }),
  ]);

  const soldSet = new Set(soldComics.map((row) => row.comicId));
  const nameById = new Map(actors.map((user) => [user.id, user.username ? `@${user.username}` : user.firstName]));
  const actorName = (id: string | null) => (id ? nameById.get(id) ?? null : null);

  const items: TrashItem[] = [
    ...comics.map((comic) => ({
      type: "COMIC" as const,
      id: comic.id,
      title: comic.title,
      subtitle: comic.slug,
      deletedAt: comic.deletedAt!.toISOString(),
      deletedByName: actorName(comic.deletedById),
      hasSales: soldSet.has(comic.id),
    })),
    ...editions.map((edition) => ({
      type: "EDITION" as const,
      id: edition.id,
      title: `${edition.work.title} — ${edition.publisher.name}`,
      subtitle: edition.language,
      deletedAt: edition.deletedAt!.toISOString(),
      deletedByName: actorName(edition.deletedById),
      hasSales: false,
    })),
    ...chapters.map((chapter) => ({
      type: "CHAPTER" as const,
      id: chapter.id,
      title: `${chapter.comic.title} — چپتر ${chapter.chapterNumber}`,
      subtitle: null,
      deletedAt: chapter.deletedAt!.toISOString(),
      deletedByName: actorName(chapter.deletedById),
      hasSales: chapter._count.saleLines > 0,
    })),
  ];

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export async function trashComic(comicId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const gate = await checkOperation({
      actor: admin,
      operation: "comic.delete",
      targetType: "Comic",
      targetId: comicId,
      summary: "انتقال عنوان به سطل بازیافت",
      comicId,
    });
    if (!gate.ok) return { success: false, error: gate.message };

    const comic = await trashComicRow(comicId, admin.id);
    if (!comic) return { success: false, error: "عنوان یافت نشد" };

    after(() =>
      logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "trash.delete", targetType: "Comic", targetId: comicId })
    );

    revalidateTag("home-feed", "max");
    revalidatePath("/admin/comics");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    revalidatePath(`/app/comic/${comic.slug}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function restoreTrashItem(type: TrashType, id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (type === "CHAPTER") {
      const chapter = await restoreChapter(id);
      if (!chapter) return { success: false, error: "مورد یافت نشد" };
      invalidateChapterAccessList(chapter.comicId);
      after(() => grantAutomaticAccessForChapters([id]).catch(() => {}));
      revalidatePath(`/app/comic/${chapter.comic.slug}`);
      revalidatePath(`/admin/comics/${chapter.comicId}`);
    } else if (type === "COMIC") {
      const comic = await restoreComic(id);
      if (!comic) return { success: false, error: "مورد یافت نشد" };
      revalidateTag("home-feed", "max");
      revalidatePath(`/app/comic/${comic.slug}`);
      revalidatePath("/admin/comics");
    } else {
      const edition = await restoreEdition(id);
      if (!edition) return { success: false, error: "مورد یافت نشد" };
      invalidateChapterAccessList(edition.workId);
      revalidatePath(`/app/comic/${edition.work.slug}`);
    }

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "trash.restore",
        targetType: type === "COMIC" ? "Comic" : type === "EDITION" ? "Edition" : "Chapter",
        targetId: id,
      })
    );

    revalidatePath("/admin/operations");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function purgeTrashItem(type: TrashType, id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (type === "COMIC") {
      const result = await deleteComic(id);
      if (result.success) revalidatePath("/admin/operations");
      return result;
    }

    if (type !== "CHAPTER") return { success: false, error: "حذف نهایی این نوع پشتیبانی نمی‌شود" };

    const chapter = await prisma.chapter.findUnique({
      where: { id },
      select: { id: true, pages: true, comicId: true, deletedAt: true, _count: { select: { saleLines: true } } },
    });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };
    if (!chapter.deletedAt) return { success: false, error: "ابتدا چپتر را به سطل بازیافت منتقل کنید" };
    if (chapter._count.saleLines > 0) {
      return { success: false, error: "این چپتر سابقه‌ی فروش دارد و برای حفظ سوابق مالی حذف نهایی نمی‌شود" };
    }

    await prisma.$transaction([
      prisma.chapterReadMark.deleteMany({ where: { chapterId: id } }),
      prisma.chapterReaction.deleteMany({ where: { chapterId: id } }),
      prisma.chapterUnlock.deleteMany({ where: { chapterId: id } }),
      prisma.entitlement.deleteMany({ where: { chapterId: id } }),
      prisma.chapterStaff.deleteMany({ where: { chapterId: id } }),
      prisma.comment.deleteMany({ where: { chapterId: id } }),
      prisma.chapter.delete({ where: { id } }),
    ]);

    const keys = chapter.pages.filter((key) => Boolean(key) && !key.startsWith("http://") && !key.startsWith("https://"));
    await deleteObjects(keys).catch(() => {});

    invalidateChapterAccessList(chapter.comicId);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "trash.purge",
        targetType: "Chapter",
        targetId: id,
        metadata: { comicId: chapter.comicId, pageCount: chapter.pages.length },
      })
    );

    revalidatePath("/admin/operations");
    revalidatePath(`/admin/comics/${chapter.comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}
