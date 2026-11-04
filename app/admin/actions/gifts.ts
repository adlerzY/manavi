"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { GiftAudience } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications } from "@/lib/notifications";
import { getLanguageLabels } from "@/lib/language-registry";
import { grantEntitlements, invalidateGrantedCaches } from "@/lib/bonus";
import { GiftError, MAX_GIFT_RECIPIENTS, MAX_GIFT_ROWS, giftChapterIds, resolveGiftRecipients } from "@/lib/gifts";

const AUDIENCES: GiftAudience[] = ["USERS", "EDITION_BUYERS", "COMIC_BOOKMARKS"];
const MAX_GIFT_EDITIONS = 20;

export interface GiftInput {
  reason: string;
  audience: GiftAudience;
  usernames?: string;
  audienceRefId?: string | null;
  editionIds: string[];
  includeFuture: boolean;
  expiresAt?: string | null;
}

export interface GiftPreview {
  recipients: number;
  chapters: number;
  newAccess: number;
}

export interface GiftEditionOption {
  id: string;
  label: string;
}

export interface GiftRow {
  id: string;
  reason: string;
  audience: GiftAudience;
  recipientCount: number;
  grantedCount: number;
  includeFuture: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  editions: string[];
}

async function prepare(input: GiftInput) {
  const reason = String(input.reason ?? "").trim().slice(0, 300);
  if (reason.length < 3) throw new GiftError("دلیل هدیه را بنویسید");
  if (!AUDIENCES.includes(input.audience)) throw new GiftError("نوع مخاطب نامعتبر است");

  const editionIds = [...new Set((input.editionIds ?? []).map(String))].slice(0, MAX_GIFT_EDITIONS);
  if (editionIds.length === 0) throw new GiftError("حداقل یک نسخه برای هدیه انتخاب کنید");

  const found = await prisma.edition.count({ where: { id: { in: editionIds }, deletedAt: null } });
  if (found !== editionIds.length) throw new GiftError("یکی از نسخه‌های انتخاب‌شده یافت نشد");

  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date())) {
    throw new GiftError("تاریخ انقضا باید در آینده باشد");
  }

  const recipients = await resolveGiftRecipients({ audience: input.audience, usernames: input.usernames, refId: input.audienceRefId });
  if (recipients.length === 0) throw new GiftError("هیچ کاربری برای این مخاطب پیدا نشد");
  if (recipients.length > MAX_GIFT_RECIPIENTS) {
    throw new GiftError(`تعداد مخاطبان از ${MAX_GIFT_RECIPIENTS.toLocaleString("fa-IR")} نفر بیشتر است`);
  }

  const chapterIds = await giftChapterIds(editionIds);
  if (chapterIds.length === 0 && !input.includeFuture) throw new GiftError("چپتر سکه‌ای منتشرشده‌ای برای هدیه وجود ندارد");
  if (recipients.length * chapterIds.length > MAX_GIFT_ROWS) {
    throw new GiftError("حجم عملیات بیش از حد مجاز است؛ مخاطبان یا نسخه‌ها را کمتر کنید");
  }

  return { reason, editionIds, expiresAt, recipients, chapterIds, includeFuture: Boolean(input.includeFuture) };
}

export async function searchGiftEditions(query: string): Promise<GiftEditionOption[]> {
  await requireAdmin();
  const q = String(query ?? "").trim().slice(0, 80);
  if (q.length < 2) return [];

  const [rows, labels] = await Promise.all([
    prisma.edition.findMany({
      where: { deletedAt: null, status: "ACTIVE", work: { title: { contains: q, mode: "insensitive" } } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, language: true, title: true, work: { select: { title: true } }, publisher: { select: { name: true } } },
    }),
    getLanguageLabels(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    label: `${row.work.title} — ${row.publisher.name} · ${labels[row.language] ?? row.language.toUpperCase()}${row.title ? ` (${row.title})` : ""}`,
  }));
}

