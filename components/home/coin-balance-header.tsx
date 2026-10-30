"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";

interface CoinBalanceHeaderProps {
  coinsBalance: number;
  authenticated: boolean;
  unreadNotifications?: number;
}

const ALWAYS_VISIBLE_Y = 48;
const SCROLL_THRESHOLD_PX = 10;

export function CoinBalanceHeader({ coinsBalance, authenticated, unreadNotifications = 0 }: CoinBalanceHeaderProps) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const anchorYRef = useRef(0);

  useEffect(() => {
    anchorYRef.current = window.scrollY;
    let frame: number | null = null;

    function handleScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const y = window.scrollY;
        if (y <= ALWAYS_VISIBLE_Y) {
          setHidden(false);
          anchorYRef.current = y;
          return;
        }
        const delta = y - anchorYRef.current;
        if (Math.abs(delta) >= SCROLL_THRESHOLD_PX) {
          setHidden(delta > 0);
          anchorYRef.current = y;
        }
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <header
        style={{
          transform: hidden ? "translateY(calc(-100% - var(--tg-content-safe-area-top, 0px)))" : "translateY(0)",
        }}
        className="sticky top-[var(--tg-content-safe-area-top,0px)] z-30 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2.5 backdrop-blur-md transition-transform duration-200"
      >
        <div className="flex items-center gap-2">
          <Image src="/favicon.svg" alt="ماناوی" width={28} height={28} priority className="rounded-md" />
          <span className="text-sm font-semibold text-text-main">ماناوی</span>
        </div>

        <div className="flex items-center gap-2">
          {authenticated && (
            <NotificationBell
              initialUnread={unreadNotifications}
              buttonClassName="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text-main"
            />
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