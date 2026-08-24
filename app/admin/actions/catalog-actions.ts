"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireUploadAccess } from "@/lib/auth";
import { deleteObject, deleteObjects } from "@/lib/s3";
import { extractDominantColor } from "@/lib/color";
import { safeError } from "@/lib/errors";
import { isAllowedImageUrl } from "@/lib/image-url";
import { LicenseStatus, ChapterAccessType } from "@prisma/client";
import type { ReadingMode } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function createPublisher(input: {
  name: string;
  legalEntity?: string;
  contactEmail: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();

    if (!input.name.trim() || !input.contactEmail.trim()) {
      return { success: false, error: "نام و ایمیل ارتباطی الزامی است" };
    }

    const publisher = await prisma.publisher.create({
      data: {
        name: input.name.trim(),
        legalEntity: input.legalEntity?.trim() || null,
        contactEmail: input.contactEmail.trim(),
      },
    });

    revalidatePath("/admin/publishers");
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
    await requireAdmin();

    if (!input.publisherId) {
      return { success: false, error: "انتخاب ناشر الزامی است" };
    }
    if (input.territory.length === 0) {
      return { success: false, error: "حداقل یک قلمرو باید مشخص شود" };
    }
    if (input.royaltyPercentage < 0 || input.royaltyPercentage > 100) {
      return { success: false, error: "درصد رویالتی باید بین ۰ تا ۱۰۰ باشد" };
    }

    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;
    if (endDate && endDate <= startDate) {
      return { success: false, error: "تاریخ پایان باید بعد از تاریخ شروع باشد" };
    }

    const license = await prisma.license.create({
      data: {
        publisherId: input.publisherId,
        territory: input.territory,
        royaltyPercentage: input.royaltyPercentage,
        startDate,
        endDate,
        contractReference: input.contractReference?.trim() || null,
        status: LicenseStatus.PENDING,
      },
    });

    revalidatePath("/admin/licenses");
    return { success: true, data: { id: license.id } };
  } catch (err) {
    return safeError(err);
  }
}

