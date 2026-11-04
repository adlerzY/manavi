"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import type { EditionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditionAccess, type SessionUser } from "@/lib/auth";
import { AccessDeniedError, assertComicPermission, ensureComicAccess, resolvePublisherComicAccess } from "@/lib/access";
import { safeError, type ActionResult } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotifications, notifyAdmins } from "@/lib/notifications";
import { checkOperation } from "@/lib/operation-guard";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { grantAutomaticAccessForChapters } from "@/lib/bonus";
import { getLanguageLabels, isValidLanguage } from "@/lib/language-registry";
import { resolveEditionLicense } from "@/lib/edition-license";
import { LICENSE_SCOPE_LABELS_FA } from "@/lib/license";
import { PLATFORM_PUBLISHER_ID, ensurePlatformLicense } from "@/lib/platform-license";
import { trashEdition } from "@/lib/trash";

const STATUSES: EditionStatus[] = ["DRAFT", "PENDING_REVIEW", "ACTIVE", "SUSPENDED", "ARCHIVED"];
const PUBLISHER_STATUSES: EditionStatus[] = ["ACTIVE", "ARCHIVED"];

export interface EditionRow {
  id: string;
  language: string;
  languageLabel: string;
  title: string | null;
  status: EditionStatus;
  publisherId: string;
  publisherName: string;
  licenseScopeLabel: string;
  priceCoinsOverride: number | null;
  chapterCount: number;
  emergencyLocked: boolean;
}

export interface PendingEditionRow {
  id: string;
  workId: string;
  workTitle: string;
  publisherName: string;
  languageLabel: string;
}

async function requireActiveUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessDeniedError("برای این عملیات باید وارد شوید");
  if (user.isBanned) throw new AccessDeniedError("حساب شما مسدود شده است");
  return user;
}

function refreshEditions(comicId: string, slug?: string) {
  revalidateTag("editions", "max");
  invalidateChapterAccessList(comicId);
  revalidatePath(`/admin/comics/${comicId}`);
  revalidatePath(`/publisher/comics/${comicId}`);
  revalidatePath("/publisher/comics");
  revalidatePath("/app/explore");
  if (slug) revalidatePath(`/app/comic/${slug}`);
}

export async function listComicEditions(comicId: string): Promise<EditionRow[]> {
  const user = await requireActiveUser();
  let publisherId: string | null = null;
  if (user.role !== "ADMIN") publisherId = (await assertComicPermission(user, comicId, "view")).publisherId;

  const [rows, labels] = await Promise.all([
    prisma.edition.findMany({
      where: { workId: comicId, deletedAt: null, ...(publisherId ? { publisherId } : {}) },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        language: true,
        title: true,
        status: true,
        publisherId: true,
        priceCoinsOverride: true,
        emergencyLocked: true,
        publisher: { select: { name: true } },
        license: { select: { scope: true } },
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    }),
    getLanguageLabels(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    language: row.language,
    languageLabel: labels[row.language] ?? row.language.toUpperCase(),
    title: row.title,
    status: row.status,
    publisherId: row.publisherId,
    publisherName: row.publisher.name,
    licenseScopeLabel: LICENSE_SCOPE_LABELS_FA[row.license.scope],
    priceCoinsOverride: row.priceCoinsOverride,
    chapterCount: row._count.chapters,
    emergencyLocked: row.emergencyLocked,
  }));
}

