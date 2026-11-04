import "server-only";
import { Prisma } from "@prisma/client";
import type { GiftAudience } from "@prisma/client";
import { prisma } from "./prisma";

export const MAX_GIFT_RECIPIENTS = 2000;
export const MAX_GIFT_ROWS = 400_000;

export class GiftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GiftError";
  }
}

export function parseUsernames(raw: string): string[] {
  const names = raw
    .split(/[\s,;،]+/)
    .map((item) => item.trim().replace(/^@/, "").toLowerCase())
    .filter((item) => /^[a-z0-9_]{3,64}$/.test(item));
  return [...new Set(names)];
}

export async function resolveGiftRecipients(input: {
  audience: GiftAudience;
  usernames?: string;
  refId?: string | null;
}): Promise<string[]> {
  if (input.audience === "USERS") {
    const names = parseUsernames(input.usernames ?? "").slice(0, MAX_GIFT_RECIPIENTS + 1);
    if (names.length === 0) return [];
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User"
      WHERE "deletedAt" IS NULL AND "isBanned" = false AND lower("username") IN (${Prisma.join(names)})`;
    return rows.map((row) => row.id);
  }

  if (!input.refId) throw new GiftError("مرجع مخاطبان انتخاب نشده است");

  if (input.audience === "EDITION_BUYERS") {
    const rows = await prisma.entitlement.findMany({
      where: {
        type: { in: ["PURCHASE", "LEGACY_UNLOCK"] },
        chapter: { editionId: input.refId },
        user: { isBanned: false, deletedAt: null },
      },
      distinct: ["userId"],
      select: { userId: true },
      take: MAX_GIFT_RECIPIENTS + 1,
    });
    return rows.map((row) => row.userId);
  }

  const edition = await prisma.edition.findUnique({ where: { id: input.refId }, select: { workId: true } });
  if (!edition) throw new GiftError("نسخه‌ی مرجع یافت نشد");

  const rows = await prisma.bookmark.findMany({
    where: { comicId: edition.workId, user: { isBanned: false, deletedAt: null } },
    select: { userId: true },
    take: MAX_GIFT_RECIPIENTS + 1,
  });
  return rows.map((row) => row.userId);
}

export async function giftChapterIds(editionIds: string[]): Promise<string[]> {
  const rows = await prisma.chapter.findMany({
    where: { editionId: { in: editionIds }, status: "PUBLISHED", accessType: "COIN", isLocked: false, deletedAt: null },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}