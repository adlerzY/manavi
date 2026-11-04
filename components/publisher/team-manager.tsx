"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PublisherStaff, StaffRole } from "@prisma/client";
import { addPublisherStaff, removePublisherStaff, updatePublisherStaffPermissions } from "@/app/publisher/actions/team";
import { Disclosure } from "@/components/ui/disclosure";
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  staffPermissions,
  type PermissionSet,
  type StaffPermission,
} from "@/lib/permissions";
import { STAFF_ROLE_LABELS } from "@/lib/staff-roles";

type StaffFlags = Pick<
  PublisherStaff,
  "canUpload" | "canPublish" | "canEdit" | "canDelete" | "canManageEditions" | "canManageComics" | "canManageMembers" | "canSensitive"
>;

interface StaffMember extends StaffFlags {
  id: string;
  role: StaffRole;
  user: { firstName: string; username: string | null };
}

const ROLES: StaffRole[] = ["LOCALIZATION_SPECIALIST", "EDITOR", "CLEANER", "TYPIST"];
const EDITABLE = PERMISSION_KEYS.filter((key) => key !== "view");

function preset(keys: StaffPermission[]): PermissionSet {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, key === "view" || keys.includes(key)])) as PermissionSet;
}

const PRESETS = [
  { id: "uploader", label: "آپلودکننده", value: preset(["upload", "edit"]) },
  { id: "publisher", label: "آپلود و انتشار", value: preset(["upload", "edit", "publish"]) },
  { id: "manager", label: "مدیر محتوا", value: preset(["upload", "edit", "publish", "delete", "manageEditions", "manageComics"]) },
];

function Checklist({
  value,
  onChange,
  locked,
}: {
  value: PermissionSet;
  onChange: (next: PermissionSet) => void;
  locked: StaffPermission[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {EDITABLE.map((key) => (
        <label key={key} className="flex items-center gap-2 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={value[key]}
            disabled={locked.includes(key)}
            onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
          />
          {PERMISSION_LABELS[key]}
        </label>
      ))}
    </div>
  );
}

export function TeamManager({
  initialStaff,
  actorPermissions,
  isOwner,
}: {
  initialStaff: StaffMember[];
  actorPermissions: PermissionSet;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [staff, setStaff] = useState(initialStaff);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<StaffRole>("LOCALIZATION_SPECIALIST");
  const [permissions, setPermissions] = useState<PermissionSet>(PRESETS[0].value);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<PermissionSet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  const locked: StaffPermission[] = isOwner
    ? []
    : EDITABLE.filter((key) => !actorPermissions[key] || key === "manageMembers" || key === "sensitive");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const result = await addPublisherStaff({ telegramUsername: username, role, permissions });
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

  async function handleSaveEdit(staffId: string) {
    if (!editValue) return;
    setPending(true);
    setError(null);
    const result = await updatePublisherStaffPermissions(staffId, editValue);
    if (result.success) {
      setEditingId(null);
      router.refresh();
    } else {
      setError(result.error ?? "خطا");
    }
    setPending(false);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="staff-username">یوزرنیم تلگرام</label>
            <input id="staff-username" value={username} onChange={(e) => setUsername(e.target.value)} required className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="staff-role">نقش</label>
            <select id="staff-role" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main">
              {ROLES.map((r) => (
                <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-text-muted" htmlFor="staff-preset">سطح دسترسی</label>
            <select
              id="staff-preset"
              onChange={(e) => {
                const found = PRESETS.find((item) => item.id === e.target.value);
                if (found) setPermissions(found.value);
              }}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main"
            >
              {PRESETS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={pending} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            افزودن
          </button>
        </div>
        <Disclosure title="مجوزهای دقیق" subtitle="برای تنظیم دستی هر مجوز باز کنید">
          <div className="rounded-md border border-border bg-background p-3">
            <Checklist value={permissions} onChange={setPermissions} locked={locked} />
          </div>
        </Disclosure>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {staff.map((s) => {
          const current = staffPermissions(s);
          const editing = editingId === s.id && editValue;
          return (
            <div key={s.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-main">
                  {s.user.firstName} {s.user.username ? `— @${s.user.username}` : ""} · {STAFF_ROLE_LABELS[s.role]}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(editing ? null : s.id);
                      setEditValue(current);
                    }}
                    className="rounded-md border border-border px-2 py-1 text-xs text-text-main"
                  >
                    {editing ? "بستن" : "مجوزها"}
                  </button>
                  <button onClick={() => handleRemove(s.id)} disabled={pending} className="rounded-md border border-red-400 px-2 py-1 text-xs text-red-400 disabled:opacity-50">
                    حذف
                  </button>
                </div>
              </div>
              {!editing && (
                <div className="flex flex-wrap gap-1.5">
                  {EDITABLE.filter((key) => current[key]).map((key) => (
                    <span key={key} className="rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">{PERMISSION_LABELS[key]}</span>
                  ))}
                </div>
              )}
              {editing && editValue && (
                <div className="space-y-3 rounded-md bg-background p-3">
                  <Checklist value={editValue} onChange={setEditValue} locked={locked} />
                  <button onClick={() => handleSaveEdit(s.id)} disabled={pending} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
                    ذخیره مجوزها
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {staff.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">عضوی ثبت نشده است.</p>}
      </div>
    </div>
  );
}