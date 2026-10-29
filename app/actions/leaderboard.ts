"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, invalidateSessionUserCache } from "@/lib/auth";
import { safeError } from "@/lib/errors";
import { LEADERBOARD_TAG } from "@/lib/engagement";

export async function setLeaderboardHidden(hidden: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await getSessionUser();
    if (!user) return { success: false, error: "برای این عملیات باید وارد شوید" };

    await prisma.user.update({ where: { id: user.id }, data: { leaderboardHidden: Boolean(hidden) } });
    await invalidateSessionUserCache(user.id);
    revalidateTag(LEADERBOARD_TAG, "max");
    revalidatePath("/app/profile");
    revalidatePath("/app/leaderboard");
    return { success: true };
  } catch (err) {
    return safeError(err);
  }
}