"use client";

import { useState, type FormEvent } from "react";
import type { ChapterAccessType } from "@prisma/client";
import { updateChapter } from "@/app/admin/actions/catalog-actions";
import { CHAPTER_ACCESS_TYPE_OPTIONS } from "@/lib/chapter-access";

interface EditChapterFormProps {
  chapterId: string;
  initialTitle: string | null;
  initialChapterNumber: number;
  initialIsLocked: boolean;
  initialAccessType: ChapterAccessType;
  accessOptions?: { value: ChapterAccessType; label: string }[];
}

export function EditChapterForm({
  chapterId,
  initialTitle,
  initialChapterNumber,
  initialIsLocked,
  initialAccessType,
  accessOptions,
}: EditChapterFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initialTitle ?? "");
  const [chapterNumber, setChapterNumber] = useState(String(initialChapterNumber));
  const [isLocked, setIsLocked] = useState(initialIsLocked);
  const [accessType, setAccessType] = useState<ChapterAccessType>(initialAccessType);
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const options = accessOptions ?? CHAPTER_ACCESS_TYPE_OPTIONS;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);

    const result = await updateChapter(chapterId, {
      title: title || undefined,
      chapterNumber: Number(chapterNumber),
      isLocked,
      accessType,
    });

    setStatus(result.success ? "done" : "error");
    if (!result.success) setError(result.error ?? "خطا");
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-text-muted underline decoration-dotted">
        ویرایش اطلاعات چپتر
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md bg-background p-2">
      <div className="space-y-1">
        <label className="text-xs text-text-muted" htmlFor={`ch-num-${chapterId}`}>شماره چپتر</label>
        <input
          id={`ch-num-${chapterId}`}
          type="number"
          step="0.1"
          value={chapterNumber}
          onChange={(e) => setChapterNumber(e.target.value)}
          required
          className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-text-muted" htmlFor={`ch-title-${chapterId}`}>عنوان (اختیاری)</label>
        <input
          id={`ch-title-${chapterId}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-40 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-text-muted" htmlFor={`ch-access-${chapterId}`}>نوع دسترسی</label>
        <select
          id={`ch-access-${chapterId}`}
          value={accessType}
          onChange={(e) => setAccessType(e.target.value as ChapterAccessType)}
          className="w-44 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs text-text-muted">
        <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} />
        قفل دستی
      </label>
      <button type="submit" disabled={status === "saving"} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
        {status === "saving" ? "…" : "ذخیره"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1 text-xs text-text-muted">
        بستن
      </button>
      {status === "error" && <span className="text-xs text-red-400">{error}</span>}
      {status === "done" && <span className="text-xs text-primary">ذخیره شد</span>}
    </form>
  );
}