"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  getWithdrawalReceiptAdmin,
  listWithdrawalsAdmin,
  rejectWithdrawalAdmin,
  resolveWithdrawalDisputeAdmin,
  startWithdrawalReviewAdmin,
} from "@/app/admin/actions/withdrawals";
import { WithdrawalTimeline } from "@/components/earnings/withdrawal-timeline";
import { useSystemMessage } from "@/components/ui/system-message";
import { copyText } from "@/lib/clipboard";
import { formatDateTime } from "@/lib/format";
import { uploadWithdrawalReceipt } from "@/lib/client/receipt-upload";
import {
  WITHDRAWAL_PAGE_SIZE,
  WITHDRAWAL_STATUS_CLASSES,
  WITHDRAWAL_STATUS_LABELS,
  formatCoins,
  formatToman,
  type WithdrawalView,
} from "@/lib/withdrawal-types";

const FILTERS = [
  { value: "ACTIVE", label: "نیازمند اقدام" },
  { value: "DISPUTED", label: "مغایرت بدون پاسخ" },
  { value: "PAID", label: "پرداخت‌شده" },
  { value: "REJECTED", label: "ردشده" },
  { value: "CANCELLED", label: "لغوشده" },
  { value: "", label: "همه" },
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(value);
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={handleCopy} className="min-h-8 flex-shrink-0 px-2 text-xs text-primary">
      {copied ? "کپی شد" : label}
    </button>
  );
}

