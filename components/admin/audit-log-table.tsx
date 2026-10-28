"use client";

import { useState, useTransition, type FormEvent } from "react";
import { searchAuditLogAction } from "@/app/admin/actions/audit-log";
import { AUDIT_GROUPS, auditGroupLabel } from "@/lib/audit-actions";
import type { AuditLogRow } from "@/lib/audit-log";

const PAGE_SIZE = 50;

interface Filters {
  group: string;
  actor: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { group: "", actor: "", from: "", to: "" };

function hasFilters(filters: Filters): boolean {
  return Boolean(filters.group || filters.actor.trim() || filters.from || filters.to);
}

export function AuditLogTable({ initial, initialTotal }: { initial: AuditLogRow[]; initialTotal: number }) {
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
        const result = await searchAuditLogAction({
          group: filters.group || undefined,
          actorQuery: filters.actor.trim() || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: nextPage,
        });
        setRows(result.logs);
        setTotal(result.total);
        setPage(nextPage);
      } catch {
        setError("دریافت لاگ‌ها ناموفق بود");
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
          <select value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} className={inputClass}>
            <option value="">همه رویدادها</option>
            {AUDIT_GROUPS.map((group) => (
              <option key={group.value} value={group.value}>{group.label}</option>
            ))}
          </select>
          <input
            value={draft.actor}
            onChange={(e) => setDraft({ ...draft, actor: e.target.value })}
            placeholder="نام یا یوزرنیم عامل"
            maxLength={100}
            className={`${inputClass} sm:col-span-3`}
          />
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
        {rows.map((log) => (
          <div key={log.id} className="space-y-1 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-text-main">
                  {log.actorName ?? log.actorId.slice(0, 8)}
                  <span className="text-text-muted"> · {log.actorRole}</span>
                  {auditGroupLabel(log.action) && <span className="text-text-muted"> · {auditGroupLabel(log.action)}</span>}
                </p>
                <p dir="ltr" className="text-start text-xs text-text-muted">{log.action}</p>
              </div>
              <span className="text-xs text-text-muted">{new Date(log.createdAt).toLocaleString("fa-IR")}</span>
            </div>
            {log.targetType && (
              <p className="text-xs text-text-muted">
                هدف: {log.targetType}
                {log.targetId ? ` #${log.targetId.slice(0, 8)}` : ""}
              </p>
            )}
            {log.metadata != null && (
              <pre className="overflow-x-auto rounded bg-background p-2 text-[10px] text-text-muted" dir="ltr">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">لاگی یافت نشد.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{total.toLocaleString("fa-IR")} رکورد</span>
        <div className="flex gap-2">
          <button onClick={() => runSearch(applied, page - 1)} disabled={page <= 1 || isPending} className="min-h-11 px-3 disabled:opacity-30">قبلی</button>
          <button onClick={() => runSearch(applied, page + 1)} disabled={page * PAGE_SIZE >= total || isPending} className="min-h-11 px-3 disabled:opacity-30">بعدی</button>
        </div>
      </div>
    </div>
  );
}