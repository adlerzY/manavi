"use client";

import { useState, type DragEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ChapterAccessType } from "@prisma/client";
import { commitUploadedChapter } from "@/app/admin/actions/commit-chapter";
import { useChapterUploadQueue, MAX_PAGE_SIZE_BYTES, type UploadItem } from "@/lib/client/upload-manager";
import { extractImagesFromZip } from "@/lib/client/zip-extract";
import { useCollapsibleClose } from "@/components/ui/collapsible-section";
import { CHAPTER_ACCESS_TYPE_OPTIONS, PUBLISHER_CHAPTER_ACCESS_TYPE_OPTIONS } from "@/lib/chapter-access";

interface ComicOption {
  id: string;
  title: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function itemStatusLabel(item: UploadItem): string {
  if (item.status === "done") return "آپلود شد";
  if (item.status === "error") return "خطا در آپلود";
  if (item.status === "uploading") return `در حال آپلود ${item.progress.toLocaleString("fa-IR")}٪`;
  return "در صف آپلود";
}

export function UploadChapterForm({ comics, restrictAccessTypes }: { comics: ComicOption[]; restrictAccessTypes?: boolean }) {
  const accessOptions = restrictAccessTypes ? PUBLISHER_CHAPTER_ACCESS_TYPE_OPTIONS : CHAPTER_ACCESS_TYPE_OPTIONS;
  const router = useRouter();
  const close = useCollapsibleClose();
  const [comicId, setComicId] = useState(comics[0]?.id ?? "");
  const [chapterNumber, setChapterNumber] = useState("");
  const [title, setTitle] = useState("");
  const [accessType, setAccessType] = useState<ChapterAccessType>("FREE");
  const [status, setStatus] = useState<"idle" | "extracting" | "committing" | "error" | "done">("idle");
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [error, setError] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);

