"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addComicStaff, removeComicStaff, setComicStaffShare, type ComicStaffRow } from "@/app/admin/actions/comic-staff";
import type { StaffRole } from "@prisma/client";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

const ROLES: StaffRole[] = ["LOCALIZATION_SPECIALIST", "EDITOR", "CLEANER", "TYPIST"];

function bpsToPercentString(bps: number): string {
  return String(bps / 100);
}

export function ComicStaffManager({ comicId, initialStaff }: { comicId: string; initialStaff: ComicStaffRow[] }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [shareInputs, setShareInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setStaff(initialStaff);
    setShareInputs(Object.fromEntries(initialStaff.map((s) => [s.id, bpsToPercentString(s.shareBps)])));
  }, [initialStaff]);

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("LOCALIZATION_SPECIALIST");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalBps = staff.reduce((sum, s) => sum + s.shareBps, 0);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addComicStaff(comicId, username, role);
    if (result.success) {
      setUsername("");
      router.refresh();
    } else {
      setError(result.error ?? "خطا");
    }
    setPending(false);
  }

  async function handleRemove(staffId: string) {
    setPending(true);
    const result = await removeComicStaff(comicId, staffId);
    if (result.success) {
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      router.refresh();
    }
    setPending(false);
  }

  async function handleSaveShare(staffId: string) {
    const percent = Number(shareInputs[staffId]);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("سهم باید عددی بین ۰ تا ۱۰۰ باشد");
      return;
    }
    setPending(true);
    setError(null);
    const bps = Math.round(percent * 100);
    const result = await setComicStaffShare(comicId, staffId, bps);
    if (result.success) {
      setStaff((prev) => prev.map((s) => (s.id === staffId ? { ...s, shareBps: bps } : s)));
      router.refresh();
    } else {
      setError(result.error ?? "خطا در ذخیره‌ی سهم");
    }
    setPending(false);
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <p className="text-sm font-medium text-text-main">دست‌اندرکاران این عنوان</p>
      <p className="text-xs leading-6 text-text-muted">
        این لیست هنگام ثبت چپتر جدید روی همان چپتر هم اعمال می‌شود. سهم هر عضو درصدی از سهم ناشر است؛ بخش تخصیص‌نیافته نزد ناشر می‌ماند. تغییر سهم فقط روی فروش‌های بعدی اثر دارد.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor={`cs-username-${comicId}`}>یوزرنیم تلگرام</label>
          <input id={`cs-username-${comicId}`} value={username} onChange={(e) => setUsername(e.target.value)} required className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor={`cs-role-${comicId}`}>نقش</label>
          <select id={`cs-role-${comicId}`} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-main">
            {ROLES.map((r) => <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <button type="submit" disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">افزودن</button>
      </form>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="divide-y divide-border rounded-md border border-border">
        {staff.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <p className="text-xs text-text-main">{s.user.username ? `@${s.user.username}` : s.user.firstName} — {STAFF_ROLE_LABELS[s.roleTitle]}</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={shareInputs[s.id] ?? bpsToPercentString(s.shareBps)}
                onChange={(e) => setShareInputs((prev) => ({ ...prev, [s.id]: e.target.value }))}
                className="w-20 rounded-md border border-border bg-background px-2 py-1 text-xs text-text-main"
                aria-label="سهم درصدی"
              />
              <span className="text-xs text-text-muted">٪</span>
              <button onClick={() => handleSaveShare(s.id)} disabled={pending} className="rounded-md border border-primary px-2 py-1 text-xs text-primary disabled:opacity-50">ذخیره سهم</button>
              <button onClick={() => handleRemove(s.id)} disabled={pending} className="text-xs text-red-400 disabled:opacity-50">حذف</button>
            </div>
          </div>
        ))}
        {staff.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">دست‌اندرکاری ثبت نشده.</p>}
      </div>

      {staff.length > 0 && (
        <p className="text-xs text-text-muted">
          جمع سهم اعضا: {(totalBps / 100).toLocaleString("fa-IR")}٪ — باقی‌مانده نزد ناشر: {((10000 - totalBps) / 100).toLocaleString("fa-IR")}٪
        </p>
      )}
    </div>
  );
}