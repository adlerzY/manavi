"use client";

import { useState } from "react";
import { Bookmark, Bell, BellOff } from "lucide-react";
import { toggleBookmark, toggleBookmarkNotify } from "@/app/actions/bookmarks";

interface BookmarkButtonProps {
  comicId: string;
  authenticated: boolean;
  initialBookmarked: boolean;
  initialNotify?: boolean;
}

export function BookmarkButton({ comicId, authenticated, initialBookmarked, initialNotify = true }: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [notify, setNotify] = useState(initialNotify);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!authenticated || pending) return;
    const previous = bookmarked;
    setBookmarked(!previous);
    setPending(true);
    setError(null);
    try {
      const result = await toggleBookmark(comicId);
      setBookmarked(result.bookmarked);
    } catch {
      setBookmarked(previous);
      setError("خطا در ثبت بوکمارک");
    } finally {
      setPending(false);
    }
  }

  async function handleNotifyToggle() {
    if (!authenticated || pending) return;
    setPending(true);
    try {
      const result = await toggleBookmarkNotify(comicId);
      setNotify(result.notify);
    } catch {
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={!authenticated || pending}
        className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
          bookmarked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-surface text-text-main"
        }`}
      >
        <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
        {bookmarked ? "بوکمارک شده" : "افزودن به بوکمارک"}
      </button>
      {bookmarked && (
        <button onClick={handleNotifyToggle} disabled={pending} className="rounded-md border border-border bg-surface p-2 text-text-main disabled:opacity-50">
          {notify ? <Bell size={16} /> : <BellOff size={16} />}
        </button>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}