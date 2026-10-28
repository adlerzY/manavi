"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";

interface CreateCommentInput {
  chapterId: string;
  content: string;
  isSpoiler: boolean;
}

interface CreateCommentResult {
  success: boolean;
  error?: string;
  comment?: {
    id: string;
    content: string;
    isSpoiler: boolean;
    createdAt: string;
    user: { firstName: string; lastName: string | null; username: string | null };
  };
}

export async function createComment(input: CreateCommentInput): Promise<CreateCommentResult> {
  const user = await getSessionUser();
  if (!user) {
    return { success: false, error: "برای ارسال نظر باید وارد شوید" };
  }
  if (user.isBanned) {
    return { success: false, error: "حساب شما مسدود شده است" };
  }

  const allowed = await checkRateLimit(`comment:${user.id}`, 10);
  if (!allowed) {
    return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };
  }

  const content = input.content.trim();
  if (!content) {
    return { success: false, error: "متن نظر خالی است" };
  }
  if (content.length > 2000) {
    return { success: false, error: "متن نظر بیش از حد طولانی است" };
  }

  const chapter = await prisma.chapter.findUnique({
    where: { id: input.chapterId },
    select: { publishedAt: true, isLocked: true },
  });
  if (!chapter || !chapter.publishedAt || chapter.isLocked) {
    return { success: false, error: "چپتر یافت نشد" };
  }

  const comment = await prisma.comment.create({
    data: { chapterId: input.chapterId, userId: user.id, content, isSpoiler: Boolean(input.isSpoiler) },
    select: { id: true, content: true, isSpoiler: true, createdAt: true, user: { select: { firstName: true, lastName: true, username: true } } },
  });

  return { success: true, comment: { ...comment, createdAt: comment.createdAt.toISOString() } };
}