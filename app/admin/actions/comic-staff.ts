"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireComicManageAccessByComicId } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import { getPrimaryEditionId } from "@/lib/editions";
import { BPS_DENOMINATOR } from "@/lib/units";
import { StaffRole } from "@prisma/client";

interface ActionResult<T = undefined> { success: boolean; error?: string; data?: T }

export interface ComicStaffRow {
  id: string;
  roleTitle: StaffRole;
  shareBps: number;
  user: { id: string; firstName: string; username: string | null };
}

export async function listComicStaff(comicId: string): Promise<ComicStaffRow[]> {
  await requireComicManageAccessByComicId(comicId);
  return prisma.comicStaff.findMany({
    where: { comicId },
    select: {
      id: true,
      roleTitle: true,
      shareBps: true,
      user: { select: { id: true, firstName: true, username: true } },
    },
  });
}

export async function addComicStaff(comicId: string, telegramUsername: string, roleTitle: StaffRole): Promise<ActionResult> {
  try {
    await requireComicManageAccessByComicId(comicId);
    if (!Object.values(StaffRole).includes(roleTitle)) {
      return { success: false, error: "نقش نامعتبر است" };
    }

    const username = telegramUsername.trim().replace("@", "");
    if (!username) return { success: false, error: "یوزرنیم تلگرام الزامی است" };

    const targetUser = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" }, deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    if (!targetUser) return { success: false, error: "کاربری با این یوزرنیم پیدا نشد" };
    if (targetUser.isBanned) return { success: false, error: "این کاربر مسدود است" };

    const editionId = await getPrimaryEditionId(comicId);

    await prisma.comicStaff.upsert({
      where: { comicId_userId_roleTitle: { comicId, userId: targetUser.id, roleTitle } },
      update: {},
      create: { comicId, editionId, userId: targetUser.id, roleTitle },
    });

    revalidatePath(`/admin/comics/${comicId}`);
    revalidatePath(`/publisher/comics/${comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function setComicStaffShare(comicId: string, staffId: string, shareBps: number): Promise<ActionResult> {
  try {
    const actor = await requireComicManageAccessByComicId(comicId);
    if (!Number.isInteger(shareBps) || shareBps < 0 || shareBps > BPS_DENOMINATOR) {
      return { success: false, error: "سهم باید بین ۰ تا ۱۰۰ درصد باشد" };
    }

    const staff = await prisma.comicStaff.findMany({
      where: { comicId },
      select: { id: true, userId: true, roleTitle: true, shareBps: true },
    });
    const target = staff.find((s) => s.id === staffId);
    if (!target) return { success: false, error: "عضو یافت نشد" };

    const total = staff.reduce((sum, s) => sum + (s.id === staffId ? shareBps : s.shareBps), 0);
    if (total > BPS_DENOMINATOR) {
      return { success: false, error: "جمع سهم اعضا نمی‌تواند بیش از ۱۰۰٪ باشد" };
    }

    await prisma.$transaction([
      prisma.comicStaff.update({ where: { id: staffId }, data: { shareBps } }),
      prisma.chapterStaff.updateMany({
        where: { userId: target.userId, roleTitle: target.roleTitle, chapter: { comicId } },
        data: { shareBps },
      }),
    ]);

    after(() =>
      logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: "comicStaff.shareChange",
        targetType: "ComicStaff",
        targetId: staffId,
        metadata: { comicId, userId: target.userId, role: target.roleTitle, shareBps },
      })
    );

    revalidatePath(`/admin/comics/${comicId}`);
    revalidatePath(`/publisher/comics/${comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function removeComicStaff(comicId: string, staffId: string): Promise<ActionResult> {
  try {
    const actor = await requireComicManageAccessByComicId(comicId);

    const target = await prisma.comicStaff.findFirst({
      where: { id: staffId, comicId },
      select: { id: true, userId: true, roleTitle: true },
    });
    if (!target) return { success: true };

    await prisma.$transaction([
      prisma.chapterStaff.updateMany({
        where: { userId: target.userId, roleTitle: target.roleTitle, chapter: { comicId } },
        data: { shareBps: 0 },
      }),
      prisma.comicStaff.delete({ where: { id: target.id } }),
    ]);

    after(() =>
      logAuditEvent({
        actorId: actor.id,
        actorRole: actor.role,
        action: "comicStaff.shareChange",
        targetType: "ComicStaff",
        targetId: staffId,
        metadata: { comicId, userId: target.userId, role: target.roleTitle, shareBps: 0, removed: true },
      })
    );

    revalidatePath(`/admin/comics/${comicId}`);
    revalidatePath(`/publisher/comics/${comicId}`);
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}