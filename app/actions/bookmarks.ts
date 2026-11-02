"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";

async function requireActiveUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  if (user.isBanned) throw new Error("Account is banned");
  const allowed = await checkRateLimit(`bookmark:${user.id}`, 40);
  if (!allowed) throw new Error("Too many requests");
  return user;
}

export async function toggleBookmark(comicId: string): Promise<{ bookmarked: boolean }> {
  const user = await requireActiveUser();

  const removed = await prisma.bookmark.deleteMany({ where: { userId: user.id, comicId } });
  if (removed.count > 0) return { bookmarked: false };

  await prisma.bookmark.upsert({
    where: { userId_comicId: { userId: user.id, comicId } },
    update: {},
    create: { userId: user.id, comicId },
  });
  return { bookmarked: true };
}

export async function toggleBookmarkNotify(comicId: string): Promise<{ notify: boolean }> {
  const user = await requireActiveUser();

  const bookmark = await prisma.bookmark.findUnique({ where: { userId_comicId: { userId: user.id, comicId } } });
  if (!bookmark) throw new Error("Bookmark not found");

  const updated = await prisma.bookmark.update({
    where: { userId_comicId: { userId: user.id, comicId } },
    data: { notifyOnNewChapter: !bookmark.notifyOnNewChapter },
  });

  return { notify: updated.notifyOnNewChapter };
}