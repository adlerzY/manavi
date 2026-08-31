"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReadingMode } from "@prisma/client";
import type { ReadingDirection } from "@/lib/reading";
import { updateReadHistory } from "@/app/actions/read-history";
import { getChapterPrefetchUrls } from "@/app/actions/chapter-prefetch";
import { VerticalReader } from "./vertical-reader";
import { HorizontalReader } from "./horizontal-reader";
import { DoublePageReader } from "./double-page-reader";
import { ReadingModeToggle } from "./reading-mode-toggle";
import { EndOfChapter } from "./end-of-chapter";
import { WatermarkOverlay } from "./watermark-overlay";
import { DevToolsGuard } from "./dev-tools-guard";
import { BackButton } from "@/components/navigation/back-button";
import { getStoredReadingModeOverride, setStoredReadingModeOverride } from "@/lib/reading";
import type { StaffCreditItem } from "./chapter-staff-credits";

interface ChapterOption { id: string; chapterNumber: number; title: string | null }
interface ReactionSummary { emoji: string; count: number }

interface ChapterReaderProps {
  chapterId: string;
  comicId: string;
  comicSlug: string;
  comicTitle: string;
  readingDirection: ReadingDirection;
  chapterNumber: number;
  pages: string[];
  readingMode: ReadingMode;
  prevChapterId: string | null;
  nextChapterId: string | null;
  chapterOptions: ChapterOption[];
  initialPage: number;
  initialScrollFraction: number;
  reactionSummary: ReactionSummary[];
  initialUserReaction: string | null;
  isAuthenticated: boolean;
  watermarkLabel?: string | null;
  showAd: boolean;
  staffCredits: StaffCreditItem[];
}

