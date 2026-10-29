export type AchievementMetric = "reads" | "comments" | "reactions" | "ratings" | "donatedCoins" | "referrals" | "bookmarks";
export type AchievementTier = "bronze" | "silver" | "gold";
export type AchievementMetrics = Record<AchievementMetric, number>;

export interface AchievementDefinition {
  key: string;
  metric: AchievementMetric;
  tier: AchievementTier;
  threshold: number;
  label: string;
  description: string;
  emoji: string;
}

export interface AchievementProgress extends AchievementDefinition {
  current: number;
  earned: boolean;
  awardedAt: string | null;
}

export const TIER_RANK: Record<AchievementTier, number> = { bronze: 1, silver: 2, gold: 3 };

const TIER_EMOJI: Record<AchievementTier, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };
const TIERS: AchievementTier[] = ["bronze", "silver", "gold"];

export const METRIC_LABELS: Record<AchievementMetric, string> = {
  reads: "مطالعه",
  comments: "نظرات",
  reactions: "واکنش‌ها",
  ratings: "امتیازدهی",
  donatedCoins: "حمایت مالی",
  referrals: "دعوت دوستان",
  bookmarks: "علاقه‌مندی‌ها",
};

const DESCRIBE: Record<AchievementMetric, (count: string) => string> = {
  reads: (count) => `${count} چپتر مختلف بخوانید`,
  comments: (count) => `زیر ${count} چپتر مختلف نظر بگذارید`,
  reactions: (count) => `به ${count} چپتر واکنش بدهید`,
  ratings: (count) => `به ${count} اثر یا نسخه امتیاز بدهید`,
  donatedCoins: (count) => `در مجموع ${count} سکه حمایت مالی کنید`,
  referrals: (count) => `${count} دوست را با موفقیت دعوت کنید`,
  bookmarks: (count) => `${count} اثر را به علاقه‌مندی‌ها اضافه کنید`,
};

const SPECS: Record<AchievementMetric, [number, string][]> = {
  reads: [[10, "کتاب‌خوان"], [100, "غرق در داستان"], [500, "اسطوره‌ی مطالعه"]],
  comments: [[5, "نظردهنده"], [50, "منتقد"], [200, "صدای جامعه"]],
  reactions: [[25, "همراه"], [150, "احساساتی"], [600, "قلب جامعه"]],
  ratings: [[3, "داور تازه‌کار"], [20, "داور"], [75, "داور حرفه‌ای"]],
  donatedCoins: [[50, "حامی"], [500, "پشتیبان"], [5000, "حامی طلایی"]],
  referrals: [[1, "دعوت‌گر"], [5, "سفیر"], [20, "سفیر برتر"]],
  bookmarks: [[5, "کلکسیونر"], [30, "گنجینه‌دار"], [100, "کتابخانه‌دار"]],
};

export const ACHIEVEMENTS: AchievementDefinition[] = (Object.keys(SPECS) as AchievementMetric[]).flatMap((metric) =>
  SPECS[metric].map(([threshold, label], index) => {
    const tier = TIERS[index];
    return {
      key: `${metric}_${tier}`,
      metric,
      tier,
      threshold,
      label,
      emoji: TIER_EMOJI[tier],
      description: DESCRIBE[metric](threshold.toLocaleString("fa-IR")),
    };
  })
);

const BY_KEY = new Map(ACHIEVEMENTS.map((definition) => [definition.key, definition]));

export function achievementByKey(key: string): AchievementDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function titleLabel(key: string | null | undefined): string | null {
  const definition = key ? BY_KEY.get(key) : null;
  return definition ? `${definition.emoji} ${definition.label}` : null;
}