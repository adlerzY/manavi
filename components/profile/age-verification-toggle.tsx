"use client";

import { useState, useTransition } from "react";
import { setAgeVerified } from "@/app/actions/age-verification";

export function AgeVerificationToggle({ current }: { current: boolean }) {
  const [verified, setVerified] = useState(current);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    const next = !verified;
    setError(null);
    setVerified(next);
    const previous = verified;
    startTransition(async () => {
      try {
        const result = await setAgeVerified(next);
        if (!result.success) {
          setVerified(previous);
          setError(result.error ?? "خطا در ثبت تنظیمات");
        }
      } catch {
        setVerified(previous);
        setError("ذخیره تنظیم نمایش محتوای +۱۸ ناموفق بود؛ اتصال سرور را بررسی و دوباره تلاش کنید.");
      }
    });
  }

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-main">نمایش محتوای بزرگسال (۱۸+)</p>
          <p className="mt-1 text-xs text-text-muted">
            با فعال‌سازی این گزینه تایید می‌کنید که بالای ۱۸ سال سن دارید. عناوین و چپترهای ۱۸+ فقط با فعال بودن این گزینه نمایش داده می‌شوند.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={verified}
          onClick={handleToggle}
          disabled={isPending}
          dir="ltr"
          className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            verified ? "bg-primary" : "bg-border"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              verified ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}