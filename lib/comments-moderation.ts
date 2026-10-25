import { prisma } from "./prisma";
import type { CommentStatus } from "@prisma/client";

export interface ModeratedCommentRow {
  id: string;
  content: string;
  isSpoiler: boolean;
  isStaffReply: boolean;
  status: CommentStatus;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  user: { firstName: string; lastName: string | null; username: string | null };
  chapter: { id: string; chapterNumber: number; comic: { id: string; title: string; slug: string } };
}

export interface SearchCommentsParams {
  publisherId?: string;
  comicId?: string;
  status?: CommentStatus;
  page?: number;
  pageSize?: number;
}

export async function searchComments(
  params: SearchCommentsParams
): Promise<{ comments: ModeratedCommentRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));

  const where = {
    status: params.status,
    chapter: {
      comicId: params.comicId,
      ...(params.publisherId ? { edition: { publisherId: params.publisherId } } : {}),
    },
  };

  const [rows, total] = await Promise.all([
    prisma.comment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        content: true,
        isSpoiler: true,
        isStaffReply: true,
        status: true,
        createdAt: true,
        editedAt: true,
        parentId: true,
        user: { select: { firstName: true, lastName: true, username: true } },
        chapter: { select: { id: true, chapterNumber: true, comic: { select: { id: true, title: true, slug: true } } } },
      },
    }),
    prisma.comment.count({ where }),
  ]);

  return {
    comments: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      editedAt: r.editedAt ? r.editedAt.toISOString() : null,
    })),
    total,
  };
}