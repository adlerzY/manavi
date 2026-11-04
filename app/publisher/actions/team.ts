"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { StaffRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  getPublisherContext,
  invalidateSessionUserCache,
  type PublisherContext,
  type SessionUser,
} from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { PERMISSION_KEYS, type PermissionSet } from "@/lib/permissions";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

async function memberManager(): Promise<{ user: SessionUser; context: PublisherContext } | null> {
  const user = await getSessionUser();
  if (!user || user.isBanned) return null;
  const context = await getPublisherContext(user);
  if (!context || !context.permissions.manageMembers) return null;
  return { user, context };
}

function clamp(requested: Partial<PermissionSet>, context: PublisherContext): Partial<PermissionSet> {
  const result: Partial<PermissionSet> = {};
  for (const key of PERMISSION_KEYS) {
    if (key === "view") continue;
    const allowed = context.isOwner || (context.permissions[key] && key !== "manageMembers" && key !== "sensitive");
    result[key] = Boolean(requested[key]) && allowed;
  }
  return result;
}

function toFlags(permissions: Partial<PermissionSet>) {
  return {
    canUpload: Boolean(permissions.upload),
    canPublish: Boolean(permissions.publish),
    canEdit: Boolean(permissions.edit),
    canDelete: Boolean(permissions.delete),
    canManageEditions: Boolean(permissions.manageEditions),
    canManageComics: Boolean(permissions.manageComics),
    canManageMembers: Boolean(permissions.manageMembers),
    canSensitive: Boolean(permissions.sensitive),
  };
}

export async function addPublisherStaff(input: {
  telegramUsername: string;
  role: StaffRole;
  permissions: Partial<PermissionSet>;
}): Promise<ActionResult> {
  try {
    const auth = await memberManager();
    if (!auth) return { success: false, error: "دسترسی غیرمجاز" };
    const { user, context } = auth;

    if (!Object.values(StaffRole).includes(input.role)) return { success: false, error: "نقش نامعتبر است" };

    const username = input.telegramUsername.trim().replace("@", "");
    if (!username) return { success: false, error: "یوزرنیم تلگرام الزامی است" };

    const [targetUser, publisher] = await Promise.all([
      prisma.user.findFirst({
        where: { username: { equals: username, mode: "insensitive" }, deletedAt: null },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.publisher.findUnique({ where: { id: context.publisherId }, select: { contractUserId: true } }),
    ]);
    if (!targetUser) return { success: false, error: "کاربری با این یوزرنیم پیدا نشد" };
    if (targetUser.id === user.id || targetUser.id === publisher?.contractUserId) {
      return { success: false, error: "مالک ناشر نیازی به افزودن خودش به تیم ندارد" };
    }
    if (targetUser.isBanned) return { success: false, error: "این کاربر مسدود است" };

    const flags = toFlags(clamp(input.permissions, context));

    await prisma.$transaction(async (tx) => {
      await tx.publisherStaff.upsert({
        where: { publisherId_userId_role: { publisherId: context.publisherId, userId: targetUser.id, role: input.role } },
        update: flags,
        create: { publisherId: context.publisherId, userId: targetUser.id, role: input.role, ...flags },
      });

      if (targetUser.role === "USER" || targetUser.role === "VIP") {
        await tx.user.update({ where: { id: targetUser.id }, data: { role: "STAFF" } });
      }
    });

    await invalidateSessionUserCache(targetUser.id);

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "publisherStaff.permissionChange",
        targetType: "User",
        targetId: targetUser.id,
        metadata: { role: input.role, ...flags },
      })
    );

    revalidatePath("/publisher/team");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function updatePublisherStaffPermissions(
  staffId: string,
  permissions: Partial<PermissionSet>
): Promise<ActionResult> {
  try {
    const auth = await memberManager();
    if (!auth) return { success: false, error: "دسترسی غیرمجاز" };
    const { user, context } = auth;

    const row = await prisma.publisherStaff.findFirst({ where: { id: staffId, publisherId: context.publisherId } });
    if (!row) return { success: false, error: "عضو یافت نشد" };
    if (row.userId === user.id) return { success: false, error: "نمی‌توانید مجوزهای خودتان را تغییر دهید" };
    if (!context.isOwner && (row.canManageMembers || row.canSensitive)) {
      return { success: false, error: "فقط مالک ناشر می‌تواند مجوزهای این عضو را تغییر دهد" };
    }

    const flags = toFlags(clamp(permissions, context));
    await prisma.publisherStaff.update({ where: { id: row.id }, data: flags });
    await invalidateSessionUserCache(row.userId);

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "publisherStaff.permissionChange",
        targetType: "User",
        targetId: row.userId,
        metadata: { role: row.role, ...flags },
      })
    );

    revalidatePath("/publisher/team");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function removePublisherStaff(staffId: string): Promise<ActionResult> {
  try {
    const auth = await memberManager();
    if (!auth) return { success: false, error: "دسترسی غیرمجاز" };
    const { user, context } = auth;

    const staffRow = await prisma.publisherStaff.findFirst({
      where: { id: staffId, publisherId: context.publisherId },
      select: { userId: true, role: true, canManageMembers: true, canSensitive: true },
    });
    if (!staffRow) return { success: true };
    if (staffRow.userId === user.id) return { success: false, error: "نمی‌توانید خودتان را حذف کنید" };
    if (!context.isOwner && (staffRow.canManageMembers || staffRow.canSensitive)) {
      return { success: false, error: "فقط مالک ناشر می‌تواند این عضو را حذف کند" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.publisherStaff.deleteMany({ where: { id: staffId, publisherId: context.publisherId } });

      const remaining = await tx.publisherStaff.count({ where: { userId: staffRow.userId } });
      if (remaining === 0) {
        await tx.user.updateMany({
          where: { id: staffRow.userId, role: "STAFF", publisherProfile: { is: null } },
          data: { role: "USER" },
        });
      }
    });

    await invalidateSessionUserCache(staffRow.userId);

    after(() =>
      logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "publisherStaff.permissionChange",
        targetType: "User",
        targetId: staffRow.userId,
        metadata: { role: staffRow.role, removed: true },
      })
    );

    revalidatePath("/publisher/team");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}