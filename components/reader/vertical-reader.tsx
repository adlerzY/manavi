"use client";

import { useEffect, useRef, useState } from "react";
import { PlayCircle, PauseCircle } from "lucide-react";
import { ProtectedImage } from "./protected-image";

interface VerticalReaderProps {
  pages: string[];
  initialPage: number;
  initialScrollFraction: number;
  onProgress: (page: number, scrollFraction: number) => void;
  onPageChange?: (page: number) => void;
  seekToPage?: number | null;
  onToggleControls: () => void;
  controlsVisible: boolean;
}

const SCROLL_SPEEDS = [1, 2, 3, 5, 10];

export function VerticalReader({
  pages,
  initialPage,
  initialScrollFraction,
  onProgress,
  onPageChange,
  seekToPage,
  onToggleControls,
  controlsVisible,
}: VerticalReaderProps) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(1);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const autoScrollFrame = useRef<number | null>(null);
  const hasRestoredRef = useRef(false);
  const scrollFractionRef = useRef(initialScrollFraction);

  useEffect(() => {
    if (hasRestoredRef.current) return;
    const target = pageRefs.current[initialPage - 1];
    if (!target) return;
    hasRestoredRef.current = true;

    const frame = requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const offset = window.scrollY + rect.top + rect.height * initialScrollFraction;
      window.scrollTo(0, offset);
    });

    return () => cancelAnimationFrame(frame);
  }, [initialPage, initialScrollFraction]);

  useEffect(() => {
    if (seekToPage == null) return;
    const target = pageRefs.current[seekToPage - 1];
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [seekToPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const index = Number((visible.target as HTMLElement).dataset.pageIndex);
          if (!Number.isNaN(index)) {
            setCurrentPage(index + 1);
            onPageChange?.(index + 1);
          }
        }
      },
      { threshold: [0.5] }
    );

    pageRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [pages.length, onPageChange]);

  useEffect(() => {
    let frame: number | null = null;

    function handleScroll() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const el = pageRefs.current[currentPage - 1];
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const fraction = rect.height > 0 ? Math.min(1, Math.max(0, -rect.top / rect.height)) : 0;
        scrollFractionRef.current = fraction;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [currentPage]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onProgress(currentPage, scrollFractionRef.current);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [currentPage, onProgress]);

  useEffect(() => {
    const nextIndexes = [currentPage, currentPage + 1, currentPage + 2];
    nextIndexes.forEach((idx) => {
      const url = pages[idx];
      if (!url) return;
      const img = new window.Image();
      img.src = url;
    });
  }, [currentPage, pages]);

  useEffect(() => {
    if (!autoScroll) {
      if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
      return;
    }
    const speed = SCROLL_SPEEDS[speedIndex];
    function step() {
      window.scrollBy(0, speed);
      autoScrollFrame.current = requestAnimationFrame(step);
    }
    autoScrollFrame.current = requestAnimationFrame(step);
    return () => {
      if (autoScrollFrame.current) cancelAnimationFrame(autoScrollFrame.current);
    };
  }, [autoScroll, speedIndex]);

  return (
    <>
      <div onClick={onToggleControls} className="mx-auto flex max-w-2xl flex-col">
        {pages.map((url, index) => (
          <div
            key={url}
            data-page-index={index}
            ref={(el) => {
              pageRefs.current[index] = el;
            }}
            className="relative w-full"
            style={{ contentVisibility: "auto", containIntrinsicSize: "0 1400px" }}
          >
            <ProtectedImage
              src={url}
              alt={`صفحه ${index + 1}`}
              width={800}
              height={1200}
              sizes="(max-width: 768px) 100vw, 700px"
              className="h-auto w-full"
              priority={index < 5}
              loading={index < 5 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>

      <div
        className={`fixed left-4 top-20 z-40 flex flex-col items-center gap-2 transition-opacity duration-200 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setAutoScroll((prev) => !prev);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white"
        >
          {autoScroll ? <PauseCircle size={24} /> : <PlayCircle size={24} />}
        </button>
        {autoScroll && (
          <select
            value={speedIndex}
            onChange={(e) => setSpeedIndex(Number(e.target.value))}
            className="h-10 rounded-md bg-black/80 px-2 text-sm text-white"
          >
            {SCROLL_SPEEDS.map((speed, index) => (
              <option key={speed} value={index} className="bg-neutral-900 text-white">
                {speed}x
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}