"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReadingMode } from "@prisma/client";
import { createComic } from "@/app/admin/actions/catalog-actions";
import { READING_MODE_LABELS } from "@/lib/reading";
import { useCollapsibleClose } from "@/components/ui/collapsible-section";
import { CoverUploader, BannerUploader } from "@/components/admin/banner-uploader";

interface LicenseOption {
  id: string;
  publisherName: string;
  territory: string[];
  status: string;
}

interface GenreOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
  defaultReadingMode: ReadingMode;
}

const READING_MODES: ReadingMode[] = ["VERTICAL", "HORIZONTAL"];

function slugifyTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CreateComicForm({
  licenses,
  genres,
  categories,
}: {
  licenses: LicenseOption[];
  genres: GenreOption[];
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const close = useCollapsibleClose();
  const eligible = licenses.filter((l) => l.status !== "EXPIRED" && l.status !== "TERMINATED");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [bannerImage, setBannerImage] = useState("");
  const [licenseId, setLicenseId] = useState(eligible[0]?.id ?? "");
  const [ageRating, setAgeRating] = useState<"NORMAL" | "EIGHTEEN_PLUS" | "NSFW">("NORMAL");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [readingMode, setReadingMode] = useState<ReadingMode>(categories[0]?.defaultReadingMode ?? "VERTICAL");
  const [readingModeTouched, setReadingModeTouched] = useState(false);
  const [genreIds, setGenreIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function handleCategoryChange(nextCategoryId: string) {
    setCategoryId(nextCategoryId);
    if (!readingModeTouched) {
      const category = categories.find((c) => c.id === nextCategoryId);
      if (category) setReadingMode(category.defaultReadingMode);
    }
  }

  function toggleGenre(genreId: string) {
    setGenreIds((prev) => (prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!coverImage) {
      setStatus("error");
      setError("ابتدا تصویر کاور را آپلود کنید");
      return;
    }

    setStatus("saving");
    setError(null);

    const result = await createComic({
      title,
      slug,
      description,
      coverImage,
      bannerImage: bannerImage || undefined,
      licenseId,
      ageRating,
      categoryId,
      readingMode,
      genreIds,
    });

    if (result.success) {
      setStatus("done");
      setTitle("");
      setSlug("");
      setDescription("");
      setCoverImage("");
      setBannerImage("");
      setGenreIds([]);
      setReadingModeTouched(false);
      router.refresh();
      setTimeout(() => close?.(), 1000);
    } else {
      setStatus("error");
      setError(result.error ?? "یه مشکلی پیش اومد");
    }
  }

  if (eligible.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
        هنوز هیچ لایسنس معتبری نداری — قبل ساخت عنوان، اول یه لایسنس بساز.
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">
        هنوز هیچ دسته‌بندی اصلی‌ای ثبت نشده — اول از صفحه «دسته‌بندی‌های اصلی» یکی بساز.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">افزودن عنوان جدید</h2>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="comic-license">لایسنس</label>
        <select id="comic-license" value={licenseId} onChange={(e) => setLicenseId(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
          {eligible.map((l) => (
            <option key={l.id} value={l.id}>{l.publisherName} — {l.territory.join("/")} ({l.status})</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="comic-title">عنوان</label>
          <input id="comic-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm text-text-muted" htmlFor="comic-slug">اسلاگ</label>
            <button type="button" onClick={() => setSlug(slugifyTitle(title))} className="text-xs text-primary">تولید از عنوان</button>
          </div>
          <input id="comic-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]+" title="فقط حروف کوچک انگلیسی، اعداد و خط تیره" className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="comic-description">توضیحات</label>
        <textarea id="comic-description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <CoverUploader entityId={null} currentUrl={coverImage} onUploaded={setCoverImage} />
        <BannerUploader entityId={null} currentUrl={bannerImage} onUploaded={setBannerImage} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="comic-age-rating">رده سنی</label>
          <select id="comic-age-rating" value={ageRating} onChange={(e) => setAgeRating(e.target.value as typeof ageRating)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            <option value="NORMAL">معمولی</option>
            <option value="EIGHTEEN_PLUS">+۱۸</option>
            <option value="NSFW">NSFW</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="comic-category">دسته‌بندی اصلی</label>
          <select id="comic-category" value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="comic-reading-mode">حالت خواندن</label>
          <select
            id="comic-reading-mode"
            value={readingMode}
            onChange={(e) => {
              setReadingMode(e.target.value as ReadingMode);
              setReadingModeTouched(true);
            }}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
          >
            {READING_MODES.map((mode) => (
              <option key={mode} value={mode}>{READING_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm text-text-muted">ژانرها</span>
        {genres.length === 0 ? (
          <p className="text-xs text-text-muted">هنوز ژانری نداری — از صفحه ژانرها یکی اضافه کن.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {genres.map((genre) => (
              <button type="button" key={genre.id} onClick={() => toggleGenre(genre.id)} className={`rounded-full border px-3 py-1 text-xs ${genreIds.includes(genre.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"}`}>
                {genre.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">عنوان اضافه شد.</p>}

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "در حال ذخیره…" : "ثبت عنوان"}
      </button>
    </form>
  );
}