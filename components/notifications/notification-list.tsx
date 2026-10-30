"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, BookOpen, CheckCircle2, MessageSquare, Wallet, X } from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { markAllNotificationsRead, markNotificationRead } from "@/app/actions/notifications";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdLabel: string;
}

interface NotificationListProps {
  initialItems: NotificationItem[];
  onMarkRead?: () => void;
  onMarkAll?: () => void;
  onNavigate?: () => void;
}

const TYPE_ICONS: Record<NotificationType, ReactNode> = {
  NEW_CHAPTER: <BookOpen size={20} />,
  COMMENT_REPLY: <MessageSquare size={20} />,
  PAYOUT_PAID: <Wallet size={20} />,
  COMIC_APPROVED: <CheckCircle2 size={20} />,
  COMIC_REJECTED: <X size={20} />,
  CHAPTER_APPROVED: <CheckCircle2 size={20} />,
  CHAPTER_REJECTED: <X size={20} />,
  SYSTEM: <Bell size={20} />,
};

const NEGATIVE_TYPES: NotificationType[] = ["COMIC_REJECTED", "CHAPTER_REJECTED"];

export function NotificationList({ initialItems, onMarkRead, onMarkAll, onNavigate }: NotificationListProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();

  const unreadCount = items.filter((item) => !item.read).length;

  async function handleOpen(item: NotificationItem) {
    if (!item.read) {
      setItems((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)));
      onMarkRead?.();
      await markNotificationRead(item.id).catch(() => {});
    }
    if (item.href) {
      onNavigate?.();
      router.push(item.href);
    }
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((entry) => ({ ...entry, read: true })));
    onMarkAll?.();
    startTransition(async () => {
      await markAllNotificationsRead().catch(() => {});
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3 rounded-md border border-border bg-surface px-6 py-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell size={22} />
        </div>
        <p className="text-sm leading-7 text-text-muted">
          هنوز اعلانی ندارید. با بوکمارک کردن آثار، از انتشار چپترهای جدید همین‌جا باخبر می‌شوید.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">
          {unreadCount > 0 ? `${unreadCount.toLocaleString("fa-IR")} اعلان خوانده‌نشده` : "همه‌ی اعلان‌ها خوانده شده‌اند"}
        </p>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={isPending}
            className="min-h-11 px-2 text-sm text-primary disabled:opacity-50"
          >
            خواندن همه
          </button>
        )}
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => handleOpen(item)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-right ${item.read ? "bg-background" : "bg-primary/5"}`}
          >
            <span
              className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                NEGATIVE_TYPES.includes(item.type) ? "bg-red-500/10 text-red-400" : "bg-primary/10 text-primary"
              }`}
            >
              {TYPE_ICONS[item.type]}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${item.read ? "text-text-muted" : "font-medium text-text-main"}`}>
                {item.title}
              </span>
              {item.body && <span className="mt-0.5 block text-sm leading-6 text-text-muted">{item.body}</span>}
              <span className="mt-1 block text-xs text-text-muted">{item.createdLabel}</span>
            </span>
            {!item.read && <span className="mt-2 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </div>
  );
}