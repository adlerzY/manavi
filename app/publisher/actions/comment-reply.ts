"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { createNotifications } from "@/lib/notifications";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function replyToComment(commentId: string, content: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return { success: false, error: "برای پاسخ باید وارد شوید" };
    }
    if (user.isBanned) {
      return { success: false, error: "حساب شما مسدود شده است" };
    }

    const allowed = await checkRateLimit(`comment-reply:${user.id}`, 10);
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

    const parent = await prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        userId: true,
        chapterId: true,
        parentId: true,
        chapter: {
          select: {
            chapterNumber: true,
            comic: { select: { title: true } },
            edition: { select: { publisherId: true } },
          },
        },
      },
    });
    if (!parent) return { success: false, error: "نظر یافت نشد" };

    const publisherId = parent.chapter.edition.publisherId;

    let isStaff = user.role === "ADMIN";
    if (!isStaff && user.publisherProfile) {
      isStaff = user.publisherProfile.id === publisherId;
    }
    if (!isStaff) {
      const staffLink = await prisma.publisherStaff.findFirst({ where: { userId: user.id, publisherId } });
      isStaff = Boolean(staffLink);
    }
    if (!isStaff) {
      return { success: false, error: "دسترسی غیرمجاز" };
    }

    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: "متن پاسخ خالی است" };
    if (trimmed.length > 2000) return { success: false, error: "متن پاسخ بیش از حد طولانی است" };

    const reply = await prisma.comment.create({
      data: {
        chapterId: parent.chapterId,
        userId: user.id,
        content: trimmed,
        parentId: parent.parentId ?? commentId,
        isStaffReply: true,
      },
      select: { id: true },
    });

    if (parent.userId !== user.id) {
      const recipientId = parent.userId;
      const chapterId = parent.chapterId;
      const label = `${parent.chapter.comic.title} — چپتر ${parent.chapter.chapterNumber.toLocaleString("fa-IR")}`;
      after(() =>
        createNotifications([
          {
            userId: recipientId,
            type: "COMMENT_REPLY",
            title: "تیم به نظر شما پاسخ داد",
            body: `${label}: ${trimmed.slice(0, 120)}`,
            href: `/app/read/${chapterId}`,
            dedupeKey: `comment-reply:${reply.id}`,
          },
        ])
      );
    }

    revalidatePath(`/app/read/${parent.chapterId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}