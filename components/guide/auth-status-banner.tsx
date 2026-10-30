"use client";

import { useState } from "react";
import { RefreshCw, Send, X } from "lucide-react";
import { useTelegramAuth } from "@/components/providers/telegram-auth-provider";
import { getTelegramLinks } from "@/lib/site-config";

export function AuthStatusBanner() {
  const { status } = useTelegramAuth();
  const [dismissed, setDismissed] = useState(false);

  if (status !== "error" || dismissed) return null;

  const links = getTelegramLinks();

  return (
    <div
      role="status"
      style={{ top: "calc(var(--tg-content-safe-area-top, 0px) + 0.5rem)" }}
      className="fixed inset-x-3 z-[55] mx-auto max-w-md rounded-2xl border border-accent/40 bg-surface/95 p-3 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs leading-6 text-text-main">
          ورود به حساب انجام نشد. اگه داخل تلگرام هستی دوباره تلاش کن، وگرنه ماناوی رو از داخل تلگرام باز کن.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="بستن"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-background"
        >
          <X size={16} />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-medium text-primary-foreground"
        >
          <RefreshCw size={14} />
          تلاش دوباره
        </button>
        {links && (
          <a
            href={links.webLink}
            rel="noreferrer"
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-xs text-text-main"
          >
            <Send size={14} />
            باز کردن در تلگرام
          </a>
        )}
      </div>
    </div>
  );
}