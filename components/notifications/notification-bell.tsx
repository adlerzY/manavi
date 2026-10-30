"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { getMyNotifications } from "@/app/actions/notifications";
import { NotificationList, type NotificationItem } from "./notification-list";

interface NotificationBellProps {
  initialUnread: number;
  buttonClassName?: string;
  iconSize?: number;
}

export function NotificationBell({ initialUnread, buttonClassName, iconSize = 18 }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setFailed(false);
    getMyNotifications()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `اعلان‌ها، ${unread.toLocaleString("fa-IR")} خوانده‌نشده` : "اعلان‌ها"}
        className={`relative ${buttonClassName ?? ""}`}
      >
        <Bell size={iconSize} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-4 text-accent-foreground">
            {unread > 99 ? "۹۹+" : unread.toLocaleString("fa-IR")}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <BottomSheet open={open} onClose={() => setOpen(false)} title="اعلان‌ها">
            {failed ? (
              <p className="py-6 text-center text-sm text-text-muted">دریافت اعلان‌ها ناموفق بود</p>
            ) : items === null ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <NotificationList
                initialItems={items}
                onMarkRead={() => setUnread((prev) => Math.max(0, prev - 1))}
                onMarkAll={() => setUnread(0)}
                onNavigate={() => setOpen(false)}
              />
            )}
          </BottomSheet>,
          document.body
        )}
    </>
  );
}