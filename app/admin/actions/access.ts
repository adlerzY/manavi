"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ComicAccessMode, PublisherStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, invalidateSessionUserCache } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { PLATFORM_PUBLISHER_ID } from "@/lib/platform-license";

export interface ComicAccessRow {
  publisherId: string;
  publisherName: string;
  publisherStatus: PublisherStatus;
  isOwner: boolean;
  readOnly: boolean;
  source: string;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
}

export interface ComicAccessOverview {
  accessMode: ComicAccessMode;
  emergencyLocked: boolean;
  rows: ComicAccessRow[];
}

function parseExpiry(value: string | null | undefined): Date | null | "invalid" {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) return "invalid";
  return date;
}

function refreshComic(comicId: string, slug?: string) {
  revalidatePath(`/admin/comics/${comicId}`);
  revalidatePath("/publisher/comics");
  revalidatePath(`/publisher/comics/${comicId}`);
  if (slug) revalidatePath(`/app/comic/${slug}`);
}

export async function getComicAccessOverview(comicId: string): Promise<ComicAccessOverview | null> {
  await requireAdmin();
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: {
      accessMode: true,
      emergencyLocked: true,
      accesses: {
        orderBy: [{ isOwner: "desc" }, { createdAt: "asc" }],
        include: { publisher: { select: { name: true, status: true } } },
      },
    },
  });
  if (!comic) return null;

  return {
    accessMode: comic.accessMode,
    emergencyLocked: comic.emergencyLocked,
    rows: comic.accesses.map((row) => ({
      publisherId: row.publisherId,
      publisherName: row.publisher.name,
      publisherStatus: row.publisher.status,
      isOwner: row.isOwner,
      readOnly: row.readOnly,
      source: row.source,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      note: row.note,
    })),
  };
}

