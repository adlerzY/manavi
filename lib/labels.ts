import type { ChapterStatus, ComicApprovalStatus, ComicStatus } from "@prisma/client";

export const COMIC_STATUS_LABELS: Record<ComicStatus, string> = {
  ONGOING: "در حال انتشار",
  COMPLETED: "پایان‌یافته",
  HIATUS: "متوقف‌شده",
};

export const APPROVAL_STATUS_LABELS: Record<ComicApprovalStatus, string> = {
  APPROVED: "منتشرشده",
  PENDING_APPROVAL: "در انتظار تایید",
  NEEDS_CHANGES: "نیاز به اصلاح",
};

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  DRAFT: "پیش‌نویس",
  SCHEDULED: "زمان‌بندی‌شده",
  PENDING_APPROVAL: "در انتظار تایید",
  PUBLISHED: "منتشرشده",
};