"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EditionStatus } from "@prisma/client";
import { createEdition, deleteEdition, updateEdition, type EditionRow } from "@/app/admin/actions/editions";
import { setEmergencyLock } from "@/app/admin/actions/access";
import { Disclosure } from "@/components/ui/disclosure";
import { useSystemMessage } from "@/components/ui/system-message";

interface EditionManagerProps {
  comicId: string;
  editions: EditionRow[];
  languages: { code: string; label: string }[];
  isAdmin: boolean;
  autoApprove: boolean;
  publishers?: { id: string; name: string }[];
  licenses?: { id: string; publisherId: string; label: string }[];
}

const STATUS_LABELS: Record<EditionStatus, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_REVIEW: "در انتظار تأیید",
  ACTIVE: "فعال",
  SUSPENDED: "معلق",
  ARCHIVED: "آرشیو",
};

const STATUS_CLASSES: Record<EditionStatus, string> = {
  DRAFT: "bg-border text-text-muted",
  PENDING_REVIEW: "bg-accent/10 text-accent",
  ACTIVE: "bg-primary/10 text-primary",
  SUSPENDED: "bg-red-500/10 text-red-400",
  ARCHIVED: "bg-border text-text-muted",
};

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary";

function EditionItem({ edition, isAdmin }: { edition: EditionRow; isAdmin: boolean }) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(edition.title ?? "");
  const [status, setStatus] = useState<EditionStatus>(edition.status);
  const [price, setPrice] = useState(edition.priceCoinsOverride === null ? "" : String(edition.priceCoinsOverride));
  const [busy, setBusy] = useState(false);

  async function run(task: () => Promise<{ success: boolean; error?: string }>, successMessage: string) {
    setBusy(true);
    try {
      const result = await task();
      if (result.success) {
        msg.success(successMessage);
        setOpen(false);
        router.refresh();
      } else {
        msg.error(result.error ?? "عملیات ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  async function handleToggleArchive() {
    const archiving = edition.status === "ACTIVE";
    const ok = await msg.confirm({
      title: archiving ? "آرشیو نسخه" : "فعال‌سازی نسخه",
      message: archiving
        ? "نسخه برای خوانندگان در دسترس نخواهد بود و خرید جدید و آپلود غیرفعال می‌شود. چپترها، خریدها و درآمدها حفظ می‌مانند."
        : "نسخه دوباره برای خوانندگان در دسترس می‌شود.",
      confirmLabel: archiving ? "آرشیو" : "فعال‌سازی",
      danger: archiving,
    });
    if (ok) await run(() => updateEdition(edition.id, { status: archiving ? "ARCHIVED" : "ACTIVE" }), "وضعیت نسخه تغییر کرد");
  }

  async function handleDelete() {
    const ok = await msg.confirm({
      title: "حذف نسخه",
      message: `نسخه‌ی «${edition.languageLabel}» با ${edition.chapterCount.toLocaleString("fa-IR")} چپتر به سطل بازیافت می‌رود و برای خوانندگان در دسترس نخواهد بود. خریدها، دسترسی‌های خریداران و درآمدها حفظ می‌شود و مدیریت می‌تواند آن را بازگرداند.`,
      confirmLabel: "حذف",
      danger: true,
    });
    if (ok) await run(() => deleteEdition(edition.id), "نسخه به سطل بازیافت منتقل شد");
  }

  async function handleLock() {
    const locking = !edition.emergencyLocked;
    const ok = await msg.confirm({
      title: locking ? "قفل اضطراری نسخه" : "رفع قفل اضطراری",
      message: locking ? "ناشر و تیم او نمی‌توانند این نسخه را مدیریت کنند." : "ناشر دوباره می‌تواند نسخه را مدیریت کند.",
      confirmLabel: locking ? "قفل کن" : "باز کن",
      danger: locking,
    });
    if (ok) await run(() => setEmergencyLock("EDITION", edition.id, locking), locking ? "نسخه قفل شد" : "قفل برداشته شد");
  }

  const canToggle = edition.status === "ACTIVE" || edition.status === "ARCHIVED";

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-text-main">{edition.languageLabel}</span>
          {edition.title && <span className="text-xs text-text-muted">— {edition.title}</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${STATUS_CLASSES[edition.status]}`}>{STATUS_LABELS[edition.status]}</span>
          {edition.emergencyLocked && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] text-red-400">قفل اضطراری</span>}
        </div>
        <span className="text-xs text-text-muted">
          {edition.publisherName} · {edition.licenseScopeLabel} · {edition.chapterCount.toLocaleString("fa-IR")} چپتر
          {edition.priceCoinsOverride !== null && ` · ${edition.priceCoinsOverride.toLocaleString("fa-IR")} سکه`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((prev) => !prev)} disabled={busy} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-main disabled:opacity-50">
          {open ? "بستن" : "ویرایش"}
        </button>
        {canToggle && (
          <button type="button" onClick={handleToggleArchive} disabled={busy} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-muted disabled:opacity-50">
            {edition.status === "ACTIVE" ? "آرشیو" : "فعال‌سازی"}
          </button>
        )}
        {isAdmin && (
          <button type="button" onClick={handleLock} disabled={busy} className="min-h-9 rounded-md border border-border px-3 text-xs text-text-muted disabled:opacity-50">
            {edition.emergencyLocked ? "رفع قفل" : "قفل اضطراری"}
          </button>
        )}
        <button type="button" onClick={handleDelete} disabled={busy} className="min-h-9 rounded-md border border-red-400 px-3 text-xs text-red-400 disabled:opacity-50">
          حذف
        </button>
      </div>

      {open && (
        <div className="space-y-3 rounded-md bg-background p-3">
          <div className="space-y-1">
            <label className="text-xs text-text-muted">عنوان نسخه (اختیاری — مثلاً نام تیم مترجم)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={inputClass} />
          </div>
          {isAdmin && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-text-muted">وضعیت</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as EditionStatus)} className={inputClass}>
                  {(Object.keys(STATUS_LABELS) as EditionStatus[]).map((item) => (
                    <option key={item} value={item}>
                      {STATUS_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-text-muted">قیمت هر چپتر (سکه)</label>
                <input type="number" min={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="پیش‌فرض سراسری" className={inputClass} />
              </div>
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  updateEdition(edition.id, {
                    title,
                    ...(isAdmin ? { status, priceCoinsOverride: price.trim() === "" ? null : Number(price) } : {}),
                  }),
                "نسخه ذخیره شد"
              )
            }
            className="min-h-10 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            ذخیره
          </button>
        </div>
      )}
    </div>
  );
}

export function EditionManager({ comicId, editions, languages, isAdmin, autoApprove, publishers, licenses }: EditionManagerProps) {
  const router = useRouter();
  const msg = useSystemMessage();
  const [language, setLanguage] = useState("");
  const [title, setTitle] = useState("");
  const [publisherId, setPublisherId] = useState("");
  const [licenseId, setLicenseId] = useState("");
  const [busy, setBusy] = useState(false);

  const used = new Set(editions.filter((item) => !isAdmin || item.publisherId === publisherId).map((item) => item.language));
  const available = languages.filter((item) => !used.has(item.code));
  const publisherName = publishers?.find((item) => item.id === publisherId)?.name;
  const languageLabel = languages.find((item) => item.code === language)?.label;
  const publisherLicenses = (licenses ?? []).filter((item) => item.publisherId === publisherId);
  const ready = Boolean(language) && (!isAdmin || Boolean(publisherId));

  async function handleCreate() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await createEdition({
        comicId,
        language,
        title,
        publisherId: isAdmin ? publisherId : undefined,
        licenseId: isAdmin && licenseId ? licenseId : undefined,
      });
      if (result.success) {
        msg.success("نسخه ساخته شد");
        setLanguage("");
        setTitle("");
        setLicenseId("");
        router.refresh();
      } else {
        msg.error(result.error ?? "ساخت نسخه ناموفق بود");
      }
    } catch {
      msg.error("ارتباط با سرور برقرار نشد — دوباره تلاش کنید");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4 rounded-md border border-border bg-surface p-4">
      <div className="divide-y divide-border rounded-md border border-border">
        {editions.map((edition) => (
          <EditionItem
            key={`${edition.id}:${edition.status}:${edition.title}:${edition.priceCoinsOverride}:${edition.emergencyLocked}`}
            edition={edition}
            isAdmin={isAdmin}
          />
        ))}
        {editions.length === 0 && <p className="px-4 py-4 text-sm text-text-muted">هنوز نسخه‌ای برای این اثر ساخته نشده است.</p>}
      </div>

      <Disclosure title="افزودن نسخه و زبان جدید" subtitle="ابتدا زبان را انتخاب کنید">
        <div className="space-y-3 rounded-md border border-border bg-background p-3">
          {isAdmin && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                value={publisherId}
                onChange={(e) => {
                  setPublisherId(e.target.value);
                  setLicenseId("");
                  setLanguage("");
                }}
                className={inputClass}
              >
                <option value="">انتخاب ناشر…</option>
                {(publishers ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select value={licenseId} onChange={(e) => setLicenseId(e.target.value)} disabled={!publisherId} className={inputClass}>
                <option value="">لایسنس: انتخاب خودکار</option>
                {publisherLicenses.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={isAdmin && !publisherId} className={inputClass}>
              <option value="">انتخاب زبان…</option>
              {available.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="عنوان نسخه (اختیاری)" className={inputClass} />
          </div>
          {available.length === 0 && (!isAdmin || publisherId) && (
            <p className="text-xs text-text-muted">برای همه‌ی زبان‌های فعال نسخه ساخته شده است.</p>
          )}
          {ready && (
            <p className="rounded-md bg-surface px-3 py-2 text-xs leading-6 text-text-muted">
              نسخه‌ی «{languageLabel}»{isAdmin && publisherName ? ` برای «${publisherName}»` : ""} بدون چپتر ساخته می‌شود و{" "}
              {autoApprove ? "بلافاصله فعال است." : "پس از تأیید مدیریت فعال می‌شود."} قیمت و درآمد آن مستقل از نسخه‌های دیگر محاسبه می‌شود.
            </p>
          )}
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy || !ready}
            className="min-h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {busy ? "در حال ساخت…" : "ساخت نسخه"}
          </button>
        </div>
      </Disclosure>
    </div>
  );
}