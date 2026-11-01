"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelMyWithdrawal, getMyWithdrawalReceipt, respondToMyWithdrawal } from "@/app/actions/withdrawals";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";
import {
  WITHDRAWAL_STATUS_CLASSES,
  WITHDRAWAL_STATUS_LABELS,
  formatCoins,
  formatToman,
  type WithdrawalView,
} from "@/lib/withdrawal-types";
import { WithdrawalTimeline } from "./withdrawal-timeline";

function statusHint(item: WithdrawalView): string | null {
  if (item.status === "PENDING") return "درخواست شما در صف بررسی مدیریت است.";
  if (item.status === "PROCESSING") return "مدیریت در حال انجام پرداخت است.";
  if (item.status === "REJECTED") return "مبلغ این درخواست به موجودی شما برگشته است.";
  if (item.status === "CANCELLED") return "این درخواست لغو شد و مبلغ به موجودی شما برگشت.";
  if (item.status === "PAID") {
    if (!item.response) return "پرداخت انجام شده است. لطفاً پس از بررسی حساب بانکی، دریافت را تأیید کنید.";
    if (item.response === "CONFIRMED") return "دریافت پرداخت توسط شما تأیید شده است.";
    if (item.disputeResolvedAt) return "مغایرت شما بررسی و پاسخ داده شد.";
    return "مغایرت شما ثبت شده و در انتظار پاسخ مدیریت است.";
  }
  return null;
}

export function WithdrawalItem({ withdrawal }: { withdrawal: WithdrawalView }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage?: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        if (successMessage) msg.success(successMessage);
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleCancel() {
    const ok = await msg.confirm({
      title: "لغو درخواست تسویه",
      message: "مبلغ نگه‌داری‌شده به موجودی شما برمی‌گردد و می‌توانید درخواست جدیدی ثبت کنید.",
      confirmLabel: "لغو درخواست",
      cancelLabel: "انصراف",
      danger: true,
    });
    if (ok) await run(() => cancelMyWithdrawal(withdrawal.id), "درخواست لغو شد و مبلغ به موجودی شما برگشت");
  }

  async function handleConfirm() {
    const ok = await msg.confirm({
      title: "تأیید دریافت پرداخت",
      message: `تأیید می‌کنید مبلغ ${formatToman(withdrawal.amountToman)} به حساب شما واریز شده است؟`,
      confirmLabel: "تأیید دریافت",
    });
    if (ok) await run(() => respondToMyWithdrawal(withdrawal.id, "CONFIRMED"), "ممنون؛ دریافت پرداخت تأیید شد");
  }

  async function handleDispute() {
    const reason = await msg.prompt({
      title: "ثبت مغایرت",
      message: "مشکل را شرح دهید؛ برای مدیریت ارسال و پیگیری می‌شود.",
      label: "توضیح مغایرت",
      multiline: true,
      minLength: 5,
      maxLength: 500,
      confirmLabel: "ثبت مغایرت",
    });
    if (reason !== null) await run(() => respondToMyWithdrawal(withdrawal.id, "DISPUTED", reason), "مغایرت ثبت شد و برای مدیریت ارسال گردید");
  }

  async function handleReceipt() {
    setBusy(true);
    try {
      const result = await getMyWithdrawalReceipt(withdrawal.id);
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

  const hint = statusHint(withdrawal);

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-text-main" dir="ltr">
            {withdrawal.code}
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            {withdrawal.ownerLabel} · {formatDateTime(withdrawal.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs ${WITHDRAWAL_STATUS_CLASSES[withdrawal.status]}`}>
          {WITHDRAWAL_STATUS_LABELS[withdrawal.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-background p-3 text-center">
          <p className="text-sm font-semibold text-primary">{formatCoins(withdrawal.coins)} سکه</p>
          <p className="mt-0.5 text-[11px] text-text-muted">مقدار درخواست</p>
        </div>
        <div className="rounded-md bg-background p-3 text-center">
          <p className="text-sm font-semibold text-text-main">{formatToman(withdrawal.amountToman)}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">نرخ هر سکه {formatToman(withdrawal.coinValueToman)}</p>
        </div>
      </div>

      <p className="text-xs leading-6 text-text-muted">
        کارت مقصد: <span dir="ltr">{withdrawal.cardDisplay}</span> — {withdrawal.cardHolder}
      </p>

      {hint && <p className="rounded-md bg-background px-3 py-2 text-xs leading-6 text-text-main">{hint}</p>}
      {withdrawal.status === "REJECTED" && withdrawal.adminNote && (
        <p className="rounded-md border border-red-400/30 bg-red-500/5 px-3 py-2 text-xs leading-6 text-red-400">دلیل رد: {withdrawal.adminNote}</p>
      )}
      {withdrawal.status === "PAID" && withdrawal.paymentReference && (
        <p className="text-xs text-text-muted">
          شماره پیگیری: <span dir="ltr">{withdrawal.paymentReference}</span>
        </p>
      )}
      {withdrawal.responseNote && <p className="text-xs leading-6 text-text-muted">توضیح شما: {withdrawal.responseNote}</p>}
      {withdrawal.disputeResolution && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs leading-6 text-text-main">
          پاسخ مدیریت: {withdrawal.disputeResolution}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {withdrawal.hasReceipt && (
          <button
            type="button"
            onClick={handleReceipt}
            disabled={busy}
            className="min-h-10 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50"
          >
            مشاهده‌ی رسید پرداخت
          </button>
        )}
        {withdrawal.status === "PENDING" && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy}
            className="min-h-10 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
          >
            لغو درخواست
          </button>
        )}
        {withdrawal.status === "PAID" && !withdrawal.response && (
          <>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="min-h-10 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              تأیید دریافت
            </button>
            <button
              type="button"
              onClick={handleDispute}
              disabled={busy}
              className="min-h-10 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
            >
              ثبت مغایرت
            </button>
          </>
        )}
      </div>

      <WithdrawalTimeline events={withdrawal.events} />
    </div>
  );
}