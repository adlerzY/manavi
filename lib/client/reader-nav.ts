"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readHref } from "@/lib/reader-links";

export function useReaderNav(comicSlug: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromComic = searchParams.get("from") === "comic";

  const chapterHref = useCallback((chapterId: string) => readHref(chapterId, fromComic), [fromComic]);

  const goToChapter = useCallback(
    (chapterId: string) => router.replace(readHref(chapterId, fromComic)),
    [router, fromComic]
  );

  const exitToComic = useCallback(() => {
    if (fromComic && window.history.length > 1) {
      router.back();
      return;
    }
    router.replace(`/app/comic/${comicSlug}`);
  }, [fromComic, router, comicSlug]);

  return { fromComic, chapterHref, goToChapter, exitToComic };
}