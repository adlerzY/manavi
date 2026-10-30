import Link from "next/link";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import { titleLabel } from "@/lib/achievements";
import type { LeaderboardEntry } from "@/lib/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function LeaderboardList({
  entries,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
        هنوز حمایتی در این بازه ثبت نشده است.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {entries.map((entry) => {
        const title = titleLabel(entry.activeTitle);
        const mine = entry.userId === currentUserId;
        return (
          <Link
            key={entry.id}
            href={entry.href}
            className={`flex items-center gap-3 px-4 py-3 ${mine ? "bg-primary/5" : "bg-background"}`}
          >
            <span className="w-8 flex-shrink-0 text-center text-sm text-text-muted">
              {entry.rank <= 3 ? MEDALS[entry.rank - 1] : fa(entry.rank)}
            </span>
            <SafeAvatar src={entry.avatarUrl} fallbackText={entry.name.replace("@", "")} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-text-main">
                <span className="truncate">{entry.name}</span>
                {title && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-accent">{title}</span>}
              </p>
              <p className="mt-0.5 truncate text-xs text-text-muted">{fa(entry.supporters)} حامی</p>
            </div>
            <span className="flex-shrink-0 text-sm font-medium text-primary">🪙 {fa(entry.score)}</span>
          </Link>
        );
      })}
    </div>
  );
}