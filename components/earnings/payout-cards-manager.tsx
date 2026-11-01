"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Plus, Trash2 } from "lucide-react";
import { deleteMyCard, saveMyCard, setDefaultCard } from "@/app/actions/withdrawals";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatCardNumber, normalizeCardNumber } from "@/lib/card";
import { MAX_PAYOUT_CARDS, type PayoutCardView } from "@/lib/withdrawal-types";

export function PayoutCardsManager({ cards }: { cards: PayoutCardView[] }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [open, setOpen] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [iban, setIban] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string): Promise<boolean> {
    setBusy(true);
    let ok = false;
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        router.refresh();
        ok = true;
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
    return ok;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const saved = await run(() => saveMyCard({ holderName, cardNumber, iban, makeDefault }), "کارت ثبت شد");
    if (saved) {
      setHolderName("");
      setCardNumber("");
      setIban("");
      setMakeDefault(false);
      setOpen(false);
    }
  }

  async function handleDelete(card: PayoutCardView) {
    const ok = await msg.confirm({
      title: "حذف کارت",
      message: `کارت ${card.cardMasked} حذف شود؟ درخواست‌های قبلی تغییری نمی‌کنند.`,
      confirmLabel: "حذف کارت",
      danger: true,
    });
    if (ok) await run(() => deleteMyCard(card.id), "کارت حذف شد");
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-text-main">کارت‌های دریافت وجه</h2>
        {cards.length < MAX_PAYOUT_CARDS && (
          <button type="button" onClick={() => setOpen((prev) => !prev)} className="flex min-h-10 items-center gap-1 text-xs text-primary">
            <Plus size={14} />
            {open ? "بستن" : "افزودن کارت"}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {cards.map((card) => (
          <div key={card.id} className="flex items-center gap-3 rounded-md border border-border bg-surface px-4 py-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CreditCard size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-main" dir="ltr">
                {card.cardMasked}
              </p>
              <p className="mt-0.5 truncate text-xs text-text-muted">
                {card.holderName}
                {card.iban && <span dir="ltr"> · {card.iban}</span>}
              </p>
            </div>
            {card.isDefault ? (
              <span className="flex-shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">پیش‌فرض</span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => setDefaultCard(card.id), "کارت پیش‌فرض تغییر کرد")}
                className="min-h-10 flex-shrink-0 px-2 text-xs text-text-muted disabled:opacity-50"
              >
                پیش‌فرض کن
              </button>
            )}
            <button
              type="button"
              aria-label="حذف کارت"
              disabled={busy}
              onClick={() => handleDelete(card)}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-red-400 disabled:opacity-50"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {cards.length === 0 && !open && (
          <p className="rounded-md border border-dashed border-border px-4 py-4 text-center text-xs text-text-muted">
            برای ثبت درخواست تسویه ابتدا یک کارت بانکی اضافه کنید.
          </p>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border bg-surface p-4">
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="card-holder">
              نام صاحب کارت
            </label>
            <input id="card-holder" value={holderName} onChange={(e) => setHolderName(e.target.value)} required maxLength={60} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="card-number">
              شماره کارت (۱۶ رقم)
            </label>
            <input
              id="card-number"
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardNumber(normalizeCardNumber(e.target.value).slice(0, 16)))}
              required
              placeholder="0000 0000 0000 0000"
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="card-iban">
              شماره شبا (اختیاری)
            </label>
            <input id="card-iban" dir="ltr" autoComplete="off" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="IR..." className={inputClass} />
          </div>
          {cards.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
              به‌عنوان کارت پیش‌فرض
            </label>
          )}
          <button type="submit" disabled={busy} className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "در حال ذخیره…" : "ثبت کارت"}
          </button>
        </form>
      )}
    </section>
  );
}