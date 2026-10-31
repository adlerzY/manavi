"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import Link from "next/link";
import { unlockChapterWithCoins } from "@/app/actions/chapter-access";
import { BackButton } from "@/components/navigation/back-button";
import { Mascot } from "@/components/ui/mascot";
import { useReaderNav } from "@/lib/client/reader-nav";

interface LockedChapterGateProps {
  chapterId: string;
  comicSlug: string;
  coinsBalance: number;
  coinCost: number;
}

export function LockedChapterGate({ chapterId, comicSlug, coinsBalance, coinCost }: LockedChapterGateProps) {
  const router = useRouter();
  const { chapterHref, exitToComic } = useReaderNav(comicSlug);
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

  const returnTo = chapterHref(chapterId);
  const shortfall = Math.max(0, coinCost - coinsBalance);
  const hasEnoughCoins = coinsBalance >= coinCost;

  return (
    <div
      style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
      className="relative flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center"
    >
      <div className="absolute right-3" style={{ top: "calc(var(--tg-content-safe-area-top, 0px) + 0.75rem)" }}>
        <BackButton fallbackHref={`/app/comic/${comicSlug}`} variant="plain" onBack={exitToComic} />
      </div>

      <Mascot pose="coin" size={150} float />

      <div className="space-y-2">
        <p className="text-lg font-medium text-text-main">این چپتر سکه‌ای است</p>
        <p className="mx-auto max-w-sm text-sm leading-7 text-text-muted">
          برای خواندن این چپتر {coinCost.toLocaleString("fa-IR")} سکه لازم است.
        </p>
      </div>

      {hasEnoughCoins ? (
        <button
          onClick={handleCoinUnlock}
          disabled={pending}
          className="w-full max-w-xs rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "در حال پرداخت…" : `پرداخت ${coinCost.toLocaleString("fa-IR")} سکه و خواندن`}
        </button>
      ) : (
        <Link
          href={`/app/shop?redirect=${encodeURIComponent(returnTo)}`}
          className="w-full max-w-xs rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
        >
          خرید سکه (کسری: {shortfall.toLocaleString("fa-IR")} سکه)
        </Link>
      )}

      <button
        type="button"
        onClick={exitToComic}
        className="w-full max-w-xs rounded-xl border border-border px-4 py-3 text-center text-sm text-text-main"
      >
        بازگشت به صفحه‌ی اثر
      </button>

      <div className="flex flex-col items-center gap-2">
        <Link href="/app/free" className="text-xs text-primary underline">
          سکه نداری؟ آثار تمام رایگان رو ببین
        </Link>
        <button type="button" onClick={exitToComic} className="text-xs text-accent underline">
          باز کردن کل نسخه یکجا از صفحه‌ی عنوان
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}