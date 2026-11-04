"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { GiftAudience } from "@prisma/client";
import {
  createGift,
  previewGift,
  revokeGift,
  searchGiftEditions,
  type GiftEditionOption,
  type GiftInput,
  type GiftPreview,
  type GiftRow,
} from "@/app/admin/actions/gifts";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";

const AUDIENCE_LABELS: Record<GiftAudience, string> = {
  USERS: "کاربران مشخص (یوزرنیم)",
  EDITION_BUYERS: "خریداران یک نسخه",
  COMIC_BOOKMARKS: "بوکمارک‌کنندگان یک اثر",
};

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

function EditionPicker({ onPick }: { onPick: (option: GiftEditionOption) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GiftEditionOption[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSearch() {
    setBusy(true);
    try {
      setResults(await searchGiftEditions(query));
    } catch {
      setResults([]);
    }
    setSearched(true);
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder="جستجوی نام اثر…"
          className={inputClass}
        />
        <button type="button" onClick={handleSearch} disabled={busy} className="min-h-10 flex-shrink-0 rounded-md border border-border px-4 text-xs text-text-main disabled:opacity-50">
          جستجو
        </button>
      </div>
      {results.length > 0 && (
        <div className="divide-y divide-border rounded-md border border-border bg-surface">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onPick(item);
                setResults([]);
                setQuery("");
                setSearched(false);
              }}
              className="block w-full px-3 py-2 text-right text-xs text-text-main hover:bg-background"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {searched && results.length === 0 && <p className="text-xs text-text-muted">نتیجه‌ای پیدا نشد.</p>}
    </div>
  );
}

export function GiftManager({ initialGifts }: { initialGifts: GiftRow[] }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [reason, setReason] = useState("");
  const [audience, setAudience] = useState<GiftAudience>("USERS");
  const [usernames, setUsernames] = useState("");
  const [ref, setRef] = useState<GiftEditionOption | null>(null);
  const [editions, setEditions] = useState<GiftEditionOption[]>([]);
  const [includeFuture, setIncludeFuture] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");
  const [preview, setPreview] = useState<{ key: string; data: GiftPreview } | null>(null);
  const [busy, setBusy] = useState(false);

  const input: GiftInput = {
    reason,
    audience,
    usernames,
    audienceRefId: audience === "USERS" ? null : ref?.id ?? null,
    editionIds: editions.map((item) => item.id),
    includeFuture,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
  const key = JSON.stringify(input);
  const previewReady = preview !== null && preview.key === key;

  async function handlePreview() {
    setBusy(true);
    try {
      const result = await previewGift(input);
      if (result.success && result.data) setPreview({ key, data: result.data });
      else msg.error(result.error ?? "پیش‌نمایش ناموفق بود");
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleCreate() {
    if (!preview || !previewReady) return;
    const ok = await msg.confirm({
      title: "ثبت هدیه‌ی دسترسی",
      message: `${preview.data.recipients.toLocaleString("fa-IR")} کاربر، ${preview.data.chapters.toLocaleString("fa-IR")} چپتر و حدود ${preview.data.newAccess.toLocaleString("fa-IR")} دسترسی جدید. تراکنش فروش ثبت نمی‌شود و درآمدی برای ناشر محاسبه نمی‌شود.`,
      confirmLabel: "ثبت هدیه",
    });
    if (!ok) return;

    setBusy(true);
    try {
      const result = await createGift(input);
      if (result.success && result.data) {
        msg.success(`هدیه برای ${result.data.recipients.toLocaleString("fa-IR")} کاربر ثبت شد`);
        setReason("");
        setUsernames("");
        setRef(null);
        setEditions([]);
        setExpiresAt("");
        setPreview(null);
        router.refresh();
      } else {
        msg.error(result.error ?? "ثبت هدیه ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleRevoke(gift: GiftRow) {
    const ok = await msg.confirm({
      title: "لغو هدیه",
      message: "همه‌ی دسترسی‌هایی که فقط از همین هدیه آمده‌اند حذف می‌شوند. دسترسی‌های خریداری‌شده و بونس‌ها دست‌نخورده می‌مانند.",
      confirmLabel: "لغو هدیه",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await revokeGift(gift.id);
      if (result.success) {
        msg.success("هدیه لغو شد");
        router.refresh();
      } else {
        msg.error(result.error ?? "لغو هدیه ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  const canPreview = reason.trim().length >= 3 && editions.length > 0 && (audience === "USERS" ? usernames.trim().length > 0 : Boolean(ref));

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-md border border-border bg-surface p-4">
        <h2 className="text-sm font-medium text-text-main">هدیه‌ی دسترسی جدید</h2>

        <div className="space-y-1">
          <label className="text-xs text-text-muted">دلیل هدیه (برای سوابق داخلی)</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} className={inputClass} />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-text-muted">مخاطبان</label>
          <select
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as GiftAudience);
              setRef(null);
            }}
            className={inputClass}
          >
            {(Object.keys(AUDIENCE_LABELS) as GiftAudience[]).map((item) => (
              <option key={item} value={item}>
                {AUDIENCE_LABELS[item]}
              </option>
            ))}
          </select>
          {audience === "USERS" ? (
            <textarea
              value={usernames}
              onChange={(e) => setUsernames(e.target.value)}
              rows={3}
              dir="ltr"
              placeholder="@user1, @user2 یا هر یوزرنیم در یک خط"
              className={inputClass}
            />
          ) : (
            <div className="space-y-2">
              {ref ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs text-text-main">
                  <span>{ref.label}</span>
                  <button type="button" onClick={() => setRef(null)} className="text-red-400">
                    حذف
                  </button>
                </div>
              ) : (
                <EditionPicker onPick={setRef} />
              )}
              <p className="text-[11px] text-text-muted">
                {audience === "EDITION_BUYERS" ? "همه‌ی کاربرانی که از این نسخه خرید کرده‌اند." : "همه‌ی کاربرانی که اثر این نسخه را بوکمارک کرده‌اند."}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-xs text-text-muted">نسخه‌هایی که هدیه داده می‌شود</label>
          {editions.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-xs text-text-main">
              <span>{item.label}</span>
              <button type="button" onClick={() => setEditions((prev) => prev.filter((entry) => entry.id !== item.id))} className="text-red-400">
                حذف
              </button>
            </div>
          ))}
          <EditionPicker onPick={(option) => setEditions((prev) => (prev.some((entry) => entry.id === option.id) ? prev : [...prev, option]))} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={includeFuture} onChange={(e) => setIncludeFuture(e.target.checked)} />
            شامل چپترهای آینده‌ی این نسخه‌ها
          </label>
          <div className="space-y-1">
            <label className="text-xs text-text-muted">انقضای دسترسی (اختیاری)</label>
            <input type="datetime-local" dir="ltr" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className={inputClass} />
          </div>
        </div>

        {previewReady && preview && (
          <p className="rounded-md bg-background px-3 py-2 text-xs leading-6 text-text-main">
            {preview.data.recipients.toLocaleString("fa-IR")} کاربر · {preview.data.chapters.toLocaleString("fa-IR")} چپتر سکه‌ی منتشرشده · حدود{" "}
            {preview.data.newAccess.toLocaleString("fa-IR")} دسترسی جدید
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handlePreview} disabled={busy || !canPreview} className="min-h-10 rounded-md border border-primary px-4 text-sm text-primary disabled:opacity-50">
            پیش‌نمایش
          </button>
          <button type="button" onClick={handleCreate} disabled={busy || !previewReady} className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
            ثبت هدیه
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-text-main">هدیه‌های ثبت‌شده</h2>
        <div className="divide-y divide-border rounded-md border border-border">
          {initialGifts.map((gift) => (
            <div key={gift.id} className="space-y-1.5 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-text-main">{gift.reason}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${gift.revokedAt ? "bg-border text-text-muted" : "bg-primary/10 text-primary"}`}>
                  {gift.revokedAt ? "لغوشده" : "فعال"}
                </span>
              </div>
              <p className="text-xs leading-6 text-text-muted">
                {AUDIENCE_LABELS[gift.audience]} · {gift.recipientCount.toLocaleString("fa-IR")} کاربر · {gift.grantedCount.toLocaleString("fa-IR")} دسترسی
                {gift.includeFuture ? " · شامل چپترهای آینده" : ""}
                {gift.expiresAt ? ` · تا ${formatDateTime(gift.expiresAt)}` : ""}
              </p>
              <p className="text-[11px] text-text-muted">{gift.editions.join("، ")}</p>
              <p className="text-[11px] text-text-muted">{formatDateTime(gift.createdAt)}</p>
              {!gift.revokedAt && (
                <button type="button" onClick={() => handleRevoke(gift)} disabled={busy} className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50">
                  لغو هدیه
                </button>
              )}
            </div>
          ))}
          {initialGifts.length === 0 && <p className="px-4 py-6 text-center text-sm text-text-muted">هنوز هدیه‌ای ثبت نشده است.</p>}
        </div>
      </div>
    </div>
  );
}