export async function listPendingEditions(): Promise<PendingEditionRow[]> {
  await requireAdmin();

  const [rows, labels] = await Promise.all([
    prisma.edition.findMany({
      where: { status: "PENDING_REVIEW", deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { id: true, workId: true, language: true, work: { select: { title: true } }, publisher: { select: { name: true } } },
    }),
    getLanguageLabels(),
  ]);

  return rows.map((row) => ({
    id: row.id,
    workId: row.workId,
    workTitle: row.work.title,
    publisherName: row.publisher.name,
    languageLabel: labels[row.language] ?? row.language.toUpperCase(),
  }));
}

export async function createEdition(input: {
  comicId: string;
  language: string;
  title?: string | null;
  publisherId?: string | null;
  licenseId?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireActiveUser();
    const isAdmin = user.role === "ADMIN";

    const language = String(input.language ?? "").trim().toLowerCase();
    if (!(await isValidLanguage(language))) return { success: false, error: "زبان انتخاب‌شده فعال نیست" };

    const comic = await prisma.comic.findUnique({
      where: { id: input.comicId },
      select: { id: true, slug: true, title: true, licenseId: true, accessMode: true, deletedAt: true },
    });
    if (!comic || comic.deletedAt) return { success: false, error: "اثر یافت نشد" };

    let publisherId = "";
    let via: "EXPLICIT" | "GLOBAL" | null = "EXPLICIT";
    if (isAdmin) {
      publisherId = String(input.publisherId ?? "").trim();
      if (!publisherId) return { success: false, error: "انتخاب ناشر الزامی است" };
    } else {
      const check = await assertComicPermission(user, comic.id, "manageEditions");
      publisherId = check.publisherId ?? "";
      via = (await resolvePublisherComicAccess(comic, publisherId)).via;
    }

    const publisher = await prisma.publisher.findUnique({
      where: { id: publisherId },
      select: { id: true, name: true, status: true, isVerified: true },
    });
    if (!publisher) return { success: false, error: "ناشر یافت نشد" };
    if (publisher.status !== "ACTIVE") return { success: false, error: "این ناشر تعلیق شده است" };

    let licenseId: string;
    if (publisherId === PLATFORM_PUBLISHER_ID) {
      licenseId = await ensurePlatformLicense();
    } else if (isAdmin && input.licenseId) {
      const chosen = await prisma.license.findFirst({
        where: { id: input.licenseId, publisherId, terminatedAt: null, status: { notIn: ["EXPIRED", "TERMINATED"] } },
        select: { id: true },
      });
      if (!chosen) return { success: false, error: "لایسنس انتخاب‌شده برای این ناشر معتبر نیست" };
      licenseId = chosen.id;
    } else {
      const license = await resolveEditionLicense(publisherId, comic, via);
      if (!license) return { success: false, error: "ناشر لایسنس فعالی متناسب با این اثر ندارد" };
      licenseId = license.id;
    }

    const existing = await prisma.edition.findUnique({
      where: { workId_publisherId_language: { workId: comic.id, publisherId, language } },
      select: { deletedAt: true },
    });
    if (existing) {
      return {
        success: false,
        error: existing.deletedAt
          ? "نسخه‌ای با این زبان در سطل بازیافت است — از مدیریت بخواهید آن را بازگرداند"
          : "برای این ناشر و زبان قبلاً نسخه‌ای ثبت شده است",
      };
    }

    const status: EditionStatus = isAdmin || publisher.isVerified ? "ACTIVE" : "PENDING_REVIEW";
    const title = input.title?.trim().slice(0, 80) || null;

    const edition = await prisma.$transaction(async (tx) => {
      const created = await tx.edition.create({
        data: { workId: comic.id, publisherId, licenseId, language, title, status },
        select: { id: true },
      });
      if (isAdmin) await ensureComicAccess(tx, { comicId: comic.id, publisherId, source: "ADMIN", grantedById: user.id });
      return created;
    });

    after(() => {
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "edition.create",
        targetType: "Edition",
        targetId: edition.id,
        metadata: { comicId: comic.id, publisherId, language, status },
      });
      if (status === "PENDING_REVIEW") {
        notifyAdmins({
          type: "SYSTEM",
          title: "نسخه‌ی جدید در انتظار تأیید",
          body: `${comic.title} — ${publisher.name}`,
          href: "/admin/moderation",
          dedupeKey: `edition-new:${edition.id}`,
        }).catch(() => {});
      }
    });

    refreshEditions(comic.id, comic.slug);
    return { success: true, data: { id: edition.id } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002") {
      return { success: false, error: "برای این ناشر و زبان قبلاً نسخه‌ای ثبت شده است" };
    }
    return safeError(err);
  }
}

