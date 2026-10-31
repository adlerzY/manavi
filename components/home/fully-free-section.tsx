import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { FullyFreeComic } from "@/lib/free-feed";
import { HomeComicCard } from "@/components/catalog/home-comic-card";

export function FullyFreeSection({ comics }: { comics: FullyFreeComic[] }) {
  if (comics.length === 0) return null;

  return (
    <section className="mx-auto max-w-4xl px-4 py-5">
      <div
        className="relative overflow-hidden rounded-3xl border border-primary/25 p-4"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(0,220,100,0.16), rgba(236,72,153,0.07) 55%, transparent)",
        }}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-text-main">
              تمام رایگان
              <span className="rounded-full bg-gradient-to-l from-lime-300 to-primary px-2 py-0.5 text-[10px] font-bold text-black">
                ۰ سکه
              </span>
            </h2>
            <p className="mt-1 text-xs leading-6 text-text-muted">همه‌ی چپترهاشون بدون پرداخت باز می‌شن</p>
          </div>
          <Link href="/app/free" className="flex flex-shrink-0 items-center gap-1 text-xs text-primary">
            همه
            <ChevronLeft size={14} />
          </Link>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-1">
          {comics.map((comic) => (
            <div key={comic.id} className="w-28 flex-shrink-0 sm:w-32">
              <HomeComicCard
                slug={comic.slug}
                title={comic.title}
                coverImage={comic.coverImage}
                latestChapter={comic.latestChapter}
                completed={comic.completed}
                isFree
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}