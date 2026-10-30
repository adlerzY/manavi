"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import { Layers, MoreHorizontal } from "lucide-react";
import { BottomSheet } from "@/components/ui/bottom-sheet";

interface ComicMoreSheetProps {
  label: string;
  highlight: boolean;
  editions: ReactNode;
  rating: ReactNode;
  request: ReactNode;
  report: ReactNode;
}

export function ComicMoreSheet({ label, highlight, editions, rating, request, report }: ComicMoreSheetProps) {
  const [open, setOpen] = useState(false);

  function handleContentClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-sm ${
          highlight ? "border-primary text-primary" : "border-border bg-surface text-text-main"
        }`}
      >
        {highlight ? <Layers size={16} /> : <MoreHorizontal size={16} />}
        {label}
      </button>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="ترجمه، امتیاز و گزارش">
        <div onClick={handleContentClick} className="space-y-4">
          {editions}
          {rating}
          {request}
          {report && (
            <div className="space-y-2">
              <p className="text-xs text-text-muted">مشکلی دیدید؟</p>
              {report}
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}