"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addComicStaff, removeComicStaff, type ComicStaffRow } from "@/app/admin/actions/comic-staff";
import type { StaffRole } from "@prisma/client";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

const ROLES: StaffRole[] = ["LOCALIZATION_SPECIALIST", "EDITOR", "CLEANER", "TYPIST"];

export function ComicStaffManager({ comicId, initialStaff }: { comicId: string; initialStaff: ComicStaffRow[] }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("LOCALIZATION_SPECIALIST");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface p-4">
      <p className="text-sm font-medium text-text-main">دست‌اندرکاران این عنوان</p>
      <p className="text-xs text-text-muted">این لیست هنگام ثبت چپتر جدید، به‌طور خودکار روی همان چپتر هم اعمال می‌شود.</p>

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
        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-3 py-2">
            <p className="text-xs text-text-main">{s.user.username ? `@${s.user.username}` : s.user.firstName} — {STAFF_ROLE_LABELS[s.roleTitle]}</p>
            <button onClick={() => handleRemove(s.id)} disabled={pending} className="text-xs text-red-400 disabled:opacity-50">حذف</button>
          </div>
        ))}
        {staff.length === 0 && <p className="px-3 py-2 text-xs text-text-muted">دست‌اندرکاری ثبت نشده.</p>}
      </div>
    </div>
  );
}