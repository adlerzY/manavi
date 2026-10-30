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
} from "./engagement";

interface ScoreRow {
  userId: string;
  publisherId: string | null;
  score: number;
  supporters: number;
}

function periodStart(period: LeaderboardPeriod): Date {
  const days = LEADERBOARD_PERIODS.find((item) => item.id === period)?.days ?? null;
  return days ? new Date(Date.now() - days * 86_400_000) : new Date(0);
}

async function queryPublishers(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    SELECT p."id" AS "publisherId", d."receiverId" AS "userId",
      SUM(d."coins")::int AS score, COUNT(DISTINCT d."donorId")::int AS supporters
    FROM "Donation" d
    JOIN "Publisher" p ON p."contractUserId" = d."receiverId"
    JOIN "User" u ON u."id" = d."receiverId"
    WHERE d."createdAt" >= ${since}
      AND u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
    GROUP BY p."id", d."receiverId"
    ORDER BY score DESC, supporters DESC, d."receiverId" ASC
    LIMIT ${LEADERBOARD_SIZE}`;
}

async function queryTeam(since: Date): Promise<ScoreRow[]> {
  return prisma.$queryRaw<ScoreRow[]>`
    SELECT NULL::text AS "publisherId", d."receiverId" AS "userId",
      SUM(d."coins")::int AS score, COUNT(DISTINCT d."donorId")::int AS supporters
    FROM "Donation" d
    JOIN "User" u ON u."id" = d."receiverId"
    WHERE d."createdAt" >= ${since}
      AND u."isBanned" = false AND u."deletedAt" IS NULL AND u."leaderboardHidden" = false
      AND NOT EXISTS (SELECT 1 FROM "Publisher" p WHERE p."contractUserId" = d."receiverId")
    GROUP BY d."receiverId"
    ORDER BY score DESC, supporters DESC, d."receiverId" ASC
    LIMIT ${LEADERBOARD_SIZE}`;
}

async function buildEntries(board: LeaderboardBoard, rows: ScoreRow[]): Promise<LeaderboardEntry[]> {
  if (rows.length === 0) return [];

  const publisherIds = rows.map((row) => row.publisherId).filter((id): id is string => Boolean(id));

  const [users, publishers] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.userId) } },
      select: { id: true, firstName: true, username: true, avatarUrl: true, telegramPhotoUrl: true, activeTitle: true },
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
        activeTitle: null,
        href: `/app/publisher/${publisher.id}`,
        score: Number(row.score),
        supporters: Number(row.supporters),
      });
      continue;
    }

    entries.push({
      rank: entries.length + 1,
      id: user.id,
      userId: user.id,
      name: user.username ? `@${user.username}` : user.firstName,
      avatarUrl: userAvatar,
      activeTitle: user.activeTitle,
      href: `/app/team/${user.id}`,
      score: Number(row.score),
      supporters: Number(row.supporters),
    });
  }
  return entries;
}

export const getLeaderboard = unstable_cache(
  async (board: LeaderboardBoard, period: LeaderboardPeriod): Promise<LeaderboardEntry[]> => {
    const since = periodStart(period);
    const rows = board === "publishers" ? await queryPublishers(since) : await queryTeam(since);
    return buildEntries(board, rows);
  },
  ["leaderboard:v2"],
  { revalidate: 300, tags: [LEADERBOARD_TAG] }
);