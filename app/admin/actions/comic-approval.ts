"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { safeError } from "@/lib/errors";

interface ActionResult<T = undefined> { success: boolean; error?: string; data?: T }

export interface PendingComicRow {
  id: string;
  title: string;
  slug: string;
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
      id: true, title: true, slug: true, createdAt: true, rejectionNote: true,
      createdBy: { select: { firstName: true, username: true } },
    },
  });
  return comics.map((c) => ({
    id: c.id, title: c.title, slug: c.slug, createdAt: c.createdAt.toISOString(),
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
      select: { slug: true },
    });

    after(() => logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "comic.approve", targetType: "Comic", targetId: comicId }));

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
      select: { slug: true },
    });

    after(() => logAuditEvent({ actorId: admin.id, actorRole: admin.role, action: "comic.reject", targetType: "Comic", targetId: comicId, metadata: { note: trimmed } }));

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