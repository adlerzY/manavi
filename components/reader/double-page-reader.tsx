"use client";

import { useCallback, useEffect, useRef } from "react";
import type { TouchEvent } from "react";
import { ProtectedImage } from "./protected-image";
import type { ReadingDirection } from "@/lib/reading";

interface DoublePageReaderProps {
  pages: string[];
  currentPage: number;
  direction: ReadingDirection;
  onPageChange: (page: number) => void;
  onRequestPrevChapter: () => void;
  onRequestNextChapter: () => void;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
  onToggleControls: () => void;
}

export function DoublePageReader({
  pages,
  currentPage,
  direction,
  onPageChange,
  onRequestPrevChapter,
  onRequestNextChapter,
  hasPrevChapter,
  hasNextChapter,
  onToggleControls,
}: DoublePageReaderProps) {
  const touchStartX = useRef<number | null>(null);
  const isRtl = direction === "rtl";

  const spreadFirst = currentPage % 2 === 1 ? currentPage : currentPage - 1;
  const firstUrl = pages[spreadFirst - 1];
  const secondUrl = pages[spreadFirst];

  useEffect(() => {
    [pages[spreadFirst + 1], pages[spreadFirst + 2]].forEach((url) => {
      if (!url) return;
      const img = new window.Image();
      img.src = url;
    });
  }, [spreadFirst, pages]);

  const goBackward = useCallback(() => {
    if (spreadFirst > 1) onPageChange(Math.max(1, spreadFirst - 2));
    else if (hasPrevChapter) onRequestPrevChapter();
  }, [spreadFirst, hasPrevChapter, onRequestPrevChapter, onPageChange]);

  const goForward = useCallback(() => {
    if (spreadFirst + 2 <= pages.length) onPageChange(spreadFirst + 2);
    else if (hasNextChapter) onRequestNextChapter();
  }, [spreadFirst, pages.length, hasNextChapter, onRequestNextChapter, onPageChange]);

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "ArrowRight") isRtl ? goBackward() : goForward();
      if (e.key === "ArrowLeft") isRtl ? goForward() : goBackward();
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [goBackward, goForward, isRtl]);

  function handleTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }
  function handleTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(deltaX) < 40) return;
    const swipedRight = deltaX > 0;
    const goesBackward = isRtl ? swipedRight : !swipedRight;
    if (goesBackward) goBackward();
    else goForward();
  }

  const rightUrl = isRtl ? firstUrl : secondUrl;
  const leftUrl = isRtl ? secondUrl : firstUrl;
  const rightAction = isRtl ? goBackward : goForward;
  const leftAction = isRtl ? goForward : goBackward;

  return (
    <div className="relative flex h-full w-full items-center justify-center gap-1 bg-black" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="relative h-full w-1/2">
        {leftUrl && <ProtectedImage src={leftUrl} alt="" fill priority sizes="50vw" className="object-contain" />}
      </div>
      <div className="relative h-full w-1/2">
        {rightUrl && <ProtectedImage src={rightUrl} alt="" fill priority sizes="50vw" className="object-contain" />}
      </div>

      <button onClick={rightAction} aria-label="ناوبری راست" className="absolute inset-y-0 right-0 z-20 w-1/4" />
      <button onClick={leftAction} aria-label="ناوبری چپ" className="absolute inset-y-0 left-0 z-20 w-1/4" />
      <button onClick={onToggleControls} aria-label="نمایش کنترل‌ها" className="absolute inset-y-0 left-1/4 right-1/4 z-10" />

      <div className="pointer-events-none absolute inset-x-0 bottom-24 flex items-center justify-center">
        <span className="text-xs text-white/60">{spreadFirst}{secondUrl ? `–${spreadFirst + 1}` : ""} / {pages.length}</span>
      </div>
    </div>
  );
}