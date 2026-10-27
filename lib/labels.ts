import type { ComicStatus } from "@prisma/client";

export const COMIC_STATUS_LABELS: Record<ComicStatus, string> = {
  ONGOING: "در حال انتشار",
  COMPLETED: "پایان‌یافته",
  HIATUS: "متوقف‌شده",
};