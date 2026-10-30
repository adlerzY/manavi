"use client";

import { useEffect } from "react";
import { EmptyState } from "@/components/ui/empty-state";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-1 items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        <EmptyState
          pose="sad"
          title="یه مشکلی پیش اومد"
          description="در بارگذاری این صفحه خطایی رخ داد. دوباره تلاش کن یا برگرد به خانه."
          actions={[{ href: "/app", label: "بازگشت به خانه" }]}
        >
          <button
            onClick={reset}
            className="flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            تلاش دوباره
          </button>
        </EmptyState>
      </div>
    </main>
  );
}