"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { unlockChapterWithCoins } from "@/app/actions/chapter-access";

interface LockedChapterGateProps {
  chapterId: string;
  comicSlug: string;
  coinsBalance: number;
  coinCost: number;
}

export function LockedChapterGate({ chapterId, comicSlug, coinsBalance, coinCost }: LockedChapterGateProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  async function handleCoinUnlock() {
    if (pending) return;
    setPending(true);
    setError(null);
    keyRef.current ??= crypto.randomUUID();

    try {
      const result = await unlockChapterWithCoins(chapterId, keyRef.current);
      if (result.success) {
        router.refresh();
      } else {
        keyRef.current = null;
        setError(result.error ?? "خطا در باز کردن چپتر");
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setPending(false);
  }

  const returnTo = `/app/read/${chapterId}`;
  const shortfall = Math.max(0, coinCost - coinsBalance);
  const hasEnoughCoins = coinsBalance >= coinCost;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="text-lg font-medium text-text-main">این چپتر سکه‌ای است</p>
      <p className="max-w-sm text-sm text-text-muted">
        برای خواندن این چپتر {coinCost.toLocaleString("fa-IR")} سکه لازم است.
      </p>

      {hasEnoughCoins ? (
        <button
          onClick={handleCoinUnlock}
          disabled={pending}
          className="w-full max-w-xs rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "در حال پرداخت…" : `پرداخت ${coinCost.toLocaleString("fa-IR")} سکه و خواندن`}
        </button>
      ) : (
        <Link
          href={`/app/shop?redirect=${encodeURIComponent(returnTo)}`}
          className="w-full max-w-xs rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
        >
          خرید سکه (کسری: {shortfall.toLocaleString("fa-IR")} سکه)
        </Link>
      )}

      <Link href={`/app/comic/${comicSlug}`} className="text-xs text-accent underline">
        باز کردن کل نسخه یکجا از صفحه‌ی عنوان
      </Link>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}