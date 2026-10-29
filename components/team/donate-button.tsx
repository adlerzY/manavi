"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { donateWithCoins, getDonationBalance } from "@/app/actions/donations";
import { DONATION_PRESETS_COINS, MAX_DONATION_COINS, MIN_DONATION_COINS } from "@/lib/billing";

interface DonateButtonProps {
  receiverId: string;
  authenticated: boolean;
}

export function DonateButton({ receiverId, authenticated }: DonateButtonProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<number>(DONATION_PRESETS_COINS[1]);
  const [customAmount, setCustomAmount] = useState("");
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  const coins = customAmount ? Number(customAmount) : preset;
  const valid = Number.isInteger(coins) && coins >= MIN_DONATION_COINS && coins <= MAX_DONATION_COINS;
  const insufficient = balance !== null && valid && coins > balance;

  useEffect(() => {
    if (!open || !authenticated) return;
    let cancelled = false;
    getDonationBalance()
      .then((value) => {
        if (!cancelled) setBalance(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, authenticated]);

  async function handleSubmit() {
    if (!valid || insufficient || status === "sending") return;
    setStatus("sending");
    setError(null);
    keyRef.current ??= crypto.randomUUID();

    try {
      const result = await donateWithCoins({
        receiverId,
        coins,
        message: message || undefined,
        isAnonymous: anonymous,
        idempotencyKey: keyRef.current,
      });
      if (result.success) {
        keyRef.current = null;
        setBalance(result.data?.balance ?? null);
        setMessage("");
        setCustomAmount("");
        setStatus("done");
        return;
      }
      keyRef.current = null;
      setStatus("error");
      setError(result.error ?? "ثبت حمایت ناموفق بود");
    } catch {
      setStatus("error");
      setError("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
  }

  function handleClose() {
    setOpen(false);
    setStatus("idle");
    setError(null);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={!authenticated}
        className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        حمایت مالی با سکه
      </button>
    );
  }

  if (status === "done") {
    return (
      <div className="w-full max-w-sm space-y-3 rounded-md border border-primary/40 bg-primary/5 p-4 text-center">
        <p className="text-sm text-primary">حمایت شما ثبت شد. ممنون که کنارشونید 🙏</p>
        {balance !== null && (
          <p className="text-xs text-text-muted">موجودی فعلی: 🪙 {balance.toLocaleString("fa-IR")}</p>
        )}
        <button type="button" onClick={handleClose} className="min-h-11 w-full rounded-md border border-border px-4 py-2 text-sm text-text-main">
          بستن
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>موجودی شما</span>
        <span className="text-text-main">{balance === null ? "…" : `🪙 ${balance.toLocaleString("fa-IR")}`}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {DONATION_PRESETS_COINS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setPreset(value);
              setCustomAmount("");
            }}
            className={`min-h-10 rounded-md border px-3 py-1.5 text-xs ${
              !customAmount && preset === value ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
            }`}
          >
            {value.toLocaleString("fa-IR")} سکه
          </button>
        ))}
      </div>

      <input
        type="number"
        step={1}
        min={MIN_DONATION_COINS}
        max={MAX_DONATION_COINS}
        value={customAmount}
        onChange={(e) => setCustomAmount(e.target.value)}
        placeholder={`مقدار دلخواه (${MIN_DONATION_COINS.toLocaleString("fa-IR")} تا ${MAX_DONATION_COINS.toLocaleString("fa-IR")} سکه)`}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
      />

      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="پیام (اختیاری)"
        maxLength={300}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
      />

      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        نمایش به‌صورت ناشناس
      </label>

      {!valid && (
        <p className="text-xs text-red-400">
          مقدار باید عدد صحیح بین {MIN_DONATION_COINS.toLocaleString("fa-IR")} تا {MAX_DONATION_COINS.toLocaleString("fa-IR")} باشد
        </p>
      )}

      {insufficient && (
        <Link
          href={`/app/shop?redirect=${encodeURIComponent(pathname)}`}
          className="block rounded-md border border-primary px-3 py-2 text-center text-xs text-primary"
        >
          موجودی کافی نیست — خرید سکه
        </Link>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!authenticated || !valid || insufficient || status === "sending"}
        className="min-h-11 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "sending" ? "در حال ثبت…" : `ارسال ${valid ? coins.toLocaleString("fa-IR") : ""} سکه`}
      </button>

      <button type="button" onClick={handleClose} className="w-full text-center text-xs text-text-muted">
        انصراف
      </button>
    </div>
  );
}