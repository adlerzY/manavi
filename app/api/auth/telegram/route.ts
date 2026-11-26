import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  InvalidInitDataError,
  peekTelegramUser,
  sanitizeTelegramPhotoUrl,
  validateTelegramInitData,
  type TelegramUser,
} from "@/lib/telegram";
import { SESSION_COOKIE_NAME, createSessionToken, sessionCookieOptions, verifySessionToken } from "@/lib/session";
import { checkRateLimit } from "@/lib/moderation";
import { AccountDeletedError, findOrCreateTelegramUser } from "@/lib/telegram-user";

export const dynamic = "force-dynamic";

const MAX_INIT_DATA_LENGTH = 4096;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function publicUserPayload(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    role: user.role,
    activeTitle: user.activeTitle,
  };
}

function identityOf(user: TelegramUser, startParam?: string) {
  return {
    telegramId: BigInt(user.id),
    firstName: user.first_name,
    lastName: user.last_name ?? null,
    username: user.username ?? null,
    photoUrl: sanitizeTelegramPhotoUrl(user.photo_url),
    startParam: startParam ?? null,
  };
}

export async function POST(req: NextRequest) {
  let initData: unknown;
  try {
    initData = (await req.json()).initData;
  } catch {
    return json({ error: "درخواست نامعتبر است" }, 400);
  }

  if (!initData || typeof initData !== "string" || initData.length > MAX_INIT_DATA_LENGTH) {
    return json({ error: "اطلاعات تلگرام ارسال نشده است" }, 400);
  }

  const peeked = peekTelegramUser(initData);
  if (!peeked) {
    return json({ error: "نشست تلگرام نامعتبر است — ماناوی را دوباره از داخل تلگرام باز کن" }, 401);
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;

  if (session) {
    const current = await prisma.user.findUnique({ where: { id: session.userId } });
    if (current && !current.deletedAt && current.telegramId === BigInt(peeked.id)) {
      const user = await findOrCreateTelegramUser(identityOf(peeked));
      cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(user.id), sessionCookieOptions());
      return json({ user: publicUserPayload(user), fresh: false });
    }
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!(await checkRateLimit(`auth-telegram:${ip}`, 20))) {
    return json({ error: "تعداد درخواست‌ها زیاد است، کمی صبر کن" }, 429);
  }

  let validated;
  try {
    validated = validateTelegramInitData(initData);
  } catch (err) {
    if (err instanceof InvalidInitDataError) {
      return json({ error: "نشست تلگرام منقضی شده — ماناوی را دوباره از داخل تلگرام باز کن" }, 401);
    }
    throw err;
  }

  let user: User;
  try {
    user = await findOrCreateTelegramUser(identityOf(validated.user, validated.startParam));
  } catch (err) {
    if (err instanceof AccountDeletedError) return json({ error: "این حساب حذف شده است" }, 403);
    throw err;
  }

  cookieStore.set(SESSION_COOKIE_NAME, createSessionToken(user.id), sessionCookieOptions());
  return json({ user: publicUserPayload(user), fresh: true });
}