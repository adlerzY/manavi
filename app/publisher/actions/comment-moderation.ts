"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getPublisherContext } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { searchComments, type SearchCommentsParams, type ModeratedCommentRow } from "@/lib/comments-moderation";
import type { CommentStatus } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

async function requirePublisherAccess(requireManage: boolean): Promise<{ userId: string; publisherId: string }> {
  const user = await getSessionUser();
  if (!user) throw new Error("دسترسی غیرمجاز");
  if (user.isBanned) throw new Error("حساب شما مسدود شده است");
  const context = await getPublisherContext(user);
  if (!context) throw new Error("دسترسی غیرمجاز");
  if (requireManage && !context.isOwner && !context.canManageComics) throw new Error("دسترسی غیرمجاز");
  return { userId: user.id, publisherId: context.publisherId };
}

async function assertCommentBelongsToPublisher(commentId: string, publisherId: string): Promise<string> {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { chapterId: true, chapter: { select: { edition: { select: { publisherId: true } } } } },
  });
  if (!comment || comment.chapter.edition.publisherId !== publisherId) {
    throw new Error("این نظر متعلق به آثار شما نیست");
  }
  return comment.chapterId;
}

export async function listCommentsPublisher(
  params: Omit<SearchCommentsParams, "publisherId">
): Promise<{ comments: ModeratedCommentRow[]; total: number }> {
  const { publisherId } = await requirePublisherAccess(false);
  return searchComments({ ...params, publisherId });
}

export async function setCommentStatusPublisher(commentId: string, status: CommentStatus): Promise<ActionResult> {
  try {
    const { userId, publisherId } = await requirePublisherAccess(true);
    const chapterId = await assertCommentBelongsToPublisher(commentId, publisherId);

    await prisma.comment.update({
      where: { id: commentId },
      data: { status, moderatedById: userId, moderatedAt: new Date() },
    });
    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/publisher/comments");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function updateCommentContentPublisher(commentId: string, content: string): Promise<ActionResult> {
  try {
    const { publisherId } = await requirePublisherAccess(true);
    const chapterId = await assertCommentBelongsToPublisher(commentId, publisherId);

    const trimmed = content.trim();
    if (!trimmed) return { success: false, error: "متن نظر نمی‌تواند خالی باشد" };
    if (trimmed.length > 2000) return { success: false, error: "متن نظر بیش از حد طولانی است" };

    await prisma.comment.update({ where: { id: commentId }, data: { content: trimmed, editedAt: new Date() } });
    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/publisher/comments");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteCommentPublisher(commentId: string): Promise<ActionResult> {
  try {
    const { publisherId } = await requirePublisherAccess(true);
    const chapterId = await assertCommentBelongsToPublisher(commentId, publisherId);

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { parentId: commentId } }),
      prisma.comment.delete({ where: { id: commentId } }),
    ]);

    revalidatePath(`/app/read/${chapterId}`);
    revalidatePath("/publisher/comments");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}