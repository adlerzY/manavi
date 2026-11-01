"use client";

import { useCallback, useEffect, useState } from "react";
import { getMyEarningsLedger } from "@/app/actions/withdrawals";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";
import { formatCoins, type LedgerRowView } from "@/lib/withdrawal-types";

export function LedgerList({ ownerType }: { ownerType: "USER" | "PUBLISHER" }) {
  const msg = useSystemMessage();
  const [entries, setEntries] = useState<LedgerRowView[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextPage: number) => {
      setLoading(true);
      try {
        const result = await getMyEarningsLedger(ownerType, nextPage);
        if (result.success && result.data) {
          const data = result.data;
          setEntries((prev) => (nextPage === 1 ? data.entries : [...prev, ...data.entries]));
          setTotal(data.total);
          setPage(nextPage);
        } else {
          msg.error(result.error ?? "دریافت گردش حساب ناموفق بود");
        }
      } catch {
        msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
      }
      setLoading(false);
    },
    [ownerType, msg]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="divide-y divide-border rounded-md border border-border">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm text-text-main">{entry.title}</p>
              {entry.detail && <p className="mt-0.5 truncate text-xs text-text-muted">{entry.detail}</p>}
              <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(entry.createdAt)}</p>
            </div>
            <p dir="ltr" className={`flex-shrink-0 text-sm font-medium ${entry.coins > 0 ? "text-primary" : "text-text-main"}`}>
              {entry.coins > 0 ? "+" : "−"}
              {formatCoins(Math.abs(entry.coins))}
            </p>
          </div>
        ))}
        {!loading && entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">هنوز گردشی ثبت نشده است.</p>}
        {loading && entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">در حال بارگذاری…</p>}
      </div>

      {entries.length < total && (
        <button
          type="button"
          onClick={() => load(page + 1)}
          disabled={loading}
          className="min-h-11 w-full rounded-md border border-border bg-surface px-4 text-sm text-text-main disabled:opacity-50"
        >
          {loading ? "در حال بارگذاری…" : `نمایش بیشتر (${(total - entries.length).toLocaleString("fa-IR")} مورد)`}
        </button>
      )}
    </div>
  );
}