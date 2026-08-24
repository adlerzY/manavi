"use server";

import { cookies } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/session";
import { getUploaderVerification } from "@/lib/auth";
import { assertLicenseActive, LicenseInactiveError } from "@/lib/license";
import { notifyNewChapter } from "@/lib/telegram-bot";
import { invalidateChapterAccessList } from "@/lib/chapters";
import { safeError } from "@/lib/errors";

interface PublishChapterResult {
  success: boolean;
  error?: string;
  data?: { status: "PUBLISHED" | "PENDING_APPROVAL" };
}

async function requirePublishAccess(comicId: string): Promise<{ userId: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) {
    throw new Error("Not authenticated");
  }

  const session = verifySessionToken(token);
  if (!session) {
    throw new Error("Invalid or expired session");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { publisherProfile: true },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role === "ADMIN") {
    return { userId: user.id };
  }

  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { license: { select: { publisherId: true } } },
  });
  if (!comic) {
    throw new Error("Comic not found");
  }

  if (user.role === "PUBLISHER" && user.publisherProfile?.id === comic.license.publisherId) {
    return { userId: user.id };
  }

  const staffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId: comic.license.publisherId, canUpload: true },
  });
  if (staffLink) {
    return { userId: user.id };
  }

  throw new Error("Not authorized to publish this chapter");
}

export async function publishChapter(chapterId: string): Promise<PublishChapterResult> {
  try {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        chapterNumber: true,
        publishedAt: true,
        status: true,
        comic: { select: { id: true, slug: true, title: true } },
      },
    });

    if (!chapter) {
      return { success: false, error: "چپتر یافت نشد" };
    }

    const { userId } = await requirePublishAccess(chapter.comic.id);
    await assertLicenseActive(chapter.comic.id);

    if (chapter.status === "PENDING_APPROVAL") {
      return { success: false, error: "این چپتر در انتظار تایید ادمین است" };
    }
    if (chapter.publishedAt) {
      return { success: false, error: "این چپتر قبلاً منتشر شده است" };
    }

    const isVerified = await getUploaderVerification(userId, chapter.comic.id);

    if (!isVerified) {
      const updated = await prisma.chapter.updateMany({
        where: { id: chapterId, publishedAt: null },
        data: { status: "PENDING_APPROVAL", scheduledAt: null },
      });
      if (updated.count === 0) {
        return { success: false, error: "این چپتر قبلاً منتشر شده است" };
      }
      revalidatePath("/admin/comics");
      revalidatePath("/publisher/comics");
      revalidatePath("/admin/chapter-approvals");
      revalidateTag("home-feed", "default");
      return { success: true, data: { status: "PENDING_APPROVAL" } };
    }

    const updated = await prisma.chapter.updateMany({
      where: { id: chapterId, publishedAt: null },
      data: { publishedAt: new Date(), status: "PUBLISHED", scheduledAt: null },
    });

    if (updated.count === 0) {
      return { success: false, error: "این چپتر قبلاً منتشر شده است" };
    }

    revalidateTag("home-feed", "default");
    revalidatePath(`/app/comic/${chapter.comic.slug}`);
    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/app");
    revalidatePath("/app/explore");
    invalidateChapterAccessList(chapter.comic.id);

    const bookmarks = await prisma.bookmark.findMany({
      where: { comicId: chapter.comic.id, notifyOnNewChapter: true },
      select: { user: { select: { telegramId: true } } },
    });

    if (bookmarks.length > 0) {
      const telegramIds = bookmarks.map((b) => b.user.telegramId);
      after(() =>
        notifyNewChapter({
          telegramIds,
          comicTitle: chapter.comic.title,
          comicSlug: chapter.comic.slug,
          chapterNumber: chapter.chapterNumber,
          chapterId,
        }).catch(() => {})
      );
    }

    return { success: true, data: { status: "PUBLISHED" } };
  } catch (err) {
    if (err instanceof LicenseInactiveError) {
      return { success: false, error: `انتشار ممکن نیست: ${err.reason}` };
    }
    return safeError(err);
  }
}