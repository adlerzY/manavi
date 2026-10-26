"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUploadAccess, invalidateSessionUserCache } from "@/lib/auth";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { safeError } from "@/lib/errors";
import { isAllowedImageUrl } from "@/lib/image-url";
import { logAuditEvent } from "@/lib/audit-log";
import { LICENSE_STATUS_LABELS_FA } from "@/lib/license";
import { PLATFORM_LICENSE_ID, PLATFORM_PUBLISHER_ID, ensurePlatformLicense } from "@/lib/platform-license";
import { ENTITY_ID_PATTERN } from "@/lib/asset-kinds";
import { LicenseStatus, ChapterAccessType } from "@prisma/client";
import type { Prisma, ReadingMode } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const TERRITORY_PATTERN = /^[A-Z0-9_-]{2,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getDominantColor(imageUrl: string): Promise<string | null> {
  const { extractDominantColor } = await import("@/lib/color");
  return extractDominantColor(imageUrl);
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "P2002");
}

async function resolveLicenseId(requested: string | undefined): Promise<string> {
  if (!requested || requested === PLATFORM_LICENSE_ID) return ensurePlatformLicense();
  return requested;
}

async function demoteFormerOwner(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const staffCount = await tx.publisherStaff.count({ where: { userId } });
  await tx.user.updateMany({
    where: { id: userId, role: "PUBLISHER" },
    data: { role: staffCount > 0 ? "STAFF" : "USER" },
  });
}

export async function createPublisher(input: {
  name: string;
  legalEntity?: string;
  contactEmail: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();

    if (!input.name.trim() || !input.contactEmail.trim()) {
      return { success: false, error: "نام و ایمیل ارتباطی الزامی است" };
    }
    if (!EMAIL_PATTERN.test(input.contactEmail.trim())) {
      return { success: false, error: "ایمیل ارتباطی معتبر نیست" };
    }

    const publisher = await prisma.publisher.create({
      data: {
        name: input.name.trim(),
        legalEntity: input.legalEntity?.trim() || null,
        contactEmail: input.contactEmail.trim(),
      },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "publisher.create",
        targetType: "Publisher",
        targetId: publisher.id,
        metadata: { name: publisher.name },
      })
    );

    revalidatePath("/admin/publishers");
    revalidatePath("/admin/licenses");
    return { success: true, data: { id: publisher.id } };
  } catch (err) {
    return safeError(err);
  }
}

export async function createLicense(input: {
  publisherId: string;
  territory: string[];
  royaltyPercentage: number;
  startDate: string;
  endDate?: string;
  contractReference?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();

    const publisherId = input.publisherId?.trim();
    if (!publisherId) {
      return { success: false, error: "انتخاب ناشر الزامی است" };
    }

    const territory = [...new Set((input.territory ?? []).map((item) => item.trim().toUpperCase()).filter(Boolean))];
    if (territory.length === 0) {
      return { success: false, error: "حداقل یک قلمرو باید مشخص شود" };
    }
    if (territory.some((item) => !TERRITORY_PATTERN.test(item))) {
      return { success: false, error: "قلمرو نامعتبر است — از کدهای انگلیسی مثل IR یا GLOBAL استفاده کنید" };
    }

    const royalty = Number(input.royaltyPercentage);
    if (!Number.isFinite(royalty) || royalty < 0 || royalty > 100) {
      return { success: false, error: "درصد رویالتی باید بین ۰ تا ۱۰۰ باشد" };
    }
    const royaltyPercentage = Math.round(royalty * 100) / 100;

    const startDate = new Date(input.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return { success: false, error: "تاریخ شروع نامعتبر است" };
    }
    const endDate = input.endDate ? new Date(input.endDate) : null;
    if (endDate && Number.isNaN(endDate.getTime())) {
      return { success: false, error: "تاریخ پایان نامعتبر است" };
    }
    if (endDate && endDate <= startDate) {
      return { success: false, error: "تاریخ پایان باید بعد از تاریخ شروع باشد" };
    }

    const publisher = await prisma.publisher.findUnique({ where: { id: publisherId }, select: { id: true } });
    if (!publisher) {
      return { success: false, error: "ناشر یافت نشد" };
    }

    const license = await prisma.license.create({
      data: {
        publisherId,
        territory,
        royaltyPercentage,
        startDate,
        endDate,
        contractReference: input.contractReference?.trim() || null,
        status: LicenseStatus.PENDING,
        terms: {
          create: { royaltyPercentage, validFrom: new Date(), createdById: admin.id },
        },
      },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "license.create",
        targetType: "License",
        targetId: license.id,
        metadata: { publisherId, territory, royaltyPercentage },
      })
    );

    revalidatePath("/admin/licenses");
    return { success: true, data: { id: license.id } };
  } catch (err) {
    return safeError(err, "ثبت لایسنس ناموفق بود — جزئیات در لاگ سرور ثبت شد");
  }
}

