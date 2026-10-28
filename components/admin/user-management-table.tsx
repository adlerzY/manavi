"use client";

import { useState, useTransition } from "react";
import {
  searchUsers,
  setUserRole,
  banUser,
  unbanUser,
  grantCoins,
  revokeCoins,
  deleteUserAccount,
  type UserSearchResult,
} from "@/app/admin/actions/user-management";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import type { Role } from "@prisma/client";

const ROLES: Role[] = ["USER", "VIP", "STAFF", "PUBLISHER", "ADMIN"];

export function UserManagementTable({ initialUsers, initialTotal }: { initialUsers: UserSearchResult[]; initialTotal: number }) {
  const [users, setUsers] = useState(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [bannedOnly, setBannedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [coinAmount, setCoinAmount] = useState("");
  const [coinNote, setCoinNote] = useState("");
  const [banReason, setBanReason] = useState("");

  function runSearch(nextPage = 1, overrides?: { q: string; role: Role | ""; banned: boolean }) {
    const q = overrides ? overrides.q : query;
    const role = overrides ? overrides.role : roleFilter;
    const banned = overrides ? overrides.banned : bannedOnly;
    startTransition(async () => {
      const result = await searchUsers({ q: q.trim() || undefined, role: role || undefined, banned: banned || undefined, page: nextPage });
      setUsers(result.users);
      setTotal(result.total);
      setPage(nextPage);
    });
  }

  function handleRoleChange(userId: string, role: Role) {
    if (role === "ADMIN" || role === "PUBLISHER") {
      const label = role === "ADMIN" ? "ادمین" : "ناشر";
      if (!window.confirm(`این کاربر به نقش «${label}» ارتقا پیدا می‌کند و به بخش‌های حساس دسترسی می‌گیرد. مطمئنی؟`)) return;
    }
    startTransition(async () => {
      const result = await setUserRole(userId, role);
      if (result.success) runSearch(page);
    });
  }

  function handleBan(userId: string) {
    startTransition(async () => {
      const result = await banUser(userId, banReason);
      if (result.success) {
        setBanReason("");
        setActionTarget(null);
        runSearch(page);
      }
    });
  }

  function handleUnban(userId: string) {
    startTransition(async () => {
      const result = await unbanUser(userId);
      if (result.success) runSearch(page);
    });
  }

  function handleGrant(userId: string) {
    const amount = Number(coinAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    startTransition(async () => {
      const result = await grantCoins(userId, amount, coinNote);
      if (result.success) {
        setCoinAmount("");
        setCoinNote("");
        setActionTarget(null);
        runSearch(page);
      }
    });
  }

  function handleRevoke(userId: string) {
    const amount = Number(coinAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    startTransition(async () => {
      const result = await revokeCoins(userId, amount, coinNote);
      if (result.success) {
        setCoinAmount("");
        setCoinNote("");
        setActionTarget(null);
        runSearch(page);
      }
    });
  }
    function handleReset() {
    setQuery("");
    setRoleFilter("");
    setBannedOnly(false);
    runSearch(1, { q: "", role: "", banned: false });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(1);
        }}
        className="flex flex-wrap gap-2"
      >
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جستجوی نام یا یوزرنیم" className="min-h-11 min-w-[200px] flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | "")} className="min-h-11 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main">
          <option value="">همه نقش‌ها</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main">
          <input type="checkbox" checked={bannedOnly} onChange={(e) => setBannedOnly(e.target.checked)} />
          فقط مسدودشده‌ها
        </label>
        <button type="submit" disabled={isPending} className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
          جستجو
        </button>
        {(query || roleFilter || bannedOnly) && (
          <button type="button" onClick={handleReset} disabled={isPending} className="min-h-11 rounded-md border border-border px-4 py-2 text-sm text-text-muted disabled:opacity-50">
            پاک کردن
          </button>
        )}
      </form>

      <div className="divide-y divide-border rounded-md border border-border">
        {users.map((u) => (
          <div key={u.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm text-text-main">{u.firstName} {u.lastName ?? ""} {u.username ? `— @${u.username}` : ""}</p>
                <p className="text-xs text-text-muted">سکه: {u.coinsBalance.toLocaleString("fa-IR")} · {u.isBanned ? "مسدود" : "فعال"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value as Role)} disabled={isPending} className="rounded-md border border-border bg-background px-2 py-1 text-xs text-text-main">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {u.isBanned ? (
                  <button onClick={() => handleUnban(u.id)} disabled={isPending} className="rounded-md border border-primary px-2 py-1 text-xs text-primary disabled:opacity-50">
                    رفع مسدودی
                  </button>
                ) : (
                  <button onClick={() => setActionTarget(actionTarget === `ban-${u.id}` ? null : `ban-${u.id}`)} className="rounded-md border border-red-400 px-2 py-1 text-xs text-red-400">
                    مسدودسازی
                  </button>
                )}
                <button onClick={() => setActionTarget(actionTarget === `coin-${u.id}` ? null : `coin-${u.id}`)} className="rounded-md border border-accent px-2 py-1 text-xs text-accent">
                  مدیریت سکه
                </button>
                <DeleteConfirmDialog
                  triggerLabel="حذف کاربر"
                  confirmTitle={`حذف حساب ${u.firstName}`}
                  confirmDescription="این حساب برای همیشه غیرفعال و اطلاعات نمایشی آن پاک می‌شود. به‌دلیل وجود تراکنش‌ها و نظرات مرتبط با این کاربر، رکورد به‌صورت کامل از دیتابیس حذف نمی‌شود تا سابقه‌ی مالی و نظرات دیگران آسیب نبیند — اما این حساب کاملاً غیرقابل استفاده می‌شود."
                  confirmValue={u.username ?? u.firstName}
                  onConfirm={() => deleteUserAccount(u.id, u.username ?? u.firstName)}
                  onDeleted={() => runSearch(page)}
                />
              </div>
            </div>

            {actionTarget === `ban-${u.id}` && (
              <div className="flex items-center gap-2 rounded-md bg-background p-2">
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="دلیل مسدودسازی" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main" />
                <button onClick={() => handleBan(u.id)} disabled={isPending} className="rounded-md bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-50">
                  تایید
                </button>
              </div>
            )}

            {actionTarget === `coin-${u.id}` && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-background p-2">
                <input type="number" value={coinAmount} onChange={(e) => setCoinAmount(e.target.value)} placeholder="مقدار سکه" className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main" />
                <input value={coinNote} onChange={(e) => setCoinNote(e.target.value)} placeholder="یادداشت" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main" />
                <button onClick={() => handleGrant(u.id)} disabled={isPending} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50">
                  افزودن
                </button>
                <button onClick={() => handleRevoke(u.id)} disabled={isPending} className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50">
                  کسر
                </button>
              </div>
            )}
          </div>
        ))}
        {users.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">کاربری یافت نشد.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>{total.toLocaleString("fa-IR")} کاربر</span>
        <div className="flex gap-2">
          <button onClick={() => runSearch(page - 1)} disabled={page <= 1 || isPending} className="disabled:opacity-30">قبلی</button>
          <button onClick={() => runSearch(page + 1)} disabled={page * 25 >= total || isPending} className="disabled:opacity-30">بعدی</button>
        </div>
      </div>
    </div>
  );
}