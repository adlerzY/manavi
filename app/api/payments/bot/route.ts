import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import crypto from "crypto";
import { sendWelcomeMessage, sendHelpMessage, sendFallbackMessage, sendBalanceMessage } from "@/lib/telegram-bot";
import { checkRateLimit } from "@/lib/moderation";
import { redis, isRedisConfigured } from "@/lib/redis";
import { notifyAdmin } from "@/lib/admin-alert";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

const MAX_BODY_BYTES = 64 * 1024;
const UPDATE_DEDUP_TTL_SECONDS = 10 * 60;
const CHAT_RATE_LIMIT_PER_MINUTE = 12;
const MISCONFIG_ALERT_THROTTLE_MS = 30 * 60 * 1000;

let lastMisconfigAlertAt = 0;

interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id: number };
    from?: { id: number };
  };
}

function parseCommand(text: string): { command: string | null; param?: string } {
  if (!text.startsWith("/")) return { command: null };
  const parts = text.trim().split(/\s+/);
  const command = parts[0].split("@")[0];
  return { command, param: parts.length > 1 ? parts[1] : undefined };
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    crypto.timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function alertMisconfiguration(reason: string) {
  const now = Date.now();
  if (now - lastMisconfigAlertAt < MISCONFIG_ALERT_THROTTLE_MS) return;
  lastMisconfigAlertAt = now;
  notifyAdmin("وبهوک بات تلگرام رد شد", reason, "warning").catch(() => {});
}

async function isDuplicateUpdate(updateId: number | undefined): Promise<boolean> {
  if (updateId == null || !isRedisConfigured) return false;
  try {
    const claimed = await redis.set(`tg-update:${updateId}`, "1", { ex: UPDATE_DEDUP_TTL_SECONDS, nx: true });
    return !claimed;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  if (!WEBHOOK_SECRET) {
    if (process.env.NODE_ENV === "production") {
      alertMisconfiguration(
        "TELEGRAM_WEBHOOK_SECRET تنظیم نشده — همه آپدیت‌های ورودی نادیده گرفته می‌شوند تا وقتی ست بشه."
      );
      return NextResponse.json({ ok: true, skipped: true });
    }
  } else {
    const provided = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (!timingSafeEqualStrings(provided, WEBHOOK_SECRET)) {
      alertMisconfiguration(
        "امضای وبهوک بات تلگرام نامعتبر بود — یا TELEGRAM_WEBHOOK_SECRET اشتباهه یا موقع setWebhook مقدار secret_token ست نشده."
      );
      return NextResponse.json({ ok: true, skipped: true });
    }
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: true });
  }

  if (await isDuplicateUpdate(update.update_id)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const text = update.message?.text;
  const chatId = update.message?.chat?.id;
  const fromId = update.message?.from?.id;

  if (typeof text === "string" && typeof chatId === "number") {
    const allowed = await checkRateLimit(`tg-bot-chat:${chatId}`, CHAT_RATE_LIMIT_PER_MINUTE);
    if (!allowed) {
      return NextResponse.json({ ok: true, rateLimited: true });
    }

    const { command, param } = parseCommand(text.slice(0, 200));

    if (command === "/start") {
      after(() => sendWelcomeMessage(chatId, param?.slice(0, 64)));
    } else if (command === "/help") {
      after(() => sendHelpMessage(chatId));
    } else if (command === "/balance") {
      after(() => sendBalanceMessage(chatId, fromId));
    } else if (command === null) {
      after(() => sendFallbackMessage(chatId));
    }
  }

  return NextResponse.json({ ok: true });
}