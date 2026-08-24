import "server-only";
import crypto from "crypto";
import { redis, isRedisConfigured } from "./redis";

const MAX_AUTH_AGE_SECONDS = 60 * 60;
const REPLAY_GUARD_PREFIX = "telegram-initdata-used";
const MAX_PHOTO_URL_LENGTH = 500;

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: Date;
  queryId?: string;
  startParam?: string;
}

export class InvalidInitDataError extends Error {
  constructor(reason: string) {
    super(`Invalid Telegram initData: ${reason}`);
    this.name = "InvalidInitDataError";
  }
}

export class ReplayedInitDataError extends InvalidInitDataError {
  constructor() {
    super("این initData قبلاً استفاده شده است (احتمال حملهٔ replay)");
    this.name = "ReplayedInitDataError";
  }
}

export function sanitizeTelegramPhotoUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.length > MAX_PHOTO_URL_LENGTH) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set");
  }
  return token;
}

interface MemoryReplayEntry {
  expiresAt: number;
}

function getMemoryReplayCache(): Map<string, MemoryReplayEntry> {
  const g = globalThis as unknown as { __telegramReplayCache?: Map<string, MemoryReplayEntry> };
  if (!g.__telegramReplayCache) {
    g.__telegramReplayCache = new Map();
  }
  return g.__telegramReplayCache;
}

function claimReplayGuardInMemory(hash: string, ttlSeconds: number): boolean {
  const cache = getMemoryReplayCache();
  const now = Date.now();

  for (const [key, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(key);
  }

  if (cache.has(hash)) return false;
  cache.set(hash, { expiresAt: now + ttlSeconds * 1000 });
  return true;
}

export async function validateTelegramInitData(initData: string): Promise<ValidatedInitData> {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) {
    throw new InvalidInitDataError("missing hash field");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(getBotToken())
    .digest();

  const computedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  const validSignature =
    hashBuffer.length === computedBuffer.length &&
    crypto.timingSafeEqual(hashBuffer, computedBuffer);

  if (!validSignature) {
    throw new InvalidInitDataError("hash mismatch — data was not signed by this bot");
  }

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new InvalidInitDataError("missing auth_date field");
  }
  const authDate = new Date(Number(authDateRaw) * 1000);
  const ageSeconds = (Date.now() - authDate.getTime()) / 1000;

  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    throw new InvalidInitDataError("auth_date is too old — possible replay");
  }
  if (ageSeconds < -60) {
    throw new InvalidInitDataError("auth_date is in the future");
  }

  const remainingTtl = Math.max(1, Math.ceil(MAX_AUTH_AGE_SECONDS - ageSeconds));

  if (isRedisConfigured) {
    try {
      const claimed = await redis.set(`${REPLAY_GUARD_PREFIX}:${hash}`, "1", {
        ex: remainingTtl,
        nx: true,
      });
      if (!claimed) {
        throw new ReplayedInitDataError();
      }
    } catch (err) {
      if (err instanceof ReplayedInitDataError) throw err;
      if (!claimReplayGuardInMemory(hash, remainingTtl)) {
        throw new ReplayedInitDataError();
      }
    }
  } else {
    if (!claimReplayGuardInMemory(hash, remainingTtl)) {
      throw new ReplayedInitDataError();
    }
  }

  const userRaw = params.get("user");
  if (!userRaw) {
    throw new InvalidInitDataError("missing user field");
  }

  let user: TelegramUser;
  try {
    user = JSON.parse(userRaw);
  } catch {
    throw new InvalidInitDataError("user field is not valid JSON");
  }

  if (!user.id) {
    throw new InvalidInitDataError("user.id missing");
  }

  return {
    user,
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
  };
}
