"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function updateReadHistory(
  comicId: string,
  chapterId: string,
  page: number,
  scrollFraction: number
): Promise<void> {
  const user = await getSessionUser();
  if (!user || user.isBanned) return;

  const safePage = Number.isFinite(page) ? Math.max(1, Math.min(10_000, Math.floor(page))) : 1;
  const safeFraction = Number.isFinite(scrollFraction) ? Math.min(1, Math.max(0, scrollFraction)) : 0;

  await prisma.$executeRaw`
    INSERT INTO "ReadHistory" ("userId", "comicId", "lastChapterId", "lastPage", "scrollFraction", "updatedAt")
    SELECT ${user.id}::text, c."comicId", c."id", ${safePage}::int, ${safeFraction}::double precision, (NOW() AT TIME ZONE 'UTC')
    FROM "Chapter" c
    WHERE c."id" = ${chapterId}::text AND c."comicId" = ${comicId}::text
    ON CONFLICT ("userId", "comicId") DO UPDATE SET
      "lastChapterId" = EXCLUDED."lastChapterId",
      "lastPage" = EXCLUDED."lastPage",
      "scrollFraction" = EXCLUDED."scrollFraction",
      "updatedAt" = EXCLUDED."updatedAt"
    WHERE COALESCE(
      (SELECT p."chapterNumber" FROM "Chapter" p WHERE p."id" = "ReadHistory"."lastChapterId"),
      -1
    ) <= (SELECT n."chapterNumber" FROM "Chapter" n WHERE n."id" = EXCLUDED."lastChapterId")`;
}