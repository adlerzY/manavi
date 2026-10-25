"use client";

import { useState } from "react";
import { cancelEditionRequest, requestEdition } from "@/app/actions/edition-requests";
import { LANGUAGE_LABELS } from "@/lib/languages";

interface RequestEditionCardProps {
  workId: string;
  authenticated: boolean;
  activeLanguage: string | null;
}

export function RequestEditionCard({ workId, authenticated, activeLanguage: initialLanguage }: RequestEditionCardProps) {
  const [activeLanguage, setActiveLanguage] = useState(initialLanguage);
  const [language, setLanguage] = useState(initialLanguage ?? "fa");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setPending(true);
    setError(null);
    const result = await requestEdition(workId, language, reason);
    if (result.success) {
      setActiveLanguage(language);
      setReason("");
    } else {
      setError(result.error ?? "خطا در ثبت درخواست");
    }
    setPending(false);
  }

  async function handleCancel() {
    setPending(true);
    setError(null);
    const result = await cancelEditionRequest(workId);
    if (result.success) setActiveLanguage(null);
    else setError(result.error ?? "خطا");
    setPending(false);
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <div>
        <p className="text-sm font-medium text-text-main">نسخه‌ی بهتر یا زبان دیگری می‌خواهید؟</p>
        <p className="mt-1 text-xs leading-6 text-text-muted">
          درخواست شما فقط برای اولویت‌بندی جذب ناشر و مجوز استفاده می‌شود و به‌تنهایی نسخه‌ی جدیدی منتشر نمی‌کند.
        </p>
      </div>

      {!authenticated ? (
        <p className="text-xs text-text-muted">برای ثبت درخواست از داخل تلگرام وارد شوید.</p>
      ) : activeLanguage ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-primary">درخواست شما برای «{LANGUAGE_LABELS[activeLanguage] ?? activeLanguage}» ثبت شده است.</p>
          <button type="button" onClick={handleCancel} disabled={pending} className="text-xs text-red-400 disabled:opacity-50">
            لغو درخواست
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
          >
            {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            placeholder="دلیل (اختیاری)"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="w-full rounded-md border border-primary px-4 py-2 text-sm text-primary disabled:opacity-50"
          >
            {pending ? "در حال ثبت…" : "ثبت درخواست"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}