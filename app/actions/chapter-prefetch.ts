"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getSignedImageUrls } from "@/lib/s3";
import { userHasChapterAccess } from "@/lib/chapters";
import { isLicenseCurrentlyActive } from "@/lib/license";

const PREFETCH_PAGE_COUNT = 3;

export async function getChapterPrefetchUrls(chapterId: string): Promise<string[]> {
  const user = await getSessionUser();
  if (user?.isBanned) return [];

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      pages: true,
      publishedAt: true,
      accessType: true,
      comic: {
        select: {
          ageRating: true,
          approvalStatus: true,
          createdById: true,
          license: {
            select: { status: true, terminatedAt: true, startDate: true, endDate: true },
          },
        },
      },
    },
  });

  if (!chapter || !chapter.publishedAt || chapter.pages.length === 0) return [];
  if (!isLicenseCurrentlyActive(chapter.comic.license)) return [];

  if (chapter.comic.approvalStatus !== "APPROVED") {
    const isPrivileged = user?.role === "ADMIN" || user?.id === chapter.comic.createdById;
    if (!isPrivileged) return [];
  }

  if (chapter.comic.ageRating !== "NORMAL" && !user?.isAgeVerified) return [];

  const hasAccess = await userHasChapterAccess(user?.id ?? null, chapterId, user?.role);
  if (!hasAccess) return [];

  return getSignedImageUrls(chapter.pages.slice(0, PREFETCH_PAGE_COUNT), undefined, { width: 960 });
}