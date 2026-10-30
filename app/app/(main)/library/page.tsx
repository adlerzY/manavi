import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getAllowedAgeRatings } from "@/lib/content-filter";
import { getLibrary, type LibraryEntry } from "@/lib/library";
import { LibraryCard } from "@/components/library/library-card";
import { EmptyState, type EmptyStateAction } from "@/components/ui/empty-state";
import { TelegramOnlyNotice } from "@/components/ui/telegram-only-notice";
import type { MascotPose } from "@/components/ui/mascot";

type TabId = "reading" | "bookmarks" | "finished";

const TABS: { id: TabId; label: string }[] = [
  { id: "reading", label: "در حال مطالعه" },
  { id: "bookmarks", label: "علاقه‌مندی‌ها" },
  { id: "finished", label: "تمام‌شده" },
];

const EMPTY_CONTENT: Record<TabId, { pose: MascotPose; title: string; description: string; actions: EmptyStateAction[] }> = {
  reading: {
    pose: "reading",
    title: "هنوز چیزی رو شروع نکردی",
    description: "یه اثر پیدا کن و بخون؛ جای خوندنت اینجا ذخیره می‌شه تا هر وقت خواستی ادامه بدی.",
    actions: [
      { href: "/app/explore", label: "رفتن به جستجو" },
      { href: "/app/free", label: "آثار تمام رایگان", variant: "ghost" },
    ],
  },
  bookmarks: {
    pose: "thinking",
    title: "هنوز اثری رو بوکمارک نکردی",
    description: "توی صفحه‌ی هر اثر بوکمارکش کن تا از چپتر جدیدش باخبر بشی.",
    actions: [{ href: "/app/explore", label: "پیدا کردن اثر" }],
  },
  finished: {
    pose: "celebrate",
    title: "هنوز اثر تمام‌شده‌ای نداری",
    description: "وقتی اثر پایان‌یافته‌ای رو تا آخرین چپتر بخونی، اینجا میاد.",
    actions: [{ href: "/app/library", label: "ادامه‌ی مطالعه" }],
  },
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
    return <TelegramOnlyNotice message="برای دیدن کتابخانه، ماناوی رو از داخل تلگرام باز کن." />;
  }

  const allowedRatings = await getAllowedAgeRatings();
  const library = await getLibrary(user.id, allowedRatings);

  const tab: TabId = TABS.some((item) => item.id === tabParam) ? (tabParam as TabId) : "reading";
  const entries = library[tab];
  const empty = EMPTY_CONTENT[tab];

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
          <EmptyState pose={empty.pose} title={empty.title} description={empty.description} actions={empty.actions} />
        )}
      </div>
    </main>
  );
}