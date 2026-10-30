import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import {
  LEADERBOARD_PERIODS,
  LEADERBOARD_SIZE,
  LEADERBOARD_TAG,
  type LeaderboardBoard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
  type LeaderboardSort,
} from "./engagement";

interface ScoreRow {
  userId: string;
  publisherId: string | null;
  uploads: number;
  interactions: number;
}

function periodStart(period: LeaderboardPeriod): Date {
  const days = LEADERBOARD_PERIODS.find((item) => item.id === period)?.days ?? null;
  return days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
}

function rankRows(rows: ScoreRow[], sort: LeaderboardSort): ScoreRow[] {
  const primary = sort === "uploads" ? "uploads" : "interactions";
  const secondary = sort === "uploads" ? "interactions" : "uploads";
  return [...rows]
    .sort((a, b) => b[primary] - a[primary] || b[secondary] - a[secondary] || a.userId.localeCompare(b.userId))
    .slice(0, LEADERBOARD_SIZE);
}

async function queryPublishers(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    WITH uploads AS (
      SELECT e."publisherId" AS "publisherId", COUNT(*)::int AS "total"
      FROM "Chapter" c
      JOIN "Edition" e ON e."id" = c."editionId"
      WHERE c."publishedAt" IS NOT NULL AND c."publishedAt" >= ${since}
      GROUP BY e."publisherId"
    ),
    engagement AS (
      SELECT e."publisherId" AS "publisherId", COUNT(*)::int AS "total"
      FROM (
        SELECT "chapterId" FROM "ChapterReadMark" WHERE "readAt" >= ${since}
        UNION ALL
        SELECT "chapterId" FROM "ChapterReaction" WHERE "createdAt" >= ${since}
        UNION ALL
        SELECT "chapterId" FROM "Comment"
        WHERE "createdAt" >= ${since} AND "status" = 'APPROVED' AND "parentId" IS NULL
      ) i
      JOIN "Chapter" c ON c."id" = i."chapterId"
      JOIN "Edition" e ON e."id" = c."editionId"
      GROUP BY e."publisherId"
    )
    SELECT p."id" AS "publisherId", p."contractUserId" AS "userId",
      COALESCE(up."total", 0)::int AS "uploads",
      COALESCE(en."total", 0)::int AS "interactions"
    FROM "Publisher" p
    JOIN "User" u ON u."id" = p."contractUserId"
    LEFT JOIN uploads up ON up."publisherId" = p."id"
    LEFT JOIN engagement en ON en."publisherId" = p."id"
    WHERE u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
      AND (COALESCE(up."total", 0) > 0 OR COALESCE(en."total", 0) > 0)`;
}

async function queryTeam(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    WITH credited AS (
      SELECT DISTINCT cs."userId", cs."chapterId" FROM "ChapterStaff" cs
    ),
    uploads AS (
      SELECT cr."userId", COUNT(*)::int AS "total"
      FROM credited cr
      JOIN "Chapter" c ON c."id" = cr."chapterId"
      WHERE c."publishedAt" IS NOT NULL AND c."publishedAt" >= ${since}
      GROUP BY cr."userId"
    ),
    engagement AS (
      SELECT cr."userId", COUNT(*)::int AS "total"
      FROM (
        SELECT "chapterId" FROM "ChapterReadMark" WHERE "readAt" >= ${since}
        UNION ALL
        SELECT "chapterId" FROM "ChapterReaction" WHERE "createdAt" >= ${since}
        UNION ALL
        SELECT "chapterId" FROM "Comment"
        WHERE "createdAt" >= ${since} AND "status" = 'APPROVED' AND "parentId" IS NULL
      ) i
      JOIN credited cr ON cr."chapterId" = i."chapterId"
      GROUP BY cr."userId"
    )
    SELECT NULL::text AS "publisherId", u."id" AS "userId",
      COALESCE(up."total", 0)::int AS "uploads",
      COALESCE(en."total", 0)::int AS "interactions"
    FROM "User" u
    LEFT JOIN uploads up ON up."userId" = u."id"
    LEFT JOIN engagement en ON en."userId" = u."id"
    WHERE u."id" IN (SELECT "userId" FROM credited)
      AND u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
      AND NOT EXISTS (SELECT 1 FROM "Publisher" p WHERE p."contractUserId" = u."id")
      AND (COALESCE(up."total", 0) > 0 OR COALESCE(en."total", 0) > 0)`;
}

async function buildEntries(board: LeaderboardBoard, rows: ScoreRow[]): Promise<LeaderboardEntry[]> {
  if (rows.length === 0) return [];

  const publisherIds = rows.map((row) => row.publisherId).filter((id): id is string => Boolean(id));

  const [users, publishers] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, firstName: true, username: true, avatarUrl: true, telegramPhotoUrl: true },
    }),
    board === "publishers" && publisherIds.length > 0
      ? prisma.publisher.findMany({ where: { id: { in: publisherIds } }, select: { id: true, name: true, avatarUrl: true } })
      : Promise.resolve([]),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));
  const publisherById = new Map(publishers.map((publisher) => [publisher.id, publisher]));

  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const user = userById.get(row.userId);
    if (!user) continue;
    const userAvatar = user.avatarUrl ?? user.telegramPhotoUrl;

    if (board === "publishers") {
      const publisher = row.publisherId ? publisherById.get(row.publisherId) : undefined;
      if (!publisher) continue;
      entries.push({
        rank: entries.length + 1,
        id: publisher.id,
        userId: user.id,
        name: publisher.name,
        avatarUrl: publisher.avatarUrl ?? userAvatar,
        href: `/app/publisher/${publisher.id}`,
        uploads: Number(row.uploads),
        interactions: Number(row.interactions),
      });
      continue;
    }

    entries.push({
      rank: entries.length + 1,
      id: user.id,
      userId: user.id,
      name: user.username ? `@${user.username}` : user.firstName,
      avatarUrl: userAvatar,
      href: `/app/team/${user.id}`,
      uploads: Number(row.uploads),
      interactions: Number(row.interactions),
    });
  }
  return entries;
}

export const getLeaderboard = unstable_cache(
  async (board: LeaderboardBoard, period: LeaderboardPeriod, sort: LeaderboardSort): Promise<LeaderboardEntry[]> => {
    const since = periodStart(period);
    const rows = board === "publishers" ? await queryPublishers(since) : await queryTeam(since);
    return buildEntries(board, rankRows(rows, sort));
  },
  ["leaderboard:v3"],
  { revalidate: 300, tags: [LEADERBOARD_TAG] }
);