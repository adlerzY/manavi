import "server-only";
import type { BonusTrigger, EditionBonus, EntitlementType, Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidateChapterUnlockCaches } from "./chapters";

const PAID_TYPES: EntitlementType[] = ["PURCHASE", "LEGACY_UNLOCK"];
const USER_CHUNK = 500;
const WRITE_CHUNK = 5000;
const CACHE_CONCURRENCY = 20;
const BACKFILL_MAX_ROWS = 500_000;

export class BonusLimitError extends Error {
  constructor() {
    super("حجم عملیات بیش از حد مجاز است");
    this.name = "BonusLimitError";
  }
}

export interface GrantedPair {
  userId: string;
  chapterId: string;
}

export interface GrantInput {
  userIds: string[];
  chapterIds: string[];
  type: EntitlementType;
  expiresAt?: Date | null;
  bonusId?: string | null;
  giftId?: string | null;
}

export function eligibleChapterWhere(editionId: string): Prisma.ChapterWhereInput {
  return { editionId, status: "PUBLISHED", accessType: "COIN", isLocked: false, deletedAt: null };
}

function notExpired(): Prisma.EntitlementWhereInput {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
}

function activeNow(now: Date): Prisma.EditionBonusWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
}

function windowFilter(link: Pick<EditionBonus, "startsAt" | "endsAt">): Prisma.EntitlementWhereInput {
  if (!link.startsAt && !link.endsAt) return {};
  return {
    createdAt: {
      ...(link.startsAt ? { gte: link.startsAt } : {}),
      ...(link.endsAt ? { lte: link.endsAt } : {}),
    },
  };
}

export async function grantEntitlements(db: Prisma.TransactionClient, input: GrantInput): Promise<GrantedPair[]> {
  const userIds = [...new Set(input.userIds)];
  const chapterIds = [...new Set(input.chapterIds)];
  if (userIds.length === 0 || chapterIds.length === 0) return [];

  const expiresAt = input.expiresAt ?? null;
  const bonusId = input.bonusId ?? null;
  const giftId = input.giftId ?? null;
  const created: GrantedPair[] = [];

  for (let u = 0; u < userIds.length; u += USER_CHUNK) {
    const slice = userIds.slice(u, u + USER_CHUNK);

    await db.entitlement.updateMany({
      where: { userId: { in: slice }, chapterId: { in: chapterIds }, expiresAt: { lt: new Date() } },
      data: { type: input.type, expiresAt, bonusId, giftId },
    });

    const rows = slice.flatMap((userId) =>
      chapterIds.map((chapterId) => ({ userId, chapterId, type: input.type, expiresAt, bonusId, giftId }))
    );
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      const result = await db.entitlement.createManyAndReturn({
        data: rows.slice(i, i + WRITE_CHUNK),
        skipDuplicates: true,
        select: { userId: true, chapterId: true },
      });
      for (const item of result) created.push(item);
    }
  }

  return created;
}

export async function invalidateGrantedCaches(entries: GrantedPair[]): Promise<void> {
  if (entries.length === 0) return;

  const byUser = new Map<string, string[]>();
  for (const entry of entries) {
    const list = byUser.get(entry.userId) ?? [];
    list.push(entry.chapterId);
    byUser.set(entry.userId, list);
  }

  const users = [...byUser.entries()];
  for (let i = 0; i < users.length; i += CACHE_CONCURRENCY) {
    await Promise.all(users.slice(i, i + CACHE_CONCURRENCY).map(([userId, chapterIds]) => invalidateChapterUnlockCaches(userId, chapterIds)));
  }
}

async function ownsFullSet(db: Prisma.TransactionClient, userId: string, editionId: string): Promise<boolean> {
  const where = eligibleChapterWhere(editionId);
  const total = await db.chapter.count({ where });
  if (total === 0) return false;
  const owned = await db.chapter.count({
    where: { ...where, entitlements: { some: { userId, type: { in: PAID_TYPES }, ...notExpired() } } },
  });
  return owned >= total;
}

