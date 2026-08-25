"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeError } from "@/lib/errors";
import { getSessionUser } from "@/lib/auth";

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

    const parent = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { chapterId: true, chapter: { select: { comic: { select: { id: true, licenseId: true } } } } },
    });
    if (!parent) return { success: false, error: "نظر یافت نشد" };

    const license = await prisma.license.findUnique({ where: { id: parent.chapter.comic.licenseId }, select: { publisherId: true } });

    let isStaff = user.role === "ADMIN";
    if (!isStaff && user.publisherProfile) {
      isStaff = license?.publisherId === user.publisherProfile.id;
    }
    if (!isStaff && license) {
      const staffLink = await prisma.publisherStaff.findFirst({ where: { userId: user.id, publisherId: license.publisherId } });
      isStaff = Boolean(staffLink);
    }
    if (!isStaff) {
      return { success: false, error: "دسترسی غیرمجاز" };
    }

    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: "متن پاسخ خالی است" };

    await prisma.comment.create({
      data: { chapterId: parent.chapterId, userId: user.id, content: trimmed, parentId: commentId, isStaffReply: true },
    });

    revalidatePath(`/app/read/${parent.chapterId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}