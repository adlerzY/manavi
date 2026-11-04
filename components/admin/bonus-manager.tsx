"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BonusTrigger } from "@prisma/client";
import {
  createBonus,
  deleteBonus,
  previewBonusBackfill,
  runBonusBackfill,
  setBonusActive,
  type BonusOverview,
  type BonusRow,
  type BonusState,
} from "@/app/admin/actions/bonuses";
import { Disclosure } from "@/components/ui/disclosure";
import { useSystemMessage } from "@/components/ui/system-message";
import { formatDateTime } from "@/lib/format";

const TRIGGER_LABELS: Record<BonusTrigger, string> = {
  PER_CHAPTER: "چپتر به چپتر",
  ANY_PURCHASE: "خرید یک چپتر",
  FULL_SET: "خرید کل مجموعه",
};

const STATE_LABELS: Record<BonusState, string> = {
  PERMANENT: "دائمی",
  SCHEDULED: "زمان‌بندی‌شده",
  RUNNING: "کمپین فعال",
  ENDED: "پایان‌یافته",
};

const STATE_CLASSES: Record<BonusState, string> = {
  PERMANENT: "bg-primary/10 text-primary",
  SCHEDULED: "bg-accent/10 text-accent",
  RUNNING: "bg-accent/10 text-accent",
  ENDED: "bg-border text-text-muted",
};

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

function describe(trigger: BonusTrigger, source: string, target: string): string {
  if (trigger === "PER_CHAPTER") {
    return `هر چپتر سکه‌ای که کاربر از «${source}» می‌خرد، چپتر متناظرش در «${target}» را رایگان باز می‌کند.`;
  }
  if (trigger === "ANY_PURCHASE") {
    return `با خرید حتی یک چپتر از «${source}»، همه‌ی چپترهای سکه‌ای «${target}» و چپترهای آینده‌ی آن باز می‌شود.`;
  }
  return `وقتی کاربر همه‌ی چپترهای سکه‌ای «${source}» را داشته باشد، همه‌ی چپترهای سکه‌ای «${target}» و چپترهای آینده‌ی آن باز می‌شود.`;
}

function BonusItem({ bonus, isAdmin }: { bonus: BonusRow; isAdmin: boolean }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleDelete() {
    const ok = await msg.confirm({
      title: "حذف پیوند بونس",
      message: "پیوند حذف می‌شود و از این پس خریدی بونس نمی‌دهد. دسترسی‌هایی که قبلاً به خریداران داده شده حفظ می‌ماند.",
      confirmLabel: "حذف",
      danger: true,
    });
    if (ok) await run(() => deleteBonus(bonus.id), "پیوند حذف شد");
  }

  async function handleBackfill() {
    setBusy(true);
    try {
      const preview = await previewBonusBackfill(bonus.id);
      setBusy(false);
      if (!preview.success || !preview.data) {
        msg.error(preview.error ?? "پیش‌نمایش ناموفق بود");
        return;
      }
      const ok = await msg.confirm({
        title: "اعمال روی خریدهای قبلی",
        message: `${preview.data.users.toLocaleString("fa-IR")} کاربر واجد شرایط شناسایی شد و برای ${preview.data.chapters.toLocaleString("fa-IR")} چپتر بونس دریافت می‌کنند (حداکثر ${preview.data.rows.toLocaleString("fa-IR")} دسترسی). دسترسی‌های موجود دست‌نخورده می‌ماند.`,
        confirmLabel: "اعمال",
      });
      if (!ok) return;
    } catch {
      setBusy(false);
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
      return;
    }
    await run(() => runBonusBackfill(bonus.id), "بونس روی خریدهای قبلی اعمال شد");
  }

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-text-main">
            {bonus.sourceLabel} ← {bonus.targetLabel}
          </span>
          {bonus.name && <span className="text-xs text-accent">{bonus.name}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-background px-2 py-0.5 text-[10px] text-text-muted">{TRIGGER_LABELS[bonus.trigger]}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATE_CLASSES[bonus.state]}`}>{STATE_LABELS[bonus.state]}</span>
          {!bonus.isActive && <span className="rounded-full bg-border px-2 py-0.5 text-[10px] text-text-muted">غیرفعال</span>}
        </div>
      </div>
      {(bonus.startsAt || bonus.endsAt) && (
        <p className="text-[11px] text-text-muted">
          {bonus.startsAt ? `از ${formatDateTime(bonus.startsAt)}` : ""} {bonus.endsAt ? `تا ${formatDateTime(bonus.endsAt)}` : ""}
        </p>
      )}
      {bonus.trigger !== "PER_CHAPTER" && (
        <p className="text-[11px] text-text-muted">{bonus.grantCount.toLocaleString("fa-IR")} کاربر واجد شرایط شده‌اند</p>
      )}
      {bonus.canManage && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setBonusActive(bonus.id, !bonus.isActive), bonus.isActive ? "پیوند غیرفعال شد" : "پیوند فعال شد")}
            className="min-h-9 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50"
          >
            {bonus.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
          </button>
          {isAdmin && (
            <button type="button" disabled={busy} onClick={handleBackfill} className="min-h-9 rounded-md border border-primary px-3 text-xs text-primary disabled:opacity-50">
              اعمال روی خریدهای قبلی
            </button>
          )}
          <button type="button" disabled={busy} onClick={handleDelete} className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50">
            حذف
          </button>
        </div>
      )}
    </div>
  );
}