export async function applyPurchaseBonuses(
  tx: Prisma.TransactionClient,
  input: { userId: string; editionId: string; workId: string; purchasedChapterIds: string[] }
): Promise<string[]> {
  const links = await tx.editionBonus.findMany({
    where: {
      sourceEditionId: input.editionId,
      ...activeNow(new Date()),
      target: { workId: input.workId, status: "ACTIVE", deletedAt: null },
    },
  });
  if (links.length === 0) return [];

  const purchased = await tx.chapter.findMany({ where: { id: { in: input.purchasedChapterIds } }, select: { episodeId: true } });
  const episodeIds = purchased.map((chapter) => chapter.episodeId).filter((id): id is string => Boolean(id));

  const unlocked = new Set<string>();

  for (const link of links) {
    let chapterIds: string[] = [];

    if (link.trigger === "PER_CHAPTER") {
      if (episodeIds.length === 0) continue;
      const rows = await tx.chapter.findMany({
        where: { ...eligibleChapterWhere(link.targetEditionId), episodeId: { in: episodeIds } },
        select: { id: true },
      });
      chapterIds = rows.map((row) => row.id);
    } else {
      if (link.trigger === "FULL_SET" && !(await ownsFullSet(tx, input.userId, link.sourceEditionId))) continue;
      await tx.bonusGrant.createMany({ data: [{ bonusId: link.id, userId: input.userId }], skipDuplicates: true });
      const rows = await tx.chapter.findMany({ where: eligibleChapterWhere(link.targetEditionId), select: { id: true } });
      chapterIds = rows.map((row) => row.id);
    }

    const created = await grantEntitlements(tx, { userIds: [input.userId], chapterIds, type: "CROSS_UNLOCK", bonusId: link.id });
    for (const item of created) unlocked.add(item.chapterId);
  }

  return [...unlocked];
}

export interface BackfillPlan {
  link: EditionBonus;
  groups: { chapterIds: string[]; userIds: string[] }[];
  users: number;
  chapters: number;
  rows: number;
}

export async function planBonusBackfill(bonusId: string): Promise<BackfillPlan | null> {
  const link = await prisma.editionBonus.findUnique({ where: { id: bonusId } });
  if (!link) return null;

  const targets = await prisma.chapter.findMany({ where: eligibleChapterWhere(link.targetEditionId), select: { id: true, episodeId: true } });
  const groups: BackfillPlan["groups"] = [];
  const everyone = new Set<string>();

  if (targets.length > 0 && link.trigger === "PER_CHAPTER") {
    const rows = await prisma.entitlement.findMany({
      where: { type: { in: PAID_TYPES }, chapter: { editionId: link.sourceEditionId, deletedAt: null }, ...windowFilter(link) },
      select: { userId: true, chapter: { select: { episodeId: true } } },
    });

    const usersByEpisode = new Map<string, Set<string>>();
    for (const row of rows) {
      const episodeId = row.chapter.episodeId;
      if (!episodeId) continue;
      const set = usersByEpisode.get(episodeId) ?? new Set<string>();
      set.add(row.userId);
      usersByEpisode.set(episodeId, set);
    }

    for (const target of targets) {
      const users = target.episodeId ? usersByEpisode.get(target.episodeId) : undefined;
      if (!users || users.size === 0) continue;
      groups.push({ chapterIds: [target.id], userIds: [...users] });
      users.forEach((id) => everyone.add(id));
    }
  } else if (targets.length > 0) {
    let userIds: string[] = [];

    if (link.trigger === "ANY_PURCHASE") {
      const rows = await prisma.entitlement.findMany({
        where: { type: { in: PAID_TYPES }, chapter: { editionId: link.sourceEditionId, deletedAt: null }, ...windowFilter(link) },
        distinct: ["userId"],
        select: { userId: true },
      });
      userIds = rows.map((row) => row.userId);
    } else {
      const total = await prisma.chapter.count({ where: eligibleChapterWhere(link.sourceEditionId) });
      if (total > 0) {
        const grouped = await prisma.entitlement.groupBy({
          by: ["userId"],
          where: {
            type: { in: PAID_TYPES },
            chapter: eligibleChapterWhere(link.sourceEditionId),
            ...notExpired(),
            ...(link.endsAt ? { createdAt: { lte: link.endsAt } } : {}),
          },
          _count: { _all: true },
        });
        userIds = grouped.filter((item) => item._count._all >= total).map((item) => item.userId);
      }
    }

    if (userIds.length > 0) {
      groups.push({ chapterIds: targets.map((target) => target.id), userIds });
      userIds.forEach((id) => everyone.add(id));
    }
  }

  const rows = groups.reduce((sum, group) => sum + group.userIds.length * group.chapterIds.length, 0);
  const chapters = new Set(groups.flatMap((group) => group.chapterIds)).size;
  return { link, groups, users: everyone.size, chapters, rows };
}

