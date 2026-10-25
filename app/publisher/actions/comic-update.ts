"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireComicManageAccessByComicId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { isAllowedImageUrl } from "@/lib/image-url";
import type { ReadingMode } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

async function getDominantColor(imageUrl: string): Promise<string | null> {
  const { extractDominantColor } = await import("@/lib/color");
  return extractDominantColor(imageUrl);
}

export async function updateComicAsPublisher(
  comicId: string,
  input: {
    title: string;
    description: string;
    coverImage: string;
    bannerImage?: string;
    ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
    readingMode: ReadingMode;
    genreIds?: string[];
  }
): Promise<ActionResult> {
  try {
    await requireComicManageAccessByComicId(comicId);

    if (!input.title.trim() || !input.description.trim()) {
      return { success: false, error: "عنوان و توضیحات الزامی است" };
    }

    if (!input.coverImage || !isAllowedImageUrl(input.coverImage)) {
      return { success: false, error: "تصویر کاور معتبر نیست — از آپلودگر تصویر استفاده کنید" };
    }
    if (input.bannerImage && !isAllowedImageUrl(input.bannerImage)) {
      return { success: false, error: "تصویر بنر معتبر نیست" };
    }

    const existing = await prisma.comic.findUnique({
      where: { id: comicId },
      select: { coverImage: true, approvalStatus: true },
    });
    if (!existing) return { success: false, error: "عنوان یافت نشد" };

    const coverChanged = existing.coverImage !== input.coverImage;
    const dominantColor = coverChanged ? await getDominantColor(input.coverImage) : undefined;
    const nextApprovalStatus = existing.approvalStatus === "NEEDS_CHANGES" ? "PENDING_APPROVAL" : undefined;

    const comic = await prisma.$transaction(async (tx) => {
      if (input.genreIds) {
        await tx.comicGenre.deleteMany({ where: { comicId } });
        if (input.genreIds.length > 0) {
          await tx.comicGenre.createMany({
            data: input.genreIds.map((genreId) => ({ comicId, genreId })),
          });
        }
      }
      return tx.comic.update({
        where: { id: comicId },
        data: {
          title: input.title.trim(),
          description: input.description.trim(),
          coverImage: input.coverImage,
          bannerImage: input.bannerImage || null,
          ...(dominantColor !== undefined ? { dominantColor } : {}),
          ageRating: input.ageRating,
          readingMode: input.readingMode,
          ...(nextApprovalStatus
            ? { approvalStatus: nextApprovalStatus, rejectionNote: null }
            : {}),
        },
      });
    });

    if (comic.approvalStatus === "APPROVED") {
      revalidateTag("home-feed", "max");
      revalidatePath("/app");
      revalidatePath("/app/explore");
    }
    revalidatePath(`/app/comic/${comic.slug}`);
    revalidatePath("/publisher/comics");
    revalidatePath(`/publisher/comics/${comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}