const DESKTOP_BREAKPOINT_PX = 768;
const SCROLL_HIDE_THRESHOLD_PX = 8;
const SCROLL_TOP_SAFE_ZONE_PX = 60;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT_PX}px)`);
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

function useImmersiveReading() {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    try {
      webApp?.expand?.();
      webApp?.disableVerticalSwipes?.();
    } catch {}

    const root = document.documentElement;
    const canRequestFullscreen = !webApp && typeof root.requestFullscreen === "function";
    if (canRequestFullscreen) {
      root.requestFullscreen().catch(() => {});
    }

    return () => {
      try {
        webApp?.enableVerticalSwipes?.();
      } catch {}
      if (canRequestFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);
}

export function ChapterReader({
  chapterId, comicId, comicSlug, comicTitle, readingDirection, chapterNumber, pages, readingMode,
  prevChapterId, nextChapterId, chapterOptions, initialPage, initialScrollFraction,
  reactionSummary, initialUserReaction, isAuthenticated, watermarkLabel, showAd, staffCredits,
}: ChapterReaderProps) {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const direction = readingDirection;

  useImmersiveReading();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [effectiveMode, setEffectiveMode] = useState<ReadingMode>(readingMode);
  const [horizontalPage, setHorizontalPage] = useState(initialPage);
  const [verticalCurrentPage, setVerticalCurrentPage] = useState(initialPage);
  const lastScrollYRef = useRef(0);
  const nextChapterPrefetchedRef = useRef(false);

  useEffect(() => {
    const stored = getStoredReadingModeOverride(comicId);
    if (stored) setEffectiveMode(stored);
  }, [comicId]);

  useEffect(() => {
    lastScrollYRef.current = window.scrollY;
    let ticking = false;

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollYRef.current;

        if (currentY <= SCROLL_TOP_SAFE_ZONE_PX) {
          setControlsVisible(true);
        } else if (delta > SCROLL_HIDE_THRESHOLD_PX) {
          setControlsVisible(false);
        } else if (delta < -SCROLL_HIDE_THRESHOLD_PX) {
          setControlsVisible(true);
        }

        lastScrollYRef.current = currentY;
        ticking = false;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const renderMode: ReadingMode = effectiveMode === "DOUBLE_PAGE" && !isDesktop ? "HORIZONTAL" : effectiveMode;

  useEffect(() => {
    if (!nextChapterId || nextChapterPrefetchedRef.current || pages.length === 0) return;
    const currentPage = renderMode === "VERTICAL" ? verticalCurrentPage : horizontalPage;
    const remaining = pages.length - currentPage;
    if (remaining > 2) return;

    nextChapterPrefetchedRef.current = true;
    getChapterPrefetchUrls(nextChapterId)
      .then((urls) => {
        urls.forEach((url) => {
          const img = new window.Image();
          img.src = url;
        });
      })
      .catch(() => {});
  }, [renderMode, verticalCurrentPage, horizontalPage, pages.length, nextChapterId]);

  const toggleControls = useCallback(() => setControlsVisible((prev) => !prev), []);

  function handleModeChange(mode: ReadingMode) {
    setEffectiveMode(mode);
    setStoredReadingModeOverride(comicId, mode);
  }

  const persistProgress = useCallback(
    (page: number, fraction: number) => {
      updateReadHistory(comicId, chapterId, page, fraction).catch(() => {});
    },
    [comicId, chapterId]
  );

  useEffect(() => {
    if (renderMode === "VERTICAL") return;
    const timeout = setTimeout(() => persistProgress(horizontalPage, 0), 1200);
    return () => clearTimeout(timeout);
  }, [renderMode, horizontalPage, persistProgress]);

  const onRequestPrevChapter = () => prevChapterId && router.push(`/app/read/${prevChapterId}`);
  const onRequestNextChapter = () => nextChapterId && router.push(`/app/read/${nextChapterId}`);

  return (
    <div className="relative min-h-screen bg-black overscroll-none">
      <WatermarkOverlay label={watermarkLabel} />
      <DevToolsGuard />

      <div
        style={{ top: "var(--tg-content-safe-area-top, 0px)" }}
        className={`fixed inset-x-0 z-40 flex items-center justify-between bg-black/80 px-2 py-3 backdrop-blur-sm transition-transform duration-200 ${controlsVisible ? "translate-y-0" : "-translate-y-full"}`}
      >
        <BackButton fallbackHref={`/app/comic/${comicSlug}`} variant="reader" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">{comicTitle}</p>
          <p className="text-xs text-white/60">چپتر {chapterNumber}</p>
        </div>
        <ReadingModeToggle mode={effectiveMode} onChange={handleModeChange} />
      </div>

      {renderMode === "VERTICAL" && (
        <VerticalReader
          pages={pages}
          initialPage={initialPage}
          initialScrollFraction={initialScrollFraction}
          onProgress={persistProgress}
          onPageChange={setVerticalCurrentPage}
          seekToPage={null}
          onToggleControls={toggleControls}
          controlsVisible={controlsVisible}
        />
      )}

      {renderMode === "HORIZONTAL" && (
        <HorizontalReader
          pages={pages}
          currentPage={horizontalPage}
          direction={direction}
          onPageChange={setHorizontalPage}
          onRequestPrevChapter={onRequestPrevChapter}
          onRequestNextChapter={onRequestNextChapter}
          hasPrevChapter={Boolean(prevChapterId)}
          hasNextChapter={Boolean(nextChapterId)}
          onToggleControls={toggleControls}
        />
      )}

      {renderMode === "DOUBLE_PAGE" && (
        <DoublePageReader
          pages={pages}
          currentPage={horizontalPage}
          direction={direction}
          onPageChange={setHorizontalPage}
          onRequestPrevChapter={onRequestPrevChapter}
          onRequestNextChapter={onRequestNextChapter}
          hasPrevChapter={Boolean(prevChapterId)}
          hasNextChapter={Boolean(nextChapterId)}
          onToggleControls={toggleControls}
        />
      )}

      {renderMode === "VERTICAL" && (
        <EndOfChapter
          chapterId={chapterId}
          comicSlug={comicSlug}
          nextChapterId={nextChapterId}
          reactionSummary={reactionSummary}
          initialUserReaction={initialUserReaction}
          isAuthenticated={isAuthenticated}
          showAd={showAd}
          staffCredits={staffCredits}
        />
      )}

      <div
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))" }}
        className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 bg-black/80 px-4 py-3 backdrop-blur-sm transition-transform duration-200 ${controlsVisible ? "translate-y-0" : "translate-y-full"}`}
      >
        {prevChapterId ? (
          <Link href={`/app/read/${prevChapterId}`} className="rounded-md bg-white/10 p-2 text-white"><ChevronRight size={20} /></Link>
        ) : <div className="w-9" />}

        <select value={chapterId} onChange={(e) => router.push(`/app/read/${e.target.value}`)} className="flex-1 rounded-md bg-white/10 px-2 py-2 text-sm text-white">
          {chapterOptions.map((option) => (
            <option key={option.id} value={option.id} className="bg-neutral-900 text-white">چپتر {option.chapterNumber}{option.title ? ` — ${option.title}` : ""}</option>
          ))}
        </select>

        {nextChapterId ? (
          <Link href={`/app/read/${nextChapterId}`} className="rounded-md bg-white/10 p-2 text-white"><ChevronLeft size={20} /></Link>
        ) : <div className="w-9" />}
      </div>
    </div>
  );
}