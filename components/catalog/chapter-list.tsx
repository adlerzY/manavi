"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

export interface ChapterListItem {
  id: string;
  chapterNumber: number;
  title: string | null;
  publishedAt: string | null;
  isCoin: boolean;
  owned: boolean;
  isRead: boolean;
  isLatest: boolean;
  isCurrent: boolean;
}

interface ChapterListProps {
  chapters: ChapterListItem[];
  price: number;
  focusCurrent?: boolean;
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs ${className}`}>{children}</span>;
}

export function ChapterList({ chapters, price, focusCurrent = false }: ChapterListProps) {
  const currentRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!focusCurrent) return;
    currentRef.current?.scrollIntoView({ block: "center" });
  }, [focusCurrent]);

  if (chapters.length === 0) {
    return (
      <div className="rounded-md border border-border">
        <p className="px-4 py-3 text-sm text-text-muted">در حال حاضر چپتری موجود نیست.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {chapters.map((chapter) => (
        <Link
          key={chapter.id}
          ref={chapter.isCurrent ? currentRef : undefined}
          href={`/app/read/${chapter.id}`}
          className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface ${
            chapter.isCurrent ? "border-r-2 border-primary bg-primary/5" : ""
          }`}
        >
          <div className={`min-w-0 ${chapter.isRead && !chapter.isCurrent ? "opacity-60" : ""}`}>
            <p className="truncate text-sm text-text-main">
              چپتر {chapter.chapterNumber.toLocaleString("fa-IR")}
              {chapter.title ? ` — ${chapter.title}` : ""}
            </p>
            {chapter.publishedAt && (
              <p className="mt-0.5 text-xs text-text-muted">{new Date(chapter.publishedAt).toLocaleDateString("fa-IR")}</p>
            )}
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-1.5">
            {chapter.isCurrent && <Badge className="bg-accent text-accent-foreground">ادامه از اینجا</Badge>}
            {chapter.isLatest && <Badge className="bg-primary text-primary-foreground">آخرین انتشار</Badge>}
            {chapter.isRead && !chapter.isCurrent && <Badge className="bg-border text-text-muted">خوانده‌شده</Badge>}
            {!chapter.isCoin && <Badge className="bg-primary/10 text-primary">رایگان</Badge>}
            {chapter.isCoin && chapter.owned && <Badge className="bg-primary/10 text-primary">باز شده</Badge>}
            {chapter.isCoin && !chapter.owned && (
              <Badge className="bg-accent/10 text-accent">🪙 {price.toLocaleString("fa-IR")} سکه</Badge>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}