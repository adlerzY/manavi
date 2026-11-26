"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import type { ReadingMode } from "@prisma/client";
import type { ReadingDirection } from "@/lib/reading";
import { updateReadHistory } from "@/app/actions/read-history";
import { getChapterPrefetchUrls } from "@/app/actions/chapter-prefetch";
import { VerticalReader } from "./vertical-reader";
import { HorizontalReader } from "./horizontal-reader";
import { ReadingModeToggle } from "./reading-mode-toggle";
import { EndOfChapter } from "./end-of-chapter";
import { WatermarkOverlay } from "./watermark-overlay";
import { DevToolsGuard } from "./dev-tools-guard";
import { BackButton } from "@/components/navigation/back-button";
import { getStoredReadingModeOverride, setStoredReadingModeOverride } from "@/lib/reading";
import { hasSeenGuide, markGuideSeen } from "@/lib/guide";
import { useReaderNav } from "@/lib/client/reader-nav";
import type { StaffCreditItem } from "./chapter-staff-credits";

const DoublePageReader = dynamic(() => import("./double-page-reader").then((module) => module.DoublePageReader));
const ReaderGuide = dynamic(() => import("./reader-guide").then((module) => module.ReaderGuide), { ssr: false });

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
const TOUCH_HIDE_THRESHOLD_PX = 10;
const WHEEL_HIDE_THRESHOLD_PX = 4;
const HORIZONTAL_PERSIST_DELAY_MS = 2000;
const READER_AREA_STYLE = { height: "100dvh" };
const HEADER_SPACE_STYLE = { height: "calc(3.5rem + var(--tg-content-safe-area-top, 0px))" };
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);

function panelClass(visible: boolean, hiddenTransform: string): string {
  return `transition-[transform,opacity] duration-300 ease-out ${
    visible ? "translate-y-0 opacity-100" : `${hiddenTransform} pointer-events-none opacity-0`
  }`;
}

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
  }, []);
}