export async function activateLicense(licenseId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const license = await prisma.license.findUnique({
      where: { id: licenseId },
      select: { status: true, terminatedAt: true },
    });
    if (!license) return { success: false, error: "لایسنس یافت نشد" };
    if (license.terminatedAt || license.status === LicenseStatus.TERMINATED || license.status === LicenseStatus.EXPIRED) {
      return { success: false, error: `لایسنس ${LICENSE_STATUS_LABELS_FA[license.status]} قابل فعال‌سازی نیست — یک لایسنس جدید بسازید` };
    }
    if (license.status === LicenseStatus.ACTIVE) return { success: true };

    await prisma.license.update({
      where: { id: licenseId },
      data: { status: LicenseStatus.ACTIVE },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "license.activate",
        targetType: "License",
        targetId: licenseId,
      })
    );

    revalidatePath("/admin/licenses");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function terminateLicense(licenseId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (licenseId === PLATFORM_LICENSE_ID) {
      return { success: false, error: "لایسنس داخلی پلتفرم قابل لغو نیست — تمام محتوای اختصاصی ماناوی به آن وابسته است" };
    }

    const license = await prisma.license.findUnique({ where: { id: licenseId }, select: { status: true } });
    if (!license) return { success: false, error: "لایسنس یافت نشد" };
    if (license.status === LicenseStatus.TERMINATED) return { success: true };

    await prisma.license.update({
      where: { id: licenseId },
      data: { status: LicenseStatus.TERMINATED, terminatedAt: new Date() },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "license.terminate",
        targetType: "License",
        targetId: licenseId,
      })
    );

    revalidatePath("/admin/licenses");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function createComic(input: {
  /** شناسه‌ی از پیش‌ساخته‌شده در فرم (draftId)؛ کاور و بنر از همان ابتدا زیر این شناسه آپلود شده‌اند */
  id?: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  bannerImage?: string;
  licenseId?: string;
  ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
  categoryId: string;
  readingMode: ReadingMode;
  genreIds?: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();

    if (!input.title.trim() || !input.slug.trim() || !input.categoryId) {
      return { success: false, error: "عنوان، اسلاگ و دسته‌بندی الزامی است" };
    }
    if (!SLUG_PATTERN.test(input.slug.trim())) {
      return { success: false, error: "اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، اعداد و خط تیره باشد" };
    }

    if (!input.coverImage || !isAllowedImageUrl(input.coverImage)) {
      return { success: false, error: "تصویر کاور معتبر نیست — از آپلودگر تصویر استفاده کنید" };
    }
    if (input.bannerImage && !isAllowedImageUrl(input.bannerImage)) {
      return { success: false, error: "تصویر بنر معتبر نیست" };
    }

    const draftId = input.id?.trim() || undefined;
    if (draftId) {
      if (!ENTITY_ID_PATTERN.test(draftId)) {
        return { success: false, error: "شناسه‌ی فرم نامعتبر است — صفحه را رفرش کنید" };
      }
      const taken = await prisma.comic.findUnique({ where: { id: draftId }, select: { id: true } });
      if (taken) return { success: false, error: "این فرم قبلاً ثبت شده است — صفحه را رفرش کنید" };
    }

    const licenseId = await resolveLicenseId(input.licenseId);

    const [license, category] = await Promise.all([
      prisma.license.findUnique({ where: { id: licenseId } }),
      prisma.category.findUnique({ where: { id: input.categoryId } }),
    ]);
    if (!license) {
      return { success: false, error: "لایسنس یافت نشد" };
    }
    if (license.status === LicenseStatus.EXPIRED || license.status === LicenseStatus.TERMINATED) {
      return { success: false, error: `امکان اتصال محتوا به لایسنس ${LICENSE_STATUS_LABELS_FA[license.status]} وجود ندارد` };
    }
    if (!category || !category.isActive) {
      return { success: false, error: "دسته‌بندی انتخاب‌شده معتبر نیست" };
    }

    const dominantColor = await getDominantColor(input.coverImage);

    const comic = await prisma.comic.create({
      data: {
        ...(draftId ? { id: draftId } : {}),
        title: input.title.trim(),
        slug: input.slug.trim(),
        description: input.description.trim(),
        coverImage: input.coverImage,
        bannerImage: input.bannerImage || null,
        dominantColor,
        licenseId,
        ageRating: input.ageRating,
        categoryId: input.categoryId,
        readingMode: input.readingMode,
        approvalStatus: "APPROVED",
        createdById: admin.id,
        genres: input.genreIds?.length
          ? { create: input.genreIds.map((genreId) => ({ genreId })) }
          : undefined,
      },
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "comic.create",
        targetType: "Comic",
        targetId: comic.id,
        metadata: { title: comic.title, licenseId },
      })
    );

    revalidateTag("home-feed", "max");
    revalidatePath("/admin/comics");
    revalidatePath("/app/explore");
    revalidatePath("/app");
    return { success: true, data: { id: comic.id } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "این اسلاگ قبلاً استفاده شده — لطفاً یک اسلاگ دیگر انتخاب کنید" };
    }
    return safeError(err);
  }
}

