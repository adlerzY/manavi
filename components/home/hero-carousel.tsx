"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { SafeCoverImage } from "@/components/ui/safe-cover-image";

interface HeroComic {
  id: string;
  title: string;
  slug: string;
  description: string;
  coverImage: string;
  dominantColor: string | null;
  featuredBadge: string | null;
}

const ROTATE_INTERVAL_MS = 6000;

export function HeroCarousel({ comics }: { comics: HeroComic[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState<number[]>([0]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (comics.length === 0) return;
    setMounted((prev) => {
      const missing = [index, (index + 1) % comics.length].filter((i) => !prev.includes(i));
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
  }, [index, comics.length]);

  const autoplay = comics.length > 1 && !paused && !hovered && !reduceMotion;

  useEffect(() => {
    if (!autoplay) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % comics.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoplay, comics.length, index]);

  if (comics.length === 0) return null;

  const active = comics[index] ?? comics[0];

  return (
    <section
      className="px-4 pb-10 pt-8 transition-colors duration-700"
      style={{ backgroundImage: `linear-gradient(to bottom, ${active.dominantColor ?? "#1E1E1E"}, #121212 85%)` }}
    >
      <div
        className="relative mx-auto max-w-4xl overflow-hidden rounded-2xl"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="relative aspect-[16/9] w-full sm:aspect-[21/9]">
          {comics.map((comic, i) => (
            <div
              key={comic.id}
              aria-hidden={i !== index}
              className={`absolute inset-0 transition-opacity duration-700 ${i === index ? "opacity-100" : "pointer-events-none opacity-0"}`}
            >
              {mounted.includes(i) && (
                <SafeCoverImage
                  src={comic.coverImage}
                  alt={comic.title}
                  fill
                  priority={i === 0}
                  sizes="(max-width: 768px) 100vw, 900px"
                  className="object-cover"
                />
              )}
              <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.1) 60%)" }} />
              <div className="absolute inset-x-0 bottom-0 p-5">
                {comic.featuredBadge && (
                  <span className="mb-2 inline-block rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">{comic.featuredBadge}</span>
                )}
                <h1 className="text-xl font-semibold text-white sm:text-2xl">{comic.title}</h1>
                <p className="mt-1 line-clamp-2 max-w-md text-xs text-white/70 sm:text-sm">{comic.description}</p>
                <Link href={`/app/comic/${comic.slug}`} className="mt-3 inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                  مشاهده عنوان
                </Link>
              </div>
            </div>
          ))}
        </div>

        {comics.length > 1 && (
          <>
            <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
              {comics.map((comic, i) => (
                <button
                  key={comic.id}
                  onClick={() => setIndex(i)}
                  aria-label={`نمایش ${comic.title}`}
                  className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-primary" : "w-2 bg-white/40"}`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPaused((prev) => !prev)}
              aria-label={paused ? "پخش خودکار اسلایدر" : "توقف اسلایدر"}
              className="absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          </>
        )}
      </div>
    </section>
  );
}