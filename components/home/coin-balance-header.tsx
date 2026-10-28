"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell } from "lucide-react";

interface CoinBalanceHeaderProps {
  coinsBalance: number;
  authenticated: boolean;
  unreadNotifications?: number;
}

export function CoinBalanceHeader({ coinsBalance, authenticated, unreadNotifications = 0 }: CoinBalanceHeaderProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-[var(--tg-content-safe-area-top,0px)] z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Image src="/favicon.svg" alt="ماناوی" width={28} height={28} priority className="rounded-md" />
          <span className="text-sm font-semibold text-text-main">ماناوی</span>
        </div>

        <div className="flex items-center gap-2">
          {authenticated && (
            <Link
              href="/app/notifications"
              aria-label={
                unreadNotifications > 0
                  ? `اعلان‌ها، ${unreadNotifications.toLocaleString("fa-IR")} خوانده‌نشده`
                  : "اعلان‌ها"
              }
              className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-main"
            >
              <Bell size={18} />
              {unreadNotifications > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-4 text-accent-foreground">
                  {unreadNotifications > 99 ? "۹۹+" : unreadNotifications.toLocaleString("fa-IR")}
                </span>
              )}
            </Link>
          )}

          <button
            onClick={() => authenticated && setOpen(true)}
            disabled={!authenticated}
            className="flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text-main disabled:opacity-60"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            🪙 {coinsBalance.toLocaleString("fa-IR")}
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-t-2xl border border-border bg-surface p-6">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-md bg-background px-4 py-3">
                <span className="text-sm text-text-muted">موجودی سکه</span>
                <span className="text-lg font-semibold text-primary">🪙 {coinsBalance.toLocaleString("fa-IR")}</span>
              </div>
              <Link href="/app/shop" onClick={() => setOpen(false)} className="block rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground">
                شارژ سکه
              </Link>
              <Link href="/app/wallet" onClick={() => setOpen(false)} className="block rounded-md border border-border px-4 py-3 text-center text-sm text-text-main">
                تاریخچه تراکنش‌ها
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}