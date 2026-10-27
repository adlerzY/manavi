"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { getExploreResultsCount } from "@/app/actions/explore-filters";

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

interface AppliedFilters {
  type: string | null;
  genreIds: string[];
  status: string | null;
  access: string | null;
  lang: string | null;
}

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  categories: CategoryFilterOption[];
  genres: GenreFilterOption[];
  languages: LanguageFilterOption[];
  initialType: string | null;
  initialGenreIds: string[];
  initialStatus: string | null;
  initialAccess: string | null;
  initialLanguage: string | null;
  currentQuery: string;
  onApply: (next: AppliedFilters) => void;
}

const STATUS_OPTIONS: { value: "ONGOING" | "COMPLETED" | "HIATUS"; label: string }[] = [
  { value: "ONGOING", label: "در حال انتشار" },
  { value: "COMPLETED", label: "پایان‌یافته" },
  { value: "HIATUS", label: "متوقف‌شده" },
];

const ACCESS_OPTIONS: { value: "FREE" | "COIN"; label: string }[] = [
  { value: "FREE", label: "دارای چپتر رایگان" },
  { value: "COIN", label: "دارای چپتر سکه‌ای" },
];

const COUNT_DEBOUNCE_MS = 400;

function pillClass(active: boolean): string {
  return `rounded-full border px-3 py-2 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted"}`;
}

export function FilterDrawer({
  open,
  onClose,
  categories,
  genres,
  languages,
  initialType,
  initialGenreIds,
  initialStatus,
  initialAccess,
  initialLanguage,
  currentQuery,
  onApply,
}: FilterDrawerProps) {
  const [type, setType] = useState<string | null>(initialType);
  const [genreIds, setGenreIds] = useState<string[]>(initialGenreIds);
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [access, setAccess] = useState<string | null>(initialAccess);
  const [language, setLanguage] = useState<string | null>(initialLanguage);
  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setType(initialType);
    setGenreIds(initialGenreIds);
    setStatus(initialStatus);
    setAccess(initialAccess);
    setLanguage(initialLanguage);
  }, [open, initialType, initialGenreIds, initialStatus, initialAccess, initialLanguage]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoadingCount(true);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await getExploreResultsCount({
          q: currentQuery,
          categorySlug: type ?? undefined,
          genreIds,
          status: (status as "ONGOING" | "COMPLETED" | "HIATUS" | null) ?? undefined,
          access: (access as "FREE" | "COIN" | null) ?? undefined,
          language: language ?? undefined,
        });
        if (requestId === requestIdRef.current) setCount(result);
      } finally {
        if (requestId === requestIdRef.current) setLoadingCount(false);
      }
    }, COUNT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, type, genreIds, status, access, language, currentQuery]);

  function toggleGenre(genreId: string) {
    setGenreIds((prev) => (prev.includes(genreId) ? prev.filter((id) => id !== genreId) : [...prev, genreId]));
  }

  function handleReset() {
    setType(null);
    setGenreIds([]);
    setStatus(null);
    setAccess(null);
    setLanguage(null);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-border bg-surface">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-4 pt-2">
          <h2 className="text-sm font-medium text-text-main">فیلترها</h2>
          <button onClick={onClose} aria-label="بستن" className="rounded-full p-2.5 text-text-muted hover:bg-background">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-6 px-4 py-4">
          {categories.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-text-muted">نوع اثر</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setType(null)} className={pillClass(type === null)}>همه</button>
                {categories.map((category) => (
                  <button key={category.id} type="button" onClick={() => setType(category.slug)} className={pillClass(type === category.slug)}>
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border" />

          {genres.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-text-muted">ژانرها</h3>
              <div className="flex flex-wrap gap-2">
                {genres.map((genre) => (
                  <button key={genre.id} type="button" onClick={() => toggleGenre(genre.id)} className={pillClass(genreIds.includes(genre.id))}>
                    {genre.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border" />

          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-muted">وضعیت انتشار</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setStatus(null)} className={pillClass(status === null)}>همه</button>
              {STATUS_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setStatus(option.value)} className={pillClass(status === option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="space-y-2">
            <h3 className="text-xs font-medium text-text-muted">نوع دسترسی</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setAccess(null)} className={pillClass(access === null)}>همه</button>
              {ACCESS_OPTIONS.map((option) => (
                <button key={option.value} type="button" onClick={() => setAccess(option.value)} className={pillClass(access === option.value)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {languages.length > 0 && (
            <>
              <div className="border-t border-border" />
              <div className="space-y-2">
                <h3 className="text-xs font-medium text-text-muted">زبان ترجمه</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLanguage(null)} className={pillClass(language === null)}>همه</button>
                  {languages.map((option) => (
                    <button key={option.code} type="button" onClick={() => setLanguage(option.code)} className={pillClass(language === option.code)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }} className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-surface px-4 pt-3">
          <button type="button" onClick={handleReset} className="rounded-md border border-border px-4 py-2.5 text-sm text-text-muted">
            بازنشانی
          </button>

          <button
            type="button"
            onClick={() => {
              onApply({ type, genreIds, status, access, lang: language });
              onClose();
            }}
            className="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
          >
            {loadingCount ? "در حال محاسبه…" : count !== null ? `نمایش ${count.toLocaleString("fa-IR")} اثر` : "اعمال فیلتر"}
          </button>
        </div>
      </div>
    </div>
  );
}