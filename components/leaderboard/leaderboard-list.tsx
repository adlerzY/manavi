import { SafeAvatar } from "@/components/ui/safe-avatar";
import { titleLabel } from "@/lib/achievements";
import type { LeaderboardBoard, LeaderboardEntry } from "@/lib/engagement";

const MEDALS = ["🥇", "🥈", "🥉"];

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

function caption(board: LeaderboardBoard, stats: Record<string, number>): string {
  if (board === "donors") return `${fa(stats.count ?? 0)} بار حمایت`;
  if (board === "supported") return `${fa(stats.supporters ?? 0)} حامی`;
  const parts: string[] = [];
  if (stats.reads) parts.push(`${fa(stats.reads)} چپتر`);
  if (stats.comments) parts.push(`${fa(stats.comments)} نظر`);
  if (stats.reactions) parts.push(`${fa(stats.reactions)} واکنش`);
  if (stats.ratings) parts.push(`${fa(stats.ratings)} امتیازدهی`);
  if (stats.donations) parts.push(`${fa(stats.donations)} حمایت`);
  return parts.join(" · ");
}

export function LeaderboardList({
  entries,
  board,
  currentUserId,
}: {
  entries: LeaderboardEntry[];
  board: LeaderboardBoard;
  currentUserId: string | null;
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
        const title = titleLabel(entry.activeTitle);
        const mine = entry.userId === currentUserId;
        return (
          <div
            key={entry.userId}
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
              <p className="mt-0.5 truncate text-xs text-text-muted">{caption(board, entry.stats)}</p>
            </div>
            <span className="flex-shrink-0 text-sm font-medium text-primary">
              {board === "active" ? `${fa(entry.score)} امتیاز` : `🪙 ${fa(entry.score)}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}