"use client";

import { useState, useTransition } from "react";
import {
  createSettlementPeriod,
  recalculateSettlementPeriod,
  lockSettlementPeriod,
  setSettlementLineStatus,
  recordSettlementPayout,
  addSettlementLineNote,
  listSettlementPeriods,
  type SettlementPeriodRow,
  type SettlementLineRow,
} from "@/app/admin/actions/settlement-periods";
import { BENEFICIARY_LABELS, LINE_STATUS_LABELS, formatUsdt } from "@/lib/settlement-labels";
import { microToUsdt } from "@/lib/units";

interface ActionResult {
  success: boolean;
  error?: string;
}

interface PayoutFormState {
  lineId: string;
  amount: string;
  reference: string;
  receiptUrl: string;
  note: string;
  key: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function SettlementPeriodsManager({
  initialPeriods,
  unsettledUsdt,
}: {
  initialPeriods: SettlementPeriodRow[];
  unsettledUsdt: number;
}) {
  const [periods, setPeriods] = useState(initialPeriods);
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [payoutForm, setPayoutForm] = useState<PayoutFormState | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");

  function run(task: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.success) {
        setError(result.error ?? "خطا");
        return;
      }
      setPeriods(await listSettlementPeriods());
      onDone?.();
    });
  }

  function openPayout(line: SettlementLineRow) {
    setPayoutForm({
      lineId: line.id,
      amount: String(microToUsdt(line.owedMicro - line.paidMicro)),
      reference: "",
      receiptUrl: "",
      note: "",
      key: crypto.randomUUID(),
    });
  }

  function submitPayout() {
    if (!payoutForm) return;
    const amount = Number(payoutForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("مبلغ نامعتبر است");
      return;
    }
    run(
      () =>
        recordSettlementPayout({
          lineId: payoutForm.lineId,
          amountUsdt: amount,
          reference: payoutForm.reference,
          receiptUrl: payoutForm.receiptUrl,
          note: payoutForm.note,
          idempotencyKey: payoutForm.key,
        }),
      () => setPayoutForm(null)
    );
  }

  function cancelLine(lineId: string) {
    const note = window.prompt("دلیل لغو را بنویسید (طلب به دوره‌ی بعد منتقل می‌شود)");
    if (!note || !note.trim()) return;
    run(() => setSettlementLineStatus(lineId, "CANCELLED", note));
  }

  function submitNote(lineId: string) {
    if (!noteValue.trim()) return;
    run(
      () => addSettlementLineNote(lineId, noteValue),
      () => {
        setNoteFor(null);
        setNoteValue("");
      }
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor="settlement-end" className="text-xs text-text-muted">پایان دوره (غیرشامل خود روز)</label>
            <input
              id="settlement-end"
              type="date"
              value={periodEnd}
              max={todayIso()}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
            />
          </div>
          <button
            onClick={() => run(() => createSettlementPeriod(periodEnd))}
            disabled={isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            ایجاد و محاسبه‌ی دوره
          </button>
        </div>
        <p className="text-xs leading-6 text-text-muted">
          درآمد تسویه‌نشده‌ی فعلی همکاران و ناشران: <span className="text-primary">{formatUsdt(unsettledUsdt)}</span>. هر دوره همه‌ی درآمدهای تسویه‌نشده تا تاریخ پایان را شامل می‌شود، بنابراین طلب‌های نگه‌داشته یا لغوشده خودکار به دوره‌ی بعد منتقل می‌شوند.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {periods.map((period) => (
        <div key={period.id} className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-text-main">
                تا {new Date(period.periodEnd).toLocaleDateString("fa-IR")}
              </p>
              <p className="text-xs text-text-muted">
                {period.status === "OPEN" ? "باز — قابل محاسبه‌ی مجدد" : `قفل‌شده ${period.lockedAt ? new Date(period.lockedAt).toLocaleString("fa-IR") : ""}`}
              </p>
            </div>
            {period.status === "OPEN" && (
              <div className="flex gap-2">
                <button
                  onClick={() => run(() => recalculateSettlementPeriod(period.id))}
                  disabled={isPending}
                  className="rounded-md border border-border px-3 py-1.5 text-xs text-text-main disabled:opacity-50"
                >
                  محاسبه‌ی مجدد
                </button>
                <button
                  onClick={() => {
                    if (confirm("پس از قفل، ردیف‌های این دوره قابل بازمحاسبه نیستند. ادامه می‌دهید؟")) run(() => lockSettlementPeriod(period.id));
                  }}
                  disabled={isPending}
                  className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
                >
                  قفل دوره
                </button>
              </div>
            )}
          </div>

          <div className="divide-y divide-border rounded-md border border-border">
            {period.lines.map((line) => {
              const remaining = line.owedMicro - line.paidMicro;
              const payable = line.status === "APPROVED_FOR_PAYMENT" || line.status === "PARTIALLY_PAID";
              return (
                <div key={line.id} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm text-text-main">
                        {line.beneficiaryName} <span className="text-xs text-text-muted">({BENEFICIARY_LABELS[line.beneficiaryType]})</span>
                      </p>
                      <p className="text-xs text-text-muted">
                        طلب: {formatUsdt(microToUsdt(line.owedMicro))} · پرداخت‌شده: {formatUsdt(microToUsdt(line.paidMicro))} · باقی‌مانده: {formatUsdt(microToUsdt(remaining))}
                      </p>
                      {line.walletAddress ? (
                        <p className="mt-1 break-all text-[11px] text-text-muted" dir="ltr">{line.walletAddress}</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-red-400">آدرس کیف پول ثبت نشده</p>
                      )}
                    </div>
                    <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">{LINE_STATUS_LABELS[line.status]}</span>
                  </div>

                  {line.note && <p className="rounded-md bg-background px-3 py-2 text-xs text-text-muted">{line.note}</p>}

                  {line.payouts.map((payout) => (
                    <div key={payout.id} className="rounded-md bg-background px-3 py-2 text-xs text-text-muted">
                      <span className="text-primary">{formatUsdt(microToUsdt(payout.amountMicro))}</span>
                      {" · "}
                      {new Date(payout.paidAt).toLocaleString("fa-IR")}
                      {payout.reference && <span dir="ltr" className="mr-2 break-all">{payout.reference}</span>}
                      {payout.receiptUrl && (
                        <a href={payout.receiptUrl} target="_blank" rel="noreferrer" className="mr-2 text-primary underline">رسید</a>
                      )}
                      {payout.confirmation?.status === "CONFIRMED" && <span className="mr-2 text-primary">· تأیید دریافت</span>}
                      {payout.confirmation?.status === "DISPUTED" && (
                        <span className="mr-2 text-red-400">· مغایرت: {payout.confirmation.note}</span>
                      )}
                      {!payout.confirmation && <span className="mr-2">· منتظر تأیید دریافت‌کننده</span>}
                    </div>
                  ))}

                  {period.status === "LOCKED" && (
                    <div className="flex flex-wrap gap-2">
                      {line.status === "CALCULATED" && (
                        <button
                          onClick={() => run(() => setSettlementLineStatus(line.id, "APPROVED_FOR_PAYMENT"))}
                          disabled={isPending}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          تأیید برای پرداخت
                        </button>
                      )}
                      {payable && (
                        <button
                          onClick={() => openPayout(line)}
                          disabled={isPending}
                          className="rounded-md border border-primary px-3 py-1 text-xs text-primary disabled:opacity-50"
                        >
                          ثبت پرداخت
                        </button>
                      )}
                      {(line.status === "CALCULATED" || line.status === "APPROVED_FOR_PAYMENT" || line.status === "PARTIALLY_PAID") && (
                        <button
                          onClick={() => run(() => setSettlementLineStatus(line.id, "ON_HOLD"))}
                          disabled={isPending}
                          className="rounded-md border border-border px-3 py-1 text-xs text-text-main disabled:opacity-50"
                        >
                          نگه‌داشتن (فریز)
                        </button>
                      )}
                      {line.status === "ON_HOLD" && (
                        <button
                          onClick={() => run(() => setSettlementLineStatus(line.id, "APPROVED_FOR_PAYMENT"))}
                          disabled={isPending}
                          className="rounded-md border border-primary px-3 py-1 text-xs text-primary disabled:opacity-50"
                        >
                          ازسرگیری
                        </button>
                      )}
                      {(line.status === "CALCULATED" || line.status === "APPROVED_FOR_PAYMENT" || line.status === "ON_HOLD") && line.paidMicro === 0 && (
                        <button
                          onClick={() => cancelLine(line.id)}
                          disabled={isPending}
                          className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50"
                        >
                          لغو و انتقال به دوره‌ی بعد
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setNoteFor(noteFor === line.id ? null : line.id);
                          setNoteValue("");
                        }}
                        className="text-xs text-text-muted underline decoration-dotted"
                      >
                        یادداشت
                      </button>
                    </div>
                  )}

                  {noteFor === line.id && (
                    <div className="flex items-center gap-2">
                      <input
                        value={noteValue}
                        onChange={(e) => setNoteValue(e.target.value)}
                        maxLength={500}
                        placeholder="یادداشت برای این ردیف"
                        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs text-text-main"
                      />
                      <button
                        onClick={() => submitNote(line.id)}
                        disabled={isPending || !noteValue.trim()}
                        className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                      >
                        ثبت
                      </button>
                    </div>
                  )}

                  {payoutForm?.lineId === line.id && (
                    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          type="number"
                          step="any"
                          value={payoutForm.amount}
                          onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                          placeholder="مبلغ واقعی ارسالی (USDT)"
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text-main"
                        />
                        <input
                          value={payoutForm.reference}
                          onChange={(e) => setPayoutForm({ ...payoutForm, reference: e.target.value })}
                          placeholder="هش یا شماره‌ی مرجع تراکنش"
                          dir="ltr"
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text-main"
                        />
                        <input
                          value={payoutForm.receiptUrl}
                          onChange={(e) => setPayoutForm({ ...payoutForm, receiptUrl: e.target.value })}
                          placeholder="لینک رسید (اختیاری)"
                          dir="ltr"
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text-main"
                        />
                        <input
                          value={payoutForm.note}
                          onChange={(e) => setPayoutForm({ ...payoutForm, note: e.target.value })}
                          placeholder="یادداشت (اختیاری)"
                          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-text-main"
                        />
                      </div>
                      <p className="text-[11px] text-text-muted">فقط بعد از انجام پرداخت واقعی ثبت کنید. ثبت پرداخت قابل حذف نیست.</p>
                      <div className="flex gap-2">
                        <button
                          onClick={submitPayout}
                          disabled={isPending}
                          className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                        >
                          ثبت پرداخت
                        </button>
                        <button onClick={() => setPayoutForm(null)} className="text-xs text-text-muted">انصراف</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {period.lines.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">در این دوره طلبی ثبت نشده است.</p>}
          </div>
        </div>
      ))}

      {periods.length === 0 && <p className="text-sm text-text-muted">هنوز دوره‌ای ساخته نشده است.</p>}
    </div>
  );
}