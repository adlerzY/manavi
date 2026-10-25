"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondToPayout, type EarningsOverview } from "@/app/actions/payouts";
import { BENEFICIARY_LABELS, LINE_STATUS_LABELS, formatUsdt } from "@/lib/settlement-labels";

export function EarningsPanel({ overview }: { overview: EarningsOverview }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<string | null>(null);
  const [disputeNote, setDisputeNote] = useState("");

  function respond(payoutId: string, status: "CONFIRMED" | "DISPUTED", note?: string) {
    setError(null);
    startTransition(async () => {
      const result = await respondToPayout(payoutId, status, note);
      if (result.success) {
        setDisputeFor(null);
        setDisputeNote("");
        router.refresh();
      } else {
        setError(result.error ?? "خطا");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-md border border-border bg-surface p-3 text-center">
          <p className="text-sm font-semibold text-primary">{formatUsdt(overview.accruedUsdt)}</p>
          <p className="mt-1 text-[11px] text-text-muted">در انتظار محاسبه‌ی دوره</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3 text-center">
          <p className="text-sm font-semibold text-accent">{formatUsdt(overview.outstandingUsdt)}</p>
          <p className="mt-1 text-[11px] text-text-muted">طلب پرداخت‌نشده</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-3 text-center">
          <p className="text-sm font-semibold text-text-main">{formatUsdt(overview.paidUsdt)}</p>
          <p className="mt-1 text-[11px] text-text-muted">پرداخت‌شده</p>
        </div>
      </div>

      <p className="text-xs leading-6 text-text-muted">
        درآمد شما از فروش چپترها به‌صورت USDT محاسبه می‌شود و به سکه‌ی قابل خرج تبدیل نمی‌شود. اگر پرداختی دوره‌ای انجام نشود، طلب شما در حساب باقی می‌ماند.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-3">
        {overview.lines.map((line) => (
          <div key={line.id} className="space-y-3 rounded-md border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-text-main">
                  {BENEFICIARY_LABELS[line.beneficiaryType]} — تا {new Date(line.periodEnd).toLocaleDateString("fa-IR")}
                </p>
                <p className="text-xs text-text-muted">
                  طلب: {formatUsdt(line.owedUsdt)} · پرداخت‌شده: {formatUsdt(line.paidUsdt)}
                </p>
              </div>
              <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">{LINE_STATUS_LABELS[line.status]}</span>
            </div>

            {line.note && <p className="rounded-md bg-background px-3 py-2 text-xs text-text-muted">{line.note}</p>}

            {line.payouts.map((payout) => (
              <div key={payout.id} className="space-y-2 rounded-md bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-primary">{formatUsdt(payout.amountUsdt)}</p>
                  <p className="text-xs text-text-muted">{new Date(payout.paidAt).toLocaleString("fa-IR")}</p>
                </div>
                {payout.reference && <p className="break-all text-xs text-text-muted" dir="ltr">{payout.reference}</p>}
                {payout.receiptUrl && (
                  <a href={payout.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">مشاهده‌ی رسید</a>
                )}
                {payout.note && <p className="text-xs text-text-muted">{payout.note}</p>}

                {payout.response?.status === "CONFIRMED" && <p className="text-xs text-primary">دریافت تأیید شد.</p>}
                {payout.response?.status === "DISPUTED" && (
                  <p className="text-xs text-red-400">مغایرت ثبت شده: {payout.response.note}</p>
                )}

                {payout.response?.status !== "CONFIRMED" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => respond(payout.id, "CONFIRMED")}
                        disabled={isPending}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                      >
                        تأیید دریافت
                      </button>
                      <button
                        onClick={() => setDisputeFor(disputeFor === payout.id ? null : payout.id)}
                        disabled={isPending}
                        className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50"
                      >
                        ثبت مغایرت
                      </button>
                    </div>
                    {disputeFor === payout.id && (
                      <div className="flex items-center gap-2">
                        <input
                          value={disputeNote}
                          onChange={(e) => setDisputeNote(e.target.value)}
                          placeholder="توضیح مغایرت"
                          maxLength={500}
                          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main"
                        />
                        <button
                          onClick={() => respond(payout.id, "DISPUTED", disputeNote)}
                          disabled={isPending || !disputeNote.trim()}
                          className="rounded-md bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          ارسال
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {overview.lines.length === 0 && (
          <p className="rounded-md border border-border bg-surface p-4 text-center text-sm text-text-muted">هنوز تسویه‌ای برای شما ثبت نشده است.</p>
        )}
      </div>
    </div>
  );
}