export async function applyBonusBackfill(bonusId: string): Promise<{ users: number; granted: number }> {
  const plan = await planBonusBackfill(bonusId);
  if (!plan) return { users: 0, granted: 0 };
  if (plan.rows > BACKFILL_MAX_ROWS) throw new BonusLimitError();

  const granted: GrantedPair[] = [];
  for (const group of plan.groups) {
    const created = await grantEntitlements(prisma, {
      userIds: group.userIds,
      chapterIds: group.chapterIds,
      type: "CROSS_UNLOCK",
      bonusId,
    });
    for (const item of created) granted.push(item);
  }

  if (plan.link.trigger !== "PER_CHAPTER") {
    const userIds = [...new Set(plan.groups.flatMap((group) => group.userIds))];
    for (let i = 0; i < userIds.length; i += WRITE_CHUNK) {
      await prisma.bonusGrant.createMany({
        data: userIds.slice(i, i + WRITE_CHUNK).map((userId) => ({ bonusId, userId })),
        skipDuplicates: true,
      });
    }
  }

  await invalidateGrantedCaches(granted);
  return { users: plan.users, granted: granted.length };
}

export async function grantAutomaticAccessForChapters(chapterIds: string[]): Promise<void> {
  const unique = [...new Set(chapterIds)];
  if (unique.length === 0) return;

  const chapters = await prisma.chapter.findMany({
    where: {
      id: { in: unique },
      status: "PUBLISHED",
      accessType: "COIN",
      isLocked: false,
      deletedAt: null,
      edition: { status: "ACTIVE", deletedAt: null },
    },
    select: { id: true, editionId: true, episodeId: true },
  });
  if (chapters.length === 0) return;

  const byEdition = new Map<string, typeof chapters>();
  for (const chapter of chapters) {
    const list = byEdition.get(chapter.editionId) ?? [];
    list.push(chapter);
    byEdition.set(chapter.editionId, list);
  }
  const editionIds = [...byEdition.keys()];

  const [links, gifts] = await Promise.all([
    prisma.editionBonus.findMany({ where: { targetEditionId: { in: editionIds }, isActive: true } }),
    prisma.accessGift.findMany({
      where: {
        revokedAt: null,
        includeFuture: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        editions: { some: { editionId: { in: editionIds } } },
      },
      include: { editions: { select: { editionId: true } }, recipients: { select: { userId: true } } },
    }),
  ]);

  const granted: GrantedPair[] = [];

  for (const link of links) {
    const group = byEdition.get(link.targetEditionId) ?? [];
    if (group.length === 0) continue;

    if (link.trigger === "PER_CHAPTER") {
      for (const chapter of group) {
        if (!chapter.episodeId) continue;
        const owners = await prisma.entitlement.findMany({
          where: {
            type: { in: PAID_TYPES },
            chapter: { editionId: link.sourceEditionId, episodeId: chapter.episodeId, deletedAt: null },
            ...windowFilter(link),
          },
          distinct: ["userId"],
          select: { userId: true },
        });
        const created = await grantEntitlements(prisma, {
          userIds: owners.map((owner) => owner.userId),
          chapterIds: [chapter.id],
          type: "CROSS_UNLOCK",
          bonusId: link.id,
        });
        for (const item of created) granted.push(item);
      }
    } else {
      const qualified = await prisma.bonusGrant.findMany({ where: { bonusId: link.id }, select: { userId: true } });
      const created = await grantEntitlements(prisma, {
        userIds: qualified.map((item) => item.userId),
        chapterIds: group.map((chapter) => chapter.id),
        type: "CROSS_UNLOCK",
        bonusId: link.id,
      });
      for (const item of created) granted.push(item);
    }
  }

  for (const gift of gifts) {
    const chapterIdsForGift = gift.editions.flatMap((edition) => (byEdition.get(edition.editionId) ?? []).map((chapter) => chapter.id));
    const created = await grantEntitlements(prisma, {
      userIds: gift.recipients.map((recipient) => recipient.userId),
      chapterIds: chapterIdsForGift,
      type: "ADMIN_GRANT",
      expiresAt: gift.expiresAt,
      giftId: gift.id,
    });
    for (const item of created) granted.push(item);
  }

  await invalidateGrantedCaches(granted);
}

export function isBonusTrigger(value: unknown): value is BonusTrigger {
  return value === "PER_CHAPTER" || value === "ANY_PURCHASE" || value === "FULL_SET";
}