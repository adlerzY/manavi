"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { activateLicense, terminateLicense } from "@/app/admin/actions/catalog-actions";

export function LicenseRowActions({ licenseId, status }: { licenseId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleActivate() {
    setError(null);
    startTransition(async () => {
      const result = await activateLicense(licenseId);
      if (result.success) router.refresh();
      else setError(result.error ?? "خطا");
    });
  }

  function handleTerminate() {
    setError(null);
    if (!confirm("لغو این لایسنس غیرقابل بازگشت است. ادامه می‌دهید؟")) return;
    startTransition(async () => {
      const result = await terminateLicense(licenseId);
      if (result.success) router.refresh();
      else setError(result.error ?? "خطا");
    });
  }

  return (
    <div className="flex items-center gap-2">
      {status === "PENDING" && (
        <button
          onClick={handleActivate}
          disabled={isPending}
          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          فعال‌سازی
        </button>
      )}
      {(status === "ACTIVE" || status === "PENDING") && (
        <button
          onClick={handleTerminate}
          disabled={isPending}
          className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50"
        >
          لغو
        </button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}