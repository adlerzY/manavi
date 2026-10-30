"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import type { NotificationItem } from "@/components/notifications/notification-list";

export async function getMyNotifications(): Promise<NotificationItem[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const { items } = await listNotifications(user.id, 1);
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    href: item.href,
    read: item.read,
    createdLabel: new Date(item.createdAt).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" }),
  }));
}

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