export function ChapterReader({
  chapterId, comicId, comicSlug, comicTitle, readingDirection, chapterNumber, pages, readingMode,
  prevChapterId, nextChapterId, chapterOptions, initialPage, initialScrollFraction,
  reactionSummary, initialUserReaction, isAuthenticated, watermarkLabel, showAd, staffCredits,
}: ChapterReaderProps) {
  const isDesktop = useIsDesktop();
  const direction = readingDirection;
  const isRtlReading = direction === "rtl";
  const { chapterHref, goToChapter, exitToComic } = useReaderNav(comicSlug);

  useImmersiveReading();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [effectiveMode, setEffectiveMode] = useState<ReadingMode>(readingMode);
  const [horizontalPage, setHorizontalPage] = useState(initialPage);
  const [endOpen, setEndOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const prefetchedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hasSeenGuide("reader")) setGuideOpen(true);
  }, []);

  function handleCloseGuide() {
    markGuideSeen("reader");
    setGuideOpen(false);
  }

  useEffect(() => {
    setEndOpen(false);
    setControlsVisible(true);
  }, [chapterId]);

  useEffect(() => {
    const stored = getStoredReadingModeOverride(comicId);
    if (stored) setEffectiveMode(stored);
  }, [comicId]);

  useEffect(() => {
    let startY: number | null = null;

    function hide() {
      setControlsVisible(false);
    }
    function onTouchStart(event: TouchEvent) {
      startY = event.touches[0]?.clientY ?? null;
    }
    function onTouchMove(event: TouchEvent) {
      if (startY === null) return;
      const y = event.touches[0]?.clientY ?? startY;
      if (Math.abs(y - startY) > TOUCH_HIDE_THRESHOLD_PX) {
        startY = null;
        hide();
      }
    }
    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) > WHEEL_HIDE_THRESHOLD_PX) hide();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (SCROLL_KEYS.has(event.key)) hide();
    }

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const renderMode: ReadingMode = effectiveMode === "DOUBLE_PAGE" && !isDesktop ? "HORIZONTAL" : effectiveMode;

  const prefetchNextChapter = useCallback(
    (currentPage: number) => {
      if (!nextChapterId || pages.length === 0) return;
      if (prefetchedForRef.current === nextChapterId) return;
      if (pages.length - currentPage > 2) return;

      prefetchedForRef.current = nextChapterId;
      getChapterPrefetchUrls(nextChapterId)
        .then((urls) => {
          urls.forEach((url) => {
            const img = new window.Image();
            img.src = url;
          });
        })
        .catch(() => {});
    },
    [nextChapterId, pages.length]
  );

  useEffect(() => {
    if (renderMode === "VERTICAL") return;
    prefetchNextChapter(horizontalPage);
  }, [renderMode, horizontalPage, prefetchNextChapter]);

  const toggleControls = useCallback(() => setControlsVisible((prev) => !prev), []);

  const handlePageChange = useCallback((page: number) => {
    setHorizontalPage(page);
    setControlsVisible(false);
  }, []);

  function handleModeChange(mode: ReadingMode) {
    setEffectiveMode(mode);
    setEndOpen(false);
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
    const timeout = setTimeout(() => persistProgress(horizontalPage, 0), HORIZONTAL_PERSIST_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [renderMode, horizontalPage, persistProgress]);

  const onRequestPrevChapter = useCallback(() => {
    if (prevChapterId) goToChapter(prevChapterId);
  }, [prevChapterId, goToChapter]);

  const onRequestEnd = useCallback(() => setEndOpen(true), []);

  const chapterOptionNodes = useMemo(
    () =>
      chapterOptions.map((option) => (
        <option key={option.id} value={option.id} className="bg-neutral-900 text-white">
          چپتر {option.chapterNumber.toLocaleString("fa-IR")}{option.title ? ` — ${option.title}` : ""}
        </option>
      )),
    [chapterOptions]
  );

  const prevControl = prevChapterId ? (
    <Link
      replace
      href={chapterHref(prevChapterId)}
      aria-label="چپتر قبلی"
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white"
    >
      {isRtlReading ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
    </Link>
  ) : (
    <div className="w-11 flex-shrink-0" />
  );

  const nextControl = nextChapterId ? (
    <Link
      replace
      href={chapterHref(nextChapterId)}
      aria-label="چپتر بعدی"
      className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white"
    >
      {isRtlReading ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
    </Link>
  ) : (
    <div className="w-11 flex-shrink-0" />
  );

  return (
    <div className="relative min-h-screen bg-black overscroll-none">
      <WatermarkOverlay label={watermarkLabel} />
      <DevToolsGuard />
      {guideOpen && <ReaderGuide open={guideOpen} onClose={handleCloseGuide} />}

      <header
        style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
        className={`fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-black/90 backdrop-blur-sm ${panelClass(controlsVisible, "-translate-y-full")}`}
      >
        <div className="flex h-14 items-center justify-between gap-2 px-2">
          <BackButton fallbackHref={`/app/comic/${comicSlug}`} variant="reader" onBack={exitToComic} />
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-medium text-white">{comicTitle}</p>
            <p className="text-xs text-white/60">چپتر {chapterNumber.toLocaleString("fa-IR")}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setGuideOpen(true)}
              aria-label="راهنمای ریدر"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white/70"
            >
              <Info size={18} />
            </button>
            <ReadingModeToggle mode={effectiveMode} onChange={handleModeChange} />
          </div>
        </div>
      </header>

      {renderMode === "VERTICAL" && <div aria-hidden style={HEADER_SPACE_STYLE} />}

      {renderMode === "VERTICAL" && (
        <VerticalReader
          pages={pages}
          initialPage={initialPage}
          initialScrollFraction={initialScrollFraction}
          onProgress={persistProgress}
          onPageChange={prefetchNextChapter}
          seekToPage={null}
          onToggleControls={toggleControls}
          controlsVisible={controlsVisible}
        />
      )}

      {renderMode === "HORIZONTAL" && (
        <div style={READER_AREA_STYLE}>
          <HorizontalReader
            pages={pages}
            currentPage={horizontalPage}
            direction={direction}
            onPageChange={handlePageChange}
            onRequestPrevChapter={onRequestPrevChapter}
            onRequestNextChapter={onRequestEnd}
            hasPrevChapter={Boolean(prevChapterId)}
            hasNextChapter
            onToggleControls={toggleControls}
          />
        </div>
      )}

      {renderMode === "DOUBLE_PAGE" && (
        <div style={READER_AREA_STYLE}>
          <DoublePageReader
            pages={pages}
            currentPage={horizontalPage}
            direction={direction}
            onPageChange={handlePageChange}
            onRequestPrevChapter={onRequestPrevChapter}
            onRequestNextChapter={onRequestEnd}
            hasPrevChapter={Boolean(prevChapterId)}
            hasNextChapter
            onToggleControls={toggleControls}
          />
        </div>
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

      {renderMode !== "VERTICAL" && endOpen && (
        <div
          style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black"
        >
          <div className="flex justify-start px-2 py-3">
            <button
              type="button"
              onClick={() => setEndOpen(false)}
              aria-label="بازگشت به خواندن"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X size={20} />
            </button>
          </div>
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
        </div>
      )}

      <div
        dir="ltr"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))" }}
        className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 bg-black/90 px-4 py-3 backdrop-blur-sm ${panelClass(controlsVisible, "translate-y-full")}`}
      >
        <button
          type="button"
          onClick={exitToComic}
          aria-label="صفحه اثر"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white"
        >
          <BookOpen size={20} />
        </button>

        {isRtlReading ? nextControl : prevControl}

        <select
          dir="rtl"
          value={chapterId}
          onChange={(e) => goToChapter(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md bg-white/10 px-3 text-sm text-white"
        >
          {chapterOptionNodes}
        </select>

        {isRtlReading ? prevControl : nextControl}
      </div>
    </div>
  );
}