export function BonusManager({ comicId, overview, isAdmin }: { comicId: string; overview: BonusOverview; isAdmin: boolean }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [trigger, setTrigger] = useState<BonusTrigger>("PER_CHAPTER");
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [busy, setBusy] = useState(false);

  const source = overview.editions.find((item) => item.id === sourceId);
  const target = overview.editions.find((item) => item.id === targetId);
  const targets = overview.editions.filter((item) => item.manageable && item.id !== sourceId);
  const campaign = Boolean(startsAt || endsAt);
  const ready = Boolean(source && target);

  async function handleCreate() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await createBonus({
        sourceEditionId: sourceId,
        targetEditionId: targetId,
        trigger,
        name,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        applyToExisting,
      });
      if (result.success) {
        msg.success(
          applyToExisting && result.data
            ? `پیوند ساخته شد و ${result.data.granted.toLocaleString("fa-IR")} دسترسی به خریداران قبلی داده شد`
            : "پیوند بونس ساخته شد"
        );
        setSourceId("");
        setTargetId("");
        setName("");
        setStartsAt("");
        setEndsAt("");
        setApplyToExisting(false);
        router.refresh();
      } else {
        msg.error(result.error ?? "ساخت پیوند ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <p className="text-xs leading-6 text-text-muted">
        خرید یک نسخه می‌تواند نسخه‌های دیگر همین اثر را بونس باز کند. قیمت و درآمد هر نسخه مستقل می‌ماند و بونس برای ناشر نسخه‌ی بونس درآمدی ثبت نمی‌کند.
      </p>

      <div className="divide-y divide-border rounded-md border border-border">
        {overview.bonuses.map((bonus) => (
          <BonusItem key={`${bonus.id}:${bonus.isActive}`} bonus={bonus} isAdmin={isAdmin} />
        ))}
        {overview.bonuses.length === 0 && <p className="px-4 py-4 text-sm text-text-muted">هنوز پیوند بونسی تعریف نشده است.</p>}
      </div>

      <Disclosure title="افزودن بونس" subtitle="نسخه‌ی مبدأ، نسخه‌ی بونس و شرط فعال‌شدن">
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass}>
              <option value="">نسخه‌ی خریداری‌شده (مبدأ)…</option>
              {overview.editions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputClass}>
              <option value="">نسخه‌ی بونس…</option>
              {targets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value as BonusTrigger)} className={inputClass}>
            {(Object.keys(TRIGGER_LABELS) as BonusTrigger[]).map((item) => (
              <option key={item} value={item}>
                {TRIGGER_LABELS[item]}
              </option>
            ))}
          </select>

          {isAdmin && (
            <Disclosure title="کمپین زمان‌دار" subtitle="فقط خریدهای داخل بازه بونس می‌گیرند">
              <div className="space-y-3 rounded-md border border-border bg-surface p-3">
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="نام کمپین" className={inputClass} />
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-text-muted">شروع</label>
                    <input type="datetime-local" dir="ltr" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-text-muted">پایان</label>
                    <input type="datetime-local" dir="ltr" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputClass} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input type="checkbox" checked={applyToExisting} onChange={(e) => setApplyToExisting(e.target.checked)} />
                  اعمال روی خریدهای قبلی که در همین بازه انجام شده‌اند
                </label>
              </div>
            </Disclosure>
          )}

          {ready && source && target && (
            <p className="rounded-md bg-surface px-3 py-2 text-xs leading-6 text-text-muted">
              {describe(trigger, source.label, target.label)}
              {campaign ? " این پیوند یک کمپین زمان‌دار است و قوانین دائمی نسخه‌ها را تغییر نمی‌دهد." : " این پیوند دائمی است."}
            </p>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !ready}
            className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "در حال ثبت…" : "ثبت بونس"}
          </button>
        </div>
      </Disclosure>
    </div>
  );
}