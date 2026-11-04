import "server-only";
import { cache } from "react";
import type { AccessSource, ComicAccessMode, Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma";
import { PLATFORM_PUBLISHER_ID } from "./platform-license";
import {
  BASE_PERMISSIONS,
  FULL_PERMISSIONS,
  mergePermissions,
  staffPermissions,
  type PermissionSet,
  type StaffPermission,
} from "./permissions";

export class AccessDeniedError extends Error {
  constructor(message = "دسترسی غیرمجاز") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export interface Actor {
  id: string;
  role: Role;
}

export interface Membership {
  publisherId: string;
  isOwner: boolean;
  permissions: PermissionSet;
}

async function queryMemberships(userId: string): Promise<Membership[]> {
  const [owned, staffRows] = await Promise.all([
    prisma.publisher.findFirst({ where: { contractUserId: userId, status: "ACTIVE" }, select: { id: true } }),
    prisma.publisherStaff.findMany({
      where: { userId, publisher: { status: "ACTIVE" } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const byPublisher = new Map<string, Membership>();
  if (owned) byPublisher.set(owned.id, { publisherId: owned.id, isOwner: true, permissions: FULL_PERMISSIONS });

  for (const row of staffRows) {
    const current = byPublisher.get(row.publisherId);
    if (current?.isOwner) continue;
    byPublisher.set(row.publisherId, {
      publisherId: row.publisherId,
      isOwner: false,
      permissions: mergePermissions(current?.permissions ?? BASE_PERMISSIONS, staffPermissions(row)),
    });
  }

  return [...byPublisher.values()];
}

export const getMemberships = cache(queryMemberships);

export async function publisherHasGlobalLicense(publisherId: string): Promise<boolean> {
  const now = new Date();
  const count = await prisma.license.count({
    where: {
      publisherId,
      scope: "GLOBAL",
      status: "ACTIVE",
      terminatedAt: null,
      startDate: { lte: now },
      OR: [{ endDate: null }, { endDate: { gte: now } }],
    },
  });
  return count > 0;
}

export interface PublisherComicAccess {
  allowed: boolean;
  readOnly: boolean;
  isOwner: boolean;
  via: "EXPLICIT" | "GLOBAL" | null;
}

const DENIED: PublisherComicAccess = { allowed: false, readOnly: false, isOwner: false, via: null };

export async function resolvePublisherComicAccess(
  comic: { id: string; accessMode: ComicAccessMode },
  publisherId: string
): Promise<PublisherComicAccess> {
  const row = await prisma.comicAccess.findUnique({
    where: { comicId_publisherId: { comicId: comic.id, publisherId } },
  });

  if (row) {
    const active = !row.revokedAt && (!row.expiresAt || row.expiresAt > new Date());
    return active ? { allowed: true, readOnly: row.readOnly, isOwner: row.isOwner, via: "EXPLICIT" } : DENIED;
  }

  if (comic.accessMode === "OPEN" && (await publisherHasGlobalLicense(publisherId))) {
    return { allowed: true, readOnly: false, isOwner: false, via: "GLOBAL" };
  }

  return DENIED;
}

const EXPLICIT_ONLY: StaffPermission[] = ["manageComics", "manageMembers", "sensitive"];

export async function assertComicPermission(actor: Actor, comicId: string, permission: StaffPermission) {
  const comic = await prisma.comic.findUnique({
    where: { id: comicId },
    select: { id: true, accessMode: true, emergencyLocked: true, deletedAt: true },
  });
  if (!comic) throw new AccessDeniedError("اثر یافت نشد");
  if (actor.role === "ADMIN") return { comic, publisherId: null as string | null };
  if (comic.deletedAt) throw new AccessDeniedError("این اثر حذف شده است");
  if (comic.emergencyLocked) throw new AccessDeniedError("این اثر توسط مدیریت قفل اضطراری شده است");

  const memberships = await getMemberships(actor.id);
  for (const membership of memberships) {
    if (!membership.permissions[permission]) continue;
    const access = await resolvePublisherComicAccess(comic, membership.publisherId);
    if (!access.allowed) continue;
    if (access.readOnly && permission !== "view") continue;
    if (EXPLICIT_ONLY.includes(permission) && access.via !== "EXPLICIT") continue;
    return { comic, publisherId: membership.publisherId as string | null };
  }

  throw new AccessDeniedError();
}

export async function assertEditionPermission(
  actor: Actor,
  editionId: string,
  permission: StaffPermission,
  expectedComicId?: string
) {
  const edition = await prisma.edition.findUnique({
    where: { id: editionId },
    select: {
      id: true,
      workId: true,
      publisherId: true,
      deletedAt: true,
      emergencyLocked: true,
      work: { select: { id: true, accessMode: true, emergencyLocked: true, deletedAt: true } },
    },
  });
  if (!edition) throw new AccessDeniedError("نسخه یافت نشد");
  if (expectedComicId && edition.workId !== expectedComicId) throw new AccessDeniedError("نسخه متعلق به این اثر نیست");
  if (actor.role === "ADMIN") return edition;
  if (edition.deletedAt || edition.work.deletedAt) throw new AccessDeniedError("این مورد حذف شده است");
  if (edition.emergencyLocked || edition.work.emergencyLocked) {
    throw new AccessDeniedError("این اثر یا نسخه توسط مدیریت قفل اضطراری شده است");
  }

  const membership = (await getMemberships(actor.id)).find((item) => item.publisherId === edition.publisherId);
  if (!membership || !membership.permissions[permission]) throw new AccessDeniedError();

  const access = await resolvePublisherComicAccess(edition.work, edition.publisherId);
  if (!access.allowed) throw new AccessDeniedError("دسترسی ناشر شما به این اثر فعال نیست");
  if (access.readOnly && permission !== "view") throw new AccessDeniedError("دسترسی شما به این اثر فقط‌مشاهده است");

  return edition;
}

export async function ensureComicAccess(
  db: Prisma.TransactionClient,
  input: { comicId: string; publisherId: string; isOwner?: boolean; source: AccessSource; grantedById?: string | null }
): Promise<void> {
  if (input.publisherId === PLATFORM_PUBLISHER_ID) return;
  await db.comicAccess.upsert({
    where: { comicId_publisherId: { comicId: input.comicId, publisherId: input.publisherId } },
    update: {},
    create: {
      comicId: input.comicId,
      publisherId: input.publisherId,
      isOwner: input.isOwner ?? false,
      source: input.source,
      grantedById: input.grantedById ?? null,
    },
  });
}