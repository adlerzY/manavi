"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
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
      where: { username: input.telegramUsername.replace("@", "") },
    });
    if (!targetUser) {
      return { success: false, error: "کاربری با این یوزرنیم پیدا نشد" };
    }

    await prisma.publisherStaff.upsert({
      where: {
        publisherId_userId_role: {
          publisherId: publisherUser.publisherProfile.id,
          userId: targetUser.id,
          role: input.role,
        },
      },
      update: {
        canUpload: input.canUpload,
        canManageComics: input.canManageComics ?? false,
      },
      create: {
        publisherId: publisherUser.publisherProfile.id,
        userId: targetUser.id,
        role: input.role,
        canUpload: input.canUpload,
        canManageComics: input.canManageComics ?? false,
      },
    });

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

    await prisma.publisherStaff.deleteMany({
      where: {
        id: staffId,
        publisherId: publisherUser.publisherProfile.id,
      },
    });

    revalidatePath("/publisher/team");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}