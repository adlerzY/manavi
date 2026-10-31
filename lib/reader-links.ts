const COMIC_ORIGIN_QUERY = "from=comic";

export function readHref(chapterId: string, fromComic = false): string {
  return fromComic ? `/app/read/${chapterId}?${COMIC_ORIGIN_QUERY}` : `/app/read/${chapterId}`;
}

export function comicReadHref(chapterId: string): string {
  return readHref(chapterId, true);
}