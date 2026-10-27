import Link from "next/link";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";
import type { LibraryEntry } from "@/lib/library";

interface LibraryCardProps {
  entry: LibraryEntry;
  href: string;
  priority?: boolean;
}

export function LibraryCard({ entry, href, priority = false }: LibraryCardProps) {
  return (
    <Link href={href} className="block">
      <div
        className="relative aspect-[2/3] w-full overflow-hidden rounded-xl"
        style={{ backgroundColor: entry.dominantColor ?? "#1E1E1E" }}
      >
        <SafeCoverImage
          src={entry.coverImage}
          alt={entry.title}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(max-width: 768px) 33vw, 200px"
          className="object-cover"
        />
        {entry.hasNew && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            چپتر جدید
          </span>
        )}
        {entry.progress !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/60">
            <div className="h-full bg-primary" style={{ width: `${Math.round(entry.progress * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-sm text-text-main">{entry.title}</p>
      <p className="truncate text-xs text-text-muted">
        {entry.chapterNumber !== null
          ? `چپتر ${entry.chapterNumber.toLocaleString("fa-IR")}`
          : entry.latestChapter !== null
          ? `${entry.latestChapter.toLocaleString("fa-IR")} چپتر`
          : "بدون چپتر"}
      </p>
    </Link>
  );
}