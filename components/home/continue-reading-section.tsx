import type { AgeRating } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { getContinueReading } from "@/lib/continue-reading";
import { HomeComicCard } from "@/components/catalog/home-comic-card";

export async function ContinueReadingSection({ allowedRatings }: { allowedRatings: AgeRating[] }) {
  const user = await getSessionUser();
  if (!user) return null;

  const items = await getContinueReading(user.id, allowedRatings);
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 pb-2">
      <h2 className="mb-3 text-base font-medium text-text-main">ادامه مطالعه</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {items.map((item) => (
          <div key={item.comicId} className="w-28 flex-shrink-0 sm:w-32">
            <HomeComicCard
              slug={item.slug}
              title={item.title}
              coverImage={item.coverImage}
              latestChapter={item.chapterNumber}
              href={`/app/comic/${item.slug}?tab=episodes`}
              progress={item.progress}
              badgeLabel={`ادامه · چپتر ${item.chapterNumber.toLocaleString("fa-IR")}`}
            />
          </div>
        ))}
      </div>
    </section>
  );
}