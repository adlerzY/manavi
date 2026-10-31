"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { checkRateLimit } from "@/lib/moderation";
import { safeError } from "@/lib/errors";
import { donateCoins } from "@/lib/donations";
import { createNotifications } from "@/lib/notifications";
import { maybeEvaluateAchievements } from "@/lib/achievement-engine";

interface ActionResult<T = undefined> {
  success: boolean;
  error?: string;
  data?: T;
}

export async function getDonationBalance(): Promise<number | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { coinsBalance: true } });
  return row?.coinsBalance ?? 0;
}

export async function donateWithCoins(input: {
  receiverId: string;
  coins: number;
  message?: string;
  isAnonymous?: boolean;
  idempotencyKey?: string;
}): Promise<ActionResult<{ balance: number }>> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای حمایت مالی باید وارد شوید" };
    if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

    const allowed = await checkRateLimit(`donate:${user.id}`, 10, { failClosed: true });
    if (!allowed) return { success: false, error: "تعداد درخواست‌ها بیش از حد مجاز است، کمی صبر کنید" };

    const key = `${user.id}:${(input.idempotencyKey?.trim() || randomUUID()).slice(0, 80)}`;
    const result = await donateCoins({
      donorId: user.id,
      receiverId: input.receiverId,
      coins: Number(input.coins),
      message: input.message,
      isAnonymous: Boolean(input.isAnonymous),
      idempotencyKey: key,
    });
    if (!result.success || !result.donationId) return { success: false, error: result.error };

    await invalidateSessionUserCache(user.id);
    revalidatePath("/app/wallet");
    revalidatePath(`/app/team/${input.receiverId}`);

    if (!result.duplicate) {
      const donationId = result.donationId;
      const donorName = input.isAnonymous ? "یک حامی ناشناس" : user.username ? `@${user.username}` : user.firstName;
      const coins = Number(input.coins);
      const text = input.message?.trim().slice(0, 200);
      after(() =>
        Promise.all([
          createNotifications([
            {
              userId: input.receiverId,
              type: "SYSTEM",
              title: "حمایت مالی جدید",
              body: `${donorName} ${coins.toLocaleString("fa-IR")} سکه برای شما فرستاد${text ? ` — ${text}` : ""}`,
              href: "/app/earnings",
              dedupeKey: `donation:${donationId}`,
            },
          ]),
          maybeEvaluateAchievements(user.id, { force: true }),
        ]).catch(() => {})
      );
    }

    const fresh = await prisma.user.findUnique({ where: { id: user.id }, select: { coinsBalance: true } });
    return { success: true, data: { balance: fresh?.coinsBalance ?? 0 } };
  } catch (err) {
    return safeError(err);
  }
}