"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveChapter, rejectChapter, type PendingChapterRow } from "@/app/admin/actions/chapter-approval";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

export function ChapterApprovalQueue({ initialChapters }: { initialChapters: PendingChapterRow[] }) {
  const [chapters, setChapters] = useState(initialChapters);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove(chapterId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveChapter(chapterId);
      if (result.success) {
        setChapters((prev) => prev.filter((c) => c.id !== chapterId));
      } else {
        setError(result.error ?? "خطا در تایید");
      }
    });
  }

  function handleReject(chapterId: string) {
    if (!confirm("این چپتر به حالت پیش‌نویس برمی‌گردد و منتشر نمی‌شود. مطمئنید؟")) return;
    setError(null);
    startTransition(async () => {
      const result = await rejectChapter(chapterId);
      if (result.success) {
        setChapters((prev) => prev.filter((c) => c.id !== chapterId));
      } else {
        setError(result.error ?? "خطا در رد کردن");
      }
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="divide-y divide-border rounded-md border border-border">
        {chapters.map((chapter) => (
          <div key={chapter.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded-md bg-surface">
                <SafeCoverImage src={chapter.comic.coverImage} alt={chapter.comic.title} fill sizes="44px" className="object-cover" />
              </div>
              <div className="min-w-0">
                <Link href={`/admin/comics/${chapter.comic.id}`} className="text-sm text-text-main hover:text-primary">
                  {chapter.comic.title} — چپتر {chapter.chapterNumber.toLocaleString("fa-IR")}
                  {chapter.title ? ` — ${chapter.title}` : ""}
                </Link>
                <p className="text-xs text-text-muted">
                  {chapter.uploaderName ? `آپلود توسط ${chapter.uploaderName} · ` : ""}
                  {new Date(chapter.createdAt).toLocaleString("fa-IR")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleApprove(chapter.id)} disabled={isPending} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">
                تایید و انتشار
              </button>
              <button onClick={() => handleReject(chapter.id)} disabled={isPending} className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50">
                رد کردن
              </button>
            </div>
          </div>
        ))}
        {chapters.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">چپتری در انتظار تایید نیست.</p>}
      </div>
    </div>
  );
}