export async function grantComicAccess(input: {
  comicId: string;
  publisherId: string;
  readOnly?: boolean;
  expiresAt?: string | null;
  note?: string;
}): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (input.publisherId === PLATFORM_PUBLISHER_ID) {
      return { success: false, error: "ناشر داخلی پلتفرم نیازی به دسترسی ندارد" };
    }

    const expiry = parseExpiry(input.expiresAt);
    if (expiry === "invalid") return { success: false, error: "تاریخ انقضا باید در آینده باشد" };

    const [comic, publisher] = await Promise.all([
      prisma.comic.findUnique({ where: { id: input.comicId }, select: { id: true, slug: true, title: true } }),
      prisma.publisher.findUnique({ where: { id: input.publisherId }, select: { id: true, contractUserId: true } }),
    ]);
    if (!comic || !publisher) return { success: false, error: "اثر یا ناشر یافت نشد" };

    const readOnly = Boolean(input.readOnly);
    const note = input.note?.trim().slice(0, 300) || null;

    await prisma.comicAccess.upsert({
      where: { comicId_publisherId: { comicId: comic.id, publisherId: publisher.id } },
      update: { readOnly, expiresAt: expiry, note, revokedAt: null, revokedById: null, grantedById: admin.id, source: "ADMIN" },
      create: { comicId: comic.id, publisherId: publisher.id, readOnly, expiresAt: expiry, note, grantedById: admin.id, source: "ADMIN" },
    });

    const ownerUserId = publisher.contractUserId;
    after(() => {
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.grant",
        targetType: "Comic",
        targetId: comic.id,
        metadata: { publisherId: publisher.id, readOnly, expiresAt: expiry ? expiry.toISOString() : null },
      });
      if (ownerUserId) {
        createNotifications([
          {
            userId: ownerUserId,
            type: "SYSTEM",
            title: "دسترسی شما به یک اثر تغییر کرد",
            body: `${comic.title}${readOnly ? " — فقط مشاهده" : ""}`,
            href: `/publisher/comics/${comic.id}`,
            dedupeKey: `access-grant:${comic.id}:${publisher.id}:${Date.now()}`,
          },
        ]).catch(() => {});
      }
    });

    refreshComic(comic.id, comic.slug);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function revokeComicAccess(comicId: string, publisherId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    const updated = await prisma.comicAccess.updateMany({
      where: { comicId, publisherId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: admin.id },
    });
    if (updated.count === 0) return { success: false, error: "دسترسی فعالی برای لغو وجود ندارد" };

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.revoke",
        targetType: "Comic",
        targetId: comicId,
        metadata: { publisherId },
      })
    );

    refreshComic(comicId);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function setComicAccessMode(comicId: string, mode: ComicAccessMode): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (mode !== "OPEN" && mode !== "PERSONAL") return { success: false, error: "حالت نامعتبر است" };

    const comic = await prisma.comic.update({ where: { id: comicId }, data: { accessMode: mode }, select: { slug: true } });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.modeChange",
        targetType: "Comic",
        targetId: comicId,
        metadata: { mode },
      })
    );

    refreshComic(comicId, comic.slug);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function setEmergencyLock(target: "COMIC" | "EDITION", id: string, locked: boolean): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (target === "COMIC") {
      const comic = await prisma.comic.update({ where: { id }, data: { emergencyLocked: locked }, select: { slug: true } });
      refreshComic(id, comic.slug);
    } else {
      const edition = await prisma.edition.update({
        where: { id },
        data: { emergencyLocked: locked },
        select: { workId: true, work: { select: { slug: true } } },
      });
      refreshComic(edition.workId, edition.work.slug);
    }

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.emergencyLock",
        targetType: target === "COMIC" ? "Comic" : "Edition",
        targetId: id,
        metadata: { locked },
      })
    );

    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function transferComicOwnership(comicId: string, toPublisherId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (toPublisherId === PLATFORM_PUBLISHER_ID) {
      return { success: false, error: "انتقال به ناشر داخلی پلتفرم ممکن نیست" };
    }

    const [comic, target] = await Promise.all([
      prisma.comic.findUnique({
        where: { id: comicId },
        select: { id: true, slug: true, title: true, accesses: { where: { isOwner: true }, select: { publisherId: true } } },
      }),
      prisma.publisher.findUnique({ where: { id: toPublisherId }, select: { id: true, contractUserId: true } }),
    ]);
    if (!comic || !target) return { success: false, error: "اثر یا ناشر یافت نشد" };

    const previousOwnerIds = comic.accesses.map((row) => row.publisherId).filter((id) => id !== toPublisherId);

    await prisma.$transaction(async (tx) => {
      await tx.comicAccess.updateMany({ where: { comicId, isOwner: true }, data: { isOwner: false } });
      await tx.comicAccess.upsert({
        where: { comicId_publisherId: { comicId, publisherId: toPublisherId } },
        update: { isOwner: true, readOnly: false, expiresAt: null, revokedAt: null, revokedById: null, grantedById: admin.id },
        create: { comicId, publisherId: toPublisherId, isOwner: true, source: "ADMIN", grantedById: admin.id },
      });
    });

    const targetUserId = target.contractUserId;
    after(async () => {
      await logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.transfer",
        targetType: "Comic",
        targetId: comicId,
        metadata: { toPublisherId, previousOwnerIds },
      });
      if (targetUserId) {
        await createNotifications([
          {
            userId: targetUserId,
            type: "SYSTEM",
            title: "مالکیت یک اثر به ناشر شما منتقل شد",
            body: comic.title,
            href: `/publisher/comics/${comicId}`,
            dedupeKey: `access-transfer:${comicId}:${toPublisherId}:${Date.now()}`,
          },
        ]).catch(() => {});
      }
    });

    refreshComic(comicId, comic.slug);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function setPublisherStatus(
  publisherId: string,
  status: PublisherStatus,
  reason?: string | null
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (publisherId === PLATFORM_PUBLISHER_ID) return { success: false, error: "ناشر داخلی پلتفرم قابل تعلیق نیست" };
    if (status !== "ACTIVE" && status !== "SUSPENDED") return { success: false, error: "وضعیت نامعتبر است" };

    const suspended = status === "SUSPENDED";
    const cleanReason = reason?.trim().slice(0, 300) || null;

    const publisher = await prisma.publisher.update({
      where: { id: publisherId },
      data: suspended
        ? { status, suspendedAt: new Date(), suspendedById: admin.id, suspensionReason: cleanReason }
        : { status, suspendedAt: null, suspendedById: null, suspensionReason: null },
      select: { contractUserId: true, staff: { select: { userId: true } } },
    });

    const userIds = new Set<string>(publisher.staff.map((row) => row.userId));
    if (publisher.contractUserId) userIds.add(publisher.contractUserId);
    await Promise.all([...userIds].map((userId) => invalidateSessionUserCache(userId)));

    after(async () => {
      await logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: suspended ? "publisher.suspend" : "publisher.unsuspend",
        targetType: "Publisher",
        targetId: publisherId,
        metadata: { reason: cleanReason },
      });
      if (publisher.contractUserId) {
        await createNotifications([
          {
            userId: publisher.contractUserId,
            type: "SYSTEM",
            title: suspended ? "حساب ناشر شما تعلیق شد" : "تعلیق حساب ناشر شما برداشته شد",
            body: suspended ? cleanReason : null,
            href: "/app/profile",
            dedupeKey: `publisher-status:${publisherId}:${Date.now()}`,
          },
        ]).catch(() => {});
      }
    });

    revalidatePath("/admin/publishers");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}