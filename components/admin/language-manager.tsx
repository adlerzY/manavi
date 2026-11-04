"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createLanguage, setDefaultLanguage, updateLanguage, type LanguageRow } from "@/app/admin/actions/languages";
import { useSystemMessage } from "@/components/ui/system-message";

function LanguageItem({ language }: { language: LanguageRow }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(language.label);
  const [sortOrder, setSortOrder] = useState(String(language.sortOrder));
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        setEditing(false);
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleToggleActive() {
    if (language.isActive) {
      const ok = await msg.confirm({
        title: "غیرفعال‌سازی زبان",
        message: `ساخت نسخه‌ی جدید با زبان «${language.label}» ممکن نخواهد بود. ${language.editionCount.toLocaleString("fa-IR")} نسخه‌ی موجود و خریدهای آن‌ها بدون تغییر می‌مانند.`,
        confirmLabel: "غیرفعال‌سازی",
        danger: true,
      });
      if (!ok) return;
    }
    await run(
      () => updateLanguage(language.code, { label: language.label, isActive: !language.isActive, sortOrder: language.sortOrder }),
      language.isActive ? "زبان غیرفعال شد" : "زبان فعال شد"
    );
  }

  const inputClass = "rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main outline-none focus:border-primary";

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span dir="ltr" className="rounded bg-background px-2 py-0.5 text-xs text-text-muted">
            {language.code}
          </span>
          <span className="text-sm text-text-main">{language.label}</span>
          {language.isDefault && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">پیش‌فرض</span>}
          {!language.isActive && <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-text-muted">غیرفعال</span>}
        </div>
        <span className="text-xs text-text-muted">{language.editionCount.toLocaleString("fa-IR")} نسخه</span>
      </div>

      {editing ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-background p-2">
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} className={`${inputClass} min-w-[140px] flex-1`} />
          <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className={`${inputClass} w-20`} aria-label="ترتیب" />
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => updateLanguage(language.code, { label, isActive: language.isActive, sortOrder: Number(sortOrder) }), "زبان ذخیره شد")}
            className="min-h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            ذخیره
          </button>
          <button type="button" onClick={() => setEditing(false)} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-muted">
            انصراف
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50">
            ویرایش
          </button>
          {!language.isDefault && language.isActive && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setDefaultLanguage(language.code), "زبان پیش‌فرض تغییر کرد")}
              className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50"
            >
              پیش‌فرض کن
            </button>
          )}
          {!language.isDefault && (
            <button type="button" disabled={busy} onClick={handleToggleActive} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-muted disabled:opacity-50">
              {language.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function LanguageManager({ languages }: { languages: LanguageRow[] }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await createLanguage({ code, label });
      if (result.success) {
        msg.success("زبان اضافه شد");
        setCode("");
        setLabel("");
        router.refresh();
      } else {
        msg.error(result.error ?? "ثبت زبان ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-4">
        <div className="w-28 space-y-1">
          <label className="text-xs text-text-muted" htmlFor="language-code">کد زبان</label>
          <input id="language-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={5} placeholder="de" className={inputClass} />
        </div>
        <div className="min-w-[160px] flex-1 space-y-1">
          <label className="text-xs text-text-muted" htmlFor="language-label">نام نمایشی</label>
          <input id="language-label" value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={40} placeholder="آلمانی" className={inputClass} />
        </div>
        <button type="submit" disabled={busy} className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
          افزودن زبان
        </button>
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {languages.map((language) => (
          <LanguageItem key={`${language.code}:${language.label}:${language.isActive}:${language.isDefault}:${language.sortOrder}`} language={language} />
        ))}
        {languages.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">زبانی ثبت نشده است.</p>}
      </div>
    </div>
  );
}