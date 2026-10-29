"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { after } from "next/server";
import { notifyAdmins } from "@/lib/notifications";
import type { ReportCategory, ReportTargetType } from "@prisma/client";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

const TARGET_TYPES: ReportTargetType[] = ["EDITION_CHAPTER", "COMMENT", "EDITION", "WORK"];
const CATEGORIES: ReportCategory[] = [
  "TRANSLATION_ERROR",
  "BROKEN_IMAGES",
  "UNLABELED_SPOILER",
  "INAPPROPRIATE",
  "RIGHTS_VIOLATION",
  "MISLEADING_CREDIT",
  "BILLING_ACCESS",
];

async function targetExists(type: ReportTargetType, id: string): Promise<boolean> {
  switch (type) {
    case "EDITION_CHAPTER":
      return Boolean(await prisma.chapter.findUnique({ where: { id }, select: { id: true } }));
    case "COMMENT":
      return Boolean(await prisma.comment.findUnique({ where: { id }, select: { id: true } }));
    case "EDITION":
      return Boolean(await prisma.edition.findUnique({ where: { id }, select: { id: true } }));
    case "WORK":
      return Boolean(await prisma.comic.findUnique({ where: { id }, select: { id: true } }));
    default:
      return false;
  }
}

export async function submitReport(input: {
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  details?: string;
}): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای ثبت گزارش باید وارد شوید" };
    if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
    if (!TARGET_TYPES.includes(input.targetType) || !CATEGORIES.includes(input.category)) {
      return { success: false, error: "گزارش نامعتبر است" };
    }

    const allowed = await checkRateLimit(`report:${user.id}`, 5);
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است" };

    if (!(await targetExists(input.targetType, input.targetId))) {
      return { success: false, error: "مورد گزارش‌شده یافت نشد" };
    }

    const open = await prisma.contentReport.findFirst({
      where: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        status: { in: ["OPEN", "UNDER_REVIEW"] },
      },
      select: { id: true },
    });
    if (open) return { success: true };

    const created = await prisma.contentReport.create({
      data: {
        reporterId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        category: input.category,
        details: input.details?.trim().slice(0, 1000) || null,
      },
      select: { id: true },
    });

    after(() =>
      notifyAdmins({
        type: "SYSTEM",
        title: "گزارش جدید از کاربران",
        body: input.details?.trim().slice(0, 120) || null,
        href: "/admin/moderation?tab=reports",
        dedupeKey: `report-new:${created.id}`,
      }).catch(() => {})
    );

    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}