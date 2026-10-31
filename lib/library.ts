import "server-only";
import { Prisma } from "@prisma/client";
import type { AgeRating, ComicStatus } from "@prisma/client";
import { prisma } from "./prisma";

export interface LibraryEntry {
  comicId: string;
  slug: string;
  title: string;
  coverImage: string;
  dominantColor: string | null;
  status: ComicStatus;
  chapterId: string | null;
  chapterNumber: number | null;
  progress: number | null;
  latestChapter: number | null;
  hasNew: boolean;
}

export interface Library {
  reading: LibraryEntry[];
  bookmarks: LibraryEntry[];
  finished: LibraryEntry[];
}

const HISTORY_LIMIT = 100;
const BOOKMARK_LIMIT = 200;

const COMIC_SELECT = {
  id: true,
  slug: true,
  title: true,
  coverImage: true,
  dominantColor: true,
  status: true,
} as const;

export async function getLibrary(userId: string, allowedRatings: AgeRating[]): Promise<Library> {
  const comicFilter = { ageRating: { in: allowedRatings }, approvalStatus: "APPROVED" as const };

  const [history, bookmarks] = await Promise.all([
    prisma.readHistory.findMany({
      where: { userId, comic: comicFilter },
      orderBy: { updatedAt: "desc" },
      take: HISTORY_LIMIT,
      select: { comicId: true, lastChapterId: true, lastPage: true, comic: { select: COMIC_SELECT } },
    }),
    prisma.bookmark.findMany({
      where: { userId, comic: comicFilter },
      orderBy: { createdAt: "desc" },
      take: BOOKMARK_LIMIT,
      select: { comic: { select: COMIC_SELECT } },
    }),
  ]);

  const comicIds = [...new Set([...history.map((h) => h.comicId), ...bookmarks.map((b) => b.comic.id)])];
  if (comicIds.length === 0) return { reading: [], bookmarks: [], finished: [] };

  type LastChapterRow = { id: string; chapterNumber: number; pageCount: number };

  const [lastChapters, latestRows] = await Promise.all([
    history.length > 0
      ? prisma.$queryRaw<LastChapterRow[]>`
          SELECT "id", "chapterNumber", COALESCE(cardinality("pages"), 0)::int AS "pageCount"
          FROM "Chapter"
          WHERE "id" IN (${Prisma.join(history.map((entry) => entry.lastChapterId))})`
      : Promise.resolve<LastChapterRow[]>([]),
    prisma.chapter.groupBy({
      by: ["comicId"],
      where: { comicId: { in: comicIds }, publishedAt: { not: null } },
      _max: { chapterNumber: true },
    }),
  ]);

  const chapterById = new Map(lastChapters.map((chapter) => [chapter.id, chapter]));
  const latestByComic = new Map(latestRows.map((row) => [row.comicId, row._max.chapterNumber]));

  const reading: LibraryEntry[] = [];
  const finished: LibraryEntry[] = [];
  const historyByComic = new Map<string, LibraryEntry>();

  for (const entry of history) {
    const chapter = chapterById.get(entry.lastChapterId);
    const latest = latestByComic.get(entry.comicId) ?? null;
    const lastNumber = chapter ? chapter.chapterNumber : null;
    const totalPages = chapter ? Math.max(1, chapter.pageCount) : 1;
    const page = Math.min(totalPages, Math.max(1, entry.lastPage));

    const item: LibraryEntry = {
      comicId: entry.comic.id,
      slug: entry.comic.slug,
      title: entry.comic.title,
      coverImage: entry.comic.coverImage,
      dominantColor: entry.comic.dominantColor,
      status: entry.comic.status,
      chapterId: chapter ? chapter.id : null,
      chapterNumber: lastNumber,
      progress: chapter ? page / totalPages : null,
      latestChapter: latest,
      hasNew: lastNumber !== null && latest !== null && latest > lastNumber,
    };

    historyByComic.set(entry.comicId, item);

    const isFinished =
      entry.comic.status === "COMPLETED" && lastNumber !== null && latest !== null && lastNumber >= latest;
    if (isFinished) finished.push(item);
    else reading.push(item);
  }

  const bookmarkEntries: LibraryEntry[] = bookmarks.map(({ comic }) => {
    const fromHistory = historyByComic.get(comic.id);
    if (fromHistory) return fromHistory;
    return {
      comicId: comic.id,
      slug: comic.slug,
      title: comic.title,
      coverImage: comic.coverImage,
      dominantColor: comic.dominantColor,
      status: comic.status,
      chapterId: null,
      chapterNumber: null,
      progress: null,
      latestChapter: latestByComic.get(comic.id) ?? null,
      hasNew: false,
    };
  });

  return { reading, bookmarks: bookmarkEntries, finished };
}