function AdminWithdrawalCard({ item, onChanged }: { item: WithdrawalView; onChanged: () => void }) {
  const msg = useSystemMessage();
  const [busy, setBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const open = item.status === "PENDING" || item.status === "PROCESSING";
  const disputeOpen = item.response === "DISPUTED" && !item.disputeResolvedAt;

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        onChanged();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleStart() {
    const ok = await msg.confirm({
      title: "شروع پرداخت",
      message: "درخواست به وضعیت «در حال پرداخت» می‌رود و درخواست‌دهنده دیگر نمی‌تواند آن را لغو کند.",
      confirmLabel: "شروع پرداخت",
    });
    if (ok) await run(() => startWithdrawalReviewAdmin(item.id), "درخواست در حال پرداخت علامت‌گذاری شد");
  }

  async function handleReject() {
    const reason = await msg.prompt({
      title: "رد درخواست",
      message: "دلیل رد برای درخواست‌دهنده نمایش داده می‌شود و مبلغ به موجودی او برمی‌گردد.",
      label: "دلیل رد",
      multiline: true,
      minLength: 3,
      maxLength: 300,
      confirmLabel: "رد درخواست",
    });
    if (reason !== null) await run(() => rejectWithdrawalAdmin(item.id, reason), "درخواست رد شد و مبلغ به موجودی برگشت");
  }

  async function handleResolve() {
    const resolution = await msg.prompt({
      title: "پاسخ به مغایرت",
      message: `مغایرت ثبت‌شده: ${item.responseNote ?? "—"}`,
      label: "پاسخ شما",
      multiline: true,
      minLength: 3,
      maxLength: 500,
      confirmLabel: "ثبت پاسخ",
    });
    if (resolution !== null) await run(() => resolveWithdrawalDisputeAdmin(item.id, resolution), "پاسخ مغایرت ثبت شد");
  }

  async function handleReceipt() {
    setBusy(true);
    try {
      const result = await getWithdrawalReceiptAdmin(item.id);
      if (result.success && result.data) {
        const opened = window.open(result.data.url, "_blank", "noopener");
        if (!opened) window.location.href = result.data.url;
      } else {
        msg.error(result.error ?? "دریافت رسید ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handlePay(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!file) {
      msg.warning("تصویر رسید پرداخت را انتخاب کنید");
      return;
    }

    const ok = await msg.confirm({
      title: "تأیید ثبت پرداخت",
      message: `مبلغ ${formatToman(item.amountToman)} به کارت ${item.cardDisplay} (${item.cardHolder}) واقعاً پرداخت شده است؟\nاین عملیات قابل بازگشت نیست.`,
      confirmLabel: "پرداخت انجام شده است",
      danger: true,
    });
    if (!ok) return;

    setBusy(true);
    const result = await uploadWithdrawalReceipt({ withdrawalId: item.id, file, reference: reference.trim(), note: note.trim() });
    setBusy(false);

    if (result.success) {
      msg.success(`پرداخت ${result.code ?? item.code} ثبت شد و به درخواست‌دهنده اطلاع داده شد`);
      setPayOpen(false);
      setFile(null);
      setReference("");
      setNote("");
      onChanged();
    } else {
      msg.error(result.error ?? "ثبت پرداخت ناموفق بود");
    }
  }

  const inputClass = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-main" dir="ltr">
            {item.code}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {item.requesterName} · {item.ownerLabel} · {formatDateTime(item.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {disputeOpen && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs text-red-400">مغایرت باز</span>}
          <span className={`rounded-full px-2.5 py-1 text-xs ${WITHDRAWAL_STATUS_CLASSES[item.status]}`}>{WITHDRAWAL_STATUS_LABELS[item.status]}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-background p-3 text-center">
          <p className="text-sm font-semibold text-primary">{formatCoins(item.coins)} سکه</p>
          <p className="mt-0.5 text-[11px] text-text-muted">نرخ {formatToman(item.coinValueToman)}</p>
        </div>
        <div className="flex items-center justify-between gap-1 rounded-md bg-background p-3">
          <div className="min-w-0 text-center">
            <p className="text-sm font-semibold text-text-main">{formatToman(item.amountToman)}</p>
            <p className="mt-0.5 text-[11px] text-text-muted">مبلغ پرداخت</p>
          </div>
          <CopyButton value={String(item.amountToman)} label="کپی" />
        </div>
      </div>

      <div className="space-y-1 rounded-md bg-background p-3 text-xs">
        <p className="text-text-muted">صاحب کارت: <span className="text-text-main">{item.cardHolder}</span></p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-text-muted">
            شماره کارت: <span className="text-text-main" dir="ltr">{item.cardDisplay}</span>
          </p>
          <CopyButton value={item.cardRaw} label="کپی" />
        </div>
        {item.iban && (
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 break-all text-text-muted">
              شبا: <span className="text-text-main" dir="ltr">{item.iban}</span>
            </p>
            <CopyButton value={item.iban} label="کپی" />
          </div>
        )}
      </div>

      {item.requesterNote && <p className="text-xs leading-6 text-text-muted">توضیح درخواست‌دهنده: {item.requesterNote}</p>}
      {item.adminNote && <p className="text-xs leading-6 text-accent">یادداشت مدیریت: {item.adminNote}</p>}
      {item.paymentReference && (
        <p className="text-xs text-text-muted">
          شماره پیگیری: <span dir="ltr">{item.paymentReference}</span>
        </p>
      )}
      {item.processedByName && <p className="text-xs text-text-muted">رسیدگی توسط: {item.processedByName}</p>}
      {item.response && (
        <p className={`rounded-md px-3 py-2 text-xs leading-6 ${item.response === "CONFIRMED" ? "bg-primary/5 text-primary" : "bg-red-500/5 text-red-400"}`}>
          {item.response === "CONFIRMED" ? "درخواست‌دهنده دریافت را تأیید کرده است." : `مغایرت ثبت‌شده: ${item.responseNote ?? "—"}`}
        </p>
      )}
      {item.disputeResolution && <p className="text-xs leading-6 text-text-muted">پاسخ مدیریت به مغایرت: {item.disputeResolution}</p>}

      <div className="flex flex-wrap gap-2">
        {item.status === "PENDING" && (
          <button type="button" onClick={handleStart} disabled={busy} className="min-h-10 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50">
            شروع پرداخت
          </button>
        )}
        {open && (
          <>
            <button
              type="button"
              onClick={() => setPayOpen((prev) => !prev)}
              disabled={busy}
              className="min-h-10 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50"
            >
              {payOpen ? "بستن فرم پرداخت" : "ثبت پرداخت و رسید"}
            </button>
            <button type="button" onClick={handleReject} disabled={busy} className="min-h-10 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50">
              رد درخواست
            </button>
          </>
        )}
        {item.hasReceipt && (
          <button type="button" onClick={handleReceipt} disabled={busy} className="min-h-10 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50">
            مشاهده‌ی رسید
          </button>
        )}
        {disputeOpen && (
          <button type="button" onClick={handleResolve} disabled={busy} className="min-h-10 rounded-md border border-accent px-3 text-xs text-accent disabled:opacity-50">
            پاسخ به مغایرت
          </button>
        )}
      </div>

      {open && payOpen && (
        <form onSubmit={handlePay} className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">تصویر رسید پرداخت (JPG، PNG یا WebP)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-text-muted file:ml-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">شماره پیگیری (اختیاری)</label>
            <input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} className={inputClass} />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">یادداشت (اختیاری)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputClass} />
          </div>
          <button type="submit" disabled={busy || !file} className="min-h-11 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "در حال ارسال رسید…" : "ثبت پرداخت"}
          </button>
        </form>
      )}

      <WithdrawalTimeline events={item.events} />
    </div>
  );
}

export function WithdrawalQueue({ initialWithdrawals, initialTotal }: { initialWithdrawals: WithdrawalView[]; initialTotal: number }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [withdrawals, setWithdrawals] = useState(initialWithdrawals);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState("ACTIVE");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();

  function load(nextPage: number, nextStatus: string = status, nextQuery: string = appliedQuery) {
    startTransition(async () => {
      try {
        const result = await listWithdrawalsAdmin({ status: nextStatus, q: nextQuery || undefined, page: nextPage });
        setWithdrawals(result.withdrawals);
        setTotal(result.total);
        setPage(nextPage);
      } catch {
        msg.error("دریافت فهرست درخواست‌ها ناموفق بود");
      }
    });
  }

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    setAppliedQuery(trimmed);
    load(1, status, trimmed);
  }

  function handleChanged() {
    load(page);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="کد درخواست یا نام کاربر"
          maxLength={60}
          className="min-h-11 min-w-[180px] flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text-main outline-none focus:border-primary"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            load(1, e.target.value);
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-main"
        >
          {FILTERS.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={isPending} className="min-h-11 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          جستجو
        </button>
      </form>

      <div className={`divide-y divide-border rounded-md border border-border transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {withdrawals.map((item) => (
          <AdminWithdrawalCard key={item.id} item={item} onChanged={handleChanged} />
        ))}
        {withdrawals.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">درخواستی یافت نشد.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{total.toLocaleString("fa-IR")} درخواست</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => load(page - 1)} disabled={page <= 1 || isPending} className="min-h-11 px-3 disabled:opacity-30">
            قبلی
          </button>
          <button type="button" onClick={() => load(page + 1)} disabled={page * WITHDRAWAL_PAGE_SIZE >= total || isPending} className="min-h-11 px-3 disabled:opacity-30">
            بعدی
          </button>
        </div>
      </div>
    </div>
  );
}