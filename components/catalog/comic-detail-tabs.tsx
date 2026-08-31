"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

interface ReadingCta {
  chapterId: string;
  label: string;
}

type TabId = "preview" | "episodes" | "similar";

interface ComicDetailTabsProps {
  preview: ReactNode;
  episodes: ReactNode;
  similar: ReactNode;
  episodeCount: number;
  readingCta: ReadingCta | null;
  defaultTab?: TabId;
}

const TABS: { id: TabId; label: string }[] = [
  { id: "preview", label: "پیش‌نمایش" },
  { id: "episodes", label: "قسمت‌ها" },
  { id: "similar", label: "مشابه" },
];

export function ComicDetailTabs({ preview, episodes, similar, episodeCount, readingCta, defaultTab = "preview" }: ComicDetailTabsProps) {
  const [active, setActive] = useState<TabId>(defaultTab);
  const showCta = Boolean(readingCta) && active !== "similar";

  return (
    <div className={showCta ? "pb-24" : undefined}>
      <div className="sticky top-[var(--tg-content-safe-area-top,0px)] z-10 -mx-4 flex border-b border-border bg-background/95 px-4 backdrop-blur-sm">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`relative flex-1 py-3 text-sm font-medium transition-colors ${
              active === tab.id ? "text-primary" : "text-text-muted"
            }`}
          >
            {tab.label}
            {tab.id === "episodes" && episodeCount > 0 && (
              <span className="mr-1 text-xs text-text-muted">({episodeCount.toLocaleString("fa-IR")})</span>
            )}
            {active === tab.id && <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {active === "preview" && preview}
        {active === "episodes" && episodes}
        {active === "similar" && similar}
      </div>

      {showCta && readingCta && (
        <div
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-lg"
        >
          <div className="mx-auto max-w-4xl px-4 py-3">
            <Link
              href={`/app/read/${readingCta.chapterId}`}
              className="flex w-full items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
            >
              {readingCta.label}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}