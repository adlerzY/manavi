import "server-only";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";

export const ROLE_LABELS: Record<Role, string> = {
  USER: "کاربر عادی",
  VIP: "کاربر ویژه",
  STAFF: "عضو تیم",
  PUBLISHER: "ناشر",
  ADMIN: "مدیر",
};

const AVATAR_UPLOAD_ROLES: readonly Role[] = ["VIP", "STAFF", "PUBLISHER", "ADMIN"];

export function canUploadAvatar(user: { role: Role; publisherProfile: { id: string } | null }): boolean {
  return AVATAR_UPLOAD_ROLES.includes(user.role) || Boolean(user.publisherProfile);
}

export async function hasEarningsAccess(user: { id: string; publisherProfile: { id: string } | null }): Promise<boolean> {
  if (user.publisherProfile) return true;

  const [comicRole, chapterRole, allocation, line] = await Promise.all([
    prisma.comicStaff.findFirst({ where: { userId: user.id }, select: { id: true } }),
    prisma.chapterStaff.findFirst({ where: { userId: user.id }, select: { id: true } }),
    prisma.revenueAllocation.findFirst({
      where: { beneficiaryType: "USER", beneficiaryId: user.id },
      select: { id: true },
    }),
    prisma.settlementLine.findFirst({
      where: { beneficiaryType: "USER", beneficiaryId: user.id },
      select: { id: true },
    }),
  ]);

  return Boolean(comicRole || chapterRole || allocation || line);
}

export class RoleChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoleChangeError";
  }
}

export interface RoleChangeOutcome {
  note: string | null;
}

function publisherNameFor(user: { firstName: string; lastName: string | null; username: string | null }): string {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.username || "ناشر جدید";
}

export async function applyRoleChange(userId: string, role: Role): Promise<RoleChangeOutcome> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        deletedAt: true,
        publisherProfile: { select: { id: true } },
        _count: { select: { publisherStaffRoles: true } },
      },
    });
    if (!target || target.deletedAt) throw new RoleChangeError("کاربر یافت نشد");

    let note: string | null = null;

    if (role === "PUBLISHER" && !target.publisherProfile) {
      await tx.publisher.create({
        data: { name: publisherNameFor(target), contactEmail: "", contractUserId: target.id },
      });
      note = "ناشر جدید برای این کاربر ساخته شد. برای ساخت عنوان، از بخش لایسنس‌ها یک لایسنس فعال برایش ثبت کنید.";
    }

    if ((role === "USER" || role === "VIP" || role === "STAFF") && target.publisherProfile) {
      await tx.publisher.update({
        where: { id: target.publisherProfile.id },
        data: { contractUserId: null },
      });
    }

    if (role === "USER" || role === "VIP") {
      await tx.publisherStaff.deleteMany({ where: { userId: target.id } });
    }

    if (role === "STAFF" && target._count.publisherStaffRoles === 0) {
      note = "این کاربر هنوز عضو تیم هیچ ناشری نیست. ناشر باید او را از بخش «تیم» اضافه کند تا به پنل دسترسی پیدا کند.";
    }

    await tx.user.update({ where: { id: target.id }, data: { role } });

    return { note };
  });
}