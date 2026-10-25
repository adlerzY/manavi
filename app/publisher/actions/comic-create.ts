"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext, requireComicManageAccess } from "@/lib/auth";
import { isLicenseCurrentlyActive } from "@/lib/license";
import { resolveComicApprovalStatus } from "@/lib/comic-approval";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { isAllowedImageUrl } from "@/lib/image-url";
import type { ReadingMode } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const SLUG_PATTERN = /^[a-z0-9-]+$/;

async function getDominantColor(imageUrl: string): Promise<string | null> {
  const { extractDominantColor } = await import("@/lib/color");
  return extractDominantColor(imageUrl);
}

export async function createComicAsPublisher(input: {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  bannerImage?: string;
  ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
  categoryId: string;
  readingMode: ReadingMode;
  genreIds?: string[];
}): Promise<ActionResult<{ id: string; approvalStatus: string }>> {
  try {
    const user = await getSessionUser();
    const context = await getPublisherContext(user);
    if (!user || !context) return { success: false, error: "دسترسی غیرمجاز" };

    await requireComicManageAccess(context.publisherId);

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

    const licenses = await prisma.license.findMany({
      where: { publisherId: context.publisherId },
      orderBy: { createdAt: "desc" },
    });
    const license = licenses.find((candidate) => isLicenseCurrentlyActive(candidate));
    if (!license) {
      return { success: false, error: "لایسنس فعالی برای این ناشر یافت نشد — با پشتیبانی تماس بگیرید" };
    }

    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category || !category.isActive) {
      return { success: false, error: "دسته‌بندی انتخاب‌شده معتبر نیست" };
    }

    const approvalStatus = await resolveComicApprovalStatus(user.id, context.publisherId);
    const dominantColor = await getDominantColor(input.coverImage);

    const comic = await prisma.comic.create({
      data: {
        title: input.title.trim(),
        slug: input.slug.trim(),
        description: input.description.trim(),
        coverImage: input.coverImage,
        bannerImage: input.bannerImage || null,
        dominantColor,
        licenseId: license.id,
        ageRating: input.ageRating,
        categoryId: input.categoryId,
        readingMode: input.readingMode,
        approvalStatus,
        createdById: user.id,
        genres: input.genreIds?.length
          ? { create: input.genreIds.map((genreId) => ({ genreId })) }
          : undefined,
      },
    });

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "comic.create",
        targetType: "Comic",
        targetId: comic.id,
        metadata: { approvalStatus },
      })
    );

    if (approvalStatus === "APPROVED") {
      revalidateTag("home-feed", "max");
      revalidatePath("/app/explore");
      revalidatePath("/app");
    }
    revalidatePath("/publisher/comics");
    revalidatePath("/admin/chapter-approvals");

    return { success: true, data: { id: comic.id, approvalStatus } };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") {
      return { success: false, error: "این اسلاگ قبلاً استفاده شده — یک اسلاگ دیگر انتخاب کنید" };
    }
    return safeError(err);
  }
}