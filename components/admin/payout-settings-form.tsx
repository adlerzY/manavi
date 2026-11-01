"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { updatePayoutSettings } from "@/app/admin/actions/withdrawals";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatToman } from "@/lib/withdrawal-types";

interface PayoutSettingsFormProps {
  initialValueToman: number;
  initialMinCoins: number;
  effectiveValueToman: number;
}

export function PayoutSettingsForm({ initialValueToman, initialMinCoins, effectiveValueToman }: PayoutSettingsFormProps) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [value, setValue] = useState(String(initialValueToman));
  const [min, setMin] = useState(String(initialMinCoins));
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    const ok = await msg.confirm({
      title: "ذخیره‌ی تنظیمات تسویه",
      message: "تغییر نرخ فقط روی درخواست‌های جدید اثر دارد؛ درخواست‌های ثبت‌شده با نرخ لحظه‌ی ثبت محاسبه می‌شوند.",
      confirmLabel: "ذخیره",
    });
    if (!ok) return;

    setPending(true);
    try {
      const result = await updatePayoutSettings({ payoutCoinValueToman: Number(value), payoutMinCoins: Number(min) });
      if (result.success) {
        msg.success("تنظیمات تسویه ذخیره شد");
        router.refresh();
      } else {
        msg.error(result.error ?? "ذخیره‌ی تنظیمات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setPending(false);
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-text-main">تنظیمات تسویه‌حساب</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor="payout-value">
            ارزش هر سکه هنگام تسویه (تومان)
          </label>
          <input id="payout-value" type="number" min={0} step={1} value={value} onChange={(e) => setValue(e.target.value)} required className={inputClass} />
          <p className="text-[11px] leading-5 text-text-muted">
            اگر صفر بماند، از «ارزش هر سکه به تتر × نرخ تومان» محاسبه می‌شود. نرخ مؤثر فعلی: {effectiveValueToman > 0 ? formatToman(effectiveValueToman) : "تعریف نشده — تسویه غیرفعال است"}
          </p>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor="payout-min">
            حداقل مقدار هر تسویه (سکه)
          </label>
          <input id="payout-min" type="number" min={1} step={1} value={min} onChange={(e) => setMin(e.target.value)} required className={inputClass} />
        </div>
      </div>
      <button type="submit" disabled={pending} className="min-h-11 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {pending ? "در حال ذخیره…" : "ذخیره‌ی تنظیمات"}
      </button>
    </form>
  );
}