"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Mascot } from "@/components/ui/mascot";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface CoinBalanceHeaderProps {
  coinsBalance: number;
  authenticated: boolean;
  unreadNotifications?: number;
  firstName?: string | null;
}

export function CoinBalanceHeader({
  coinsBalance,
  authenticated,
  unreadNotifications = 0,
  firstName = null,
}: CoinBalanceHeaderProps) {
  const [open, setOpen] = useState(false);

  const title = authenticated && firstName ? firstName : "ماناوی";
  const subtitle = authenticated ? "سلام، امروز چی بخونیم؟" : "مانهوا و مانگا فارسی";

  return (
    <>
      <header className="px-4 pb-3 pt-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <Link href={authenticated ? "/app/profile" : "/app"} className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/30"
              style={{ backgroundImage: "linear-gradient(135deg, rgba(0,220,100,0.22), rgba(236,72,153,0.16))" }}
            >
              <Mascot
                pose="wave"
                size={44}
                priority
                fallback={<Image src="/favicon.svg" alt="" width={28} height={28} className="rounded-md" />}
              />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[11px] text-text-muted">{subtitle}</span>
              <span className="block truncate text-base font-semibold text-text-main">{title}</span>
            </span>
          </Link>

          <div className="flex flex-shrink-0 items-center gap-2">
            {authenticated && (
              <NotificationBell
                initialUnread={unreadNotifications}
                buttonClassName="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-main"
              />
            )}
            <button
              type="button"
              onClick={() => authenticated && setOpen(true)}
              disabled={!authenticated}
              className="flex min-h-10 items-center gap-1.5 rounded-full border border-primary/30 bg-surface px-3.5 py-1.5 text-sm font-medium text-text-main disabled:opacity-60"
            >
              🪙 {coinsBalance.toLocaleString("fa-IR")}
            </button>
          </div>
        </div>
      </header>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="کیف پول">
        <div className="flex items-center justify-between rounded-xl bg-background px-4 py-3">
          <span className="text-sm text-text-muted">موجودی سکه</span>
          <span className="text-lg font-semibold text-primary">🪙 {coinsBalance.toLocaleString("fa-IR")}</span>
        </div>
        <Link
          href="/app/shop"
          onClick={() => setOpen(false)}
          className="block rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
        >
          شارژ سکه
        </Link>
        <Link
          href="/app/wallet"
          onClick={() => setOpen(false)}
          className="block rounded-xl border border-border px-4 py-3 text-center text-sm text-text-main"
        >
          تاریخچه تراکنش‌ها
        </Link>
        <Link
          href="/app/free"
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2"
        >
          <Mascot pose="gift" size={48} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text-main">سکه نداری؟</span>
            <span className="mt-0.5 block text-xs text-text-muted">آثار تمام رایگان رو بخون</span>
          </span>
        </Link>
      </BottomSheet>
    </>
  );
}