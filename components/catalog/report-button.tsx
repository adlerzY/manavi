"use client";

import { useState, type FormEvent } from "react";
import { Flag } from "lucide-react";
import { submitReport } from "@/app/actions/reports";
import type { ReportCategory, ReportTargetType } from "@prisma/client";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  TRANSLATION_ERROR: "ترجمه ناقص یا معنای اشتباه",
  BROKEN_IMAGES: "تصاویر خراب یا صفحات ناقص",
  UNLABELED_SPOILER: "اسپویلر بدون برچسب",
  INAPPROPRIATE: "محتوای نامناسب",
  RIGHTS_VIOLATION: "نقض حقوق یا انتشار بدون مجوز",
  MISLEADING_CREDIT: "اطلاعات یا اعتبار گمراه‌کننده",
  BILLING_ACCESS: "مشکل قیمت یا دسترسی",
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ReportCategory[];

interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  label?: string;
  className?: string;
}

export function ReportButton({ targetType, targetId, label = "گزارش مشکل", className }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ReportCategory>("TRANSLATION_ERROR");
  const [details, setDetails] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const result = await submitReport({ targetType, targetId, category, details });
    if (result.success) {
      setStatus("done");
      setDetails("");
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در ثبت گزارش");
    }
  }

  function close() {
    setOpen(false);
    setStatus("idle");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? "flex items-center gap-1.5 text-xs text-text-muted hover:text-text-main"}
      >
        <Flag size={13} />
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 px-4 sm:items-center" onClick={close}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-4 rounded-md border border-border bg-surface p-5">
            {status === "done" ? (
              <>
                <p className="text-sm text-primary">گزارش شما ثبت شد و بررسی می‌شود.</p>
                <button type="button" onClick={close} className="w-full rounded-md border border-border px-4 py-2 text-sm text-text-main">
                  بستن
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h3 className="text-sm font-semibold text-text-main">گزارش مشکل</h3>
                <div className="space-y-1">
                  <label htmlFor={`report-category-${targetId}`} className="text-xs text-text-muted">نوع مشکل</label>
                  <select
                    id={`report-category-${targetId}`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ReportCategory)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
                  >
                    {CATEGORIES.map((item) => (
                      <option key={item} value={item}>{CATEGORY_LABELS[item]}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor={`report-details-${targetId}`} className="text-xs text-text-muted">توضیح (اختیاری)</label>
                  <textarea
                    id={`report-details-${targetId}`}
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
                  />
                </div>
                {error && <p className="text-xs text-red-400">{error}</p>}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={status === "sending"}
                    className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {status === "sending" ? "در حال ارسال…" : "ثبت گزارش"}
                  </button>
                  <button type="button" onClick={close} className="rounded-md border border-border px-4 py-2 text-sm text-text-muted">
                    انصراف
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}