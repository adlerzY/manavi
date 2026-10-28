"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export async function markNotificationRead(notificationId: string): Promise<{ success: boolean }> {
  const user = await getSessionUser();
  if (!user) return { success: false };

  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { success: true };
}

export async function markAllNotificationsRead(): Promise<{ success: boolean }> {
  const user = await getSessionUser();
  if (!user) return { success: false };

  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/app/notifications");
  revalidatePath("/app");
  return { success: true };
}