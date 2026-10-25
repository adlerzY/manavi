const PRIOR_MEAN = 3.5;
const PRIOR_WEIGHT = 10;

export const MIN_READ_CHAPTERS_FOR_EDITION_RATING = 3;

export function averageScore(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

export function adjustedScore(total: number, count: number): number {
  return (PRIOR_MEAN * PRIOR_WEIGHT + total) / (PRIOR_WEIGHT + count);
}

export function requiredReadChapters(publishedCount: number): number {
  return Math.max(1, Math.min(MIN_READ_CHAPTERS_FOR_EDITION_RATING, publishedCount));
}