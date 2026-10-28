import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";
import { microToUsdt } from "./units";

export const NOTIFICATIONS_PAGE_SIZE = 30;

const INSERT_CHUNK_SIZE = 1000;

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  dedupeKey?: string | null;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export async function createNotifications(inputs: NotificationInput[]): Promise<number> {
  if (inputs.length === 0) return 0;

  let created = 0;
  for (let i = 0; i < inputs.length; i += INSERT_CHUNK_SIZE) {
    const chunk = inputs.slice(i, i + INSERT_CHUNK_SIZE);
    try {
      const result = await prisma.notification.createMany({
        data: chunk.map((input) => ({
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 200),
          body: input.body ? input.body.slice(0, 500) : null,
          href: input.href ?? null,
          dedupeKey: input.dedupeKey ?? null,
        })),
        skipDuplicates: true,
      });
      created += result.count;
    } catch (err) {
      console.error("[notifications] create failed", err);
    }
  }
  return created;
}

export async function notifyAdmins(input: Omit<NotificationInput, "userId">): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isBanned: false, deletedAt: null },
    select: { id: true },
  });

  return createNotifications(
    admins.map((admin) => ({
      ...input,
      userId: admin.id,
      dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${admin.id}` : null,
    }))
  );
}

export async function notifyChapterPublishedInApp(input: {
  chapterId: string;
  comicId: string;
  comicTitle: string;
  comicSlug: string;
  chapterNumber: number;
}): Promise<number> {
  const bookmarks = await prisma.bookmark.findMany({
    where: {
      comicId: input.comicId,
      notifyOnNewChapter: true,
      user: { isBanned: false, deletedAt: null },
    },
    select: { userId: true },
  });

  return createNotifications(
    bookmarks.map((bookmark) => ({
      userId: bookmark.userId,
      type: "NEW_CHAPTER" as const,
      title: `فصل جدید ${input.comicTitle}`,
      body: `چپتر ${input.chapterNumber.toLocaleString("fa-IR")} منتشر شد`,
      href: `/app/read/${input.chapterId}`,
      dedupeKey: `new-chapter:${input.chapterId}:${bookmark.userId}`,
    }))
  );
}

export async function notifyPayoutRecorded(input: {
  lineId: string;
  amountMicro: bigint;
  payoutId: string | null;
}): Promise<number> {
  const line = await prisma.settlementLine.findUnique({
    where: { id: input.lineId },
    select: { beneficiaryType: true, beneficiaryId: true },
  });
  if (!line) return 0;

  let userId: string | null = null;
  if (line.beneficiaryType === "USER") {
    userId = line.beneficiaryId;
  } else if (line.beneficiaryType === "PUBLISHER") {
    const publisher = await prisma.publisher.findUnique({
      where: { id: line.beneficiaryId },
      select: { contractUserId: true },
    });
    userId = publisher?.contractUserId ?? null;
  }
  if (!userId) return 0;

  const usdt = microToUsdt(input.amountMicro);
  return createNotifications([
    {
      userId,
      type: "PAYOUT_PAID",
      title: "پرداخت جدید برای شما ثبت شد",
      body: `${usdt.toLocaleString("fa-IR", { maximumFractionDigits: 6 })} USDT — لطفاً دریافت را تأیید کنید`,
      href: "/app/earnings",
      dedupeKey: input.payoutId ? `payout:${input.payoutId}` : null,
    },
  ]);
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  try {
    return await prisma.notification.count({ where: { userId, readAt: null } });
  } catch {
    return 0;
  }
}

export async function listNotifications(
  userId: string,
  page: number
): Promise<{ items: NotificationRow[]; total: number }> {
  const where = { userId };

  const [rows, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * NOTIFICATIONS_PAGE_SIZE,
      take: NOTIFICATIONS_PAGE_SIZE,
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      href: row.href,
      read: row.readAt !== null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
  };
}

export async function cleanupOldNotifications(readDays = 60, maxDays = 180): Promise<number> {
  const dayMs = 24 * 60 * 60 * 1000;
  const readCutoff = new Date(Date.now() - readDays * dayMs);
  const maxCutoff = new Date(Date.now() - maxDays * dayMs);

  const result = await prisma.notification.deleteMany({
    where: {
      OR: [{ readAt: { not: null }, createdAt: { lt: readCutoff } }, { createdAt: { lt: maxCutoff } }],
    },
  });
  return result.count;
}