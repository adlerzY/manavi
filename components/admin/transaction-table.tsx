"use client";

import { useState, useTransition, type FormEvent } from "react";
import { searchTransactions, type TransactionRow } from "@/app/admin/actions/transactions";
import type { TransactionType, TransactionStatus } from "@prisma/client";

const TYPES: TransactionType[] = ["DONATION", "COIN_PURCHASE", "CHAPTER_UNLOCK", "ADMIN_GRANT", "ADMIN_REVOKE", "PUBLISHER_PAYOUT"];
const STATUSES: TransactionStatus[] = ["PENDING", "PAID", "FAILED"];

const TYPE_LABELS: Record<TransactionType, string> = {
  SUBSCRIPTION: "اشتراک (قدیمی)",
  DONATION: "دونیت",
  COIN_PURCHASE: "خرید سکه",
  CHAPTER_UNLOCK: "باز کردن چپتر",
  ADMIN_GRANT: "اعطای دستی",
  ADMIN_REVOKE: "کسر دستی",
  PUBLISHER_PAYOUT: "تسویه‌حساب ناشر",
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  PENDING: "در انتظار",
  PAID: "موفق",
  FAILED: "ناموفق",
};

const PAGE_SIZE = 25;

interface Filters {
  type: TransactionType | "";
  status: TransactionStatus | "";
  q: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { type: "", status: "", q: "", from: "", to: "" };

function hasFilters(filters: Filters): boolean {
  return Boolean(filters.type || filters.status || filters.q.trim() || filters.from || filters.to);
}

export function TransactionTable({ initial, initialTotal }: { initial: TransactionRow[]; initialTotal: number }) {
  const [rows, setRows] = useState(initial);
  const [total, setTotal] = useState(initialTotal);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function runSearch(filters: Filters, nextPage = 1) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await searchTransactions({
          type: filters.type || undefined,
          status: filters.status || undefined,
          q: filters.q.trim() || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: nextPage,
        });
        setRows(result.transactions);
        setTotal(result.total);
        setPage(nextPage);
      } catch {
        setError("دریافت تراکنش‌ها ناموفق بود");
      }
    });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApplied(draft);
    runSearch(draft, 1);
  }

  function handleReset() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    runSearch(EMPTY_FILTERS, 1);
  }

  const inputClass = "min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border bg-surface p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            value={draft.q}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            placeholder="نام یا یوزرنیم کاربر"
            maxLength={100}
            className={`${inputClass} col-span-2`}
          />
          <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TransactionType | "" })} className={inputClass}>
            <option value="">همه انواع</option>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
          <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TransactionStatus | "" })} className={inputClass}>
            <option value="">همه وضعیت‌ها</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
          <label className="space-y-1 text-xs text-text-muted">
            از تاریخ
            <input type="date" dir="ltr" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={inputClass} />
          </label>
          <label className="space-y-1 text-xs text-text-muted">
            تا تاریخ
            <input type="date" dir="ltr" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputClass} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={isPending} className="min-h-11 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            اعمال فیلتر
          </button>
          {(hasFilters(draft) || hasFilters(applied)) && (
            <button type="button" onClick={handleReset} disabled={isPending} className="min-h-11 rounded-md border border-border px-4 py-2 text-sm text-text-muted disabled:opacity-50">
              پاک کردن
            </button>
          )}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </form>

      <div className={`divide-y divide-border rounded-md border border-border transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-text-main">
                {TYPE_LABELS[t.type]} · {t.payer.username ? `@${t.payer.username}` : t.payer.firstName}
                {t.receiver && ` ← ${t.receiver.username ? `@${t.receiver.username}` : t.receiver.firstName}`}
              </p>
              <p className="text-xs text-text-muted">{new Date(t.createdAt).toLocaleString("fa-IR")}</p>
            </div>
            <div className="flex-shrink-0 text-left">
              <p className="text-sm text-text-main">
                {t.amount.toLocaleString("fa-IR")} {t.currency === "COIN" ? "سکه" : "USDT"}
              </p>
              <p className={`text-xs ${t.status === "PAID" ? "text-primary" : t.status === "FAILED" ? "text-red-400" : "text-text-muted"}`}>
                {STATUS_LABELS[t.status]}
              </p>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">تراکنشی یافت نشد.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{total.toLocaleString("fa-IR")} تراکنش</span>
        <div className="flex gap-2">
          <button onClick={() => runSearch(applied, page - 1)} disabled={page <= 1 || isPending} className="min-h-11 px-3 disabled:opacity-30">قبلی</button>
          <button onClick={() => runSearch(applied, page + 1)} disabled={page * PAGE_SIZE >= total || isPending} className="min-h-11 px-3 disabled:opacity-30">بعدی</button>
        </div>
      </div>
    </div>
  );
}