"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  grantComicAccess,
  revokeComicAccess,
  setComicAccessMode,
  setEmergencyLock,
  transferComicOwnership,
  type ComicAccessOverview,
  type ComicAccessRow,
} from "@/app/admin/actions/access";
import { Disclosure } from "@/components/ui/disclosure";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";

interface ComicAccessManagerProps {
  comicId: string;
  overview: ComicAccessOverview;
  publishers: { id: string; name: string }[];
}

const SOURCE_LABELS: Record<string, string> = {
  MIGRATION: "مهاجرت",
  LICENSE: "لایسنس",
  GLOBAL: "لایسنس سراسری",
  ADMIN: "ادمین",
  RECOVERY: "بازیابی",
};

function rowState(row: ComicAccessRow): { label: string; className: string } {
  if (row.revokedAt) return { label: "لغوشده", className: "bg-red-500/10 text-red-400" };
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) return { label: "منقضی", className: "bg-border text-text-muted" };
  if (row.publisherStatus === "SUSPENDED") return { label: "ناشر معلق", className: "bg-accent/10 text-accent" };
  return { label: "فعال", className: "bg-primary/10 text-primary" };
}

export function ComicAccessManager({ comicId, overview, publishers }: ComicAccessManagerProps) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [busy, setBusy] = useState(false);
  const [publisherId, setPublisherId] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string): Promise<boolean> {
    setBusy(true);
    let ok = false;
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        router.refresh();
        ok = true;
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
    return ok;
  }

  async function handleAdd() {
    if (!publisherId) return;
    const ok = await run(
      () => grantComicAccess({ comicId, publisherId, readOnly, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }),
      "دسترسی ثبت شد"
    );
    if (ok) {
      setPublisherId("");
      setReadOnly(false);
      setExpiresAt("");
    }
  }

  async function handleRevoke(row: ComicAccessRow) {
    const ok = await msg.confirm({
      title: "لغو دسترسی",
      message: `دسترسی «${row.publisherName}» به این اثر لغو می‌شود. نسخه‌ها، فروش‌ها و درآمدهای ثبت‌شده‌ی این ناشر حفظ می‌مانند اما او دیگر نمی‌تواند آن‌ها را مدیریت کند.`,
      confirmLabel: "لغو دسترسی",
      danger: true,
    });
    if (ok) await run(() => revokeComicAccess(comicId, row.publisherId), "دسترسی لغو شد");
  }

  async function handleTransfer(row: ComicAccessRow) {
    const ok = await msg.confirm({
      title: "انتقال مالکیت",
      message: `«${row.publisherName}» مالک این اثر می‌شود و مالک قبلی به شریک عادی تبدیل می‌شود. نسخه‌ها و رویالتی‌های موجود تغییر نمی‌کنند.`,
      confirmLabel: "انتقال مالکیت",
      danger: true,
    });
    if (ok) await run(() => transferComicOwnership(comicId, row.publisherId), "مالکیت منتقل شد");
  }

  async function handleLock() {
    const locking = !overview.emergencyLocked;
    const ok = await msg.confirm({
      title: locking ? "قفل اضطراری اثر" : "رفع قفل اضطراری",
      message: locking
        ? "همه‌ی ناشران و اعضای تیم از مدیریت این اثر محروم می‌شوند تا قفل را باز کنید. خوانندگان و خریدها تحت‌تأثیر قرار نمی‌گیرند."
        : "ناشران دوباره می‌توانند اثر را مدیریت کنند.",
      confirmLabel: locking ? "قفل کن" : "باز کن",
      danger: locking,
    });
    if (ok) await run(() => setEmergencyLock("COMIC", comicId, locking), locking ? "اثر قفل شد" : "قفل برداشته شد");
  }

  async function handleMode(mode: "OPEN" | "PERSONAL") {
    if (mode === overview.accessMode) return;
    const ok = await msg.confirm({
      title: "تغییر نوع اثر",
      message:
        mode === "PERSONAL"
          ? "اثر شخصی می‌شود: فقط ناشران دارای دسترسی صریح می‌توانند آن را مدیریت کنند و دارندگان لایسنس سراسری به‌صورت خودکار دسترسی ندارند."
          : "اثر عمومی می‌شود: دارندگان لایسنس سراسری فعال می‌توانند برای آن نسخه بسازند.",
      confirmLabel: "تغییر",
    });
    if (ok) await run(() => setComicAccessMode(comicId, mode), "نوع اثر تغییر کرد");
  }

  const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";
  const availablePublishers = publishers.filter((item) => !overview.rows.some((row) => row.publisherId === item.id && !row.revokedAt));

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={overview.accessMode}
          onChange={(e) => handleMode(e.target.value as "OPEN" | "PERSONAL")}
          disabled={busy}
          className="min-h-10 rounded-md border border-border bg-background px-3 text-sm text-text-main"
        >
          <option value="OPEN">اثر عمومی (قابل‌استفاده با لایسنس سراسری)</option>
          <option value="PERSONAL">اثر شخصی (فقط دسترسی صریح)</option>
        </select>
        <button
          type="button"
          onClick={handleLock}
          disabled={busy}
          className={`min-h-10 rounded-md border px-3 text-xs disabled:opacity-50 ${
            overview.emergencyLocked ? "border-red-400 bg-red-500/10 text-red-400" : "border-border text-text-main"
          }`}
        >
          {overview.emergencyLocked ? "قفل اضطراری فعال است — رفع قفل" : "قفل اضطراری"}
        </button>
      </div>

      <div className="divide-y divide-border rounded-md border border-border">
        {overview.rows.map((row) => {
          const state = rowState(row);
          const active = !row.revokedAt;
          return (
            <div key={row.publisherId} className="space-y-2 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-text-main">{row.publisherName}</span>
                  {row.isOwner && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">مالک</span>}
                  {row.readOnly && <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-text-muted">فقط مشاهده</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] ${state.className}`}>{state.label}</span>
                </div>
                <span className="text-[11px] text-text-muted">
                  {SOURCE_LABELS[row.source] ?? row.source}
                  {row.expiresAt && ` · تا ${formatDateTime(row.expiresAt)}`}
                </span>
              </div>
              {row.note && <p className="text-xs text-text-muted">{row.note}</p>}
              <div className="flex flex-wrap gap-2">
                {active && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => grantComicAccess({ comicId, publisherId: row.publisherId, readOnly: !row.readOnly, expiresAt: row.expiresAt, note: row.note ?? undefined }),
                        "دسترسی به‌روزرسانی شد"
                      )
                    }
                    className="min-h-9 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50"
                  >
                    {row.readOnly ? "فعال‌سازی ویرایش" : "تبدیل به فقط مشاهده"}
                  </button>
                )}
                {active && !row.isOwner && (
                  <button type="button" disabled={busy} onClick={() => handleTransfer(row)} className="min-h-9 rounded-md border border-accent px-3 text-xs text-accent disabled:opacity-50">
                    انتقال مالکیت
                  </button>
                )}
                {active ? (
                  <button type="button" disabled={busy} onClick={() => handleRevoke(row)} className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50">
                    لغو دسترسی
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => grantComicAccess({ comicId, publisherId: row.publisherId }), "دسترسی دوباره فعال شد")}
                    className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50"
                  >
                    فعال‌سازی مجدد
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {overview.rows.length === 0 && <p className="px-3 py-3 text-sm text-text-muted">هیچ ناشری دسترسی صریح ندارد.</p>}
      </div>

      <Disclosure title="افزودن ناشر" subtitle="دسترسی صریح، موقت یا فقط مشاهده">
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <select value={publisherId} onChange={(e) => setPublisherId(e.target.value)} className={inputClass}>
            <option value="">انتخاب ناشر…</option>
            {availablePublishers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              فقط مشاهده
            </label>
            <input type="datetime-local" dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
          </div>
          <p className="text-[11px] text-text-muted">اگر تاریخ انقضا خالی بماند، دسترسی دائمی است.</p>
          <button
            type="button"
            onClick={handleAdd}
            disabled={busy || !publisherId}
            className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            ثبت دسترسی
          </button>
        </div>
      </Disclosure>
    </div>
  );
}