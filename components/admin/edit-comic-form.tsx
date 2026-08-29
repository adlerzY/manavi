"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReadingMode } from "@prisma/client";
import { updateComic } from "@/app/admin/actions/catalog-actions";
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
}

interface EditComicFormProps {
  comic: {
    id: string;
    title: string;
    slug: string;
    description: string;
    coverImage: string;
    bannerImage: string | null;
    licenseId: string;
    ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
    categoryId: string;
    readingMode: ReadingMode;
    isFeaturedOnHome: boolean;
    featuredBadge: string | null;
  };
  licenses: LicenseOption[];
  genres: GenreOption[];
  categories: CategoryOption[];
  initialGenreIds: string[];
}

const READING_MODES: ReadingMode[] = ["VERTICAL", "HORIZONTAL", "DOUBLE_PAGE"];

export function EditComicForm({ comic, licenses, genres, categories, initialGenreIds }: EditComicFormProps) {
  const router = useRouter();
  const close = useCollapsibleClose();

  const [title, setTitle] = useState(comic.title);
  const [slug, setSlug] = useState(comic.slug);
  const [description, setDescription] = useState(comic.description);
  const [coverImage, setCoverImage] = useState(comic.coverImage);
  const [bannerImage, setBannerImage] = useState(comic.bannerImage ?? "");
  const [licenseId, setLicenseId] = useState(comic.licenseId);
  const [ageRating, setAgeRating] = useState(comic.ageRating);
  const [categoryId, setCategoryId] = useState(comic.categoryId);
  const [readingMode, setReadingMode] = useState<ReadingMode>(comic.readingMode);
  const [isFeaturedOnHome, setIsFeaturedOnHome] = useState(comic.isFeaturedOnHome);
  const [featuredBadge, setFeaturedBadge] = useState(comic.featuredBadge ?? "");
  const [genreIds, setGenreIds] = useState<string[]>(initialGenreIds);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const licenseOptions = licenses.some((l) => l.id === comic.licenseId)
    ? licenses
    : [{ id: comic.licenseId, publisherName: "(لایسنس فعلی)", territory: [], status: "" }, ...licenses];

  const categoryOptions = categories.some((c) => c.id === comic.categoryId)
    ? categories
    : [{ id: comic.categoryId, name: "(دسته‌بندی فعلی)" }, ...categories];

  function toggleGenre(genreId: string) {
    setGenreIds((prev) => (prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const result = await updateComic(comic.id, {
      title,
      slug,
      description,
      coverImage,
      bannerImage: bannerImage || undefined,
      licenseId,
      ageRating,
      categoryId,
      readingMode,
      isFeaturedOnHome,
      featuredBadge: featuredBadge || undefined,
      genreIds,
    });

    if (result.success) {
      setStatus("done");
      router.refresh();
      setTimeout(() => close?.(), 800);
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در ذخیره‌سازی");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">ویرایش عنوان</h2>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="edit-comic-title">عنوان</label>
          <input id="edit-comic-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="edit-comic-slug">اسلاگ</label>
          <input id="edit-comic-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9-]+" className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="edit-comic-description">توضیحات</label>
        <textarea id="edit-comic-description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
      </div>

      <CoverUploader entityId={comic.id} currentUrl={coverImage} onUploaded={setCoverImage} />

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="edit-comic-license">لایسنس</label>
        <select id="edit-comic-license" value={licenseId} onChange={(e) => setLicenseId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
          {licenseOptions.map((l) => (
            <option key={l.id} value={l.id}>{l.publisherName} {l.territory.length ? `— ${l.territory.join("/")}` : ""} {l.status ? `(${l.status})` : ""}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="edit-comic-age">رده سنی</label>
          <select id="edit-comic-age" value={ageRating} onChange={(e) => setAgeRating(e.target.value as typeof ageRating)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            <option value="NORMAL">عادی</option>
            <option value="EIGHTEEN_PLUS">۱۸+</option>
            <option value="NSFW">صریح (نیازمند تایید سنی، مانند ۱۸+)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="edit-comic-category">دسته‌بندی اصلی</label>
          <select id="edit-comic-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="edit-comic-reading-mode">حالت خوانش</label>
          <select id="edit-comic-reading-mode" value={readingMode} onChange={(e) => setReadingMode(e.target.value as ReadingMode)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            {READING_MODES.map((mode) => (
              <option key={mode} value={mode}>{READING_MODE_LABELS[mode]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-sm text-text-muted">دسته‌بندی‌ها</span>
        {genres.length === 0 ? (
          <p className="text-xs text-text-muted">هنوز دسته‌بندی‌ای ثبت نشده.</p>
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

      <div className="space-y-3 rounded-md border border-border bg-background p-3">
        <label className="flex items-center gap-2 text-sm text-text-main">
          <input type="checkbox" checked={isFeaturedOnHome} onChange={(e) => setIsFeaturedOnHome(e.target.checked)} />
          نمایش به‌عنوان هیرو در صفحه اصلی
        </label>

        {isFeaturedOnHome && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-text-muted" htmlFor="edit-comic-badge">متن بج (مثلاً «چپتر جدید»)</label>
              <input id="edit-comic-badge" value={featuredBadge} onChange={(e) => setFeaturedBadge(e.target.value)} className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main outline-none focus:border-primary" />
            </div>
            <BannerUploader entityId={comic.id} currentUrl={bannerImage} onUploaded={setBannerImage} />
          </>
        )}
      </div>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">تغییرات ذخیره شد.</p>}

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "در حال ذخیره…" : "ذخیره تغییرات"}
      </button>
    </form>
  );
}