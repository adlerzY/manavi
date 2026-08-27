"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createCategory } from "@/app/admin/actions/category-actions";
import { CategoryImageUploader } from "@/components/admin/banner-uploader";
import type { ReadingMode, ReadingDirection } from "@prisma/client";
import { READING_MODE_LABELS } from "@/lib/reading";
import { useCollapsibleClose } from "@/components/ui/collapsible-section";

const READING_MODES: ReadingMode[] = ["VERTICAL", "HORIZONTAL"];

export function CreateCategoryForm() {
  const router = useRouter();
  const close = useCollapsibleClose();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [readingDirection, setReadingDirection] = useState<ReadingDirection>("LTR");
  const [defaultReadingMode, setDefaultReadingMode] = useState<ReadingMode>("VERTICAL");
  const [showOnHomepage, setShowOnHomepage] = useState(true);
  const [sortOrder, setSortOrder] = useState("0");
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const result = await createCategory({
      name,
      slug: slug || undefined,
      imageUrl: imageUrl || undefined,
      readingDirection,
      defaultReadingMode,
      showOnHomepage,
      sortOrder: Number(sortOrder) || 0,
    });

    if (result.success) {
      setStatus("done");
      setName("");
      setSlug("");
      setImageUrl("");
      router.refresh();
      setTimeout(() => close?.(), 1000);
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در ایجاد دسته‌بندی");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">افزودن دسته‌بندی اصلی</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="category-name">نام (مثلاً مانهوا)</label>
          <input id="category-name" value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="category-slug">اسلاگ <span className="text-text-muted">(اختیاری — خودکار از نام ساخته می‌شود)</span></label>
          <input id="category-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="manhwa" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
        </div>
      </div>

      <CategoryImageUploader entityId={null} currentUrl={imageUrl} onUploaded={setImageUrl} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="category-direction">جهت خوانش</label>
          <select id="category-direction" value={readingDirection} onChange={(e) => setReadingDirection(e.target.value as ReadingDirection)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary">
            <option value="LTR">چپ‌به‌راست (LTR)</option>
            <option value="RTL">راست‌به‌چپ (RTL)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="category-reading-mode">حالت پیش‌فرض خواندن</label>
          <select id="category-reading-mode" value={defaultReadingMode} onChange={(e) => setDefaultReadingMode(e.target.value as ReadingMode)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary">
            {READING_MODES.map((mode) => (
              <option key={mode} value={mode}>{READING_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="category-sort">ترتیب نمایش</label>
          <input id="category-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-main outline-none focus:border-primary" />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-text-main">
          <input type="checkbox" checked={showOnHomepage} onChange={(e) => setShowOnHomepage(e.target.checked)} />
          نمایش در صفحه اصلی
        </label>
      </div>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">دسته‌بندی اضافه شد.</p>}

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "در حال ذخیره…" : "ثبت دسته‌بندی"}
      </button>
    </form>
  );
}