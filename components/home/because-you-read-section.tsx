import Link from "next/link";
import type { AgeRating } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { getBecauseYouRead } from "@/lib/recommendations";
import { HomeComicCard } from "@/components/catalog/home-comic-card";

export async function BecauseYouReadAsync({ allowedRatings }: { allowedRatings: AgeRating[] }) {
  const user = await getSessionUser();
  if (!user) return null;

  const data = await getBecauseYouRead(user.id, allowedRatings);
  if (!data) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <h2 className="mb-3 text-base font-medium text-text-main">
        چون{" "}
        <Link href={`/app/comic/${data.sourceSlug}`} className="text-primary">
          «{data.sourceTitle}»
        </Link>{" "}
        را خواندید
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {data.comics.map((comic) => (
          <div key={comic.id} className="w-28 flex-shrink-0 sm:w-32">
            <HomeComicCard
              slug={comic.slug}
              title={comic.title}
              coverImage={comic.coverImage}
              latestChapter={comic.latestChapter}
              completed={comic.completed}
            />
          </div>
        ))}
      </div>
    </section>
  );
}