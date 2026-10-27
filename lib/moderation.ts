import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { redis, isRedisConfigured } from "./redis";

const RATE_LIMIT_WINDOW = "60 s";
const limiterCache = new Map<number, Ratelimit>();

function getLimiter(limit: number): Ratelimit {
  let limiter = limiterCache.get(limit);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(limit, RATE_LIMIT_WINDOW),
      prefix: "ratelimit",
    });
    limiterCache.set(limit, limiter);
  }
  return limiter;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  options?: { failClosed?: boolean }
): Promise<boolean> {
  if (!isRedisConfigured) return true;

  try {
    const { success } = await getLimiter(limit).limit(key);
    return success;
  } catch {
    return !options?.failClosed;
  }
}