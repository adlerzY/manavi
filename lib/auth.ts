import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifySessionToken } from "./session";
import { redis } from "./redis";
import {
  AccessDeniedError,
  assertComicPermission,
  assertEditionPermission,
  getMemberships,
} from "./access";
import type { PermissionSet, StaffPermission } from "./permissions";
import type { User, Publisher } from "@prisma/client";

export type SessionUser = User & { publisherProfile: Publisher | null };

export interface PublisherContext {
  publisherId: string;
  isOwner: boolean;
  canManageComics: boolean;
  permissions: PermissionSet;
}

const SESSION_CACHE_TTL_SECONDS = 45;
const sessionCacheKey = (userId: string) => `session-user:${userId}`;

interface SerializedSessionUser extends Omit<SessionUser, "telegramId"> {
  telegramId: string;
}

function toStorable(user: SessionUser): SerializedSessionUser {
  return { ...user, telegramId: user.telegramId.toString() };
}

function fromStorable(raw: SerializedSessionUser): SessionUser {
  return {
    ...raw,
    telegramId: BigInt(raw.telegramId),
    bannedAt: raw.bannedAt ? new Date(raw.bannedAt) : null,
    deletedAt: raw.deletedAt ? new Date(raw.deletedAt) : null,
    createdAt: new Date(raw.createdAt),
    updatedAt: new Date(raw.updatedAt),
    publisherProfile: raw.publisherProfile
      ? {
          ...raw.publisherProfile,
          createdAt: new Date(raw.publisherProfile.createdAt),
          suspendedAt: raw.publisherProfile.suspendedAt ? new Date(raw.publisherProfile.suspendedAt) : null,
        }
      : null,
  } as SessionUser;
}

async function fetchSessionUser(userId: string): Promise<SessionUser | null> {
  const cacheKey = sessionCacheKey(userId);

  try {
    const cached = await redis.get<SerializedSessionUser>(cacheKey);
    if (cached) return fromStorable(cached);
  } catch {}

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { publisherProfile: true },
  });

  if (user) {
    redis.set(cacheKey, toStorable(user), { ex: SESSION_CACHE_TTL_SECONDS }).catch(() => {});
  }

  return user;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;

  const session = verifySessionToken(token);
  if (!session) return null;

  return fetchSessionUser(session.userId);
});

export async function invalidateSessionUserCache(userId: string): Promise<void> {
  await redis.del(sessionCacheKey(userId)).catch(() => {});
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.role !== "ADMIN") {
    throw new Error("Admin access required");
  }
  if (user.isBanned) {
    throw new Error("Account is banned");
  }
  return user;
}

async function requireActiveUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AccessDeniedError("برای این عملیات باید وارد شوید");
  if (user.isBanned) throw new AccessDeniedError("حساب شما مسدود شده است");
  return user;
}

export async function requireUploadAccess(comicId: string, permission: StaffPermission = "upload"): Promise<SessionUser> {
  const user = await requireActiveUser();
  await assertComicPermission(user, comicId, permission);
  return user;
}

export async function requireEditionAccess(
  editionId: string,
  permission: StaffPermission,
  expectedComicId?: string
): Promise<SessionUser> {
  const user = await requireActiveUser();
  await assertEditionPermission(user, editionId, permission, expectedComicId);
  return user;
}

export async function requireChapterAccess(chapterId: string, permission: StaffPermission): Promise<SessionUser> {
  const user = await requireActiveUser();
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId }, select: { editionId: true } });
  if (!chapter) throw new AccessDeniedError("چپتر یافت نشد");
  await assertEditionPermission(user, chapter.editionId, permission);
  return user;
}

export async function requireComicManageAccess(publisherId: string): Promise<SessionUser> {
  const user = await requireActiveUser();
  if (user.role === "ADMIN") return user;
  const membership = (await getMemberships(user.id)).find((item) => item.publisherId === publisherId);
  if (!membership || !membership.permissions.manageComics) throw new AccessDeniedError();
  return user;
}

export async function requireComicManageAccessByComicId(comicId: string): Promise<SessionUser> {
  const user = await requireActiveUser();
  await assertComicPermission(user, comicId, "manageComics");
  return user;
}

export const getPublisherContext = cache(async (user: SessionUser | null): Promise<PublisherContext | null> => {
  if (!user) return null;

  const memberships = await getMemberships(user.id);
  if (memberships.length === 0) return null;

  const picked = memberships.find((item) => item.isOwner) ?? memberships[0];
  return {
    publisherId: picked.publisherId,
    isOwner: picked.isOwner,
    canManageComics: picked.permissions.manageComics,
    permissions: picked.permissions,
  };
});

export async function getUploaderVerification(userId: string, comicId: string, publisherIdHint?: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  let publisherId = publisherIdHint;
  if (!publisherId) {
    const comic = await prisma.comic.findUnique({
      where: { id: comicId },
      select: { license: { select: { publisherId: true } } },
    });
    if (!comic) return false;
    publisherId = comic.license.publisherId;
  }

  const publisher = await prisma.publisher.findUnique({
    where: { id: publisherId },
    select: { isVerified: true, contractUserId: true },
  });
  if (!publisher) return false;
  if (publisher.contractUserId === userId) return publisher.isVerified;

  const staffRows = await prisma.publisherStaff.findMany({ where: { userId, publisherId }, select: { isVerified: true } });
  if (staffRows.length === 0) return false;
  if (staffRows.some((row) => row.isVerified)) return true;
  return publisher.isVerified;
}