"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ReportTargetType } from "@prisma/client";
import {
  listReports,
  processReport,
  type ReportDecision,
  type ReportRow,
  type ReportStatusFilter,
} from "@/app/admin/actions/reports";
import { REPORT_CATEGORY_LABELS, REPORT_STATUS_LABELS, REPORT_TARGET_LABELS } from "@/lib/report-labels";

const PAGE_SIZE = 25;

const STATUS_FILTERS: { value: ReportStatusFilter; label: string }[] = [
  { value: "ACTIVE", label: "نیازمند بررسی" },
  { value: "ACTION_TAKEN", label: "اقدام‌شده" },
  { value: "RESOLVED", label: "حل‌شده" },
  { value: "REJECTED", label: "ردشده" },
  { value: "", label: "همه" },
];

const TARGET_TYPES = Object.keys(REPORT_TARGET_LABELS) as ReportTargetType[];

const STATUS_CLASSES: Record<ReportRow["status"], string> = {
  OPEN: "bg-accent/10 text-accent",
  UNDER_REVIEW: "bg-primary/10 text-primary",
  ACTION_TAKEN: "bg-primary/10 text-primary",
  RESOLVED: "bg-border text-text-muted",
  REJECTED: "bg-border text-text-muted",
};

function ReportCard({
  report,
  disabled,
  onProcess,
}: {
  report: ReportRow;
  disabled: boolean;
  onProcess: (decision: ReportDecision, note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const isActive = report.status === "OPEN" || report.status === "UNDER_REVIEW";
  const target = report.target;

  function run(decision: ReportDecision, confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return;
    onProcess(decision, note);
  }

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-text-main">
            <span className="text-text-muted">{REPORT_TARGET_LABELS[report.targetType]}:</span>{" "}
            {target ? target.title : "هدف حذف شده است"}
          </p>
          {target?.subtitle && <p className="text-xs text-text-muted">{target.subtitle}</p>}
          {target?.excerpt && <p className="rounded-md bg-background px-3 py-2 text-xs leading-6 text-text-muted">{target.excerpt}</p>}
          <p className="text-xs text-primary">{REPORT_CATEGORY_LABELS[report.category]}</p>
          {report.details && <p className="text-xs leading-6 text-text-main">{report.details}</p>}
          <p className="text-[11px] text-text-muted">
            {report.reporter.username ? `@${report.reporter.username}` : report.reporter.firstName} ·{" "}
            {new Date(report.createdAt).toLocaleString("fa-IR")}
          </p>
          {report.resolutionNote && <p className="text-xs text-accent">یادداشت: {report.resolutionNote}</p>}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs ${STATUS_CLASSES[report.status]}`}>{REPORT_STATUS_LABELS[report.status]}</span>
          {target?.href && (
            <Link href={target.href} className="text-xs text-primary underline">
              مشاهده
            </Link>
          )}
        </div>
      </div>

      {isActive && (
        <div className="space-y-2">
          <button type="button" onClick={() => setOpen((prev) => !prev)} className="text-xs text-text-muted underline decoration-dotted">
            {open ? "بستن" : "رسیدگی"}
          </button>

          {open && (
            <div className="space-y-2 rounded-md bg-background p-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="یادداشت (اختیاری — برای گزارش‌دهنده هم ارسال می‌شود)"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-main outline-none focus:border-primary"
              />
              <div className="flex flex-wrap gap-2">
                {report.status === "OPEN" && (
                  <button type="button" onClick={() => run("REVIEW")} disabled={disabled} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50">
                    شروع بررسی
                  </button>
                )}
                {report.targetType === "EDITION_CHAPTER" && !target?.actioned && (
                  <button
                    type="button"
                    onClick={() => run("DISABLE_CHAPTER", "این چپتر برای کاربران غیرفعال می‌شود. ادامه می‌دهید؟")}
                    disabled={disabled}
                    className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
                  >
                    غیرفعال‌سازی چپتر
                  </button>
                )}
                {report.targetType === "COMMENT" && !target?.actioned && (
                  <button
                    type="button"
                    onClick={() => run("HIDE_COMMENT")}
                    disabled={disabled}
                    className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
                  >
                    مخفی‌سازی نظر
                  </button>
                )}
                {report.targetType === "EDITION" && !target?.actioned && (
                  <button
                    type="button"
                    onClick={() => run("SUSPEND_EDITION", "این نسخه برای همه‌ی کاربران معلق می‌شود. ادامه می‌دهید؟")}
                    disabled={disabled}
                    className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
                  >
                    تعلیق نسخه
                  </button>
                )}
                <button type="button" onClick={() => run("RESOLVE")} disabled={disabled} className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50">
                  حل‌شده
                </button>
                <button type="button" onClick={() => run("REJECT")} disabled={disabled} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-muted disabled:opacity-50">
                  رد گزارش
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReportQueue({ initialReports, initialTotal }: { initialReports: ReportRow[]; initialTotal: number }) {
  const [reports, setReports] = useState(initialReports);
  const [total, setTotal] = useState(initialTotal);
  const [status, setStatus] = useState<ReportStatusFilter>("ACTIVE");
  const [targetType, setTargetType] = useState<ReportTargetType | "">("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function load(nextPage: number, nextStatus: ReportStatusFilter = status, nextType: ReportTargetType | "" = targetType) {
    startTransition(async () => {
      const result = await listReports({ status: nextStatus, targetType: nextType, page: nextPage });
      setReports(result.reports);
      setTotal(result.total);
      setPage(nextPage);
    });
  }

  function handleProcess(reportId: string, decision: ReportDecision, note: string) {
    setError(null);
    startTransition(async () => {
      const result = await processReport({ reportId, decision, note });
      if (!result.success) {
        setError(result.error ?? "خطا در ثبت تصمیم");
        return;
      }
      const refreshed = await listReports({ status, targetType, page });
      setReports(refreshed.reports);
      setTotal(refreshed.total);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            const value = e.target.value as ReportStatusFilter;
            setStatus(value);
            load(1, value);
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main"
        >
          {STATUS_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={targetType}
          onChange={(e) => {
            const value = e.target.value as ReportTargetType | "";
            setTargetType(value);
            load(1, status, value);
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main"
        >
          <option value="">همه‌ی انواع</option>
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {REPORT_TARGET_LABELS[type]}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div className={`divide-y divide-border rounded-md border border-border transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            disabled={isPending}
            onProcess={(decision, note) => handleProcess(report.id, decision, note)}
          />
        ))}
        {reports.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">گزارشی یافت نشد.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{total.toLocaleString("fa-IR")} گزارش</span>
        <div className="flex gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1 || isPending} className="min-h-11 px-3 disabled:opacity-30">
            قبلی
          </button>
          <button onClick={() => load(page + 1)} disabled={page * PAGE_SIZE >= total || isPending} className="min-h-11 px-3 disabled:opacity-30">
            بعدی
          </button>
        </div>
      </div>
    </div>
  );
}