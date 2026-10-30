import Link from "next/link";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

interface HomeComicCardProps {
  slug: string;
  title: string;
  coverImage: string;
  latestChapter: number | null;
  priority?: boolean;
  completed?: boolean;
  href?: string;
  progress?: number | null;
  badgeLabel?: string;
  isFree?: boolean;
}

export function HomeComicCard({
  slug,
  title,
  coverImage,
  latestChapter,
  priority = false,
  completed = false,
  href,
  progress = null,
  badgeLabel,
  isFree = false,
}: HomeComicCardProps) {
  const badge = badgeLabel ?? (latestChapter !== null ? `چپتر ${latestChapter}` : null);

  return (
    <Link href={href ?? `/app/comic/${slug}`} className="block">
      <div
        className={`relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface transition-transform active:scale-[0.97] ${
          isFree ? "ring-1 ring-primary/50" : ""
        }`}
      >
        <SafeCoverImage
          src={coverImage}
          alt={title}
          fill
          priority={priority}
          loading={priority ? undefined : "lazy"}
          sizes="(max-width: 768px) 33vw, 200px"
          className="object-cover"
        />
        {badge && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm">
            {badge}
          </span>
        )}
        {(isFree || completed) && (
          <div className="pointer-events-none absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
            {isFree && (
              <span className="rounded-full bg-gradient-to-l from-lime-300 to-primary px-2 py-0.5 text-[10px] font-bold text-black shadow-md shadow-black/40">
                رایگان
              </span>
            )}
            {completed && (
              <span className="rounded-full bg-primary/90 px-2 py-0.5 text-[10px] text-primary-foreground">
                پایان‌یافته
              </span>
            )}
          </div>
        )}
        {progress !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60">
            <div className="h-full bg-primary" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
          </div>
        )}
      </div>
      <p className="mt-1.5 truncate text-xs text-text-main">{title}</p>
    </Link>
  );
}