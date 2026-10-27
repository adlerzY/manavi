import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { getLibrary, type LibraryEntry } from "@/lib/library";
import { LibraryCard } from "@/components/library/library-card";

type TabId = "reading" | "bookmarks" | "finished";

const TABS: { id: TabId; label: string }[] = [
  { id: "reading", label: "در حال مطالعه" },
  { id: "bookmarks", label: "علاقه‌مندی‌ها" },
  { id: "finished", label: "تمام‌شده" },
];

const EMPTY_MESSAGES: Record<TabId, string> = {
  reading: "هنوز چیزی را شروع نکرده‌اید. از بخش جستجو یک اثر پیدا کنید و بخوانید.",
  bookmarks: "هنوز اثری را بوکمارک نکرده‌اید. در صفحه هر اثر می‌توانید آن را به علاقه‌مندی‌ها اضافه کنید.",
  finished: "هنوز اثر پایان‌یافته‌ای را تا آخر نخوانده‌اید.",
};

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

function entryHref(entry: LibraryEntry, tab: TabId): string {
  if (tab !== "bookmarks" && entry.chapterId) return `/app/read/${entry.chapterId}`;
  return `/app/comic/${entry.slug}`;
}

export default async function LibraryPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-text-muted">برای مشاهده کتابخانه، این صفحه را از داخل تلگرام باز کنید.</p>
      </main>
    );
  }

  const allowedRatings = await getAllowedAgeRatings();
  const library = await getLibrary(user.id, allowedRatings);

  const tab: TabId = TABS.some((item) => item.id === tabParam) ? (tabParam as TabId) : "reading";
  const entries = library[tab];

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <h1 className="text-lg font-semibold text-text-main">کتابخانه من</h1>

        <div className="flex border-b border-border">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <Link
                key={item.id}
                href={item.id === "reading" ? "/app/library" : `/app/library?tab=${item.id}`}
                className={`relative flex min-h-11 flex-1 items-center justify-center gap-1 text-sm ${
                  active ? "font-medium text-primary" : "text-text-muted"
                }`}
              >
                {item.label}
                <span className="text-xs text-text-muted">({library[item.id].length.toLocaleString("fa-IR")})</span>
                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />}
              </Link>
            );
          })}
        </div>

        {entries.length > 0 ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {entries.map((entry, index) => (
              <LibraryCard key={entry.comicId} entry={entry} href={entryHref(entry, tab)} priority={index < 6} />
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-md border border-border bg-surface p-6 text-center">
            <p className="text-sm leading-7 text-text-muted">{EMPTY_MESSAGES[tab]}</p>
            <Link
              href="/app/explore"
              className="inline-block rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
            >
              رفتن به جستجو
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}