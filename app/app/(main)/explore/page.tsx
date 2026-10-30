import Link from "next/link";
import type { ComicStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ComicCard } from "@/components/catalog/comic-card";
import { PopularGenreCards } from "@/components/catalog/popular-genre-cards";
import { ExploreSearchClient } from "@/components/catalog/explore-search-client";
import { TopSearches } from "@/components/catalog/top-searches";
import { EmptyState } from "@/components/ui/empty-state";
import { Mascot } from "@/components/ui/mascot";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { getAllCategories } from "@/lib/categories";
import { getAllGenres, getPopularGenres } from "@/lib/genres";
import { resolveExploreWhere, fetchExploreComics, parseExploreSort, type ExploreAccess } from "@/lib/explore";
import { languageLabel } from "@/lib/languages";
import { averageScore } from "@/lib/rating";
import { recordSearchTerm, getTopSearchTerms } from "@/app/actions/search";
import { after } from "next/server";

export const revalidate = 60;

const VALID_STATUSES: ComicStatus[] = ["ONGOING", "COMPLETED", "HIATUS"];
const POPULAR_GENRE_LIMIT = 8;
const PAGE_SIZE = 24;

interface PageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    genres?: string;
    status?: string;
    page?: string;
    sort?: string;
    access?: string;
    lang?: string;
  }>;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const {
    q,
    type,
    genres: genresParam,
    status: statusParam,
    page: pageParam,
    sort: sortParam,
    access: accessParam,
    lang: langParam,
  } = await searchParams;

  const genreIds = genresParam ? genresParam.split(",").filter(Boolean) : [];
  const status = statusParam && VALID_STATUSES.includes(statusParam as ComicStatus) ? (statusParam as ComicStatus) : undefined;
  const access: ExploreAccess | undefined = accessParam === "FREE" || accessParam === "COIN" ? accessParam : undefined;
  const language = langParam && /^[a-z]{2,5}$/.test(langParam) ? langParam : undefined;
  const sort = parseExploreSort(sortParam);
  const page = Math.max(1, Number(pageParam) || 1);

  const showingResults = Boolean(q?.trim() || type || genreIds.length > 0 || status || access || language || sortParam);

  if (q?.trim()) {
    after(() => recordSearchTerm(q.trim()));
  }

  const allowedRatings = await getAllowedAgeRatings();
  const exploreWhere = showingResults
    ? await resolveExploreWhere({ q, categorySlug: type, genreIds, status, access, language })
    : null;

  const [categories, allGenres, languageRows, popularGenres, topSearches, comics, total] = await Promise.all([
    getAllCategories(),
    getAllGenres(),
    prisma.edition.findMany({
      where: { status: "ACTIVE" },
      distinct: ["language"],
      select: { language: true },
      orderBy: { language: "asc" },
    }),
    showingResults ? Promise.resolve([]) : getPopularGenres(allowedRatings, POPULAR_GENRE_LIMIT),
    showingResults ? Promise.resolve([]) : getTopSearchTerms(10),
    exploreWhere ? fetchExploreComics(exploreWhere, sort, page, PAGE_SIZE) : Promise.resolve([]),
    exploreWhere ? prisma.comic.count({ where: exploreWhere }) : Promise.resolve(0),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function buildPageHref(nextPage: number): string {
    const qp = new URLSearchParams();
    if (q?.trim()) qp.set("q", q.trim());
    if (type) qp.set("type", type);
    if (genreIds.length > 0) qp.set("genres", genreIds.join(","));
    if (status) qp.set("status", status);
    if (access) qp.set("access", access);
    if (language) qp.set("lang", language);
    if (sortParam) qp.set("sort", sort);
    if (nextPage > 1) qp.set("page", String(nextPage));
    const qs = qp.toString();
    return `/app/explore${qs ? `?${qs}` : ""}`;
  }

  const categoryFilterOptions = categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }));
  const genreFilterOptions = allGenres.map((g) => ({ id: g.id, name: g.name }));
  const languageFilterOptions = languageRows.map((row) => ({ code: row.language, label: languageLabel(row.language) }));

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <ExploreSearchClient categories={categoryFilterOptions} genres={genreFilterOptions} languages={languageFilterOptions} />

        {!showingResults && (
          <div className="mt-6 space-y-8">
            <div
              className="relative overflow-hidden rounded-2xl border border-border p-4"
              style={{ backgroundImage: "linear-gradient(135deg, rgba(0,220,100,0.12), rgba(236,72,153,0.08))" }}
            >
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold text-text-main">دنبال چی می‌گردی؟</h2>
                  <p className="mt-1 text-xs leading-6 text-text-muted">
                    اسم اثر رو جستجو کن یا با فیلترها ژانر، وضعیت و نوع دسترسی رو انتخاب کن.
                  </p>
                  <Link href="/app/free" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary">
                    مشاهده‌ی آثار تمام رایگان
                  </Link>
                </div>
                <Mascot pose="thinking" size={92} float />
              </div>
            </div>

            {popularGenres.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-medium text-text-main">دسته‌بندی‌های داغ</h2>
                <PopularGenreCards genres={popularGenres} />
              </div>
            )}

            {topSearches.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-medium text-text-muted">بیشترین جستجوها</h2>
                <TopSearches terms={topSearches} />
              </div>
            )}
          </div>
        )}

        {showingResults && (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-text-muted">{total.toLocaleString("fa-IR")} نتیجه</p>
              <Link href="/app/explore" className="text-xs text-primary">
                پاک کردن و شروع دوباره
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {comics.map((comic, index) => (
                <ComicCard
                  key={comic.id}
                  slug={comic.slug}
                  title={comic.title}
                  coverImage={comic.coverImage}
                  dominantColor={comic.dominantColor}
                  latestChapter={comic.chapters[0]?.chapterNumber ?? null}
                  completed={comic.status === "COMPLETED"}
                  rating={comic.ratingCount > 0 ? averageScore(comic.ratingTotal, comic.ratingCount) : null}
                  priority={index < 4}
                />
              ))}
              {comics.length === 0 && (
                <div className="col-span-full">
                  <EmptyState
                    pose="thinking"
                    title="چیزی پیدا نشد"
                    description="با این فیلترها اثری نبود. فیلترها رو کم کن یا یه عبارت دیگه رو امتحان کن."
                    actions={[
                      { href: "/app/explore", label: "پاک کردن فیلترها" },
                      { href: "/app/free", label: "آثار تمام رایگان", variant: "ghost" },
                    ]}
                    compact
                  />
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between text-xs text-text-muted">
                <Link
                  href={buildPageHref(page - 1)}
                  className={`rounded-md border border-border px-3 py-2 ${
                    page <= 1 ? "pointer-events-none opacity-30" : "hover:border-primary"
                  }`}
                >
                  قبلی
                </Link>
                <span>
                  صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
                </span>
                <Link
                  href={buildPageHref(page + 1)}
                  className={`rounded-md border border-border px-3 py-2 ${
                    page >= totalPages ? "pointer-events-none opacity-30" : "hover:border-primary"
                  }`}
                >
                  بعدی
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}