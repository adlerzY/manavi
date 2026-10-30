import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/leaderboard";
import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_PERIODS,
  LEADERBOARD_SORTS,
  parseBoard,
  parsePeriod,
  parseSort,
  type LeaderboardBoard,
  type LeaderboardPeriod,
  type LeaderboardSort,
} from "@/lib/engagement";
import { BackButton } from "@/components/navigation/back-button";
import { PageTabs } from "@/components/ui/page-tabs";
import { LeaderboardList } from "@/components/leaderboard/leaderboard-list";

interface PageProps {
  searchParams: Promise<{ board?: string; period?: string; sort?: string }>;
}

function buildHref(board: LeaderboardBoard, period: LeaderboardPeriod, sort: LeaderboardSort): string {
  return `/app/leaderboard?board=${board}&period=${period}&sort=${sort}`;
}

function pillClass(active: boolean): string {
  return `flex-shrink-0 rounded-full px-4 py-2 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-surface text-text-muted"}`;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { board: boardParam, period: periodParam, sort: sortParam } = await searchParams;
  const board = parseBoard(boardParam);
  const period = parsePeriod(periodParam);
  const sort = parseSort(sortParam);

  const [user, entries] = await Promise.all([getSessionUser(), getLeaderboard(board, period, sort)]);

  const tabs = LEADERBOARD_BOARDS.map((item) => ({
    id: item.id,
    label: item.label,
    href: buildHref(item.id, period, sort),
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
          {LEADERBOARD_SORTS.map((item) => (
            <Link
              key={item.id}
              href={buildHref(board, period, item.id)}
              replace
              scroll={false}
              className={pillClass(item.id === sort)}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {LEADERBOARD_PERIODS.map((item) => (
            <Link
              key={item.id}
              href={buildHref(board, item.id, sort)}
              replace
              scroll={false}
              className={pillClass(item.id === period)}
            >
              {item.label}
            </Link>
          ))}
        </div>

        <LeaderboardList entries={entries} currentUserId={user?.id ?? null} sort={sort} />

        <p className="text-xs leading-6 text-text-muted">
          رتبه‌ها بر اساس تعداد چپترهای منتشرشده و میزان تعامل خوانندگان با آن‌ها (مطالعه، واکنش و نظر) در بازه‌ی انتخابی محاسبه می‌شود.
        </p>
      </div>
    </main>
  );
}