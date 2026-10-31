import { prisma } from "@/lib/prisma";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { CommentSection } from "./comment-section";

async function resolveCanReply(user: SessionUser | null, publisherId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.publisherProfile?.id === publisherId) return true;

  const staffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId },
    select: { id: true },
  });
  return Boolean(staffLink);
}

export async function ChapterComments({ chapterId, publisherId }: { chapterId: string; publisherId: string }) {
  const user = await getSessionUser();

  const [comments, canReply] = await Promise.all([
    prisma.comment.findMany({
      where: { chapterId, parentId: null, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        content: true,
        isSpoiler: true,
        isStaffReply: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, username: true, activeTitle: true } },
        replies: {
          where: { status: "APPROVED" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            isSpoiler: true,
            isStaffReply: true,
            createdAt: true,
            user: { select: { firstName: true, lastName: true, username: true, activeTitle: true } },
          },
        },
      },
    }),
    resolveCanReply(user, publisherId),
  ]);

  return (
    <CommentSection
      chapterId={chapterId}
      initialComments={comments.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        replies: c.replies.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      }))}
      canReply={canReply}
    />
  );
}