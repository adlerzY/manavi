import Link from "next/link";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

interface ComicCardProps {
  slug: string;
  title: string;
  coverImage: string;
  dominantColor: string | null;
  latestChapter: number | null;
  completed?: boolean;
  priority?: boolean;
  readGrey?: boolean;
  rating?: number | null;
}

export function ComicCard({
  slug,
  title,
  coverImage,
  dominantColor,
  latestChapter,
  completed = false,
  priority = false,
  readGrey = false,
  rating = null,
}: ComicCardProps) {
  return (
    <Link href={`/app/comic/${slug}`} className="group block">
      <div className={`relative aspect-[2/3] w-full overflow-hidden rounded-md bg-surface ${readGrey ? "opacity-60" : ""}`}>
        <SafeCoverImage
          src={coverImage}
          alt={title}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(max-width: 768px) 50vw, 220px"
          className="object-cover transition-transform duration-200 group-hover:scale-105"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-2/3"
          style={{ backgroundImage: `linear-gradient(to top, ${dominantColor ?? "#000000"}, transparent)` }}
        />
        {completed && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-xs text-primary-foreground">
            پایان‌یافته
          </span>
        )}
        {rating ? (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            ★ {rating.toLocaleString("fa-IR", { maximumFractionDigits: 1 })}
          </span>
        ) : null}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <p className="truncate text-sm font-medium text-white drop-shadow-sm">{title}</p>
          {latestChapter !== null && <p className="text-xs text-white/80 drop-shadow-sm">چپتر {latestChapter}</p>}
        </div>
      </div>
    </Link>
  );
}