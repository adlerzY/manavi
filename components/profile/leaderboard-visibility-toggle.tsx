"use client";

import { useState, useTransition } from "react";
import { setLeaderboardHidden } from "@/app/actions/leaderboard";

export function LeaderboardVisibilityToggle({ current }: { current: boolean }) {
  const [hidden, setHidden] = useState(current);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const previous = hidden;
    const next = !previous;
    setError(null);
    setHidden(next);
    startTransition(async () => {
      try {
        const result = await setLeaderboardHidden(next);
        if (!result.success) {
          setHidden(previous);
          setError(result.error ?? "خطا در ثبت تنظیمات");
        }
      } catch {
        setHidden(previous);
        setError("ذخیره تنظیم ناموفق بود؛ دوباره تلاش کنید.");
      }
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-main">مخفی بودن از رتبه‌بندی</p>
          <p className="mt-1 text-xs text-text-muted">
            با فعال‌سازی این گزینه، نام شما در جدول‌های عمومی رتبه‌بندی نمایش داده نمی‌شود. امتیازهای شما همچنان حساب می‌شوند.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hidden}
          onClick={handleToggle}
          disabled={isPending}
          dir="ltr"
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${hidden ? "bg-primary" : "bg-border"}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${hidden ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}