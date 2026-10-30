"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveComic, rejectComic, type PendingComicRow } from "@/app/admin/actions/comic-approval";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

export function ComicApprovalQueue({ initialComics }: { initialComics: PendingComicRow[] }) {
  const [comics, setComics] = useState(initialComics);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function handleApprove(comicId: string) {
    setError(null);
    startTransition(async () => {
      const result = await approveComic(comicId);
      if (result.success) setComics((prev) => prev.filter((c) => c.id !== comicId));
      else setError(result.error ?? "خطا در تایید");
    });
  }

  function handleReject(comicId: string) {
    if (!note.trim()) { setError("دلیل رد کردن را بنویسید"); return; }
    setError(null);
    startTransition(async () => {
      const result = await rejectComic(comicId, note);
      if (result.success) { setComics((prev) => prev.filter((c) => c.id !== comicId)); setRejectingId(null); setNote(""); }
      else setError(result.error ?? "خطا در رد کردن");
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="divide-y divide-border rounded-md border border-border">
        {comics.map((comic) => (
          <div key={comic.id} className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-16 w-11 flex-shrink-0 overflow-hidden rounded-md bg-surface">
                  <SafeCoverImage src={comic.coverImage} alt={comic.title} fill sizes="44px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <Link href={`/admin/comics/${comic.id}`} className="text-sm text-text-main hover:text-primary">{comic.title}</Link>
                  <p className="text-xs text-text-muted">
                    {comic.creatorName ? `ساخته‌شده توسط ${comic.creatorName} · ` : ""}
                    {new Date(comic.createdAt).toLocaleString("fa-IR")}
                    {comic.rejectionNote && <span className="text-accent"> · قبلاً رد شده</span>}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleApprove(comic.id)} disabled={isPending} className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50">تایید و انتشار</button>
                <button onClick={() => setRejectingId(rejectingId === comic.id ? null : comic.id)} disabled={isPending} className="rounded-md border border-red-400 px-3 py-1 text-xs text-red-400 disabled:opacity-50">رد کردن</button>
              </div>
            </div>
            {rejectingId === comic.id && (
              <div className="flex items-center gap-2 rounded-md bg-background p-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="دلیل رد کردن — برای ناشر نمایش داده می‌شود" className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text-main" />
                <button onClick={() => handleReject(comic.id)} disabled={isPending} className="rounded-md bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-50">ثبت رد</button>
              </div>
            )}
          </div>
        ))}
        {comics.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">عنوانی در انتظار تایید نیست.</p>}
      </div>
    </div>
  );
}