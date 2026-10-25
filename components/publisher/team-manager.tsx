"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addPublisherStaff, removePublisherStaff } from "@/app/publisher/actions/team";
import type { StaffRole } from "@prisma/client";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

interface StaffMember {
  id: string;
  role: StaffRole;
  canUpload: boolean;
  canManageComics: boolean;
  user: { firstName: string; username: string | null };
}

const ROLES: StaffRole[] = ["LOCALIZATION_SPECIALIST", "EDITOR", "CLEANER", "TYPIST"];

export function TeamManager({ initialStaff }: { initialStaff: StaffMember[] }) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("LOCALIZATION_SPECIALIST");
  const [canUpload, setCanUpload] = useState(true);
  const [canManageComics, setCanManageComics] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const result = await addPublisherStaff({
      telegramUsername: username,
      role,
      canUpload,
      canManageComics,
    });

    if (!result.success) {
      setError(result.error ?? "خطا");
    } else {
      setUsername("");
      router.refresh();
    }
    setPending(false);
  }

  async function handleRemove(staffId: string) {
    if (!confirm("این عضو از تیم حذف بشه؟")) return;
    setPending(true);
    setError(null);
    const result = await removePublisherStaff(staffId);
    if (result.success) {
      setStaff((prev) => prev.filter((s) => s.id !== staffId));
      router.refresh();
    } else {
      setError(result.error ?? "خطا");
    }
    setPending(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface p-4">
        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor="staff-username">یوزرنیم تلگرام</label>
          <input
            id="staff-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-text-muted" htmlFor="staff-role">نقش</label>
          <select
            id="staff-role"
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={canUpload} onChange={(e) => setCanUpload(e.target.checked)} />
          مجوز آپلود چپتر
        </label>

        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={canManageComics} onChange={(e) => setCanManageComics(e.target.checked)} />
          مجوز مدیریت عنوان‌ها (ساخت/ویرایش/دست‌اندرکاران)
        </label>

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          افزودن
        </button>

        {error && <span className="text-xs text-red-400">{error}</span>}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {staff.map((s) => (
          <div key={s.id} className="flex items-center justify-between px-4 py-3">
            <p className="text-sm text-text-main">
              {s.user.firstName} {s.user.username ? `— @${s.user.username}` : ""} · {STAFF_ROLE_LABELS[s.role]}
              {s.canUpload ? "" : " (بدون مجوز آپلود)"}
              {s.canManageComics ? " · مدیریت عنوان" : ""}
            </p>
            <button
              onClick={() => handleRemove(s.id)}
              disabled={pending}
              className="rounded-md border border-red-400 px-2 py-1 text-xs text-red-400 disabled:opacity-50"
            >
              حذف
            </button>
          </div>
        ))}
        {staff.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">عضوی ثبت نشده است.</p>}
      </div>
    </div>
  );
}