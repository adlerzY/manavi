import Link from "next/link";
import type { AgeRating } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { getContinueReading } from "@/lib/continue-reading";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

export async function ContinueReadingSection({ allowedRatings }: { allowedRatings: AgeRating[] }) {
  const user = await getSessionUser();
  if (!user) return null;

  const items = await getContinueReading(user.id, allowedRatings);
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 pt-6">
      <h2 className="mb-3 text-base font-medium text-text-main">ادامه مطالعه</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <Link
            key={item.comicId}
            href={`/app/read/${item.chapterId}`}
            className="flex w-72 flex-shrink-0 items-center gap-3 rounded-xl border border-border bg-surface p-3"
          >
            <div
              className="relative h-20 w-14 flex-shrink-0 overflow-hidden rounded-md"
              style={{ backgroundColor: item.dominantColor ?? "#1E1E1E" }}
            >
              <SafeCoverImage src={item.coverImage} alt={item.title} fill sizes="56px" className="object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-main">{item.title}</p>
              <p className="mt-1 text-xs text-text-muted">
                چپتر {item.chapterNumber.toLocaleString("fa-IR")} · صفحه {item.page.toLocaleString("fa-IR")} از{" "}
                {item.totalPages.toLocaleString("fa-IR")}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}