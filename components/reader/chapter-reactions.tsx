"use client";

import { useState, useTransition } from "react";
import { toggleChapterReaction } from "@/app/actions/reactions";
import { CHAPTER_REACTION_EMOJIS } from "@/lib/gamification";

interface ReactionSummary {
  emoji: string;
  count: number;
}

interface ChapterReactionsProps {
  chapterId: string;
  initialSummary: ReactionSummary[];
  initialUserReaction: string | null;
  isAuthenticated: boolean;
}

export function ChapterReactions({
  chapterId,
  initialSummary,
  initialUserReaction,
  isAuthenticated,
}: ChapterReactionsProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [userReaction, setUserReaction] = useState(initialUserReaction);
  const [isPending, startTransition] = useTransition();

  function countFor(emoji: string): number {
    return summary.find((s) => s.emoji === emoji)?.count ?? 0;
  }

  function handleClick(emoji: string) {
    if (!isAuthenticated || isPending) return;

    startTransition(async () => {
      const result = await toggleChapterReaction(chapterId, emoji);
      if (result.success) {
        setSummary(result.summary ?? []);
        setUserReaction(result.userReaction ?? null);
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 px-4 py-6">
      {CHAPTER_REACTION_EMOJIS.map((emoji) => {
        const active = userReaction === emoji;
        const count = countFor(emoji);
        return (
          <button
            key={emoji}
            onClick={() => handleClick(emoji)}
            disabled={!isAuthenticated || isPending}
            aria-pressed={active}
            className={`flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-base transition-colors disabled:opacity-50 ${
              active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-main"
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="text-sm text-text-muted">{count.toLocaleString("fa-IR")}</span>}
          </button>
        );
      })}
    </div>
  );
}