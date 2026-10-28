import Link from "next/link";
import type { ComicApprovalStatus, ComicStatus } from "@prisma/client";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import { APPROVAL_STATUS_LABELS, COMIC_STATUS_LABELS } from "@/lib/labels";

interface PublisherComicRowProps {
  id: string;
  title: string;
  coverImage: string;
  dominantColor: string | null;
  approvalStatus: ComicApprovalStatus;
  comicStatus: ComicStatus;
  licenseLabel: string;
  publishedCount: number;
  totalCount: number;
  pendingCount: number;
  lastPublishedAt: Date | null;
}

const APPROVAL_CLASSES: Record<ComicApprovalStatus, string> = {
  APPROVED: "bg-primary/10 text-primary",
  PENDING_APPROVAL: "bg-accent/10 text-accent",
  NEEDS_CHANGES: "bg-red-500/10 text-red-400",
};

export function PublisherComicRow({
  id,
  title,
  coverImage,
  dominantColor,
  approvalStatus,
  comicStatus,
  licenseLabel,
  publishedCount,
  totalCount,
  pendingCount,
  lastPublishedAt,
}: PublisherComicRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3">
      <Link href={`/publisher/comics/${id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className="relative h-24 w-16 flex-shrink-0 overflow-hidden rounded-md"
          style={{ backgroundColor: dominantColor ?? "#1E1E1E" }}
        >
          <SafeCoverImage src={coverImage} alt={title} fill sizes="64px" className="object-cover" />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="truncate text-sm font-medium text-text-main">{title}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-1 text-xs ${APPROVAL_CLASSES[approvalStatus]}`}>
              {APPROVAL_STATUS_LABELS[approvalStatus]}
            </span>
            <span className="rounded-full bg-background px-2.5 py-1 text-xs text-text-muted">{COMIC_STATUS_LABELS[comicStatus]}</span>
            <span className="rounded-full bg-background px-2.5 py-1 text-xs text-text-muted">لایسنس: {licenseLabel}</span>
          </div>
          <p className="text-xs leading-6 text-text-muted">
            {publishedCount.toLocaleString("fa-IR")} چپتر منتشرشده از {totalCount.toLocaleString("fa-IR")}
            {pendingCount > 0 && ` · ${pendingCount.toLocaleString("fa-IR")} در انتظار تایید`}
            {lastPublishedAt
              ? ` · آخرین انتشار ${lastPublishedAt.toLocaleDateString("fa-IR")}`
              : " · هنوز چپتری منتشر نشده"}
          </p>
        </div>
      </Link>
      <Link
        href={`/publisher/comics/${id}?tab=chapters&upload=1`}
        className="flex min-h-11 flex-shrink-0 items-center rounded-md border border-primary px-3 text-xs text-primary"
      >
        آپلود چپتر
      </Link>
    </div>
  );
}