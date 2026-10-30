import Link from "next/link";
import { SafeAvatar } from "@/components/ui/safe-avatar";
import type { LeaderboardEntry, LeaderboardSort } from "@/lib/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export function LeaderboardList({
  entries,
  currentUserId,
  sort,
}: {
  entries: LeaderboardEntry[];
  currentUserId: string | null;
  sort: LeaderboardSort;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
        هنوز فعالیتی در این بازه ثبت نشده است.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
      {entries.map((entry) => {
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
            <p className="min-w-0 flex-1 truncate text-sm text-text-main">{entry.name}</p>
            <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-xs">
              <span className={sort === "uploads" ? "font-medium text-primary" : "text-text-muted"}>
                {fa(entry.uploads)} چپتر
              </span>
              <span className={sort === "interactions" ? "font-medium text-primary" : "text-text-muted"}>
                {fa(entry.interactions)} تعامل
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}