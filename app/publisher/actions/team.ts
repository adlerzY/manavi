"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import type { StaffRole } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function addPublisherStaff(input: {
  telegramUsername: string;
  role: StaffRole;
  canUpload: boolean;
  canManageComics?: boolean;
}): Promise<ActionResult> {
  try {
    const publisherUser = await getSessionUser();
    if (!publisherUser?.publisherProfile) {
      return { success: false, error: "دسترسی غیرمجاز" };
    }
    if (publisherUser.isBanned) {
      return { success: false, error: "حساب شما مسدود شده است" };
    }

    const targetUser = await prisma.user.findFirst({
      where: { username: input.telegramUsername.replace("@", ""), deletedAt: null },
    });
    if (!targetUser) {
      return { success: false, error: "کاربری با این یوزرنیم پیدا نشد" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.publisherStaff.upsert({
        where: {
          publisherId_userId_role: {
            publisherId: publisherUser.publisherProfile!.id,
            userId: targetUser.id,
            role: input.role,
          },
        },
        update: {
          canUpload: input.canUpload,
          canManageComics: input.canManageComics ?? false,
        },
        create: {
          publisherId: publisherUser.publisherProfile!.id,
          userId: targetUser.id,
          role: input.role,
          canUpload: input.canUpload,
          canManageComics: input.canManageComics ?? false,
        },
      });

      if (targetUser.role === "USER" || targetUser.role === "VIP") {
        await tx.user.update({ where: { id: targetUser.id }, data: { role: "STAFF" } });
      }
    });

    await invalidateSessionUserCache(targetUser.id);

    after(() =>
      logAuditEvent({
        actorId: publisherUser.id,
        actorRole: publisherUser.role,
        action: "publisherStaff.permissionChange",
        targetType: "User",
        targetId: targetUser.id,
        metadata: {
          role: input.role,
          canUpload: input.canUpload,
          canManageComics: input.canManageComics ?? false,
        },
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
    const publisherUser = await getSessionUser();
    if (!publisherUser?.publisherProfile) {
      return { success: false, error: "دسترسی غیرمجاز" };
    }
    if (publisherUser.isBanned) {
      return { success: false, error: "حساب شما مسدود شده است" };
    }

    const publisherId = publisherUser.publisherProfile.id;

    const staffRow = await prisma.publisherStaff.findFirst({
      where: { id: staffId, publisherId },
      select: { userId: true },
    });
    if (!staffRow) return { success: true };

    await prisma.$transaction(async (tx) => {
      await tx.publisherStaff.deleteMany({ where: { id: staffId, publisherId } });

      const remaining = await tx.publisherStaff.count({ where: { userId: staffRow.userId } });
      if (remaining === 0) {
        await tx.user.updateMany({
          where: { id: staffRow.userId, role: "STAFF", publisherProfile: { is: null } },
          data: { role: "USER" },
        });
      }
    });

    await invalidateSessionUserCache(staffRow.userId);

    revalidatePath("/publisher/team");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}