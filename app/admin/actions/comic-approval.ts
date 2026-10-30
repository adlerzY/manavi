"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> { success: boolean; error?: string; data?: T }

export interface PendingComicRow {
  id: string;
  title: string;
  slug: string;
  coverImage: string;
  createdAt: string;
  creatorName: string | null;
  rejectionNote: string | null;
}

export async function listPendingComics(): Promise<PendingComicRow[]> {
  await requireAdmin();
  const comics = await prisma.comic.findMany({
    where: { approvalStatus: { in: ["PENDING_APPROVAL", "NEEDS_CHANGES"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, title: true, slug: true, coverImage: true, createdAt: true, rejectionNote: true,
      createdBy: { select: { firstName: true, username: true } },
    },
  });
  return comics.map((c) => ({
    id: c.id, title: c.title, slug: c.slug, coverImage: c.coverImage, createdAt: c.createdAt.toISOString(),
    rejectionNote: c.rejectionNote,
    creatorName: c.createdBy ? (c.createdBy.username ? `@${c.createdBy.username}` : c.createdBy.firstName) : null,
  }));
}

export async function approveComic(comicId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const comic = await prisma.comic.update({
      where: { id: comicId },
      data: { approvalStatus: "APPROVED", rejectionNote: null },
      select: { slug: true, title: true, createdById: true },
    });

    after(() => logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "comic.approve", targetType: "Comic", targetId: comicId }));

    const creatorId = comic.createdById;
    if (creatorId && creatorId !== admin.id) {
      after(() =>
        createNotifications([
          {
            userId: creatorId,
            type: "COMIC_APPROVED",
            title: "عنوان شما تایید و منتشر شد",
            body: comic.title,
            href: `/app/comic/${comic.slug}`,
            dedupeKey: `comic-approved:${comicId}:${Date.now()}`,
          },
        ])
      );
    }

    revalidateTag("home-feed", "max");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    revalidatePath(`/app/comic/${comic.slug}`);
    revalidatePath("/admin/chapter-approvals");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function rejectComic(comicId: string, note: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const trimmed = note.trim();
    if (!trimmed) return { success: false, error: "برای رد کردن، دلیل را بنویسید" };

    const comic = await prisma.comic.update({
      where: { id: comicId },
      data: { approvalStatus: "NEEDS_CHANGES", rejectionNote: trimmed },
      select: { slug: true, title: true, createdById: true },
    });

    after(() => logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "comic.reject", targetType: "Comic", targetId: comicId, metadata: { note: trimmed } }));

    const creatorId = comic.createdById;
    if (creatorId && creatorId !== admin.id) {
      after(() =>
        createNotifications([
          {
            userId: creatorId,
            type: "COMIC_REJECTED",
            title: "عنوان شما نیاز به اصلاح دارد",
            body: `${comic.title} — ${trimmed}`,
            href: `/publisher/comics/${comicId}`,
            dedupeKey: `comic-rejected:${comicId}:${Date.now()}`,
          },
        ])
      );
    }

    revalidateTag("home-feed", "max");
    revalidatePath("/app");
    revalidatePath("/app/explore");
    revalidatePath(`/app/comic/${comic.slug}`);
    revalidatePath("/admin/chapter-approvals");
    revalidatePath("/publisher/comics");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}