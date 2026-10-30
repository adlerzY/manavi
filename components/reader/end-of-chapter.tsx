"use client";

import Link from "next/link";
import { ChapterReactions } from "./chapter-reactions";
import { ChapterAdSlot } from "./chapter-ad-slot";
import { ChapterStaffCredits, type StaffCreditItem } from "./chapter-staff-credits";
import { ReportButton } from "@/components/catalog/report-button";

interface ReactionSummary { emoji: string; count: number }

interface EndOfChapterProps {
  chapterId: string;
  comicSlug: string;
  nextChapterId: string | null;
  reactionSummary: ReactionSummary[];
  initialUserReaction: string | null;
  isAuthenticated: boolean;
  showAd: boolean;
  staffCredits: StaffCreditItem[];
}

export function EndOfChapter({
  chapterId,
  comicSlug,
  nextChapterId,
  reactionSummary,
  initialUserReaction,
  isAuthenticated,
  showAd,
  staffCredits,
}: EndOfChapterProps) {
  return (
    <div className="border-t border-white/10 bg-black pb-8 pt-4">
      <p className="text-center text-xs text-white/50">پایان چپتر</p>
      <ChapterReactions
        chapterId={chapterId}
        initialSummary={reactionSummary}
        initialUserReaction={initialUserReaction}
        isAuthenticated={isAuthenticated}
      />

      {showAd && <ChapterAdSlot />}

      <div className="mx-auto mt-4 flex max-w-2xl flex-col gap-1 px-4">
        {nextChapterId ? (
          <Link
            href={`/app/read/${nextChapterId}`}
            className="rounded-md bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground"
          >
            چپتر بعدی
          </Link>
        ) : (
          <p className="rounded-md border border-border py-3 text-center text-sm text-white/60">این آخرین چپتر منتشرشده است</p>
        )}
        <Link href={`/app/comic/${comicSlug}`} className="py-3 text-center text-sm text-white/70">
          بازگشت به صفحه اثر
        </Link>
      </div>

      <ChapterStaffCredits staff={staffCredits} isAuthenticated={isAuthenticated} />

      {isAuthenticated && (
        <div className="mt-3 flex justify-center">
          <ReportButton targetType="EDITION_CHAPTER" targetId={chapterId} label="گزارش مشکل این چپتر" />
        </div>
      )}
    </div>
  );
}