import type { ChapterAccessType } from "@prisma/client";

export interface ChapterAccessInfo {
  id: string;
  chapterNumber: number;
  title: string | null;
  publishedAt: Date | null;
  manuallyLocked: boolean;
  locked: boolean;
  accessType: ChapterAccessType;
}

export const CHAPTER_ACCESS_TYPE_OPTIONS: { value: ChapterAccessType; label: string }[] = [
  { value: "FREE" as ChapterAccessType, label: "رایگان (پیش‌فرض)" },
  { value: "COIN" as ChapterAccessType, label: "سکه‌ای" },
];

export const PUBLISHER_CHAPTER_ACCESS_TYPE_OPTIONS = CHAPTER_ACCESS_TYPE_OPTIONS;