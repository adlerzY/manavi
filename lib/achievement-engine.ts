import "server-only";
import { prisma } from "./prisma";
import { redis, isRedisConfigured } from "./redis";
import { invalidateSessionUserCache } from "./auth";
import { createNotifications } from "./notifications";
import { ENGAGEMENT_POINTS } from "./engagement";
import {
  ACHIEVEMENTS,
  TIER_RANK,
  type AchievementDefinition,
  type AchievementMetrics,
  type AchievementProgress,
} from "./achievements";

const EVALUATION_THROTTLE_SECONDS = 45;

export interface AchievementsOverview {
  items: AchievementProgress[];
  activeTitle: string | null;
  metrics: AchievementMetrics;
}

export async function getUserMetrics(userId: string): Promise<AchievementMetrics> {
  const rows = await prisma.$queryRaw<AchievementMetrics[]>`
    SELECT
      (SELECT COUNT(*) FROM "ChapterReadMark" WHERE "userId" = ${userId})::int AS "reads",
      (SELECT COUNT(DISTINCT "chapterId") FROM "Comment"
        WHERE "userId" = ${userId} AND "status" = 'APPROVED' AND "parentId" IS NULL
          AND char_length("content") >= ${ENGAGEMENT_POINTS.minCommentLength}::int)::int AS "comments",
      (SELECT COUNT(*) FROM "ChapterReaction" WHERE "userId" = ${userId})::int AS "reactions",
      ((SELECT COUNT(*) FROM "WorkRating" WHERE "userId" = ${userId})
        + (SELECT COUNT(*) FROM "EditionRating" WHERE "userId" = ${userId}))::int AS "ratings",
      (SELECT COALESCE(SUM("coins"), 0) FROM "Donation" WHERE "donorId" = ${userId})::int AS "donatedCoins",
      (SELECT COUNT(*) FROM "Bookmark" WHERE "userId" = ${userId})::int AS "bookmarks",
      COALESCE((SELECT "referralCount" FROM "User" WHERE "id" = ${userId}), 0)::int AS "referrals"`;

  const row = rows[0];
  return {
    reads: Number(row?.reads ?? 0),
    comments: Number(row?.comments ?? 0),
    reactions: Number(row?.reactions ?? 0),
    ratings: Number(row?.ratings ?? 0),
    donatedCoins: Number(row?.donatedCoins ?? 0),
    referrals: Number(row?.referrals ?? 0),
    bookmarks: Number(row?.bookmarks ?? 0),
  };
}

async function awardAchievements(
  userId: string,
  fresh: AchievementDefinition[],
  currentTitle: string | null
): Promise<string | null> {
  if (fresh.length === 0) return currentTitle;

  const created = await prisma.userAchievement.createMany({
    data: fresh.map((definition) => ({ userId, key: definition.key })),
    skipDuplicates: true,
  });
  if (created.count === 0) return currentTitle;

  let activeTitle = currentTitle;
  if (!currentTitle) {
    const best = [...fresh].sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier])[0];
    const updated = await prisma.user.updateMany({
      where: { id: userId, activeTitle: null },
      data: { activeTitle: best.key },
    });
    if (updated.count > 0) {
      activeTitle = best.key;
      await invalidateSessionUserCache(userId);
    }
  }

  await createNotifications(
    fresh.map((definition) => ({
      userId,
      type: "SYSTEM" as const,
      title: `دستاورد جدید: ${definition.emoji} ${definition.label}`,
      body: definition.description,
      href: "/app/achievements",
      dedupeKey: `achievement:${userId}:${definition.key}`,
    }))
  );

  return activeTitle;
}

export async function evaluateAchievements(userId: string): Promise<AchievementDefinition[]> {
  const [metrics, owned, user] = await Promise.all([
    getUserMetrics(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { key: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { activeTitle: true, isBanned: true, deletedAt: true } }),
  ]);
  if (!user || user.isBanned || user.deletedAt) return [];

  const ownedKeys = new Set(owned.map((entry) => entry.key));
  const fresh = ACHIEVEMENTS.filter(
    (definition) => metrics[definition.metric] >= definition.threshold && !ownedKeys.has(definition.key)
  );
  await awardAchievements(userId, fresh, user.activeTitle);
  return fresh;
}

export async function maybeEvaluateAchievements(
  userId: string,
  options?: { force?: boolean }
): Promise<AchievementDefinition[]> {
  if (!options?.force && isRedisConfigured) {
    try {
      const acquired = await redis.set(`achievements:eval:${userId}`, "1", { nx: true, ex: EVALUATION_THROTTLE_SECONDS });
      if (!acquired) return [];
    } catch {}
  }

  try {
    return await evaluateAchievements(userId);
  } catch (err) {
    console.error("[achievements] evaluation failed", err);
    return [];
  }
}

export async function getAchievementsOverview(userId: string): Promise<AchievementsOverview> {
  const [metrics, owned, user] = await Promise.all([
    getUserMetrics(userId),
    prisma.userAchievement.findMany({ where: { userId }, select: { key: true, awardedAt: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { activeTitle: true } }),
  ]);

  const ownedMap = new Map(owned.map((entry) => [entry.key, entry.awardedAt]));
  const fresh = ACHIEVEMENTS.filter(
    (definition) => metrics[definition.metric] >= definition.threshold && !ownedMap.has(definition.key)
  );
  const activeTitle = await awardAchievements(userId, fresh, user?.activeTitle ?? null);
  const now = new Date();
  fresh.forEach((definition) => ownedMap.set(definition.key, now));

  const items: AchievementProgress[] = ACHIEVEMENTS.map((definition) => {
    const awardedAt = ownedMap.get(definition.key) ?? null;
    return {
      ...definition,
      current: metrics[definition.metric],
      earned: awardedAt !== null,
      awardedAt: awardedAt ? awardedAt.toISOString() : null,
    };
  });

  return { items, activeTitle, metrics };
}