export async function previewGift(input: GiftInput): Promise<ActionResult<GiftPreview>> {
  try {
    await requireAdmin();
    const prepared = await prepare(input);

    const existing =
      prepared.chapterIds.length > 0
        ? await prisma.entitlement.count({
            where: {
              userId: { in: prepared.recipients },
              chapterId: { in: prepared.chapterIds },
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
          })
        : 0;

    return {
      success: true,
      data: {
        recipients: prepared.recipients.length,
        chapters: prepared.chapterIds.length,
        newAccess: Math.max(0, prepared.recipients.length * prepared.chapterIds.length - existing),
      },
    };
  } catch (err) {
    if (err instanceof GiftError) return { success: false, error: err.message };
    return safeError(err);
  }
}

export async function createGift(input: GiftInput): Promise<ActionResult<{ id: string; recipients: number; granted: number }>> {
  try {
    const admin = await requireAdmin();
    const prepared = await prepare(input);

    const gift = await prisma.accessGift.create({
      data: {
        reason: prepared.reason,
        audience: input.audience,
        audienceRef: input.audience === "USERS" ? null : input.audienceRefId ?? null,
        includeFuture: prepared.includeFuture,
        expiresAt: prepared.expiresAt,
        createdById: admin.id,
        recipientCount: prepared.recipients.length,
        editions: { create: prepared.editionIds.map((editionId) => ({ editionId })) },
        recipients: { createMany: { data: prepared.recipients.map((userId) => ({ userId })) } },
      },
      select: { id: true },
    });

    const created = await grantEntitlements(prisma, {
      userIds: prepared.recipients,
      chapterIds: prepared.chapterIds,
      type: "ADMIN_GRANT",
      expiresAt: prepared.expiresAt,
      giftId: gift.id,
    });
    await prisma.accessGift.update({ where: { id: gift.id }, data: { grantedCount: created.length } });

    after(async () => {
      await invalidateGrantedCaches(created);
      await logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.gift",
        targetType: "AccessGift",
        targetId: gift.id,
        metadata: {
          reason: prepared.reason,
          audience: input.audience,
          editionIds: prepared.editionIds,
          recipients: prepared.recipients.length,
          granted: created.length,
          includeFuture: prepared.includeFuture,
        },
      });
      await createNotifications(
        prepared.recipients.map((userId) => ({
          userId,
          type: "SYSTEM" as const,
          title: "دسترسی هدیه برای شما فعال شد",
          body: "چند چپتر سکه‌ای به‌عنوان هدیه‌ی ماناوی برای شما باز شد",
          href: "/app/library",
          dedupeKey: `gift:${gift.id}:${userId}`,
        }))
      ).catch(() => {});
    });

    revalidatePath("/admin/gifts");
    return { success: true, data: { id: gift.id, recipients: prepared.recipients.length, granted: created.length } };
  } catch (err) {
    if (err instanceof GiftError) return { success: false, error: err.message };
    return safeError(err);
  }
}

export async function revokeGift(giftId: string): Promise<ActionResult<{ removed: number }>> {
  try {
    const admin = await requireAdmin();

    const gift = await prisma.accessGift.findUnique({ where: { id: giftId }, select: { id: true, revokedAt: true } });
    if (!gift) return { success: false, error: "هدیه یافت نشد" };
    if (gift.revokedAt) return { success: false, error: "این هدیه قبلاً لغو شده است" };

    const owned = await prisma.entitlement.findMany({ where: { giftId }, select: { userId: true, chapterId: true } });

    await prisma.$transaction([
      prisma.entitlement.deleteMany({ where: { giftId } }),
      prisma.accessGift.update({ where: { id: giftId }, data: { revokedAt: new Date(), revokedById: admin.id } }),
    ]);

    after(async () => {
      await invalidateGrantedCaches(owned);
      await logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "access.giftRevoke",
        targetType: "AccessGift",
        targetId: giftId,
        metadata: { removed: owned.length },
      });
    });

    revalidatePath("/admin/gifts");
    return { success: true, data: { removed: owned.length } };
  } catch (err) {
    return safeError(err);
  }
}

export async function listGifts(): Promise<GiftRow[]> {
  await requireAdmin();

  const [rows, labels] = await Promise.all([
    prisma.accessGift.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        editions: {
          select: {
            edition: { select: { language: true, work: { select: { title: true } }, publisher: { select: { name: true } } } },
          },
        },
      },
    }),
    getLanguageLabels(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    reason: row.reason,
    audience: row.audience,
    recipientCount: row.recipientCount,
    grantedCount: row.grantedCount,
    includeFuture: row.includeFuture,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    editions: row.editions.map(
      (item) => `${item.edition.work.title} · ${item.edition.publisher.name} · ${labels[item.edition.language] ?? item.edition.language.toUpperCase()}`
    ),
  }));
}