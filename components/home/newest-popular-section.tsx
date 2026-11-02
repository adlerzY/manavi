"use client";

import { useEffect, useState, useTransition } from "react";
import { getHomeFeedComics, type HomeFeedComic } from "@/app/actions/home-feed";
import { HomeComicCard } from "@/components/catalog/home-comic-card";
import { ComicCardSkeletonGrid } from "@/components/catalog/comic-card-skeleton";

interface GenreOption {
  id: string;
  name: string;
}

interface NewestPopularSectionProps {
  initialNewest: HomeFeedComic[];
  initialPopular: HomeFeedComic[];
  genres: GenreOption[];
}

export function NewestPopularSection({ initialNewest, initialPopular, genres }: NewestPopularSectionProps) {
  const [mode, setMode] = useState<"newest" | "popular">("newest");
  const [genreId, setGenreId] = useState<string | null>(null);
  const [comics, setComics] = useState<HomeFeedComic[]>(initialNewest);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (genreId === null) {
      setComics(mode === "newest" ? initialNewest : initialPopular);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const result = await getHomeFeedComics(mode, genreId);
      if (!cancelled) setComics(result);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, genreId, initialNewest, initialPopular]);

  return (
    <section className="mx-auto max-w-4xl px-4 py-6">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setMode("newest")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "newest" ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
          }`}
        >
          جدیدترین‌ها
        </button>
        <button
          onClick={() => setMode("popular")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            mode === "popular" ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
          }`}
        >
          محبوب‌ترین‌ها
        </button>
      </div>

      {genres.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setGenreId(null)}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs ${
              genreId === null ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
            }`}
          >
            همه
          </button>
          {genres.map((genre) => (
            <button
              key={genre.id}
              onClick={() => setGenreId(genre.id)}
              className={`flex-shrink-0 rounded-full px-3 py-1 text-xs ${
                genreId === genre.id ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
              }`}
            >
              {genre.name}
            </button>
          ))}
        </div>
      )}

      {isPending ? (
        <ComicCardSkeletonGrid count={9} />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {comics.map((comic, index) => (
            <HomeComicCard
              key={comic.id}
              slug={comic.slug}
              title={comic.title}
              coverImage={comic.coverImage}
              latestChapter={comic.latestChapter}
              priority={index < 4}
              completed={comic.completed}
            />
          ))}
          {comics.length === 0 && <p className="col-span-full text-sm text-text-muted">موردی یافت نشد.</p>}
        </div>
      )}
    </section>
  );
}