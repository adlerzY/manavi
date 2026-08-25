import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { verifySessionToken } from "./session";
import { redis } from "./redis";
import type { User, Publisher } from "@prisma/client";

export type SessionUser = User & { publisherProfile: Publisher | null };

export interface PublisherContext {
  publisherId: string;
  isOwner: boolean;
  canManageComics: boolean;
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
      ? { ...raw.publisherProfile, createdAt: new Date(raw.publisherProfile.createdAt) }
      : null,
  } as SessionUser;
}

async function fetchSessionUser(userId: string): Promise<SessionUser | null> {
  const cacheKey = sessionCacheKey(userId);

  try {
    const cached = await redis.get<SerializedSessionUser>(cacheKey);
    if (cached) return fromStorable(cached);
  } catch {
  }

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

export async function requireUploadAccess(comicId: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  if (user.isBanned) {
    throw new Error("Account is banned");
  }
  if (user.role === "ADMIN") {
    return user;
  }

  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { license: { select: { publisherId: true } } },
  });
  if (!comic) {
    throw new Error("Comic not found");
  }

  if (user.publisherProfile?.id === comic.license.publisherId) {
    return user;
  }

  const staffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId: comic.license.publisherId, canUpload: true },
  });
  if (staffLink) {
    return user;
  }

  throw new Error("Not authorized to upload for this comic");
}

export async function requireComicManageAccess(publisherId: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Not authenticated");
  if (user.isBanned) throw new Error("Account is banned");
  if (user.role === "ADMIN") return user;
  if (user.publisherProfile?.id === publisherId) return user;

  const staffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId, canManageComics: true },
  });
  if (staffLink) return user;

  throw new Error("Not authorized to manage comics for this publisher");
}

export async function requireComicManageAccessByComicId(comicId: string): Promise<SessionUser> {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { license: { select: { publisherId: true } } },
  });
  if (!comic) throw new Error("Comic not found");
  return requireComicManageAccess(comic.license.publisherId);
}

export async function getPublisherContext(user: SessionUser | null): Promise<PublisherContext | null> {
  if (!user) return null;

  if (user.publisherProfile) {
    return { publisherId: user.publisherProfile.id, isOwner: true, canManageComics: true };
  }

  const staffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { publisherId: true, canManageComics: true },
  });
  if (staffLink) {
    return { publisherId: staffLink.publisherId, isOwner: false, canManageComics: staffLink.canManageComics };
  }

  return null;
}

export async function getUploaderVerification(userId: string, comicId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, publisherProfile: { select: { id: true } } },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { license: { select: { publisherId: true } } },
  });
  if (!comic) return false;

  const publisherId = comic.license.publisherId;

  if (user.publisherProfile?.id === publisherId) {
    const publisher = await prisma.publisher.findUnique({ where: { id: publisherId }, select: { isVerified: true } });
    return Boolean(publisher?.isVerified);
  }

  const verifiedStaffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId, isVerified: true },
    select: { id: true },
  });
  if (verifiedStaffLink) return true;

  const anyStaffLink = await prisma.publisherStaff.findFirst({
    where: { userId: user.id, publisherId },
    select: { id: true },
  });
  if (!anyStaffLink) return false;

  const publisher = await prisma.publisher.findUnique({ where: { id: publisherId }, select: { isVerified: true } });
  return Boolean(publisher?.isVerified);
}