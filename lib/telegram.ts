import "server-only";
import crypto from "crypto";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;
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

function verifySignature(initData: string): URLSearchParams {
  const params = new URLSearchParams(initData);

  const hash = params.get("hash");
  if (!hash) {
    throw new InvalidInitDataError("missing hash field");
  }
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(getBotToken()).digest();
  const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const computedBuffer = Buffer.from(computedHash, "hex");
  const valid = hashBuffer.length === computedBuffer.length && crypto.timingSafeEqual(hashBuffer, computedBuffer);

  if (!valid) {
    throw new InvalidInitDataError("hash mismatch");
  }

  return params;
}

function parseUser(params: URLSearchParams): TelegramUser {
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
  return user;
}

export function peekTelegramUser(initData: string): TelegramUser | null {
  try {
    return parseUser(verifySignature(initData));
  } catch {
    return null;
  }
}

export function validateTelegramInitData(initData: string): ValidatedInitData {
  const params = verifySignature(initData);

  const authDateRaw = params.get("auth_date");
  if (!authDateRaw) {
    throw new InvalidInitDataError("missing auth_date field");
  }
  const authDate = new Date(Number(authDateRaw) * 1000);
  const ageSeconds = (Date.now() - authDate.getTime()) / 1000;

  if (!Number.isFinite(ageSeconds) || ageSeconds > MAX_AUTH_AGE_SECONDS) {
    throw new InvalidInitDataError("auth_date is too old");
  }
  if (ageSeconds < -60) {
    throw new InvalidInitDataError("auth_date is in the future");
  }

  return {
    user: parseUser(params),
    authDate,
    queryId: params.get("query_id") ?? undefined,
    startParam: params.get("start_param") ?? undefined,
  };
}