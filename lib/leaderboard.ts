import "server-only";
import { unstable_cache } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import {
  ENGAGEMENT_POINTS,
  LEADERBOARD_PERIODS,
  LEADERBOARD_SIZE,
  LEADERBOARD_TAG,
  type LeaderboardBoard,
  type LeaderboardEntry,
  type LeaderboardPeriod,
} from "./engagement";

interface ScoreRow {
  userId: string;
  score: number;
  reads?: number;
  comments?: number;
  reactions?: number;
  ratings?: number;
  donations?: number;
  count?: number;
  supporters?: number;
}

export interface MyEngagement {
  score: number;
  reads: number;
  comments: number;
  reactions: number;
  ratings: number;
  donations: number;
}

function periodStart(period: LeaderboardPeriod): Date {
  const days = LEADERBOARD_PERIODS.find((item) => item.id === period)?.days ?? null;
  return days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
}

function engagementEvents(since: Date) {
  return Prisma.sql`
    SELECT "userId" AS uid, 'READ' AS kind, ${ENGAGEMENT_POINTS.read}::int AS points
    FROM "ChapterReadMark" WHERE "readAt" >= ${since}
    UNION ALL
    SELECT c."userId", 'COMMENT', ${ENGAGEMENT_POINTS.comment}::int
    FROM (
      SELECT DISTINCT "userId", "chapterId" FROM "Comment"
      WHERE "createdAt" >= ${since} AND "status" = 'APPROVED' AND "parentId" IS NULL
        AND char_length("content") >= ${ENGAGEMENT_POINTS.minCommentLength}::int
    ) c
    UNION ALL
    SELECT "userId", 'REACTION', ${ENGAGEMENT_POINTS.reaction}::int
    FROM "ChapterReaction" WHERE "createdAt" >= ${since}
    UNION ALL
    SELECT "userId", 'RATING', ${ENGAGEMENT_POINTS.rating}::int
    FROM "WorkRating" WHERE "createdAt" >= ${since}
    UNION ALL
    SELECT "userId", 'RATING', ${ENGAGEMENT_POINTS.rating}::int
    FROM "EditionRating" WHERE "createdAt" >= ${since}
    UNION ALL
    SELECT "donorId", 'DONATION', GREATEST(1, "coins" / ${ENGAGEMENT_POINTS.donationCoinsPerPoint}::int)
    FROM "Donation" WHERE "createdAt" >= ${since}
  `;
}

async function queryActive(since: Date): Promise<ScoreRow[]> {
  const rows = await prisma.$queryRaw<ScoreRow[]>`
    WITH events AS (${engagementEvents(since)})
    SELECT e.uid AS "userId",
      SUM(e.points)::int AS score,
      COUNT(*) FILTER (WHERE e.kind = 'READ')::int AS reads,
      COUNT(*) FILTER (WHERE e.kind = 'COMMENT')::int AS comments,
      COUNT(*) FILTER (WHERE e.kind = 'REACTION')::int AS reactions,
      COUNT(*) FILTER (WHERE e.kind = 'RATING')::int AS ratings,
      COUNT(*) FILTER (WHERE e.kind = 'DONATION')::int AS donations
    FROM events e
    JOIN "User" u ON u."id" = e.uid
    WHERE u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
    GROUP BY e.uid
    ORDER BY score DESC, reads DESC, e.uid ASC
    LIMIT ${LEADERBOARD_SIZE}`;
  return rows;
}

async function queryDonors(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    SELECT d."donorId" AS "userId", SUM(d."coins")::int AS score, COUNT(*)::int AS count
    FROM "Donation" d
    JOIN "User" u ON u."id" = d."donorId"
    WHERE d."createdAt" >= ${since} AND d."isAnonymous" = false
      AND u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
    GROUP BY d."donorId"
    ORDER BY score DESC, count DESC, d."donorId" ASC
    LIMIT ${LEADERBOARD_SIZE}`;
}

async function querySupported(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    SELECT d."receiverId" AS "userId", SUM(d."coins")::int AS score, COUNT(DISTINCT d."donorId")::int AS supporters
    FROM "Donation" d
    JOIN "User" u ON u."id" = d."receiverId"
    WHERE d."createdAt" >= ${since}
      AND u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
    GROUP BY d."receiverId"
    ORDER BY score DESC, supporters DESC, d."receiverId" ASC
    LIMIT ${LEADERBOARD_SIZE}`;
}

async function buildEntries(board: LeaderboardBoard, rows: ScoreRow[]): Promise<LeaderboardEntry[]> {
  if (rows.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((row) => row.userId) } },
    select: { id: true, firstName: true, username: true, avatarUrl: true, telegramPhotoUrl: true, activeTitle: true },
  });
  const byId = new Map(users.map((user) => [user.id, user]));

  const entries: LeaderboardEntry[] = [];
  for (const row of rows) {
    const user = byId.get(row.userId);
    if (!user) continue;
    const stats: Record<string, number> =
      board === "active"
        ? {
            reads: Number(row.reads ?? 0),
            comments: Number(row.comments ?? 0),
            reactions: Number(row.reactions ?? 0),
            ratings: Number(row.ratings ?? 0),
            donations: Number(row.donations ?? 0),
          }
        : board === "donors"
          ? { count: Number(row.count ?? 0) }
          : { supporters: Number(row.supporters ?? 0) };

    entries.push({
      rank: entries.length + 1,
      userId: user.id,
      name: user.username ? `@${user.username}` : user.firstName,
      avatarUrl: user.avatarUrl ?? user.telegramPhotoUrl,
      activeTitle: user.activeTitle,
      score: Number(row.score),
      stats,
    });
  }
  return entries;
}

export const getLeaderboard = unstable_cache(
  async (board: LeaderboardBoard, period: LeaderboardPeriod): Promise<LeaderboardEntry[]> => {
    const since = periodStart(period);
    const rows =
      board === "donors" ? await queryDonors(since) : board === "supported" ? await querySupported(since) : await queryActive(since);
    return buildEntries(board, rows);
  },
  ["leaderboard:v1"],
  { revalidate: 300, tags: [LEADERBOARD_TAG] }
);

export async function getMyEngagement(userId: string, period: LeaderboardPeriod): Promise<MyEngagement> {
  const since = periodStart(period);
  const rows = await prisma.$queryRaw<ScoreRow[]>`
    WITH events AS (${engagementEvents(since)})
    SELECT e.uid AS "userId",
      SUM(e.points)::int AS score,
      COUNT(*) FILTER (WHERE e.kind = 'READ')::int AS reads,
      COUNT(*) FILTER (WHERE e.kind = 'COMMENT')::int AS comments,
      COUNT(*) FILTER (WHERE e.kind = 'REACTION')::int AS reactions,
      COUNT(*) FILTER (WHERE e.kind = 'RATING')::int AS ratings,
      COUNT(*) FILTER (WHERE e.kind = 'DONATION')::int AS donations
    FROM events e
    WHERE e.uid = ${userId}
    GROUP BY e.uid`;

  const row = rows[0];
  return {
    score: Number(row?.score ?? 0),
    reads: Number(row?.reads ?? 0),
    comments: Number(row?.comments ?? 0),
    reactions: Number(row?.reactions ?? 0),
    ratings: Number(row?.ratings ?? 0),
    donations: Number(row?.donations ?? 0),
  };
}