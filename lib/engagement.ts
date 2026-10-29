export const LEADERBOARD_TAG = "leaderboard";
export const LEADERBOARD_SIZE = 50;

export type LeaderboardBoard = "active" | "donors" | "supported";
export type LeaderboardPeriod = "week" | "month" | "all";

export const LEADERBOARD_BOARDS: { id: LeaderboardBoard; label: string }[] = [
  { id: "active", label: "فعال‌ترین‌ها" },
  { id: "donors", label: "حامیان" },
  { id: "supported", label: "حمایت‌شده‌ترین‌ها" },
];

export const LEADERBOARD_PERIODS: { id: LeaderboardPeriod; label: string; days: number | null }[] = [
  { id: "week", label: "۷ روز اخیر", days: 7 },
  { id: "month", label: "۳۰ روز اخیر", days: 30 },
  { id: "all", label: "همه‌ی زمان‌ها", days: null },
];

export const ENGAGEMENT_POINTS = {
  read: 1,
  comment: 3,
  reaction: 1,
  rating: 2,
  donationCoinsPerPoint: 10,
  minCommentLength: 15,
} as const;

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  avatarUrl: string | null;
  activeTitle: string | null;
  score: number;
  stats: Record<string, number>;
}

export function parseBoard(value?: string): LeaderboardBoard {
  return LEADERBOARD_BOARDS.some((board) => board.id === value) ? (value as LeaderboardBoard) : "active";
}

export function parsePeriod(value?: string): LeaderboardPeriod {
  return LEADERBOARD_PERIODS.some((period) => period.id === value) ? (value as LeaderboardPeriod) : "week";
}

export function engagementRules(): { label: string; points: string }[] {
  const fa = (value: number) => value.toLocaleString("fa-IR");
  return [
    { label: "خواندن هر چپتر (هر چپتر فقط یک‌بار حساب می‌شود)", points: `${fa(ENGAGEMENT_POINTS.read)} امتیاز` },
    {
      label: `نظر روی یک چپتر (حداقل ${fa(ENGAGEMENT_POINTS.minCommentLength)} حرف، یک‌بار برای هر چپتر)`,
      points: `${fa(ENGAGEMENT_POINTS.comment)} امتیاز`,
    },
    { label: "واکنش به یک چپتر", points: `${fa(ENGAGEMENT_POINTS.reaction)} امتیاز` },
    { label: "امتیازدهی به اثر یا نسخه", points: `${fa(ENGAGEMENT_POINTS.rating)} امتیاز` },
    { label: `حمایت مالی (هر ${fa(ENGAGEMENT_POINTS.donationCoinsPerPoint)} سکه)`, points: `${fa(1)} امتیاز` },
  ];
}