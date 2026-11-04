"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetOperationPolicy, updateOperationPolicy, type PolicyRow } from "@/app/admin/actions/operations";
import { useSystemMessage } from "@/components/ui/system-message";

function PolicyItem({ policy }: { policy: PolicyRow }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [maxUnits, setMaxUnits] = useState(String(policy.maxUnits));
  const [windowHours, setWindowHours] = useState(String(policy.windowHours));
  const [enabled, setEnabled] = useState(policy.isEnabled);
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleReset() {
    const ok = await msg.confirm({
      title: "بازگشت به مقدار پیش‌فرض",
      message: "تنظیم سفارشی این عملیات حذف می‌شود و سقف پیش‌فرض سیستم اعمال می‌شود.",
      confirmLabel: "بازنشانی",
    });
    if (!ok) return;
    await run(() => resetOperationPolicy(policy.operation), "تنظیمات بازنشانی شد");
    setMaxUnits(String(policy.maxUnits));
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-text-main">{policy.label}</p>
        <div className="flex items-center gap-2">
          {policy.isCustom && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">سفارشی</span>}
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            محدودیت فعال
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs text-text-muted">حداکثر تعداد</label>
          <input type="number" min={1} value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-muted">در بازه‌ی (ساعت)</label>
          <input type="number" min={1} max={720} value={windowHours} onChange={(e) => setWindowHours(e.target.value)} className={inputClass} />
        </div>
      </div>
      <p className="text-[11px] leading-5 text-text-muted">
        سقف روی هر کاربر، هر ناشر و هر اثر جداگانه بررسی می‌شود؛ پس ساخت چند حساب برای دور زدن آن کارآمد نیست. ادمین از این سقف‌ها مستثنی است اما هر Override در لاگ ثبت می‌شود.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            run(
              () => updateOperationPolicy({ operation: policy.operation, maxUnits: Number(maxUnits), windowHours: Number(windowHours), isEnabled: enabled }),
              "تنظیمات ذخیره شد"
            )
          }
          className="min-h-10 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          ذخیره
        </button>
        {policy.isCustom && (
          <button type="button" disabled={busy} onClick={handleReset} className="min-h-10 rounded-md border border-border px-4 text-xs text-text-muted disabled:opacity-50">
            بازگشت به پیش‌فرض
          </button>
        )}
      </div>
    </div>
  );
}

export function OperationPolicyForm({ policies }: { policies: PolicyRow[] }) {
  return (
    <div className="space-y-3">
      {policies.map((policy) => (
        <PolicyItem key={`${policy.operation}:${policy.maxUnits}:${policy.windowHours}:${policy.isEnabled}`} policy={policy} />
      ))}
    </div>
  );
}