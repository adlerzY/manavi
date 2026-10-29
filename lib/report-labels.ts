import type { ReportCategory, ReportStatus, ReportTargetType } from "@prisma/client";

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  TRANSLATION_ERROR: "ترجمه ناقص یا معنای اشتباه",
  BROKEN_IMAGES: "تصاویر خراب یا صفحات ناقص",
  UNLABELED_SPOILER: "اسپویلر بدون برچسب",
  INAPPROPRIATE: "محتوای نامناسب",
  RIGHTS_VIOLATION: "نقض حقوق یا انتشار بدون مجوز",
  MISLEADING_CREDIT: "اطلاعات یا اعتبار گمراه‌کننده",
  BILLING_ACCESS: "مشکل قیمت یا دسترسی",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  OPEN: "باز",
  UNDER_REVIEW: "در حال بررسی",
  ACTION_TAKEN: "اقدام انجام شد",
  REJECTED: "رد شد",
  RESOLVED: "حل شد",
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  EDITION_CHAPTER: "چپتر",
  COMMENT: "نظر",
  EDITION: "نسخه",
  WORK: "اثر",
};