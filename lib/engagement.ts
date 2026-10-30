export const LEADERBOARD_TAG = "leaderboard";
export const LEADERBOARD_SIZE = 30;

export type LeaderboardBoard = "publishers" | "team";
export type LeaderboardPeriod = "week" | "month" | "all";

export const LEADERBOARD_BOARDS: { id: LeaderboardBoard; label: string }[] = [
  { id: "publishers", label: "ناشران" },
  { id: "team", label: "تیم‌ها" },
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
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  activeTitle: string | null;
  href: string;
  score: number;
  supporters: number;
}

export function parseBoard(value?: string): LeaderboardBoard {
  return LEADERBOARD_BOARDS.some((board) => board.id === value) ? (value as LeaderboardBoard) : "publishers";
}

export function parsePeriod(value?: string): LeaderboardPeriod {
  return LEADERBOARD_PERIODS.some((period) => period.id === value) ? (value as LeaderboardPeriod) : "week";
}