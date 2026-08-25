"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, invalidateSessionUserCache } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit-log";
import type { Role } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface UserSearchResult {
  id: string;
  telegramId: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  role: Role;
  coinsBalance: number;
  isBanned: boolean;
  createdAt: string;
}

export async function searchUsers(query: {
  q?: string;
  role?: Role;
  banned?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<{ users: UserSearchResult[]; total: number }> {
  await requireAdmin();

  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;

  const where = {
    role: query.role,
    isBanned: query.banned,
    deletedAt: null,
    OR: query.q
      ? [
          { firstName: { contains: query.q, mode: "insensitive" as const } },
          { lastName: { contains: query.q, mode: "insensitive" as const } },
          { username: { contains: query.q, mode: "insensitive" as const } },
        ]
      : undefined,
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        telegramId: true,
        firstName: true,
        lastName: true,
        username: true,
        role: true,
        coinsBalance: true,
        isBanned: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map((u) => ({ ...u, telegramId: u.telegramId.toString(), createdAt: u.createdAt.toISOString() })),
    total,
  };
}

export async function setUserRole(userId: string, role: Role): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId && role !== "ADMIN") {
      return { success: false, error: "نمی‌توانید نقش خودتان را تغییر دهید" };
    }
    await prisma.user.update({ where: { id: userId }, data: { role } });
    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.roleChange",
        targetType: "User",
        targetId: userId,
        metadata: { role },
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function banUser(userId: string, reason: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { success: false, error: "نمی‌توانید خودتان را مسدود کنید" };
    }
    await prisma.user.update({
      where: { id: userId },
      data: { isBanned: true, bannedAt: new Date(), banReason: reason.trim() || null },
    });
    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.ban",
        targetType: "User",
        targetId: userId,
        metadata: { reason: reason.trim() || null },
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function unbanUser(userId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await prisma.user.update({ where: { id: userId }, data: { isBanned: false, bannedAt: null, banReason: null } });
    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.unban",
        targetType: "User",
        targetId: userId,
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function grantCoins(userId: string, amount: number, note: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (amount <= 0) return { success: false, error: "مقدار باید مثبت باشد" };

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { coinsBalance: { increment: amount } } }),
      prisma.transaction.create({
        data: { type: "ADMIN_GRANT", status: "PAID", amount, currency: "COIN", payerId: userId, message: note.trim() || null },
      }),
    ]);

    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.coinGrant",
        targetType: "User",
        targetId: userId,
        metadata: { amount, note: note.trim() || null },
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function revokeCoins(userId: string, amount: number, note: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (amount <= 0) return { success: false, error: "مقدار باید مثبت باشد" };

    const result = await prisma.user.updateMany({
      where: { id: userId, coinsBalance: { gte: amount } },
      data: { coinsBalance: { decrement: amount } },
    });
    if (result.count === 0) {
      return { success: false, error: "موجودی کاربر کافی نیست" };
    }

    await prisma.transaction.create({
      data: { type: "ADMIN_REVOKE", status: "PAID", amount, currency: "COIN", payerId: userId, message: note.trim() || null },
    });

    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.coinRevoke",
        targetType: "User",
        targetId: userId,
        metadata: { amount, note: note.trim() || null },
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function deleteUserAccount(userId: string, confirmationName: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (admin.id === userId) {
      return { success: false, error: "نمی‌توانید حساب خودتان را حذف کنید" };
    }

    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) return { success: false, error: "کاربر یافت نشد" };

    const expectedName = target.username ?? target.firstName;
    if (confirmationName.trim() !== expectedName) {
      return { success: false, error: "نام تاییدیه مطابقت ندارد" };
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        firstName: "کاربر حذف‌شده",
        lastName: null,
        username: null,
        avatarUrl: null,
        bio: null,
        donationLink: null,
        cryptoWalletLabel: null,
        cryptoWalletAddress: null,
        isBanned: true,
        bannedAt: new Date(),
        banReason: "حذف حساب توسط مدیر",
        deletedAt: new Date(),
      },
    });

    await invalidateSessionUserCache(userId);
    after(() =>
      logAuditEvent({
        actorId: admin.id,
        actorRole: admin.role,
        action: "user.delete",
        targetType: "User",
        targetId: userId,
      })
    );
    revalidatePath("/admin/users");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}