export async function updateEdition(
  editionId: string,
  input: { title?: string | null; status?: EditionStatus; priceCoinsOverride?: number | null }
): Promise<ActionResult> {
  try {
    const user = await requireActiveUser();
    const isAdmin = user.role === "ADMIN";

    const existing = await prisma.edition.findUnique({
      where: { id: editionId },
      select: {
        id: true,
        workId: true,
        status: true,
        deletedAt: true,
        work: { select: { slug: true, title: true } },
        publisher: { select: { contractUserId: true } },
      },
    });
    if (!existing || existing.deletedAt) return { success: false, error: "نسخه یافت نشد" };

    await requireEditionAccess(editionId, "manageEditions");

    const data: Prisma.EditionUpdateInput = {};

    if (input.title !== undefined) data.title = input.title?.trim().slice(0, 80) || null;

    if (input.status !== undefined) {
      if (!STATUSES.includes(input.status)) return { success: false, error: "وضعیت نامعتبر است" };
      if (!isAdmin) {
        if (!PUBLISHER_STATUSES.includes(input.status) || !PUBLISHER_STATUSES.includes(existing.status)) {
          return { success: false, error: "این وضعیت را فقط مدیریت می‌تواند تغییر دهد" };
        }
      }
      data.status = input.status;
    }

    if (input.priceCoinsOverride !== undefined) {
      if (!isAdmin) return { success: false, error: "قیمت نسخه فقط توسط مدیریت قابل تغییر است" };
      const value = input.priceCoinsOverride;
      if (value !== null && (!Number.isInteger(value) || value < 1 || value > 100_000)) {
        return { success: false, error: "قیمت باید عددی صحیح بین ۱ تا ۱۰۰٬۰۰۰ سکه باشد" };
      }
      data.priceCoinsOverride = value;
    }

    if (Object.keys(data).length === 0) return { success: true };

    await prisma.edition.update({ where: { id: editionId }, data });

    const ownerUserId = existing.publisher.contractUserId;
    const statusChanged = data.status !== undefined && data.status !== existing.status;

    after(async () => {
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "edition.update",
        targetType: "Edition",
        targetId: editionId,
        metadata: {
          title: input.title,
          status: input.status,
          priceCoinsOverride: input.priceCoinsOverride,
          previousStatus: existing.status,
        },
      });
      if (isAdmin && statusChanged && ownerUserId) {
        createNotifications([
          {
            userId: ownerUserId,
            type: "SYSTEM",
            title: "وضعیت یکی از نسخه‌های شما تغییر کرد",
            body: existing.work.title,
            href: `/publisher/comics/${existing.workId}?tab=editions`,
            dedupeKey: `edition-status:${editionId}:${Date.now()}`,
          },
        ]).catch(() => {});
      }
      if (data.status === "ACTIVE" && existing.status !== "ACTIVE") {
        await prisma.chapter
          .findMany({ where: { editionId, status: "PUBLISHED", deletedAt: null }, select: { id: true } })
          .then((rows) => grantAutomaticAccessForChapters(rows.map((row) => row.id)))
          .catch(() => {});
      }
    });

    refreshEditions(existing.workId, existing.work.slug);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteEdition(editionId: string): Promise<ActionResult> {
  try {
    const user = await requireActiveUser();

    const edition = await prisma.edition.findUnique({
      where: { id: editionId },
      select: { id: true, workId: true, publisherId: true, language: true, deletedAt: true, work: { select: { slug: true } } },
    });
    if (!edition || edition.deletedAt) return { success: false, error: "نسخه یافت نشد" };

    await requireEditionAccess(editionId, "delete");

    const gate = await checkOperation({
      actor: user,
      operation: "edition.delete",
      targetType: "Edition",
      targetId: editionId,
      summary: `حذف نسخه‌ی ${edition.language}`,
      publisherId: edition.publisherId,
      comicId: edition.workId,
    });
    if (!gate.ok) return { success: false, error: gate.message };

    await trashEdition(editionId, user.id);

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "trash.delete",
        targetType: "Edition",
        targetId: editionId,
        metadata: { comicId: edition.workId, language: edition.language },
      })
    );

    refreshEditions(edition.workId, edition.work.slug);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}
