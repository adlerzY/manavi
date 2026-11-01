"use client";

import { useRef, useState, type FormEvent } from "react";
import { requestWithdrawal } from "@/app/actions/withdrawals";
import { useSystemMessage } from "@/components/ui/system-message";
import {
  formatCoins,
  formatToman,
  type EarningsAccountView,
  type PayoutCardView,
  type PayoutTermsView,
} from "@/lib/withdrawal-types";

interface WithdrawalRequestFormProps {
  account: EarningsAccountView;
  cards: PayoutCardView[];
  terms: PayoutTermsView;
  onDone: () => void;
}

export function WithdrawalRequestForm({ account, cards, terms, onDone }: WithdrawalRequestFormProps) {
  const msg = useSystemMessage();
  const initialCard = cards.find((card) => card.isDefault) ?? cards[0];
  const [mode, setMode] = useState<"all" | "custom">("all");
  const [coinsInput, setCoinsInput] = useState(String(terms.minCoins));
  const [cardId, setCardId] = useState(initialCard?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const keyRef = useRef<string | null>(null);

  const customCoins = Number(coinsInput);
  const maxCustom = Math.floor(account.balanceCoins);
  const customValid = Number.isInteger(customCoins) && customCoins >= terms.minCoins && customCoins <= maxCustom;
  const allValid = account.balanceCoins >= terms.minCoins;
  const valid = mode === "all" ? allValid : customValid;
  const coins = mode === "all" ? account.balanceCoins : customCoins;
  const toman = valid ? Math.floor((Math.round(coins * 100) * terms.coinValueToman) / 100) : 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending || !valid || !cardId) return;

    const card = cards.find((item) => item.id === cardId);
    const ok = await msg.confirm({
      title: "ثبت درخواست تسویه‌حساب",
      message: `${formatCoins(coins)} سکه معادل ${formatToman(toman)} به کارت ${card?.cardMasked ?? ""} (${card?.holderName ?? ""}) واریز می‌شود.\nمبلغ همین حالا از موجودی شما نگه‌داری می‌شود و تا پایان بررسی، درخواست دیگری برای این حساب ثبت نمی‌شود.`,
      confirmLabel: "ثبت درخواست",
    });
    if (!ok) return;

    setPending(true);
    keyRef.current ??= crypto.randomUUID();
    try {
      const result = await requestWithdrawal({
        ownerType: account.ownerType,
        coins: mode === "all" ? null : customCoins,
        cardId,
        note,
        idempotencyKey: keyRef.current,
      });
      keyRef.current = null;
      if (result.success) {
        msg.success(`درخواست ${result.data?.code ?? ""} ثبت شد. وضعیت آن را از همین صفحه و اعلان‌ها پیگیری کنید.`, "درخواست ثبت شد");
        onDone();
      } else {
        msg.error(result.error ?? "ثبت درخواست ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید؛ درخواست تکراری ثبت نمی‌شود");
    }
    setPending(false);
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";
  const pillClass = (active: boolean) =>
    `min-h-10 flex-1 rounded-md border px-3 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"}`;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-md bg-background px-4 py-3 text-center">
        <p className="text-xs text-text-muted">{account.label}</p>
        <p className="mt-1 text-lg font-semibold text-primary">{formatCoins(account.balanceCoins)} سکه</p>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => setMode("all")} className={pillClass(mode === "all")}>
          کل موجودی
        </button>
        <button type="button" onClick={() => setMode("custom")} className={pillClass(mode === "custom")}>
          مقدار دلخواه
        </button>
      </div>

      {mode === "custom" && (
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor="withdraw-coins">
            تعداد سکه (از {terms.minCoins.toLocaleString("fa-IR")} تا {maxCustom.toLocaleString("fa-IR")})
          </label>
          <input
            id="withdraw-coins"
            type="number"
            inputMode="numeric"
            min={terms.minCoins}
            max={maxCustom}
            step={1}
            value={coinsInput}
            onChange={(e) => setCoinsInput(e.target.value)}
            className={inputClass}
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs text-text-muted" htmlFor="withdraw-card">
          کارت مقصد
        </label>
        <select id="withdraw-card" value={cardId} onChange={(e) => setCardId(e.target.value)} className={inputClass}>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.cardMasked} — {card.holderName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-text-muted" htmlFor="withdraw-note">
          توضیح (اختیاری)
        </label>
        <input id="withdraw-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputClass} />
      </div>

      <div className="rounded-md border border-border px-4 py-3 text-xs leading-6 text-text-muted">
        {valid ? (
          <>
            مبلغ قابل واریز: <span className="font-medium text-text-main">{formatToman(toman)}</span>
            <br />
            نرخ هر سکه: {formatToman(terms.coinValueToman)}
          </>
        ) : mode === "all" ? (
          `حداقل موجودی برای تسویه ${terms.minCoins.toLocaleString("fa-IR")} سکه است.`
        ) : (
          `مقدار باید عددی صحیح بین ${terms.minCoins.toLocaleString("fa-IR")} تا ${maxCustom.toLocaleString("fa-IR")} باشد.`
        )}
      </div>

      <button
        type="submit"
        disabled={pending || !valid || !cardId}
        className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "در حال ثبت…" : "ثبت درخواست تسویه"}
      </button>
    </form>
  );
}