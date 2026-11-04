"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideApprovals, listApprovals, type ApprovalRow } from "@/app/admin/actions/operations";
import { useSystemMessage } from "@/components/ui/system-message";
import { APPROVAL_VALID_HOURS } from "@/lib/operations";
import { formatDateTime } from "@/lib/format";

const FILTERS = [
  { value: "PENDING", label: "در انتظار" },
  { value: "APPROVED", label: "تأییدشده" },
  { value: "REJECTED", label: "ردشده" },
  { value: "CONSUMED", label: "اجراشده" },
  { value: "", label: "همه" },
];

const STATUS_LABELS: Record<ApprovalRow["status"], string> = {
  PENDING: "در انتظار",
  APPROVED: "تأییدشده",
  REJECTED: "ردشده",
  CONSUMED: "اجراشده",
};

const STATUS_CLASSES: Record<ApprovalRow["status"], string> = {
  PENDING: "bg-accent/10 text-accent",
  APPROVED: "bg-primary/10 text-primary",
  REJECTED: "bg-red-500/10 text-red-400",
  CONSUMED: "bg-border text-text-muted",
};

export function OperationApprovalQueue({ initialRows }: { initialRows: ApprovalRow[] }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [rows, setRows] = useState(initialRows);
  const [filter, setFilter] = useState("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  function load(nextFilter: string) {
    startTransition(async () => {
      try {
        setRows(await listApprovals(nextFilter));
        setSelected(new Set());
      } catch {
        msg.error("دریافت فهرست ناموفق بود");
      }
    });
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function decide(ids: string[], approve: boolean) {
    if (ids.length === 0) return;

    let note: string | undefined;
    if (approve) {
      const ok = await msg.confirm({
        title: "تأیید عملیات",
        message: `${ids.length.toLocaleString("fa-IR")} درخواست تأیید می‌شود. هر تأیید فقط یک‌بار و تا ${APPROVAL_VALID_HOURS.toLocaleString("fa-IR")} ساعت معتبر است.`,
        confirmLabel: "تأیید",
      });
      if (!ok) return;
    } else {
      const reason = await msg.prompt({
        title: "رد درخواست",
        label: "دلیل رد",
        multiline: true,
        minLength: 3,
        maxLength: 300,
        confirmLabel: "رد درخواست",
      });
      if (reason === null) return;
      note = reason;
    }

    startTransition(async () => {
      try {
        const result = await decideApprovals(ids, approve, note);
        if (result.success) {
          msg.success(approve ? "تأیید ثبت شد و به درخواست‌دهنده اطلاع داده شد" : "درخواست رد شد");
          setRows(await listApprovals(filter));
          setSelected(new Set());
          router.refresh();
        } else {
          msg.error(result.error ?? "عملیات ناموفق بود");
        }
      } catch {
        msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
      }
    });
  }

  const pendingIds = rows.filter((row) => row.status === "PENDING").map((row) => row.id);
  const selectedIds = [...selected];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            load(e.target.value);
          }}
          className="min-h-11 rounded-md border border-border bg-surface px-3 text-sm text-text-main"
        >
          {FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {pendingIds.length > 0 && (
          <button
            type="button"
            onClick={() => setSelected(selected.size === pendingIds.length ? new Set() : new Set(pendingIds))}
            className="min-h-11 rounded-md border border-border px-3 text-xs text-text-main"
          >
            {selected.size === pendingIds.length ? "لغو انتخاب همه" : "انتخاب همه"}
          </button>
        )}
        {selectedIds.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => decide(selectedIds, true)}
              disabled={isPending}
              className="min-h-11 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              تأیید {selectedIds.length.toLocaleString("fa-IR")} مورد
            </button>
            <button
              type="button"
              onClick={() => decide(selectedIds, false)}
              disabled={isPending}
              className="min-h-11 rounded-md border border-red-400 px-4 text-xs text-red-400 disabled:opacity-50"
            >
              رد انتخاب‌شده‌ها
            </button>
          </>
        )}
      </div>

      <div className={`divide-y divide-border rounded-md border border-border transition-opacity ${isPending ? "opacity-60" : ""}`}>
        {rows.map((row) => (
          <div key={row.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                {row.status === "PENDING" && (
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} className="mt-1 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-text-main">{row.operationLabel}</p>
                  <p className="mt-0.5 text-xs leading-6 text-text-muted">{row.summary}</p>
                  <p className="text-[11px] text-text-muted">
                    {row.actorName}
                    {row.publisherName && ` · ${row.publisherName}`} · {formatDateTime(row.createdAt)}
                  </p>
                  {row.decisionNote && <p className="mt-0.5 text-xs text-accent">یادداشت: {row.decisionNote}</p>}
                  {row.expiresAt && row.status === "APPROVED" && (
                    <p className="text-[11px] text-text-muted">معتبر تا {formatDateTime(row.expiresAt)}</p>
                  )}
                </div>
              </div>
              <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs ${STATUS_CLASSES[row.status]}`}>{STATUS_LABELS[row.status]}</span>
            </div>
            {row.status === "PENDING" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => decide([row.id], true)}
                  disabled={isPending}
                  className="min-h-9 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  تأیید
                </button>
                <button
                  type="button"
                  onClick={() => decide([row.id], false)}
                  disabled={isPending}
                  className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50"
                >
                  رد
                </button>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">درخواستی وجود ندارد.</p>}
      </div>
    </div>
  );
}