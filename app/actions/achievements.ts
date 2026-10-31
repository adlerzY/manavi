"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { achievementByKey } from "@/lib/achievements";

interface ActionResult {
  success: boolean;
  error?: string;
}

export async function setActiveTitle(key: string | null): Promise<ActionResult> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای این عملیات باید وارد شوید" };
    if (user.isBanned) return { success: false, error: "حساب شما مسدود شده است" };

    if (key !== null) {
      if (!achievementByKey(key)) return { success: false, error: "تگ نامعتبر است" };
      const owned = await prisma.userAchievement.findUnique({
        where: { userId_key: { userId: user.id, key } },
        select: { key: true },
      });
      if (!owned) return { success: false, error: "این دستاورد هنوز برای شما باز نشده است" };
    }

    await prisma.user.update({ where: { id: user.id }, data: { activeTitle: key } });
    await invalidateSessionUserCache(user.id);
    revalidatePath("/app/achievements");
    revalidatePath("/app/profile");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}