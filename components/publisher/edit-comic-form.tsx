"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ReadingMode } from "@prisma/client";
import { updateComicAsPublisher } from "@/app/publisher/actions/comic-update";
import { READING_MODE_LABELS } from "@/lib/reading";
import { useCollapsibleClose } from "@/components/ui/collapsible-section";
import { CoverUploader, BannerUploader } from "@/components/admin/banner-uploader";

interface GenreOption {
  id: string;
  name: string;
}

interface PublisherEditComicFormProps {
  comic: {
    id: string;
    title: string;
    description: string;
    coverImage: string;
    bannerImage: string | null;
    ageRating: "NORMAL" | "EIGHTEEN_PLUS" | "NSFW";
    readingMode: ReadingMode;
    approvalStatus: "PENDING_APPROVAL" | "APPROVED" | "NEEDS_CHANGES";
    rejectionNote: string | null;
  };
  genres: GenreOption[];
  initialGenreIds: string[];
}

const READING_MODES: ReadingMode[] = ["VERTICAL", "HORIZONTAL", "DOUBLE_PAGE"];

export function PublisherEditComicForm({ comic, genres, initialGenreIds }: PublisherEditComicFormProps) {
  const router = useRouter();
  const close = useCollapsibleClose();

  const [title, setTitle] = useState(comic.title);
  const [description, setDescription] = useState(comic.description);
  const [coverImage, setCoverImage] = useState(comic.coverImage);
  const [bannerImage, setBannerImage] = useState(comic.bannerImage ?? "");
  const [ageRating, setAgeRating] = useState(comic.ageRating);
  const [readingMode, setReadingMode] = useState<ReadingMode>(comic.readingMode);
  const [genreIds, setGenreIds] = useState<string[]>(initialGenreIds);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  function toggleGenre(genreId: string) {
    setGenreIds((prev) => (prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const result = await updateComicAsPublisher(comic.id, {
      title,
      description,
      coverImage,
      bannerImage: bannerImage || undefined,
      ageRating,
      readingMode,
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

      {comic.approvalStatus === "NEEDS_CHANGES" && (
        <div className="rounded-md border border-red-400 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          این عنوان توسط ادمین نیاز به اصلاح اعلام شده. یادداشت: {comic.rejectionNote ?? "—"}
          <br />
          با ذخیره‌ی این فرم، دوباره وارد صف تایید می‌شود.
        </div>
      )}
      {comic.approvalStatus === "PENDING_APPROVAL" && (
        <div className="rounded-md border border-accent bg-accent/10 px-3 py-2 text-xs text-accent">
          این عنوان در انتظار تایید ادمین است.
        </div>
      )}

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="pec-title">عنوان</label>
        <input id="pec-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="pec-description">توضیحات</label>
        <textarea id="pec-description" value={description} onChange={(e) => setDescription(e.target.value)} required rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
      </div>

      <CoverUploader
        entityId={comic.id}
        currentUrl={coverImage}
        onUploaded={setCoverImage}
      />

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="pec-age">رده سنی</label>
          <select id="pec-age" value={ageRating} onChange={(e) => setAgeRating(e.target.value as typeof ageRating)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
            <option value="NORMAL">عادی</option>
            <option value="EIGHTEEN_PLUS">۱۸+</option>
            <option value="NSFW">صریح (نیازمند تایید سنی، مانند ۱۸+)</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="pec-reading-mode">حالت خوانش</label>
          <select id="pec-reading-mode" value={readingMode} onChange={(e) => setReadingMode(e.target.value as ReadingMode)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
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

      <div className="space-y-2 rounded-md border border-border bg-background p-3">
        <p className="text-xs text-text-muted">تصویر بنر (اختیاری — فقط وقتی ادمین این عنوان را در صفحه اصلی معرفی کند استفاده می‌شود)</p>
        <BannerUploader
          entityId={comic.id}
          currentUrl={bannerImage}
          onUploaded={setBannerImage}
        />
      </div>

      {status === "error" && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">تغییرات ذخیره شد.</p>}

      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "در حال ذخیره…" : "ذخیره تغییرات"}
      </button>
    </form>
  );
}