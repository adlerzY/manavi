"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import dynamic from "next/dynamic";

const FilterDrawer = dynamic(() => import("./filter-drawer").then((module) => module.FilterDrawer), { ssr: false });

interface CategoryFilterOption {
  id: string;
  name: string;
  slug: string;
}

interface GenreFilterOption {
  id: string;
  name: string;
}

interface LanguageFilterOption {
  code: string;
  label: string;
}

const STATUS_LABELS: Record<string, string> = {
  ONGOING: "در حال انتشار",
  COMPLETED: "پایان‌یافته",
  HIATUS: "متوقف‌شده",
};

const ACCESS_LABELS: Record<string, string> = {
  FREE: "دارای چپتر رایگان",
  COIN: "دارای چپتر سکه‌ای",
};

const SORT_OPTIONS = [
  { value: "newest", label: "جدیدترین" },
  { value: "popular", label: "محبوب‌ترین" },
  { value: "rating", label: "بالاترین امتیاز" },
  { value: "updated", label: "آخرین به‌روزرسانی" },
];

interface NextParams {
  q?: string;
  type?: string | null;
  genreIds?: string[];
  status?: string | null;
  access?: string | null;
  lang?: string | null;
  sort?: string;
}

interface ExploreSearchClientProps {
  categories: CategoryFilterOption[];
  genres: GenreFilterOption[];
  languages: LanguageFilterOption[];
}

export function ExploreSearchClient({ categories, genres, languages }: ExploreSearchClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [queryInput, setQueryInput] = useState(searchParams.get("q") ?? "");

  const type = searchParams.get("type");
  const genreIdsParam = searchParams.get("genres");
  const genreIds = useMemo(() => (genreIdsParam ? genreIdsParam.split(",").filter(Boolean) : []), [genreIdsParam]);
  const status = searchParams.get("status");
  const access = searchParams.get("access");
  const lang = searchParams.get("lang");
  const sort = searchParams.get("sort") ?? "newest";
  const q = searchParams.get("q") ?? "";

  const activeFilterCount = (type ? 1 : 0) + genreIds.length + (status ? 1 : 0) + (access ? 1 : 0) + (lang ? 1 : 0);

  function pushParams(next: NextParams) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    function apply(key: string, value: string | null | undefined) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    if (next.q !== undefined) apply("q", next.q.trim());
    if (next.type !== undefined) apply("type", next.type);
    if (next.genreIds !== undefined) apply("genres", next.genreIds.join(","));
    if (next.status !== undefined) apply("status", next.status);
    if (next.access !== undefined) apply("access", next.access);
    if (next.lang !== undefined) apply("lang", next.lang);
    if (next.sort !== undefined) apply("sort", next.sort);

    startTransition(() => {
      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ""}`);
    });
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    pushParams({ q: queryInput });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearchSubmit} className="flex gap-2">
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="جستجوی عنوان..."
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-main outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          جستجو
        </button>
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="فیلترها"
          className={`relative flex items-center justify-center rounded-md border px-3 py-2 ${
            activeFilterCount > 0 ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-main"
          }`}
        >
          <SlidersHorizontal size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -left-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilterCount.toLocaleString("fa-IR")}
            </span>
          )}
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => pushParams({ sort: option.value })}
            className={`flex-shrink-0 rounded-full px-4 py-2 text-xs ${
              sort === option.value ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {type && (
            <button onClick={() => pushParams({ type: null })} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
              {categories.find((c) => c.slug === type)?.name ?? type}
              <X size={12} />
            </button>
          )}
          {genreIds.map((genreId) => (
            <button
              key={genreId}
              onClick={() => pushParams({ genreIds: genreIds.filter((id) => id !== genreId) })}
              className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary"
            >
              {genres.find((g) => g.id === genreId)?.name ?? "ژانر"}
              <X size={12} />
            </button>
          ))}
          {status && (
            <button onClick={() => pushParams({ status: null })} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
              {STATUS_LABELS[status] ?? status}
              <X size={12} />
            </button>
          )}
          {access && (
            <button onClick={() => pushParams({ access: null })} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
              {ACCESS_LABELS[access] ?? access}
              <X size={12} />
            </button>
          )}
          {lang && (
            <button onClick={() => pushParams({ lang: null })} className="flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary">
              {languages.find((l) => l.code === lang)?.label ?? lang}
              <X size={12} />
            </button>
          )}
          <button
            onClick={() => pushParams({ type: null, genreIds: [], status: null, access: null, lang: null })}
            className="text-xs text-text-muted underline decoration-dotted"
          >
            پاک کردن همه
          </button>
        </div>
      )}

      {drawerOpen && (
        <FilterDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          categories={categories}
          genres={genres}
          languages={languages}
          initialType={type}
          initialGenreIds={genreIds}
          initialStatus={status}
          initialAccess={access}
          initialLanguage={lang}
          currentQuery={q}
          onApply={(next) =>
            pushParams({ type: next.type, genreIds: next.genreIds, status: next.status, access: next.access, lang: next.lang })
          }
        />
      )}
    </div>
  );
}