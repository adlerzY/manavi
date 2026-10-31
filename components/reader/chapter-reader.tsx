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
const SCROLL_HIDE_THRESHOLD_PX = 8;
const SCROLL_TOP_SAFE_ZONE_PX = 60;
const HORIZONTAL_PERSIST_DELAY_MS = 2000;
const READER_AREA_STYLE = { height: "calc(100dvh - var(--tg-content-safe-area-top, 0px) - 3.5rem)" };

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
  const isDesktop = useIsDesktop();
  const direction = readingDirection;
  const { chapterHref, goToChapter, exitToComic } = useReaderNav(comicSlug);

  useImmersiveReading();

  const [controlsVisible, setControlsVisible] = useState(true);
  const [effectiveMode, setEffectiveMode] = useState<ReadingMode>(readingMode);
  const [horizontalPage, setHorizontalPage] = useState(initialPage);
  const [endOpen, setEndOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const lastScrollYRef = useRef(0);
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
  }, [chapterId]);

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

  return (
    <div className="relative min-h-screen bg-black overscroll-none">
      <WatermarkOverlay label={watermarkLabel} />
      <DevToolsGuard />
      {guideOpen && <ReaderGuide open={guideOpen} onClose={handleCloseGuide} />}

      <header
        style={{ paddingTop: "var(--tg-content-safe-area-top, 0px)" }}
        className="relative z-30 border-b border-white/5 bg-black"
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
            onPageChange={setHorizontalPage}
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
            onPageChange={setHorizontalPage}
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
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), var(--tg-safe-area-bottom, 0px))" }}
        className={`fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 bg-black/80 px-4 py-3 backdrop-blur-sm transition-transform duration-200 ${controlsVisible ? "translate-y-0" : "translate-y-full"}`}
      >
        {prevChapterId ? (
          <Link replace href={chapterHref(prevChapterId)} aria-label="چپتر قبلی" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
            <ChevronRight size={20} />
          </Link>
        ) : <div className="w-11 flex-shrink-0" />}

        <select value={chapterId} onChange={(e) => goToChapter(e.target.value)} className="h-11 min-w-0 flex-1 rounded-md bg-white/10 px-3 text-sm text-white">
          {chapterOptionNodes}
        </select>

        {nextChapterId ? (
          <Link replace href={chapterHref(nextChapterId)} aria-label="چپتر بعدی" className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white">
            <ChevronLeft size={20} />
          </Link>
        ) : <div className="w-11 flex-shrink-0" />}

        <button
          type="button"
          onClick={exitToComic}
          aria-label="صفحه اثر"
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-white/10 text-white"
        >
          <BookOpen size={20} />
        </button>
      </div>
    </div>
  );
}