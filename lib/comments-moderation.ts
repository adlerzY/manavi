import { prisma } from "./prisma";
import type { CommentStatus, Prisma } from "@prisma/client";

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
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function searchComments(
  params: SearchCommentsParams
): Promise<{ comments: ModeratedCommentRow[]; total: number }> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const q = params.q?.trim().slice(0, 100);

  const where: Prisma.CommentWhereInput = {
    status: params.status,
    chapter: {
      comicId: params.comicId,
      ...(params.publisherId ? { edition: { publisherId: params.publisherId } } : {}),
    },
    ...(q
      ? {
          OR: [
            { content: { contains: q, mode: "insensitive" } },
            {
              user: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { username: { contains: q, mode: "insensitive" } },
                ],
              },
            },
          ],
        }
      : {}),
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