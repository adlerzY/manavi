"use server";

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getSignedImageUrls } from "@/lib/s3";
import { userHasChapterAccess } from "@/lib/chapters";
import { isLicenseCurrentlyActive } from "@/lib/license";
import { checkRateLimit } from "@/lib/moderation";

const PREFETCH_PAGE_COUNT = 3;
const CHAPTER_PREFETCH_RATE_LIMIT = 20;

export async function getChapterPrefetchUrls(chapterId: string): Promise<string[]> {
  const user = await getSessionUser();
  if (user?.isBanned) return [];

  const rateLimitKey = user
    ? `chapter-read:${user.id}`
    : `chapter-read:ip:${(await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`;
  const withinRateLimit = user?.role === "ADMIN" ? true : await checkRateLimit(rateLimitKey, CHAPTER_PREFETCH_RATE_LIMIT);
  if (!withinRateLimit) return [];

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: {
      pages: true,
      publishedAt: true,
      accessType: true,
      isLocked: true,
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
  if (chapter.isLocked && user?.role !== "ADMIN") return [];
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