export async function updateComic(
  comicId: string,
  input: {
    title: string;
    slug: string;
    description: string;
    coverImage: string;
    bannerImage?: string;
    licenseId?: string;
    ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
    categoryId: string;
    readingMode: ReadingMode;
    isFeaturedOnHome: boolean;
    featuredBadge?: string;
    genreIds?: string[];
  }
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (!input.title.trim() || !input.slug.trim() || !input.categoryId) {
      return { success: false, error: "عنوان، اسلاگ و دسته‌بندی الزامی است" };
    }
    if (!SLUG_PATTERN.test(input.slug.trim())) {
      return { success: false, error: "اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، اعداد و خط تیره باشد" };
    }

    if (!input.coverImage || !isAllowedImageUrl(input.coverImage)) {
      return { success: false, error: "تصویر کاور معتبر نیست — از آپلودگر تصویر استفاده کنید" };
    }
    if (input.bannerImage && !isAllowedImageUrl(input.bannerImage)) {
      return { success: false, error: "تصویر بنر معتبر نیست" };
    }

    const existing = await prisma.comic.findUnique({
      where: { id: comicId },
      select: { coverImage: true, licenseId: true, slug: true },
    });
    if (!existing) return { success: false, error: "عنوان یافت نشد" };

    const licenseId = await resolveLicenseId(input.licenseId);

    const targetLicense = await prisma.license.findUnique({
      where: { id: licenseId },
      select: { publisherId: true, status: true },
    });
    if (!targetLicense) return { success: false, error: "لایسنس یافت نشد" };
    if (
      existing.licenseId !== licenseId &&
      (targetLicense.status === LicenseStatus.EXPIRED || targetLicense.status === LicenseStatus.TERMINATED)
    ) {
      return { success: false, error: `امکان اتصال محتوا به لایسنس ${LICENSE_STATUS_LABELS_FA[targetLicense.status]} وجود ندارد` };
    }

    const coverChanged = existing.coverImage !== input.coverImage;
    const dominantColor = coverChanged ? await getDominantColor(input.coverImage) : undefined;

    const comic = await prisma.$transaction(async (tx) => {
      if (input.genreIds) {
        await tx.comicGenre.deleteMany({ where: { comicId } });
        if (input.genreIds.length > 0) {
          await tx.comicGenre.createMany({ data: input.genreIds.map((genreId) => ({ comicId, genreId })) });
        }
      }

      if (existing.licenseId !== licenseId) {
        await tx.edition.updateMany({
          where: { workId: comicId, licenseId: existing.licenseId },
          data: { licenseId, publisherId: targetLicense.publisherId },
        });
      }

      return tx.comic.update({
        where: { id: comicId },
        data: {
          title: input.title.trim(),
          slug: input.slug.trim(),
          description: input.description.trim(),
          coverImage: input.coverImage,
          bannerImage: input.bannerImage || null,
          ...(dominantColor !== undefined ? { dominantColor } : {}),
          licenseId,
          ageRating: input.ageRating,
          categoryId: input.categoryId,
          readingMode: input.readingMode,
          isFeaturedOnHome: input.isFeaturedOnHome,
          featuredBadge: input.featuredBadge?.trim() || null,
        },
      });
    });

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "comic.update",
        targetType: "Comic",
        targetId: comicId,
        metadata: { title: comic.title },
      })
    );

    revalidateTag("home-feed", "max");
    revalidatePath("/admin/comics");
    revalidatePath(`/admin/comics/${comicId}`);
    revalidatePath(`/app/comic/${comic.slug}`);
    if (existing.slug !== comic.slug) revalidatePath(`/app/comic/${existing.slug}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "این اسلاگ قبلاً استفاده شده — لطفاً یک اسلاگ دیگر انتخاب کنید" };
    }
    return safeError(err);
  }
}

export async function updateChapter(
  chapterId: string,
  input: {
    title?: string;
    chapterNumber: number;
    isLocked: boolean;
    accessType?: ChapterAccessType;
  }
): Promise<ActionResult> {
  try {
    if (!Number.isFinite(input.chapterNumber) || input.chapterNumber <= 0) {
      return { success: false, error: "شماره چپتر نامعتبر است" };
    }

    const existing = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { comicId: true } });
    if (!existing) return { success: false, error: "چپتر یافت نشد" };

    const actor = await requireUploadAccess(existing.comicId);

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title: input.title?.trim() || null,
        chapterNumber: input.chapterNumber,
        isLocked: input.isLocked,
        ...(input.accessType ? { accessType: input.accessType } : {}),
      },
      select: { comic: { select: { id: true, slug: true } } },
    });

    after(() =>
      logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: "chapter.update",
        targetType: "Chapter",
        targetId: chapterId,
        metadata: { chapterNumber: input.chapterNumber, isLocked: input.isLocked, accessType: input.accessType },
      })
    );

    revalidatePath(`/admin/comics/${chapter.comic.id}`);
    revalidatePath(`/publisher/comics/${chapter.comic.id}`);
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    invalidateChapterAccessList(chapter.comic.id);
    return { success: true };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { success: false, error: "این شماره چپتر قبلاً برای این نسخه ثبت شده است" };
    }
    return safeError(err);
  }
}

export async function removeChapterPage(chapterId: string, pageIndex: number): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { pages: true, comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    const actor = await requireUploadAccess(chapter.comicId);

    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= chapter.pages.length) {
      return { success: false, error: "صفحه یافت نشد" };
    }

    const removedKey = chapter.pages[pageIndex];
    const nextPages = chapter.pages.filter((_, i) => i !== pageIndex);

    await prisma.chapter.update({ where: { id: chapterId }, data: { pages: nextPages } });
    const { deleteObject } = await import("@/lib/s3");
    await deleteObject(removedKey).catch(() => {});

    after(() =>
      logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: "chapter.pageRemove",
        targetType: "Chapter",
        targetId: chapterId,
        metadata: { pageIndex },
      })
    );

    revalidatePath(`/admin/comics/${chapter.comicId}`);
    revalidatePath(`/publisher/comics/${chapter.comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteComic(comicId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const comic = await prisma.comic.findUnique({
      where: { id: comicId },
      select: {
        title: true,
        slug: true,
        coverImage: true,
        bannerImage: true,
        chapters: { select: { id: true, pages: true, _count: { select: { saleLines: true } } } },
      },
    });
    if (!comic) return { success: false, error: "عنوان یافت نشد" };

    if (comic.chapters.some((chapter) => chapter._count.saleLines > 0)) {
      return {
        success: false,
        error: "این عنوان سابقه‌ی فروش دارد و حذف نمی‌شود — به‌جای حذف، لایسنس یا چپترها را غیرفعال یا قفل کنید",
      };
    }

    const chapterIds = comic.chapters.map((c) => c.id);

    await prisma.$transaction([
      prisma.chapterReadMark.deleteMany({ where: { comicId } }),
      prisma.chapterReaction.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapterUnlock.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.entitlement.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapterStaff.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.comment.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapter.deleteMany({ where: { comicId } }),
      prisma.workEpisode.deleteMany({ where: { workId: comicId } }),
      prisma.comicGenre.deleteMany({ where: { comicId } }),
      prisma.comicStaff.deleteMany({ where: { comicId } }),
      prisma.bookmark.deleteMany({ where: { comicId } }),
      prisma.readHistory.deleteMany({ where: { comicId } }),
      prisma.workRating.deleteMany({ where: { workId: comicId } }),
      prisma.editionRequest.deleteMany({ where: { workId: comicId } }),
      prisma.editionRating.deleteMany({ where: { edition: { workId: comicId } } }),
      prisma.edition.deleteMany({ where: { workId: comicId } }),
      prisma.comic.delete({ where: { id: comicId } }),
    ]);

    try {
      const { deleteObjects, deletePrefix } = await import("@/lib/s3");

      const legacyTargets = [
        ...comic.chapters.flatMap((chapter) => chapter.pages),
        comic.coverImage,
        comic.bannerImage,
      ].filter(
  (key): key is string =>
    typeof key === "string" && !key.startsWith("http://")
);

      await deleteObjects(legacyTargets).catch((err) =>
        console.error("[deleteComic] legacy cleanup failed", err)
      );

      await deletePrefix("public", `public/comics/${comicId}`).catch((err) =>
        console.error("[deleteComic] legacy public cleanup failed", err)
      );

      await deletePrefix("private", `private/comics/${comicId}`).catch((err) =>
        console.error("[deleteComic] private cleanup failed", err)
      );
    } catch (cleanupErr) {
      console.error("[deleteComic] Backblaze cleanup failed", cleanupErr);
    }

    try {
      const { deletePublicObjects, deletePublicPrefix } =
        await import("@/lib/blob");

      await deletePublicObjects([
        comic.coverImage,
        comic.bannerImage,
      ]);

      await deletePublicPrefix(`public/comics/${comicId}`);
    } catch (cleanupErr) {
      console.error("[deleteComic] Vercel Blob cleanup failed", cleanupErr);
    }

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "comic.delete",
        targetType: "Comic",
        targetId: comicId,
        metadata: { title: comic.title, slug: comic.slug },
      })
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

export async function linkPublisherOwner(publisherId: string, telegramUsername: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    if (publisherId === PLATFORM_PUBLISHER_ID) {
      return { success: false, error: "ناشر داخلی پلتفرم قابل اتصال به کاربر نیست" };
    }

    const username = telegramUsername.trim().replace("@", "");
    if (!username) return { success: false, error: "یوزرنیم تلگرام الزامی است" };

    const targetUser = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" }, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    if (!targetUser) {
      return { success: false, error: "کاربری با این یوزرنیم پیدا نشد — باید حداقل یک‌بار مینی‌اپ را باز کرده باشد" };
    }
    if (targetUser.isBanned) {
      return { success: false, error: "این کاربر مسدود است" };
    }

    const publisher = await prisma.publisher.findUnique({
      where: { id: publisherId },
      select: { contractUserId: true },
    });
    if (!publisher) return { success: false, error: "ناشر یافت نشد" };

    const alreadyLinked = await prisma.publisher.findUnique({ where: { contractUserId: targetUser.id } });
    if (alreadyLinked && alreadyLinked.id !== publisherId) {
      return { success: false, error: "این کاربر قبلاً به ناشر دیگری متصل است" };
    }

    const previousOwnerId =
      publisher.contractUserId && publisher.contractUserId !== targetUser.id ? publisher.contractUserId : null;

    await prisma.$transaction(async (tx) => {
      if (previousOwnerId) {
        await tx.publisher.update({ where: { id: publisherId }, data: { contractUserId: null } });
        await demoteFormerOwner(tx, previousOwnerId);
      }
      await tx.publisher.update({ where: { id: publisherId }, data: { contractUserId: targetUser.id } });
      if (targetUser.role !== "ADMIN") {
        await tx.user.update({ where: { id: targetUser.id }, data: { role: "PUBLISHER" } });
      }
    });

    await Promise.all([
      invalidateSessionUserCache(targetUser.id),
      previousOwnerId ? invalidateSessionUserCache(previousOwnerId) : Promise.resolve(),
    ]);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "publisher.linkOwner",
        targetType: "Publisher",
        targetId: publisherId,
        metadata: { userId: targetUser.id, username },
      })
    );

    revalidatePath("/admin/publishers");
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function unlinkPublisherOwner(publisherId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    const publisher = await prisma.publisher.findUnique({
      where: { id: publisherId },
      select: { contractUserId: true },
    });
    if (!publisher) return { success: false, error: "ناشر یافت نشد" };

    const ownerId = publisher.contractUserId;

    await prisma.$transaction(async (tx) => {
      await tx.publisher.update({ where: { id: publisherId }, data: { contractUserId: null } });
      if (ownerId) {
        await demoteFormerOwner(tx, ownerId);
      }
    });

    if (ownerId) await invalidateSessionUserCache(ownerId);

    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "publisher.unlinkOwner",
        targetType: "Publisher",
        targetId: publisherId,
      })
    );

    revalidatePath("/admin/publishers");
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function bulkUpdateChapterAccessType(
  chapterIds: string[],
  accessType: ChapterAccessType
): Promise<ActionResult<{ updated: number }>> {
  try {
    if (chapterIds.length === 0) return { success: false, error: "چپتری انتخاب نشده" };
    if (!Object.values(ChapterAccessType).includes(accessType)) {
      return { success: false, error: "نوع دسترسی نامعتبر است" };
    }

    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: { id: true, comicId: true },
    });
    if (chapters.length === 0) return { success: false, error: "چپتری یافت نشد" };

    const comicIds = [...new Set(chapters.map((c) => c.comicId))];
    const actors = await Promise.all(comicIds.map((comicId) => requireUploadAccess(comicId)));
    const actor = actors[0];

    const result = await prisma.chapter.updateMany({
      where: { id: { in: chapters.map((c) => c.id) } },
      data: { accessType },
    });

    after(() =>
      logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: "chapter.bulkAccessTypeChange",
        targetType: "Chapter",
        metadata: { chapterIds, accessType, updated: result.count },
      })
    );

    for (const comicId of comicIds) {
      revalidatePath(`/admin/comics/${comicId}`);
      revalidatePath(`/publisher/comics/${comicId}`);
      invalidateChapterAccessList(comicId);
    }
    return { success: true, data: { updated: result.count } };
  } catch (err) {
    return safeError(err);
  }
}