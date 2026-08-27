"use client";

import { useState } from "react";
import { getChapterPagePreviews } from "@/app/admin/actions/chapter-lifecycle";
import { ChapterPagesManager } from "./chapter-pages-manager";

interface ChapterPagesLazyProps {
  chapterId: string;
}

export function ChapterPagesLazy({ chapterId }: ChapterPagesLazyProps) {
  const [open, setOpen] = useState(false);
  const [pageKeys, setPageKeys] = useState<string[] | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleOpen() {
    setOpen(true);
    if (pageKeys !== null) return;
    setStatus("loading");
    const result = await getChapterPagePreviews(chapterId);
    if (result.success && result.data) {
      setPageKeys(result.data.pageKeys);
      setPreviewUrls(result.data.previewUrls);
      setStatus("idle");
    } else {
      setStatus("error");
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={handleOpen} className="text-xs text-text-muted underline decoration-dotted">
        نمایش صفحات
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-text-muted underline decoration-dotted">
        بستن صفحات
      </button>
      {status === "loading" && <p className="text-xs text-text-muted">در حال بارگذاری پیش‌نمایش صفحات…</p>}
      {status === "error" && <p className="text-xs text-red-400">خطا در بارگذاری پیش‌نمایش صفحات</p>}
      {pageKeys && previewUrls && pageKeys.length === 0 && (
        <p className="text-xs text-text-muted">صفحه‌ای موجود نیست.</p>
      )}
      {pageKeys && previewUrls && pageKeys.length > 0 && (
        <ChapterPagesManager chapterId={chapterId} pageKeys={pageKeys} previewUrls={previewUrls} />
      )}
    </div>
  );
}