"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { LedgerList } from "./ledger-list";
import { PayoutCardsManager } from "./payout-cards-manager";
import { WithdrawalItem } from "./withdrawal-item";
import { WithdrawalRequestForm } from "./withdrawal-request-form";
import {
  formatCoins,
  formatToman,
  type EarningsAccountView,
  type EarningsOverviewData,
  type PayoutTermsView,
} from "@/lib/withdrawal-types";

type TabId = "withdrawals" | "ledger";

function AccountCard({
  account,
  terms,
  hasCards,
  onRequest,
}: {
  account: EarningsAccountView;
  terms: PayoutTermsView;
  hasCards: boolean;
  onRequest: () => void;
}) {
  const blocked =
    terms.coinValueToman <= 0
      ? "تسویه‌حساب هنوز توسط مدیریت فعال نشده است"
      : account.openWithdrawalId
      ? "یک درخواست تسویه برای این حساب در جریان است"
      : account.balanceCoins < terms.minCoins
      ? `حداقل موجودی برای تسویه ${terms.minCoins.toLocaleString("fa-IR")} سکه است`
      : !hasCards
      ? "ابتدا یک کارت بانکی ثبت کنید"
      : null;

  const estimate =
    terms.coinValueToman > 0 ? formatToman(Math.floor((Math.round(account.balanceCoins * 100) * terms.coinValueToman) / 100)) : null;

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted">{account.label}</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{formatCoins(account.balanceCoins)} سکه</p>
          {estimate && <p className="mt-0.5 text-xs text-text-muted">≈ {estimate}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-md bg-background p-2.5">
          <p className="text-sm text-text-main">{formatCoins(account.monthEarnedCoins)}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">درآمد این ماه</p>
        </div>
        <div className="rounded-md bg-background p-2.5">
          <p className="text-sm text-accent">{formatCoins(account.heldCoins)}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">در حال تسویه</p>
        </div>
        <div className="rounded-md bg-background p-2.5">
          <p className="text-sm text-text-main">{formatCoins(account.lifetimeEarnedCoins)}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">کل درآمد</p>
        </div>
        <div className="rounded-md bg-background p-2.5">
          <p className="text-sm text-text-main">{formatCoins(account.lifetimeWithdrawnCoins)}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">تسویه‌شده تاکنون</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onRequest}
        disabled={Boolean(blocked)}
        className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        درخواست تسویه‌حساب
      </button>
      {blocked && <p className="text-center text-xs text-text-muted">{blocked}</p>}
    </div>
  );
}

export function EarningsPanel({ overview }: { overview: EarningsOverviewData }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("withdrawals");
  const [requestFor, setRequestFor] = useState<EarningsAccountView | null>(null);
  const [ledgerOwner, setLedgerOwner] = useState<"USER" | "PUBLISHER">(overview.accounts[0]?.ownerType ?? "USER");

  const { accounts, cards, terms, withdrawals } = overview;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {accounts.map((account) => (
          <AccountCard
            key={`${account.ownerType}:${account.ownerId}`}
            account={account}
            terms={terms}
            hasCards={cards.length > 0}
            onRequest={() => setRequestFor(account)}
          />
        ))}
        <p className="text-xs leading-6 text-text-muted">
          درآمد شما از فروش چپترها و حمایت‌های مالی به‌صورت سکه به حساب شما اضافه می‌شود و قابل خرج‌کردن در اپ نیست؛ فقط از طریق تسویه‌حساب به تومان دریافت می‌شود.
          {terms.coinValueToman > 0 && ` نرخ فعلی هر سکه ${formatToman(terms.coinValueToman)} و حداقل تسویه ${terms.minCoins.toLocaleString("fa-IR")} سکه است.`}
        </p>
      </div>

      <PayoutCardsManager cards={cards} />

      <section className="space-y-3">
        <div className="flex border-b border-border">
          {([
            { id: "withdrawals", label: "درخواست‌های تسویه" },
            { id: "ledger", label: "گردش حساب" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative flex min-h-11 flex-1 items-center justify-center text-sm ${tab === item.id ? "font-medium text-primary" : "text-text-muted"}`}
            >
              {item.label}
              {tab === item.id && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        {tab === "withdrawals" && (
          <div className="space-y-3">
            {withdrawals.map((withdrawal) => (
              <WithdrawalItem key={withdrawal.id} withdrawal={withdrawal} />
            ))}
            {withdrawals.length === 0 && (
              <p className="rounded-md border border-border bg-surface px-4 py-6 text-center text-sm text-text-muted">هنوز درخواست تسویه‌ای ثبت نشده است.</p>
            )}
          </div>
        )}

        {tab === "ledger" && (
          <div className="space-y-3">
            {accounts.length > 1 && (
              <div className="flex gap-2">
                {accounts.map((account) => (
                  <button
                    key={account.ownerType}
                    type="button"
                    onClick={() => setLedgerOwner(account.ownerType)}
                    className={`min-h-10 flex-1 rounded-md border px-3 text-xs ${
                      ledgerOwner === account.ownerType ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"
                    }`}
                  >
                    {account.ownerType === "USER" ? "حساب شخصی" : "حساب ناشر"}
                  </button>
                ))}
              </div>
            )}
            <LedgerList key={ledgerOwner} ownerType={ledgerOwner} />
          </div>
        )}
      </section>

      <BottomSheet open={requestFor !== null} onClose={() => setRequestFor(null)} title="درخواست تسویه‌حساب">
        {requestFor && (
          <WithdrawalRequestForm
            account={requestFor}
            cards={cards}
            terms={terms}
            onDone={() => {
              setRequestFor(null);
              router.refresh();
            }}
          />
        )}
      </BottomSheet>
    </div>
  );
}