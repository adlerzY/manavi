import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLeaderboard, getMyEngagement } from "@/lib/leaderboard";
import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_PERIODS,
  engagementRules,
  parseBoard,
  parsePeriod,
} from "@/lib/engagement";
import { BackButton } from "@/components/navigation/back-button";
import { PageTabs } from "@/components/ui/page-tabs";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";

interface PageProps {
  searchParams: Promise<{ board?: string; period?: string }>;
}

function fa(value: number): string {
  return value.toLocaleString("fa-IR");
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { board: boardParam, period: periodParam } = await searchParams;
  const board = parseBoard(boardParam);
  const period = parsePeriod(periodParam);
  const user = await getSessionUser();

  const [entries, mine] = await Promise.all([
    getLeaderboard(board, period),
    user && board === "active" ? getMyEngagement(user.id, period) : Promise.resolve(null),
  ]);

  const tabs = LEADERBOARD_BOARDS.map((item) => ({
    id: item.id,
    label: item.label,
    href: `/app/leaderboard?board=${item.id}&period=${period}`,
  }));

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <BackButton fallbackHref="/app/profile" variant="plain" />
          <h1 className="text-lg font-semibold text-text-main">رتبه‌بندی</h1>
        </div>

        <PageTabs tabs={tabs} active={board} />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {LEADERBOARD_PERIODS.map((item) => (
            <Link
              key={item.id}
              href={`/app/leaderboard?board=${board}&period=${item.id}`}
              replace
              scroll={false}
              className={`flex-shrink-0 rounded-full px-4 py-2 text-xs ${
                item.id === period ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {mine && (
          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm text-text-main">
              امتیاز شما در این بازه: <span className="font-semibold text-primary">{fa(mine.score)}</span>
            </p>
            <p className="text-xs leading-6 text-text-muted">
              {fa(mine.reads)} چپتر · {fa(mine.comments)} نظر · {fa(mine.reactions)} واکنش · {fa(mine.ratings)} امتیازدهی · {fa(mine.donations)} حمایت
            </p>
            {user?.leaderboardHidden && (
              <p className="text-xs text-accent">نام شما در جدول عمومی نمایش داده نمی‌شود.</p>
            )}
          </div>
        )}

        <LeaderboardList entries={entries} board={board} currentUserId={user?.id ?? null} />

        {board === "active" ? (
          <details className="rounded-md border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm text-text-main">امتیازها چطور حساب می‌شوند؟</summary>
            <div className="mt-3 space-y-2">
              {engagementRules().map((rule) => (
                <div key={rule.label} className="flex items-start justify-between gap-3 text-xs leading-6 text-text-muted">
                  <span>{rule.label}</span>
                  <span className="flex-shrink-0 text-primary">{rule.points}</span>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <p className="text-xs leading-6 text-text-muted">
            حمایت‌های ناشناس در جدول حامیان نمایش داده نمی‌شوند، اما در مجموع دریافتی‌ها حساب می‌شوند.
          </p>
        )}
      </div>
    </main>
  );
}