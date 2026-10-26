"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ChapterAccessType } from "@prisma/client";
import { commitUploadedChapter } from "@/app/admin/actions/commit-chapter";
import { useChapterUploadQueue, MAX_PAGE_SIZE_BYTES } from "@/lib/client/upload-manager";
import { extractImagesFromZip } from "@/lib/client/zip-extract";
import { useCollapsibleClose } from "@/components/ui/collapsible-section";
import { CHAPTER_ACCESS_TYPE_OPTIONS, PUBLISHER_CHAPTER_ACCESS_TYPE_OPTIONS } from "@/lib/chapter-access";

interface ComicOption {
  id: string;
  title: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function UploadChapterForm({ comics, restrictAccessTypes }: { comics: ComicOption[]; restrictAccessTypes?: boolean }) {
  const accessOptions = restrictAccessTypes ? PUBLISHER_CHAPTER_ACCESS_TYPE_OPTIONS : CHAPTER_ACCESS_TYPE_OPTIONS;
  const router = useRouter();
  const close = useCollapsibleClose();
  const [comicId, setComicId] = useState(comics[0]?.id ?? "");
  const [chapterNumber, setChapterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [accessType, setAccessType] = useState<ChapterAccessType>("FREE");
  const [status, setStatus] = useState<"idle" | "extracting" | "uploading" | "committing" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const queue = useChapterUploadQueue();

  async function handleFilesSelected(fileList: FileList) {
    if (!comicId) {
      setStatus("error");
      setError("ابتدا یک عنوان انتخاب کنید");
      return;
    }

    setStatus("extracting");
    setError(null);

    const files = Array.from(fileList);
    let images: { name: string; contentType: string; blob: Blob }[] = [];

    try {
      if (files.length === 1 && files[0].name.toLowerCase().endsWith(".zip")) {
        const extracted = await extractImagesFromZip(files[0]);
        if (extracted.length === 0) {
          setStatus("error");
          setError("هیچ تصویری در فایل ZIP یافت نشد");
          return;
        }
        images = extracted.map((img) => ({ name: img.name, contentType: img.contentType, blob: img.blob }));
      } else {
        const invalidType = files.find((f) => !ALLOWED_IMAGE_TYPES.has(f.type));
        if (invalidType) {
          setStatus("error");
          setError(`فرمت فایل پشتیبانی نمی‌شود: ${invalidType.type || invalidType.name}`);
          return;
        }
        images = files
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((f) => ({ name: f.name, contentType: f.type, blob: f }));
      }
    } catch {
      setStatus("error");
      setError("خطا در استخراج فایل ZIP");
      return;
    }

    const oversized = images.find((img) => img.blob.size > MAX_PAGE_SIZE_BYTES);
    if (oversized) {
      setStatus("error");
      setError(`حجم «${oversized.name}» بیش از ${MAX_PAGE_SIZE_BYTES / 1024 / 1024} مگابایت است`);
      return;
    }

    setStatus("uploading");
    await queue.start(comicId, images);
    setStatus("idle");
  }

  async function handleCommit(e: FormEvent) {
    e.preventDefault();

    const keys = queue.orderedKeys();
    if (!keys) {
      setError("همه صفحات باید با موفقیت آپلود شوند");
      return;
    }
    if (!chapterNumber) {
      setError("شماره چپتر را وارد کنید");
      return;
    }

    setStatus("committing");
    setError(null);

    const result = await commitUploadedChapter({
      comicId,
      chapterNumber: Number(chapterNumber),
      title: title || undefined,
      accessType,
      pageKeys: keys,
    });

    if (result.success) {
      setStatus("done");
      setChapterNumber("");
      setTitle("");
      setAccessType("FREE");
      queue.reset();
      router.refresh();
      setTimeout(() => close?.(), 1000);
    } else {
      setStatus("error");
      setError(result.error ?? "خطا در ثبت چپتر");
    }
  }

  if (comics.length === 0) {
    return <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">عنوانی موجود نیست — ابتدا یک عنوان بسازید.</div>;
  }

  const failedCount = queue.items.filter((item) => item.status === "error").length;
  const doneCount = queue.items.filter((item) => item.status === "done").length;
  const allDone = queue.items.length > 0 && doneCount === queue.items.length;
  const firstItemError = queue.items.find((item) => item.status === "error" && item.error)?.error ?? null;

  return (
    <form onSubmit={handleCommit} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">آپلود چپتر</h2>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="chapter-comic">عنوان</label>
        <select id="chapter-comic" value={comicId} onChange={(e) => setComicId(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary">
          {comics.map((c) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="chapter-number">شماره چپتر</label>
          <input id="chapter-number" type="number" step="0.1" value={chapterNumber} onChange={(e) => setChapterNumber(e.target.value)} required className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-text-muted" htmlFor="chapter-title">عنوان چپتر <span className="text-text-muted">(اختیاری)</span></label>
          <input id="chapter-title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="chapter-access">نوع دسترسی</label>
        <select
          id="chapter-access"
          value={accessType}
          onChange={(e) => setAccessType(e.target.value as ChapterAccessType)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary"
        >
          {accessOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <span className="text-sm text-text-muted">صفحات (چند تصویر یا یک فایل ZIP)</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.zip"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
          className="block w-full text-xs text-text-muted file:ml-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary-foreground"
        />

        {queue.items.length > 0 && (
          <div className="space-y-2 rounded-md border border-border bg-background p-3">
            <p className="text-xs text-text-muted">
              {doneCount.toLocaleString("fa-IR")} از {queue.items.length.toLocaleString("fa-IR")} صفحه آپلود شد
              {failedCount > 0 && <span className="text-red-400"> — {failedCount.toLocaleString("fa-IR")} خطا</span>}
            </p>
            <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
              {queue.items.map((item) => (
                <div
                  key={item.index}
                  title={item.name}
                  className={`h-2 rounded-full ${
                    item.status === "done" ? "bg-primary" : item.status === "error" ? "bg-red-500" : item.status === "uploading" ? "bg-accent" : "bg-border"
                  }`}
                />
              ))}
            </div>
            {failedCount > 0 && firstItemError && <p className="text-xs text-red-400">{firstItemError}</p>}
            {failedCount > 0 && !queue.isRunning && (
              <button type="button" onClick={() => queue.retryFailed()} className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400">
                تلاش دوباره برای موارد ناموفق
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">چپتر به‌صورت پیش‌نویس ثبت شد.</p>}

      <button
        type="submit"
        disabled={status === "extracting" || status === "uploading" || status === "committing" || queue.isRunning || !allDone}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === "extracting" && "در حال استخراج ZIP…"}
        {status === "uploading" && "در حال آپلود…"}
        {status === "committing" && "در حال ثبت…"}
        {(status === "idle" || status === "error" || status === "done") && "ثبت چپتر"}
      </button>
    </form>
  );
}