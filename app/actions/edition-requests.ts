"use server";

import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { LANGUAGE_LABELS } from "@/lib/languages";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function requestEdition(workId: string, language: string, reason?: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای ثبت درخواست باید وارد شوید" };
    if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };
    if (!(language in LANGUAGE_LABELS)) return { success: false, error: "زبان نامعتبر است" };

    const allowed = await checkRateLimit(`edition-request:${user.id}`, 5);
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است" };

    const work = await prisma.comic.findUnique({ where: { id: workId }, select: { id: true } });
    if (!work) return { success: false, error: "اثر یافت نشد" };

    const cleanReason = reason?.trim().slice(0, 300) || null;
    await prisma.editionRequest.upsert({
      where: { userId_workId: { userId: user.id, workId } },
      update: { language, reason: cleanReason, status: "ACTIVE" },
      create: { userId: user.id, workId, language, reason: cleanReason },
    });
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}

export async function cancelEditionRequest(workId: string): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای این عملیات باید وارد شوید" };

    await prisma.editionRequest.updateMany({
      where: { userId: user.id, workId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}