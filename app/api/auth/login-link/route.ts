import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { checkRateLimit } from "@/lib/moderation";
import { SESSION_COOKIE_NAME, createSessionToken, sessionCookieOptions } from "@/lib/session";
import {
  LOGIN_NONCE_PATTERN,
  LOGIN_REQUEST_TTL_MS,
  LOGIN_START_PREFIX,
  createLoginRequest,
  pollLoginRequest,
} from "@/lib/login-request";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!bot) return json({ error: "ورود با تلگرام فعلاً در دسترس نیست" }, 503);

  if (!(await checkRateLimit(`login-link:${await clientIp()}`, 8))) {
    return json({ error: "تعداد درخواست‌ها زیاد است، کمی صبر کن" }, 429);
  }

  const nonce = await createLoginRequest(req.headers.get("user-agent"));
  const param = `${LOGIN_START_PREFIX}${nonce}`;

  return json({
    nonce,
    webLink: `https://t.me/${bot}?start=${param}`,
    nativeLink: `tg://resolve?domain=${bot}&start=${param}`,
    expiresIn: Math.floor(LOGIN_REQUEST_TTL_MS / 1000),
  });
}

export async function GET(req: NextRequest) {
  const nonce = req.nextUrl.searchParams.get("nonce") ?? "";
  if (!LOGIN_NONCE_PATTERN.test(nonce)) return json({ status: "expired" });

  if (!(await checkRateLimit(`login-poll:${await clientIp()}`, 90))) {
    return json({ status: "pending" }, 429);
  }

  const result = await pollLoginRequest(nonce);
  if (result.status !== "approved") return json({ status: result.status });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionToken(result.userId), sessionCookieOptions());
  return json({ status: "approved" });
}