export async function activateLicense(licenseId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.license.update({
      where: { id: licenseId },
      data: { status: LicenseStatus.ACTIVE },
    });
    revalidatePath("/admin/licenses");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function terminateLicense(licenseId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.license.update({
      where: { id: licenseId },
      data: { status: LicenseStatus.TERMINATED, terminatedAt: new Date() },
    });
    revalidatePath("/admin/licenses");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function createComic(input: {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  bannerImage?: string;
  licenseId: string;
  ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
  categoryId: string;
  readingMode: ReadingMode;
  genreIds?: string[];
}): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();

    if (!input.title.trim() || !input.slug.trim() || !input.licenseId || !input.categoryId) {
      return { success: false, error: "Title, slug, license, and category are required" };
    }

    if (!input.coverImage || !isAllowedImageUrl(input.coverImage)) {
      return { success: false, error: "تصویر کاور معتبر نیست — از آپلودگر تصویر استفاده کنید" };
    }
    if (input.bannerImage && !isAllowedImageUrl(input.bannerImage)) {
      return { success: false, error: "تصویر بنر معتبر نیست" };
    }

    const [license, category] = await Promise.all([
      prisma.license.findUnique({ where: { id: input.licenseId } }),
      prisma.category.findUnique({ where: { id: input.categoryId } }),
    ]);
    if (!license) {
      return { success: false, error: "License not found" };
    }
    if (license.status === LicenseStatus.EXPIRED || license.status === LicenseStatus.TERMINATED) {
      return { success: false, error: `Cannot attach content to a ${license.status.toLowerCase()} license` };
    }
    if (!category || !category.isActive) {
      return { success: false, error: "دسته‌بندی انتخاب‌شده معتبر نیست" };
    }

    const dominantColor = await extractDominantColor(input.coverImage);

    const comic = await prisma.comic.create({
      data: {
        title: input.title.trim(),
        slug: input.slug.trim(),
        description: input.description.trim(),
        coverImage: input.coverImage,
        bannerImage: input.bannerImage || null,
        dominantColor,
        licenseId: input.licenseId,
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

    revalidateTag("home-feed", "max");
    revalidatePath("/admin/comics");
    revalidatePath("/app/explore");
    revalidatePath("/app");
    return { success: true, data: { id: comic.id } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
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
    licenseId: string;
    ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
    categoryId: string;
    readingMode: ReadingMode;
    isFeaturedOnHome: boolean;
    featuredBadge?: string;
    genreIds?: string[];
  }
): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!input.title.trim() || !input.slug.trim() || !input.licenseId || !input.categoryId) {
      return { success: false, error: "عنوان، اسلاگ، لایسنس و دسته‌بندی الزامی است" };
    }

    if (!input.coverImage || !isAllowedImageUrl(input.coverImage)) {
      return { success: false, error: "تصویر کاور معتبر نیست — از آپلودگر تصویر استفاده کنید" };
    }
    if (input.bannerImage && !isAllowedImageUrl(input.bannerImage)) {
      return { success: false, error: "تصویر بنر معتبر نیست" };
    }

    const existing = await prisma.comic.findUnique({ where: { id: comicId }, select: { coverImage: true } });
    if (!existing) return { success: false, error: "عنوان یافت نشد" };

    const coverChanged = existing.coverImage !== input.coverImage;
    const dominantColor = coverChanged ? await extractDominantColor(input.coverImage) : undefined;

    const comic = await prisma.$transaction(async (tx) => {
      if (input.genreIds) {
        await tx.comicGenre.deleteMany({ where: { comicId } });
        if (input.genreIds.length > 0) {
          await tx.comicGenre.createMany({ data: input.genreIds.map((genreId) => ({ comicId, genreId })) });
        }
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
          licenseId: input.licenseId,
          ageRating: input.ageRating,
          categoryId: input.categoryId,
          readingMode: input.readingMode,
          isFeaturedOnHome: input.isFeaturedOnHome,
          featuredBadge: input.featuredBadge?.trim() || null,
        },
      });
    });

    revalidateTag("home-feed", "max");
    revalidatePath("/admin/comics");
    revalidatePath(`/admin/comics/${comicId}`);
    revalidatePath(`/app/comic/${comic.slug}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    return { success: true };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
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

    await requireUploadAccess(existing.comicId);

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

    revalidatePath(`/admin/comics/${chapter.comic.id}`);
    revalidatePath(`/publisher/comics/${chapter.comic.id}`);
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function removeChapterPage(chapterId: string, pageIndex: number): Promise<ActionResult> {
  try {
    const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { pages: true, comicId: true } });
    if (!chapter) return { success: false, error: "چپتر یافت نشد" };

    await requireUploadAccess(chapter.comicId);

    if (pageIndex < 0 || pageIndex >= chapter.pages.length) {
      return { success: false, error: "صفحه یافت نشد" };
    }

    const removedKey = chapter.pages[pageIndex];
    const nextPages = chapter.pages.filter((_, i) => i !== pageIndex);

    await prisma.chapter.update({ where: { id: chapterId }, data: { pages: nextPages } });
    await deleteObject(removedKey).catch(() => {});

    revalidatePath(`/admin/comics/${chapter.comicId}`);
    revalidatePath(`/publisher/comics/${chapter.comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteComic(comicId: string): Promise<ActionResult> {
  try {
    await requireAdmin();

    const comic = await prisma.comic.findUnique({
      where: { id: comicId },
      select: {
        slug: true,
        chapters: { select: { id: true, pages: true } },
      },
    });
    if (!comic) return { success: false, error: "عنوان یافت نشد" };

    const chapterIds = comic.chapters.map((c) => c.id);

    await prisma.$transaction([
      prisma.chapterReadMark.deleteMany({ where: { comicId } }),
      prisma.chapterReaction.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapterUnlock.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapterStaff.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.comment.deleteMany({ where: { chapterId: { in: chapterIds } } }),
      prisma.chapter.deleteMany({ where: { comicId } }),
      prisma.comicGenre.deleteMany({ where: { comicId } }),
      prisma.comicStaff.deleteMany({ where: { comicId } }),
      prisma.bookmark.deleteMany({ where: { comicId } }),
      prisma.readHistory.deleteMany({ where: { comicId } }),
      prisma.comic.delete({ where: { id: comicId } }),
    ]);

    const keysToDelete = comic.chapters
      .flatMap((c) => c.pages)
      .filter((key): key is string => Boolean(key) && !key.startsWith("http://") && !key.startsWith("https://"));
    await deleteObjects(keysToDelete).catch(() => {});

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
    await requireAdmin();

    const username = telegramUsername.trim().replace("@", "");
    if (!username) return { success: false, error: "یوزرنیم تلگرام الزامی است" };

    const targetUser = await prisma.user.findFirst({ where: { username } });
    if (!targetUser) {
      return { success: false, error: "کاربری با این یوزرنیم پیدا نشد — باید حداقل یک‌بار مینی‌اپ را باز کرده باشد" };
    }

    const alreadyLinked = await prisma.publisher.findUnique({ where: { contractUserId: targetUser.id } });
    if (alreadyLinked && alreadyLinked.id !== publisherId) {
      return { success: false, error: "این کاربر قبلاً به ناشر دیگری متصل است" };
    }

    await prisma.$transaction([
      prisma.publisher.update({ where: { id: publisherId }, data: { contractUserId: targetUser.id } }),
      prisma.user.update({ where: { id: targetUser.id }, data: { role: "PUBLISHER" } }),
    ]);

    revalidatePath("/admin/publishers");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function unlinkPublisherOwner(publisherId: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.publisher.update({ where: { id: publisherId }, data: { contractUserId: null } });
    revalidatePath("/admin/publishers");
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

    const chapters = await prisma.chapter.findMany({
      where: { id: { in: chapterIds } },
      select: { id: true, comicId: true },
    });
    if (chapters.length === 0) return { success: false, error: "چپتری یافت نشد" };

    const comicIds = [...new Set(chapters.map((c) => c.comicId))];
    await Promise.all(comicIds.map((comicId) => requireUploadAccess(comicId)));

    const result = await prisma.chapter.updateMany({
      where: { id: { in: chapterIds } },
      data: { accessType },
    });

    for (const comicId of comicIds) {
      revalidatePath(`/admin/comics/${comicId}`);
      revalidatePath(`/publisher/comics/${comicId}`);
    }
    return { success: true, data: { updated: result.count } };
  } catch (err) {
    return safeError(err);
  }
}