  const queue = useChapterUploadQueue();
  const items = queue.items;

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
        images = extracted.map((img) => ({
          name: img.name,
          contentType: img.contentType,
          blob: img.blob,
        }));
      } else {
        const invalidType = files.find((file) => !ALLOWED_IMAGE_TYPES.has(file.type));
        if (invalidType) {
          setStatus("error");
          setError(`فرمت فایل پشتیبانی نمی‌شود: ${invalidType.type || invalidType.name}`);
          return;
        }
        images = files
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((file) => ({ name: file.name, contentType: file.type, blob: file }));
      }
    } catch {
      setStatus("error");
      setError("خطا در استخراج فایل ZIP");
      return;
    }

    const oversized = images.find((image) => image.blob.size > MAX_PAGE_SIZE_BYTES);
    if (oversized) {
      setStatus("error");
      setError(`حجم «${oversized.name}» بیش از ${(MAX_PAGE_SIZE_BYTES / 1024 / 1024).toLocaleString("fa-IR")} مگابایت است`);
      return;
    }

    setStatus("idle");
    const failure = await queue.addFiles(comicId, images);
    if (failure) {
      setStatus("error");
      setError(failure);
    }
  }

  const failedItems = items.filter((item) => item.status === "error");
  const uploadingItems = items.filter((item) => item.status === "uploading");
  const doneCount = items.filter((item) => item.status === "done").length;
  const allDone = items.length > 0 && doneCount === items.length;
  const busy = status === "extracting" || status === "committing" || queue.isRunning;

  function handleOpenReview(e: FormEvent) {
    e.preventDefault();
    if (!allDone) {
      setStatus("error");
      setError("همه صفحات باید با موفقیت آپلود شوند");
      return;
    }
    if (!chapterNumber) {
      setStatus("error");
      setError("شماره چپتر را وارد کنید");
      return;
    }
    setStatus("idle");
    setError(null);
    setStep("review");
  }

  async function handleCommit() {
    const keys = queue.orderedKeys();
    if (!keys) {
      setStep("edit");
      setStatus("error");
      setError("همه صفحات باید با موفقیت آپلود شوند");
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
      setStep("edit");
      setChapterNumber("");
      setTitle("");
      setAccessType("FREE");
      queue.reset();
      router.refresh();
      setTimeout(() => close?.(), 1000);
    } else {
      setStatus("error");
      setStep("edit");
      setError(result.error ?? "خطا در ثبت چپتر");
    }
  }

  function handleDrop(position: number) {
    if (dragPosition !== null) queue.moveItem(dragPosition, position);
    setDragPosition(null);
  }

  if (comics.length === 0) {
    return <div className="rounded-md border border-border bg-surface p-6 text-sm text-text-muted">عنوانی موجود نیست — ابتدا یک عنوان بسازید.</div>;
  }

  return (
    <form onSubmit={handleOpenReview} className="space-y-4 rounded-md border border-border bg-surface p-6">
      <h2 className="text-lg font-medium text-text-main">آپلود چپتر</h2>

      <div className="space-y-1">
        <label className="text-sm text-text-muted" htmlFor="chapter-comic">عنوان</label>
        <select
          id="chapter-comic"
          value={comicId}
          onChange={(e) => setComicId(e.target.value)}
          disabled={items.length > 0}
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-text-main outline-none focus:border-primary disabled:opacity-60"
        >
          {comics.map((comic) => (
            <option key={comic.id} value={comic.id}>{comic.title}</option>
          ))}
        </select>
        {items.length > 0 && <p className="text-xs text-text-muted">برای تغییر عنوان، ابتدا صفحات آپلودشده را پاک کنید.</p>}
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
          {accessOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <span className="text-sm text-text-muted">
          {items.length > 0 ? "افزودن صفحات بیشتر (چند تصویر یا یک فایل ZIP)" : "صفحات (چند تصویر یا یک فایل ZIP)"}
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,.zip"
          multiple
          disabled={busy}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
          className="block w-full text-xs text-text-muted file:ml-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2.5 file:text-xs file:font-medium file:text-primary-foreground disabled:opacity-50"
        />

        {status === "extracting" && <p className="text-xs text-text-muted">در حال استخراج فایل ZIP…</p>}

        {items.length > 0 && (
          <div className="space-y-3 rounded-md border border-border bg-background p-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  {doneCount.toLocaleString("fa-IR")} از {items.length.toLocaleString("fa-IR")} صفحه آپلود شد
                  {failedItems.length > 0 && <span className="text-red-400"> — {failedItems.length.toLocaleString("fa-IR")} خطا</span>}
                </span>
                <span>{queue.overallProgress.toLocaleString("fa-IR")}٪</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${queue.overallProgress}%` }} />
              </div>
              {uploadingItems.length > 0 && (
                <p dir="auto" className="truncate text-xs text-text-muted">
                  در حال آپلود: {uploadingItems[0].name}
                  {uploadingItems.length > 1 && ` و ${(uploadingItems.length - 1).toLocaleString("fa-IR")} مورد دیگر`}
                </p>
              )}
            </div>

            <p className="text-xs leading-6 text-text-muted">
              ترتیب صفحات در این شبکه همان ترتیب خواندن چپتر است. می‌توانید صفحه‌ها را جابه‌جا یا حذف کنید.
            </p>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {items.map((item, position) => (
                <div
                  key={item.index}
                  draggable
                  onDragStart={() => setDragPosition(position)}
                  onDragOver={(e: DragEvent) => e.preventDefault()}
                  onDrop={() => handleDrop(position)}
                  onDragEnd={() => setDragPosition(null)}
                  className={`overflow-hidden rounded-md border bg-surface ${
                    item.status === "error" ? "border-red-400" : "border-border"
                  } ${dragPosition === position ? "opacity-50" : ""}`}
                >
                  <div className="relative aspect-[2/3] bg-background">
                    <img
                      src={item.previewUrl}
                      alt={`صفحه ${(position + 1).toLocaleString("fa-IR")}`}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white">
                      {(position + 1).toLocaleString("fa-IR")}
                    </span>
                    {item.status === "done" && (
                      <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={12} />
                      </span>
                    )}
                    {item.status === "error" && (
                      <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white">
                        <AlertTriangle size={12} />
                      </span>
                    )}
                    {item.status === "uploading" && (
                      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
                        <div className="h-full bg-primary transition-all duration-200" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                  </div>
                  <p dir="auto" title={item.name} className="truncate px-1.5 pt-1 text-xs text-text-main">{item.name}</p>
                  <p className={`px-1.5 pb-1 text-xs ${item.status === "error" ? "text-red-400" : "text-text-muted"}`}>
                    {itemStatusLabel(item)}
                  </p>
                  <div className="flex gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => queue.moveItem(position, position - 1)}
                      disabled={position === 0}
                      aria-label="انتقال به قبل"
                      className="flex h-10 flex-1 items-center justify-center rounded-md border border-border text-text-main disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => queue.removeItem(item.index)}
                      aria-label="حذف صفحه"
                      className="flex h-10 flex-1 items-center justify-center rounded-md border border-red-400 text-red-400"
                    >
                      <X size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => queue.moveItem(position, position + 1)}
                      disabled={position === items.length - 1}
                      aria-label="انتقال به بعد"
                      className="flex h-10 flex-1 items-center justify-center rounded-md border border-border text-text-main disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {failedItems.length > 0 && (
              <div className="space-y-3 rounded-md border border-red-400/30 bg-red-400/5 p-3">
                <p className="text-xs font-medium text-red-400">جزئیات خطاها — این متن را برای بررسی ارسال کنید</p>
                {failedItems.map((item) => (
                  <div key={item.index} className="space-y-1 border-b border-red-400/20 pb-2 last:border-0 last:pb-0">
                    <p dir="auto" className="text-xs font-medium text-red-400">
                      {item.name}
                    </p>
                    <pre className="whitespace-pre-wrap break-words text-xs text-red-300">{item.error}</pre>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {failedItems.length > 0 && !queue.isRunning && (
                <button type="button" onClick={() => queue.retryFailed()} className="min-h-11 rounded-md border border-red-400 px-3 py-2 text-xs text-red-400">
                  تلاش دوباره برای موارد ناموفق
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm("همه صفحات انتخاب‌شده پاک شوند و فرم از نو شروع شود؟")) queue.reset();
                }}
                disabled={busy}
                className="min-h-11 rounded-md border border-border px-3 py-2 text-xs text-text-muted disabled:opacity-50"
              >
                پاک کردن همه صفحات
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {status === "done" && <p className="text-sm text-primary">چپتر به‌صورت پیش‌نویس ثبت شد.</p>}

      <button
        type="submit"
        disabled={busy || !allDone}
        className="min-h-11 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {queue.isRunning ? "در حال آپلود…" : "مرور نهایی و ثبت چپتر"}
      </button>

      {step === "review" && (
        <div style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }} className="fixed inset-0 z-[60] flex flex-col bg-black">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white">
              مرور نهایی — چپتر {Number(chapterNumber).toLocaleString("fa-IR")} · {items.length.toLocaleString("fa-IR")} صفحه
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-md space-y-1 py-2">
              {items.map((item, position) => (
                <div key={item.index} className="relative">
                  <img
                    src={item.previewUrl}
                    alt={`صفحه ${(position + 1).toLocaleString("fa-IR")}`}
                    loading="lazy"
                    decoding="async"
                    className="block h-auto w-full"
                  />
                  <span className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white">
                    {(position + 1).toLocaleString("fa-IR")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))" }}
            className="flex gap-2 border-t border-white/10 bg-black px-4 py-3"
          >
            <button
              type="button"
              onClick={() => setStep("edit")}
              disabled={status === "committing"}
              className="min-h-11 flex-1 rounded-md border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              بازگشت به ویرایش
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={status === "committing"}
              className="min-h-11 flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {status === "committing" ? "در حال ثبت…" : "تایید و ثبت چپتر"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}