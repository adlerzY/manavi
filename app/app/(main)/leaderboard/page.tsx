import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import { LEADERBOARD_BOARDS, LEADERBOARD_PERIODS, parseBoard, parsePeriod } from "@/lib/engagement";
import { BackButton } from "@/components/navigation/back-button";
import { PageTabs } from "@/components/ui/page-tabs";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";

interface PageProps {
  searchParams: Promise<{ board?: string; period?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { board: boardParam, period: periodParam } = await searchParams;
  const board = parseBoard(boardParam);
  const period = parsePeriod(periodParam);

  const [user, entries] = await Promise.all([getSessionUser(), getLeaderboard(board, period)]);

  const tabs = LEADERBOARD_BOARDS.map((item) => ({
    id: item.id,
    label: item.label,
    href: `/app/leaderboard?board=${item.id}&period=${period}`,
  }));

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
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

        <LeaderboardList entries={entries} currentUserId={user?.id ?? null} />

        <p className="text-xs leading-6 text-text-muted">
          رتبه‌ها بر اساس مجموع سکه‌ی حمایت دریافتی است. حمایت‌های ناشناس هم حساب می‌شوند، اما نام حامی هرگز نمایش داده نمی‌شود.
        </p>
      </div>
    </main>
  );
}