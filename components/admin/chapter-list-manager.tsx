"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ChapterAccessType, ChapterStatus } from "@prisma/client";
import { ChapterAccessFilterTabs, type ChapterAccessFilterValue } from "./chapter-access-filter-tabs";
import { ChapterBulkActions } from "./chapter-bulk-actions";
import { ChapterStatusPanel } from "./chapter-status-panel";
import { EditChapterForm } from "./edit-chapter-form";
import { ChapterPagesLazy } from "./chapter-pages-lazy";

export interface ChapterListRow {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: ChapterStatus;
  scheduledAt: string | null;
  isLocked: boolean;
  accessType: ChapterAccessType;
}

interface ChapterListManagerProps {
  chapters: ChapterListRow[];
  restrictAccessTypes?: boolean;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 100;

export function ChapterListManager({ chapters, restrictAccessTypes, pageSize = DEFAULT_PAGE_SIZE }: ChapterListManagerProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<ChapterAccessFilterValue>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(pageSize);

  const counts = useMemo(() => {
    const base: Record<ChapterAccessFilterValue, number> = {
      ALL: chapters.length,
      FREE: 0,
      COIN: 0,
    };
    for (const chapter of chapters) {
      base[chapter.accessType] += 1;
    }
    return base;
  }, [chapters]);

  const filtered = useMemo(() => {
    if (filter === "ALL") return chapters;
    return chapters.filter((chapter) => chapter.accessType === filter);
  }, [chapters, filter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visible.length;

  function toggleSelect(chapterId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  if (chapters.length === 0) {
    return <p className="text-sm text-text-muted">هنوز چپتری آپلود نشده.</p>;
  }

  return (
    <div className="space-y-3">
      <ChapterAccessFilterTabs value={filter} onChange={setFilter} counts={counts} />

      <ChapterBulkActions
        selectedIds={[...selectedIds]}
        restrictAccessTypes={restrictAccessTypes}
        onApplied={() => router.refresh()}
        onClearSelection={clearSelection}
      />

      <div className="divide-y divide-border rounded-md border border-border">
        {visible.map((chapter) => {
          const chapterLabel = `چپتر ${chapter.chapterNumber}${chapter.title ? ` — ${chapter.title}` : ""}`;
          const selected = selectedIds.has(chapter.id);
          return (
            <div key={chapter.id} className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggleSelect(chapter.id)}
                    className="flex-shrink-0"
                  />
                  <span className="truncate text-sm text-text-main">
                    {chapterLabel}
                    {chapter.isLocked && <span className="mr-2 text-xs text-accent">(قفل دستی)</span>}
                  </span>
                </label>
                <ChapterStatusPanel
                  chapterId={chapter.id}
                  status={chapter.status}
                  scheduledAt={chapter.scheduledAt}
                  chapterLabel={chapterLabel}
                />
              </div>
              <EditChapterForm
                chapterId={chapter.id}
                initialTitle={chapter.title}
                initialChapterNumber={chapter.chapterNumber}
                initialIsLocked={chapter.isLocked}
                initialAccessType={chapter.accessType}
              />
              <ChapterPagesLazy chapterId={chapter.id} />
            </div>
          );
        })}
        {filtered.length === 0 && <p className="px-4 py-3 text-sm text-text-muted">چپتری با این فیلتر یافت نشد.</p>}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount((prev) => prev + pageSize)}
          className="w-full rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-main hover:border-primary"
        >
          نمایش بیشتر ({(filtered.length - visible.length).toLocaleString("fa-IR")} مورد باقی‌مانده)
        </button>
      )}
    </div>
  );
}